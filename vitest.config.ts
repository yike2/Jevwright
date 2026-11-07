import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Browser tests launch Chromium, which can take several seconds on a busy machine or CI runner.
    testTimeout: 15_000,
    exclude: [...configDefaults.exclude, "**/*.live.test.ts"],
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
