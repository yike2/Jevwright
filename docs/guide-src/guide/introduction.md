# Introduction

Jevwright runs web tests that you write as short YAML files. A test file lists steps, such as "open this page", "type
this into the email field", "click the Login button" and "check that the page says Products". Playwright, the browser
automation library, does every step in a real Chromium browser. Jev, a small and fast vision model, is asked one short
question only when a step needs it: to find an element you described in words, or to judge a statement about the page.

You write, run and read tests in the **web workspace**: an editor with your test files, a Run button, and a report with
a screenshot of every step.

## A first test file

```yaml
name: "Sign in"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/"
  - input:
      selector: '[data-test="username"]'
      value: "standard_user"
  - input:
      selector: '[data-test="password"]'
      value: "{{SWAG_PASSWORD}}"
  - click:
      selector: '[data-test="login-button"]'
      target: "Green Login button below the password field"
  - assert:
      selector: '[data-test="title"]'
      text: "Products"
```

`{{BASE}}` and `{{SWAG_PASSWORD}}` are Variables: values you set once on the Project, so the file never holds a URL
that changes or a password.

## How a step runs

| The step has | What happens |
| --- | --- |
| A `selector` only | Playwright finds the element. Jev is never called; the step fails if nothing matches |
| A `target` only | Jev looks at a screenshot and points at the element you described (Visual Locate). If it is unsure, Jev picks one element from a short list of the page's elements (DOM Locate) |
| Both | Playwright tries the `selector` first. Only when it matches nothing is Jev asked to find the `target` |
| An `assert` with a Playwright check | Playwright checks that an element is visible, contains a text, or that the URL matches |
| An `assert` with a `statement` | Jev judges the statement, such as "The cart lists two items", from a screenshot |

The report records how each element was found: `selector`, `visual` or `dom`. Your test file is never rewritten: when a
selector goes stale and its `target` saves the step, the report shows it, and the file stays as you wrote it.

## When to use it

Jevwright suits tests of a web app's main journeys: signing in, searching, filling a form, buying something. Use
selectors where the page has stable ones, since they are fast, free and do the same thing every time. Use a `target`
where there is no stable selector or the page changes often, and a `statement` for checks that are easier to say in
words than to write as a selector.

Jevwright is not a test planner: no model decides what to do next. The steps are yours, and keys such as `ai` or
`aiAct`, which other tools use to let a model drive the browser, are refused when the file is checked.

## What a Run can reach

Runs happen on the Jevwright server, which reaches **public** web addresses only. Your app must be on a public domain:
`localhost`, private IP addresses, an intranet or a VPN-only host cannot be tested. A page behind a sign-in needs a
session the test can set up, such as a cookie or a token; see [Quick start](./quick-start.md#test-your-own-app).

## Next steps

- [Quick start](./quick-start.md): try every feature on the Demo App in a few minutes.
- [General workflow](./workflow.md): from your own app to a passing Run, with what can go wrong at each step.
- [YAML syntax](../reference/test-file.md): everything a test file can contain.
