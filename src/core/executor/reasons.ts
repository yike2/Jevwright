/** Failure reason for Variables missing from `vars`. */
export const missingVariables = (names: string[]) =>
  names.length === 1
    ? `Variable {{${names[0]}}} is not set`
    : `Variables ${names.map((name) => `{{${name}}}`).join(", ")} are not set`;

/** Failure reason, and Run error message, when the Run outlasts `runTimeoutMs`. */
export const runTimedOut = (ms: number) => `The run did not finish within runTimeoutMs (${ms} ms)`;
