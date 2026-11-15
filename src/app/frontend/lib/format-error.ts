import { ApiError, NetworkError } from "./api.js";

const SERVER_ERROR = "Something went wrong on the server. Try again in a moment.";
const UNKNOWN_ERROR = "Something went wrong. Try again.";

/** The lines to show a user for an error from the API client or a page. */
export function formatError(error: unknown): string[] {
  if (error instanceof NetworkError) {
    return [error.message];
  }

  if (error instanceof ApiError) {
    // A 5xx message is the server's own and says nothing the user can act on.
    if (error.status >= 500 || error.code === "internal") {
      return [SERVER_ERROR];
    }

    // A 400's message joins its details; listing them one per line reads better.
    const details = error.status === 400 && Array.isArray(error.details) ? detailMessages(error.details) : [];
    return details.length > 0 ? details : [error.message];
  }

  if (error instanceof Error) {
    return [error.message];
  }

  return [UNKNOWN_ERROR];
}

/** One line for an error, for places that show a single message. */
export function errorText(error: unknown): string {
  return formatError(error).join(" ");
}

function detailMessages(details: unknown[]): string[] {
  const messages = details.flatMap((detail) =>
    detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string"
      ? [detail.message]
      : [],
  );
  return [...new Set(messages)];
}
