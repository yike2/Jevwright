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