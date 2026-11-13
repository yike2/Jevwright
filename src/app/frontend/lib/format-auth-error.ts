import { ApiError } from "./api.js";

export function formatAuthError(error: unknown): string[] {
  if (error instanceof ApiError) {
    const messages = [error.message];

    if (error.status === 400 && Array.isArray(error.details)) {
      for (const detail of error.details) {
        if (detail && typeof detail === "object" && "message" in detail) {
          const message = detail.message;
          if (typeof message === "string") {
            messages.push(message);
          }
        }
      }
    }

    return messages;
  }

  if (error instanceof Error) {
    return [error.message];
  }

  return ["Internal server error"];
}
