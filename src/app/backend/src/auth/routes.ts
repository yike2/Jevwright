import type { Response } from "express";
import type { Handlers, HandlerInput } from "../app.js";
import type { Db } from "../db.js";
import type { User } from "../generated/prisma/client.js";
import { ApiError } from "../http/errors.js";
import { isUniqueViolation } from "../http/prisma-errors.js";
import { requireUserId } from "../http/auth.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signToken } from "./token.js";

export type AuthDeps = { db: Db; jwtSecret: string };

type Credentials = { email: string; password: string };

/** The User of the API: never the password hash. */
export const toUser = (user: User) => ({ id: user.id, email: user.email, createdAt: user.createdAt });

/** Register, login, and the logged-in user (backend.md 1.2). */
export function authHandlers({ db, jwtSecret }: AuthDeps): Handlers {
  const answer = async (res: Response, status: number, user: User) =>
    void res.status(status).json({ token: await signToken(user.id, jwtSecret), user: toUser(user) });

  return {
    "post /auth/register": async ({ body }: HandlerInput, res) => {
      const { email, password } = body as Credentials;
      try {
        const user = await db.user.create({
          data: { email: email.toLowerCase(), passwordHash: await hashPassword(password) },
        });
        await answer(res, 201, user);
      } catch (error) {
        if (isUniqueViolation(error)) throw new ApiError("conflict", "The email is taken");
        throw error;
      }
    },
    "post /auth/login": async ({ body }: HandlerInput, res) => {
      const { email, password } = body as Credentials;
      const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
      // One answer for both failures, so login does not reveal which emails are registered.
      if (!user || !(await verifyPassword(password, user.passwordHash)))
        throw new ApiError("unauthorized", "Wrong email or password");
      await answer(res, 200, user);
    },
    "get /auth/me": async (input, res) => {
      const user = await db.user.findUnique({ where: { id: requireUserId(input) } });
      if (!user) throw new ApiError("unauthorized", "The token's user no longer exists");
      res.json(toUser(user));
    },
  };
}
