# Locator integration fixtures

Real page data captured with Playwright from **Tasklane**, a static demo app built for HW3. The Locator integration tests read these files with a fake BrowserAdapter and a fake Jev client instead of launching a browser. The `statements` in `expected.json` are kept for the Asserter integration tests.

## Layout

```text
src/tests/integration/core/locator/fixtures/<scenario>/
├── screenshot.png   # 1280×800 viewport, the Visual Locate input
├── snapshot.json    # interactive elements, the PageSnapshot served by the fake adapter
└── expected.json    # ground truth
```

The demo app, `scenarios.ts`, and `capture.ts` that produced these files are not on `main`. They are on the `origin/hw3` branch under `src/tests/integration/hw3/`.

## Scenarios

| Scenario | What it covers |
| --- | --- |
| `login-empty` | Plain form fields, an icon-only button, a target that does not exist |
| `login-error` | An error alert, invalid fields shown only by a red border |
| `board-default` | Six identical "Delete task" buttons and "Mark as done" checkboxes, icon-only top bar |
| `board-new-task-dialog` | Modal dialog; elements behind it are `hittable: false` |
| `board-delete-confirm` | A confirm dialog whose title names the row |
| `board-search-empty` | Empty state; a row target that disappeared |
| `board-done-tab` | Selected tab state, filtered rows |
| `settings-default` | Switches named by `aria-labelledby`, a disabled field, a canvas chart only Visual Locate can see |
| `settings-saved` | A success message after an action |

## Formats

`snapshot.json` has the `PageSnapshot` shape from `src/core/browser/types.ts`:

```jsonc
{
  "url": "/board.html",
  "title": "Website redesign · Tasklane",
  "viewport": { "width": 1280, "height": 800 },
  "elements": [
    // visible interactive elements inside the viewport, in DOM order
    { "id": 21, "tag": "button", "role": "button", "name": "Delete task",
      "attrs": {}, "bbox": { "x": 1205, "y": 348, "width": 32, "height": 32 },
      "hittable": true }   // false when something covers its center, e.g. a modal backdrop
  ],
  "texts": [ /* legacy field, see below */ ]
}
```

`expected.json`

```jsonc
{
  "scenario": "board-default",
  "description": "...",
  "targets": [
    // elementId: the matching snapshot element, or null when the target is not interactive (an alert, a canvas)
    // present: false and bbox: null when the target is not on the page
    { "target": "Delete (trash) icon in the 'Write release notes' row",
      "present": true, "elementId": 21, "bbox": { "x": 1205, "y": 348, "width": 32, "height": 32 } }
  ],
  "statements": [
    { "statement": "Two tasks are marked as done", "holds": true }
  ]
}
```

All coordinates are CSS pixels relative to the viewport, with device scale factor 1, so they match screenshot pixels.

## Known differences from the current BrowserAdapter

- `snapshot.json` still has a top-level `texts` list from the HW3 capture. It is not part of the current `PageSnapshot` and the Locator ignores it.
- The files were captured with the HW3 snapshot code, not the current `src/core/browser/snapshot.ts`. The fields and the collected `attrs` match, but details such as accessible names or `hittable` may differ slightly from what the current adapter would produce on the same page. Each fixture is self-consistent: the ground truth in `expected.json` always refers to the `snapshot.json` next to it.

## Regenerating

Regeneration is not set up on `main`. It would require bringing the demo app onto `main` and porting `capture.ts` from `origin/hw3` to the current BrowserAdapter.