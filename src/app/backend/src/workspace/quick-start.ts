import { readFileSync } from "node:fs";
import type { Prisma } from "../generated/prisma/client.js";

export const QUICK_START_NAME = "Quick Start";

// The e2e fixtures are the single source of the Quick Start files; the backend image keeps src/tests (.dockerignore).
const FIXTURES = new URL("../../../../tests/e2e/fixtures/", import.meta.url);

// Which fixtures each Module holds (backend.md 1.10). The number prefix keeps the tree, which lists Modules by name,
// in learning order. Fixtures that need a Variable other than BASE and SWAG_PASSWORD, or many seconds to run, are
// left out. The Jev files call Jev when they run; pnpm test:e2e never runs them.
const MODULES = [
  { name: "1 Passing", files: ["pass/sign-in.yaml", "pass/checkout.yaml", "pass/locked-out.yaml"] },
  { name: "2 Failing", files: ["fail/wrong-total.yaml", "fail/missing-element.yaml", "fail/unexpected-dialog.yaml"] },
  { name: "3 Invalid", files: ["invalid/multiple-errors.yaml", "invalid/yaml-syntax.yaml"] },
  {
    name: "4 Jev",
    files: [
      "jev/target-sign-in.yaml",
      "jev/stale-selector.yaml",
      "jev/statement-holds.yaml",
      "jev/statement-fails.yaml",
    ],
  },
] as const;

// The password the Demo App shows on its own sign-in page, so it is no secret.
const SWAG_PASSWORD = "secret_sauce";

/** The Quick Start project every new account gets (backend.md 1.10), as a nested create of its Project. */
export function quickStartProject(demoAppUrl: string): Prisma.ProjectCreateWithoutUserInput {
  return {
    name: QUICK_START_NAME,
    modules: {
      create: MODULES.map((module) => ({
        name: module.name,
        testFiles: {
          create: module.files.map((path) => ({
            name: path.slice(path.lastIndexOf("/") + 1),
            source: readFileSync(new URL(path, FIXTURES), "utf8"),
          })),
        },
      })),
    },
    variables: {
      create: [
        { name: "BASE", value: demoAppUrl },
        { name: "SWAG_PASSWORD", value: SWAG_PASSWORD },
      ],
    },
  };
}
