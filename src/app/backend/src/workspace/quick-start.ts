import type { Prisma } from "../generated/prisma/client.js";

export const QUICK_START_NAME = "Quick Start";

/** The Quick Start project every new account gets (backend.md 1.10), as a nested create of its Project. */
export function quickStartProject(demoAppUrl: string | undefined): Prisma.ProjectCreateWithoutUserInput {
  void demoAppUrl;
  return { name: "" };
}
