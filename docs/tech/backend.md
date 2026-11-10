# Backend

The Backend is one Express service that stores users' test files, runs them with Core on the server, streams each step's progress over WebSocket, and keeps every Run's report and screenshots. The Next.js frontend and External Agents use it only through its REST API.

## 1. Functional Definition

### 1.1 Terms

| Term | Meaning |
| ---- | ------- |
| **Project**, **Module**, **Test File** | The three levels of a user's workspace (PRD 5.3.2). A Test File holds the `.yaml` source |
| **Project Variable** | A name and value of a Project, passed to Core as a `{{NAME}}` Variable on every Run of the Project's Test Files |
| **Run** | One execution of a Test File on the server, with the source as it was when the Run was triggered |
| **Run Queue** | The in-process queue that starts queued Runs in trigger order, at most `RUN_CONCURRENCY` at a time |
| **Run Files** | A Run's report bundle on disk: `report.json`, `trace.zip`, and one screenshot per executed step |
| **Live Progress** | The WebSocket stream of one Run: its status and each step as it starts and finishes |

### 1.2 Accounts and Tokens

- A user registers and logs in with an email and a password of at least 8 characters. Emails are compared in lower case. Passwords are hashed with bcrypt (`bcryptjs`, cost 12) and never logged or returned.
- Register and login return a JWT (HS256, signed with `JWT_SECRET`, `sub` = user id, valid `TOKEN_TTL` = 7 days). The frontend, CI scripts, and External Agents all send it as `Authorization: Bearer <token>`. Run Files and Live Progress also take the same token as `?token=<jwt>`, because `<img>`, download links, and browser WebSockets cannot set headers. A token in a URL can end up in proxy logs; that is accepted to keep auth simple.
- Every route except register, login, health, and the API docs needs a valid token, or answers `401`. The token is checked before the request's schema, so a request without one answers `401`, not `400`.
- Every query is scoped to the token's user. Another user's Project, Module, Test File, or Run answers `404`, never `403`, so ids of other users' data are not revealed.
- There is no Run rate limit (PRD 4.3.7).

### 1.3 Workspace

| Rule | |
| ---- | - |
| Names | Project and Module names are 1–100 characters and unique within their parent. A Test File name ends in `.yaml` and is unique within its Module |
| Source size | A source is at most `MAX_SOURCE_CHARS` (262,144 characters); a longer one fails its schema with `400`. A request body over 1 MB answers `413` |
| Saving | A Test File is saved even when its source has diagnostics. Saving answers the Syntax Analyzer's `diagnostics`, so the editor can mark the lines |
| Validating | `POST /test-files/validate` analyzes a source without saving it |
| Moving | `PATCH /test-files/:id` with a `moduleId` moves the Test File to another of the user's Modules |
| Deleting | Deleting a Project deletes its Modules, Test Files, and Variables; deleting a Module deletes its Test Files. Runs are kept: their `testFileId`, `moduleId`, or `projectId` becomes `null`, and they keep their source, file name, and test name. `GET /runs?projectId=` still lists a deleted file's Runs while the Project exists |
| Variables | Names follow `[A-Z_][A-Z0-9_]*`. The API returns names only, never values |
| Order | Projects, Modules, Test Files, and Variable names are listed by name, in `/tree` as in their own lists |

### 1.4 Runs

1. `POST /test-files/:id/runs` analyzes the Test File's source. With diagnostics it answers `422` and the diagnostics; otherwise it stores a Run with status `queued`, a copy of the source, the file name, the TestCase `name`, and the Test File's Module and Project ids, and answers `202` with the Run.
2. The Run Queue starts queued Runs first in, first out, at most `RUN_CONCURRENCY` (default 1) at a time across all users. A Run waiting behind others stays `queued` (PRD 4.3.4).
3. A started Run becomes `running` and calls Core's `runTest()` with:
   - the Project Variables as `vars`;
   - `screenshotEveryStep: true`, so every executed step has a screenshot;
   - `network: "public"`, so the browser reaches only public addresses (1.6);
   - a Run Files store that writes the bundle to `RUNS_DIR/<runId>/`.
