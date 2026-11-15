// The backend's rules with the backend's words (backend.md 1.7), so a form says what is wrong before it sends.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEST_FILE_NAME = /^[A-Za-z0-9._-]+$/;
const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]*$/;
const MAX_NAME_CHARS = 100;
const MAX_VALUE_CHARS = 10_000;

/** What is wrong with an email address, or null when it is fine. */
export function emailProblem(email: string): string | null {
  return EMAIL.test(email) ? null : "Enter a valid email address.";
}

/** What is wrong with a password, or null when it is fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 200) return "Password can be at most 200 characters.";
  return null;
}

/** What is wrong with a Project or Module name, or null when it is fine. */
export function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Enter a name.";
  if (trimmed.length > MAX_NAME_CHARS) return "Names can be at most 100 characters.";
  return null;
}

/** What is wrong with a Test File name typed before its fixed `.yaml`, or null when it is fine. */
export function testFileNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Enter a name.";
  if (!TEST_FILE_NAME.test(trimmed)) return "Use only letters, digits, -, _ and ., with no spaces.";
  if (trimmed.length + ".yaml".length > MAX_NAME_CHARS) return "Names can be at most 100 characters.";
  return null;
}

/** What is wrong with a Variable name, or null when it is fine. */
export function variableNameProblem(name: string): string | null {
  return VARIABLE_NAME.test(name)
    ? null
    : "Variable names use capital letters, digits and _, and do not start with a digit, for example BASE_URL.";
}

/** What is wrong with a Variable value, or null when it is fine. */
export function variableValueProblem(value: string): string | null {
  return value.length > MAX_VALUE_CHARS ? "A Variable value can be at most 10,000 characters." : null;
}
