# Sprint 1: Core Runner, CLI, and Benchmark

| | |
| --- | --- |
| Dates | 2026-11-01 – 2026-11-08 (planning 2026-10-26 – 2026-10-30) |
| Milestone | [Sprint 1](https://github.com/yike2/Jevwright/milestone/1) |
| Standups | [GitHub Discussions](https://github.com/yike2/Jevwright/discussions) |
| Partners | Yike Li ([@yike2](https://github.com/yike2)), Zhimin Gan ([@Min-gzm](https://github.com/Min-gzm)) |

## Goal

A working Core: parse a `.yaml` test file, run it in Chromium, locate elements with a selector, Jev Visual Locate, or Jev DOM Locate, judge assertions, write a report, and run it all from a CLI against a benchmark suite.

## Planning (2026-10-26 – 2026-11-8)

We wrote the [PRD](../PRD.md) together, prioritized it with MoSCoW, split the work into Epics with user stories and acceptance criteria, estimated the issues, and set up the shared rules file [AGENTS.md](../../AGENTS.md). We assigned issues by module so that each of us owned whole modules with clear interfaces.

Our schedules did not overlap much: Zhimin worked mostly on 11-01 – 11-04 and Yike on 11-05 – 11-08. We planned for that on purpose: Zhimin took the modules everything else depends on, and Yike the modules that build on them.

The technical plan is one design document per Core module in [docs/tech/](../tech/), written from a shared [template](../tech/TEMPLATE.md) before the module's code:

| Module | Design document |
| --- | --- |
| Syntax Analyzer | [syntax-analyzer.md](../tech/syntax-analyzer.md) |
| Browser Adapter | [browser-adapter.md](../tech/browser-adapter.md) |
| Executor | [executor.md](../tech/executor.md) |
| Report | [report.md](../tech/report.md) |
| Jev Harness | [jev-harness.md](../tech/jev-harness.md) |
| Element Locator | [locator.md](../tech/locator.md) |
| Asserter | [asserter.md](../tech/asserter.md) |
| Run Pipeline | [pipeline.md](../tech/pipeline.md) |
| CLI | [cli.md](../tech/cli.md) |
| Demo App and benchmark | [benchmark.md](../tech/benchmark.md) |

## Retrospective

### What we delivered

| Area | Issues | Owner |
| --- | --- | --- |
| Syntax Analyzer | #9 | Zhimin |
| Browser Adapter, Report, Executor | #8, #10, #23 | Zhimin |
| Demo App and benchmark suite | #29, #30, #31 | Zhimin |
| Core fixes: screenshots after CSS transitions, shadow DOM, small Visual Locate targets | #59, #61, #62 | Zhimin |
| Jev Harness | #7 | Yike |
| Element Locator, Asserter, Run Pipeline | #37, #38, #39, #43 | Yike |
| CLI (`validate`, `run`) | #11 | Yike |
| CI workflow and ESLint | #32, #33 | Yike |

### What went well

- **Design documents first.** Every module got a document in `docs/tech/` from a shared [template](../tech/TEMPLATE.md) before any code. With little schedule overlap, the documents were our hand-off: Yike built the Locator and Asserter on Zhimin's Browser Adapter and Executor from their documents, without waiting for answers.
- **TDD with Copilot.** Giving Copilot one design document per task, and committing the failing tests before asking it to implement, kept its output close to the design. The order docs → test → feat is visible in the git history.
- **Benchmark early.** Having the Demo App and the benchmark suite in Sprint 1 let us measure Jev's locating accuracy and latency instead of guessing.
- **Strict commit and PR conventions.** The commit-msg hook and AGENTS.md kept the history readable for both of us and for the AI agent.

### What didn't go well

- **Documents drifted from the code.** The PRD described an `xpath` field, while the Syntax Analyzer settled on `selector` and `target`. Some decisions made during implementation did not make it back into the PRD and other module documents right away, so we sometimes worked from an outdated version.
- **Copilot needed close review.** It invented package versions and data formats, edited files outside the task (including committed tests), and wrapped too much code in one `try/catch`. Reviewing every plan and diff before accepting it cost time but caught these.
- **Little live overlap.** Working in sequence meant questions waited until the other partner was online, and a mistake in an early module would have blocked the later ones.
- **Some cases stayed open.** A few edge cases (off-screen elements, a local integration-test timeout, #57) were left as follow-ups.

### What we will change in Sprint 2

- Update the design document in the same PR as any change to an interface, and treat the repository, not old copies, as the source of truth.
- Keep Copilot prompts strict: list the files it may change, forbid editing tests, and ask for a plan before changes.
- Write in GitHub Discussions and PR comments first, then send a short WeChat message as a reminder, so decisions are recorded and still seen quickly.

### Partner feedback

#### Yike → Zhimin

Zhimin knows how to run a software project. He wrote a design document for each module before letting Copilot implement anything, which made the AI's output predictable and gave me a precise interface to build on while he was offline. He finished the foundation modules (Syntax Analyzer, Browser Adapter, Executor, Report) early in the sprint, so my modules never waited on his. Building the Demo App and a benchmark that classifies results as stable, flaky, or wrong was a step beyond what the assignment asked and gave us real data for tuning the Locator.

To improve: when a decision changes an interface during implementation, update the PRD and the dependent documents right away, so the other partner does not build on an older version.

#### Zhimin → Yike

Yike built the half of the Core module that makes our project more than plain Playwright. She was always open with me when her work touched my code. Before she changed anything of mine, she told me in a post or a message, and we talked about the design together. Because of that, our code fit together and we had few conflicts.

To improve: It would be great to see Yike lead a feature from the beginning, from what users need to how the whole system is designed. I think it would help her grow in both product and technical design.