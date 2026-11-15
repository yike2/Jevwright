# Contribution Log

Who did what in Jevwright, by partner and sprint. The sprint retrospectives in [sprints/](sprints/) describe how we worked together.

| Partner | GitHub |
| --- | --- |
| Yike Li | [@yike2](https://github.com/yike2) |
| Zhimin Gan | [@Min-gzm](https://github.com/Min-gzm) (earlier commits appear as `min`, `x`, and `Phaethon`; [`.mailmap`](../.mailmap) maps them to one name) |

## Summary

As of 2026-11-15, on `main`:

| | Yike Li | Zhimin Gan |
| --- | --- | --- |
| Merged pull requests | 24 | 15 |
| Commits, excluding merges | 99 | 238 |

The two numbers point in different directions because we commit at different granularity, so neither one alone measures the work. The areas and issues below show what each of us owned.

To check the numbers yourself:

```bash
git shortlog -sn --no-merges main
```

- Pull requests by author: [Yike](https://github.com/yike2/Jevwright/pulls?q=is%3Apr+author%3Ayike2), [Zhimin](https://github.com/yike2/Jevwright/pulls?q=is%3Apr+author%3AMin-gzm)
- Reviews: [by Yike](https://github.com/yike2/Jevwright/pulls?q=is%3Apr+reviewed-by%3Ayike2), [by Zhimin](https://github.com/yike2/Jevwright/pulls?q=is%3Apr+reviewed-by%3AMin-gzm)

## Planning and setup (2026-10-26 – 2026-10-30)

| Partner | Work | PRs |
| --- | --- | --- |
| Both | The PRD and its MoSCoW priorities, the Epics with user stories, acceptance criteria and estimates, and issue assignment | — |
| Yike | The shared rules file AGENTS.md and its update after the first tests; the Locator design | #16, #19, #20 |
| Zhimin | Repository setup; the first version of the Syntax Analyzer | #18, #14 |

## Sprint 1 (2026-11-01 – 2026-11-08): Core runner, CLI, benchmark

| Partner | Work | Issues | PRs |
| --- | --- | --- | --- |
| Zhimin | Syntax Analyzer | #9 | #25 |
| Zhimin | Browser Adapter (Playwright) | #8 | #26 |
| Zhimin | Executor | #23 | #27 |
| Zhimin | Report | #10 | #47 |
| Zhimin | Swag Labs Demo App | #29 | #48 |
| Zhimin | Benchmark suite and run, Core fixes (screenshots after CSS transitions, shadow DOM, small Visual Locate targets) | #30, #31, #59, #61, #62 | #63 |
| Yike | GitHub Actions CI workflow | #32 | #34 |
| Yike | Jev Harness | #7 | #35 |
| Yike | Element Locator | #37 | #40 |
| Yike | Asserter | #38 | #42 |
| Yike | Wiring the Locator and Asserter into the run step; Run Pipeline design | #43, #39 | #44, #49 |
| Yike | CLI and its integration tests | #11 | #51, #52 |
| Yike | Snapshot fix, ESLint and Prettier, flaky browser tests | #53, #33, #57 | #54, #55, #58 |

## Sprint 2 (2026-11-08 – 2026-11-15): backend, web frontend, CI/CD

| Partner | Work | Issues | PRs |
| --- | --- | --- | --- |
| Zhimin | Backend design, package, configuration, and API skeleton | #64, #65 | #74 |
| Zhimin | Backend auth, workspace API, Runs, Live Progress, private network blocking, OpenAPI and Swagger UI, architecture diagrams | #66 – #72 | #76 |
| Yike | Next.js scaffold and API client | #78 | #88 |
| Yike | Login and register | #79 | #89 |
| Yike | Workspace sidebar | #80 | #93 |
| Yike | YAML editor with validate, save, upload, run, and project variables | #81 | #94 |
| Yike | Live test process, test history and reports | #82, #83 | #95 |
| Yike | Playwright E2E setup and the full-flow E2E test | #84 | #92 |
| Yike | Files overview, rename and delete in the sidebar | #97, #98 | #99 |
| Yike | Deployment to the VPS with Docker Compose and Caddy | #85 | #91 |
| Yike | Multi-stage CI pipeline, security scan, automatic deployment | #101, #86 | #103 |
| Yike | PR preview environment | #102 | #107 |
| Zhimin | Sequential image builds on the server | #105 | #106 |
| Zhimin | E2E test-case list and suite against the Demo App | #104 | #109 |
| Zhimin | Plain-language messages, Test File naming, Save keeping the source | #110 | #115 |
| Zhimin | Design system, light and dark themes, landing page, Quick Start project | #111 | #116 |
| Zhimin | Code-editor layout with highlighting, inline diagnostics, and side panels | #112 | #120 |
| Yike | README, sprint retrospectives, this contribution log | #122 | — |

## Shared work

- **Planning**: the PRD, Epics, estimates, and both sprint plans were done together.
- **E2E**: Yike set up Playwright E2E in CI with the first feature tests; Zhimin wrote the full test-case list ([docs/testing/test-cases.md](testing/test-cases.md)) and extended the suite.
- **Frontend**: Yike built the features; Zhimin then reworked the visual design and UX on top of them.
- **Reviews**: each of us reviewed the other's pull requests before merging.
- **Communication**: standups in GitHub Discussions, decisions in PR and issue comments, and a short WeChat message as a reminder when something needed the other's attention.
