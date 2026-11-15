# Jevwright syntax reference

The full rules behind [SKILL.md](../SKILL.md). When this file disagrees with the syntax's design document, the design
document wins: https://github.com/yike2/Jevwright/blob/main/docs/tech/syntax-analyzer.md

## Top-level fields

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `name`* | non-empty text | – | |
| `description` | non-empty text | – | |
| `baseUrl` | absolute URL | – | `https://…` or a Variable such as `{{BASE}}` |
| `timeoutMs` | positive integer | `15000` | per step, milliseconds |
| `runTimeoutMs` | positive integer | `600000` | the whole Run; the server caps a Run at 10 minutes |
| `headers` | map of name → text | – | sent to the `baseUrl`'s origin only (every origin without a `baseUrl`) |
| `cookies` | map of name → text or cookie object | – | needs `baseUrl` |
| `localStorage` | map of name → text | – | needs `baseUrl` |
| `sessionStorage` | map of name → text | – | needs `baseUrl` |
| `steps`* | non-empty list | – | |

Integers are plain decimal digits, at most 2147483647. Text fields cannot be empty, except `input`'s `value` and a
dialog's `text`. In the browser state maps, `{}` is allowed, numbers and booleans read as their text, header and cookie
names use letters, digits and `` - _ . ! # $ % & ' * + ^ ` | ~ ``, and a header value is on one line.

## Cookie object

| Field | Type | Default |
| --- | --- | --- |
| `value`* | text, may be `""` | – |
| `domain` | the `baseUrl`'s host or a parent of it, with or without a leading `.` | the `baseUrl`'s host |
| `path` | text starting with `/` | `/` |
| `httpOnly` | `true` or `false` | `false` |
| `secure` | `true` or `false` | `true` for an `https` `baseUrl` |
| `sameSite` | `Strict`, `Lax` or `None` (`None` needs `secure: true`) | `Lax` |

```yaml
name: "Cookie object"
baseUrl: "https://app.example.com"
cookies:
  session:
    value: "{{SESSION}}"
    domain: ".example.com"
    httpOnly: true
    sameSite: "Lax"
steps:
  - open:
      url: "/"
```

## Steps

A step is a map with exactly one key, the action. Its value is a map of fields (`{}` for none). YAML anchors and
aliases work; merge keys (`<<`) do not.

| Action | Fields (`*` required) | Runs |
| --- | --- | --- |
| `open` | `url`*, `dialog` | goes to the URL |
| `back` / `forward` | `dialog` | history; fails when there is no entry |
| `reload` | `dialog` | reloads |
| `press` | `key`*, `dialog` | presses a key on the focused element |
| `scroll` | `direction`* `up`\|`down`\|`left`\|`right`, `distance`* | scrolls the page by pixels |
| `sleep` | `ms`* | waits a fixed time |
| `switchTab` | `url`* | makes the one tab matching the pattern current; fails if none or several match |
| `click` / `doubleClick` / `rightClick` / `hover` | `selector`, `target` (at least one), `dialog` | acts on the element |
| `input` | `value`*, `selector`, `target` (at least one), `dialog` | replaces the field's value |
| `waitFor` | exactly one of `condition`, `selector`, `url` | waits up to `timeoutMs` |
| `assert` | `statement`; or a check: `selector` (+ `text`) or `url`; or a check and `statement` | checks |

`dialog` is a map: `accept`* (`true`/`false`), `text` (only with `accept: true`), `message` (must be contained in the
dialog's text, case-sensitive).

```yaml
- click:
    selector: "#delete"
    dialog:
      accept: true
      message: "Delete this task?"
- waitFor:
    selector: "#toast"
- assert:
    selector: "#toast"
    text: "Deleted"
    statement: "A message confirms that the task was deleted"
```

## URL rules

- Absolute: starts with `scheme://` or `{{`. `localhost:3000/x` is relative.
- `baseUrl` must be absolute. `open`'s `url` may be relative only with a `baseUrl`.
- Patterns (`waitFor`, `assert`, `switchTab`): without `*`, the whole URL must match; `*` is any characters except `/`,
  `**` is any characters. A pattern starting with `*` needs no `baseUrl`; any other relative one does.

## Diagnostics

The web workspace's Debug console shows each as `Line <n>: <message>` with its code.

| Code | Meaning | Messages |
| --- | --- | --- |
| `E001` | Not valid YAML | the YAML parser's message, such as `Tabs are not allowed as indentation` |
| `E002` | Root not a map, or `steps` not a non-empty list | `The root must be an object`, `"steps" must be a non-empty array` |
| `E003` | Missing required field | `Missing required field "<field>"` |
| `E004` | Unknown field | `Unknown field "<field>"` |
| `E005` | Unknown action, including planning keys | `Unknown action "<action>"` |
| `E006` | Not exactly one action in a step | `Step must contain exactly one action, found <actions>` |
| `E007` | Wrong type or value | `"<field>" must be a non-empty string`, `… must be a positive integer up to 2147483647`, `… must be true or false`, `… must be one of …`, `"url" is relative, so the test needs a "baseUrl"`, `"baseUrl" must be an absolute URL, such as "https://example.com"`, `Cookie "<name>" is for "<domain>", which is not the host of the baseUrl …` |
| `E008` | Fields that do not fit together | `Needs at least one of "selector" and "target"`, `Needs exactly one of "condition", "selector" and "url"`, `Needs "statement" or a check: …`, `Use either "selector" or "url" as the check, not both`, `"text" needs "selector"`, `"text" needs "accept: true"`, `"sameSite: None" needs "secure: true"`, `"cookies" needs a "baseUrl": …` |
| `E009` | Invalid name in a browser state map | `Header name "<name>" is not valid: …`, `… names must not be empty`, `… names must be text, not a list or an object` |

Fix every diagnostic the user pastes, then re-check the whole file: one mistake can hide another, such as an `E001`
that stops every other check.

## Failure reasons

When a Run fails, the failed step's reason says why. Change the file only when the reason points at it:

| Reason starts with | Meaning | Usually |
| --- | --- | --- |
| `No element matches "<selector>" within <n>ms` | the selector matched nothing | wrong selector: use one from the real page, or add a `target` |
| `"<selector>" was found but could not be clicked` | hidden, disabled or covered | the app: close a banner or wait first |
| `Could not locate "<target>":` | Jev could not find the target | describe the element more precisely, or add a `selector` |
| `Text of "<selector>" did not contain` | wrong text | the app, or the expected text |
| `The URL did not match` | the page did not navigate as expected | the app, or an earlier step (often the sign-in) |
| `Statement does not hold` / `Statement is uncertain` | Jev judged the statement false / could not decide | the app, or a vague statement |
| `Condition did not hold within` | a `waitFor` `condition` never held | the app, or the condition |
| `Unexpected alert dialog` | a dialog the step does not answer | add `dialog` to the step that opens it |
| `Variable {{NAME}} is not set` | the Project lacks the Variable | the user sets it in the workspace |
| `The page did not finish loading` | slow page | raise `timeoutMs` |
| `net::ERR_…` | the server cannot reach the app | the app must be on a public domain |
