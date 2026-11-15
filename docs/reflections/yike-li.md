# Reflection: Yike Li

In Project 2, Zhimin and I built Jevwright, a web testing platform that uses the small Jev model to locate elements and judge assertions. My parts were the AI runtime of the Core in Sprint 1 (Jev Harness, Element Locator, Asserter, Run Pipeline, and CLI) and, in Sprint 2, the web frontend, the E2E setup, and the deployment and CI/CD pipeline.

The biggest lesson was that AI-assisted development is mostly context engineering. Copilot was fast but unreliable whenever it had to guess: it invented package versions and data formats, edited files outside the task, and even changed committed tests. What worked was writing the design document first, with interfaces, accessible names, and expected outputs, then committing failing tests, and only then giving Copilot that one document with a strict prompt that asked for a plan before any change. Reviewing every plan and diff became my main job, and TDD turned from a rule into a safety net that let me accept AI-written code with confidence.

The second lesson was about infrastructure. Deploy previews, environments, and automatic deployment first looked like extras, but once they worked we could merge many PRs in the last days without a single manual deploy. The problems I did not expect, such as parallel Docker builds running the server out of memory, a home network blocking our domain, a test that fails only on macOS, and a placeholder API key showing up as HTTP 401, taught me to confirm the symptom first and check one layer at a time instead of guessing.

Working with Zhimin showed me how an experienced engineer runs a project: design documents and API contracts before code, so that two people with little schedule overlap can still build on each other's work.

If I did it again, I would spread my work across each sprint instead of compressing it into the last days, and agree on a design system before building pages, so the UI would not be styled twice.
