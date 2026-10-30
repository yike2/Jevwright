# Element Locator

The Element Locator decides which page element a step refers to. It reads the page through the Browser Driver (selector check, screenshot, element snapshot), asks the Jev Harness when AI is needed, and returns the chosen element's id. It does not import Playwright, never performs the action itself, and never modifies the test file.

## 1. Functional Definition

### 1.1 Scope

The Locator is used only by the element interaction actions defined in the Syntax Analyzer doc (1.2): `click`, `doubleClick`, `rightClick`, `hover`, and `input`. It reads the step's `selector` and `target` fields, which the Syntax Analyzer has already validated (at least one is present).

Page-level actions (`open`, `back`, `press`, ...), `waitFor`, and `assert` do not go through the Locator. The Step Executor calls it once per element step, right before the action, because the page changes after every action.

### 1.2 Locating Strategy

There are three stages, always tried in this order:

| Stage         | Method name | Input                                   | Succeeds when |
| ------------- | ----------- | --------------------------------------- | ------------- |
| Selector      | `selector`  | `selector`                              | The Browser Driver finds a visible element for `selector` within the stage timeout |
| Visual Locate | `visual`    | `target` + screenshot + snapshot        | Jev returns a bounding box with confidence ≥ threshold, and the box center falls on a snapshot element |
| DOM Locate    | `dom`       | `target` + snapshot                     | Jev chooses a candidate with confidence ≥ threshold |

Which stages run depends on the fields present, matching the Syntax Analyzer doc (1.1):

| Fields                | Stages run | Selector stage timeout |
| --------------------- | ---------- | ---------------------- |
| `selector` only       | Selector. On failure the step fails; Jev is never called | `timeoutMs` |
| `target` only         | Visual → DOM | – |
| `selector` + `target` | Selector → Visual → DOM | `SELECTOR_PROBE_MS` (2000 ms) |

A later stage runs only if the previous one failed. The first stage that succeeds ends the process.

### 1.3 Page Data from the Browser Driver

The Locator reads the page only through the `BrowserDriver` interface (see 3.3), implemented by the Browser Driver (`src/core/browser/`). It asks for data only when a stage needs it:

| Stage    | Browser Driver calls |
| -------- | -------------------- |
| Selector | `isVisible(selector, timeoutMs)`. If several elements match, the first one is used; this is not an error |
| Visual   | `screenshot()`; then `snapshot()` once Jev has returned a box |
| DOM      | `snapshot()`, reusing the one from Visual Locate if it was already taken |

So a selector hit costs no screenshot, and a Visual Locate that fails at Jev costs no snapshot. No action runs between the screenshot and the snapshot, so both describe the same page state.

The snapshot uses the same format as the integration fixtures (`src/tests/integration/hw3/README.md`): every visible interactive element inside the viewport, in DOM order, marked in the page with `data-jev-id`. The Locator reads these fields of each element:

| Field      | Use |
| ---------- | --- |
| `id`       | The value returned to the Step Executor |
| `role`, `name`, `text`, `attrs` | DOM Locate description lines; `role` and `attrs.disabled` also decide editability |
| `bbox`     | Matching the Visual Locate box center |
| `hittable` | Elements covered by something else (e.g. a modal backdrop) are skipped |

All coordinates are CSS pixels relative to the viewport, so screenshot pixels and `bbox` values share one coordinate system. The snapshot's `texts` list is not used by the Locator.

### 1.4 Visual Locate

1. Take a screenshot through the Browser Driver.
2. Ask Jev for a bounding box on the screenshot (see 3.2) with the question:
   `Find the element described as: "<target>". Return its bounding box.`
3. The stage fails if Jev returns no box or a confidence below `CONFIDENCE_THRESHOLD`.
4. Take the snapshot, compute the box center, and find the snapshot elements whose `bbox` contains it, keeping only usable elements (see 1.5, step 1).
5. If several elements contain the point (e.g. a button inside a clickable card), choose the one with the smallest area.
6. The stage fails if no element contains the point. Otherwise it returns that element's `id`.

Matching the box to an element is pure geometry on the snapshot. Targets that are not interactive, such as an alert message or a canvas chart, are not in the snapshot and cannot be returned, which is fine because they are never the target of an interaction step.

### 1.5 DOM Locate

1. Build the candidate list from the snapshot elements that are usable for the action:
   - `hittable` is `true` and `attrs.disabled` is not set;
   - for the `input` action, only editable elements: `role` is `textbox` or `searchbox`.
