import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROUTES } from "@/app/backend/src/api/contract.js";
import { buildOpenApi } from "@/app/backend/src/openapi.js";

const doc = buildOpenApi();
const operation = (path: string, method: string) =>
  (doc.paths as Record<string, Record<string, Record<string, unknown>>>)[path]?.[method];

describe("buildOpenApi", () => {
  it("is an OpenAPI 3.1 document under /api/v1 with Bearer auth", () => {
    expect(doc).toMatchObject({
      openapi: "3.1.0",
      servers: [{ url: "/api/v1" }],
      components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
    });
  });

  it("lists every route of the contract, with Express parameters as {name}", () => {
    const listed = Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.keys(methods as object).map((method) => `${method} ${path}`),
    );

    expect(listed.sort()).toEqual(ROUTES.map((r) => `${r.method} ${r.path.replace(/[:*](\w+)/g, "{$1}")}`).sort());
    expect(operation("/runs/{runId}/files/{path}", "get")).toBeDefined();
  });

  it("describes a route's path parameters, body, and answers from its zod schemas", () => {
    const create = operation("/projects/{projectId}/modules", "post");

    expect(create?.parameters).toEqual([expect.objectContaining({ name: "projectId", in: "path", required: true })]);
    expect(create?.requestBody).toMatchObject({
      required: true,
      content: { "application/json": { schema: { type: "object", required: ["name"] } } },
    });
    expect(Object.keys(create?.responses as object).sort()).toEqual(["201", "400", "401", "404", "409"]);
  });

  it("asks for a Bearer token on every route except health, docs, register, login, and the WebSocket", () => {
    const open = ROUTES.filter((r) => !r.auth).map((r) => `${r.method} ${r.path}`);

    expect(open.sort()).toEqual([
      "get /health",
      "get /openapi.json",
      "get /runs/:runId/live",
      "post /auth/login",
      "post /auth/register",
    ]);
    expect(operation("/projects", "get")?.security).toEqual([{ bearer: [] }]);
    expect(operation("/health", "get")?.security).toEqual([]);
  });

  it("documents the Live Progress WebSocket and each message it sends", () => {
    const live = operation("/runs/{runId}/live", "get");

    expect(live?.description).toMatch(/WebSocket/);
    expect(live?.parameters).toContainEqual(expect.objectContaining({ name: "token", in: "query", required: true }));
    expect(Object.keys(doc.components.schemas).filter((name) => name.startsWith("Live"))).toEqual(
      expect.arrayContaining(["LiveMessage", "LiveSnapshot", "LiveStatus", "LiveStepMessage", "LiveStep"]),
    );
  });

  it("matches the exported docs/api/openapi.json; run pnpm api:docs after changing the contract", () => {
    const exported = readFileSync(new URL("../../../../../docs/api/openapi.json", import.meta.url), "utf8");

    expect(JSON.parse(exported)).toEqual(JSON.parse(JSON.stringify(doc)));
  });
});
