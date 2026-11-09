/** The failure reason for a Playwright error, or rethrows it when the browser is gone. */
export function failureReason(error: unknown, connected: boolean): string {
  // After a crash or disconnect nothing else in the Run can work, so it is an infrastructure failure.
  if (!connected || !(error instanceof Error)) throw error;
  return firstLine(error);
}

/** The first line of an error's message; Playwright puts its call log on the lines after it. */
export function firstLine(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).split("\n")[0]!;
}

/** Runs `run`, then always `cleanup`; when both throw, both are thrown together so the first cause is kept. */
export async function withCleanup<T>(run: () => Promise<T>, cleanup: () => Promise<unknown>): Promise<T> {
  let result: T;
  try {
    result = await run();
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      // eslint-disable-next-line preserve-caught-error -- both errors are kept in `errors`
      throw new AggregateError([error, cleanupError], firstLine(error));
    }
    throw error;
  }
  await cleanup();
  return result;
}