4. On each step event the Backend writes the step's screenshot to the Run Files right away and publishes the step on the Run's Live Progress.
5. When `runTest()` returns, the Run takes the Report's `status`, `durationMs`, step counts, and the whole Report; a Report `error` (Core's `timeout` or `infrastructure`, message already redacted) becomes the Run's `error`. When `runTest()` throws, the Run becomes `failed` with `error: { kind: "internal", message: <the error's name> }`; the error's message never reaches the API, since it may hold a Variable value.
6. At start-up, Runs still `queued` or `running` from a previous process become `failed` with `error: { kind: "interrupted", message: "Interrupted by a server restart" }`.

### 1.5 Live Progress

A client opens `GET /api/v1/runs/:runId/live?token=<jwt>` as a WebSocket. A bad token or another user's Run closes the socket with code `4401` or `4404`.

Steps have one shape everywhere: the `Step` schema, which is Core's Report step (`report.md` 1.4) with `pending`, `passed`, or `failed`, plus `running` (with `startedAt`) for a step in progress. The Report and Live Progress use it alike, so the live view and the history view render the same objects. A step's `screenshot` is a path under `/runs/:runId/files/`.

| Message | When | Fields |
| ------- | ---- | ------ |
| `snapshot` | On connect | `run` (the Run without `source` and `report`), `steps`: every step of the source, those not yet run as `pending` |
| `step` | A step starts (`running`) or finishes (`passed` or `failed`) | `step` |
| `status` | The Run's status changes | `run`, as it is after the change, with `durationMs`, `summary`, and `error` once final |

The snapshot comes from the Run's analyzed source and the steps so far, so a client that connects late misses nothing. The server closes the socket after the final `status`; for a Run that has already finished, after the snapshot. Steps a Run never reached stay `pending`.

### 1.6 Private Network Blocking

Users' tests run on the server, so a test could open `http://postgres:5432`, `http://localhost`, or a cloud metadata address and capture what it shows. With `network: "public"`, the Browser Adapter routes every request and WebSocket and aborts it unless its URL is `http:` or `https:` and every address its host resolves to is public: not loopback, private (RFC 1918, `fc00::/7`), link-local, carrier-grade NAT, unspecified, reserved, or multicast (`browser-adapter.md` 1.12). The step that made the request fails with Playwright's `net::ERR_FAILED` reason. This is not a sandbox (PRD 3.2 *Won't*): DNS rebinding between the check and Chromium's own lookup is not prevented, and since Playwright routes only the first request of a redirect chain, a public URL that redirects to a private address is followed.

The Benchmark Demo App therefore runs at a public address in production, for example `https://demo.<domain>`, set as the Project Variable `BASE`.

### 1.7 Errors

Every error answers JSON `{ "error": { "code": string, "message": string, "details"?: ... } }`. Only `400` and `422` carry `details`. Clients should treat an unknown `code` like `internal`, since codes may be added:

| Status | Code | When |
| ------ | ---- | ---- |
| `400` | `invalid_request` | A body, query, or path parameter fails its zod schema, including a path id that is not a uuid; `details` is `{ path, message }[]`, with `path` like `body.email` |
| `401` | `unauthorized` | No token, a bad or expired token, or a wrong email or password at login |
| `404` | `not_found` | No such resource for this user |
| `409` | `conflict` | A duplicate email or name |
| `413` | `too_large` | A request body over 1 MB |
| `422` | `invalid_test` | A Run of a Test File with diagnostics; `details` is `Diagnostic[]` |
| `500` | `internal` | Anything else; the message is generic and the error is logged without request bodies |
| `501` | `not_implemented` | A route of the contract (3.1) whose handler is not built yet |

### 1.8 Configuration

Environment variables are validated with zod at start-up; a missing or invalid one stops the process before it listens. `.env.example` lists them.

