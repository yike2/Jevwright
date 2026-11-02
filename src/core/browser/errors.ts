/** The failure reason for a Playwright error, or rethrows it when the browser is gone. */
export function failureReason(error: unknown, connected: boolean): string {
  // After a crash or disconnect nothing else in the Run can work, so it is an infrastructure failure.
  if (!connected || !(error instanceof Error)) throw error;
  return error.message.split("\n")[0];
}
