import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import type { BoundingBox, LocateAction, PageSnapshot, SnapshotElement } from "../../../core/locator/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.join(__dirname, "pages");
const FIXTURES_DIR = path.join(__dirname, "fixtures");

export type GroundTruthTarget = {
  id: string;
  target: string;
  action: LocateAction;
  present: boolean;
  elementId: number | null;
  bbox: BoundingBox | null;
  domId?: string;
  selector?: string;
};

type PageTargetSpec = {
  id: string;
  target: string;
  action: LocateAction;
  present: boolean;
  domId: string | null;
  usable?: boolean;
  selector?: string;
};

const PAGE_SPECS: Record<string, PageTargetSpec[]> = {
  login: [
    {
      id: "login-email",
      target: "Email input field with placeholder you@example.com",
      action: "input",
      present: true,
      domId: "email",
      selector: "#email",
    },
    {
      id: "login-password",
      target: "Password input field",
      action: "input",
      present: true,
      domId: "password",
      selector: "#password",
    },
    {
      id: "login-show-password",
      target: "Show password button next to the password input",
      action: "click",
      present: true,
      domId: "show-password",
      selector: "#show-password",
    },
    {
      id: "login-remember",
      target: "Remember me checkbox",
      action: "click",
      present: true,
      domId: "remember",
      selector: "#remember",
    },
    {
      id: "login-weekly-switch",
      target: "Send a weekly summary toggle switch",
      action: "click",
      present: true,
      domId: "weekly-switch",
      selector: "#weekly-switch",
    },
    {
      id: "login-submit",
      target: "Blue Sign in submit button",
      action: "click",
      present: true,
      domId: "sign-in",
      selector: "#sign-in",
    },
    {
      id: "login-forgot-link",
      target: "Forgot password? link at the bottom of the card",
      action: "click",
      present: true,
      domId: "forgot-link",
      selector: "#forgot-link",
    },
    {
      id: "login-disabled-sso",
      target: "Disabled Sign in with SSO button",
      action: "click",
      present: true,
      domId: "sso-btn",
      usable: false,
    },
    {
      id: "login-non-interactive-alert",
      target: "Scheduled maintenance tonight alert banner",
      action: "click",
      present: true,
      domId: null,
      usable: false,
    },
    {
      id: "login-missing-delete-account",
      target: "Delete account permanently button",
      action: "click",
      present: false,
      domId: null,
      usable: false,
    },
  ],
  tasks: [
    {
      id: "tasks-add-new",
      target: "Green + New Task button in the top right header",
      action: "click",
      present: true,
      domId: "add-task",
      selector: "#add-task",
    },
    {
      id: "tasks-search",
      target: "Search tasks input box with placeholder Filter tasks by keyword",
      action: "input",
      present: true,
      domId: "search-tasks",
      selector: "#search-tasks",
    },
    {
      id: "tasks-filter-active",
      target: "Active Only filter button",
      action: "click",
      present: true,
      domId: "filter-active",
      selector: "#filter-active",
    },
    {
      id: "tasks-delete-row-1",
      target: "Delete task button on the first row for Fix login redirect bug",
      action: "click",
      present: true,
      domId: "delete-row-1",
      selector: "#delete-row-1",
    },
    {
      id: "tasks-delete-row-2",
      target: "Delete task button on the second row for Write API documentation",
      action: "click",
      present: true,
      domId: "delete-row-2",
      selector: "#delete-row-2",
    },
    {
      id: "tasks-archive-release",
      target: "Archive Release button inside the Release v2.0 card",
      action: "click",
      present: true,
      domId: "archive-release",
      selector: "#archive-release",
    },
    {
      id: "tasks-missing-export",
      target: "Export tasks to CSV button",
      action: "click",
      present: false,
      domId: null,
      usable: false,
    },
  ],
  modal: [
    {
      id: "modal-close",
      target: "Close dialog × button in the top right of the Delete Workspace modal",
      action: "click",
      present: true,
      domId: "modal-close",
      selector: "#modal-close",
    },
    {
      id: "modal-reason-input",
      target: "Deletion reason text input inside the modal dialog",
      action: "input",
      present: true,
      domId: "delete-reason",
      selector: "#delete-reason",
    },
    {
      id: "modal-cancel",
      target: "Cancel button in the modal dialog",
      action: "click",
      present: true,
      domId: "modal-cancel",
      selector: "#modal-cancel",
    },
    {
      id: "modal-confirm-delete",
      target: "Red Confirm Delete button in the modal dialog",
      action: "click",
      present: true,
      domId: "modal-confirm",
      selector: "#modal-confirm",
    },
    {
      id: "modal-covered-bg-save",
      target: "Covered Save Changes button behind the modal backdrop",
      action: "click",
      present: true,
      domId: "bg-save-btn",
      usable: false,
    },
    {
      id: "modal-missing-billing",
      target: "Upgrade billing plan button",
      action: "click",
      present: false,
      domId: null,
      usable: false,
    },
  ],
};