2. Keep at most `MAX_DOM_CANDIDATES` (50) candidates, in snapshot order.
3. Build one description line per candidate from `role`, `name`, `text`, and the `type`, `placeholder`, `checked`, and `aria-checked` attributes, truncating text to `MAX_TEXT_LENGTH` (50) characters and omitting empty fields:
   ```text
   textbox "Email" type=email placeholder="you@example.com"
   button "Show password"
   checkbox "Remember me" checked=false
   switch "Send a weekly summary" aria-checked=false
   ```
4. The stage fails if there are no candidates.
5. Ask Jev to choose one line (see 3.2) with the question:
   `Which element best matches the description: "<target>"?`
6. The stage fails if Jev returns no choice, an index out of range, or a confidence below `CONFIDENCE_THRESHOLD`. Otherwise it returns the chosen candidate's `id`.

Known limitation: identical elements, such as six "Delete task" buttons in different table rows, produce identical lines, so DOM Locate cannot tell them apart. Visual Locate usually can, because it sees the row around the button. Adding nearby text to each line is left as a later accuracy improvement (PRD 4.3.9).

### 1.6 Constants

| Constant               | Value  | Description |
| ---------------------- | ------ | ----------- |
| `SELECTOR_PROBE_MS`    | `2000` | Selector stage timeout when `target` is also present |
| `CONFIDENCE_THRESHOLD` | `0.7`  | Minimum Jev confidence for Visual and DOM Locate |
| `MAX_DOM_CANDIDATES`   | `50`   | Maximum candidates sent to Jev |
| `MAX_TEXT_LENGTH`      | `50`   | Maximum characters of text per candidate line |

All constants live in `constants.ts`. The `data-jev-id` marking belongs to the Browser Driver.

### 1.7 Failure

If every stage that ran has failed, `locate()` throws a `LocateError` containing one attempt record per stage, for example:

```text
Could not locate "Sign in button":
  selector "#login" — not visible within 2000 ms
  visual — confidence 0.42 below 0.7
  dom — Jev chose no candidate
```

The Locator does not retry. Retrying a failed Jev request is handled inside the Jev Harness. If the Browser Driver itself fails (for example the browser crashed), the error is not caught and propagates as an infrastructure failure. Taking the failure screenshot and marking the step as `failed` are handled by the execution pipeline.

## 2. Internal Flow

Where the Locator sits in one element step:

```mermaid
flowchart LR
  S[Step Executor] -->|LocateRequest| L[Locator]
  L <-->|isVisible / screenshot / snapshot| B[Browser Driver]
  L <-->|bbox / choice| J[Jev Harness]
  L -->|LocateResult| S
```

Inside the Locator:

```mermaid
flowchart TD
  A[LocateRequest] --> B{selector?}
  B -->|yes| C[Selector stage]
  C -->|visible| R[LocateResult]
  C -->|not visible| D{target?}
  B -->|no| D
  D -->|no| X[LocateError]
  D -->|yes| E[Visual Locate]
  E -->|found| R
  E -->|failed| F[DOM Locate]
  F -->|found| R
  F -->|failed| X
```

1. If `selector` is present, run the Selector stage.
2. If not yet found and there is no `target`, throw `LocateError`.
3. Run Visual Locate, then DOM Locate if needed.
4. Record every attempt (method, success, duration, confidence, reason).
5. Return a `LocateResult` for the first success, or throw `LocateError`.

## 3. External Interface

### 3.1 Function

```ts
function locate(request: LocateRequest, driver: BrowserDriver, jev: JevClient): Promise<LocateResult>;

type LocateRequest = {
  action: "click" | "doubleClick" | "rightClick" | "hover" | "input";
  selector?: string; // from Step
  target?: string; // from Step
  timeoutMs: number; // TestCase.timeoutMs
};

type LocateMethod = "selector" | "visual" | "dom";

type LocateAttempt = {
  method: LocateMethod;
  ok: boolean;
  durationMs: number;
  confidence?: number; // Visual and DOM only
  reason?: string; // present when ok is false
};

type LocateResult = {
  method: LocateMethod; // the stage that succeeded
  elementId?: number; // snapshot element id; present for visual and dom
  confidence?: number; // Visual and DOM only
  durationMs: number; // total time of all attempts
  attempts: LocateAttempt[];
};

class LocateError extends Error {
  attempts: LocateAttempt[];
}
```

In the run sequence diagram this call is `locate(page, step)`, where `page` stands for the Browser Driver, and the returned "element position" is `elementId`.

The Step Executor turns the result into a Playwright locator:

```ts
const result = await locate(
  { action: step.action, selector: step.selector, target: step.target, timeoutMs: testCase.timeoutMs },
  driver,
  jev,
);
const locator =
  result.method === "selector"
    ? page.locator(step.selector!).first()
    : page.locator(`[data-jev-id="${result.elementId}"]`);
await locator.fill(step.value);
```

