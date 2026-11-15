# Actions

A step is one of 15 actions. **Page actions** act on the page and never call Jev. **Element actions** act on one element,
found by a `selector`, a `target`, or both (see [Locating elements](./locating.md)). **Waiting and assertions** check the
page with Playwright, or ask Jev to judge a statement (see [Waiting and assertions](./assertions.md)).

`*` marks a required field.

| Action | Kind | Fields |
| --- | --- | --- |
| `open` | page | `url`*, `dialog` |
| `back`, `forward`, `reload` | page | `dialog` |
| `press` | page | `key`*, `dialog` |
| `scroll` | page | `direction`*, `distance`* |
| `sleep` | page | `ms`* |
| `switchTab` | page | `url`* |
| `click`, `doubleClick`, `rightClick`, `hover` | element | `selector` and/or `target`, `dialog` |
| `input` | element | `value`*, `selector` and/or `target`, `dialog` |
| `waitFor` | wait | exactly one of `condition`, `selector`, `url` |
| `assert` | assert | `statement`, and/or a Playwright check: `selector` (with `text`) or `url` |

## Page actions

### `open`

Opens a URL. A relative `url` is added to the file's `baseUrl`.

```yaml
- open:
    url: "/login"
```

### `back`

Goes back one page in the tab's history. The step fails if there is no page to go back to.

```yaml
- back: {}
```

### `forward`

Goes forward one page in the tab's history. The step fails if there is none.

```yaml
- back: {}
- forward: {}
```

### `reload`

Reloads the page.

```yaml
- reload: {}
```

### `press`

Presses a key on the element that has the focus, such as the field you just typed into. Key names follow Playwright and
are case-sensitive: `Enter`, `Tab`, `Escape`, `ArrowDown`, `Backspace`, or a combination such as `Control+A` or
`Shift+Tab`.

```yaml
- input:
    selector: "#search"
    value: "backpack"
- press:
    key: "Enter"
```

### `scroll`

Scrolls the page. `direction` is the side of the page to reveal: `up`, `down`, `left` or `right`. `distance` is in
pixels.

```yaml
- scroll:
    direction: "down"
    distance: 800
```

### `sleep`

Waits a fixed time, in milliseconds. Prefer [`waitFor`](#waitfor), which waits only as long as needed.

```yaml
- sleep:
    ms: 500
```

### `switchTab`

Makes the tab whose URL matches `url` the current tab, waiting for it to open. See [Tabs](#tabs).

```yaml
- switchTab:
    url: "**/help*"
```

## Element actions

### `click`

Clicks an element.

```yaml
- click:
    selector: '[data-test="login-button"]'
```

### `doubleClick`

Double-clicks an element.

```yaml
- doubleClick:
    target: "The 'Notes' cell of the first row"
```

### `rightClick`

Right-clicks an element, which opens the page's context menu if it has one.

```yaml
- rightClick:
    selector: ".file-row"
    target: "The first file in the list"
```

### `hover`

Moves the mouse over an element, for menus and tooltips that open on hover.

```yaml
- hover:
    target: "The 'Account' menu in the header"
```

### `input`

Types `value` into a field, replacing what it holds. `value: ""` clears the field.

```yaml
- input:
    selector: "#email"
    target: "Email field of the sign-in form"
    value: "{{TEST_EMAIL}}"
```

## Waiting and assertions

### `waitFor`

Waits until an element is visible, the URL matches, or Jev judges a condition true, up to the step's timeout.

```yaml
- waitFor:
    url: "**/inventory.html"
- waitFor:
    selector: '[data-test="title"]'
```

### `assert`

Checks the page: Playwright checks an element or the URL, and Jev judges a `statement`.

```yaml
- assert:
    selector: '[data-test="title"]'
    text: "Products"
- assert:
    statement: "Six products are listed, each with a price"
```

[Waiting and assertions](./assertions.md) has every form of both.

## Dialogs

A native `alert`, `confirm`, `prompt` or "leave this page?" dialog is answered by the step that opens it, with a
`dialog` field. The answer is set before the step runs, because the browser must know it before the dialog opens.

| Field | What it does |
| --- | --- |
| `accept`* | `true` presses OK, `false` presses Cancel |
| `text` | Text typed into a `prompt` before OK; only with `accept: true` |
| `message` | The dialog's text must contain this, case-sensitive; otherwise the step fails |

```yaml
- click:
    target: "Delete button in the 'Write release notes' row"
    dialog:
      accept: true
      message: "Delete this task?"
- click:
    selector: "#rename"
    dialog:
      accept: true
      text: "Release notes v2"
```

`open`, `back`, `forward`, `reload`, `press` and the element actions can have a `dialog`. The step fails when its dialog
does not appear (`The expected dialog did not appear within …`). A dialog on a step without `dialog`, or between steps,
is dismissed and fails that step: `Unexpected alert dialog: "Profile saved"`.

## Tabs

A tab the page opens, through a link with `target="_blank"` or `window.open`, does not become the current tab by
itself. `switchTab` makes the tab whose URL matches the current one, and switches back the same way:

```yaml
- click:
    selector: "a[target=_blank]"
- switchTab:
    url: "**/help"
- assert:
    statement: "The help page explains how to reset a password"
- switchTab:
    url: "/board"
```

The step fails when no tab matches within the timeout, or when more than one does.
