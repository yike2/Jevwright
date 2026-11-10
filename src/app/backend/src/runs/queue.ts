/** Starts queued Runs first in, first out, at most `concurrency` at a time (backend.md 1.4). */
export class RunQueue {
  private readonly waiting: string[] = [];
  private running = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly run: (runId: string) => Promise<void>,
    private readonly concurrency: number,
  ) {}

  /** Adds a Run to the end of the queue; it starts once fewer than `concurrency` Runs are running. */
  enqueue(runId: string): void {
    this.waiting.push(runId);
    this.next();
  }

  /** Resolves once no Run is queued or running. */
  idle(): Promise<void> {
    if (this.running === 0 && this.waiting.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private next(): void {
    while (this.running < this.concurrency) {
      const runId = this.waiting.shift();
      if (runId === undefined) break;
      this.running += 1;
      this.run(runId)
        // The Run function records its own failures on the Run; this only keeps the queue going if that fails too.
        .catch((error: unknown) => console.error(`Run ${runId} failed outside its handling`, error))
        .finally(() => {
          this.running -= 1;
          this.next();
        });
    }
    if (this.running === 0 && this.waiting.length === 0) {
      for (const resolve of this.idleWaiters.splice(0)) resolve();
    }
  }
}
