import type { DialogRecord } from "../browser/index.js";
import type { JevClient } from "../jev/index.js";
import type { Step } from "../syntax/index.js";

export type LocateMethod = "selector" | "visual" | "dom";

export type StepInfo = { index: number; line: number; action: Step["action"] };

type Ran = {
  startedAt: string; // ISO 8601
  durationMs: number;
  locateMethod?: LocateMethod; // element actions only
  dialogs: DialogRecord[];
};

export type PassedStep = StepInfo & Ran & { status: "passed" };
export type FailedStep = StepInfo &
  Ran & {
    status: "failed";
    reason: string; // redacted
    screenshot?: Buffer; // PNG of the viewport; absent when it could not be read
  };
export type StepResult = (StepInfo & { status: "pending" }) | PassedStep | FailedStep;

export type StepEvent = { type: "started"; step: StepInfo } | { type: "finished"; result: StepResult };

export type ExecuteOptions = {
  headed: boolean;
  vars: Record<string, string>;
  onEvent: (event: StepEvent) => void;
  jev: JevClient;
};

export type ExecuteResult = {
  steps: StepResult[]; // one per TestCase step, in order
  trace: Buffer; // from BrowserAdapter.close()
};

export type RunError = { kind: "timeout" | "infrastructure"; message: string }; // message redacted
