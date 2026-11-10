import type { ErrorRequestHandler } from "express";

export type ErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "too_large"
  | "invalid_test"
  | "not_implemented"
  | "internal";

export const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  invalid_test: 422,
  internal: 500,
  not_implemented: 501,
};

/** An expected API failure; the error handler answers it as `{ error: { code, message, details? } }`. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Answers ApiErrors and body-parser failures in the API's error format, and anything else as a generic 500. */
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  const apiError = toApiError(error);
  if (apiError.code === "internal") console.error(error);
  const { code, message, details } = apiError;
  res.status(STATUS[code]).json({ error: details === undefined ? { code, message } : { code, message, details } });
};

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  // body-parser marks its failures with a `type`; their messages may quote the body, so use our own.
  const type = typeof error === "object" && error !== null && "type" in error ? error.type : undefined;
  if (type === "entity.parse.failed") return new ApiError("invalid_request", "The body is not valid JSON");
  if (type === "entity.too.large") return new ApiError("too_large", "The body is too large");
  return new ApiError("internal", "Internal server error");
}
