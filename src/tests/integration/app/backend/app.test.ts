import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "@/app/backend/src/app.js";

const USER_ID = "3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d";
const TOKEN = "good-token";
const BEARER = `Bearer ${TOKEN}`;
const base = {
  corsOrigin: "http://localhost:3000",
  verifyToken: async (token: string) => (token === TOKEN ? USER_ID : undefined),
};
const app = createApp({ ...base, handlers: {} });
const PROJECT_ID = "6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60";
const RUN_ID = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

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
    const res = await request(app).get("/api/v1/projects").set("authorization", BEARER);

    expect(res.status).toBe(501);
    expect(res.body).toEqual({ error: { code: "not_implemented", message: "GET /projects is not implemented yet" } });
  });

  it("answers 400 with each failing field, without calling the handler", async () => {
    const handler = vi.fn();
    const strict = createApp({ ...base, handlers: { "post /auth/register": handler } });

    const res = await request(strict).post("/api/v1/auth/register").send({ email: "not-an-email", password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
    expect(res.body.error.details.map((issue: { path: string }) => issue.path).sort()).toEqual([
      "body.email",
      "body.password",
    ]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers 400 with a message that says how to fix each field, in plain words", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({ email: "not-an-email", password: "short" });

    expect(res.body.error.details).toEqual([
      { path: "body.email", message: "Enter a valid email address." },
      { path: "body.password", message: "Password must be at least 8 characters." },
    ]);
    expect(res.body.error.message).toBe("Enter a valid email address. Password must be at least 8 characters.");
  });

  it("answers 400 with plain-word messages for names", async () => {
    const empty = await request(app).post("/api/v1/projects").set("authorization", BEARER).send({ name: "  " });
    const long = await request(app)
      .post("/api/v1/projects")
      .set("authorization", BEARER)
      .send({ name: "a".repeat(101) });

    expect(empty.body.error.message).toBe("Enter a name.");
    expect(long.body.error.message).toBe("Names can be at most 100 characters.");
  });

  it.each(["sign in.yaml", "login.yml", ".yaml", "a/b.yaml", "商店.yaml"])(
    "answers 400 for the Test File name %j, saying which characters a name can use",
    async (name) => {
      const res = await request(app)
        .post(`/api/v1/projects/${PROJECT_ID}/test-files`)
        .set("authorization", BEARER)
        .send({ name, source: "" });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe(
        "Test file names use only letters, digits, -, _ and ., with no spaces, and end in .yaml.",
      );
    },
  );

  it("answers 400 for a Variable name that is not UPPER_SNAKE_CASE, with an example", async () => {
    const res = await request(app)
      .put(`/api/v1/projects/${PROJECT_ID}/variables/base`)
      .set("authorization", BEARER)
      .send({ value: "x" });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe(
      "Variable names use capital letters, digits and _, and do not start with a digit, for example BASE_URL.",
    );
  });

  it("answers 404 not_found for a path id that is not a uuid, as for an id that does not exist", async () => {
    const res = await request(app).get("/api/v1/projects/p1/folders").set("authorization", BEARER);
    const run = await request(app).get("/api/v1/runs/not-a-uuid").set("authorization", BEARER);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "No such Project" } });
    expect(run.status).toBe(404);
    expect(run.body).toEqual({ error: { code: "not_found", message: "No such Run" } });
  });

  it("answers 413 too_large for a source over 256 Ki characters, saying the limit, without calling the handler", async () => {
    const handler = vi.fn();
    const sized = createApp({ ...base, handlers: { "post /test-files/validate": handler } });

    const res = await request(sized)
      .post("/api/v1/test-files/validate")
      .set("authorization", BEARER)
      .send({ source: "a".repeat(256 * 1024 + 1) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: "too_large", message: "The test file is too long: it can be at most 262,144 characters." },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("answers 413 too_large for a Variable value over 10,000 characters", async () => {
    const res = await request(app)
      .put(`/api/v1/projects/${PROJECT_ID}/variables/BASE`)
      .set("authorization", BEARER)
      .send({ value: "a".repeat(10_001) });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: "too_large", message: "A Variable value can be at most 10,000 characters." },
    });
  });

  it("keeps 400 for a field that is too long but not a size limit, like a name", async () => {
    const res = await request(app)
      .post("/api/v1/projects")
      .set("authorization", BEARER)
      .send({ name: "a".repeat(101) });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((issue: { path: string }) => issue.path)).toEqual(["body.name"]);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const res = await request(app).post("/api/v1/auth/login").set("content-type", "application/json").send("{");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });

  it("answers 413 for a body over the 1 MB limit", async () => {
    const res = await request(app)
      .post("/api/v1/test-files/validate")
      .set("authorization", BEARER)
      .send({ source: "a".repeat(1100 * 1024) });

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
      ...base,
      handlers: {
        "post /projects/:projectId/folders": ({ params, body }, res) => {
          res.status(201).json({ params, body });
        },
      },
    });

    const res = await request(withHandler)
      .post(`/api/v1/projects/${PROJECT_ID}/folders`)
      .set("authorization", BEARER)
      .send({ name: "Checkout" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ params: { projectId: PROJECT_ID }, body: { name: "Checkout" } });
  });

  it("sends no CORS headers to any other origin", async () => {
    const res = await request(app).get("/api/v1/health").set("origin", "https://evil.example");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("answers an unexpected error as a generic 500, without its message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = createApp({
      ...base,
      handlers: {
        "get /projects": () => {
          throw new Error("connection to db-secret-host failed");
        },
      },
    });

    const res = await request(failing).get("/api/v1/projects").set("authorization", BEARER);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "internal", message: "Internal server error" } });
  });

  it("hands a Run File handler the whole wildcard path", async () => {
    const files = createApp({
      ...base,
      handlers: { "get /runs/:runId/files/*path": ({ params }, res) => void res.json(params) },
    });

    const res = await request(files).get(`/api/v1/runs/${RUN_ID}/files/screenshots/step-0.png?token=${TOKEN}`);

    expect(res.body).toEqual({ runId: RUN_ID, path: "screenshots/step-0.png" });
  });

  it("answers 401 without calling the handler when the token is missing or bad", async () => {
    const handler = vi.fn();
    const guarded = createApp({ ...base, handlers: { "get /projects": handler } });

    const missing = await request(guarded).get("/api/v1/projects");
    const bad = await request(guarded).get("/api/v1/projects").set("authorization", "Bearer bad-token");

    expect(missing.status).toBe(401);
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands the handler the token's user id", async () => {
    const withUser = createApp({
      ...base,
      handlers: { "get /projects": ({ userId }, res) => void res.json({ userId }) },
    });

    const res = await request(withUser).get("/api/v1/projects").set("authorization", BEARER);

    expect(res.body).toEqual({ userId: USER_ID });
  });
});
