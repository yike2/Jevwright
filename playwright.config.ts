import { defineConfig, devices } from "@playwright/test";

// E2E tests (docs/tech/e2e.md): the real frontend and backend, driven in Chromium, with Runs against the Demo App.
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
      url: "http://127.0.0.1:4000/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm frontend",
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
