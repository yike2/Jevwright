# Agent Skill

The **jevwright-test-files** Agent Skill teaches your coding agent, such as Claude Code, Codex, Cursor, GitHub Copilot or
Antigravity, to write Jevwright test files: the file shape, every action, `selector` or `target`, Playwright checks or
a `statement`, `{{VARIABLES}}`, and cookies or tokens to skip a sign-in. Its examples are checked against Jevwright's
Syntax Analyzer on every change, so it always matches the syntax. Its source is
[skills/jevwright-test-files](https://github.com/yike2/Jevwright/tree/main/skills/jevwright-test-files) on GitHub.

## Install it

Copy this prompt and send it to your agent. It downloads the skill and sets it up wherever that agent keeps its skills.

```text
Install the Agent Skill "jevwright-test-files" for writing Jevwright web test files.
Download these files from GitHub and keep their paths, inside a folder named jevwright-test-files
in the place where you keep your skills (for this project, or for all my projects):

https://raw.githubusercontent.com/yike2/Jevwright/main/skills/jevwright-test-files/SKILL.md
https://raw.githubusercontent.com/yike2/Jevwright/main/skills/jevwright-test-files/references/syntax.md
https://raw.githubusercontent.com/yike2/Jevwright/main/skills/jevwright-test-files/examples/dialogs-tabs-and-page-actions.yaml
https://raw.githubusercontent.com/yike2/Jevwright/main/skills/jevwright-test-files/examples/find-and-judge-by-description.yaml
https://raw.githubusercontent.com/yike2/Jevwright/main/skills/jevwright-test-files/examples/sign-in-with-a-form.yaml
https://raw.githubusercontent.com/yike2/Jevwright/main/skills/jevwright-test-files/examples/start-signed-in-with-a-cookie.yaml
https://raw.githubusercontent.com/yike2/Jevwright/main/skills/jevwright-test-files/examples/start-signed-in-with-a-token.yaml

Do not change the files. Then tell me where you put them, and use the skill whenever I ask for a Jevwright test.
```

## Use it

1. Describe the test in your words, with your app's URL and how the test signs in: "Write a Jevwright test for
   https://shop.example.com: sign in as the test user, add the first product to the cart, and check that the cart
   shows one item."
2. The agent writes the YAML. Upload it to the web workspace and set the Variables it names on the Project.
3. If the **Debug console** lists problems, copy its lines and paste them back to the agent; it fixes every one.

The [General workflow](./workflow.md) walks through these steps, with what can go wrong at each one.
