# Test file

A test file is a YAML file that ends in `.yaml`. It has a name, optional settings, and a list of steps that run in
order.

```yaml
name: "Checkout"
description: "A signed-in user buys the backpack"
baseUrl: "{{BASE}}"
timeoutMs: 10000
cookies:
  session-username: "standard_user"
steps:
  - open:
      url: "/inventory.html"
  - click:
      selector: '[data-test="add-to-cart-sauce-labs-backpack"]'
  - click:
      target: "Shopping cart icon at the top right of the page"
  - assert:
      statement: "The cart lists the Sauce Labs Backpack with its price"
```

## Top-level fields

| Field | Type | Required | Default | What it is |
| --- | --- | --- | --- | --- |
| `name` | text | yes | – | The test's name |
| `description` | text | | – | What the test checks |
| `baseUrl` | absolute URL | | – | The start of every relative URL in the steps |
| `timeoutMs` | positive integer | | `15000` | How long each step may take, in milliseconds |
| `runTimeoutMs` | positive integer | | `600000` | How long the whole Run may take, in milliseconds: starting the browser and every step |
| `headers` | names and values | | – | HTTP headers sent with every request to the `baseUrl`'s site |
| `cookies` | names and values | | – | Cookies set before the first step; needs `baseUrl` |
| `localStorage` | names and values | | – | `localStorage` entries for the `baseUrl`'s site; needs `baseUrl` |
| `sessionStorage` | names and values | | – | `sessionStorage` entries for the `baseUrl`'s site; needs `baseUrl` |
| `steps` | list | yes | – | At least one step; see [Actions](./actions.md) |

