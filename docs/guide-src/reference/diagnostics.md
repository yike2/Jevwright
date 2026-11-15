# Diagnostics

Every test file is checked when it is saved, uploaded and run. The **Debug console** lists every problem at once, each
as `Line <line>: <message>` with its code. A file with problems cannot run. This page explains each code, with an
example file, what the Debug console shows for it, and how to fix it.

When an agent wrote the file, paste the Debug console's lines back to it: the messages say what to change.

## E001 YAML syntax error {#e001}

The file is not valid YAML, so nothing else can be checked yet. Common causes: a tab used for indentation, a field on
the same line as its action, or a missing quote.

<!-- invalid: E001 -->
```yaml
name: "Syntax"
steps:
  - click: selector: "#save"
```

```text
Line 3: Nested mappings are not allowed in compact mappings
```

**Fix:** put each field on its own line, indented under its action with spaces, never tabs:

```yaml
name: "Syntax"
steps:
  - click:
      selector: "#save"
```

## E002 Invalid root {#e002}

The file is not a set of fields, or `steps` is not a list with at least one step.

<!-- invalid: E002 -->
```yaml
name: "No steps yet"
steps: []
```

```text
Line 2: "steps" must be a non-empty array
```

**Fix:** add at least one step under `steps:`, each starting with `- `.

## E003 Missing required field {#e003}

A field that the action or the file needs is missing, such as `name`, an `input`'s `value`, or a dialog's `accept`.

<!-- invalid: E003 -->
```yaml
name: "Missing value"
steps:
  - input:
      selector: "#email"
```

```text
Line 3: Missing required field "value"
```

**Fix:** add the field the message names.

## E004 Unknown field {#e004}

The file or a step has a field that Jevwright does not know, often a typo or a field from another tool.

<!-- invalid: E004 -->
```yaml
name: "Unknown field"
steps:
  - assert:
      selector: "#status"
      colour: "green"
```

```text
Line 5: Unknown field "colour"
```

**Fix:** remove the field, or correct its spelling. The fields of each action are listed in [Actions](./actions.md),
and the top-level fields in [Test file](./test-file.md#top-level-fields). To check a color or a layout, use a
[`statement`](./assertions.md#statements).

## E005 Unknown action {#e005}

The step's action is not one of the [15 actions](./actions.md). Planning actions of other tools, such as `ai`, `aiAct` or
`aiTap`, are refused: in Jevwright you write the steps, and no model decides them.

<!-- invalid: E005 -->
```yaml
name: "Planning"
steps:
  - aiAct: "sign in as the standard user"
```

```text
Line 3: Unknown action "aiAct"
```

**Fix:** write the steps yourself, one action each:

```yaml
name: "Planning"
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
      target: "Green Login button"
```

## E006 Invalid step {#e006}

A step is not an object with exactly one action: it has two actions, none, or its fields are not under the action.

<!-- invalid: E006 -->
```yaml
name: "Two actions"
steps:
  - click:
      selector: "#a"
    input:
      selector: "#b"
      value: "x"
```

```text
Line 3: Step must contain exactly one action, found "click" and "input"
```

**Fix:** split it into two steps, each starting with `- `.

## E007 Wrong type or invalid value {#e007}

A field has a value of the wrong kind: a number that is not a positive whole number, an empty text, a relative URL
without a `baseUrl`, a value that is not one of the allowed ones, or a cookie for another site.

<!-- invalid: E007, E007, E007 -->
```yaml
name: "Values"
timeoutMs: 0
steps:
  - open:
      url: "/login"
  - scroll:
      direction: "sideways"
      distance: 300
```

```text
Line 2: "timeoutMs" must be a positive integer up to 2147483647
Line 5: "url" is relative, so the test needs a "baseUrl"
Line 7: "direction" must be one of up, down, left, right
```

**Fix:** use the value the message asks for: here a `timeoutMs` such as `10000`, a `baseUrl` such as `"{{BASE}}"` for
the relative URL, and a `direction` of `up`, `down`, `left` or `right`.

## E008 Invalid field combination {#e008}

Fields that need each other, or that exclude each other, do not fit: an element action with neither `selector` nor
`target`, a `waitFor` with more than one field, `text` without `accept: true` in a dialog, `cookies` or storage without
a `baseUrl`, or `sameSite: None` without `secure: true`.

<!-- invalid: E008, E008 -->
```yaml
name: "Combinations"
cookies:
  session-username: "standard_user"
steps:
  - open:
      url: "https://shop.example.com/"
  - click: {}
```

```text
Line 2: "cookies" needs a "baseUrl": they are set for the baseUrl's origin
Line 7: Needs at least one of "selector" and "target"
```

**Fix:** give the element action a `selector` or a `target`, and give the file a `baseUrl` for its cookies:

```yaml
name: "Combinations"
baseUrl: "https://shop.example.com"
cookies:
  session-username: "standard_user"
steps:
  - open:
      url: "/"
  - click:
      target: "Shopping cart icon at the top right"
```

## E009 Invalid name {#e009}

A name in `headers`, `cookies`, `localStorage` or `sessionStorage` is empty, a list, or, for a header or cookie, has a
character that HTTP does not allow, such as a space.

<!-- invalid: E009 -->
```yaml
name: "Header name"
baseUrl: "https://shop.example.com"
headers:
  X Tenant: "acme"
steps:
  - open:
      url: "/"
```

```text
Line 4: Header name "X Tenant" is not valid: use letters, digits, and - _ . ! # $ % & ' * + ^ ` | ~
```

**Fix:** write header and cookie names with letters, digits and `-`, such as `X-Tenant`.

## Every message

| Code | Messages |
| --- | --- |
| `E001` | The YAML parser's message, such as `Tabs are not allowed as indentation` |
| `E002` | `The root must be an object`; `"steps" must be a non-empty array` |
| `E003` | `Missing required field "<field>"` |
| `E004` | `Unknown field "<field>"` |
| `E005` | `Unknown action "<action>"` |
| `E006` | `Step must contain exactly one action, found <actions>`; `Step must be an object with exactly one action` |
| `E007` | `"<field>" must be a non-empty string`; `"<field>" must be a positive integer up to 2147483647`; `"<field>" must be true or false`; `"<field>" must be one of …`; `"baseUrl" must be an absolute URL, such as "https://example.com"`; `"url" is relative, so the test needs a "baseUrl"`; `"<field>" must be an object`; `Header "<name>" must be on one line`; `Cookie "<name>" must be a string or an object with "value"`; `Cookie "<name>" is for "<domain>", which is not the host of the baseUrl "<baseUrl>" or a parent of it` |
| `E008` | `Needs at least one of "selector" and "target"`; `Needs exactly one of "condition", "selector" and "url"`; `Needs "statement" or a check: "selector" (optionally with "text") or "url"`; `Use either "selector" or "url" as the check, not both`; `"text" needs "selector"`; `"text" needs "accept: true"`; `"sameSite: None" needs "secure: true"`; `"cookies" needs a "baseUrl": they are set for the baseUrl's origin` |
| `E009` | `Header names must not be empty`; ``Header name "<name>" is not valid: use letters, digits, and - _ . ! # $ % & ' * + ^ ` \| ~``; `Header names must be text, not a list or an object` (and the same for `Cookie` and `Storage` names) |
