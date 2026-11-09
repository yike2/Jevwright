import { z, type ZodType } from "zod";
import {
  Diagnostic,
  ErrorBody,
  InvalidTestError,
  Module,
  Project,
  Run,
  TestFile,
  TreeProject,
  User,
  ValidationError,
} from "./schemas.js";

export type Method = "get" | "post" | "put" | "patch" | "delete";

// How a route takes the login token: as a Bearer header, also as ?token= where a browser cannot set headers
// (<img>, download links), only as ?token= (WebSocket), or not at all.
export type Auth = "bearer" | "bearer-or-query" | "query" | "none";

export type Route = {
  method: Method;
  path: string; // Express syntax under /api/v1, e.g. /projects/:projectId
  summary: string;
  auth: Auth;
  description?: string;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: ZodType;
  responses: Record<number, { description: string; schema?: ZodType }>;
};

export const MAX_SOURCE_CHARS = 256 * 1024;

const id = z.uuid();
const name = z.string().trim().min(1).max(100);
const fileName = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/\.yaml$/, "Must end in .yaml");
const source = z.string().max(MAX_SOURCE_CHARS).meta({ description: "The .yaml source, at most 256 Ki characters" });
const variableName = z.string().regex(/^[A-Z_][A-Z0-9_]*$/, "Must be UPPER_SNAKE_CASE");
const credentials = z.object({ email: z.email(), password: z.string().min(8).max(200) });
const auth = z.object({ token: z.string().meta({ description: "JWT: send as Authorization: Bearer" }), user: User });
const saved = z.object({ testFile: TestFile, diagnostics: z.array(Diagnostic) });
const items = <T extends ZodType>(item: T) => z.object({ items: z.array(item) });

const ok = (description: string, schema?: ZodType) => ({ description, schema });
const error = (description: string) => ({ description, schema: ErrorBody });

