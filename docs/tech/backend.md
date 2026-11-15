# Backend

The Backend is one Express service that stores users' test files, runs them with Core on the server, streams each step's progress over WebSocket, and keeps every Run's report and screenshots. The Next.js frontend and External Agents use it only through its REST API.

## 1. Functional Definition

### 1.1 Terms

| Term | Meaning |
| ---- | ------- |
| **Project** | The top-level folder of a user's workspace (PRD 5.3.2), and level 1 of its folder levels |
| **Folder** | A folder in a Project or in another folder, at most level 4 counting the Project, so a path is at most `Project/a/b/c/file.yaml` |
| **Test File** | A `.yaml` source in a Project or in one of its folders, at any level |
| **Parent** | What a folder or Test File sits in: a folder, or the Project itself |
| **Path** | A Test File's folder names and file name from its Project down, joined with `/`, e.g. `checkout/wrong-total.yaml`; just the file name directly in the Project |
| **Project Variable** | A name and value of a Project, passed to Core as a `{{NAME}}` Variable on every Run of a Test File anywhere in the Project. Folders have no Variables |
| **Run** | One execution of a Test File on the server, with the source as it was when the Run was triggered |
| **Run Queue** | The in-process queue that starts queued Runs in trigger order, at most `RUN_CONCURRENCY` at a time |
| **Run Files** | A Run's report bundle on disk: `report.json`, `trace.zip`, and one screenshot per executed step |
| **Live Progress** | The WebSocket stream of one Run: its status and each step as it starts and finishes |

### 1.2 Accounts and Tokens

- A user registers and logs in with an email and a password of at least 8 characters. Emails are compared in lower case. Passwords are hashed with bcrypt (`bcryptjs`, cost 12) and never logged or returned.
- Register and login return a JWT (HS256, signed with `JWT_SECRET`, `sub` = user id). It never expires, which keeps auth simple: there is no refresh and no re-login. Logging out drops the token on the client; changing `JWT_SECRET` invalidates every token. The frontend, CI scripts, and External Agents all send it as `Authorization: Bearer <token>`. Run Files and Live Progress also take the same token as `?token=<jwt>`, because `<img>`, download links, and browser WebSockets cannot set headers. A token in a URL can end up in proxy logs; that is accepted to keep auth simple.
- Every route except register, login, health, and the API docs needs a valid token, or answers `401`. The token is checked before the request's schema, so a request without one answers `401`, not `400`.
- Every query is scoped to the token's user. Another user's Project, folder, Test File, or Run answers `404`, never `403`, so ids of other users' data are not revealed.
- There is no Run rate limit (PRD 4.3.7).

### 1.3 Workspace

| Rule | |
| ---- | - |
| Names | Project and folder names are 1–100 characters after trimming. A Test File name is 1–100 characters of letters, digits, `-`, `_`, and `.`, with no spaces, and ends in `.yaml`. Project names are unique per user. In one parent, no two folders and Test Files share a name, so a folder and a Test File cannot either (`A folder or test file with this name already exists in this folder.`, or `in this project.`); the API checks this before writing, and unique indexes on `(projectId, parentId, name)` and `(projectId, folderId, name)`, which treat a `null` parent as equal (`NULLS NOT DISTINCT`), keep two folders or two Test Files from racing for one name |
| Levels | A Project is level 1 and a folder one level below its parent; a folder can be at most level 4 (`MAX_LEVEL`, `workspace/folders.ts`). Creating a folder in a level-4 folder, or moving a folder where it or a folder inside it would be below level 4, answers `400` with `Folders can be at most 4 levels deep, counting the project.` Test Files can be at any level |
| Size limits | A source is at most `MAX_SOURCE_CHARS` (262,144 characters) and a Variable value at most 10,000 characters; a longer one answers `413`, like a request body over 1 MB |
| Saving | A Test File is saved even when its source has diagnostics. Saving (`POST` and `PATCH`) answers the saved Test File with its `source` and the Syntax Analyzer's `diagnostics`, so the editor shows and marks what was saved without reading it again |
| Validating | `POST /test-files/validate` analyzes a source without saving it |
| Moving | `PATCH /folders/:id` and `PATCH /test-files/:id` change a parent. `parentId` (a folder's) or `folderId` (a Test File's) names a folder of the user's, which brings its Project; with `projectId` and the folder `null` or absent, the row moves directly into that Project, which may be another one. A folder moves with every folder and Test File inside it. A move keeps every id, so a moved Test File keeps its Runs, and in another Project its next Runs read that Project's Variables. A move into the folder itself or one of its own folders answers `400` with `A folder cannot be moved into itself or into one of its own folders.`; a taken name `409`; a folder or Project the user does not own `404`; a refused move changes nothing |
| Deleting | Deleting a Project deletes its folders, Test Files, and Variables; deleting a folder deletes every folder and Test File inside it. Runs are kept: their `testFileId` or `projectId` becomes `null`, and they keep their source, file name, path, and test name. `GET /runs?projectId=` still lists a deleted file's Runs while the Project exists |
| Variables | Names follow `[A-Z_][A-Z0-9_]*`. The API lists each Variable with its value, for its owner only; the frontend masks values until the user shows one (frontend.md 1.8) |
| Order | Projects, folders, Test Files, and Variable names are listed by name, in `/tree` as in their own lists; in `/tree` each Project and folder has its `folders` and its `testFiles` |

