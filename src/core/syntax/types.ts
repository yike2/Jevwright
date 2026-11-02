export type Diagnostic = {
  code: string;
  message: string;
  line: number; // 1-based
};

export type Locate = { selector?: string; target?: string };

export type DialogResponse = { accept: boolean; text?: string; message?: string };
type Dialog = { dialog?: DialogResponse };

export type StepBody =
  | ({ action: "open"; url: string } & Dialog)
  | ({ action: "back" | "forward" | "reload" } & Dialog)
  | ({ action: "press"; key: string } & Dialog)
  | { action: "scroll"; direction: "up" | "down" | "left" | "right"; distance: number }
  | { action: "sleep"; ms: number }
  | { action: "switchTab"; url: string }
  | ({ action: "click" | "doubleClick" | "rightClick" | "hover" } & Locate & Dialog)
  | ({ action: "input"; value: string } & Locate & Dialog)
  | { action: "waitFor"; condition?: string; selector?: string; url?: string }
  | { action: "assert"; statement?: string; selector?: string; text?: string; url?: string };

// `line` is the step's line in the source file, used for errors and reports.
export type Step = { line: number } & StepBody;

export type TestCase = {
  name: string;
  description?: string;
  baseUrl?: string;
  timeoutMs: number;
  steps: Step[];
};

export type AnalyzeResult = {
  testCase?: TestCase; // present only when there are no errors
  diagnostics: Diagnostic[];
};