`method`, `confidence`, and `durationMs` are passed on to the report, e.g. the CLI line `click "Sign In button" [visual, conf=0.92] (1420ms)`.

### 3.2 Jev Harness Interface

`JevClient` is implemented by the [Jev Harness](jev-harness.md), which calls the real Jev model (`typesafe/jev-1.14`) through OpenRouter's Decisions API.

```ts
type BoundingBox = { x: number; y: number; width: number; height: number }; // pixels of the image

interface JevClient {
  // Visual Locate: CSS pixels of the screenshot, same as snapshot bbox; null if not found.
  bbox(question: string, image: Buffer): Promise<{ box: BoundingBox | null; confidence: number }>;

  // DOM Locate: choose one option; index is into options, null if none fits.
  choice(question: string, options: string[]): Promise<{ index: number | null; confidence: number }>;
}
```

Assumptions:

- Box coordinates are in pixels of the image sent. If Jev returns 0–1 normalized coordinates, the Harness converts them before returning.
- The Harness handles retries. If Jev still fails, it throws, and the Locator records that stage as failed with the error message.
- `jev` is passed in as a parameter, so tests can use a fake `JevClient`.

### 3.3 Browser Driver Interface (Assumed)

> **Assumed interface.** `BrowserDriver` is implemented by the Browser Driver (`src/core/browser/`). The Locator depends only on the methods below; they will be aligned with the Browser Driver doc once it exists.

```ts
interface BrowserDriver {
  // Waits until the first element matching selector is visible.
  // Returns false on timeout or when Playwright rejects the selector string.
  isVisible(selector: string, timeoutMs: number): Promise<boolean>;

  // PNG of the current viewport at CSS scale (one image pixel = one CSS pixel).
  screenshot(): Promise<Buffer>;

  // Visible interactive elements in the viewport, marked with data-jev-id; mirrors snapshot.json (see 1.3).
  snapshot(): Promise<PageSnapshot>;
}
```

`PageSnapshot` is defined by the Browser Driver. `driver` is passed in as a parameter, so tests can use a fake driver that serves fixture files instead of a real browser.

## 4. Class Architecture

### 4.1 Modules

```mermaid
flowchart LR
  locate[locate.ts] --> selector[selector.ts]
  locate --> visual[visual.ts]
  locate --> dom[dom.ts]
```

| Module         | Responsibility |
| -------------- | -------------- |
| `locate.ts`    | Entry point `locate()`: decides which stages run, records attempts, returns `LocateResult` or throws `LocateError` |
| `selector.ts`  | Selector stage (1.2): `driver.isVisible()` with the right timeout |
| `visual.ts`    | Visual Locate (1.4): screenshot, Jev `bbox`, box center, element at point |
| `dom.ts`       | DOM Locate (1.5): usable candidates, description lines, Jev `choice` |
| `constants.ts` | Constants in 1.6 |

None of these modules imports Playwright. To add a new stage, add a module and call it from `locate.ts` in the desired order.

### 4.2 Directory Layout

```text
src/core/locator/
├── index.ts       # exports locate, LocateError and types
├── types.ts       # LocateRequest, LocateResult, LocateAttempt, JevClient, BrowserDriver
├── constants.ts
├── locate.ts
├── selector.ts
├── visual.ts
└── dom.ts
```

## 5. Test Plan

All tests use Vitest and never launch a browser. Tests pass a fake `BrowserDriver` (serving fixture files and counting calls) and a fake `JevClient` (returning scripted answers); the product always uses the real ones.

| Type        | Coverage | Location |
| ----------- | -------- | -------- |
| Unit        | Description lines (truncation, omitted fields, `aria-checked`); element at point (inside, smallest area, `hittable: false` skipped, editable filter for `input`) | `src/tests/unit/core/locator/dom.test.ts`, `visual.test.ts` |
| Unit        | `locate()` flow: `selector` only never calls Jev; a selector hit takes no screenshot; probe timeout is `SELECTOR_PROBE_MS` when `target` is present, `timeoutMs` otherwise; order Visual → DOM; snapshot is reused between stages; `LocateError` lists every attempt | `src/tests/unit/core/locator/locate.test.ts` |
| Integration | For every target in the hw3 fixtures: a fake Jev returning the ground-truth `bbox` makes Visual Locate return the expected `elementId`; a fake Jev choosing the ground-truth element does the same for DOM Locate; targets with `present: false` or `elementId: null` end in `LocateError` | `src/tests/integration/locator/fixtures.test.ts`, reading `src/tests/integration/hw3/fixtures/` |
| Manual      | The same fixtures with the real Jev through OpenRouter, to measure accuracy; not run in CI | Benchmark Test Suite |