### 1.4 Runs

1. `POST /test-files/:id/runs` analyzes the Test File's source. With diagnostics it answers `422` and the diagnostics; otherwise it stores a Run with status `queued`, a copy of the source, the file name, the file's path in its Project at that moment (`path`), the TestCase `name`, and the Test File's Project id, and answers `202` with the Run. A later rename, move, or delete changes neither.
2. The Run Queue starts queued Runs first in, first out, at most `RUN_CONCURRENCY` (default 1) at a time across all users. A Run waiting behind others stays `queued` (PRD 4.3.4).
3. A started Run becomes `running` and calls Core's `runTest()` with:
   - the Variables of the Project the Run was triggered in as `vars`, whatever folder the file is in;
   - `screenshotEveryStep: true`, so every executed step has a screenshot;
   - `network: "public"`, so the browser reaches only public addresses (1.6); `"any"` in dev mode;
   - `maxRunTimeoutMs: MAX_RUN_TIMEOUT_MS` (10 minutes), so one Run cannot hold the global queue for longer, whatever its `runTimeoutMs`; a Run cut short ends with a `timeout` error naming the cap;
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

The snapshot comes from the Run's analyzed source and the steps so far, so a client that connects late misses nothing; a finished Run's snapshot takes its steps from the Report. Messages sent while the snapshot is being built follow it, so a step may arrive once in the snapshot and once as a `step` message; a later message for the same step replaces the earlier one. Step messages keep Core's order: a step's finished message, sent once its screenshot is on disk, comes before the next step's `running`. The server closes the socket with `1000` after the final `status`; for a Run that has already finished, after the snapshot. Steps a Run never reached stay `pending`, as do the steps of a Run that ended without a Report (`interrupted` or `internal`). A plain `GET` without a WebSocket upgrade answers `400`, and a server error while subscribing closes with `1011`.

### 1.6 Private Network Blocking

Users' tests run on the server, so a test could open `http://postgres:5432`, `http://localhost`, or a cloud metadata address and capture what it shows. With `network: "public"`, the Browser Adapter routes every request and WebSocket and aborts it unless its URL is `http:` or `https:` and every address its host resolves to is public: not loopback, private (RFC 1918, `fc00::/7`), link-local, carrier-grade NAT, unspecified, reserved, or multicast (`browser-adapter.md` 1.12). The step that made the request fails with Playwright's `net::ERR_FAILED` reason.

