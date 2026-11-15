# Sprint 2: Backend, Web Frontend, and CI/CD

| | |
| --- | --- |
| Dates | 2026-11-08 – 2026-11-15 |
| Milestone | [Sprint 2](https://github.com/yike2/Jevwright/milestone/2) |
| Standups | [GitHub Discussions](https://github.com/yike2/Jevwright/discussions) |
| Partners | Yike Li ([@yike2](https://github.com/yike2)), Zhimin Gan ([@Min-gzm](https://github.com/Min-gzm)) |

## Goal

Turn the Core into a full-stack platform: a backend with accounts, a workspace, queued Runs, Live Progress, and a documented API; a web frontend for editing, running, and reviewing tests; E2E tests; and a pipeline that tests every PR, deploys previews, and deploys `main` to production.

Zhimin worked on this sprint from 11-08 to 11-15, starting with the backend; Yike worked mostly from 11-13 to 11-15 on the frontend, E2E, and deployment, building on the finished backend.

## What we delivered

| Area | Issues | Owner |
| --- | --- | --- |
| Backend: design, auth, workspace API, Runs, Live Progress, private network blocking, OpenAPI and Swagger UI | #64 – #71 | Zhimin |
| Architecture diagrams | #72 | Zhimin |
| Frontend features: scaffold and API client, login, sidebar, editor and variables, live progress, history and reports, files overview, rename and delete | #78 – #84, #97, #98 | Yike |
| Deployment to the VPS with Docker Compose and Caddy | #85 | Yike |
| Automatic deployment on merge, multi-stage pipeline, security scan, PR previews | #86, #101, #102 | Yike |
| Sequential image builds on the server | #105 | Zhimin |
| E2E test-case list and suite against the Demo App | #104 | Zhimin, on Yike's E2E setup |
| Design system, light and dark themes, landing page, Quick Start project, code-editor layout, clearer messages | #110, #111, #112 | Zhimin |

At the end of the sprint we ran both user journeys on production: the CLI against the deployed Demo App (selector suite and Jev Visual Locate) and the Web UI (create, run, watch live, review history and reports).

## What went well

- **The API contract first.** The backend shipped with an OpenAPI document and Swagger UI before the frontend started. The frontend generated its types from it, so the two halves met without integration surprises, even though we built them at different times.
- **TDD stayed visible under time pressure.** Every frontend feature went docs → failing unit/E2E tests → feat, even in the last three days. E2E tests locate by role and accessible name, and those names are listed in `docs/tech/frontend.md`, so a redesign could change the look without breaking the tests.
- **CI/CD as a safety net.** Once tests ran on every PR and merges deployed automatically, we could merge many PRs on the last days without manual deploys, and preview each PR before merging.
- **Fast recovery on infrastructure problems.** When parallel Docker builds ran the server out of memory, we switched to sequential builds (#105) and added swap within a day.
- **Polish on top of working features.** Zhimin's design pass came after the features worked and were covered by tests, so it improved the UX without regressions.

## What didn't go well

- **Compressed schedule on the frontend side.** Yike's part landed in the last three days, which left little slack for review and made the end of the sprint stressful.
- **Styling was done twice.** The first frontend PRs used hard-coded colors because there was no design system yet; the later design pass replaced them. Agreeing on design tokens before building pages would have saved that work.
- **Very large PRs at the end.** The design pass touched about 170 files across a few PRs, which is hard to review carefully on the last day.
- **Environment surprises.** A home network blocked `sslip.io` over HTTPS, so production had to be tested over a phone hotspot; a placeholder API key in a local `.env` showed up as HTTP 401 from Jev; one benchmark file (`sort-products`) fails only on macOS, because a native `<select>` popup there does not receive key presses, while it passes on the Linux server.
- **Documentation drift again.** For example, `docs/deploy/backend-prod.md` names a different deploy path from the one the server uses.

## What we would change next time

- Agree on the design system and the PR size limit at sprint planning, before building UI.
- Spread each partner's work across the sprint instead of concentrating it at one end.
- Keep a short environment checklist (API key format, network, OS differences) next to the setup guides.
- Keep reviewing design documents together whenever an interface changes.

## Partner feedback

### Yike → Zhimin

Zhimin finished the whole backend early in the sprint, with an OpenAPI document and Swagger UI, so I could build the frontend against a stable, documented contract. When our deploys ran out of memory on the server, he fixed the build and added swap quickly. He then wrote a complete list of E2E test cases, extended the suite against the Demo App, and gave the frontend a consistent design system, themes, a landing page, and a Quick Start project that lets a new user run a test within a minute. His reviews of my PRs were careful and helped me a lot throughout the project.

To improve: split large changes into smaller PRs so they are easier to review, and mention it before changing files the other partner owns (such as the Playwright config), even when the change is small.

### Zhimin → Yike

> TODO (Zhimin): what went well and what could improve, in a few sentences.