| Variable | Default | Use |
| -------- | ------- | --- |
| `DATABASE_URL` | – | PostgreSQL connection for Prisma |
| `JWT_SECRET` | – | At least 32 characters |
| `OPENROUTER_API_KEY` | – | Jev, for every Run |
| `RUNS_DIR` | `./data/runs` | Run Files; a docker volume in production |
| `RUN_CONCURRENCY` | `1` | Runs at a time, 1–8 |
| `PORT` | `4000` | HTTP and WebSocket port |
| `CORS_ORIGIN` | – | The frontend's origin, allowed by CORS |

## 2. Internal Flow

```mermaid
sequenceDiagram
  participant F as Frontend / Agent
  participant A as REST API
  participant Q as Run Queue
  participant C as Core runTest()
  participant L as Live Progress
  participant D as Postgres + RUNS_DIR
  F->>A: POST /test-files/:id/runs
  A->>D: Run queued (source copy)
  A-->>F: 202 Run
  F->>L: WebSocket /runs/:id/live
  L-->>F: snapshot
  A->>Q: enqueue(runId)
  Q->>D: Run running
  Q->>C: runTest(source, vars, store, onEvent)
  C-->>Q: step events (+ screenshot)
  Q->>D: write screenshot
  Q->>L: step
  L-->>F: step (screenshot path)
  C-->>Q: Report
  Q->>D: Run passed/failed + Report
  Q->>L: final status
  L-->>F: status, close
```

1. A route checks the token, parses the request with zod, and queries Prisma scoped to the user.
2. Triggering a Run stores it and hands its id to the Run Queue; the HTTP request returns before the Run starts.
3. The Run Queue's worker loads the Run and the Project Variables, runs Core, and turns Core's step events into Run Files and Live Progress messages.
4. The Run's final row holds the summary and the Report; the history and report routes read only Postgres and `RUNS_DIR`.

## 3. External Interface

### 3.1 REST API

All routes are under `/api/v1`. Bodies are JSON, at most 1 MB. `api/contract.ts` lists every route with its zod schemas for params, query, body, and answers, and `api/schemas.ts` defines the shapes; they are the single source of the API. The app validates each request against them, and `GET /api/v1/openapi.json` is the OpenAPI 3.1 document built from them, served in Swagger UI at `GET /api/v1/docs`. The Live Progress messages are components of the same document (`LiveMessage` and the messages it unions). A route without a handler answers `501`, so the frontend can build against the whole contract before each route is implemented. `pnpm api:docs` exports the document to `docs/api/openapi.json`, which `docs/api/index.html` shows in Swagger UI on GitHub Pages (`https://yike2.github.io/Jevwright/api/`), so it can be read without running the backend; a test fails when the export is out of date.

Conventions every route follows:

| Rule | |
| ---- | - |
| Ids | uuid strings; a path id that is not one answers `400` |
| Times | ISO 8601 strings in UTC |
| Lists | `{ items }`; `GET /runs` adds `nextCursor` (`null` on the last page) and takes `limit` (1–100, default 20) and `cursor`. Runs are ordered by `createdAt`, newest first, then by `id`, so Runs created at the same time page without gaps; `nextCursor` is opaque, and a cursor the server did not give out answers `400` at `query.cursor` |
| Single resources | Answered bare, e.g. `Project`; wrapped only with data beside them, e.g. `{ testFile, diagnostics }`, `{ token, user }` |
| Names | camelCase fields; routes are plural kebab-case nouns |

