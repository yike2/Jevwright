export type Diagnostic = {
  code: string;
  message: string;
  line: number; // 1-based
};

export type LocateBySelector = { selector: string; target?: undefined };
export type LocateByTarget = { target: string; selector?: undefined };
export type LocateByBoth = { selector: string; target: string };
export type Locate = LocateBySelector | LocateByTarget | LocateByBoth;

export type DialogResponse = { accept: boolean; text?: string; message?: string };
type Dialog = { dialog?: DialogResponse };

export type WaitForCondition = { action: "waitFor"; condition: string };
export type WaitForSelector = { action: "waitFor"; selector: string };
export type WaitForUrl = { action: "waitFor"; url: string };
export type WaitFor = WaitForCondition | WaitForSelector | WaitForUrl;

export type SelectorCheck = { selector: string; text?: string };
export type UrlCheck = { url: string };
export type AssertCheck = SelectorCheck | UrlCheck;
export type AssertWithCheck = { action: "assert"; check: AssertCheck; statement?: string };
export type AssertStatement = { action: "assert"; statement: string };
export type Assert = AssertWithCheck | AssertStatement;

export type StepBody =
  | ({ action: "open"; url: string } & Dialog)
  | ({ action: "back" | "forward" | "reload" } & Dialog)
  | ({ action: "press"; key: string } & Dialog)
  | { action: "scroll"; direction: "up" | "down" | "left" | "right"; distance: number }
  | { action: "sleep"; ms: number }
  | { action: "switchTab"; url: string }
  | ({ action: "click" | "doubleClick" | "rightClick" | "hover" } & Locate & Dialog)
  | ({ action: "input"; value: string } & Locate & Dialog)
  | WaitFor
  | Assert;

// `line` is the step's line in the source file, used for errors and reports.
export type Step = { line: number } & StepBody;

export type TestCase = {
  name: string;
  description?: string;
  baseUrl?: string;
  timeoutMs: number;
  runTimeoutMs: number;
  steps: Step[];
};

export type AnalyzeResult = {
  testCase?: TestCase; // present only when there are no errors
  diagnostics: Diagnostic[];
};
