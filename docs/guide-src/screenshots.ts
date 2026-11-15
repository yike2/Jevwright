// Takes the user guide's annotated screenshots into docs/guide-src/public/screenshots/. It drives the web workspace
// like a new user: it registers a throwaway account, opens the Quick Start files and runs three of them, so every
// picture shows a real state. Each picture gets numbered markers, arrows and outlines drawn from the controls' bounding
// boxes, so they line up exactly; a margin around the picture can hold the markers so they cover nothing.
// Run it by hand with `pnpm docs:screenshots`; it never runs in tests or CI. GUIDE_APP_URL picks the workspace, by
// default the public one, whose Quick Start project tests the public Demo App.
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type Locator, type Page } from "playwright";

const APP_URL = process.env.GUIDE_APP_URL ?? "https://app.94.72.126.118.sslip.io";
const OUT_DIR = new URL("./public/screenshots/", import.meta.url);
const VIEWPORT = { width: 1440, height: 900 };
const SCALE = 2;
const SIDEBAR_WIDTH = 320;
// A fresh throwaway account each time; the email shows in the sidebar, the password is never shown or kept.
const EMAIL = `guide-${Date.now()}@example.com`;
const PASSWORD = randomBytes(18).toString("base64url");
const RUN_TIMEOUT_MS = 180_000;
// One annotation color: orange-700, apart from the app's blue accent and its green and red statuses; white text on it
// passes 4.5:1.
const MARK = "#c2410c";
const WEBP_QUALITY = 0.9;
// Room for markers outside the picture.
const MARGIN = 64;

// Where the numbered marker sits: outside the box on one side with an arrow to it, or inside a large box at a
// fraction of its width and height.
type Side = "left" | "right" | "top" | "bottom" | { inside: [number, number] };
type Mark = { target: Locator; n: number; side: Side };
type Rect = { x: number; y: number; width: number; height: number };
type Margin = { top: number; right: number; bottom: number; left: number };
type Frame = { clip?: Rect; margin?: Partial<Margin> };
type Drawing = { shapes: { n: number; side: Side; box: Rect }[]; clip: Rect; margin: Margin; background: string };

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

/** Screenshots the clip (or the viewport), draws the marks on it and its margin, and saves it as WebP. */
async function shoot(page: Page, name: string, marks: Mark[], frame: Frame = {}): Promise<void> {
  const shapes = await Promise.all(marks.map(async ({ target, n, side }) => ({ n, side, box: await rectOf(target) })));
  const clip = frame.clip ?? { x: 0, y: 0, ...VIEWPORT };
  const margin: Margin = { top: 0, right: 0, bottom: 0, left: 0, ...frame.margin };
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const png = await page.screenshot({ clip, animations: "disabled", caret: "hide" });
  const webp = await draw(page.context().browser()!, png, { shapes, clip, margin, background });
  writeFileSync(new URL(`${name}.webp`, OUT_DIR), webp);
  console.log(`${name}.webp  ${Math.round(webp.length / 1024)} KB`);
}