| Method | Path | Body or query | Answer |
| ------ | ---- | ------------- | ------ |
| `GET` | `/health` | – | `200 { status: "ok" }`, no token |
| `POST` | `/auth/register` | `{ email, password }` | `201 { token, user }` |
| `POST` | `/auth/login` | `{ email, password }` | `200 { token, user }` |
| `GET` | `/auth/me` | – | `200 User` |
| `GET` | `/tree` | – | `200 { items: TreeProject[] }`: Modules and Test Files without sources, each Test File with its `latestRun` (`id`, `status`, `createdAt`) |
| `GET` / `POST` | `/projects` | `{ name }` | `200 { items: Project[] }` / `201 Project` |
| `PATCH` / `DELETE` | `/projects/:projectId` | `{ name }` | `200 Project` / `204` |
| `GET` | `/projects/:projectId/variables` | – | `200 { items: string[] }`, names only |
| `PUT` / `DELETE` | `/projects/:projectId/variables/:name` | `{ value }` | `204` / `204` |
| `GET` / `POST` | `/projects/:projectId/modules` | `{ name }` | `200 { items: Module[] }` / `201 Module` |
| `PATCH` / `DELETE` | `/modules/:moduleId` | `{ name }` | `200 Module` / `204` |
| `GET` / `POST` | `/modules/:moduleId/test-files` | `{ name, source }` | `200 { items: TestFile[] }` (no sources) / `201 { testFile, diagnostics }` |
| `GET` | `/test-files/:testFileId` | – | `200 TestFile` with `source` |
| `PATCH` / `DELETE` | `/test-files/:testFileId` | `{ name?, moduleId?, source? }` | `200 { testFile, diagnostics }` / `204` |
| `POST` | `/test-files/validate` | `{ source }` | `200 { diagnostics }` |
| `POST` | `/test-files/:testFileId/runs` | – | `202 Run`, or `422` |
| `GET` | `/runs` | `?testFileId=&projectId=&limit=&cursor=` | `200 { items: Run[], nextCursor }`, newest first, without `source` and `report` |
| `GET` | `/runs/:runId` | – | `200 Run` with `source` and `report` |
| `GET` | `/runs/:runId/files/*path` | Bearer or `?token=` | The Run File (`report.json`, `trace.zip`, `screenshots/step-<n>.png`); paths outside the Run's folder answer `404` |
| WebSocket | `/runs/:runId/live` | `?token=` | Live Progress (1.5) |

A `Run` carries its `testFileId`, `moduleId`, `projectId`, `fileName`, TestCase `name`, `status`, `createdAt` (trigger time), `startedAt`, `finishedAt`, `durationMs`, `summary`, and `error` (`{ kind, message }`: `timeout`, `infrastructure`, `interrupted`, or `internal`). `GET /runs/:runId` adds `source` and `report`. The full shapes are in `docs/api/openapi.json`. The Report is downloaded as JSON from `files/report.json`; there is no HTML export.

### 3.2 Core Changes

The Backend needs two options in Core, both off by default so the CLI keeps its behavior:

```ts
type RunTestOptions = {
  // ...existing fields
  screenshotEveryStep?: boolean; // Executor: a screenshot after every executed step, not only a failed one
  network?: "any" | "public";    // Browser Adapter: abort requests to non-public addresses (1.6)
};
```

With `screenshotEveryStep`, Core's passed steps carry a `screenshot` too, in their Step results, `finished` events, and the Report (`executor.md` 1.3, `report.md` 1.3). `network` is the Browser Adapter's private network blocking (`browser-adapter.md` 1.12).

### 3.3 Database

```mermaid
erDiagram
  User ||--o{ Project : owns
  User ||--o{ Run : triggers
  Project ||--o{ Module : has
  Project ||--o{ Variable : has
  Module ||--o{ TestFile : has
  TestFile |o--o{ Run : "ran as"
  User { uuid id PK; string email UK; string passwordHash; datetime createdAt }
  Project { uuid id PK; uuid userId FK; string name; datetime createdAt; datetime updatedAt }
  Variable { uuid id PK; uuid projectId FK; string name; string value }
  Module { uuid id PK; uuid projectId FK; string name; datetime createdAt; datetime updatedAt }
  TestFile { uuid id PK; uuid moduleId FK; string name; text source; datetime createdAt; datetime updatedAt }
  Run { uuid id PK; uuid userId FK; uuid testFileId FK "nullable"; uuid moduleId FK "nullable"; uuid projectId FK "nullable"; string fileName; string name; text source; enum status; datetime createdAt; datetime startedAt; datetime finishedAt; int durationMs; int total; int passed; int failed; int pending; string errorKind; string errorMessage; jsonb report }
```

