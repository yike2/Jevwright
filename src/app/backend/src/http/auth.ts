import type { Request, RequestHandler } from "express";
import type { Auth } from "../api/contract.js";
import type { HandlerInput } from "../app.js";
import { ApiError } from "./errors.js";

const BEARER = /^Bearer (\S+)$/;

/** The login token of a request, from where the route's `auth` takes it (backend.md 1.2). */
export function tokenOf(req: Request, auth: Exclude<Auth, "none">): string | undefined {
  const header = auth === "query" ? undefined : BEARER.exec(req.headers.authorization ?? "")?.[1];
  const query = auth === "bearer" ? undefined : req.query.token;
  return header ?? (typeof query === "string" ? query : undefined);
}

/** Answers 401 unless the request carries a valid token; keeps its user id in res.locals.userId. */
export function requireToken(auth: Auth, verify: (token: string) => Promise<string | undefined>): RequestHandler {
  return async (req, res, next) => {
    if (auth === "none") return next();
    const token = tokenOf(req, auth);
    const userId = token === undefined ? undefined : await verify(token);
    if (userId === undefined) throw new ApiError("unauthorized", "No valid token");
    res.locals.userId = userId;
    next();
  };
}

/** The token's user id; every route that takes a token has one by the time its handler runs. */
export function requireUserId(input: HandlerInput): string {
  if (input.userId === undefined) throw new Error("A handler that needs a user ran on a route without auth");
  return input.userId;
}
