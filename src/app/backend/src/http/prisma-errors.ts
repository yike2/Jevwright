import { Prisma } from "../generated/prisma/client.js";

/** Whether a Prisma write failed on a unique constraint, which the API answers as 409. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
