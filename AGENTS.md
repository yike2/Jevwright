# AGENTS.md — Jevwright

Instructions for AI coding agents (Claude Code, Copilot, Antigravity, etc.) and humans working in this repo.
Read this file fully before making changes. If something here conflicts with a direct instruction from a
maintainer in the current task, follow the maintainer and suggest an update to this file in your PR.

## 1. Project Context

Jevwright is an AI-assisted web testing platform. Users write declarative `.yaml` test files; the Core
runner executes them with Playwright and calls **Jev** (a fast, cheap, structured-output model, accessed
via OpenRouter) only for two jobs: **locating an element** and **judging an assertion**. Everything else
is plain Playwright. The goal is to be much faster and cheaper than LLM-planning runners like Midscene.

### 1.1 Sources of Truth (in priority order)

1. Module design docs in `docs/tech/` (e.g. `syntax-analyzer.md`). **These win on technical details.**
2. `docs/PRD.md` — product scope, user stories, acceptance criteria, MoSCoW priorities.
3. This file — conventions and workflow.

Known PRD drift: the PRD's YAML example uses `xpath`, `open: "<url>"` shorthand, and per-step
`timeoutMs`. These are **obsolete**. The YAML format is defined only by `docs/tech/syntax-analyzer.md`
(`selector` + `target`, `open: { url }`, root-level `timeoutMs`). Never implement the PRD variant.

### 1.2 Tech Stack

| Area              | Choice                                                        | Deployed on        |
| ----------------- | ------------------------------------------------------------- | ------------------ |
| Runtime           | Node.js 22 LTS, TypeScript 5.x (`strict: true`)               | —                  |
| Package manager   | pnpm 9 workspaces (no npm/yarn lockfiles)                     | —                  |
| Frontend + API    | Next.js (App Router) + Tailwind CSS + shadcn/ui               | Vercel             |
| Auth              | Auth.js Credentials provider + JWT sessions                   | Vercel             |
| Database          | PostgreSQL (Neon) + Prisma                                    | Neon free tier     |
| Screenshot/report | Vercel Blob (never store binary data in Postgres)             | Vercel             |
| Core              | TS library: `yaml` parsing, Playwright execution, Jev Harness | used by runner/CLI |
| Runner            | Express wrapping Core, official Playwright Docker image, `ws`  | Render or Railway  |
| CLI               | `jevwright` (`commander`), wraps Core                          | npm (local)        |
| Testing           | Vitest (unit + integration), Playwright Test (E2E)            | GitHub Actions     |
| Lint/format       | ESLint + Prettier                                             | CI                 |

Exact versions live in each `package.json`. Do not upgrade major versions without an issue.

## 2. Architecture

### 2.1 Folder Structure

```text
jevwright/
├── src/
│   ├── core/                 # Shared execution engine (no HTTP, no DB, no UI)
│   │   ├── syntax/           # Syntax Analyzer: analyze(source) -> TestCase | Diagnostic[]
│   │   ├── jev/              # Jev Harness: prompt assembly, OpenRouter calls, output parsing
│   │   ├── browser/          # Chromium lifecycle, screenshots, interactive DOM extraction
│   │   ├── locator/          # selector -> Visual Locate -> DOM Locate
│   │   ├── playwright/       # Step execution via Playwright APIs
│   │   ├── assert/           # Playwright assertions with Jev fallback
│   │   ├── report/           # JSON report + trace output
│   │   └── pipeline/         # run(): orchestrates all of the above, emits step events
│   ├── cli/                  # `jevwright validate` and `jevwright run`
│   ├── app/
│   │   ├── frontend/         # Next.js app: auth, sidebar, editor, dashboard, REST API, OpenAPI
│   │   └── backend/          # Express runner service: run queue, WebSocket progress, writes DB + Blob
│   │       └── db/           # Prisma schema, migrations, generated client (shared by frontend + backend)
│   └── tests/
│       ├── unit/             # mirrors src/: unit/core/<module>/, unit/backend/, ...
│       ├── integration/      # cross-module tests and their fixtures
│       ├── e2e/              # Playwright Test flows
│       └── benchmark/        # demo-app/ (target app) + benchmark .yaml suite run against it
└── docs/
    ├── PRD.md
    ├── archify/              # architecture + run sequence diagrams (one folder per diagram)
    ├── references/           # workspace.svg, dashboard.svg, arch.svg, ui-prototype.html
    └── tech/                 # TEMPLATE.md, one <module>.md per Core module
```

### 2.2 Runtime Data Flow

- **CLI:** `.yaml` → `core` Syntax Analyzer → Chromium → per step: Locator → Playwright action or
  assertion → report. Writes `report.json`, `trace.zip`, and errors to `--out-dir`
  (default `./jevwright-reports`). Exit codes: `0` pass, `1` step failed, `2` validation/config error.
