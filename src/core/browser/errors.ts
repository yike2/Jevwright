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
