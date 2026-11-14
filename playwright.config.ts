import { defineConfig, devices } from "@playwright/test";

// E2E tests (docs/tech/e2e.md): the real frontend and backend, driven in Chromium.
// In CI (docs/deploy/ci-cd.md) the frontend is built first and served with next start, which is faster and closer
// to production than the dev server's first compile.
export default defineConfig({
  testDir: "src/tests/e2e",
  testMatch: "**/*.e2e.ts",
  workers: 1,
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
  ],
});