function findChromiumExecutable(): string | undefined {
  const cacheDir = path.join(process.env.HOME ?? "/home/dev", ".cache", "ms-playwright");
  if (!fs.existsSync(cacheDir)) {
    return undefined;
  }
  const headlessEntries = fs
    .readdirSync(cacheDir)
    .filter((e) => e.startsWith("chromium_headless_shell-"))
    .sort()
    .reverse();
  for (const entry of headlessEntries) {
    const candidate = path.join(cacheDir, entry, "chrome-headless-shell-linux64", "chrome-headless-shell");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const entries = fs.readdirSync(cacheDir).filter((e) => e.startsWith("chromium-")).sort().reverse();
  for (const entry of entries) {
    const candidates = [
      path.join(cacheDir, entry, "chrome-linux64", "chrome"),
      path.join(cacheDir, entry, "chrome-linux", "chrome"),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const executablePath = findChromiumExecutable();
  const extraLibDir = path.join(
    process.env.HOME ?? "/home/dev",
    ".cache",
    "ms-playwright",
    "libs",
    "usr",
    "lib",
    "x86_64-linux-gnu",
  );
  const ldLibraryPath = fs.existsSync(extraLibDir)
    ? [extraLibDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":")
    : process.env.LD_LIBRARY_PATH;

  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    env: {
      ...process.env,
      ...(ldLibraryPath ? { LD_LIBRARY_PATH: ldLibraryPath } : {}),
    } as Record<string, string>,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    for (const [pageName, specs] of Object.entries(PAGE_SPECS)) {
      const htmlPath = path.join(PAGES_DIR, `${pageName}.html`);
      const outDir = path.join(FIXTURES_DIR, pageName);
      fs.mkdirSync(outDir, { recursive: true });

      await page.goto(`file://${htmlPath}`, { waitUntil: "load" });

      const extracted = await page.evaluate(`(() => {
        const selector = [
          "a[href]",
          "button",
          "input",
          "select",
          "textarea",
          '[role="button"]',
          '[role="switch"]',
          '[role="checkbox"]',
          '[role="textbox"]',
          '[role="searchbox"]',
          '[role="link"]',
        ].join(",");

        const nodes = Array.from(document.querySelectorAll(selector));
        const elements = [];
        let nextId = 1;

        function inferRole(el) {
          const explicit = el.getAttribute("role");
          if (explicit) return explicit;
          const tag = el.tagName.toLowerCase();
          if (tag === "button") return "button";
          if (tag === "a") return "link";
          if (tag === "textarea") return "textbox";
          if (tag === "select") return "combobox";
          if (tag === "input") {
            const type = (el.getAttribute("type") ?? "text").toLowerCase();
            if (type === "checkbox") return "checkbox";
            if (type === "radio") return "radio";
            if (type === "search") return "searchbox";
            if (type === "button" || type === "submit" || type === "reset") return "button";
            return "textbox";
          }
          return tag;
        }

        function inferName(el) {
          const ariaLabel = el.getAttribute("aria-label");
          if (ariaLabel) return ariaLabel.trim();
          const id = el.getAttribute("id");
          if (id) {
            const labelEl = document.querySelector('label[for="' + CSS.escape(id) + '"]');
            if (labelEl && labelEl.textContent) return labelEl.textContent.trim();
          }
          const parentLabel = el.closest("label");
          if (parentLabel && parentLabel.textContent) return parentLabel.textContent.trim();
          return (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
        }

        for (const el of nodes) {
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
            continue;
          }
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            continue;
          }
          if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) {
            continue;
          }

          const id = nextId++;
          el.setAttribute("data-jev-id", String(id));

          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const topEl = document.elementFromPoint(cx, cy);
          const hittable = Boolean(topEl && (el === topEl || el.contains(topEl) || topEl.contains(el)));

          const attrs = {};
          const typeAttr = el.getAttribute("type");
          if (typeAttr && el.tagName.toLowerCase() === "input" && typeAttr !== "checkbox" && typeAttr !== "radio") {
            attrs.type = typeAttr;
          }
          const placeholderAttr = el.getAttribute("placeholder");
          if (placeholderAttr) {
            attrs.placeholder = placeholderAttr;
          }
          if (el instanceof HTMLInputElement && el.type === "checkbox") {
            attrs.checked = String(el.checked);
          }
          const ariaChecked = el.getAttribute("aria-checked");
          if (ariaChecked !== null) {
            attrs["aria-checked"] = ariaChecked;
          }
          if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") {
            attrs.disabled = "true";
          }

          const rawText =
            el instanceof HTMLInputElement
              ? el.type === "checkbox" || el.type === "radio"
                ? ""
                : el.value || ""
              : (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();

          elements.push({
            id,
            domId: el.id || "",
            tag: el.tagName.toLowerCase(),
            role: inferRole(el),
            name: inferName(el),
            text: rawText,
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

        const texts = Array.from(document.querySelectorAll("h1, h2, p, .alert-banner, .task-title"))
          .map((n) => (n.innerText || n.textContent || "").trim())
          .filter(Boolean);

        const nonInteractiveBboxes = {};
        const alertEl = document.getElementById("maintenance-alert");
        if (alertEl) {
          const r = alertEl.getBoundingClientRect();
          nonInteractiveBboxes["maintenance-alert"] = {
            x: Math.round(r.left),
            y: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
          };
        }

        return {
          url: window.location.href,
          title: document.title,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          elements,
          texts,
          nonInteractiveBboxes,
        };
      })()`) as {
        url: string;
        title: string;
        viewport: { width: number; height: number };
        elements: Array<SnapshotElement & { domId: string }>;
        texts: string[];
        nonInteractiveBboxes: Record<string, BoundingBox>;
      };

      const screenshotBuffer = await page.screenshot({ type: "png" });
      fs.writeFileSync(path.join(outDir, "screenshot.png"), screenshotBuffer);

      const snapshot: PageSnapshot = {
        url: `https://demo.jevwright.local/${pageName}`,
        title: extracted.title,
        viewport: extracted.viewport,
        elements: extracted.elements.map(({ domId: _domId, ...rest }) => rest),
        texts: extracted.texts,
      };
      fs.writeFileSync(path.join(outDir, "snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);

      const targets: GroundTruthTarget[] = specs.map((spec) => {
        const matched = spec.domId
          ? extracted.elements.find((e) => e.domId === spec.domId)
          : undefined;
        const isUsable = spec.usable !== false;

        let bbox: BoundingBox | null = null;
        if (matched) {
          bbox = matched.bbox;
        } else if (spec.id === "login-non-interactive-alert") {
          bbox = extracted.nonInteractiveBboxes["maintenance-alert"] ?? null;
        }

        return {
          id: spec.id,
          target: spec.target,
          action: spec.action,
          present: spec.present,
          elementId: matched && isUsable ? matched.id : null,
          bbox,
          ...(spec.domId ? { domId: spec.domId } : {}),
          ...(spec.selector ? { selector: spec.selector } : {}),
        };
      });

      fs.writeFileSync(path.join(outDir, "targets.json"), `${JSON.stringify(targets, null, 2)}\n`);
      console.log(`Generated fixtures for "${pageName}": ${snapshot.elements.length} elements, ${targets.length} targets.`);
    }

    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
