import type { ZodType } from "zod";

export type Method = "get" | "post" | "put" | "patch" | "delete";

export type Route = {
  method: Method;
  path: string; // Express syntax under /api/v1, e.g. /projects/:projectId
  summary: string;
  auth: boolean;
  description?: string;
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
  responses: Record<number, { description: string; schema?: ZodType }>;
};

/** Every REST route of backend.md 3.1, the single source of the API's validation and OpenAPI document. */
export const ROUTES: readonly Route[] = [];
