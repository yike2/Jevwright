import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "jevwright-reports/",
    "playwright-report/",
    "test-results/",
    "scratch/",
    "src/tests/benchmark/demo-app/",
    "src/app/backend/src/generated/",
    "**/.next/",
    "src/app/frontend/lib/api-schema.ts",
    "src/app/frontend/next-env.d.ts",
    // The user guide's build output, committed on purpose (AGENTS.md 7), and VitePress's cache.
    "docs/guide/",
    "docs/guide-src/.vitepress/cache/",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  prettier,
);