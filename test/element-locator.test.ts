import { describe, expect, it } from "vitest";
import type { BoxAnswer, ChoiceAnswer, ChoiceRequest, JevHarness } from "../src/jev/harness.ts";
import type { BrowserDriver } from "../src/locator/browser-driver.ts";
import { createElementLocator } from "../src/locator/element-locator.ts";
import { loadFixtureDriver } from "./support/fixture-driver.ts";

// A JevHarness that returns scripted answers and records what it was asked.
function fakeJev(answers: { box?: BoxAnswer; choice?: ChoiceAnswer } = {}) {
  const calls = { locateBox: [] as string[], chooseElement: [] as ChoiceRequest[] };
  const jev: JevHarness = {
    async locateBox({ target }) {
      calls.locateBox.push(target);
      if (!answers.box) throw new Error("unexpected locateBox call");
      return answers.box;
    },
    async chooseElement(request) {
      calls.chooseElement.push(request);
      if (!answers.choice) throw new Error("unexpected chooseElement call");
      return answers.choice;
    },
  };
  return { jev, calls };
}

// Sign in button (e6) spans x 256-345, y 420-462 of the 1280x800 login screenshot.
const signInBox: BoxAnswer = {
  box: { left: 0.21, right: 0.28, top: 0.52, bottom: 0.59 },
  confidence: 0.93,
  visible: 0.98,
};

