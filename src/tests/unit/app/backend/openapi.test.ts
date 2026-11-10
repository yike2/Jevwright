import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROUTES } from "@/app/backend/src/api/contract.js";
import { buildOpenApi } from "@/app/backend/src/openapi.js";

const doc = buildOpenApi();
const operation = (path: string, method: string) =>
  (doc.paths as Record<string, Record<string, Record<string, unknown>>>)[path]?.[method];

describe("buildOpenApi", () => {
  it("is an OpenAPI 3.1 document with its required info, under /api/v1, with Bearer auth", () => {
    expect(doc).toMatchObject({
      openapi: "3.1.0",
      info: { title: "Jevwright API", version: expect.any(String) },
      servers: [{ url: "/api/v1" }],
      components: {
        securitySchemes: {
          bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          token: { type: "apiKey", in: "query", name: "token" },
        },
      },
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

  it("asks for the login token as a Bearer header, or as ?token= where a browser cannot set headers", () => {
    const open = ROUTES.filter((r) => r.auth === "none").map((r) => `${r.method} ${r.path}`);

    expect(open.sort()).toEqual(["get /health", "get /openapi.json", "post /auth/login", "post /auth/register"]);
    expect(operation("/projects", "get")?.security).toEqual([{ bearer: [] }]);
    expect(operation("/runs/{runId}/files/{path}", "get")?.security).toEqual([{ bearer: [] }, { token: [] }]);
    expect(operation("/runs/{runId}/live", "get")?.security).toEqual([{ token: [] }]);
    expect(operation("/health", "get")?.security).toEqual([]);
  });

  it("answers every list as { items }, and pages the Run list with limit, cursor, and nextCursor", () => {
    const lists = ["/tree", "/projects", "/projects/{projectId}/modules", "/modules/{moduleId}/test-files", "/runs"];
    const okSchema = (path: string) =>
      (
        operation(path, "get")?.responses as Record<
          string,
          { content: { "application/json": { schema: { properties: Record<string, unknown> } } } }
        >
      )["200"].content["application/json"].schema;

    for (const path of lists) expect(Object.keys(okSchema(path).properties)).toContain("items");
    expect(Object.keys(okSchema("/runs").properties)).toEqual(["items", "nextCursor"]);
    expect((operation("/runs", "get")?.parameters as { name: string }[]).map((p) => p.name).sort()).toEqual([
      "cursor",
      "limit",
      "projectId",
      "testFileId",
    ]);
  });

  it("types each error's details: field issues for 400, diagnostics for 422", () => {
    const errorOf = (path: string, method: string, status: string) =>
      JSON.stringify((operation(path, method)?.responses as Record<string, unknown>)[status]);

    expect(errorOf("/projects", "post", "400")).toContain('"path"');
    expect(errorOf("/test-files/{testFileId}/runs", "post", "422")).toContain('"line"');
  });

  it("describes steps the same way in the Report and in Live Progress, from pending to failed", () => {
    const steps = JSON.stringify(doc.components.schemas.Step);

    for (const status of ["pending", "running", "passed", "failed"]) expect(steps).toContain(`"${status}"`);
    expect(JSON.stringify(doc.components.schemas.Report)).toContain('"steps"');
    expect(JSON.stringify(doc.components.schemas.LiveSnapshot)).toContain('"steps"');
  });

  it("documents the Live Progress WebSocket, its ?token=, and each message it sends", () => {
    const live = operation("/runs/{runId}/live", "get");

    expect(live?.description).toMatch(/WebSocket/);
    expect(live?.security).toEqual([{ token: [] }]);
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(["LiveMessage", "LiveSnapshot", "LiveStatus", "LiveStepMessage", "Step"]),
    );
  });

  it("matches the exported docs/api/openapi.json; run pnpm api:docs after changing the contract", () => {
    const exported = readFileSync(new URL("../../../../../docs/api/openapi.json", import.meta.url), "utf8");

    expect(JSON.parse(exported)).toEqual(JSON.parse(JSON.stringify(doc)));
  });
});