// Chromium draws the marks and encodes the WebP on a canvas, so no image package is needed.
async function draw(browser: Browser, png: Buffer, drawing: Drawing): Promise<Buffer> {
  const page = await browser.newPage();
  // tsx names inner functions with a __name helper, which the function below needs in the page too.
  await page.evaluate("globalThis.__name = (fn) => fn");
  const dataUrl = await page.evaluate(
    async ({ source, drawing: { shapes, clip, margin, background }, color, scale, quality }) => {
      const PAD = 3;
      const GAP = 46; // from the box's edge to the marker's center
      const R = 13;
      const image = new Image();
      image.src = source;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = (clip.width + margin.left + margin.right) * scale;
      canvas.height = (clip.height + margin.top + margin.bottom) * scale;
      const context = canvas.getContext("2d")!;
      context.scale(scale, scale);
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, margin.left, margin.top, clip.width, clip.height);
      // From here on, coordinates are the page's.
      context.translate(margin.left - clip.x, margin.top - clip.y);
      context.lineCap = "round";
      const stroke = (path: () => void, width: number, style: string) => {
        path();
        context.lineWidth = width;
        context.strokeStyle = style;
        context.stroke();
      };
      const disc = (cx: number, cy: number, r: number, style: string) => {
        context.beginPath();
        context.arc(cx, cy, r, 0, 2 * Math.PI);
        context.fillStyle = style;
        context.fill();
      };
      for (const { box, n, side } of shapes) {
        const x = box.x - PAD;
        const y = box.y - PAD;
        const w = box.width + 2 * PAD;
        const h = box.height + 2 * PAD;
        const outline = () => {
          context.beginPath();
          context.roundRect(x, y, w, h, 6);
        };
        // A white halo under the colored outline keeps it visible on any surface.
        stroke(outline, 6, "#fff");
        stroke(outline, 3, color);
        let cx: number;
        let cy: number;
        if (typeof side === "object") {
          [cx, cy] = [x + w * side.inside[0], y + h * side.inside[1]];
        } else {
          cx = { left: x - GAP, right: x + w + GAP, top: x + w / 2, bottom: x + w / 2 }[side];
          cy = { left: y + h / 2, right: y + h / 2, top: y - GAP, bottom: y + h + GAP }[side];
          // The arrow runs from the marker's edge to just short of the box's edge, and ends in a filled head.
          const [ex, ey] = { left: [x, cy], right: [x + w, cy], top: [cx, y], bottom: [cx, y + h] }[side];
          const length = Math.hypot(ex - cx, ey - cy);
          const [ux, uy] = [(ex - cx) / length, (ey - cy) / length];
          const [tipX, tipY] = [ex - ux * 3, ey - uy * 3];
          const shaft = () => {
            context.beginPath();
            context.moveTo(cx + ux * (R + 2), cy + uy * (R + 2));
            context.lineTo(tipX - ux * 6, tipY - uy * 6);
          };
          stroke(shaft, 6, "#fff");
          stroke(shaft, 3, color);
          context.beginPath();
          context.moveTo(tipX, tipY);
          context.lineTo(tipX - ux * 10 - uy * 6, tipY - uy * 10 + ux * 6);
          context.lineTo(tipX - ux * 10 + uy * 6, tipY - uy * 10 - ux * 6);
          context.closePath();
          context.fillStyle = color;
          context.fill();
        }
        disc(cx, cy, R + 2, "#fff");
        disc(cx, cy, R, color);
        context.fillStyle = "#fff";
        context.font = "700 15px system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(String(n), cx, cy + 1);
      }
      return canvas.toDataURL("image/webp", quality);
    },
    {
      source: `data:image/png;base64,${png.toString("base64")}`,
      drawing,
      color: MARK,
      scale: SCALE,
      quality: WEBP_QUALITY,
    },
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
    { clip: { x: card.x - 120, y: top, width: card.width + 240, height: card.y + card.height + 40 - top } },
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
    { clip: { x: 0, y: 0, width: 720, height: 640 } },
  );
}

async function passingRun(page: Page): Promise<void> {
  await openFile(page, "sign-in-and-see-products.yaml");
  await runToEnd(page);
  await shoot(
    page,
    "run-passed",
    [
      { target: runButtonOf(page), n: 1, side: "top" },
      { target: progressOf(page), n: 2, side: "left" },
      { target: outputOf(page).getByRole("button", { name: "Open run details", exact: true }), n: 3, side: "left" },
    ],
    { clip: rightOf(SIDEBAR_WIDTH), margin: { top: MARGIN } },
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

  const heading = page.getByRole("heading", { name: "sign-in-and-see-products.yaml", exact: true });
  const name = await rectOf(heading);
  const header = await rectOf(page.locator("header").filter({ has: heading }));
  await shoot(
    page,
    "editor-header",
    [
      { target: fileStateOf(page), n: 1, side: "right" },
      { target: page.getByRole("button", { name: "Save", exact: true }), n: 2, side: "bottom" },
      { target: runButtonOf(page), n: 3, side: "bottom" },
      { target: page.getByRole("button", { name: "Toggle consoles", exact: true }).first(), n: 4, side: "bottom" },
    ],
    { clip: rightOf(name.x - 12, 0, header.y + header.height), margin: { bottom: MARGIN } },
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
    {
      clip: rightOf(column.x, column.y, Math.min(history.y + history.height + 16, statusBar.y)),
      margin: { left: MARGIN },
    },
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
    { clip: rightOf(SIDEBAR_WIDTH, 0, 460) },
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
    { clip: rightOf(column.x, column.y, history.y + history.height + 16), margin: { left: MARGIN } },
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
    { clip: { x: 0, y: 0, width: 720, height: 640 } },
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
      clip: {
        x: SIDEBAR_WIDTH,
        y: 0,
        width: region.x + region.width + 80 - SIDEBAR_WIDTH,
        height: region.y + region.height + 30,
      },
    },
  );
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: "light" });
// next-themes keeps the theme switch's choice under "theme".
await context.addInitScript(() => window.localStorage.setItem("theme", "light"));
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
