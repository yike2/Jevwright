# Waiting and assertions

`waitFor` waits until something is true; `assert` checks that it is. Both use Playwright for exact checks of an
element or the URL, and Jev for conditions written in words.

## `waitFor`

`waitFor` takes exactly one of these fields, and waits up to the step's `timeoutMs`:

| Field | Waits until | Jev called |
| --- | --- | --- |
| `selector` | The element is visible | Never |
| `url` | The URL matches the pattern | Never |
| `condition` | Jev judges the condition true; Jev looks at the page about once a second | Once per look |

```yaml
- waitFor:
    selector: '[data-test="inventory-list"]'
- waitFor:
    url: "**/checkout-complete.html"
- waitFor:
    condition: "The spinner is gone and the order summary is shown"
```

A `waitFor` that runs out of time fails: `"[data-test="inventory-list"]" did not become visible within 15000ms`,
`The URL did not match "**/checkout-complete.html" within 15000ms; it was "…"`, or `Condition did not hold within
15000ms (last noul=0.1)`.

## `assert`

An `assert` has a **Playwright check**, a **statement**, or both.

| Fields | Checks | Jev called |
| --- | --- | --- |
| `selector` | The element is visible | Never |
| `selector` and `text` | The element contains the text, case-sensitive | Never |
| `url` | The URL matches the pattern | Never |
| `statement` | Jev judges the statement from a screenshot | Always |
| A check and `statement` | The check first; if it fails, Jev judges the statement | Only when the check fails |

### Playwright checks

```yaml
- assert:
    selector: '[data-test="shopping-cart-badge"]'
- assert:
    selector: '[data-test="total-label"]'
    text: "Total: $32.39"
- assert:
    url: "**/inventory.html"
```

They are fast, free and exact. Use them for text, URLs and visibility. A check that fails says what it found:

```text
Text of "[data-test="total-label"]" did not contain "Total: $99.99" within 3000ms; it was "Total: $32.39"
```

### Statements

A statement is a sentence about the page that Jev judges true or false from a screenshot:

```yaml
- assert:
    statement: "The cart lists two items, each with a price"
- assert:
    statement: "The error message is shown in red below the password field"
```

Jev rates how likely the statement is true, from 0 to 1, shown in reasons as `noul`. At 0.8 or more the step passes;
at 0.2 or less it fails with `Statement does not hold (noul=0.05)`. In between, Jev is asked once more, and if it is
still unsure the step fails with `Statement is uncertain after 2 asks (noul=0.5)`.

Write statements about what is visible on the screen, one claim each, and specific: "The cart has one item" rather
than "The cart looks right". Statements suit checks of meaning and layout that a selector cannot express. Each takes a
few seconds, and the answer can vary between Runs, so keep exact checks as Playwright checks.

### Both

With a check and a statement, the check runs first. When it fails, including when its selector matches nothing, Jev
judges the statement, and the step passes if the statement holds:

```yaml
- assert:
    selector: ".welcome-banner"
    text: "Welcome"
    statement: "A welcome banner is shown at the top of the page"
```

When both fail, the reason has both parts, separated by `;`.

### Rules

- An `assert` needs a statement or a check: `Needs "statement" or a check: "selector" (optionally with "text") or "url"`.
- `text` needs a `selector`: `"text" needs "selector"`.
- One check only: `Use either "selector" or "url" as the check, not both`.

See [Diagnostics](./diagnostics.md) for these and every other problem.
