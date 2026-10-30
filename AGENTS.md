# AGENTS.md — Jevwright

Instructions for AI coding agents and humans in this repo. Read this file fully before making changes.
If it conflicts with a maintainer's direct instruction, follow the maintainer and suggest an update here.

## 1. Context and Sources of Truth

Jevwright runs declarative `.yaml` web tests with Playwright and calls **Jev** (a fast, cheap,
structured-output model via OpenRouter) only to **locate an element** and **judge an assertion**.
Everything else is plain Playwright. The goal: much faster and cheaper than LLM-planning runners.

Priority when sources disagree (fix the lower-priority one in the same PR):

1. Module design docs in `docs/tech/` — **these win on technical details.**
2. `docs/PRD.md` — scope, user stories, acceptance criteria, MoSCoW priorities.
3. This file — conventions and workflow.

The PRD's YAML example (`xpath`, `open: "<url>"`, per-step `timeoutMs`) is **obsolete**. Only
`docs/tech/syntax-analyzer.md` defines the YAML format.

| Need | Read |
| --- | --- |
| A module's behavior, interfaces, constants, tests | `docs/tech/<module>.md` |
| Components, data flow, run sequence | `docs/archify/*/index.html` ([architecture](https://yike2.github.io/Jevwright/archify/jevwright-architecture/), [run sequence](https://yike2.github.io/Jevwright/archify/jevwright-sequence/)), `docs/references/arch.svg` |
| User journeys, CLI commands, exit codes, UI pages | `docs/PRD.md` §4.2, §7 |
| Screens and layout | `docs/references/workspace.svg`, `dashboard.svg`, [`ui-prototype.html`](https://yike2.github.io/Jevwright/references/ui-prototype.html) |
| Commit format | `README.md`, `.gitmessage`, `.githooks/commit-msg` (enforced) |
| Editing diagrams | `docs/archify/rule.md` |

## 2. Tech Stack

| Area | Choice |
| --- | --- |
| Runtime | Node.js 22 LTS, TypeScript `~5.9` (`strict: true`), pnpm 9 workspaces |
| Web + API | Next.js (App Router) + Tailwind + shadcn/ui, Auth.js Credentials + JWT — Vercel |
| Data | PostgreSQL (Neon) + Prisma; screenshots/reports in Vercel Blob, never in Postgres |
| Runner | Express wrapping Core, official Playwright Docker image, `ws` — Render or Railway |
| CLI | `jevwright` (`commander`), wraps Core |
| Testing / lint | Vitest, Playwright Test (E2E), ESLint + Prettier — GitHub Actions |

Pin Node in `.nvmrc` and `engines`. A fresh install may pull a newer major (e.g. TypeScript 7): after
installing, check majors against this table and pin them. Don't upgrade a major without an issue.

## 3. Architecture

```text
src/
├── core/            # engine, no HTTP/DB/UI: syntax/ jev/ browser/ locator/ playwright/ assert/ report/ pipeline/
├── cli/             # jevwright validate | run
├── app/frontend/    # Next.js: auth, sidebar, editor, dashboard, REST API, OpenAPI
├── app/backend/     # Express runner: queue, WebSocket progress; db/ = Prisma (shared)
└── tests/           # unit/ (mirrors src/), integration/ (hw3/ = Locator demo pages, fixtures, scripts),
                     # e2e/, benchmark/ (Epic 3 demo-app + .yaml suite)
docs/                # PRD.md, tech/ (TEMPLATE.md + one doc per module), references/, archify/
```

### 3.1 Key Patterns

- **Core is pure.** `core` never imports `frontend`, `backend`, `cli`, or `db`; it reports progress through
  an event callback and callers decide where events go.
- **Jev is called only from `src/core/jev/`.** The Harness owns the Jev types (`JevClient`, results) in
  `core/jev/types.ts`; Locator and Assert import them and never call OpenRouter.
- **Locating order is fixed:** `selector` only → Playwright only; `target` only → Visual, then DOM Locate;
  both → `selector` first, Jev on no match. Record the method that succeeded.
- **Assertions:** Playwright first; if it fails and `statement` exists, Jev judges it (fallback pass).
- **Never rewrite or "self-heal" a user's test file.** The Syntax Analyzer returns *every* diagnostic.
- **The pipeline stops on the first failed step** and still writes a complete report.
- **Adding an action:** parser in `core/syntax/steps.ts` + map entry, executor in `playwright/`, valid +
  invalid fixtures, and an update to `syntax-analyzer.md`.

### 3.2 External Calls and Model Output

- **Treat model output as untrusted.** Validate every field you use; a missing or non-numeric
  `confidence`, box, or choice is a failed answer, never a pass.
- **Retry only transient errors** (`429`, `5xx`, network, unparseable body) with exponential backoff,
  honoring `Retry-After`. Fail at once on other `4xx` such as `401`.
- Every request has a timeout and a bounded retry count; the values live in the module's design doc.
- Missing config (e.g. `OPENROUTER_API_KEY`) fails at startup via env validation, before any request.

## 4. Naming and Coding Standards

- Files/folders kebab-case; types, classes, React components PascalCase (no `I` prefix); functions and
  variables camelCase, verbs for functions; constants and env vars UPPER_SNAKE_CASE.
- YAML actions/fields camelCase; diagnostic codes `E` + 3 digits (syntax doc); Prisma models PascalCase
  singular; REST routes `/api/v1/` + plural kebab nouns; tests `<name>.test.ts`, E2E `<flow>.spec.ts`.
- Status strings everywhere: Run `queued | running | passed | failed`; Step
  `pending | running | passed | failed`; locate method `selector | visual | dom`.
- TypeScript `strict`, no `any` (use `unknown` and narrow), no `@ts-ignore` without a linked issue.
- Prefer discriminated unions over optional-field soup; exhaustive `switch` with a `never` check.
- Small single-purpose modules matching the module table in each design doc.
- **KISS and YAGNI:** the simplest design that meets the issue and its design doc; no options, layers,
  or extension points for needs that don't exist yet. Exception: interfaces a design doc defines, or
  that exist for dependency injection and test fakes (e.g. `JevClient`, `BrowserDriver`).
- Return typed results for expected failures; throw only for programmer or infrastructure errors.
  Never swallow errors.
- Everything is in English. Comments explain *why*. Public `core` functions get a one-line TSDoc.

## 5. Testing

| Package | Framework | Coverage | Focus |
| --- | --- | --- | --- |
| `core` | Vitest | ≥ 80% lines | Every module; Syntax Analyzer via fixtures |
| `backend` | Vitest + supertest | ≥ 60% lines | Queue order, auth header, event emission |
| `cli` | Vitest | key paths | Output, `--json`, exit codes 0/1/2 |
| `frontend` | Vitest + Playwright Test | critical flows | Login → edit → validate → run → history |

- **TDD:** red → green → refactor, one behavior at a time. For red, first add the export with its real
  signature and an empty body, so the test fails on an assertion, not on "Cannot find module".
- **One behavior per test,** and the test asserts everything its name claims. Check what goes out, not
  only what comes back (request URL, headers, the screenshot in the Jev body). Every failure case in
  the design doc gets its own test. Coverage is a floor, not the goal.
- Unit tests never call the real Jev API; inject a fake Harness. Real Jev calls run only in the
  benchmark suite and in `@live` tests: `*.live.test.ts` next to their fixtures, wrapped in
  `describe.skipIf(!process.env.OPENROUTER_API_KEY)`, run with `pnpm test:live`.
- Browser tests run against local HTML fixtures or `demo-app`, never external sites.
- Fixture layouts and naming are defined in each module's design doc.
- A bug fix includes a test that fails before the fix.
- CI runs `pnpm lint`, `pnpm typecheck`, `pnpm test` on every PR; all must pass.

## 6. Scrum and Git Workflow

- Every change starts from a GitHub Issue (epics with sub-issues) in the **Sprint 1/2** milestones. If
  none exists, ask a maintainer or create one. Read the issue and the relevant `docs/tech/*.md` first.
- If a Core module has no design doc, write it from `docs/tech/TEMPLATE.md` first and get it reviewed in
  a separate PR. Update affected docs and diagrams in the same PR as any behavior or interface change.
- Branches: `type/<issue#>-short-description` from `main` (`feature`, `fix`, `docs`, `test`,
  `refactor`, `chore`). Commits: Conventional Commits with scope and issue; see the hook and template.
- **Before finishing,** check every requirement in the PRD section and design doc your change
  implements, and list anything not done in the PR body.
- PRs: title in commit format; body has `Closes #<issue>`, summary, how it was tested, unimplemented
  requirements, UI screenshots. Aim for under ~400 changed lines.
- Merge: CI green + one approving review from the other teammate; squash merge; no pushes to `main`.
- **AI agents may branch, commit, push, and open PRs, but never merge or approve a PR, force-push to
  `main`, or change branch protection.**
- `TODO`/`FIXME` always reference an issue: `// TODO(#42): ...`.

## 7. Do's and Don'ts

- **Do** match design-doc interfaces exactly; use `yaml`'s `parseDocument` + `LineCounter`; use `zod`
  for REST bodies, runner messages, and env; use Playwright auto-waiting locators with `timeoutMs`; use
  Server Components by default and shadcn/ui + Tailwind before custom CSS; use native `fetch` and
  `node:` built-ins; ask when a requirement is unclear.
- **Don't** validate test files with zod or any schema library (loses positions).
- **Don't** add LLM planning (`ai`, `aiAct`) or a general-purpose LLM at runtime; those keys stay `E005`.
  Don't import Midscene, LangChain, or other agent frameworks.
- **Don't** add Jest, axios, moment, whole lodash, jQuery, or CSS-in-JS. Justify every new dependency in
  the PR.
- **Don't** use `page.waitForTimeout()` except for `sleep`, put binaries in Postgres, or put business
  logic in React components.
- **Don't** commit `.env`, reports, traces, `node_modules`, or build output.

### 7.1 Security

- Secrets come from env only; keep `.env.example` with names, never values; never `NEXT_PUBLIC_` a
  secret. Never log passwords, tokens, or resolved `{{VAR}}` values. Hash passwords (bcrypt/argon2).
- Every route and server action checks authentication **and ownership** (scope queries by `userId`):
  `401` when unauthenticated, `429` with a cooldown message over the Run rate limit.
- The runner requires `RUNNER_SHARED_SECRET`; WebSocket tokens are short-lived and Run-scoped.
- Validate and size-limit uploaded `.yaml`; Prisma queries only, no raw SQL strings.
- Server-side sandboxing is out of scope (PRD `Won't`); don't build it, don't weaken existing checks.

### 7.2 Accessibility (WCAG 2.1 AA)

- Keyboard reachable with visible focus; every field has a `<label>`, errors via `aria-describedby`.
- Never status by color alone; live step updates in `aria-live="polite"`; meaningful `alt` text;
  4.5:1 contrast; semantic HTML before ARIA.
