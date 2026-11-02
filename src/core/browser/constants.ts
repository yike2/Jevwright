export const VIEWPORT = { width: 1280, height: 800 };
export const DIALOG_MIN_WAIT_MS = 3000;
export const TAB_POLL_MS = 100;
export const TEXT_POLL_MS = 100;

// Elements a user can interact with; snapshot() keeps the visible ones inside the viewport.
export const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  'input:not([type="hidden"])',
  "select",
  "textarea",
  "summary",
  ...["button", "link", "tab", "checkbox", "radio", "switch", "menuitem", "option"].map((role) => `[role="${role}"]`),
  '[tabindex]:not([tabindex^="-"])',
].join(",");
