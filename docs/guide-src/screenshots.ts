// Takes the user guide's annotated screenshots into docs/guide-src/public/screenshots/. It drives a running local
// workspace (docs/deploy/backend-local.md with `pnpm frontend` and the Demo App on port 8080) like a new user: it
// registers, opens the Quick Start files and runs them, so every picture shows a real state. Before each picture it
// draws numbered markers, arrows and boxes over the page from the controls' bounding boxes, so they line up exactly.
// Run it by hand with `pnpm docs:screenshots`; it never runs in tests or CI. The Jev file needs OPENROUTER_API_KEY.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type Locator, type Page } from "playwright";

const APP_URL = process.env.GUIDE_APP_URL ?? "http://localhost:3000";
const OUT_DIR = new URL("./public/screenshots/", import.meta.url);
const VIEWPORT = { width: 1440, height: 900 };
const SIDEBAR_WIDTH = 320;
// The email shows in the sidebar; set GUIDE_EMAIL when the local database already has this account.
const EMAIL = process.env.GUIDE_EMAIL ?? "you@example.com";
const PASSWORD = "guide-password-123";
const RUN_TIMEOUT_MS = 180_000;
// One annotation color: orange-700, apart from the app's blue accent and its green and red statuses; white text on it
// passes 4.5:1.
const MARK = "#c2410c";
const WEBP_QUALITY = 0.9;

// Where the numbered marker sits: outside the box on one side with an arrow to it, or inside a large box at a
// fraction of its width and height.
type Side = "left" | "right" | "top" | "bottom" | { inside: [number, number] };
type Mark = { target: Locator; n: number; side: Side };
type Rect = { x: number; y: number; width: number; height: number };