- **Web:** user clicks **Run** → `frontend` API creates a `queued` Run in Postgres → calls `backend` (shared
  secret header) → backend executes one Run at a time and queues the rest → pushes step events over
  WebSocket → writes results to Postgres and screenshots/traces to Blob.
- **WebSocket:** hosted by `backend` (Vercel cannot hold sockets). The browser gets a short-lived,
  Run-scoped token from `frontend`, then connects directly to `backend`.

### 2.3 Key Patterns

- **Core is pure and reusable.** `core` must not import from `frontend`, `backend`, `cli`, or `db`. It reports
  progress through an event callback/emitter; callers decide where events go (terminal, WebSocket).
- **Jev is called only from `src/core/jev/`.** Locator and Assert modules call the Harness API,
  never OpenRouter directly. Every Jev call has bounded retries and returns a confidence score.
- **Locating order is fixed:** `selector` only → Playwright only, never Jev; `target` only → Visual Locate,
  then DOM Locate; both → `selector` first, Jev on no match. Record which method succeeded.
- **Assertions:** Playwright check first; if it fails and `statement` exists, Jev judges it and the step
  is marked as a fallback pass. `waitFor` uses exactly one of `condition`, `selector`, `url`.
- **Never rewrite a user's test file.** The platform reads `.yaml`; it never edits or "self-heals" it.
- **Collect all errors.** The Syntax Analyzer returns every diagnostic with line/column, never only the first.
- **Adding an action:** add a parse function in `src/core/syntax/steps.ts`, register it in the map,
  add executor support in `playwright/`, add valid + invalid fixtures, and update `syntax-analyzer.md`.
- **Pipeline stops on first failed step** and still produces a complete report.

## 3. Naming Conventions and Coding Standards

| Thing                        | Convention                                  | Example                         |
| ---------------------------- | ------------------------------------------- | ------------------------------- |
| Files and folders            | kebab-case                                  | `field-reader.ts`, `run-list.tsx` |
| React components             | PascalCase export, kebab-case file          | `RunList` in `run-list.tsx`     |
| Classes, types, interfaces   | PascalCase, no `I` prefix                   | `FieldReader`, `TestCase`       |
| Functions, variables         | camelCase, verbs for functions              | `analyze()`, `locateElement()`  |
| Constants, env vars          | UPPER_SNAKE_CASE                            | `DEFAULT_TIMEOUT_MS`, `JEV_MODEL` |
| YAML action and field names  | camelCase (as in the syntax doc)            | `doubleClick`, `timeoutMs`      |
| Diagnostic codes             | `E` + 3 digits, defined in the syntax doc   | `E004`                          |
| Prisma models / fields       | PascalCase singular / camelCase             | `TestRun.startedAt`             |
| REST routes                  | `/api/v1/` + plural kebab-case nouns        | `/api/v1/test-files/:id/runs`   |
| Test files                   | `<name>.test.ts`, E2E `<flow>.spec.ts`      | `fields.test.ts`                |

Status values are exact strings, used everywhere (DB, events, UI): Run `queued | running | passed |
failed`; Step `pending | running | passed | failed`; locate method `selector | visual | dom`.

Coding standards:

- TypeScript `strict`; no `any` (use `unknown` and narrow). No `@ts-ignore` without a linked issue.
- Prefer discriminated unions (like `Step`) over optional-field soup; handle every case with an
  exhaustive `switch` and a `never` check.
- Small modules with one responsibility, matching the module table in each design doc.
- **KISS and YAGNI.** Pick the simplest design that meets the current issue and its design doc. Don't
  add abstractions, options, extension points, or layers for needs that don't exist yet; extract a
  helper or interface only when a second real caller appears.
- Errors: return typed results (`Diagnostic[]`, step result objects) for expected failures; throw only
  for programmer errors or infrastructure failures. Never swallow errors silently.
- All code, comments, docs, commit messages, and UI text are in **English**.
- Comments explain *why*, not *what*. Public functions in `core` get a one-line TSDoc summary.

## 4. Testing Strategy

| Package  | Framework                | Required coverage            | What to test                                     |
| -------- | ------------------------ | ---------------------------- | ------------------------------------------------ |
| `core`   | Vitest                   | ≥ 80% lines                  | Every module; Syntax Analyzer via fixtures       |
| `backend` | Vitest + supertest      | ≥ 60% lines                  | Queue order, auth header, event emission         |
| `cli`    | Vitest                   | key paths                    | Output format, `--json`, exit codes 0/1/2        |
| `frontend` | Vitest + Playwright Test | E2E on critical flows        | Login → edit → validate → run → history          |

