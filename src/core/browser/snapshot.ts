import type { Page } from "playwright";
import { INTERACTIVE_SELECTOR, VIEWPORT } from "./constants.js";
import type { PageSnapshot, SnapshotElement } from "./types.js";

/** Builds the Page Snapshot of `page`, marking each element with data-jev-id. */
export async function takeSnapshot(page: Page): Promise<PageSnapshot> {
  const elements = await page.evaluate(collect, INTERACTIVE_SELECTOR);
  return { url: page.url(), title: await page.title(), viewport: VIEWPORT, elements };
}

// Runs inside the page, so it must not use anything from this module's scope.
function collect(interactive: string): SnapshotElement[] {
  const round = (r: DOMRect) => ({
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
  });
  const inViewport = (r: DOMRect) =>
    r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  const isButtonInput = (el: HTMLElement) =>
    el instanceof HTMLInputElement && ["submit", "button", "reset"].includes(el.type);
  const role = (el: HTMLElement) => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "summary") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox" || el.type === "radio") return el.type;
      if (el.type === "search") return "searchbox";
      if (isButtonInput(el)) return "button";
      return "textbox";
    }
    return tag;
  };
  // A submit or button input shows its value as its label.
  const visibleText = (el: HTMLElement) => (isButtonInput(el) ? (el as HTMLInputElement).value : el.innerText);
  const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
  const name = (el: HTMLElement) => {
    const labelledBy = el.getAttribute("aria-labelledby");
    const labels = "labels" in el ? (el.labels as NodeListOf<HTMLLabelElement> | null) : null;
    return (
      clean(el.getAttribute("aria-label")) ||
      clean(labelledBy?.split(/\s+/).map((id) => document.getElementById(id)?.textContent).join(" ")) ||
      clean([...(labels ?? [])].map((label) => label.textContent).join(" ")) ||
      clean(visibleText(el)) ||
      clean(el.getAttribute("title")) ||
      clean(el.getAttribute("placeholder"))
    );
  };
  const attrs = (el: HTMLElement) => {
    const out: Record<string, string | boolean> = {};
    for (const key of ["type", "placeholder", "href", "aria-checked", "aria-selected", "aria-current", "aria-invalid"]) {
      const value = el.getAttribute(key);
      if (value !== null) out[key] = value;
    }
    const isToggle = el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio");
    // Toggles report `checked`; their value ("on") and a button input's label are not state.
    if (isToggle) out.checked = el.checked;
    else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      if (el.value && !isButtonInput(el)) out.value = el.value;
    }
    if ((el as HTMLButtonElement).disabled) out.disabled = true;
    return out;
  };
  const hittable = (el: HTMLElement, r: DOMRect) => {
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    // A click on a <label> reaches its control, so a label on top still counts.
    return !!hit && (el === hit || el.contains(hit) || (hit instanceof HTMLLabelElement && hit.control === el));
  };
  // Ids from an earlier snapshot would make `[data-jev-id]` match two elements.
  for (const el of document.querySelectorAll("[data-jev-id]")) el.removeAttribute("data-jev-id");
  const kept = [...document.querySelectorAll<HTMLElement>(interactive)].filter(
    (el) =>
      inViewport(el.getBoundingClientRect()) && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
  );
  return kept.map((el, id) => {
    const rect = el.getBoundingClientRect();
    el.setAttribute("data-jev-id", String(id));
    const label = name(el);
    const text = clean(visibleText(el));
    return {
      id,
      tag: el.tagName.toLowerCase(),
      role: role(el),
      name: label,
      ...(text && text !== label ? { text } : {}),
      attrs: attrs(el),
      bbox: round(rect),
      hittable: hittable(el, rect),
    };
  });
}