Unique: `User.email`; `(Project.userId, name)`; `(Module.projectId, name)`; `(TestFile.moduleId, name)`; `(Variable.projectId, name)`. Index: `Run (testFileId, createdAt)`, `Run (projectId, createdAt)`, `Run (status)`. Screenshots and traces live only in `RUNS_DIR`, never in Postgres.

## 4. Class Architecture

### 4.1 Modules

| Module | Responsibility |
| ------ | -------------- |
| `main.ts` | Reads the env, connects Prisma, recovers interrupted Runs, starts HTTP and WebSocket |
| `env.ts` | The zod schema of 1.8 |
| `db.ts` | `createDb()`: the Prisma client over `@prisma/adapter-pg` |
| `app.ts` | `createApp(deps)`: Express app with CORS, JSON parsing, the API docs, every route of `ROUTES` token-checked, validated, and dispatched to its handler (or `501`) with the token's `userId`, and the error handler; deps (handlers, `verifyToken`) are injected for tests |
| `handlers.ts` | `createHandlers(deps)`: every implemented handler, keyed `"<method> <path>"` like `ROUTES` |
| `http/` | `errors.ts` (the `ApiError` type and handler of 1.7), `auth.ts` (the token middleware: Bearer, `?token=`, or both, per the route's `auth`), `prisma-errors.ts` (unique violations become `409`) |
| `auth/` | `password.ts` (bcrypt), `token.ts` (sign and verify with `jose`), `routes.ts` |
| `workspace/` | `routes.ts`: routes for projects, modules, test files, variables, and the tree; `owned.ts`: lookups scoped to the user (`404` otherwise) and the rows' API shapes |
| `runs/queue.ts` | `RunQueue`: FIFO with a concurrency limit, `enqueue(runId)`, and `idle()` for tests; a Run that throws is logged and the queue goes on |
| `runs/execute-run.ts` | `executeRun()`: runs one queued Run with Core, writes Run Files, updates the row, and publishes its progress to a `RunProgress` (the `LiveHub`); `recoverInterruptedRuns()` of 1.4 step 6, called by `main.ts` before the queue starts |
| `runs/to-run.ts` | The API's `Run` of a row: `toRun()` for lists, `toRunDetail()` with `source` and `report` |
| `runs/run-files.ts` | The disk `ReportStore`, `writeRunFile()` for each step's screenshot, and `resolveRunFile()`: a path that resolves outside `RUNS_DIR/<runId>/`, or to the folder itself, is rejected |
| `runs/live.ts` | `LiveHub`: per-Run state and subscribers; the WebSocket upgrade handler |
| `runs/routes.ts` | Trigger, history, run, and file routes |
| `api/schemas.ts` | The zod schemas of the API's shapes and Live Progress messages; the named ones become OpenAPI components |
| `api/contract.ts` | `ROUTES`: method, path, auth, and schemas of every route in 3.1 |
| `openapi.ts` | Builds the OpenAPI document from `ROUTES` and the components with `z.toJSONSchema` |
| `export-openapi.ts` | `pnpm api:docs`: writes the document to `docs/api/openapi.json` |

### 4.2 Directory Layout

`src/app/backend` is a pnpm workspace package with its own `package.json`; it imports Core through the root `@/core/...` path. It runs from source with `tsx`, like the CLI, so there is no compile step and `tsx` resolves `@/` from the root `tsconfig.json`.

```text
src/app/backend/
├── package.json         # express, ws, zod, @prisma/client, jose, bcryptjs, swagger-ui-express
├── Dockerfile           # FROM the Playwright image; prisma migrate deploy, then pnpm start (tsx, no build step)
├── prisma.config.ts     # Prisma 7 config: schema, migrations, DATABASE_URL
├── prisma/
│   ├── schema.prisma    # generator "prisma-client", output src/generated/prisma
│   └── migrations/      # committed; applied with prisma migrate deploy
└── src/
    ├── generated/       # Prisma Client from prisma generate, run on pnpm install; not committed
    ├── main.ts
    ├── env.ts
    ├── db.ts
    ├── app.ts
    ├── openapi.ts
    ├── api/             # schemas.ts, contract.ts
    ├── http/
    ├── auth/
    ├── workspace/
    └── runs/
```

## 5. Test Plan

Integration tests need PostgreSQL: CI runs a `postgres` service container, and locally `docker compose -f compose.dev.yaml up -d postgres` starts one (`DATABASE_URL=postgresql://jevwright:jevwright@localhost:5432/jevwright`). Without `DATABASE_URL` they are skipped. Each test file migrates its own schema with `prisma migrate deploy` and empties it between tests by deleting every User, which cascades to every other row. Runs use a fake `JevClient` and local HTML fixtures, never the real Jev.

| Type | Coverage | Location |
| ---- | -------- | -------- |
| Unit | `env`: missing and invalid variables stop start-up | `src/tests/unit/app/backend/env.test.ts` |
| Unit | `password`, `token`: hash and verify, wrong password, expired and tampered tokens | `src/tests/unit/app/backend/auth/` |
| Unit | `RunQueue`: FIFO order, the concurrency limit, a failing Run does not stop the queue | `src/tests/unit/app/backend/runs/queue.test.ts` |
| Unit | `run-files`: paths outside the Run's folder rejected | `src/tests/unit/app/backend/runs/run-files.test.ts` |
| Unit | `LiveHub`: snapshot for a late subscriber, step and status messages, close after the final status | `src/tests/unit/app/backend/runs/live.test.ts` |
| Unit | Core: `screenshotEveryStep`, `network: "public"` address checks | `src/tests/unit/core/...` |
| Integration | Database: unique names per parent, cascade deletes, Runs kept with `null` ids | `src/tests/integration/app/backend/db.test.ts` |
| Integration | Auth: register, duplicate email, login, wrong password, `401` without or with a bad token | `src/tests/integration/app/backend/auth.test.ts` |
| Integration | Workspace: CRUD of every level, unique names, moving a Test File, cascade deletes, `404` for another user's data, saving a source with diagnostics, variables return names only | `src/tests/integration/app/backend/workspace.test.ts` |
| Integration | Runs: `422` for an invalid file, `202` and `queued`, a second Run stays `queued` while one runs, the final row and Report, Run errors, files served with Bearer or `?token=` and traversal rejected, `GET /runs` filters, order, and cursor paging, restart recovery | `src/tests/integration/app/backend/runs.test.ts` |
| Integration | Live Progress over a real WebSocket: snapshot with every step `pending`, `running` and finished steps with screenshots, final status, a finished Run's snapshot, `4401` and `4404` | `src/tests/integration/app/backend/live.test.ts` |
| Integration | Core with `network: "public"`: a page on `127.0.0.1` is blocked | `src/tests/integration/core/browser/` |
| Unit | OpenAPI: `info`, every route of `ROUTES` with `{name}` parameters, parameters and bodies from the schemas, Bearer and `?token=` security per route, `{ items }` lists and Run paging, typed error details, one `Step` shape for the Report and Live Progress, the Live Progress messages as components, `docs/api/openapi.json` up to date | `src/tests/unit/app/backend/openapi.test.ts` |
| Integration | App: health, OpenAPI and Swagger UI, `501` without a handler, `400` with `{ path, message }` details before the handler, a non-uuid id, an over-long source, bad JSON, `413` over 1 MB, `404` for an unknown route, CORS only for the frontend's origin, a generic `500`, a handler gets the parsed input and the whole files wildcard | `src/tests/integration/app/backend/app.test.ts` |
| E2E | Login → edit → validate → run → history through the frontend (Epic 6) | `src/tests/e2e/` |