- Syntax Analyzer fixtures: `src/tests/integration/syntax/fixtures/valid/` (at least one per action) and
  `fixtures/invalid/` (at least one per error code, named like `E003-missing-value.yaml` with a
  matching `.json` of expected diagnostics). Assert `code`, `line`, and `column`.
- **Unit tests never call the real Jev API.** Mock the Harness interface. Real Jev calls run only in the
  benchmark suite and in tests explicitly marked `@live`, which CI skips unless a secret is present.
- Browser tests in `core` run against local HTML fixtures or `demo-app`, never external websites.
- A bug fix PR includes a test that fails before the fix.
- CI (GitHub Actions) runs `pnpm lint`, `pnpm typecheck`, and `pnpm test` on every PR. All must pass.

Useful commands: `pnpm install`, `pnpm dev`, `pnpm --filter core test`, `pnpm test`,
`pnpm lint`, `pnpm typecheck`, `pnpm exec playwright install chromium`.

## 5. PRD and Design References

- PRD: [`docs/PRD.md`](docs/PRD.md). Check user story acceptance criteria (Section 4.3) and the
  MoSCoW table (Section 6) before building a feature. Do not build `Won't` items (server-side sandboxing).
- Architecture diagram: [`docs/references/arch.svg`](docs/references/arch.svg).
- Architecture and run sequence diagrams: `docs/archify/<diagram>/index.html`, generated from each
  folder's `candidate.json`. Follow [`docs/archify/rule.md`](docs/archify/rule.md) when editing them.
- **Keep the PRD, `docs/tech/`, and diagrams in sync.** When a change affects product scope, a module's
  behavior or interface, or the architecture or run flow, update every affected doc and diagram in the
  same PR. If they disagree, follow the priority in Section 1.1 and fix the lower-priority one.
- Module docs: `docs/tech/<module>.md`, written from [`docs/tech/TEMPLATE.md`](docs/tech/TEMPLATE.md).
  If you implement a Core module that has no doc yet, write the doc from the template first and get it
  reviewed in a separate PR.
- Wireframes: `docs/references/workspace.svg` and `docs/references/dashboard.svg`.

### 5.1 Mockup Descriptions

Both main screens share one layout: a fixed **left sidebar** and a **main pane**.

- **Login/Register:** centered card with Login/Register tabs, email, password, and Submit. On success,
  redirect to the workspace.
- **Workspace (editor):** sidebar shows a collapsible tree `project → module → test.yaml`; the selected
  file is highlighted. An **account** control is anchored at the bottom of the sidebar. The main pane is
  the `.yaml` editor.
- **Dashboard:** same sidebar. The main pane has a summary row (a circular pass/fail chart and a summary
  card with latest-run stats) above a list of rows, one per run or file. Tabs: `.yaml files`,
  `test process`, `test history`.

### 5.2 Key UI Components and Expected Behavior

| Component          | Expected behavior                                                                  |
| ------------------ | ---------------------------------------------------------------------------------- |
| `WorkspaceSidebar` | Create/rename/delete projects, modules, files; expand/collapse; keyboard navigable |
| `YamlEditor`       | Syntax highlighting; validates on change (debounced) and on save; shows inline errors at the diagnostic line; Save is blocked while errors exist |
| `RunButton`        | Disabled when the file is invalid or unsaved; shows `queued`/`running` state; shows the cooldown message on `429` |
| `LiveRunView`      | Subscribes to the Run's WebSocket; updates each step `pending → running → passed/failed` without page refresh; shows screenshot and locate method per step |
| `RunHistoryTable`  | Lists runs with status, duration, trigger time, pass/fail counts; filterable; opens a run detail |
| `RunDetail`        | Step timings, locate method, Jev confidence, fallback-pass badge, screenshots, logs, JSON export |
| `FilesOverview`    | (Should) Files in the selected project/module with their latest run status        |

### 5.3 User Flows to Follow

- **CLI flow:** install CLI → author `.yaml` → `jevwright validate` (no browser) → `jevwright run`
  (headless by default, `--headed` optional) → read terminal summary and files in `--out-dir`.
- **Web flow:** log in → pick or create project/module → create, edit, or upload a file → validate and
  save → click Run → watch Live Run View → review History/Report → export.
- **External Agent/CI flow:** authenticate with a token → upload file via REST → start Run → poll or
  fetch the report. Responses must match the served OpenAPI spec; update the spec in the same PR.

## 6. Scrum and Git Workflow

Work is tracked as GitHub Issues (epics with sub-issues) under the **Sprint 1** and **Sprint 2**
milestones. Every change starts from an issue. If none exists, ask a maintainer or create one first.

### 6.1 Branches

