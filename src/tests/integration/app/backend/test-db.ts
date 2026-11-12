import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe } from "vitest";
import { createDb, type Db } from "@/app/backend/src/db.js";

const BACKEND_DIR = fileURLToPath(new URL("../../../../app/backend/", import.meta.url));

/** Integration tests that need PostgreSQL are skipped without DATABASE_URL (backend.md 5). */
export const describeDb = describe.skipIf(!process.env.DATABASE_URL);

/**
 * Gives a test file its own schema, migrated with `prisma migrate deploy`, and empties it before each test.
 * Call it at the top of a describeDb block; `db()` is ready inside the tests.
 */
export function useTestDb(schema: string): () => Db {
  let db: Db | undefined;
  beforeAll(() => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    url.searchParams.set("schema", schema);
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: BACKEND_DIR,
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: "pipe",
    });
    db = createDb(process.env.DATABASE_URL ?? "", schema);
  }, 60_000);
  // Every row hangs off a User, so deleting the users empties every table.
  beforeEach(async () => void (await db?.user.deleteMany()));
  afterAll(async () => db?.$disconnect());
  return () => {
    if (!db) throw new Error("useTestDb: the database is not ready");
    return db;
  };
}
