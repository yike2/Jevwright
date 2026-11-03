import type { Dialog, Page } from "playwright";
import { firstLine } from "./errors.js";
import type { DialogRecord, DialogResponse } from "./types.js";

/** Answers every native dialog of the pages it watches, using the armed Dialog response. */
export class DialogGuard {
  private armed: DialogResponse | undefined;
  private records: DialogRecord[] = [];
  private failure: string | undefined;
  private answered: (() => void) | undefined;
  private answering = new Set<Promise<void>>();

  /** Answers every dialog `page` opens from now on. */
  watch(page: Page): void {
    page.on("dialog", (dialog) => {
      const answer = this.answer(dialog);
      this.answering.add(answer);
      void answer.finally(() => this.answering.delete(answer));
    });
  }

  /** Arms `response` for the next dialog and resolves once that dialog is answered. */
  arm(response: DialogResponse): Promise<void> {
    this.armed = response;
    return new Promise((resolve) => (this.answered = resolve));
  }

  /** Drops an armed response that no dialog used, so a later dialog counts as unexpected. */
  disarm(): void {
    this.armed = undefined;
    this.answered = undefined;
  }

  /** Returns the dialogs answered since the last call, and the first failure they caused. */
  async take(): Promise<{ dialogs: DialogRecord[]; failure?: string }> {
    // A dialog still being answered belongs to this step, and so does a failure to answer it.
    await Promise.all(this.answering);
    const taken = { dialogs: this.records, failure: this.failure };
    this.records = [];
    this.failure = undefined;
    return taken;
  }

  private async answer(dialog: Dialog): Promise<void> {
    const response = this.armed;
    this.armed = undefined;
    const accept = response?.accept === true;
    const type = dialog.type() as DialogRecord["type"];
    const message = dialog.message();
    // Recorded before answering: the action that opened the dialog can return as soon as it closes.
    this.records.push({ type, message, answer: accept ? "accepted" : "dismissed", expected: response !== undefined });
    if (!response) {
      this.failure ??= `Unexpected ${type} dialog: "${message}"`;
    } else if (response.message !== undefined && !message.includes(response.message)) {
      this.failure ??= `The dialog said "${message}", which does not contain "${response.message}"`;
    }
    try {
      if (accept) await dialog.accept(response.text);
      else await dialog.dismiss();
    } catch (error) {
      // The listener's promise is not awaited, so the error becomes the step's failure instead.
      this.failure ??= `Could not answer the ${type} dialog: ${firstLine(error)}`;
    } finally {
      this.answered?.();
    }
  }
}