Any other top-level field is refused with `Unknown field` ([E004](./diagnostics.md#e004)).

## Steps

Each step is one action, written as the action's name with its fields under it. An action without fields is written
with `{}`:

```yaml
- input:
    selector: "#email"
    value: "student@example.com"
- press:
    key: "Enter"
- back: {}
```

A step holds exactly one action. A step with two, such as `click` and `input` together, is refused
([E006](./diagnostics.md#e006)).

Text values are best written in quotes. Use single quotes around a selector that contains double quotes, as in
`'[data-test="login-button"]'`. Text fields cannot be empty, except an `input`'s `value`, where `""` clears the field.

## URLs and `baseUrl`

A URL is **absolute** when it starts with a scheme and `//`, such as `https://`, or with a Variable such as `{{BASE}}`.
Anything else is **relative** and is added to the `baseUrl`.

- `baseUrl` itself must be absolute.
- `open`'s `url` may be relative only when the file has a `baseUrl`.
- `waitFor`, `assert` and `switchTab` take a URL **pattern**. A pattern without `*` must match the whole URL. `*`
  matches any characters except `/`, and `**` any characters including `/`, so `**/inventory.html` matches that page on
  any site, with or without a `baseUrl`. Any other relative pattern, such as `/cart.html` or `/items/*`, needs a
  `baseUrl`.

`localhost:3000/login` has no `//`, so it is relative, not a site. Write `http://localhost:3000/login`, and remember that
Runs reach [public addresses only](../guide/quick-start.md#test-your-own-app).

```yaml
name: "URLs"
baseUrl: "https://shop.example.com"
steps:
  - open:
      url: "/login"
  - waitFor:
      url: "**/login"
  - assert:
      url: "/login"
```

## Variables

`{{NAME}}` in any text value is replaced with the Project's Variable of that name when the Run starts. Names use
capital letters, digits and `_`, and do not start with a digit. Use Variables for the app's URL and for every password,
token or cookie value, so the file holds no secret:

```yaml
name: "Sign in"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/login"
  - input:
      selector: "#email"
      value: "{{TEST_EMAIL}}"
  - input:
      selector: "#password"
      value: "{{TEST_PASSWORD}}"
```

A Variable the Project does not have fails the step that uses it with `Variable {{TEST_EMAIL}} is not set`. Values are
hidden in reports and failure reasons, which show the `{{NAME}}` instead. See [Variables](../guide/workspace.md#variables)
for setting them.

## Timeouts

`timeoutMs` is how long each step may take: how long Playwright waits for an element, a page load or a check, and how
long Jev may take to find or judge. The default is 15 seconds. Lower it in a file whose failures you want to see
sooner, or raise it for a slow app:

```yaml
name: "Slow report page"
baseUrl: "{{BASE}}"
timeoutMs: 30000
runTimeoutMs: 120000
steps:
  - open:
      url: "/reports"
  - waitFor:
      selector: "#report-table"
```

`runTimeoutMs` bounds the whole Run, including starting the browser. A Run on the server lasts at most 10 minutes,
whatever the file says. Both are whole numbers of milliseconds written in digits: `1e3` or `1000.0` are refused.

## Headers, cookies and storage

`headers`, `cookies`, `localStorage` and `sessionStorage` give the browser the state of a signed-in user before the first
step, so the test can skip the sign-in page. Each is a list of names and values; values are text and may use Variables.

```yaml
name: "Cart, signed in"
baseUrl: "{{BASE}}"
headers:
  Authorization: "Bearer {{API_TOKEN}}"
cookies:
  session-username: "standard_user"
localStorage:
  onboardingDone: "true"
sessionStorage:
  tabId: "e2e"
steps:
  - open:
      url: "/inventory.html"
```

| Field | When the browser gets it |
| --- | --- |
| `headers` | Sent with every request to the `baseUrl`'s site, never to another site. Without a `baseUrl`, sent to every site |
| `cookies` | Set before the first step, for the `baseUrl`'s host |
| `localStorage` | Written for the `baseUrl`'s site before any of its scripts run |
| `sessionStorage` | Written in every tab of the `baseUrl`'s site, before its scripts run |

`cookies`, `localStorage` and `sessionStorage` need a `baseUrl`, since they are set for its site. Header and cookie
names use letters, digits and `` - _ . ! # $ % & ' * + ^ ` | ~ ``; a header value must be on one line.

### Cookie attributes

A cookie is its value, or an object with the value and its attributes:

```yaml
name: "Session cookie"
baseUrl: "https://app.example.com"
cookies:
  session:
    value: "{{SESSION}}"
    domain: ".example.com"
    path: "/"
    httpOnly: true
    secure: true
    sameSite: "Lax"
steps:
  - open:
      url: "/"
```

| Attribute | Value | Default |
| --- | --- | --- |
| `value` | text, may be `""`; required | – |
| `domain` | the `baseUrl`'s host or a parent of it, with or without a leading `.` | the `baseUrl`'s host |
| `path` | text starting with `/` | `/` |
| `httpOnly` | `true` or `false` | `false` |
| `secure` | `true` or `false` | `true` when the `baseUrl` is `https`, otherwise `false` |
| `sameSite` | `Strict`, `Lax` or `None`; `None` needs `secure: true` | `Lax` |

### Where the values come from

Sign in to your app in your browser, open the developer tools, and copy what the app uses to remember you:

- **a cookie**: Application (Storage in Firefox) → Cookies; copy its name and value into `cookies`;
- **a token header**: Network → a request to your app's API → Request headers, such as `Authorization: Bearer …`; put
  it in `headers`;
- **a token in storage**: Application → Local storage or Session storage; copy the entry into `localStorage` or
  `sessionStorage`.

Put the value in a Project Variable and the `{{NAME}}` in the file. Sessions expire: when the test lands on the sign-in
page again, copy a fresh value into the Variable.

## Reusing parts with anchors

YAML anchors (`&name`) and aliases (`*name`) can repeat a step or a value:

```yaml
name: "Anchors"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/"
  - &addBackpack
    click:
      selector: '[data-test="add-to-cart-sauce-labs-backpack"]'
  - reload: {}
  - *addBackpack
```

Merge keys (`<<`) are not supported and are refused as an unknown field.
