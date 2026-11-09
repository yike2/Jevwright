import { z, type ZodType } from "zod";
import { Diagnostic, ErrorBody, Module, Project, Run, TestFile, TreeProject, User } from "./schemas.js";

export type Method = "get" | "post" | "put" | "patch" | "delete";

export type Route = {
  method: Method;
  path: string; // Express syntax under /api/v1, e.g. /projects/:projectId
  summary: string;
  auth: boolean;
  description?: string;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: ZodType;
  responses: Record<number, { description: string; schema?: ZodType }>;
};

const id = z.string().min(1);
const name = z.string().trim().min(1).max(100);
const fileName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/\.yaml$/, "Must end in .yaml");
const source = z.string().meta({ description: "The .yaml source, at most 256 KiB" });
const credentials = z.object({ email: z.email(), password: z.string().min(8).max(200) });
const auth = z.object({ token: z.string().meta({ description: "JWT for Authorization: Bearer" }), user: User });
const saved = z.object({ testFile: TestFile, diagnostics: z.array(Diagnostic) });

const ok = (description: string, schema?: ZodType) => ({ description, schema });
const error = (description: string) => ({ description, schema: ErrorBody });

/** Adds the error answers every route of its kind can give: 400 for input, 401 for auth, 404 for a path id. */
function route(spec: Route): Route {
  const common: Route["responses"] = {};
  if (spec.params || spec.query || spec.body) common[400] = error("The request fails its schema");
  if (spec.auth) common[401] = error("No valid token");
  if (spec.params) common[404] = error("No such resource for this user");
  return { ...spec, responses: { ...common, ...spec.responses } };
}

const projectParams = z.object({ projectId: id });
const moduleParams = z.object({ moduleId: id });
const testFileParams = z.object({ testFileId: id });
const runParams = z.object({ runId: id });