Format: `type/issue#-short-description`, lowercase kebab-case, cut from `main`.

Types: `feature`, `fix`, `docs`, `test`, `refactor`, `chore`.
Examples: `feature/42-dom-locate-fallback`, `fix/57-wrong-column-in-e004`, `docs/12-locator-design`.

### 6.2 Commits

[Conventional Commits](https://www.conventionalcommits.org) with a scope and the issue number:

```text
<type>(<scope>): <imperative summary> (#<issue>)    # whole line ≤ 72 chars
```

- Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`.
- Scopes: `core`, `syntax`, `jev`, `locator`, `assert`, `playwright`, `cli`, `backend`, `frontend`, `db`,
  `benchmark`.
- Example: `feat(locator): fall back to DOM locate on low confidence (#42)`.
- One logical change per commit. Do not mix formatting changes with behavior changes.

### 6.3 Pull Requests

- Title follows the commit format. The body includes `Closes #<issue>`, a summary, how it was tested,
  and screenshots for UI changes.
- Required before merge: CI green and **one approving review from the other teammate**.
- Merge with **squash merge** only. Delete the branch after merge. No direct pushes to `main`.
- **AI agents may create branches, commit, push, and open PRs. AI agents must never merge a PR,
  approve a PR, force-push to `main`, or change branch protection.** A human merges.
- Keep PRs small (aim for under ~400 changed lines). Split large features into sub-issues.

### 6.4 Referencing Issues

- Commits: `(#42)` at the end of the subject line. PRs: `Closes #42` or `Refs #42` if not closing.
- Code: `// TODO(#42): handle iframes in DOM extraction`. No bare `TODO` or `FIXME` without an issue.

## 7. Do's and Don'ts

### 7.1 Do

- Read the issue and the relevant `docs/tech/*.md` before writing code; update the doc in the same
  PR when behavior changes.
- Match the interfaces in design docs exactly (e.g. `analyze(source): AnalyzeResult`).
- Use the `yaml` library's `parseDocument` + `LineCounter` so every error has a line and column.
- Use `zod` for REST request bodies, runner messages, and environment variable validation.
- Use Playwright's auto-waiting locators; use `timeoutMs` from the test case for each step.
- Use Server Components by default in `frontend`; add `"use client"` only where interactivity is needed.
- Use shadcn/ui components and Tailwind utilities before writing custom CSS.
- Use native `fetch`, `node:` built-ins, and the libraries listed in Section 1.2.
- Ask when a requirement is ambiguous instead of guessing.

### 7.2 Don't

- Don't use zod (or any schema library) to validate test files; it loses source positions.
- Don't add LLM-planning features (`ai`, `aiAct`, auto-planning) or a general-purpose LLM at runtime.
  These keys must stay rejected as unknown actions (`E005`).
- Don't import Midscene, LangChain, or other AI agent frameworks.
- Don't add Jest, axios, moment, lodash (whole package), jQuery, or CSS-in-JS libraries.
- Don't use `page.waitForTimeout()` except to implement the `sleep` action.
- Don't put binary files in Postgres, or business logic in React components.
- Don't add a dependency without explaining why in the PR description; prefer well-maintained packages.
- Don't commit generated files, `.env`, reports, traces, or `node_modules`.

### 7.3 Security Requirements

- Secrets (`OPENROUTER_API_KEY`, `DATABASE_URL`, `AUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`,
  `RUNNER_SHARED_SECRET`) come from env only. Keep `.env.example` updated with names, never values.
  Never prefix a secret with `NEXT_PUBLIC_`.
- Hash passwords with bcrypt or argon2. Never log passwords, tokens, or resolved `{{VAR}}` values.
- Check authentication **and ownership** (scope every query by `userId`) in every route handler and
  server action. Unauthenticated access returns `401`; exceeding the Run rate limit returns `429`
  with a cooldown message.
- The runner accepts requests only with a valid `RUNNER_SHARED_SECRET`; WebSocket tokens are
  short-lived and scoped to one Run.
- Validate and size-limit uploaded `.yaml` files. Use Prisma queries; no raw SQL string building.
- Server-side sandboxing is out of scope (PRD `Won't`). Don't build it, but don't weaken existing checks.

### 7.4 Accessibility Requirements (WCAG 2.1 AA)

- All interactive elements are keyboard reachable with a visible focus ring, including the sidebar
  tree and the editor.
- Every form field has a `<label>`; errors are linked with `aria-describedby`.
- Status is never shown by color alone: always pair color with text or an icon (`passed`, `failed`).
- Live step updates use an `aria-live="polite"` region. Screenshots have meaningful `alt` text.
- Maintain at least 4.5:1 text contrast. Use semantic HTML before ARIA.
