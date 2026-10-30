// One-off: render each demo-app page in Chromium and save the files the
// fixture Browser Driver serves: screenshot.png, elements.json, page.html,
// and ground-truth.json. Re-run with `pnpm fixtures:capture` after changing
// demo-app/ or the targets below.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "demo-app");
const outDir = join(root, "test", "fixtures");
const viewport = { width: 1280, height: 800 };

interface TargetSpec {
  target: string;
  // Playwright selector for the element the target should resolve to.
  expect: string;
  // Optional CSS selector the step author wrote; may be stale or ambiguous.
  selector?: string;
}

const pages: Record<string, TargetSpec[]> = {
  login: [
    { target: "the email address field", expect: "#email", selector: "#email" },
    { target: "the password input", expect: "#password" },
    { target: "the 'Keep me signed in' checkbox", expect: "#remember" },
    { target: "the Sign in button", expect: "button[type=submit]", selector: "#login-btn" },
    { target: "the 'Forgot your password?' link", expect: "a[href='#forgot']" },
    { target: "the GitHub sign-in button", expect: "button[name=sso-github]" },
    { target: "the Create account link in the header", expect: "a[href='#signup']" },
  ],
  list: [
    { target: "the settings gear icon in the header", expect: "[aria-label=Settings]" },
    { target: "the Remove button for Bob Martinez", expect: "tr[data-user=bob] button.danger" },
    { target: "the Edit button in Carol Okafor's row", expect: "tr[data-user=carol] button:not(.danger)" },
    { target: "the member search box", expect: "input[name=q]", selector: "input[name='q']" },
    { target: "the Invite member button", expect: "text=Invite member" },
    { target: "the Next page button", expect: "text=Next" },
    {
      target: "the Remove button for Dan Weiss",
      expect: "tr[data-user=dan] button.danger",
      selector: "tr[data-user=dan] button.danger",
    },
  ],
  modal: [
    { target: "the Delete button in the confirmation dialog", expect: "dialog button[value=confirm]", selector: "button.danger" },
    { target: "the Cancel button", expect: "dialog button[value=cancel]" },
    { target: "the button that closes the dialog", expect: "[aria-label='Close dialog']" },
    { target: "the text box for typing the project name to confirm", expect: "#confirm-input" },
  ],
};

// Runs in the page. Kept self-contained because Playwright serializes it.
function collectInteractiveElements() {
  const clean = (s: string | null | undefined, max = 80) =>
    (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  const candidates = document.querySelectorAll<HTMLElement>(
    "a[href], button, input, select, textarea, summary, [role=button], [role=link], [role=checkbox], [tabindex]:not([tabindex='-1'])",
  );
  const implicitRole: Record<string, string> = { a: "link", button: "button", select: "combobox", textarea: "textbox", summary: "button" };
  const inputRole: Record<string, string> = { checkbox: "checkbox", radio: "radio", submit: "button", button: "button" };
  const attrNames = ["id", "name", "type", "placeholder", "aria-label", "title", "href", "value", "disabled"];
  const out = [];
  let n = 0;
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden") continue;
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type") ?? "";
    const role = el.getAttribute("role") ?? (tag === "input" ? inputRole[type] ?? "textbox" : implicitRole[tag] ?? null);
    const labels = (el as HTMLInputElement).labels;
    const name = clean(
      el.getAttribute("aria-label") ||
        (labels && labels[0]?.innerText) ||
        el.getAttribute("placeholder") ||
        el.innerText ||
        el.getAttribute("title") ||
        (el as HTMLInputElement).value,
    );
    const attributes: Record<string, string> = {};
    for (const a of attrNames) {
      const v = el.getAttribute(a);
      if (v !== null) attributes[a] = v;
    }
    const container = el.closest("tr, li, dialog, form, fieldset, header, nav, section, .card");
    const heading = container?.querySelector("h1, h2, h3");
    const context = container
      ? `${container.tagName.toLowerCase()}: ${clean(heading?.textContent || (container as HTMLElement).innerText)}`
      : "";
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const id = `e${n++}`;
    el.setAttribute("data-jev-id", id);
    out.push({
      id,
      tag,
      role,
      name,
      text: clean(el.innerText),
      attributes,
      context,
      bbox: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      obscured: !(hit && (hit === el || el.contains(hit))),
    });
  }
  return out;
}

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  // tsx compiles with keepNames, which wraps functions in __name(); the
  // function serialized into the page needs that helper to exist there.
  await context.addInitScript("globalThis.__name = (fn) => fn;");
  for (const [name, targets] of Object.entries(pages)) {
    const page = await context.newPage();
    await page.goto(pathToFileURL(join(appDir, `${name}.html`)).href);
    const dir = join(outDir, name);
    await mkdir(dir, { recursive: true });
    // Screenshot first: collecting elements tags the DOM with data-jev-id.
    await page.screenshot({ path: join(dir, "screenshot.png") });
    const elements = await page.evaluate(collectInteractiveElements);
    const groundTruth = [];
    for (const spec of targets) {
      const matches = page.locator(spec.expect);
      if ((await matches.count()) !== 1) throw new Error(`${name}: "${spec.expect}" must match exactly one element`);
      const id = await matches.getAttribute("data-jev-id");
      if (!id) throw new Error(`${name}: "${spec.expect}" is not an interactive element`);
      groundTruth.push({ target: spec.target, ...(spec.selector ? { selector: spec.selector } : {}), expected: id });
    }
    await writeFile(join(dir, "elements.json"), JSON.stringify({ viewport, elements }, null, 2) + "\n");
    await writeFile(join(dir, "page.html"), await page.content());
    await writeFile(join(dir, "ground-truth.json"), JSON.stringify(groundTruth, null, 2) + "\n");
    console.log(`${name}: ${elements.length} elements, ${groundTruth.length} targets`);
    await page.close();
  }
} finally {
  await browser.close();
}
