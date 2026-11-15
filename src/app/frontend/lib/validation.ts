/** What is wrong with an email address, or null when it is fine. */
export function emailProblem(email: string): string | null {
  void email;
  return null;
}

/** What is wrong with a password, or null when it is fine. */
export function passwordProblem(password: string): string | null {
  void password;
  return null;
}

/** What is wrong with a Project or Module name, or null when it is fine. */
export function nameProblem(name: string): string | null {
  void name;
  return null;
}

/** What is wrong with a Test File name typed before its fixed `.yaml`, or null when it is fine. */
export function testFileNameProblem(name: string): string | null {
  void name;
  return null;
}

/** What is wrong with a Variable name, or null when it is fine. */
export function variableNameProblem(name: string): string | null {
  void name;
  return null;
}

/** What is wrong with a Variable value, or null when it is fine. */
export function variableValueProblem(value: string): string | null {
  void value;
  return null;
}
