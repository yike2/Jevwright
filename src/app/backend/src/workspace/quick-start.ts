import { readFileSync } from "node:fs";
import type { Prisma } from "../generated/prisma/client.js";

export const QUICK_START_NAME = "Quick Start";

// The e2e fixtures are the single source of the Quick Start test bodies; the backend image keeps src/tests
// (.dockerignore).
const FIXTURES = new URL("../../../../tests/e2e/fixtures/", import.meta.url);

/** One Quick Start file: its name, the fixture it is made from, and the three lines that open it. */
type QuickStartFile = { name: string; fixture: string; does: string; expect: string; tryIt: string };

// The manifest of backend.md 1.10. The number prefix keeps the tree, which lists Modules by name, in learning order.
// Each header replaces the fixture's own one-line "# Expect:" comment, so every line below it moves down by two.
const MODULES: { name: string; files: QuickStartFile[] }[] = [
  {
    name: "1 Passing tests",
    files: [
      {
        name: "sign-in-and-see-products.yaml",
        fixture: "pass/sign-in.yaml",
        does: "Signs in as the standard user and checks that the product list opens.",
        expect: "passed, 6 of 6 steps; every element is found by its selector, so Jev is never called.",
        tryIt: "run it, then open the Run to see each step's screenshot and how its element was found.",
      },
      {
        name: "buy-a-backpack.yaml",
        fixture: "pass/checkout.yaml",
        does: "Buys the backpack: signs in, adds it to the cart, checks out, and checks the total.",
        expect: "passed, 16 of 16 steps.",
        tryIt: 'change "Ada" to your own first name and run it again.',
      },
      {
        name: "locked-out-user-sees-an-error.yaml",
        fixture: "pass/locked-out.yaml",
        does: "Signs in as a locked-out user and checks the error the shop shows.",
        expect: "passed; the shop refusing the user is what the test checks, so the test passes.",
        tryIt: "change the expected error text and run it again to see the assert fail.",
      },
    ],
  },
  {
    name: "2 Failing tests - see why they fail",
    files: [
      {
        name: "wrong-total-fails-at-the-total.yaml",
        fixture: "fail/wrong-total.yaml",
        does: "Buys the backpack, but expects the wrong total.",
        expect: "failed at step 14 because the total is $32.39, not $99.99; steps 15 and 16 stay pending.",
        tryIt: "change $99.99 to $32.39 and run it again.",
      },
      {
        name: "missing-button-fails.yaml",
        fixture: "fail/missing-element.yaml",
        does: "Clicks a button that does not exist on the sign-in page.",
        expect: "failed at step 2 after about 3 seconds, because no element matches the selector; Jev is not called.",
        tryIt: 'add target: "Green Login button" under the selector, so Jev can find the button instead.',
      },
      {
        name: "unexpected-alert-fails.yaml",
        fixture: "fail/unexpected-dialog.yaml",
        does: "Clicks Save, which opens an alert the step does not expect.",
        expect: "failed at step 2, because an alert that the step does not answer fails the step.",
        tryIt: "add dialog: { accept: true } to the click and run it again.",
      },
    ],
  },
  {
    name: "3 Invalid files - fix the errors",
    files: [
      {
        name: "seven-errors-at-once.yaml",
        fixture: "invalid/multiple-errors.yaml",
        does: "A file with seven mistakes, to show how validation reports them.",
        expect: "invalid; Validate lists all seven problems at once, each with its line, and Run refuses the file.",
        tryIt: "fix the problems one by one, validating after each, until the file is valid.",
      },
      {
        name: "yaml-syntax-error.yaml",
        fixture: "invalid/yaml-syntax.yaml",
        does: "A step written on one line, which is not valid YAML.",
        expect: "invalid; one YAML syntax error at line 9, so nothing else can be checked yet.",
        tryIt: "put selector on its own line, indented under click, and validate again.",
      },
    ],
  },
  {
    name: "4 Jev - find and check by description",
    files: [
      {
        name: "find-elements-by-description.yaml",
        fixture: "jev/target-sign-in.yaml",
        does: "Signs in with plain-language descriptions instead of selectors; each target is text, not code.",
        expect: "passed; Jev finds the username field, the password field and the Login button from their targets.",
        tryIt: 'reword a target, for example "the green button", and run it again.',
      },
      {
        name: "fall-back-from-a-stale-selector.yaml",
        fixture: "jev/stale-selector.yaml",
        does: "The Login button's selector is out of date, but the step also describes the button.",
        expect: 'passed; the selector matches nothing, so Jev finds the button from its target ("visual" or "dom").',
        tryIt: 'fix the selector to [data-test="login-button"] and run it again; Jev is no longer called.',
      },
      {
        name: "judge-a-true-statement.yaml",
        fixture: "jev/statement-holds.yaml",
        does: "Checks the product page with statements in plain words.",
        expect: "passed; Jev judges both statements true, the last one after its selector matched nothing.",
        tryIt: "write your own statement about the page and run it again.",
      },
      {
        name: "judge-a-false-statement.yaml",
        fixture: "jev/statement-fails.yaml",
        does: "Adds the backpack to the cart, then claims that the cart is empty.",
        expect: "failed at step 8, because Jev judges the statement false.",
        tryIt: 'change the statement to "The cart has one item" and run it again.',
      },
    ],
  },
];

// The password the Demo App shows on its own sign-in page, so it is no secret.
const SWAG_PASSWORD = "secret_sauce";

/** The seeded source: the header, then the fixture without its first-line "# Expect:" comment. */
function source(file: QuickStartFile): string {
  const body = readFileSync(new URL(file.fixture, FIXTURES), "utf8");
  const header = [`# ${file.does}`, `# Expect: ${file.expect}`, `# Try: ${file.tryIt}`];
  return [...header, ...body.split("\n").slice(1)].join("\n");
}

/** The Quick Start project every new account gets (backend.md 1.10), as a nested create of its Project. */
export function quickStartProject(demoAppUrl: string): Prisma.ProjectCreateWithoutUserInput {
  return {
    name: QUICK_START_NAME,
    modules: {
      create: MODULES.map((module) => ({
        name: module.name,
        testFiles: { create: module.files.map((file) => ({ name: file.name, source: source(file) })) },
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
