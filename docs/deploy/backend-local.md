# Running the Backend Locally

This guide runs the Jevwright backend on your own machine for development: the REST API and Live Progress that the frontend uses, with PostgreSQL in Docker, restarts on every change, and a debugger. To deploy it to a server, see `backend-prod.md`.

Locally, the backend:

- listens on `http://127.0.0.1:4000/api/v1`, on this machine only;
- runs in **dev mode**, where Runs can open local pages such as your frontend's dev server or the local Demo App; on a server they reach public addresses only (`docs/tech/backend.md` 1.6);
- launches Chromium itself, without the server's separate browser container.

## 1. Install

You need Node.js 22, pnpm 9, and Docker. With Node 22 installed, `corepack enable` provides the pnpm version the repository pins.

```bash
git clone https://github.com/yike2/Jevwright.git
cd Jevwright
pnpm install                                         # also generates the Prisma Client
pnpm exec playwright install --with-deps chromium   # the browser Runs use; system libraries need sudo
```

## 2. Start PostgreSQL

```bash
docker compose -f compose.dev.yaml up -d postgres   # PostgreSQL 17 on 127.0.0.1:5432, data in a Docker volume
```

## 3. Configure

Copy `.env.example` to `.env` in the repository root if you have not, and set:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://jevwright:jevwright@localhost:5432/jevwright` |
| `JWT_SECRET` | Any 32 characters or more, e.g. from `openssl rand -hex 32` |
| `CORS_ORIGIN` | `http://localhost:3000`, the frontend dev server's origin |
| `OPENROUTER_API_KEY` | A real key for `target` and `statement` steps, which call Jev; any non-empty value when tests use selectors only |

Leave `BROWSER_ENDPOINT` unset and `HOST` at `127.0.0.1`; dev mode refuses to start on an address other machines can reach. The backend reads this `.env` from whichever directory it starts in.

## 4. Create the tables and start

```bash
pnpm --filter @jevwright/backend exec prisma migrate deploy   # again after pulling new migrations
pnpm backend                                                  # dev mode; restarts when a file changes
```

It prints:

```text
Dev mode: Runs can open local and private addresses; the backend listens on this machine only
Backend on http://127.0.0.1:4000/api/v1, API docs at /api/v1/docs
```

Check it:

```bash
curl http://127.0.0.1:4000/api/v1/health   # {"status":"ok"}
```

The API docs are at <http://127.0.0.1:4000/api/v1/docs>, where you can register, log in, and call every route with the token. The same document is `docs/api/openapi.json`.

## 5. Debug

```bash
pnpm backend:debug   # dev mode with the Node inspector on 127.0.0.1:9229, without restarts on change
```

Attach a debugger to `127.0.0.1:9229`: in VS Code, run **Debug: Attach to Node Process**, or open `chrome://inspect` in Chrome. Breakpoints in `src/app/backend/src/` and `src/core/` work, since tsx maps the TypeScript sources. In VS Code you can also run `pnpm backend` in a **JavaScript Debug Terminal**, which attaches by itself and keeps the restarts on change.

Useful places for breakpoints:

| To follow | Set it in |
| --- | --- |
| A request, after its token and schema checks | The route's handler in `src/app/backend/src/workspace/routes.ts`, `runs/routes.ts`, or `auth/routes.ts` |
| A Run, from the queue to its final row | `executeRun()` in `src/app/backend/src/runs/execute-run.ts` |
| Each step of a Run | `runStep()` in `src/core/executor/run-step.ts` |
| Live Progress messages | `LiveHub.publish()` in `src/app/backend/src/runs/live.ts` |

Every Run's report, trace, and screenshots are under `./data/runs/<runId>/` (git-ignored); open a trace with `npx playwright show-trace data/runs/<runId>/trace.zip`.

## 6. Connect the frontend

- API base URL: `http://127.0.0.1:4000/api/v1`. Use `127.0.0.1` rather than `localhost`, since the backend listens on IPv4 only.
- Send `Authorization: Bearer <token>` with the token from `POST /api/v1/auth/register` or `/auth/login`; it never expires.
- Run Files (`<img>`, downloads) and Live Progress take the token as `?token=`, since browsers cannot set headers on them: `ws://127.0.0.1:4000/api/v1/runs/<runId>/live?token=<token>`.
- Only `CORS_ORIGIN` may call the API from a browser. If the frontend runs on another port, change it in `.env` and restart the backend.

## 7. Test against the Demo App

Serve the benchmark's Demo App on port 8080, from the repository root:

```bash
docker run --rm -p 127.0.0.1:8080:8080 -e DEMO_DOMAIN=:8080 \
  -v "$PWD/demo-app.Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$PWD/src/tests/benchmark/demo-app/site:/srv/demo/site:ro" \
  -v "$PWD/src/tests/benchmark/demo-app/extras:/srv/demo/extras:ro" \
  caddy:2.11.2-alpine
```

In the Project that tests it, set the Project Variables `BASE=http://127.0.0.1:8080` and `SWAG_PASSWORD=secret_sauce`. The files in `src/tests/benchmark/suite/selector/` then run unchanged as Test Files, without calling Jev; the same Flows in `suite/target/` locate elements from plain words with Jev.

## 8. Reset

| To | Run |
| --- | --- |
| Stop PostgreSQL, keeping the data | `docker compose -f compose.dev.yaml stop postgres` |
| Delete the local database and start over | `docker compose -f compose.dev.yaml down -v`, then steps 2 and 4 |
| Delete every Run's files | `rm -rf data/runs` |

## 9. When something goes wrong

| Symptom | Check |
| --- | --- |
| `Invalid environment` at start | The named variable is missing from `.env` or invalid; `HOST: dev mode needs a loopback HOST` means `HOST` is not `127.0.0.1` |
| `Can't reach database server at localhost:5432` from the migration, or `code: 'ECONNREFUSED'` when the backend starts | PostgreSQL is not running: step 2, then `docker compose -f compose.dev.yaml ps` |
| `The table ... does not exist` | The migrations have not run: `pnpm --filter @jevwright/backend exec prisma migrate deploy` |
| `EADDRINUSE` on port 4000 or 9229 | Another backend is still running; stop it, or set another `PORT` in `.env` |
| The frontend gets CORS errors | `CORS_ORIGIN` must be exactly the frontend's origin, e.g. `http://localhost:3000`, with no trailing slash |
| A Run fails at its first step with `browserType.launch: Executable doesn't exist` | Chromium is not installed: `pnpm exec playwright install --with-deps chromium` |
| A Run of a local page fails with `net::ERR_FAILED` | The backend is not in dev mode: start it with `pnpm backend`, not `pnpm start` |
| `Cannot find module '../generated/prisma/client.js'` | The Prisma Client is missing: `pnpm install`, or `pnpm --filter @jevwright/backend exec prisma generate` |