/** Every REST route of backend.md 3.1, the single source of the API's validation and OpenAPI document. */
export const ROUTES: readonly Route[] = [
  route({
    method: "get",
    path: "/health",
    summary: "Health check",
    auth: false,
    responses: { 200: ok("The server is up", z.object({ status: z.literal("ok") })) },
  }),
  route({
    method: "get",
    path: "/openapi.json",
    summary: "This OpenAPI document",
    auth: false,
    responses: { 200: ok("OpenAPI 3.1 document") },
  }),
  route({
    method: "post",
    path: "/auth/register",
    summary: "Register with an email and a password",
    auth: false,
    body: credentials,
    responses: { 201: ok("Registered and logged in", auth), 409: error("The email is taken") },
  }),
  route({
    method: "post",
    path: "/auth/login",
    summary: "Log in",
    auth: false,
    body: credentials,
    responses: { 200: ok("Logged in", auth), 401: error("Wrong email or password") },
  }),
  route({
    method: "get",
    path: "/auth/me",
    summary: "The logged-in user",
    auth: true,
    responses: { 200: ok("The user", z.object({ user: User })) },
  }),
  route({
    method: "get",
    path: "/tree",
    summary: "Every Project with its Modules and Test Files, for the sidebar",
    auth: true,
    responses: { 200: ok("Projects, without sources", z.array(TreeProject)) },
  }),
  route({
    method: "get",
    path: "/projects",
    summary: "List Projects",
    auth: true,
    responses: { 200: ok("Projects", z.array(Project)) },
  }),
  route({
    method: "post",
    path: "/projects",
    summary: "Create a Project",
    auth: true,
    body: z.object({ name }),
    responses: { 201: ok("Created", Project), 409: error("The name is taken") },
  }),
  route({
    method: "patch",
    path: "/projects/:projectId",
    summary: "Rename a Project",
    auth: true,
    params: projectParams,
    body: z.object({ name }),
    responses: { 200: ok("Renamed", Project), 409: error("The name is taken") },
  }),
  route({
    method: "delete",
    path: "/projects/:projectId",
    summary: "Delete a Project with its Modules, Test Files, and Variables; Runs are kept",
    auth: true,
    params: projectParams,
    responses: { 204: ok("Deleted") },
  }),
  route({
    method: "get",
    path: "/projects/:projectId/variables",
    summary: "List the Project Variable names; values are never returned",
    auth: true,
    params: projectParams,
    responses: { 200: ok("Names", z.object({ names: z.array(z.string()) })) },
  }),
  route({
    method: "put",
    path: "/projects/:projectId/variables/:name",
    summary: "Set a Project Variable",
    auth: true,
    params: z.object({ projectId: id, name: z.string().regex(/^[A-Z_][A-Z0-9_]*$/) }),
    body: z.object({ value: z.string().max(10_000) }),
    responses: { 204: ok("Set") },
  }),
  route({
    method: "delete",
    path: "/projects/:projectId/variables/:name",
    summary: "Delete a Project Variable",
    auth: true,
    params: z.object({ projectId: id, name: z.string() }),
    responses: { 204: ok("Deleted") },
  }),
  route({
    method: "get",
    path: "/projects/:projectId/modules",
    summary: "List a Project's Modules",
    auth: true,
    params: projectParams,
    responses: { 200: ok("Modules", z.array(Module)) },
  }),
  route({
    method: "post",
    path: "/projects/:projectId/modules",
    summary: "Create a Module",
    auth: true,
    params: projectParams,
    body: z.object({ name }),
    responses: { 201: ok("Created", Module), 409: error("The name is taken") },
  }),
  route({
    method: "patch",
    path: "/modules/:moduleId",
    summary: "Rename a Module",
    auth: true,
    params: moduleParams,
    body: z.object({ name }),
    responses: { 200: ok("Renamed", Module), 409: error("The name is taken") },
  }),
  route({
    method: "delete",
    path: "/modules/:moduleId",
    summary: "Delete a Module with its Test Files; Runs are kept",
    auth: true,
    params: moduleParams,
    responses: { 204: ok("Deleted") },
  }),
  route({
    method: "get",
    path: "/modules/:moduleId/test-files",
    summary: "List a Module's Test Files",
    auth: true,
    params: moduleParams,
    responses: { 200: ok("Test Files, without sources", z.array(TestFile)) },
  }),
  route({
    method: "post",
    path: "/modules/:moduleId/test-files",
    summary: "Create a Test File; saved even with diagnostics",
    auth: true,
    params: moduleParams,
    body: z.object({ name: fileName, source }),
    responses: {
      201: ok("Created, with the source's diagnostics", saved),
      409: error("The name is taken"),
      413: error("The source is over 256 KiB"),
    },
  }),
  route({
    method: "post",
    path: "/test-files/validate",
    summary: "Analyze a source without saving it",
    auth: true,
    body: z.object({ source }),
    responses: {
      200: ok("The diagnostics; empty when valid", z.object({ diagnostics: z.array(Diagnostic) })),
      413: error("The source is over 256 KiB"),
    },
  }),
  route({
    method: "get",
    path: "/test-files/:testFileId",
    summary: "A Test File with its source",
    auth: true,
    params: testFileParams,
    responses: { 200: ok("The Test File", TestFile) },
  }),
  route({
    method: "patch",
    path: "/test-files/:testFileId",
    summary: "Rename a Test File or change its source; saved even with diagnostics",
    auth: true,
    params: testFileParams,
    body: z.object({ name: fileName.optional(), source: source.optional() }),
    responses: {
      200: ok("Saved, with the source's diagnostics", saved),
      409: error("The name is taken"),
      413: error("The source is over 256 KiB"),
    },
  }),
  route({
    method: "delete",
    path: "/test-files/:testFileId",
    summary: "Delete a Test File; its Runs are kept",
    auth: true,
    params: testFileParams,
    responses: { 204: ok("Deleted") },
  }),
  route({
    method: "post",
    path: "/test-files/:testFileId/runs",
    summary: "Trigger a Run of the Test File's current source",
    auth: true,
    params: testFileParams,
    responses: {
      202: ok("Queued; follow it on /runs/{runId}/live", Run),
      422: error("The source has diagnostics; details lists them"),
    },
  }),
  route({
    method: "get",
    path: "/test-files/:testFileId/runs",
    summary: "The Test File's Runs, newest first",
    auth: true,
    params: testFileParams,
    responses: { 200: ok("Runs, without source and report", z.array(Run)) },
  }),
  route({
    method: "get",
    path: "/runs/:runId",
    summary: "A Run with its source and Report",
    auth: true,
    params: runParams,
    responses: { 200: ok("The Run", Run) },
  }),
  route({
    method: "get",
    path: "/runs/:runId/files/*path",
    summary: "A Run File: report.json, trace.zip, or screenshots/step-<index>.png",
    auth: true,
    params: z.object({ runId: id, path: z.string().meta({ description: "e.g. screenshots/step-0.png" }) }),
    responses: { 200: ok("The file, with its content type") },
  }),
  route({
    method: "get",
    path: "/runs/:runId/live",
    summary: "Live Progress of a Run (WebSocket)",
    description: [
      "Open with a WebSocket upgrade; browsers cannot set headers on a WebSocket, so the JWT goes in `token`.",
      "The server sends JSON text frames, each a `LiveMessage`: first one `LiveSnapshot` with the Run and its steps so far,",
      "then a `LiveStepMessage` as each step starts or finishes and a `LiveStatus` when the Run's status changes.",
      "It closes after the final status. Close codes: 4401 bad token, 4404 not this user's Run.",
    ].join(" "),
    auth: false,
    params: runParams,
    query: z.object({ token: z.string() }),
    responses: { 101: ok("Switching Protocols; then LiveMessage frames") },
  }),
];
