import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import type { BoundingBox, LocateAction, PageSnapshot, SnapshotElement } from "../src/core/locator/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEMO_DIR = path.join(ROOT, "src/tests/integration/hw3/demo-app");
const FIXTURES_DIR = path.join(ROOT, "src/tests/integration/hw3/fixtures");

export type GroundTruthTarget = {
  id: string;
  target: string;
  action: LocateAction;
  selector?: string;
  present: boolean;
  elementId: number | null;
  bbox: BoundingBox | null;
};

export type GroundTruthFile = {
  page: string;
  targets: GroundTruthTarget[];
};

type RawSpecTarget = {
  id: string;
  target: string;
  action: LocateAction;
  selector?: string;
  domId?: string;
  present: boolean;
};

const PAGE_SPECS: Array<{
  name: string;
  htmlFile: string;
  targets: RawSpecTarget[];
}> = [
  {
    name: "login",
    htmlFile: "login.html",
    targets: [
      {
        id: "login-email",
        target: "Email input field in the login form",
        action: "input",
        selector: "#email",
        domId: "email",
        present: true,
      },
      {
        id: "login-password",
        target: "Password input field",
        action: "input",
        selector: "#password",
        domId: "password",
        present: true,
      },
      {
        id: "login-toggle-password",
        target: "Show password button next to the password input",
        action: "click",
        selector: "#toggle-password",
        domId: "toggle-password",
        present: true,
      },
      {
        id: "login-remember-me",
        target: "Remember me checkbox",
        action: "click",
        selector: "#remember-me",
        domId: "remember-me",
        present: true,
      },
      {
        id: "login-forgot-password",
        target: "Forgot password? link",
        action: "click",
        selector: "#forgot-password",
        domId: "forgot-password",
        present: true,
      },
      {
        id: "login-submit",
        target: "Blue Sign in submit button",
        action: "click",
        selector: "#sign-in-btn",
        domId: "sign-in-btn",
        present: true,
      },
      {
        id: "login-nonexistent",
        target: "Delete account button in the footer",
        action: "click",
        present: false,
      },
    ],
  },
  {
    name: "tasks",
    htmlFile: "tasks.html",
    targets: [
      {
        id: "tasks-add-btn",
        target: "Green Add new task button in the top-right header",
        action: "click",
        selector: "#add-task-btn",
        domId: "add-task-btn",
        present: true,
      },
      {
        id: "tasks-search",
        target: "Search tasks input box with placeholder Filter tasks by title",
        action: "input",
        selector: "#search-tasks",
        domId: "search-tasks",
        present: true,
      },
      {
        id: "tasks-weekly-switch",
        target: "Send a weekly summary toggle switch",
        action: "click",
        selector: "#weekly-summary-switch",
        domId: "weekly-summary-switch",
        present: true,
      },
      {
        id: "tasks-delete-row-1",
        target: "Delete button in the first row next to Write unit tests for Locator",
        action: "click",
        selector: "#delete-task-1",
        domId: "delete-task-1",
        present: true,
      },
      {
        id: "tasks-delete-row-3",
        target: "Delete button in the third row next to Deploy staging preview",
        action: "click",
        selector: "#delete-task-3",
        domId: "delete-task-3",
        present: true,
      },
    ],
  },
  {
    name: "modal",
    htmlFile: "modal.html",
    targets: [
      {
        id: "modal-close",
        target: "Close dialog × button in the top-right corner of the Delete Project modal",
        action: "click",
        selector: "#modal-close-btn",
        domId: "modal-close-btn",
        present: true,
      },
      {
        id: "modal-confirm-input",
        target: "Type DELETE to confirm text input field inside the modal dialog",
        action: "input",
        selector: "#confirm-input",
        domId: "confirm-input",
        present: true,
      },
      {
        id: "modal-cancel",
        target: "Cancel button inside the Delete Project modal dialog",
        action: "click",
        selector: "#modal-cancel-btn",
        domId: "modal-cancel-btn",
        present: true,
      },
      {
        id: "modal-confirm-delete",
        target: "Red Confirm Delete button at the bottom-right of the modal dialog",
        action: "click",
        selector: "#modal-confirm-btn",
        domId: "modal-confirm-btn",
        present: true,
      },
      {
        id: "modal-covered-save",
        target: "Covered Save Changes button behind the modal backdrop",
        action: "click",
        present: false,
      },
    ],
  },
];

