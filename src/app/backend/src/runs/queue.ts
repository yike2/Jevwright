/** Starts queued Runs first in, first out, at most `concurrency` at a time (backend.md 1.4). */
export class RunQueue {
  constructor(
    private readonly run: (runId: string) => Promise<void>,
    private readonly concurrency: number,
  ) {}

  /** Adds a Run to the end of the queue; it starts once fewer than `concurrency` Runs are running. */
  enqueue(_runId: string): void {}

  /** Resolves once no Run is queued or running. */
  async idle(): Promise<void> {}
}
