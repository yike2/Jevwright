import { defineConfig, devices } from "@playwright/test";

// E2E tests (docs/tech/e2e.md): the real frontend and backend, driven in Chromium, with Runs against the Demo App.
// In CI (docs/deploy/ci-cd.md) the frontend is built first and served with next start, which is faster and closer
// to production than the dev server's first compile.
export default defineConfig({
  testDir: "src/tests/e2e",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  // Tests that wait for one or more Runs need more than the default 30 s; waitForFinalStatus waits up to 60 s.
  timeout: 120_000,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm backend",
      // The Quick Start project's BASE (backend.md 1.10) is the local Demo App below.
      env: { DEMO_APP_URL: "http://127.0.0.1:8080" },
      url: "http://127.0.0.1:4000/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: process.env.CI ? "pnpm --filter @jevwright/frontend start" : "pnpm frontend",
      url: "http://localhost:3000/login",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Runs open only this local Demo App (docs/tech/e2e.md 1.1), at the BASE the tests set.
      command: "pnpm exec tsx src/tests/e2e/demo-app.ts",
      url: "http://127.0.0.1:8080/",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