That check has two gaps: DNS rebinding between the check and Chromium's own lookup, and redirects, since Playwright routes only the first request of a redirect chain, so a public URL that redirects to `http://backend:4000` would be followed. In production the network layer closes both. Runs drive a separate `browser` container (`BROWSER_ENDPOINT=ws://browser:3000/`) that runs Playwright's `run-server`. Its entry point, `browser-firewall.sh`, adds `iptables` and `ip6tables` rules that refuse every outgoing connection to the same ranges (`NON_PUBLIC_RANGES`), keeping only loopback (the server and Docker's DNS) and replies to the Backend's incoming connection open. It then starts the server as `pwuser` with no capabilities, so the browser cannot change the rules. However a page reaches a private address, the connection is refused (`net::ERR_CONNECTION_REFUSED`). The container shares only the `browser` network with the Backend, so it cannot even resolve `postgres`. This is still not a sandbox (PRD 3.2 *Won't*): a compromised browser can do anything a public client can. Without `BROWSER_ENDPOINT`, as in local development, Runs launch Chromium in the Backend's process with only the route check.

**Dev mode.** A frontend developer runs the Backend on their own machine against a local Demo App, which `network: "public"` would block. The development scripts (`pnpm backend`, and `pnpm dev` in `src/app/backend`) start it with `--dev`: its Runs use `network: "any"`, like the CLI. Dev mode is refused at start unless `HOST` is a loopback address (`127.0.0.1`, `::1`, `localhost`), so a backend whose Runs can open private addresses is never reachable from another machine. `pnpm start`, which the image runs, never passes `--dev`, so cloud Runs always use `network: "public"`.

The Benchmark Demo App therefore runs at a public address in production, for example `https://demo.<domain>`, set as the Project Variable `BASE`.

### 1.7 Errors

Every error answers JSON `{ "error": { "code": string, "message": string, "details"?: ... } }`. The status follows HTTP's meaning; `code` is the Backend's own name for the failure, which clients branch on, and `message` is for people. Only `400` and `422` carry `details`. Clients should treat an unknown `code` like `internal`, since codes may be added.

Messages are plain sentences that name the rule and how to meet it, never zod's wording or a field path: "Password must be at least 8 characters.", not `Too small: expected string to have >=8 characters`. Each schema rule in `api/contract.ts` carries its own message, and the frontend checks forms with the same words before sending (`frontend.md` 1.3):

| Status | Code | When |
| ------ | ---- | ---- |
| `400` | `invalid_request` | A body, query, or path parameter other than an id fails its zod schema, or a folder rule of 1.3 (levels, a move into itself) fails; `details` is `{ path, message }[]`, with `path` like `body.email` or `body.parentId`, and `message` joins the details' messages |
| `401` | `unauthorized` | No token, a bad token, or a wrong email or password at login |
| `404` | `not_found` | No such resource for this user, or a path id that is not a uuid, which names nothing (`No such Project`, `No such Run`, ...) |
| `409` | `conflict` | A duplicate email (`An account with this email already exists. Log in instead.`) or name (`A folder or test file with this name already exists in this folder.`) |
| `413` | `too_large` | A request body over 1 MB, or a field over its size limit (1.3); the message says the limit, e.g. `The test file is too long: it can be at most 262,144 characters.` A route lists its size-limited fields in the contract (`sizeLimited`), and a size limit wins over other schema failures |
| `422` | `invalid_test` | A Run of a Test File with diagnostics; `details` is `Diagnostic[]` |
| `500` | `internal` | Anything else; the message is generic and the error is logged without request bodies |
| `501` | `not_implemented` | A route of the contract (3.1) whose handler is not built yet |

### 1.8 Configuration

Environment variables are validated with zod at start-up; a missing or invalid one stops the process before it listens. `.env.example` lists them. A local backend also reads the repository's `.env` (`ENV_FILE`), wherever it starts, without overriding variables already set; the image has no `.env`, so in production compose sets them.

| Variable | Default | Use |
| -------- | ------- | --- |
| `DATABASE_URL` | – | PostgreSQL connection for Prisma |
| `JWT_SECRET` | – | At least 32 characters |
| `OPENROUTER_API_KEY` | – | Jev, for every Run |
| `RUNS_DIR` | `./data/runs` | Run Files; a docker volume in production |
| `RUN_CONCURRENCY` | `1` | Runs at a time, 1–8 |
| `PORT` | `4000` | HTTP and WebSocket port |
| `HOST` | `127.0.0.1` | Interface to listen on. The default keeps a local backend off the machine's network, since anyone who reaches it can register and run tests on the developer's OpenRouter key; the Docker image sets `0.0.0.0` for Caddy |
| `CORS_ORIGIN` | – | The frontend's origin, allowed by CORS |
| `BROWSER_ENDPOINT` | – | `ws://` URL of the browser container's run-server (1.6); without it, Runs launch Chromium locally |
| `DEMO_APP_URL` | – (dev mode: `http://127.0.0.1:8080`) | The `http(s)://` Demo App that new Quick Start projects take as their Variable `BASE` (1.10). Required, and an empty value counts as missing; dev mode, which runs next to the local Demo App, uses `http://127.0.0.1:8080` when it is missing. compose sets it: `https://<DEMO_DOMAIN>` in production, production's public Demo App in the preview |

### 1.9 Deployment

The Backend runs on the team's VPS with docker compose. `compose.yaml` and `Caddyfile` at the repository root hold the Backend's part; the frontend and the public Demo App add their own services and Caddy sites. The frontend and the API have separate domains, so the Backend keeps CORS for `CORS_ORIGIN`.

| Service | Image | Role |
| ------- | ----- | ---- |
| `postgres` | `postgres:17.9-alpine` | The database, on the `data` network only, with no published port; volume `postgres-data` |
| `backend` | Built from `src/app/backend/Dockerfile` | On the `data`, `web`, and `browser` networks; volume `runs` at `RUNS_DIR=/data/runs`; `BROWSER_ENDPOINT=ws://browser:3000/` |
| `browser` | Built from `src/app/backend/browser.Dockerfile` | The Playwright image with `iptables` and the same `playwright` version's `run-server`; `cap_add: [NET_ADMIN]` for its firewall only (1.6); on the `browser` network only; `shm_size: 1gb` for Chromium; limited to 2 GB of memory, 1.5 CPUs, and 1024 processes and threads, so one page cannot exhaust the server (a Run peaks near 500 MB and 80 threads). A browser over its memory limit is killed and restarted, and its Run fails with an `infrastructure` error |
| `caddy` | `caddy:2.11.2-alpine` | HTTPS for `API_DOMAIN`, proxied to `backend:4000`, WebSocket upgrades included; no access log, since URLs may carry `?token=`. It also serves the benchmark Demo App at `DEMO_DOMAIN` from the checkout's `demo-app/site/` and `extras/`, read-only, with the site in `demo-app.Caddyfile`, which `Caddyfile` imports and `docs/deploy/demo-app.md` also serves alone, the way `serveDemoApp()` does, so tests reach it at a public address as the Project Variable `BASE` |

The Dockerfile builds from the repository root on `mcr.microsoft.com/playwright:v<playwright version>-noble`, whose Chromium matches the pinned `playwright` package. That image ships a newer Node, so Node 22 and corepack are copied from `node:22.x-bookworm-slim`, matching `.nvmrc`. It installs every dependency, since the Backend runs from source with `tsx` and `prisma` is a dev dependency, generates the Prisma Client, and runs as `pwuser`. At start it runs `prisma migrate deploy`, then `pnpm start`. compose reads `POSTGRES_PASSWORD`, `API_DOMAIN`, `DEMO_DOMAIN`, `JWT_SECRET`, `OPENROUTER_API_KEY`, `CORS_ORIGIN`, and `RUN_CONCURRENCY` from `.env` (`.env.example`, Deploy section) and fails before starting when a required one is missing; it sets the backend's `DEMO_APP_URL` to `https://${DEMO_DOMAIN}`, and `compose.preview.yaml`, whose environment has no Demo App of its own, to `${DEMO_APP_URL:-https://demo.94.72.126.118.sslip.io}`, production's public one. The image keeps `src/tests/e2e/fixtures/`, which the Quick Start project reads (1.10). The same Postgres version runs in `compose.dev.yaml` and CI.

Project Variable values are stored in plain text, and Run Files are never deleted; both are deliberate simplifications. Postgres needs off-box backups of the `postgres-data` volume. `docs/deploy/backend-prod.md` is the step-by-step guide from a fresh VPS, including backups.

### 1.10 Quick Start Project

Every new account gets a Project named `Quick Start`, so a new user can run a test within a minute. Register creates the user and the Project with its folders, Test Files and Variables in one nested Prisma create, which is one transaction: a failed register, such as a taken email, leaves neither. `quickStartProject()` sets the Project's id itself, so the Test Files created inside its folders can name their Project in the same create.

The Project's folders, files and headers are a manifest in `workspace/quick-start.ts`. The four folders sit directly in the Project; each name starts with a number and says what it teaches, so the tree, which lists folders by name (1.3), shows them in learning order. Each file name says what the test does:

| Folder | Test File | Made from fixture |
| ------ | --------- | ----------------- |
| `1 Passing tests` | `sign-in-and-see-products.yaml`, `buy-a-backpack.yaml`, `locked-out-user-sees-an-error.yaml` | `pass/sign-in.yaml`, `pass/checkout.yaml`, `pass/locked-out.yaml` |
| `2 Failing tests - see why they fail` | `wrong-total-fails-at-the-total.yaml`, `missing-button-fails.yaml`, `unexpected-alert-fails.yaml` | `fail/wrong-total.yaml`, `fail/missing-element.yaml`, `fail/unexpected-dialog.yaml` |
| `3 Invalid files - fix the errors` | `seven-errors-at-once.yaml`, `yaml-syntax-error.yaml` | `invalid/multiple-errors.yaml`, `invalid/yaml-syntax.yaml` |
| `4 Jev - find and check by description` | `find-elements-by-description.yaml` (`target` locating), `fall-back-from-a-stale-selector.yaml` (a stale `selector` falls back to its `target`), `judge-a-true-statement.yaml`, `judge-a-false-statement.yaml` (`statement` judging) | `jev/target-add-to-cart.yaml`, `jev/stale-selector.yaml`, `jev/statement-holds.yaml`, `jev/statement-fails.yaml` |

| Variable | Value |
| -------- | ----- |
| `BASE` | `DEMO_APP_URL` (1.8), which is always set |
| `SWAG_PASSWORD` | `secret_sauce`, the password the Demo App shows on its own sign-in page |

Each seeded file opens with a three-line header from the manifest, in plain words: what the test does, what result to expect and why (`# Expect: failed at step 10 because the total is $32.39, not $99.99; ...`), and one thing to try (`# Try: change $99.99 to $32.39 and run it again.`). The rest of the file is its fixture from `src/tests/e2e/fixtures/` (`docs/testing/test-cases.md` 2.4) without the fixture's first-line `# Expect:` comment, read from disk when the Project is created, so the fixtures stay the single source of the test bodies and keep the line numbers the E2E tests rely on. The header replaces one line with three, so every line of a seeded file is two lines below its line in the fixture; `seven-errors-at-once.yaml` reports its seven diagnostics at lines 5, 8, 9, 10, 15, 17 and 20.

Only three files use the Demo App's sign-in page, because it is what they show: `sign-in-and-see-products.yaml` signs in through it, `locked-out-user-sees-an-error.yaml` is refused there, and `fall-back-from-a-stale-selector.yaml` has Jev find its Login button. Every other file that needs a signed-in user starts signed in with `cookies: { session-username: "standard_user" }`, the cookie the Demo App sets on sign-in (`syntax-analyzer.md` 1.7), and opens `/inventory.html` directly; a comment below its header says so. The files use only `{{BASE}}` and `{{SWAG_PASSWORD}}` and finish within seconds. The files of the first three folders locate by `selector` only, so their Runs never call Jev; the Runs of the `4 Jev` folder call Jev through the server's `OPENROUTER_API_KEY` (1.8), and `pnpm test:e2e` never runs them. Fixtures that need another Variable (`pass/variable-value.yaml`, `fail/missing-variable.yaml`) or long waits (`pass/slow.yaml`, `fail/run-timeout.yaml`) are left out, as are `pass/all-actions.yaml`, whose 35 steps make a poor first example, and the fixtures that repeat a case above.

`POST /projects/quick-start` adds the same Project to an account that has none named `Quick Start`, for accounts made before it existed or after deleting or renaming it. An account that already has a Project named `Quick Start` gets `409` with `You already have a project named Quick Start. Rename or delete it, then add it again.`, and nothing is added. `workspace/quick-start.ts` builds the nested create for both.

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
| `GET` | `/tree` | – | `200 { items: TreeProject[] }`: each Project's `folders` and `testFiles`, each folder (`TreeFolder`) with its own `folders` and `testFiles` to any level; Test Files without sources, each with its `latestRun` (`id`, `status`, `createdAt`) |
| `GET` / `POST` | `/projects` | `{ name }` | `200 { items: Project[] }` / `201 Project` |
| `POST` | `/projects/quick-start` | – | `201 Project`, the Quick Start project (1.10); `409` when one exists |
| `PATCH` / `DELETE` | `/projects/:projectId` | `{ name }` | `200 Project` / `204` |
| `GET` | `/projects/:projectId/variables` | – | `200 { items: { name, value }[] }`, by name |
| `PUT` / `DELETE` | `/projects/:projectId/variables/:name` | `{ value }` | `204` / `204` |
| `GET` / `POST` | `/projects/:projectId/folders` | `{ name, parentId? }` | `200 { items: Folder[] }`, every folder of the Project at any level / `201 Folder`, in the folder `parentId` or, without it or `null`, directly in the Project |
| `PATCH` / `DELETE` | `/folders/:folderId` | `{ name?, projectId?, parentId? }` | `200 Folder`, renamed and/or moved (1.3) / `204`, with everything inside |
| `GET` / `POST` | `/projects/:projectId/test-files` | `{ name, source, folderId? }` | `200 { items: TestFile[] }`, every Test File of the Project at any level, without sources / `201 { testFile, diagnostics }`, the Test File with `source`, in the folder `folderId` or directly in the Project |
| `GET` | `/test-files/:testFileId` | – | `200 TestFile` with `source` |
| `PATCH` / `DELETE` | `/test-files/:testFileId` | `{ name?, source?, projectId?, folderId? }` | `200 { testFile, diagnostics }`, the Test File with `source`, renamed, moved (1.3), and/or changed / `204` |
| `POST` | `/test-files/validate` | `{ source }` | `200 { diagnostics }` |
| `POST` | `/test-files/:testFileId/runs` | – | `202 Run`, or `422` |
| `GET` | `/runs` | `?testFileId=&projectId=&limit=&cursor=` | `200 { items: Run[], nextCursor }`, newest first, without `source` and `report` |
| `GET` | `/runs/:runId` | – | `200 Run` with `source` and `report` |
| `GET` | `/runs/:runId/files/*path` | Bearer or `?token=` | The Run File (`report.json`, `trace.zip`, `screenshots/step-<n>.png`); paths outside the Run's folder answer `404` |
| WebSocket | `/runs/:runId/live` | `?token=` | Live Progress (1.5) |

A `Folder` carries its `id`, `projectId`, `parentId` (`null` directly in the Project), `name`, `createdAt`, and `updatedAt`; a `TestFile` its `id`, `projectId`, `folderId` (`null` directly in the Project), `name`, the times, and `source` where 3.1 says. A `Run` carries its `testFileId`, `projectId`, `fileName`, `path` (1.4), TestCase `name`, `status`, `createdAt` (trigger time), `startedAt`, `finishedAt`, `durationMs`, `summary`, and `error` (`{ kind, message }`: `timeout`, `infrastructure`, `interrupted`, or `internal`). `GET /runs/:runId` adds `source` and `report`. The full shapes are in `docs/api/openapi.json`. The Report is downloaded as JSON from `files/report.json`; there is no HTML export.

### 3.2 Core Changes

The Backend needs three options in Core, all off by default so the CLI keeps its behavior:

```ts
type RunTestOptions = {
  // ...existing fields
  screenshotEveryStep?: boolean; // Executor: a screenshot after every executed step, not only a failed one
  network?: "any" | "public";    // Browser Adapter: abort requests to non-public addresses (1.6)
  maxRunTimeoutMs?: number;      // Executor: cap runTimeoutMs (1.4)
};
```

With `screenshotEveryStep`, Core's passed steps carry a `screenshot` too, in their Step results, `finished` events, and the Report (`executor.md` 1.3, `report.md` 1.3). `network` is the Browser Adapter's private network blocking (`browser-adapter.md` 1.12). `maxRunTimeoutMs` caps the Run timeout (`executor.md` 1.7).

### 3.3 Database

```mermaid
erDiagram
  User ||--o{ Project : owns
  User ||--o{ Run : triggers
  Project ||--o{ Folder : has
  Project ||--o{ TestFile : has
  Project ||--o{ Variable : has
  Folder ||--o{ Folder : holds
  Folder |o--o{ TestFile : holds
  TestFile |o--o{ Run : "ran as"
  User { uuid id PK; string email UK; string passwordHash; datetime createdAt }
  Project { uuid id PK; uuid userId FK; string name; datetime createdAt; datetime updatedAt }
  Variable { uuid id PK; uuid projectId FK; string name; string value }
  Folder { uuid id PK; uuid projectId FK; uuid parentId FK "nullable"; string name; datetime createdAt; datetime updatedAt }
  TestFile { uuid id PK; uuid projectId FK; uuid folderId FK "nullable"; string name; text source; datetime createdAt; datetime updatedAt }
  Run { uuid id PK; uuid userId FK; uuid testFileId FK "nullable"; uuid projectId FK "nullable"; string fileName; string path; string name; text source; enum status; datetime createdAt; datetime startedAt; datetime finishedAt; int durationMs; int total; int passed; int failed; int pending; string errorKind; string errorMessage; jsonb report }
```

Unique: `User.email`; `(Project.userId, name)`; `(Folder.projectId, parentId, name)` and `(TestFile.projectId, folderId, name)`, both `NULLS NOT DISTINCT` in their migration, so names are unique directly in a Project too; `(Variable.projectId, name)`. A folder's and a Test File's `projectId` is always its Project's, also inside folders, so ownership checks and Runs need no walk up the folders; a move to another Project updates it for everything moved. Index: `Run (testFileId, createdAt)`, `Run (projectId, createdAt)`, `Run (status)`. Screenshots and traces live only in `RUNS_DIR`, never in Postgres.

## 4. Class Architecture

### 4.1 Modules

| Module | Responsibility |
| ------ | -------------- |
| `main.ts` | Reads the env, connects Prisma, recovers interrupted Runs, builds the Run Queue and `LiveHub`, and starts HTTP and WebSocket on one port |
| `env.ts` | The zod schema of 1.8 |
| `db.ts` | `createDb()`: the Prisma client over `@prisma/adapter-pg` |
| `app.ts` | `createApp(deps)`: Express app with CORS, JSON parsing, the API docs, every route of `ROUTES` token-checked, validated, and dispatched to its handler (or `501`) with the token's `userId`, and the error handler; deps (handlers, `verifyToken`) are injected for tests |
| `handlers.ts` | `createHandlers(deps)`: every implemented handler, keyed `"<method> <path>"` like `ROUTES` |
| `http/` | `errors.ts` (the `ApiError` type and handler of 1.7), `auth.ts` (the token middleware: Bearer, `?token=`, or both, per the route's `auth`), `prisma-errors.ts` (unique violations become `409`) |
| `auth/` | `password.ts` (bcrypt), `token.ts` (sign and verify with `jose`), `routes.ts` |
| `workspace/` | `routes.ts`: routes for projects, folders, test files, variables, and the tree; `folders.ts`: the folder levels, paths, and nesting of a Project's folder rows (`MAX_LEVEL`, `levelOf`, `heightOf`, `isWithin`, `subtreeIds`, `pathOf`, `nest`); `parents.ts`: where a create or move puts a row, and its level, move, and name checks; `owned.ts`: lookups scoped to the user (`404` otherwise) and the rows' API shapes; `quick-start.ts`: the Quick Start project of 1.10 |
| `runs/queue.ts` | `RunQueue`: FIFO with a concurrency limit, `enqueue(runId)`, and `idle()` for tests; a Run that throws is logged and the queue goes on |
| `runs/execute-run.ts` | `executeRun()`: runs one queued Run with Core, writes Run Files, updates the row, and publishes its progress to a `RunProgress` (the `LiveHub`); `recoverInterruptedRuns()` of 1.4 step 6, called by `main.ts` before the queue starts |
| `runs/browser.ts` | `browserLauncher(endpoint)`: the launch every Run uses, connecting to `BROWSER_ENDPOINT` when set |
| `runs/to-run.ts` | The API's `Run` of a row: `toRun()` for lists, `toRunDetail()` with `source` and `report` |
| `runs/run-files.ts` | The disk `ReportStore`, `writeRunFile()` for each step's screenshot, and `resolveRunFile()`: a path that resolves outside `RUNS_DIR/<runId>/`, or to the folder itself, is rejected |
| `runs/live.ts` | `LiveHub`: the `RunProgress` of every Run, with each running Run's steps so far and subscribers; `attachLive()`: the WebSocket upgrade handler on the HTTP server, with the `?token=` check |
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
├── browser.Dockerfile   # the browser container: Playwright image, iptables, playwright run-server
├── browser-firewall.sh  # its entry point: the firewall of 1.6, then run-server as pwuser
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
| Unit | `env`: missing and invalid variables stop start-up; dev mode picks `network: "any"` only on a loopback `HOST`; `DEMO_APP_URL` required outside dev mode, also when empty, `http(s)` only, and the local Demo App in dev mode when missing | `src/tests/unit/app/backend/env.test.ts` |
| Unit | Folder tree: levels counting the Project, a folder's height, inside a folder at any depth, a subtree's ids, paths, nesting | `src/tests/unit/app/backend/workspace/folders.test.ts` |
| Unit | Quick Start project: its name, its own id on every Test File, folders and files, names by the naming rules, folders in learning order by name, the three-line header of every file, the fixture body after it unchanged, valid and invalid files, the invalid files' diagnostics two lines down, the session cookie and its comment in every file that needs a signed-in user and the sign-in page only in the three that show it, `BASE` from `DEMO_APP_URL` | `src/tests/unit/app/backend/workspace/quick-start.test.ts` |
| Unit | `password`, `token`: hash and verify, wrong password, no expiry, tampered tokens and other secrets | `src/tests/unit/app/backend/auth/` |
| Unit | `RunQueue`: FIFO order, the concurrency limit, a failing Run does not stop the queue | `src/tests/unit/app/backend/runs/queue.test.ts` |
| Unit | `run-files`: paths outside the Run's folder rejected | `src/tests/unit/app/backend/runs/run-files.test.ts` |
| Unit | `LiveHub`: snapshot for a late subscriber, step and status messages, close after the final status | `src/tests/unit/app/backend/runs/live.test.ts` |
| Unit | Core: `screenshotEveryStep`, `network: "public"` address checks | `src/tests/unit/core/...` |
| Unit | Deploy files: the Playwright image of the pinned `playwright`, Node of `.nvmrc`, `--dev` only in the development scripts, migrate before start, Caddy to `backend:4000`, one Postgres version in compose, `compose.dev.yaml`, and CI; the Demo App served on `DEMO_DOMAIN` like `serveDemoApp()`; `DEMO_APP_URL` from `DEMO_DOMAIN` in compose and production's public Demo App by default in the preview, the fixtures kept in the image, the browser container's `run-server` version, a firewall rule for every range of `NON_PUBLIC_RANGES`, root and capabilities dropped, memory, CPU, and process limits, `NET_ADMIN` and its own network | `src/tests/unit/app/backend/deploy.test.ts` |
| Integration | Database: unique names per parent, also directly in a Project, cascade deletes of Projects and folders, Runs kept with `null` ids | `src/tests/integration/app/backend/db.test.ts` |
| Integration | The folders migration, applied to rows of the schema before it: every Module becomes a folder directly in its Project with its id, name, and times; every Test File, source, Variable, and Run survives, each Run with its path | `src/tests/integration/app/backend/migration.test.ts` |
| Integration | Auth: register, the Quick Start project on register, nothing created for a duplicate email, login, wrong password, `401` without or with a bad token | `src/tests/integration/app/backend/auth.test.ts` |
| Integration | Workspace: CRUD of Projects, folders at every level, and Test Files at any level; the level-4 limit; names unique across folders and Test Files in one parent; moving Test Files and folders, also to another Project, with everything inside and their Runs, and every refused move (taken name, into itself, too deep, another user's) changing nothing; the nested tree; cascade deletes keeping Runs; `404` for another user's data; saving a source with diagnostics; saving answers the source; Variables listed with their values; adding the Quick Start project and its `409` | `src/tests/integration/app/backend/workspace.test.ts` |
| Integration | Runs: `422` for an invalid file, `202` and `queued`, the path at trigger time, the Project Variables for a file at any level and after a move to another Project, a second Run stays `queued` while one runs, the final row and Report, a Run with `cookies` and browser state against the Demo App with Project Variables, Run errors, files served with Bearer or `?token=` and traversal rejected, a Run on a `run-server` at `BROWSER_ENDPOINT`, a Run capped at the longest run time, `GET /runs` filters, order, and cursor paging, restart recovery | `src/tests/integration/app/backend/runs.test.ts` |
| Integration | Live Progress over a real WebSocket: snapshot with every step `pending`, `running` and finished steps with screenshots, final status, a finished Run's snapshot, `4401` and `4404` | `src/tests/integration/app/backend/live.test.ts` |
| Integration | Core with `network: "public"`: a page on `127.0.0.1` is blocked | `src/tests/integration/core/browser/` |
| Unit | OpenAPI: `info`, every route of `ROUTES` with `{name}` parameters, parameters and bodies from the schemas, Bearer and `?token=` security per route, `{ items }` lists and Run paging, typed error details, one `Step` shape for the Report and Live Progress, the Live Progress messages as components, `docs/api/openapi.json` up to date | `src/tests/unit/app/backend/openapi.test.ts` |
| Integration | App: health, OpenAPI and Swagger UI, `501` without a handler, `400` with `{ path, message }` details before the handler, plain-word messages for credentials, names, Test File names, and Variable names, `404` for a non-uuid id, bad JSON, `413` over 1 MB and for an over-long source or Variable value while a long name stays `400`, `404` for an unknown route, CORS only for the frontend's origin, a generic `500`, a handler gets the parsed input and the whole files wildcard | `src/tests/integration/app/backend/app.test.ts` |
| E2E | Login → edit → validate → run → history through the frontend (Epic 6) | `src/tests/e2e/` |
