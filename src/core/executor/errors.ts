import type { RunError, StepResult } from "./types.js";

/** Thrown when a Run is aborted by its Run timeout or a crash; carries the Step results and the trace so far. */
export class RunAbortedError extends Error {
  constructor(
    readonly kind: RunError["kind"],
    message: string,
    readonly steps: StepResult[],
    readonly trace: Buffer,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RunAbortedError";
  }
}
