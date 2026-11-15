---
name: jevwright-test-files
description: Writes and fixes Jevwright web test files, the declarative .yaml tests that Jevwright runs with Playwright and the Jev model (actions such as open, click, input, waitFor and assert, with selector or target, Playwright checks or a statement, {{VARIABLES}}, and headers, cookies, localStorage or sessionStorage to skip a sign-in). Use when the user asks for a Jevwright test, a .yaml test for the Jevwright web workspace, or pastes problems from its Debug console.
---

# Writing Jevwright test files

Jevwright runs web tests written as YAML files. Playwright performs every step in Chromium on the Jevwright server;
Jev, a small vision model, is asked only to find an element described in words (`target`) or to judge a sentence about
the page (`statement`). The user uploads your file to the Jevwright web workspace and runs it there.

You write the steps. Jevwright has no planning: never use keys such as `ai`, `aiAct`, `aiTap` or `aiQuery`, and never
leave it to a model to decide what to do. Jevwright refuses them (`E005`).

## Workflow

1. Ask what to test, the app's URL, and how a test gets past the sign-in (a test user, or a cookie or token). The app
   must be on a **public** domain: Runs cannot reach `localhost`, private IPs, an intranet or a VPN.
2. Look at the real page when you can (its HTML, or the user's description) and prefer its stable attributes:
   `data-test`, `data-testid`, `id`, `name`. Never invent selectors you have not seen; use a `target` instead, or both.
3. Write one file per journey, following the rules below and the [syntax reference](references/syntax.md).
4. Check the file against the rules and the reference before handing it over: every key, field name and value.
5. Tell the user which Variables to set on the Project (such as `BASE`, `TEST_PASSWORD`) and their meaning, never their
   secret values.
6. When the user pastes lines from the web workspace's **Debug console** (`Line <n>: <message>` and a code such as
   `E004`), fix **every** one, and return the whole corrected file. When a Run fails, read the step's reason (see
   "Failure reasons" in the reference) and change the file only if the reason points at the file.

## File shape

```yaml
name: "Sign in"                # required
description: "A test user signs in"
baseUrl: "{{BASE}}"            # the start of relative URLs
timeoutMs: 15000               # per step, default 15000
steps:                         # required, at least one
  - open:
      url: "/"
  - input:
      selector: '[data-test="username"]'
      value: "{{TEST_USER}}"
  - click:
      selector: '[data-test="login-button"]'
      target: "Green 'Login' button below the password field"
  - assert:
      selector: '[data-test="title"]'
      text: "Products"
```

Top-level fields: `name`*, `description`, `baseUrl`, `timeoutMs`, `runTimeoutMs`, `headers`, `cookies`, `localStorage`,
`sessionStorage`, `steps`*. Nothing else.

Each step is **one** action key with its fields indented under it. An action without fields is `{}`, as in
`- back: {}`. Quote text values; use single quotes around selectors that contain double quotes.

## Actions

| Action | Fields (`*` required) |
| --- | --- |
| `open` | `url`*, `dialog` |
| `back`, `forward`, `reload` | `dialog` |
| `press` | `key`* (Playwright key name, case-sensitive: `Enter`, `Tab`, `Control+A`), `dialog` |
| `scroll` | `direction`* (`up`, `down`, `left`, `right`), `distance`* (pixels) |
| `sleep` | `ms`* (prefer `waitFor`) |
| `switchTab` | `url`* (pattern of the tab to make current) |
| `click`, `doubleClick`, `rightClick`, `hover` | `selector` and/or `target` (at least one), `dialog` |
| `input` | `value`* (`""` clears), `selector` and/or `target`, `dialog` |
| `waitFor` | exactly one of `condition` (Jev), `selector` (visible), `url` (pattern) |
| `assert` | `statement` (Jev) and/or one Playwright check: `selector` (visible, optionally with `text`) or `url` |

Numbers (`timeoutMs`, `runTimeoutMs`, `ms`, `distance`) are positive whole numbers in plain digits.

## `selector`, `target`, or both

- `selector` only: a Playwright selector (CSS `#email`, `[data-test="checkout"]`, XPath, `text=Sign in`). Fast, free,
  repeatable; Jev is never called. Use it whenever the page has a stable selector.
- `target` only: a description of one element as a person sees it: kind, visible text, color, position, such as
  `"Blue 'Checkout' button below the cart total"`. Jev finds it from a screenshot. Use it when no stable selector exists.
- Both: the selector first, and Jev finds the target only when the selector matches nothing. Use it when you are not
  sure the selector is right or stable.

## Playwright `assert` or `statement`

- Exact text, URL or visibility: a Playwright check (`selector`, `selector` + `text`, or `url`). Always prefer these.
- Meaning or layout that a selector cannot express: `statement`, one specific visible claim, such as
  `"The cart lists two items, each with a price"`. Jev judges it from a screenshot.
- Both: the check runs first, and Jev judges the statement only if the check fails.

```yaml
- assert:
    url: "**/cart.html"
- assert:
    statement: "The cart lists the Sauce Labs Backpack with its price"
```

