import { z } from "zod";

// The API's shapes (backend.md 3.1). Each named schema in COMPONENTS is also an OpenAPI component.

const timestamp = z.iso.datetime();
const id = z.uuid();

export const User = z.object({ id, email: z.email(), createdAt: timestamp });

export const Project = z.object({ id, name: z.string(), createdAt: timestamp, updatedAt: timestamp });

export const Module = z.object({ id, projectId: id, name: z.string(), createdAt: timestamp, updatedAt: timestamp });

export const TestFile = z.object({
  id,
  moduleId: id,
  name: z.string(),
  source: z.string().optional().meta({ description: "Only in GET /test-files/{testFileId}" }),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const Diagnostic = z.object({
  code: z.string().meta({ description: "E001–E008, see syntax-analyzer.md 3.3" }),
  message: z.string(),
  line: z.number().int().meta({ description: "1-based" }),
});

export const RunStatus = z.enum(["queued", "running", "passed", "failed"]);

export const Summary = z.object({
  total: z.number().int(),
  passed: z.number().int(),
  failed: z.number().int(),
  pending: z.number().int(),
});

const Dialog = z.object({
  type: z.enum(["alert", "confirm", "prompt", "beforeunload"]),
  message: z.string(),
  answer: z.enum(["accepted", "dismissed"]),
  expected: z.boolean().meta({ description: "false for a dialog the step did not expect" }),
});

// One step, as Core's Report has it (report.md 1.4), plus `running` for Live Progress.
const stepBase = { index: z.number().int(), line: z.number().int(), action: z.string() };
const ran = {
  ...stepBase,
  startedAt: timestamp,
  durationMs: z.number().int(),
  locateMethod: z.enum(["selector", "visual", "dom"]).optional().meta({ description: "Element actions only" }),
  dialogs: z.array(Dialog),
  screenshot: z
    .string()
    .optional()
    .meta({ description: "Path under /runs/{runId}/files/, e.g. screenshots/step-0.png" }),
};
export const Step = z
  .discriminatedUnion("status", [
    z.object({ ...stepBase, status: z.literal("pending") }),
    z.object({ ...stepBase, status: z.literal("running"), startedAt: timestamp }),
    z.object({ ...ran, status: z.literal("passed") }),
    z.object({ ...ran, status: z.literal("failed"), reason: z.string().meta({ description: "Redacted by Core" }) }),
  ])
  .meta({ description: "A step; `running` appears only in Live Progress" });

export const RunError = z.object({
  kind: z.enum(["timeout", "infrastructure", "interrupted", "internal"]),
  message: z.string().meta({ description: "Redacted; no Variable values" }),
});

export const Report = z.object({
  file: z.string(),
  name: z.string().meta({ description: "The TestCase name" }),
  status: z.enum(["passed", "failed"]),
  startedAt: timestamp,
  durationMs: z.number().int(),
  summary: Summary,
  steps: z.array(Step).meta({ description: "One per step, in order; never `running`" }),
  trace: z.string().optional().meta({ description: "trace.zip under /runs/{runId}/files/; absent when empty" }),
  error: z
    .object({ kind: z.enum(["timeout", "infrastructure"]), message: z.string() })
    .optional()
    .meta({ description: "Core's Run error; absent when the Run ended normally" }),
});

export const Run = z.object({
  id,
  testFileId: id.nullable().meta({ description: "null once the Test File is deleted" }),
  projectId: id.nullable().meta({ description: "null once the Project is deleted" }),
  moduleId: id.nullable().meta({ description: "null once the Module is deleted" }),
  fileName: z.string(),
  name: z.string().meta({ description: "The TestCase name from the source" }),
  status: RunStatus,
  createdAt: timestamp.meta({ description: "Trigger time" }),
  startedAt: timestamp.nullable(),
  finishedAt: timestamp.nullable(),
  durationMs: z.number().int().nullable(),
  summary: Summary.nullable(),
  error: RunError.nullable().meta({
    description: "Why the Run ended early: timeout, crash, restart, or a server error",
  }),
  source: z.string().optional().meta({ description: "Only in GET /runs/{runId}" }),
  report: Report.optional().meta({ description: "Only in GET /runs/{runId}, once the Run has finished" }),
});

const LatestRun = Run.pick({ id: true, status: true, createdAt: true });
export const TreeTestFile = TestFile.omit({ source: true }).extend({ latestRun: LatestRun.nullable() });
export const TreeModule = Module.extend({ testFiles: z.array(TreeTestFile) });
export const TreeProject = Project.extend({ modules: z.array(TreeModule) });

const errorCode = z.string().meta({
  description:
    "invalid_request, unauthorized, not_found, conflict, too_large, invalid_test, internal, not_implemented; more may be added",
});
export const ErrorBody = z.object({ error: z.object({ code: errorCode, message: z.string() }) });
export const ValidationError = z.object({
  error: z.object({
    code: z.literal("invalid_request"),
    message: z.string(),
    details: z.array(z.object({ path: z.string().meta({ description: "e.g. body.email" }), message: z.string() })),
  }),
});
export const InvalidTestError = z.object({
  error: z.object({ code: z.literal("invalid_test"), message: z.string(), details: z.array(Diagnostic) }),
});

// Live Progress messages (backend.md 1.5), sent as JSON text frames.
const LiveRun = Run.omit({ source: true, report: true });
export const LiveSnapshot = z.object({
  type: z.literal("snapshot"),
  run: LiveRun,
  steps: z.array(Step).meta({ description: "Every step of the source; not yet run ones are `pending`" }),
});
export const LiveStatus = z.object({
  type: z.literal("status"),
  run: LiveRun.meta({ description: "The Run after the change" }),
});
export const LiveStepMessage = z.object({ type: z.literal("step"), step: Step });
export const LiveMessage = z.discriminatedUnion("type", [LiveSnapshot, LiveStatus, LiveStepMessage]);

/** The schemas listed under components.schemas, by name. */
export const COMPONENTS = {
  User,
  Project,
  Module,
  TestFile,
  Diagnostic,
  RunStatus,
  Summary,
  Step,
  RunError,
  Report,
  Run,
  TreeProject,
  ErrorBody,
  ValidationError,
  InvalidTestError,
  LiveMessage,
  LiveSnapshot,
  LiveStatus,
  LiveStepMessage,
};
