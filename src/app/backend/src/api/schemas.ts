import { z } from "zod";

// The API's shapes (backend.md 3.1). Each named schema is also a component of the OpenAPI document.

const timestamp = z.iso.datetime();

export const User = z.object({ id: z.string(), email: z.email(), createdAt: timestamp });

export const Project = z.object({ id: z.string(), name: z.string(), createdAt: timestamp, updatedAt: timestamp });

export const Module = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

export const TestFile = z.object({
  id: z.string(),
  moduleId: z.string(),
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

export const Report = z.looseObject({}).meta({
  description: "Core's Report (report.md 3); screenshot and trace paths are relative to /runs/{runId}/files/",
});

export const Run = z.object({
  id: z.string(),
  testFileId: z.string().nullable().meta({ description: "null once the Test File is deleted" }),
  fileName: z.string(),
  status: RunStatus,
  createdAt: timestamp.meta({ description: "Trigger time" }),
  startedAt: timestamp.nullable(),
  finishedAt: timestamp.nullable(),
  durationMs: z.number().int().nullable(),
  summary: Summary.nullable(),
  error: z.string().nullable(),
  source: z.string().optional().meta({ description: "Only in GET /runs/{runId}" }),
  report: Report.optional().meta({ description: "Only in GET /runs/{runId}, once the Run has finished" }),
});

export const TreeTestFile = TestFile.omit({ source: true }).extend({ latestRunStatus: RunStatus.nullable() });
export const TreeModule = Module.extend({ testFiles: z.array(TreeTestFile) });
export const TreeProject = Project.extend({ modules: z.array(TreeModule) });

export const ErrorBody = z.object({
  error: z.object({
    code: z.enum([
      "invalid_request",
      "unauthorized",
      "not_found",
      "conflict",
      "too_large",
      "invalid_test",
      "not_implemented",
      "internal",
    ]),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

// Live Progress messages (backend.md 1.5), sent as JSON text frames.
export const LiveStep = z.object({
  index: z.number().int(),
  line: z.number().int(),
  action: z.string(),
  status: z.enum(["running", "passed", "failed"]),
  durationMs: z.number().int().optional(),
  locateMethod: z.enum(["selector", "visual", "dom"]).optional(),
  reason: z.string().optional().meta({ description: "Redacted by Core" }),
  screenshotUrl: z.string().optional().meta({ description: "/api/v1/runs/{runId}/files/screenshots/step-<index>.png" }),
});
export const LiveSnapshot = z.object({
  type: z.literal("snapshot"),
  run: Run.omit({ source: true, report: true }),
  steps: z.array(LiveStep),
});
export const LiveStatus = z.object({
  type: z.literal("status"),
  status: RunStatus,
  durationMs: z.number().int().optional().meta({ description: "On the final status only" }),
  summary: Summary.optional().meta({ description: "On the final status only" }),
});
export const LiveStepMessage = z.object({ type: z.literal("step"), step: LiveStep });
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
  Report,
  Run,
  TreeProject,
  ErrorBody,
  LiveMessage,
  LiveSnapshot,
  LiveStatus,
  LiveStepMessage,
  LiveStep,
};
