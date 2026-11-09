import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "@/app/backend/src/app.js";

const app = createApp({ corsOrigin: "http://localhost:3000", handlers: {} });

describe("the backend app", () => {
  it("answers the health check without a token", async () => {
    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("serves the OpenAPI document and Swagger UI", async () => {
    const json = await request(app).get("/api/v1/openapi.json");
    const docs = await request(app).get("/api/v1/docs/");

    expect(json.status).toBe(200);
    expect(json.body.openapi).toBe("3.1.0");
    expect(docs.status).toBe(200);
    expect(docs.text).toContain("swagger-ui");
  });

  it("answers 501 for a contract route that has no handler yet", async () => {
    const res = await request(app).get("/api/v1/projects");

    expect(res.status).toBe(501);
    expect(res.body).toEqual({ error: { code: "not_implemented", message: "GET /projects is not implemented yet" } });
  });

  it("answers 400 with the zod issues when a body fails its schema, before the handler", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({ email: "not-an-email", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
    expect(res.body.error.details.map((issue: { path: string[] }) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["body.email", "body.password"]),
    );
  });

  it("answers 400 for a body that is not JSON", async () => {
    const res = await request(app).post("/api/v1/auth/login").set("content-type", "application/json").send("{");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("answers 413 for a body over the size limit", async () => {
    const res = await request(app)
      .post("/api/v1/test-files/validate")
      .send({ source: "a".repeat(400 * 1024) });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("too_large");
  });

  it("answers 404 in the error format for an unknown route", async () => {
    const res = await request(app).get("/api/v1/nothing-here");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "GET /api/v1/nothing-here does not exist" } });
  });

  it("allows the frontend's origin through CORS, with the Authorization header", async () => {
    const res = await request(app)
      .options("/api/v1/projects")
      .set("origin", "http://localhost:3000")
      .set("access-control-request-method", "POST")
      .set("access-control-request-headers", "authorization,content-type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(res.headers["access-control-allow-headers"]).toMatch(/authorization/i);
  });

  it("calls the handler a route has, with the parsed params and body", async () => {
    const withHandler = createApp({
      corsOrigin: "http://localhost:3000",
      handlers: {
        "post /projects/:projectId/modules": ({ params, body }, res) => {
          res.status(201).json({ params, body });
        },
      },
    });

    const res = await request(withHandler).post("/api/v1/projects/p1/modules").send({ name: "Checkout" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ params: { projectId: "p1" }, body: { name: "Checkout" } });
  });
});
