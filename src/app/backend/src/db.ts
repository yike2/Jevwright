import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export type Db = PrismaClient;

/** Creates the Prisma client over node-postgres; `schema` lets each integration test file use its own. */
export function createDb(connectionString: string, schema?: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }, schema ? { schema } : undefined) });
}
