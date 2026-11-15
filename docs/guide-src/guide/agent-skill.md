# Agent Skill

The **jevwright-test-files** Agent Skill teaches your coding agent, such as Claude Code, Codex, Cursor, GitHub Copilot or
Antigravity, to write Jevwright test files in our syntax. With it, you describe a test in your words and the agent
writes a valid file, using selectors where your page has them, descriptions where it does not, and Variables for your
URL and secrets.

The skill is a folder in the open [Agent Skills](https://agentskills.io) format: a `SKILL.md` file with the rules, a
longer reference, and example files that we check against Jevwright's Syntax Analyzer on every change, so the skill
always matches the syntax.

[Browse the skill on GitHub](https://github.com/yike2/Jevwright/tree/main/skills/jevwright-test-files)

## What it covers

- The shape of a test file, every action and check, and every field.
- When to use a `selector`, a `target`, or both, and a Playwright `assert` or a `statement`.
- `{{VARIABLES}}`, which come from your Project's Variables in the web workspace.
- `headers`, `cookies`, `localStorage` and `sessionStorage`, to start a test already signed in.
- Every diagnostic code, and what a failed step's reason means.
- Never using the planning keys of other tools, such as `ai` or `aiAct`, which Jevwright refuses.

For anything the skill leaves out, it points the agent at this guide and at the
[syntax design document](https://github.com/yike2/Jevwright/blob/main/docs/tech/syntax-analyzer.md) on GitHub.

## Install it

1. Download the folder `skills/jevwright-test-files` from the
   [repository](https://github.com/yike2/Jevwright/tree/main/skills/jevwright-test-files), for example by downloading the
   repository as a ZIP file and taking that folder out of it.
2. Copy the whole folder, keeping its name, into the skills folder your agent reads, in the project you write tests in:

| Agent | Folder in your project |
| --- | --- |
| Claude Code | `.claude/skills/jevwright-test-files/` |
| GitHub Copilot in VS Code | `.github/skills/jevwright-test-files/` |
| Codex, Cursor, Antigravity, and other agents that support Agent Skills | `.agents/skills/jevwright-test-files/` |

Most agents can also load skills from a folder in your home directory, for every project; see your agent's
documentation for its exact location.

3. Start a new session of your agent. It lists its skills at the start and uses this one when you ask for a Jevwright
   test.

## Use it

Ask in your own words, and say what the agent needs to know:

> Write a Jevwright test for https://shop.example.com: sign in as the test user (password in the TEST_PASSWORD
> Variable), add the first product to the cart, and check that the cart shows one item.

Then:

1. Upload the file to the web workspace, and set the Variables the agent names on the Project.
2. If the **Debug console** lists problems, copy its lines and paste them back to the agent: "Fix these Jevwright
   diagnostics". It fixes every one and returns the corrected file.
3. Run the file. If a step fails, paste its reason to the agent with what the step's screenshot shows.

The [General workflow](./workflow.md) walks through these steps, with what can go wrong at each one.
