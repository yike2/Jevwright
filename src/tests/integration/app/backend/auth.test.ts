import request from "supertest";
import { expect, it } from "vitest";
import { ROUTES } from "@/app/backend/src/api/contract.js";
import { signToken } from "@/app/backend/src/auth/token.js";
import { createTestApp, createUser } from "./test-app.js";
import { describeDb, useTestDb } from "./test-db.js";

const ANY_ID = "6f1c2a4e-9b3d-4c5e-8f7a-1b2c3d4e5f60";
const credentials = { email: "Ada@Example.com", password: "correct horse" };

describeDb("auth routes", () => {
  const db = useTestDb("test_auth");
  const app = () => createTestApp(db());
  const register = (body = credentials) => request(app()).post("/api/v1/auth/register").send(body);

  it("registers a user, answering a token and the user without the password", async () => {
    const res = await register();

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      token: expect.any(String),
      user: { id: expect.any(String), email: "ada@example.com", createdAt: expect.any(String) },
    });
    const stored = await db().user.findUniqueOrThrow({ where: { id: res.body.user.id } });
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });

  it("answers 409 for an email that is taken, in any case", async () => {
    await register();

    const res = await register({ ...credentials, email: "ADA@example.COM" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("conflict");
  });

  it("logs in with the right password, in any email case", async () => {
    const registered = await register();

    const res = await request(app())
      .post("/api/v1/auth/login")
      .send({ email: "ada@EXAMPLE.com", password: credentials.password });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: expect.any(String), user: registered.body.user });
  });

  it("answers 401 for a wrong password and for an unknown email alike", async () => {
    await register();

    const wrong = await request(app())
      .post("/api/v1/auth/login")
      .send({ ...credentials, password: "battery staple" });
    const unknown = await request(app())
      .post("/api/v1/auth/login")
      .send({ ...credentials, email: "bob@example.com" });

    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("unauthorized");
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("answers the token's user on /auth/me", async () => {
    const registered = await register();

    const res = await request(app()).get("/api/v1/auth/me").set("authorization", `Bearer ${registered.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(registered.body.user);
  });

  it("answers 401 on /auth/me without a token, with a bad one, or for a user that no longer exists", async () => {
    const { user, token } = await createUser(db());
    const other = await signToken(user.id, "another-secret-".padEnd(32, "y"));
    await db().user.delete({ where: { id: user.id } });

    for (const header of [undefined, "Bearer not-a-jwt", `Bearer ${other}`, `Bearer ${token}`, token]) {
      const req = request(app()).get("/api/v1/auth/me");
      const res = await (header === undefined ? req : req.set("authorization", header));
      expect(res.status, String(header)).toBe(401);
      expect(res.body.error.code).toBe("unauthorized");
    }
  });

  it("answers 401 without a token on every route that takes one", async () => {
    for (const route of ROUTES.filter((route) => route.auth === "bearer" || route.auth === "bearer-or-query")) {
      const path = route.path.replace(/:\w+/g, ANY_ID).replace("*path", "report.json");
      const res = await request(app())[route.method](`/api/v1${path}`).send({});

      expect(res.status, `${route.method} ${route.path}`).toBe(401);
    }
  });

  it("checks the token before the request's schema", async () => {
    const res = await request(app()).post("/api/v1/projects").send({ name: "" });

    expect(res.status).toBe(401);
  });

  it("takes ?token= on Run Files only, not on Bearer routes", async () => {
    const { token } = await createUser(db());

    const me = await request(app()).get(`/api/v1/auth/me?token=${token}`);
    const file = await request(app()).get(`/api/v1/runs/${ANY_ID}/files/report.json?token=${token}`);

    expect(me.status).toBe(401);
    expect(file.status).not.toBe(401);
  });
});