/** The box around every element the locator matches, so one mark can frame several rows. */
async function rectOf(locator: Locator): Promise<Rect> {
  await locator.first().waitFor();
  const boxes = await Promise.all((await locator.all()).map((element) => element.boundingBox()));
  const visible = boxes.filter((box): box is Rect => box !== null);
  if (visible.length === 0) throw new Error(`Not visible: ${locator}`);
  const x = Math.min(...visible.map((box) => box.x));
  const y = Math.min(...visible.map((box) => box.y));
  const right = Math.max(...visible.map((box) => box.x + box.width));
  const bottom = Math.max(...visible.map((box) => box.y + box.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** Draws every mark over the page in one fixed SVG layer, with the id "guide-annotations". */
async function annotate(page: Page, marks: Mark[]): Promise<void> {
  const shapes = await Promise.all(marks.map(async ({ target, n, side }) => ({ n, side, box: await rectOf(target) })));
  await page.evaluate(
    ({ shapes, color }) => {
      const PAD = 3;
      const GAP = 46; // from the box's edge to the marker's center
      const R = 13;
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.id = "guide-annotations";
      svg.setAttribute("width", String(window.innerWidth));
      svg.setAttribute("height", String(window.innerHeight));
      svg.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:visible";
      svg.innerHTML = `<defs><marker id="guide-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5"
        markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${color}"/></marker></defs>`;
      const add = (tag: string, attributes: Record<string, string | number>) => {
        const element = document.createElementNS(ns, tag);
        for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
        svg.appendChild(element);
        return element;
      };
      for (const { box, n, side } of shapes) {
        const x = box.x - PAD;
        const y = box.y - PAD;
        const w = box.width + 2 * PAD;
        const h = box.height + 2 * PAD;
        // A white halo under the colored outline keeps it visible on any surface.
        add("rect", { x, y, width: w, height: h, rx: 6, fill: "none", stroke: "#fff", "stroke-width": 6 });
        add("rect", { x, y, width: w, height: h, rx: 6, fill: `${color}14`, stroke: color, "stroke-width": 3 });
        let cx: number;
        let cy: number;
        if (typeof side === "object") {
          [cx, cy] = [x + w * side.inside[0], y + h * side.inside[1]];
        } else {
          cx = { left: x - GAP, right: x + w + GAP, top: x + w / 2, bottom: x + w / 2 }[side];
          cy = { left: y + h / 2, right: y + h / 2, top: y - GAP, bottom: y + h + GAP }[side];
          // The arrow runs from the marker's edge to just short of the box's edge.
          const [ex, ey] = { left: [x, cy], right: [x + w, cy], top: [cx, y], bottom: [cx, y + h] }[side];
          const length = Math.hypot(ex - cx, ey - cy);
          const [ux, uy] = [(ex - cx) / length, (ey - cy) / length];
          const line = { x1: cx + ux * (R + 2), y1: cy + uy * (R + 2), x2: ex - ux * 4, y2: ey - uy * 4 };
          add("line", { ...line, stroke: "#fff", "stroke-width": 6, "stroke-linecap": "round" });
          add("line", { ...line, stroke: color, "stroke-width": 3, "marker-end": "url(#guide-head)" });
        }
        add("circle", { cx, cy, r: R + 2, fill: "#fff" });
        add("circle", { cx, cy, r: R, fill: color });
        const label = add("text", {
          x: cx,
          y: cy + 5,
          "text-anchor": "middle",
          fill: "#fff",
          "font-family": "system-ui, sans-serif",
          "font-size": 15,
          "font-weight": 700,
        });
        label.textContent = String(n);
      }
      document.body.appendChild(svg);
    },
    { shapes, color: MARK },
  );
}

/** Annotates, screenshots the clip (or the viewport), saves it as WebP, and removes the annotations. */
async function shoot(page: Page, name: string, marks: Mark[], clip?: Rect): Promise<void> {
  await annotate(page, marks);
  const png = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
  await page.evaluate(() => document.getElementById("guide-annotations")?.remove());
  const webp = await toWebp(page.context().browser()!, png);
  writeFileSync(new URL(`${name}.webp`, OUT_DIR), webp);
  console.log(`${name}.webp  ${Math.round(webp.length / 1024)} KB`);
}

// Chromium encodes WebP through a canvas, so no image package is needed.
async function toWebp(browser: Browser, png: Buffer): Promise<Buffer> {
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(
    async ({ source, quality }) => {
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d")!.drawImage(image, 0, 0);
      return canvas.toDataURL("image/webp", quality);
    },
    { source: `data:image/png;base64,${png.toString("base64")}`, quality: WEBP_QUALITY },
  );
  await page.close();
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

/** The clip from `left` to the viewport's right edge, between `top` and `bottom`. */
function rightOf(left: number, top = 0, bottom = VIEWPORT.height): Rect {
  return { x: left, y: top, width: VIEWPORT.width - left, height: bottom - top };
}

/** Waits until every image on the page has loaded, such as the step screenshots of a report. */
async function imagesLoaded(page: Page): Promise<void> {
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
}

const sidebarOf = (page: Page) => page.getByRole("navigation", { name: "Projects", exact: true });
const outputOf = (page: Page) => page.getByRole("region", { name: "Output", exact: true });
const debugOf = (page: Page) => page.getByRole("region", { name: "Debug", exact: true });
const fileStateOf = (page: Page) => page.getByRole("status", { name: "File state", exact: true });
const runButtonOf = (page: Page) => page.getByRole("button", { name: "Run", exact: true });
const progressOf = (page: Page) =>
  outputOf(page).getByRole("list", { name: "Progress", exact: true }).getByRole("listitem");
// The Output console's status badge, at the start of the line with the counts and Open run details.
const runBadgeOf = (page: Page) => outputOf(page).locator('[aria-live="polite"] > div > :first-child').first();
const fileLinkOf = (page: Page, name: string) => sidebarOf(page).getByRole("link", { name, exact: true });

async function openFile(page: Page, name: string): Promise<void> {
  await fileLinkOf(page, name).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
}

async function runToEnd(page: Page): Promise<void> {
  await runButtonOf(page).click();
  await fileStateOf(page)
    .getByText(/^(Passed|Failed)$/)
    .waitFor({ timeout: RUN_TIMEOUT_MS });
}

async function openDetails(page: Page): Promise<Locator> {
  await outputOf(page).getByRole("button", { name: "Open run details", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByText(/^Status: (Passed|Failed)$/).waitFor();
  await imagesLoaded(page);
  return sheet;
}

async function closeDetails(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}

/**
 * Holds back the Live Progress of the next Run once its step `index` (0-based) is running, so a picture can show the
 * Run mid-way; `release()` delivers the held messages.
 */
async function holdLiveProgress(page: Page, index: number): Promise<{ held: Promise<void>; release: () => void }> {
  let holding = false;
  let release = () => {};
  const queue: (string | Buffer)[] = [];
  let reached = () => {};
  const held = new Promise<void>((resolve) => (reached = resolve));
  await page.routeWebSocket(/\/live/, (ws) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (holding) return void queue.push(message);
      ws.send(message);
      const parsed = JSON.parse(String(message)) as { type?: string; step?: { index?: number; status?: string } };
      if (parsed.type === "step" && parsed.step?.index === index && parsed.step.status === "running") {
        holding = true;
        reached();
      }
    });
    release = () => {
      holding = false;
      for (const message of queue.splice(0)) ws.send(message);
    };
  });
  return { held, release: () => release() };
}

async function register(page: Page): Promise<void> {
  await page.goto(`${APP_URL}/register`);
  const form = page.locator("form");
  const submit = form.getByRole("button", { name: "Register", exact: true });
  await submit.waitFor();
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  const heading = await rectOf(page.getByRole("heading", { name: "Register", exact: true }));
  const card = await rectOf(form);
  const top = heading.y - 40;
  await shoot(
    page,
    "register",
    [
      { target: page.getByRole("button", { name: "Register", exact: true }).first(), n: 1, side: "right" },
      { target: page.getByLabel("Email"), n: 2, side: "left" },
      { target: page.getByLabel("Password"), n: 3, side: "left" },
      { target: submit, n: 4, side: "left" },
    ],
    { x: card.x - 120, y: top, width: card.width + 240, height: card.y + card.height + 40 - top },
  );
  await submit.click();
  await page.waitForURL("**/files");
  await fileLinkOf(page, "sign-in-and-see-products.yaml").waitFor();
}

async function quickStartProject(page: Page): Promise<void> {
  const sidebar = sidebarOf(page);
  await shoot(
    page,
    "quick-start-project",
    [
      { target: sidebar.getByRole("link", { name: "Variables for Quick Start", exact: true }), n: 1, side: "right" },
      { target: sidebar.getByRole("button", { name: "1 Passing tests", exact: true }), n: 2, side: "right" },
      { target: fileLinkOf(page, "sign-in-and-see-products.yaml"), n: 3, side: "right" },
    ],
    { x: 0, y: 0, width: 720, height: 640 },
  );
}

async function passingRun(page: Page): Promise<void> {
  await openFile(page, "sign-in-and-see-products.yaml");
  await runToEnd(page);
  await shoot(
    page,
    "run-passed",
    [
      { target: runButtonOf(page), n: 1, side: "bottom" },
      { target: progressOf(page), n: 2, side: "left" },
      { target: outputOf(page).getByRole("button", { name: "Open run details", exact: true }), n: 3, side: "left" },
    ],
    rightOf(SIDEBAR_WIDTH),
  );
}

async function workspaceLayout(page: Page): Promise<void> {
  await shoot(page, "workspace-layout", [
    { target: sidebarOf(page), n: 1, side: { inside: [0.5, 0.78] } },
    { target: page.locator(".cm-editor"), n: 2, side: { inside: [0.5, 0.82] } },
    { target: debugOf(page), n: 3, side: { inside: [0.5, 0.55] } },
    { target: outputOf(page), n: 4, side: { inside: [0.5, 0.92] } },
    { target: page.getByRole("region", { name: "Runs", exact: true }), n: 5, side: "left" },
    { target: page.getByRole("region", { name: "Status bar", exact: true }), n: 6, side: "top" },
  ]);

  const name = await rectOf(page.getByRole("heading", { name: "sign-in-and-see-products.yaml", exact: true }));
  await shoot(
    page,
    "editor-header",
    [
      { target: fileStateOf(page), n: 1, side: "right" },
      { target: page.getByRole("button", { name: "Save", exact: true }), n: 2, side: "bottom" },
      { target: runButtonOf(page), n: 3, side: "bottom" },
      { target: page.getByRole("button", { name: "Toggle consoles", exact: true }).first(), n: 4, side: "bottom" },
    ],
    rightOf(name.x - 12, 0, 110),
  );
}

async function report(page: Page): Promise<void> {
  const sheet = await openDetails(page);
  const steps = sheet.getByRole("list", { name: "Steps", exact: true }).getByRole("listitem");
  await shoot(page, "report", [
    { target: sheet.getByText(/^Status: /), n: 1, side: "left" },
    { target: sheet.getByRole("link", { name: "Open full page", exact: true }), n: 2, side: "right" },
    { target: sheet.getByRole("link", { name: "Download report", exact: true }), n: 3, side: "left" },
    { target: steps.first().getByRole("button", { name: /screenshot full size/ }), n: 4, side: "right" },
    { target: steps.nth(1).getByText("selector", { exact: true }), n: 5, side: "right" },
  ]);
  await closeDetails(page);
}

async function failingRun(page: Page): Promise<void> {
  await openFile(page, "wrong-total-fails-at-the-total.yaml");
  await runToEnd(page);
  // The Debug console is collapsed for this picture, so the Output console has room for all twelve steps and History.
  const debugToggle = page.getByRole("button", { name: "Debug console", exact: true });
  await debugToggle.click();
  const runs = page.getByRole("region", { name: "Runs", exact: true });
  const column = await rectOf(outputOf(page));
  const history = await rectOf(runs);
  const statusBar = await rectOf(page.getByRole("region", { name: "Status bar", exact: true }));
  await shoot(
    page,
    "run-failed",
    [
      { target: runBadgeOf(page), n: 1, side: "left" },
      { target: progressOf(page).filter({ hasText: "Failed" }), n: 2, side: "left" },
      { target: progressOf(page).filter({ hasText: "Pending" }), n: 3, side: "left" },
      { target: runs.getByRole("listitem").first(), n: 4, side: "left" },
    ],
    rightOf(column.x - 70, column.y, Math.min(history.y + history.height + 16, statusBar.y)),
  );
  await debugToggle.click();
}

async function diagnostics(page: Page): Promise<void> {
  await openFile(page, "seven-errors-at-once.yaml");
  const problems = debugOf(page).getByRole("listitem");
  await problems.first().waitFor();
  await shoot(
    page,
    "diagnostics",
    [
      { target: page.locator(".cm-lintRange-error").first(), n: 1, side: "right" },
      { target: problems.first(), n: 2, side: "top" },
    ],
    rightOf(SIDEBAR_WIDTH, 0, 460),
  );
}

async function jevRun(page: Page): Promise<void> {
  await openFile(page, "find-and-check-with-jev.yaml");
  // Step 2 is the first Jev step; the picture shows the Run while it runs.
  const live = await holdLiveProgress(page, 1);
  await runButtonOf(page).click();
  await live.held;
  await progressOf(page).nth(1).getByText("Running", { exact: true }).waitFor();
  const column = await rectOf(outputOf(page));
  const history = await rectOf(page.getByRole("region", { name: "Runs", exact: true }));
  await shoot(
    page,
    "run-live",
    [
      { target: runBadgeOf(page), n: 1, side: "left" },
      { target: progressOf(page).filter({ hasText: "Passed" }), n: 2, side: "left" },
      { target: progressOf(page).filter({ hasText: "Running" }), n: 3, side: "left" },
      { target: progressOf(page).filter({ hasText: "Pending" }), n: 4, side: "left" },
    ],
    rightOf(column.x - 70, column.y, history.y + history.height + 16),
  );
  live.release();
  await fileStateOf(page)
    .getByText(/^(Passed|Failed)$/)
    .waitFor({ timeout: RUN_TIMEOUT_MS });

  const sheet = await openDetails(page);
  const methods = sheet.getByRole("list", { name: "Steps", exact: true }).getByText(/^(visual|dom)$/);
  // Step 2 at the top of the sheet, so steps 2 and 3 are both in view.
  await methods.first().evaluate((badge) => badge.closest("li")?.scrollIntoView({ block: "start" }));
  await shoot(page, "report-jev", [
    { target: methods.nth(0), n: 1, side: "right" },
    { target: methods.nth(1), n: 2, side: "right" },
  ]);
  await closeDetails(page);
}

async function sidebarMenu(page: Page): Promise<void> {
  const sidebar = sidebarOf(page);
  await sidebar.getByRole("button", { name: "New in 4 Jev - find and check by description", exact: true }).click();
  const menu = page.getByRole("menu");
  await menu.waitFor();
  await shoot(
    page,
    "sidebar",
    [
      { target: sidebar.getByRole("button", { name: "New project", exact: true }), n: 1, side: "right" },
      { target: menu, n: 2, side: "right" },
      { target: fileLinkOf(page, "sign-in-and-see-products.yaml"), n: 3, side: "right" },
      { target: fileLinkOf(page, "wrong-total-fails-at-the-total.yaml"), n: 4, side: "right" },
    ],
    { x: 0, y: 0, width: 720, height: 640 },
  );
  await page.keyboard.press("Escape");
}

async function variables(page: Page): Promise<void> {
  await sidebarOf(page).getByRole("link", { name: "Variables for Quick Start", exact: true }).click();
  const list = page.getByRole("list", { name: "Variables", exact: true });
  await list.getByRole("listitem").first().waitFor();
  const region = await rectOf(page.getByRole("region", { name: "Variables", exact: true }));
  await shoot(
    page,
    "variables",
    [
      { target: list.getByRole("listitem").first(), n: 1, side: "right" },
      { target: page.getByRole("button", { name: "Show value of BASE", exact: true }), n: 2, side: "top" },
      { target: page.getByLabel("Name", { exact: true }), n: 3, side: { inside: [0.92, 0.5] } },
      { target: page.getByLabel("Value", { exact: true }), n: 4, side: { inside: [0.92, 0.5] } },
      { target: page.getByRole("button", { name: "Save", exact: true }), n: 5, side: "right" },
    ],
    {
      x: SIDEBAR_WIDTH,
      y: 0,
      width: region.x + region.width + 80 - SIDEBAR_WIDTH,
      height: region.y + region.height + 30,
    },
  );
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: "light" });
// next-themes keeps the theme switch's choice under "theme".
await context.addInitScript(() => window.localStorage.setItem("theme", "light"));
// tsx names inner functions with a __name helper, which the functions sent to page.evaluate need in the page too.
await context.addInitScript("globalThis.__name = (fn) => fn");
const page = await context.newPage();
try {
  await register(page);
  await quickStartProject(page);
  await passingRun(page);
  await workspaceLayout(page);
  await report(page);
  await failingRun(page);
  await diagnostics(page);
  await jevRun(page);
  await sidebarMenu(page);
  await variables(page);
} finally {
  await browser.close();
}
