import type { z } from "zod";
import type { Run as ApiRun } from "../api/schemas.js";
import type { Run } from "../generated/prisma/client.js";

/** The API's Run (api/schemas.ts) of a row; `detail` adds the source and the Report, for GET /runs/:runId. */
export function toRun(_run: Run, _detail = false): z.infer<typeof ApiRun> {
  throw new Error("not implemented");
}
