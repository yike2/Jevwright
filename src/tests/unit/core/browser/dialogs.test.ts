import type { Dialog, Page } from "playwright";
import { describe, expect, it } from "vitest";
import { DialogGuard } from "@/core/browser/dialogs.js";

// A page whose dialog listener the test calls by hand, and a confirm dialog whose answer rejects.
function setup() {
  let listener: (dialog: Dialog) => void = () => {};
  const page = { on: (_event: string, handler: (dialog: Dialog) => void) => (listener = handler) };
  const guard = new DialogGuard();
  guard.watch(page as unknown as Page);
  const closed = () => Promise.reject(new Error("Target page, context or browser has been closed\nCall log: ..."));
  const dialog = { type: () => "confirm", message: () => "Delete?", accept: closed, dismiss: closed };
  return { guard, open: () => listener(dialog as unknown as Dialog) };
}

describe("DialogGuard", () => {
  it("fails the step and releases the waiting action when a dialog cannot be answered", async () => {
    const { guard, open } = setup();
    const answered = guard.arm({ accept: true });

    open();
    await answered;

    expect(guard.take()).toEqual({
      dialogs: [{ type: "confirm", message: "Delete?", answer: "accepted", expected: true }],
      failure: "Could not answer the confirm dialog: Target page, context or browser has been closed",
    });
  });
});
