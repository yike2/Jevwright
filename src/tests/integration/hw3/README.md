# Locator Integration Fixtures

This directory holds the demo HTML pages and the Playwright-captured fixtures used to test the Element Locator without launching a browser during unit/integration tests.

## Structure

- `demo-app/`: Static HTML pages (`login.html`, `tasks.html`, `modal.html`).
- `fixtures/<page>/`:
  - `screenshot.png`: Viewport screenshot (`1280x720` CSS pixels).
  - `snapshot.json`: Interactive DOM elements (`id`, `role`, `name`, `text`, `attrs`, `bbox`, `hittable`).
  - `ground-truth.json`: Natural-language targets and the expected snapshot `elementId` and `bbox` each target resolves to.

Regenerate with:

```bash
pnpm run fixtures:generate
```