/** Adds the error answers every route of its kind can give: 400 for input, 401 for auth, 404 for a path id. */
function route(spec: Route): Route {
  const common: Route["responses"] = {};
  if (spec.params || spec.query || spec.body) common[400] = ok("The request fails its schema", ValidationError);
  if (spec.auth !== "none") common[401] = error("No valid token");
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
    auth: "none",
    responses: { 200: ok("The server is up", z.object({ status: z.literal("ok") })) },
  }),
  route({
    method: "get",
    path: "/openapi.json",
    summary: "This OpenAPI document",
    auth: "none",
    responses: { 200: ok("OpenAPI 3.1 document") },
  }),
  route({
    method: "post",
    path: "/auth/register",
    summary: "Register with an email and a password",
    auth: "none",
    body: credentials,
    responses: { 201: ok("Registered and logged in", auth), 409: error("The email is taken") },
  }),
  route({
    method: "post",
    path: "/auth/login",
    summary: "Log in",
    auth: "none",
    body: credentials,
    responses: { 200: ok("Logged in", auth), 401: error("Wrong email or password") },
  }),
  route({
    method: "get",
    path: "/auth/me",
    summary: "The logged-in user",
    auth: "bearer",
    responses: { 200: ok("The user", User) },
  }),
  route({
    method: "get",
    path: "/tree",
    summary: "Every Project with its Modules and Test Files, for the sidebar and the files overview",
    auth: "bearer",
    responses: { 200: ok("Projects, without sources, each Test File with its latest Run", items(TreeProject)) },
  }),
  route({
    method: "get",
    path: "/projects",
    summary: "List Projects",
    auth: "bearer",
    responses: { 200: ok("Projects", items(Project)) },
  }),
  route({
    method: "post",
    path: "/projects",
    summary: "Create a Project",
    auth: "bearer",
    body: z.object({ name }),
    responses: { 201: ok("Created", Project), 409: error("The name is taken") },
  }),
  route({
    method: "patch",
    path: "/projects/:projectId",
    summary: "Rename a Project",
    auth: "bearer",
    params: projectParams,
    body: z.object({ name }),
    responses: { 200: ok("Renamed", Project), 409: error("The name is taken") },
  }),
  route({
    method: "delete",
    path: "/projects/:projectId",
    summary: "Delete a Project with its Modules, Test Files, and Variables; Runs are kept",
    auth: "bearer",
    params: projectParams,
    responses: { 204: ok("Deleted") },
  }),
  route({
    method: "get",
    path: "/projects/:projectId/variables",
    summary: "List the Project Variable names; values are never returned",
    auth: "bearer",
    params: projectParams,
    responses: { 200: ok("Names", items(variableName)) },
  }),
  route({
    method: "put",
    path: "/projects/:projectId/variables/:name",
    summary: "Set a Project Variable",
    auth: "bearer",
    params: z.object({ projectId: id, name: variableName }),
    body: z.object({ value: z.string().max(10_000) }),
    responses: { 204: ok("Set") },
  }),
  route({
    method: "delete",
    path: "/projects/:projectId/variables/:name",
    summary: "Delete a Project Variable",
    auth: "bearer",
    params: z.object({ projectId: id, name: variableName }),
    responses: { 204: ok("Deleted") },
  }),
  route({
    method: "get",
    path: "/projects/:projectId/modules",
    summary: "List a Project's Modules",
    auth: "bearer",
    params: projectParams,
    responses: { 200: ok("Modules", items(Module)) },
  }),
  route({
    method: "post",
    path: "/projects/:projectId/modules",
    summary: "Create a Module",
    auth: "bearer",
    params: projectParams,
    body: z.object({ name }),
    responses: { 201: ok("Created", Module), 409: error("The name is taken") },
  }),
  route({
    method: "patch",
    path: "/modules/:moduleId",
    summary: "Rename a Module",
    auth: "bearer",
    params: moduleParams,
    body: z.object({ name }),
    responses: { 200: ok("Renamed", Module), 409: error("The name is taken") },
  }),
  route({
    method: "delete",
    path: "/modules/:moduleId",
    summary: "Delete a Module with its Test Files; Runs are kept",
    auth: "bearer",
    params: moduleParams,
    responses: { 204: ok("Deleted") },
  }),
  route({
    method: "get",
    path: "/modules/:moduleId/test-files",
    summary: "List a Module's Test Files",
    auth: "bearer",
    params: moduleParams,
    responses: { 200: ok("Test Files, without sources", items(TestFile)) },
  }),
  route({
    method: "post",
    path: "/modules/:moduleId/test-files",
    summary: "Create a Test File, from the editor or an uploaded .yaml; saved even with diagnostics",
    auth: "bearer",
    params: moduleParams,
    body: z.object({ name: fileName, source }),
    responses: { 201: ok("Created, with the source's diagnostics", saved), 409: error("The name is taken") },
  }),
  route({
    method: "post",
    path: "/test-files/validate",
    summary: "Analyze a source without saving it",
    auth: "bearer",
    body: z.object({ source }),
    responses: { 200: ok("The diagnostics; empty when valid", z.object({ diagnostics: z.array(Diagnostic) })) },
  }),
  route({
    method: "get",
    path: "/test-files/:testFileId",
    summary: "A Test File with its source",
    auth: "bearer",
    params: testFileParams,
    responses: { 200: ok("The Test File", TestFile) },
  }),
  route({
    method: "patch",
    path: "/test-files/:testFileId",
    summary: "Rename, move to another Module, or change the source of a Test File; saved even with diagnostics",
    auth: "bearer",
    params: testFileParams,
    body: z.object({ name: fileName.optional(), moduleId: id.optional(), source: source.optional() }),
    responses: {
      200: ok("Saved, with the source's diagnostics", saved),
      404: error("No such Test File, or no such target Module, for this user"),
      409: error("The name is taken in the target Module"),
    },
  }),
  route({
    method: "delete",
    path: "/test-files/:testFileId",
    summary: "Delete a Test File; its Runs are kept",
    auth: "bearer",
    params: testFileParams,
    responses: { 204: ok("Deleted") },
  }),
  route({
    method: "post",
    path: "/test-files/:testFileId/runs",
    summary: "Trigger a Run of the Test File's current source",
    auth: "bearer",
    params: testFileParams,
    responses: {
      202: ok("Queued; follow it on /runs/{runId}/live", Run),
      422: ok("The source has diagnostics", InvalidTestError),
    },
  }),
  route({
    method: "get",
    path: "/runs",
    summary: "Runs, newest first, filtered by Test File or Project",
    description: "Pass the previous answer's `nextCursor` as `cursor` for the next page.",
    auth: "bearer",
    query: z.object({
      testFileId: id.optional(),
      projectId: id.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      cursor: z.string().optional(),
    }),
    responses: {
      200: ok(
        "A page of Runs, without source and report",
        z.object({
          items: z.array(Run),
          nextCursor: z.string().nullable().meta({ description: "null on the last page" }),
        }),
      ),
    },
  }),
  route({
    method: "get",
    path: "/runs/:runId",
    summary: "A Run with its source and Report",
    auth: "bearer",
    params: runParams,
    responses: { 200: ok("The Run", Run) },
  }),
  route({
    method: "get",
    path: "/runs/:runId/files/*path",
    summary: "A Run File: report.json, trace.zip, or screenshots/step-<index>.png",
    description: "Takes the token as ?token= too, so <img src> and download links work.",
    auth: "bearer-or-query",
    params: z.object({ runId: id, path: z.string().meta({ description: "e.g. screenshots/step-0.png" }) }),
    responses: { 200: ok("The file, with its content type") },
  }),
  route({
    method: "get",
    path: "/runs/:runId/live",
    summary: "Live Progress of a Run (WebSocket)",
    description: [
      "Open with a WebSocket upgrade; browsers cannot set headers on a WebSocket, so the login token goes in `token`.",
      "The server sends JSON text frames, each a `LiveMessage`: first one `LiveSnapshot` with the Run and all its steps,",
      "then a `LiveStepMessage` as each step starts or finishes and a `LiveStatus` when the Run changes status.",
      "It closes after the Run's final status; a Run that has already finished gets the snapshot and closes.",
      "Close codes: 4401 bad token, 4404 not this user's Run.",
    ].join(" "),
    auth: "query",
    params: runParams,
    responses: { 101: ok("Switching Protocols; then LiveMessage frames") },
  }),
];