## URLs

Absolute: starts with `scheme://` or a Variable (`{{BASE}}`). Anything else is relative and needs `baseUrl`. `open`'s
`url` may be relative only with a `baseUrl`. `waitFor`, `assert` and `switchTab` take a pattern: no `*` means the whole
URL; `*` matches anything except `/`, `**` anything; a pattern starting with `*` (such as `**/inventory.html`) works
without a `baseUrl`.

## Variables

Write `{{NAME}}` (capital letters, digits, `_`) for the app's URL and for every password, token and session value.
They come from the **Project's Variables** in the web workspace, which the user sets; every file in the Project uses
them. Never put a real secret in the file.

## Skipping the sign-in

When the sign-in has a CAPTCHA, 2FA or bot protection, or to save time, start the test signed in. Each field is a map
of names to text values set before the first step; `cookies`, `localStorage` and `sessionStorage` need a `baseUrl`.

```yaml
name: "Signed in"
baseUrl: "{{BASE}}"
headers:
  Authorization: "Bearer {{API_TOKEN}}"
cookies:
  session: "{{SESSION_COOKIE}}"
localStorage:
  authToken: "{{API_TOKEN}}"
steps:
  - open:
      url: "/account"
```

A cookie can also be an object with `value`*, `domain`, `path`, `httpOnly`, `secure`, `sameSite` (`Strict`, `Lax`,
`None`; `None` needs `secure: true`). The user copies the values from their browser's developer tools after signing in,
into Project Variables; they expire, so the Variables need updating.

## Dialogs and tabs

A native alert, confirm or prompt is answered by the step that opens it: `dialog: { accept: true }`, with optional
`text` (prompt input, only with `accept: true`) and `message` (text the dialog must contain). A dialog the step does
not answer fails it. A tab the page opens is not current until `switchTab` selects it by URL.

```yaml
- click:
    target: "Delete button in the 'Write release notes' row"
    dialog:
      accept: true
      message: "Delete this task?"
- click:
    selector: "a[target=_blank]"
- switchTab:
    url: "**/help"
```

## Examples

Valid files, checked against Jevwright's Syntax Analyzer:

- [examples/sign-in-with-a-form.yaml](examples/sign-in-with-a-form.yaml): selectors, a target fallback, Variables.
- [examples/start-signed-in-with-a-cookie.yaml](examples/start-signed-in-with-a-cookie.yaml): `cookies` to skip the
  sign-in, then a checkout.
- [examples/start-signed-in-with-a-token.yaml](examples/start-signed-in-with-a-token.yaml): `headers`, `localStorage`
  and `sessionStorage` for a single-page app.
- [examples/find-and-judge-by-description.yaml](examples/find-and-judge-by-description.yaml): `target`, `waitFor`
  with a `condition`, and statements.
- [examples/dialogs-tabs-and-page-actions.yaml](examples/dialogs-tabs-and-page-actions.yaml): dialogs, tabs, and every
  page and element action.

## Mistakes to avoid

- Keys from other tools: `ai`, `aiAct`, `aiTap`, `aiQuery`, `aiAssert`, `xpath`, `timeout`, `expect` (E004, E005).
- Two actions in one step, or fields at the step level instead of under the action (E006).
- `text` in an `assert` without `selector`; `selector` and `url` together in one `assert`; more than one field in
  `waitFor` (E008).
- An element action with neither `selector` nor `target` (E008).
- A relative URL without `baseUrl`; `localhost:3000` without `http://` (E007).
- A number that is not a positive whole number in plain digits: `timeoutMs: 0`, `1e3`, `1000.0`, or a quoted `"5000"` (E007).
- Cookies or storage without `baseUrl` (E008).

## Authoritative sources

When something is not covered here, look it up instead of guessing:

- The YAML syntax in the user guide:
  - test file: https://yike2.github.io/Jevwright/guide/reference/test-file.html
  - actions: https://yike2.github.io/Jevwright/guide/reference/actions.html
  - locating: https://yike2.github.io/Jevwright/guide/reference/locating.html
  - waiting and assertions: https://yike2.github.io/Jevwright/guide/reference/assertions.html
- Every diagnostic and its fix: https://yike2.github.io/Jevwright/guide/reference/diagnostics.html
- General workflow, with what can go wrong at each step: https://yike2.github.io/Jevwright/guide/guide/workflow.html
- The syntax's design document, the source of truth for fields and diagnostics:
  https://github.com/yike2/Jevwright/blob/main/docs/tech/syntax-analyzer.md
- The Syntax Analyzer's code, for edge cases: https://github.com/yike2/Jevwright/tree/main/src/core/syntax
- Valid example files, each with the result it parses to:
  https://github.com/yike2/Jevwright/tree/main/src/tests/integration/core/syntax/fixtures/valid
- Invalid example files, each with its expected diagnostics:
  https://github.com/yike2/Jevwright/tree/main/src/tests/integration/core/syntax/fixtures/invalid
