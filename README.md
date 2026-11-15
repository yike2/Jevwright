# Jevwright

Jevwright is an AI-assisted web testing platform built on Jev and Playwright. Tests are short declarative `.yaml` files instead of raw Playwright scripts, so people and AI coding agents can write them quickly. At run time, Jev, a small structured-output model, locates elements and judges assertions written in natural language, so tests keep working when the UI changes. Because Jev is much faster and cheaper than a general-purpose LLM, a team can run its full suite on every change.

## Live

| What | URL |
| --- | --- |
| Web app | https://app.94.72.126.118.sslip.io |
| User guide | https://yike2.github.io/Jevwright/guide/ |
| REST API | https://api.94.72.126.118.sslip.io/api/v1 |
| API docs (Swagger UI) | https://api.94.72.126.118.sslip.io/api/v1/docs, also at https://yike2.github.io/Jevwright/api/ |
| Demo App (the site the benchmark tests) | https://demo.94.72.126.118.sslip.io |
| PR preview | https://preview.94.72.126.118.sslip.io (the latest PR whose CI passed) |

Merging to `main` deploys the app automatically; see [Deployment and CI/CD](#deployment-and-cicd).

## Features

- **Accounts**: register and sign in with email and password (JWT). Each user sees only their own projects.
- **Workspace**: organize test files in Projects and folders (up to 4 levels, counting the Project) in the sidebar; create, rename, move, and delete them, and upload `.yaml` files or whole folders by drag and drop.
- **Quick Start project**: every new account gets a `Quick Start` project with ready-to-run examples against the Demo App, in learning order: passing tests, failing tests that show why they fail, invalid files to fix, and tests that locate and judge with Jev.
- **Editor**: write or upload a `.yaml` test file, validate it with line-numbered errors before any browser starts, save it, and run it on the server.
- **Project variables**: values such as `BASE` or passwords that test files reference as `{{NAME}}`, stored per project.
- **Live progress**: step-by-step status, timings, and screenshots stream over WebSocket while a run executes.
- **History and reports**: every run is kept with its steps, locate methods, screenshots, a downloadable JSON report, and a Playwright trace.
- **Files overview**: all test files with their latest run status.
- **CLI**: `jevwright validate` and `jevwright run` for local development, CI, and AI agents.
- **Public API**: everything the web app does, documented with OpenAPI.

## Architecture

| Diagram | Where |
| --- | --- |
| Layered architecture | [docs/archify/jevwright-architecture/index.html](docs/archify/jevwright-architecture/index.html) (open in a browser) |
| Run sequence | [docs/archify/jevwright-sequence/index.html](docs/archify/jevwright-sequence/index.html) |
| Database schema (ER diagram) | [docs/tech/backend.md](docs/tech/backend.md), section 3.3 |

In short: the **Core** (`src/core`) parses a test file, drives Chromium through Playwright, locates elements (selector → Jev Visual Locate → Jev DOM Locate), judges assertions, and writes a report. The **CLI** (`src/cli`) and the **Backend** (`src/app/backend`, Express + PostgreSQL via Prisma) both run tests through the Core. The **Frontend** (`src/app/frontend`, Next.js + Tailwind CSS) talks only to the Backend's REST API and WebSocket.

Tech stack: TypeScript, Next.js, React, Tailwind CSS, shadcn/ui, Node.js, Express, PostgreSQL, Prisma, JWT, Playwright, Vitest, Docker Compose, Caddy, GitHub Actions.

## Getting started

Requirements: Node.js 22+, pnpm (`npm install -g pnpm`), and Docker (for PostgreSQL when running the backend locally).

```bash
git clone https://github.com/yike2/Jevwright.git
cd Jevwright
pnpm install
pnpm exec playwright install --with-deps chromium   # browser for runs and tests; system libraries need sudo
```

`pnpm install` also sets up the git commit template, the commit-msg hook, and nano (wrapping at 72 chars) as the commit editor (see [Commit messages](#commit-messages)). These settings apply to this repository only.

## Configuration

Copy [`.env.example`](.env.example) to `.env` and fill it in. `.env` is git-ignored; never commit it.

| Variable | Needed for |
| --- | --- |
| `OPENROUTER_API_KEY` | `jevwright run`, the backend, `pnpm benchmark`, `pnpm test:live`: everything that calls Jev |
| `SWAG_PASSWORD` | Benchmark test files; the Demo App's password is `secret_sauce` |
| `DATABASE_URL` | The backend (PostgreSQL connection string) |
| `JWT_SECRET` | The backend; at least 32 characters |
| `CORS_ORIGIN` | The backend; the frontend's origin, `http://localhost:3000` locally |
| `DEMO_APP_URL` | The backend; the Demo App that new Quick Start projects use as their `BASE` variable |

The remaining variables have defaults or are only used for deployment; see the comments in `.env.example`.

## Running locally

### Web app (frontend + backend)

1. Start PostgreSQL in Docker, apply the migrations, and run the backend. The full guide, including the debugger and troubleshooting, is [docs/deploy/backend-local.md](docs/deploy/backend-local.md):

   ```bash
   docker compose -f compose.dev.yaml up -d postgres
   pnpm --filter @jevwright/backend exec prisma migrate deploy   # again after pulling new migrations
   pnpm backend                                                  # http://127.0.0.1:4000/api/v1
   ```

2. In another terminal, start the frontend:

   ```bash
   pnpm frontend         # Next.js dev server on port 3000
   ```

3. Open **http://localhost:3000** (not `127.0.0.1:3000`: the backend's CORS default is `http://localhost:3000`).

The frontend reads the API URL from `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:4000/api/v1`); see [docs/tech/frontend.md](docs/tech/frontend.md). To run tests against a local Demo App, see [docs/deploy/demo-app.md](docs/deploy/demo-app.md).

### CLI

```bash
pnpm jevwright validate tests/login.yaml   # check a test file without a browser
pnpm jevwright run tests/login.yaml        # run it; add --headed to watch the browser
```

`run` writes each file's report, trace, and screenshots to `jevwright-reports/<timestamp>/`. The CLI only reads files inside the working directory. See [docs/tech/cli.md](docs/tech/cli.md) for the output and exit codes, and [docs/tech/syntax-analyzer.md](docs/tech/syntax-analyzer.md) for the test file format.

To run the benchmark suite against the deployed Demo App instead of a local one, override `BASE`:

```bash
BASE=https://demo.94.72.126.118.sslip.io pnpm jevwright run src/tests/benchmark/suite/target/sign-in.yaml
```

### Benchmark

The benchmark runs the suite in [`src/tests/benchmark/suite/`](src/tests/benchmark/suite/) against a local copy of the Swag Labs demo shop, with the real Jev:

```bash
pnpm benchmark                 # every folder: selector, target, both, atomic, assert (about 10 minutes)
pnpm benchmark target atomic   # only the folders you name
```

It serves the demo shop itself, runs each file once, and runs a file again when it is not right the first time. It prints pass rates per folder, Flow group, and tag, judging accuracy, and Jev step latency, then saves the summary to `benchmark-results/<timestamp>.json` (git-ignored), with each file's outcome (`stable`, `flaky`, or `wrong`) so two runs can be compared file by file. The reports of every try are in `benchmark-results/<timestamp>/`.

`pnpm test` also checks the suite without Jev: every file analyzes, and every `selector/` Flow passes. See [docs/tech/benchmark.md](docs/tech/benchmark.md) for the suite layout, the tags, and the metrics.

## Tests

```bash
pnpm test:unit          # unit tests
pnpm test:integration   # integration tests (Core with a real browser, Backend with PostgreSQL)
pnpm test               # both; never calls Jev
pnpm test:e2e           # Playwright E2E: the real frontend and backend; needs Docker with PostgreSQL running
pnpm test:live          # tests that call the real Jev; skipped without OPENROUTER_API_KEY
pnpm typecheck && pnpm lint && pnpm format:check
```

The E2E setup and conventions are in [docs/tech/e2e.md](docs/tech/e2e.md); the full list of test cases is in [docs/testing/test-cases.md](docs/testing/test-cases.md).

## Deployment and CI/CD

Production runs on one VPS with Docker Compose: PostgreSQL, the backend, a browser container, the frontend, the Demo App, and Caddy for HTTPS. [`.github/workflows/ci.yml`](.github/workflows/ci.yml) is a multi-stage pipeline:

1. **Checks** on every push and PR: typecheck, lint and format, unit tests, integration tests (with a PostgreSQL service), and a `pnpm audit` security scan.
2. **Frontend build**.
3. **E2E tests** against the built frontend and a real backend.
4. **Deploy**: a push to `main` deploys to production through the `production` environment; a PR from this repository deploys to the single-slot preview environment through the `preview` environment. Each deploy ends with a health check.

| Guide | Covers |
| --- | --- |
| [docs/deploy/ci-cd.md](docs/deploy/ci-cd.md) | The pipeline, environments and secrets, the preview environment, manual deploys |
| [docs/deploy/backend-local.md](docs/deploy/backend-local.md) | Running the backend locally |
| [docs/deploy/backend-prod.md](docs/deploy/backend-prod.md) | Deploying the backend to a server |
| [docs/deploy/frontend-prod.md](docs/deploy/frontend-prod.md) | Deploying the frontend |
| [docs/deploy/demo-app.md](docs/deploy/demo-app.md) | The Demo App, locally and in production |

## Documentation

| Document | Contents |
| --- | --- |
| [docs/submission.md](docs/submission.md) | Project 2 deliverables and where to find each one |
| [docs/PRD.md](docs/PRD.md) | Product requirements, user stories, MoSCoW priorities |
| [docs/api/openapi.json](docs/api/openapi.json) | OpenAPI specification of the REST API |
| [docs/guide-src/](docs/guide-src/) | Sources of the [user guide](#user-guide), built into `docs/guide/` |
| [docs/tech/](docs/tech/) | One design document per module: [syntax-analyzer](docs/tech/syntax-analyzer.md), [jev-harness](docs/tech/jev-harness.md), [locator](docs/tech/locator.md), [asserter](docs/tech/asserter.md), [executor](docs/tech/executor.md), [browser-adapter](docs/tech/browser-adapter.md), [report](docs/tech/report.md), [pipeline](docs/tech/pipeline.md), [cli](docs/tech/cli.md), [backend](docs/tech/backend.md), [frontend](docs/tech/frontend.md), [design-system](docs/tech/design-system.md), [e2e](docs/tech/e2e.md), [benchmark](docs/tech/benchmark.md) |
| [docs/deploy/](docs/deploy/) | Setup and deployment guides (see above) |
| [docs/sprints/](docs/sprints/) | Sprint retrospectives |
| [docs/contributions.md](docs/contributions.md) | Partner contribution log |
| [docs/reflections/](docs/reflections/) | Individual reflections |
| [AGENTS.md](AGENTS.md) | Shared rules for the AI coding assistant and for us |

## User guide

The user guide at https://yike2.github.io/Jevwright/guide/ explains the web workspace and the YAML syntax for users. It is a [VitePress](https://vitepress.dev) site: the Markdown sources are in [docs/guide-src/](docs/guide-src/), and `pnpm docs:build` builds them into [docs/guide/](docs/guide/), which GitHub Pages serves from `main`'s `/docs` folder like the rest of `docs/`.

To change the guide:

1. Edit the Markdown in `docs/guide-src/` (the sidebar and nav are in `docs/guide-src/.vitepress/config.mts`).
2. Preview it with `pnpm docs:dev`, which serves the guide with live reload at the URL it prints, or build it and serve the build with `pnpm docs:build` and `pnpm docs:preview`.
3. Run `pnpm docs:build` and commit the sources together with `docs/guide/`.

The annotated screenshots in `docs/guide-src/public/screenshots/` come from `docs/guide-src/screenshots.ts`: with the backend, `pnpm frontend` and the Demo App running locally ([docs/deploy/backend-local.md](docs/deploy/backend-local.md)) and a database without `you@example.com`, run `pnpm docs:screenshots` to retake them all, then `pnpm docs:build`. The Jev file it runs needs a real `OPENROUTER_API_KEY`.

Every YAML example in the guide is checked by the Syntax Analyzer in `src/tests/unit/docs/guide.test.ts`: a block passes unless the line before it is `<!-- invalid: E005 -->` with the codes it must fail with, followed by a `text` block with the Debug console's lines. CI fails when `docs/guide/` differs from a fresh build; run `pnpm docs:build` to fix it.

### Agent Skill

[skills/jevwright-test-files/](skills/jevwright-test-files/) is an [Agent Skill](https://agentskills.io) that teaches coding agents to write Jevwright test files. The guide's [Agent Skill page](https://yike2.github.io/Jevwright/guide/guide/agent-skill.html) explains how to install it. Its example files and YAML blocks are checked by `src/tests/unit/docs/agent-skill.test.ts`.

## AI-assisted development

Both partners worked in **VS Code with GitHub Copilot** as the AI IDE harness, guided by the shared rules file [AGENTS.md](AGENTS.md), which both of us maintained throughout the project.

- **Context engineering**: before any code, each feature got a design document in `docs/tech/`, with the interface, accessible names, expected helper outputs, and test cases. Each Copilot task started a new chat with only that document attached and the paths of the other files it needed, so the agent worked from the agreed design instead of guessing.
- **AI-assisted TDD**: Copilot's Agent mode wrote code and Ask mode answered read-only questions. Prompts limited which files it could change, forbade editing committed tests, and asked it to list anything the docs did not cover as open questions and to show its plan before making changes. The git history shows the order for each feature: `docs(...)` → failing `test(...)` → `feat(...)`.
- **Review**: we reviewed every plan and diff before accepting it, ran the checks ourselves, and reviewed each other's pull requests. Typical problems we caught were invented version numbers and data formats, changes to files outside the task, and missed edge states.
- **Design discussions**: we used Claude in a chat window to talk through design questions, such as the CI/CD and preview environment design, and to review plans.

## Team

**Yike Li** ([@yike2](https://github.com/yike2))

- Sprint 1: Jev Harness (#7), Element Locator (#37), Asserter (#38), Run Pipeline (#39, #43), CLI (#11), and the first CI workflow and ESLint (#32, #33).
- Sprint 2: the web frontend's features, from the Next.js scaffold and API client to login, sidebar, editor, live progress, history and reports, files overview, and rename/delete (#78–#84, #97, #98); deployment to the VPS (#85), automatic deployment (#86), the multi-stage pipeline (#101), and PR previews (#102).

**Zhimin Gan** ([@Min-gzm](https://github.com/Min-gzm))

- Sprint 1: Syntax Analyzer (#9), Browser Adapter (#8), Report (#10), Executor (#23), the Demo App and benchmark suite (#29–#31), and Core fixes (#59, #61, #62).
- Sprint 2: the whole backend, from design to auth, workspace API, Runs, Live Progress, private network blocking, and OpenAPI (#64–#71); the architecture diagrams (#72); sequential image builds on the server (#105); the frontend design system, light and dark themes, landing page, Quick Start project, and code-editor layout (#110–#112).

**Together**

- The PRD, sprint planning, and the shared rules file [AGENTS.md](AGENTS.md).
- E2E: Yike set up Playwright E2E in CI with the first feature tests; Zhimin wrote the full test-case list and extended the suite against the Demo App (#104).
- The frontend: Yike built the features first; Zhimin then reworked the visual design and UX on top of them.
- Reviewing each other's pull requests.

Commit counts and the full PR list are in [docs/contributions.md](docs/contributions.md).

## Commit messages

Every commit message must follow [Conventional Commits](https://www.conventionalcommits.org) with a scope and the issue number:

```
<type>(<scope>): <summary> (#<issue>)

<description>           (optional)
```

- **Type**: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, or `ci`.
- **Scope**: the area changed, in lowercase, e.g. `core`, `syntax`, `jev`, `locator`, `assert`, `playwright`, `cli`, `backend`, `frontend`, `db`, `benchmark`.
- **Summary**: imperative; the whole title line is at most 72 characters.
- **Issue**: the GitHub issue this commit belongs to. To close an issue, put `Closes #<issue>` in the PR description.
- **Description**: optional. What changed and why.

Example:

```
feat(locator): fall back to DOM locate on low confidence (#42)

Visual Locate often returns low confidence on icon-only buttons,
so retry with DOM Locate before failing the step.
```

See [AGENTS.md](AGENTS.md) section 6 for branches and pull requests.

### How it works

- `git commit` (without `-m`) opens the template [`.gitmessage`](.gitmessage) in your editor. Lines starting with `#` are hints and are removed automatically.
- The hook [`.githooks/commit-msg`](.githooks/commit-msg) checks every commit, including `git commit -m`. If the title does not match `type(scope): summary (#issue)`, the title is longer than 72 characters, or the second line is not blank, the commit is rejected with a message explaining why. Titles generated by git that start with `Merge` or `Revert` skip the format check.

### Manual setup

If you cloned without running `pnpm install`, or the hook isn't working, run this in the repository root:

```bash
git config core.hooksPath .githooks
git config commit.template .gitmessage
git config core.editor "nano --breaklonglines --fill=72"
```

Check that it's set:

```bash
git config --get core.hooksPath    # .githooks
git config --get commit.template   # .gitmessage
```