describe("Element Locator", () => {
  it("uses the selector when it matches exactly one element, without asking Jev", async () => {
    const { jev, calls } = fakeJev();
    const locator = createElementLocator({ driver: await loadFixtureDriver("list"), jev });

    const result = await locator.locate({ selector: "tr[data-user=bob] button.danger", target: "Remove Bob" });

    expect(result).toMatchObject({ found: true, method: "selector", element: { id: "e8" } });
    expect(calls.locateBox).toEqual([]);
    expect(calls.chooseElement).toEqual([]);
  });

  it("falls back to visual locate when the selector matches nothing, hitting the box's center", async () => {
    const { jev, calls } = fakeJev({ box: signInBox });
    const locator = createElementLocator({ driver: await loadFixtureDriver("login"), jev });

    const result = await locator.locate({ selector: "#login-btn", target: "the Sign in button" });

    expect(result).toMatchObject({ found: true, method: "visual", element: { id: "e6" }, confidence: 0.93 });
    expect(calls.locateBox).toEqual(["the Sign in button"]);
  });

  it("skips the selector step when the step has only a target", async () => {
    const { jev } = fakeJev({ box: signInBox });
    const fixture = await loadFixtureDriver("login");
    const driver: BrowserDriver = {
      ...fixture,
      query: async () => {
        throw new Error("query should not be called without a selector");
      },
    };
    const locator = createElementLocator({ driver, jev });

    const result = await locator.locate({ target: "the Sign in button" });

    expect(result).toMatchObject({ found: true, method: "visual", element: { id: "e6" } });
  });

  it("falls back to DOM locate when Jev is not confident about the box", async () => {
    const { jev, calls } = fakeJev({
      box: { ...signInBox, confidence: 0.3 },
      choice: { id: "e9", confidence: 0.97 },
    });
    const locator = createElementLocator({ driver: await loadFixtureDriver("login"), jev });

    const result = await locator.locate({ target: "the GitHub sign-in button" });

    expect(result).toMatchObject({ found: true, method: "dom", element: { id: "e9", name: "GitHub" }, confidence: 0.97 });
    expect(calls.chooseElement[0].target).toBe("the GitHub sign-in button");
    expect(calls.chooseElement[0].candidates.map((c) => c.id)).toEqual(
      ["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8", "e9"],
    );
  });

  it("falls back to DOM locate when Jev says the target is not visible, even with a confident box", async () => {
    const { jev } = fakeJev({ box: { ...signInBox, visible: 0.1 }, choice: { id: "e9", confidence: 0.9 } });
    const locator = createElementLocator({ driver: await loadFixtureDriver("login"), jev });

    const result = await locator.locate({ target: "the GitHub sign-in button" });

    expect(result).toMatchObject({ found: true, method: "dom", element: { id: "e9" } });
  });

  it("falls back to DOM locate when the box's center hits no interactive element", async () => {
    const emptyCorner = { left: 0.8, right: 0.9, top: 0.8, bottom: 0.9 };
    const { jev } = fakeJev({ box: { ...signInBox, box: emptyCorner }, choice: { id: "e6", confidence: 0.9 } });
    const locator = createElementLocator({ driver: await loadFixtureDriver("login"), jev });

    const result = await locator.locate({ target: "the Sign in button" });

    expect(result).toMatchObject({ found: true, method: "dom", element: { id: "e6" } });
  });

  it("reports not found when DOM locate finds no matching element either", async () => {
    const { jev } = fakeJev({ box: { ...signInBox, visible: 0.05 }, choice: { id: null, confidence: 0.9 } });
    const locator = createElementLocator({ driver: await loadFixtureDriver("login"), jev });

    const result = await locator.locate({ target: "the Log out button" });

    expect(result.found).toBe(false);
  });

  it("does not trust a DOM pick below the confidence threshold", async () => {
    const { jev } = fakeJev({ box: { ...signInBox, visible: 0.05 }, choice: { id: "e8", confidence: 0.3 } });
    const locator = createElementLocator({ driver: await loadFixtureDriver("login"), jev });

    const result = await locator.locate({ target: "the Log out button" });

    expect(result.found).toBe(false);
  });

  it("records what each method did, e.g. an ambiguous selector and an unconfident box", async () => {
    const { jev } = fakeJev({
      box: { box: { left: 0.59, right: 0.65, top: 0.6, bottom: 0.65 }, confidence: 0.4, visible: 0.9 },
      choice: { id: "e7", confidence: 0.95 },
    });
    const locator = createElementLocator({ driver: await loadFixtureDriver("modal"), jev });

    const result = await locator.locate({ selector: "button.danger", target: "the Delete button in the dialog" });

    expect(result).toMatchObject({ found: true, method: "dom", element: { id: "e7" } });
    expect(result.attempts).toEqual([
      { method: "selector", outcome: "ambiguous" },
      { method: "visual", outcome: "low-confidence", confidence: 0.4 },
      { method: "dom", outcome: "matched", confidence: 0.95 },
    ]);
  });

  it("reports not found without asking Jev when a selector-only step matches nothing", async () => {
    const { jev, calls } = fakeJev();
    const locator = createElementLocator({ driver: await loadFixtureDriver("login"), jev });

    const result = await locator.locate({ selector: "#login-btn" });

    expect(result).toEqual({ found: false, attempts: [{ method: "selector", outcome: "no-match" }] });
    expect(calls.locateBox).toEqual([]);
  });

  it("does not offer elements covered by a modal to DOM locate", async () => {
    const { jev, calls } = fakeJev({ box: { ...signInBox, visible: 0.1 }, choice: { id: "e6", confidence: 0.9 } });
    const locator = createElementLocator({ driver: await loadFixtureDriver("modal"), jev });

    await locator.locate({ target: "the Cancel button" });

    expect(calls.chooseElement[0].candidates.map((c) => c.id)).toEqual(["e5", "e6", "e7", "e8"]);
  });

  it("describes DOM candidates by role, name, state and context so repeated buttons differ", async () => {
    const { jev, calls } = fakeJev({ box: { ...signInBox, visible: 0.1 }, choice: { id: "e8", confidence: 0.9 } });
    const locator = createElementLocator({ driver: await loadFixtureDriver("list"), jev });

    await locator.locate({ target: "the Remove button for Bob Martinez" });

    const described = Object.fromEntries(calls.chooseElement[0].candidates.map((c) => [c.id, c.description]));
    expect(described.e6).toBe('button "Remove" in tr: Alice Chen Owner Edit Remove');
    expect(described.e8).toBe('button "Remove" in tr: Bob Martinez Developer Edit Remove');
    expect(described.e13).toBe('button "Previous" (disabled) in div: Team members');
  });

  it("runs only the methods it is configured with", async () => {
    const { jev, calls } = fakeJev({ choice: { id: "e9", confidence: 0.9 } });
    const locator = createElementLocator({ driver: await loadFixtureDriver("login"), jev, methods: ["dom"] });

    const result = await locator.locate({ selector: "button[name=sso-github]", target: "the GitHub sign-in button" });

    expect(result).toMatchObject({ found: true, method: "dom", element: { id: "e9" } });
    expect(result.attempts.map((a) => a.method)).toEqual(["dom"]);
    expect(calls.locateBox).toEqual([]);
  });
});