async function main() {
  const extraLibPath = "/home/dev/.cache/ms-playwright/libs/usr/lib/x86_64-linux-gnu";
  const ldLibraryPath = process.env.LD_LIBRARY_PATH
    ? `${extraLibPath}:${process.env.LD_LIBRARY_PATH}`
    : extraLibPath;
  const browser = await chromium.launch({
    headless: true,
    env: { ...process.env, LD_LIBRARY_PATH: ldLibraryPath },
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    for (const spec of PAGE_SPECS) {
      const htmlPath = path.join(DEMO_DIR, spec.htmlFile);
      const fileUrl = pathToFileURL(htmlPath).href;
      await page.goto(fileUrl, { waitUntil: "networkidle" });

      const outDir = path.join(FIXTURES_DIR, spec.name);
      await fs.mkdir(outDir, { recursive: true });

      const screenshotBuf = await page.screenshot({ type: "png" });
      await fs.writeFile(path.join(outDir, "screenshot.png"), screenshotBuf);

      const extracted = await page.evaluate(() => {
        const interactiveSelector =
          'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="textbox"], [role="searchbox"]';
        const nodes = Array.from(document.querySelectorAll<HTMLElement>(interactiveSelector));

        const elements: Array<{
          id: number;
          domId: string;
          role: string;
          name: string;
          text: string;
          attrs: Record<string, unknown>;
          bbox: { x: number; y: number; width: number; height: number };
          hittable: boolean;
        }> = [];

        let nextId = 1;
        for (const el of nodes) {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
            continue;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (
            rect.bottom < 0 ||
            rect.right < 0 ||
            rect.top > window.innerHeight ||
            rect.left > window.innerWidth
          ) {
            continue;
          }

          const id = nextId++;
          el.setAttribute("data-jev-id", String(id));

          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const hitEl = document.elementFromPoint(cx, cy);
          const hittable = Boolean(hitEl && (el === hitEl || el.contains(hitEl) || hitEl.contains(el)));

          let role = el.getAttribute("role") || "";
          if (!role) {
            const tag = el.tagName.toLowerCase();
            if (tag === "button") role = "button";
            else if (tag === "a") role = "link";
            else if (tag === "textarea") role = "textbox";
            else if (tag === "select") role = "combobox";
            else if (tag === "input") {
              const t = (el.getAttribute("type") || "text").toLowerCase();
              if (t === "checkbox") role = "checkbox";
              else if (t === "radio") role = "radio";
              else if (t === "search") role = "searchbox";
              else if (t === "button" || t === "submit" || t === "reset") role = "button";
              else role = "textbox";
            } else {
              role = tag;
            }
          }

          let name = (el.getAttribute("aria-label") || "").trim();
          if (!name && el.id) {
            const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (label && label.textContent) name = label.textContent.trim();
          }
          if (!name) {
            const parentLabel = el.closest("label");
            if (parentLabel && parentLabel.textContent) name = parentLabel.textContent.trim();
          }
          if (!name) {
            name = (el.innerText || el.textContent || "").trim();
          }

          const attrs: Record<string, unknown> = {};
          const typeAttr = el.getAttribute("type");
          if (typeAttr && el.tagName.toLowerCase() === "input") {
            attrs.type = typeAttr;
          }
          const placeholder = el.getAttribute("placeholder");
          if (placeholder) {
            attrs.placeholder = placeholder;
          }
          if ((el as HTMLButtonElement | HTMLInputElement).disabled) {
            attrs.disabled = true;
          }
          if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
            attrs.checked = el.checked;
          }
          const ariaChecked = el.getAttribute("aria-checked");
          if (ariaChecked !== null) {
            attrs["aria-checked"] = ariaChecked;
          }

          elements.push({
            id,
            domId: el.id || "",
            role,
            name,
            text: (el.innerText || el.textContent || "").trim(),
            attrs,
            bbox: {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            hittable,
          });
        }

        return elements;
      });

      const domIdToEl = new Map<string, (typeof extracted)[number]>();
      const snapshotElements: SnapshotElement[] = extracted.map(({ domId, ...rest }) => {
        if (domId) {
          domIdToEl.set(domId, { domId, ...rest });
        }
        return rest;
      });

      const snapshot: PageSnapshot = {
        url: `https://demo.jevwright.local/${spec.name}`,
        viewport: { width: 1280, height: 720 },
        elements: snapshotElements,
      };

      await fs.writeFile(
        path.join(outDir, "snapshot.json"),
        JSON.stringify(snapshot, null, 2) + "\n",
      );

      const groundTruthTargets: GroundTruthTarget[] = spec.targets.map((t) => {
        if (!t.present || !t.domId) {
          return {
            id: t.id,
            target: t.target,
            action: t.action,
            selector: t.selector,
            present: false,
            elementId: null,
            bbox: null,
          };
        }
        const matched = domIdToEl.get(t.domId);
        if (!matched) {
          throw new Error(`Could not find domId "${t.domId}" on page "${spec.name}"`);
        }
        return {
          id: t.id,
          target: t.target,
          action: t.action,
          selector: t.selector,
          present: true,
          elementId: matched.id,
          bbox: matched.bbox,
        };
      });

      const groundTruth: GroundTruthFile = {
        page: spec.name,
        targets: groundTruthTargets,
      };

      await fs.writeFile(
        path.join(outDir, "ground-truth.json"),
        JSON.stringify(groundTruth, null, 2) + "\n",
      );

      console.log(
        `Generated fixture "${spec.name}": ${snapshotElements.length} elements, ${groundTruthTargets.length} targets`,
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
