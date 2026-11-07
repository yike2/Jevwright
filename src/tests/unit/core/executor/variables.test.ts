import { describe, expect, it } from "vitest";
import { createRedact, substitute } from "@/core/executor/variables.js";
import type { Step, TestCase } from "@/core/syntax/index.js";

const vars = { BASE: "https://demo.test", EMAIL: "student@x.com", PASSWORD: "s3cret" };

const testCase = (...steps: Step[]): TestCase => ({ name: "t", timeoutMs: 1000, runTimeoutMs: 600000, steps });

describe("substitute", () => {
  it.each<[string, Step, Step]>([
    ["open url", { line: 1, action: "open", url: "{{BASE}}/login" }, { line: 1, action: "open", url: "https://demo.test/login" }],
    ["press key", { line: 1, action: "press", key: "{{PASSWORD}}" }, { line: 1, action: "press", key: "s3cret" }],
    ["switchTab url", { line: 1, action: "switchTab", url: "{{BASE}}/*" }, { line: 1, action: "switchTab", url: "https://demo.test/*" }],
    [
      "element selector and target",
      { line: 1, action: "click", selector: "[title='{{EMAIL}}']", target: "Row of {{EMAIL}}" },
      { line: 1, action: "click", selector: "[title='student@x.com']", target: "Row of student@x.com" },
    ],
    [
      "input value",
      { line: 1, action: "input", selector: "#password", value: "{{PASSWORD}}" },
      { line: 1, action: "input", selector: "#password", value: "s3cret" },
    ],
    [
      "dialog text and message",
      { line: 1, action: "click", selector: "#go", dialog: { accept: true, text: "{{EMAIL}}", message: "Hi {{EMAIL}}" } },
      { line: 1, action: "click", selector: "#go", dialog: { accept: true, text: "student@x.com", message: "Hi student@x.com" } },
    ],
    [
      "waitFor condition",
      { line: 1, action: "waitFor", condition: "{{EMAIL}} is shown" },
      { line: 1, action: "waitFor", condition: "student@x.com is shown" },
    ],
    ["waitFor url", { line: 1, action: "waitFor", url: "{{BASE}}/home" }, { line: 1, action: "waitFor", url: "https://demo.test/home" }],
    [
      "assert check and statement",
      { line: 1, action: "assert", check: { selector: "#user", text: "{{EMAIL}}" }, statement: "{{EMAIL}} is logged in" },
      { line: 1, action: "assert", check: { selector: "#user", text: "student@x.com" }, statement: "student@x.com is logged in" },
    ],
    [
      "assert url check",
      { line: 1, action: "assert", check: { url: "{{BASE}}/home" } },
      { line: 1, action: "assert", check: { url: "https://demo.test/home" } },
    ],
  ])("fills Variables in the %s", (_field, step, expected) => {
    expect(substitute(step, vars)).toEqual({ ok: true, value: expected });
  });

  it("fills several Variables and repeated ones in one string", () => {
    const step: Step = { line: 1, action: "assert", statement: "{{EMAIL}} / {{PASSWORD}} / {{EMAIL}}" };

    expect(substitute(step, vars)).toEqual({
      ok: true,
      value: { line: 1, action: "assert", statement: "student@x.com / s3cret / student@x.com" },
    });
  });

  it("leaves braces that are not a Variable name as written", () => {
    const step: Step = { line: 1, action: "input", selector: "#t", value: "{{lower}} {{ EMAIL }} {EMAIL}" };

    expect(substitute(step, vars)).toEqual({ ok: true, value: step });
  });

  it("fills Variables inside arrays and keeps them arrays", () => {
    expect(substitute(["{{EMAIL}}", "x"], vars)).toEqual({ ok: true, value: ["student@x.com", "x"] });
  });

  it("lists each missing Variable once, in order of first appearance", () => {
    const step: Step = { line: 1, action: "input", selector: "#{{ID}}", value: "{{TOKEN}} {{EMAIL}} {{ID}}" };

    expect(substitute(step, vars)).toEqual({ ok: false, missing: ["ID", "TOKEN"] });
  });
});

describe("createRedact", () => {
  it("puts {{NAME}} back for the value of a Variable used in the TestCase", () => {
    const redact = createRedact(testCase({ line: 1, action: "assert", check: { selector: "#u", text: "{{EMAIL}}" } }), vars);

    expect(redact('Text of "#u" did not contain "student@x.com"')).toBe('Text of "#u" did not contain "{{EMAIL}}"');
  });

  it("redacts Variables used in any step, not only the one that failed", () => {
    const redact = createRedact(
      testCase({ line: 1, action: "back" }, { line: 2, action: "input", selector: "#p", value: "{{PASSWORD}}" }),
      vars,
    );

    expect(redact("Welcome s3cret, s3cret")).toBe("Welcome {{PASSWORD}}, {{PASSWORD}}");
  });

  it("redacts Variables used in the baseUrl", () => {
    const redact = createRedact({ ...testCase({ line: 1, action: "open", url: "/login" }), baseUrl: "{{BASE}}" }, vars);

    expect(redact("net::ERR_NAME_NOT_RESOLVED at https://demo.test/login")).toBe(
      "net::ERR_NAME_NOT_RESOLVED at {{BASE}}/login",
    );
  });

  it("replaces the longest value first when one value contains another", () => {
    const redact = createRedact(testCase({ line: 1, action: "assert", statement: "{{SHORT}} {{LONG}}" }), {
      SHORT: "abc",
      LONG: "abcdef",
    });

    expect(redact("got abcdef and abc")).toBe("got {{LONG}} and {{SHORT}}");
  });

  it("keeps a {{NAME}} already in the text when a value occurs inside it", () => {
    const redact = createRedact(testCase({ line: 1, action: "open", url: "{{USER}}/{{PASSWORD}}" }), { USER: "PASS" });

    expect(redact("Variable {{PASSWORD}} is not set; got PASS")).toBe("Variable {{PASSWORD}} is not set; got {{USER}}");
  });

  it("redacts the URL-encoded form of a value", () => {
    const redact = createRedact(testCase({ line: 1, action: "assert", check: { url: "**/cb?t={{TOKEN}}" } }), {
      TOKEN: "a b&c",
    });

    expect(redact("Timeout waiting for http://x.test/cb?t=a%20b%26c")).toBe("Timeout waiting for http://x.test/cb?t={{TOKEN}}");
  });

  it("matches values with regular expression characters literally", () => {
    const redact = createRedact(testCase({ line: 1, action: "input", selector: "#p", value: "{{PASSWORD}}" }), {
      PASSWORD: "a+b",
    });

    expect(redact("aab a+b")).toBe("aab {{PASSWORD}}");
  });

  it("leaves values of Variables the TestCase does not use", () => {
    const redact = createRedact(testCase({ line: 1, action: "open", url: "{{BASE}}" }), { ...vars, PORT: "1" });

    expect(redact("Timeout 1000ms exceeded")).toBe("Timeout 1000ms exceeded");
  });

  it("ignores Variables whose value is empty", () => {
    const redact = createRedact(testCase({ line: 1, action: "input", selector: "#n", value: "{{EMPTY}}" }), { EMPTY: "" });

    expect(redact("reason")).toBe("reason");
  });
});
