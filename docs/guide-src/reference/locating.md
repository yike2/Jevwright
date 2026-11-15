# Locating elements

Every element action (`click`, `doubleClick`, `rightClick`, `hover`, `input`) needs a `selector`, a `target`, or both.

| You write | What happens | Jev called |
| --- | --- | --- |
| `selector` | Playwright finds the element. The step fails if nothing matches within the timeout | Never |
| `target` | Jev finds the element you described: first from a screenshot (Visual Locate), then, if unsure, from a list of the page's elements (DOM Locate) | Always |
| `selector` and `target` | Playwright tries the selector first; only when it matches nothing does Jev find the target | Only when the selector fails |

The report records which way worked for each step: `selector`, `visual` or `dom`.

## `selector`

A selector is any [Playwright selector](https://playwright.dev/docs/other-locators): CSS such as `#email` or
`[data-test="checkout"]`, XPath such as `//button[@type='submit']`, or text such as `text=Sign in`. It is fast, free,
and does the same thing every time.

```yaml
- click:
    selector: '[data-test="checkout"]'
- input:
    selector: "//input[@name='email']"
    value: "{{TEST_EMAIL}}"
- click:
    selector: "text=Sign in"
```

Copy selectors from the real page: in your browser's developer tools, look for a test id (`data-test`, `data-testid`),
an `id`, or a `name`. Avoid long chains of classes and positions such as `div > div:nth-child(3) > span`, which break
when the layout changes.

## `target`

A target describes the element as a person would see it: what kind of element it is, its text, its color, and where it
is.

```yaml
- click:
    target: "Green 'Login' button below the password field"
- click:
    target: "'Add to cart' button of the Sauce Labs Backpack"
- input:
    target: "Search field in the header"
    value: "backpack"
```

A good target names one element only. "The button" is ambiguous on most pages; "The blue 'Checkout' button below the
cart total" is not. Jev's answer must have a confidence of at least 0.7, or it counts as no answer. When both Visual and
DOM Locate fail, the step fails with one line per way that was tried:

```text
Could not locate "Green 'Login' button below the password field":
  visual — confidence 0.4 below 0.7
  dom — Jev chose no candidate
```

Each Jev call takes a few seconds, and its answers can vary between Runs. Use a target where there is no stable
selector, such as third-party widgets or generated markup, or as a fallback.

## Both

With both, the selector runs first, and the target is the fallback when the selector matches nothing, for example after
a redesign renamed an id:

```yaml
- click:
    selector: "#login-btn"
    target: "Green 'Login' button below the password field"
```

The step passes, the report shows `visual` or `dom` instead of `selector`, and your test file stays as you wrote it:
Jevwright never rewrites or "heals" a file. Update the selector when you see the fallback in a report, so the step is
fast again.

A step with neither a selector nor a target is refused: `Needs at least one of "selector" and "target"`
([E008](./diagnostics.md#e008)).
