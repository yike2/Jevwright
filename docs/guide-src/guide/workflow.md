# General workflow

This page walks from your own app to a passing Run in four steps. Each step ends with **what can go wrong**: the
message you see, word for word, so you can search this page for it, and whether it points at your app, your setup,
your test file, or Jevwright.

```text
1 Pick the app  →  2 Write the test file  →  3 Upload it and set the Variables  →  4 Run it and read the report
```

## 1. Pick the app

Use the [Demo App](./quick-start.md#the-demo-app) to learn, or your own app. Your app must be on a **public domain**
that our server can reach, because every Run happens there.

Decide how the test gets past the sign-in page:

- **A test user signs in through the form.** Simplest, when the sign-in has no CAPTCHA or 2FA. Keep the password in a
  Variable, such as `{{APP_PASSWORD}}`.
- **The test starts signed in.** Copy the session cookie or the token from your browser's developer tools after you
  sign in, put it in a Variable, and set it with `cookies`, `headers`, `localStorage` or `sessionStorage` (see
  [Headers, cookies and storage](../reference/test-file.md#headers-cookies-and-storage)).

### What can go wrong

| You see | Cause | Fix |
| --- | --- | --- |
| `net::ERR_FAILED at http://localhost:3000/` or `net::ERR_CONNECTION_REFUSED at …` on the `open` step | The URL is not public: `localhost`, a private IP, an intranet or VPN-only host. Runs reach public addresses only | Deploy the app to a public domain and set `BASE` to it |
| `net::ERR_NAME_NOT_RESOLVED at …` | The host name does not exist on the public internet, or is misspelled | Check `BASE` in a browser on another network |
| `net::ERR_CERT_…` or `net::ERR_SSL_…` | The HTTPS certificate is invalid or self-signed | Use a valid certificate, or the app's `http://` URL if it serves one |
| `The page did not finish loading within 15000ms` | The page is slow, or keeps loading something that never finishes | Raise `timeoutMs`, or open a lighter page first |
| The test signs in on one Run and lands on the sign-in page on the next | The cookie or token in the Variable has expired | Sign in again, copy the new value, and update the Variable |
| A CAPTCHA, a "check your email" code or a bot check appears in the step screenshot | These cannot be automated | Use a test user without them, or start signed in with a cookie or token |
| Pages answer "Too many requests", or the app blocks you after a few Runs | Your app rate-limits sign-ins or requests | Start signed in instead of signing in every Run, or allow-list test users |

These are your app's or your setup's problems, not Jevwright's: the same URL fails the same way in any browser on a
public network.

## 2. Write the test file with your agent

Describe to your coding agent (Claude Code, Codex, Cursor, …) what to test, in your words: "Sign in as the test user,
add the first product to the cart, check out, and check that the order is confirmed." With the
[Agent Skill](./agent-skill.md) installed, the agent writes a Jevwright test file in the right syntax. You can also write
the file yourself; the [YAML syntax](../reference/test-file.md) has everything.

Good test files:

- use a `selector` where the page has a stable one, such as `[data-test="checkout"]` or `#email`, copied from the real
  page in your browser's developer tools;
- use a `target` that describes what you see, such as `"Blue 'Checkout' button below the cart"`, where there is no
  stable selector;
- put the app's URL in `baseUrl: "{{BASE}}"`, and every password and token in a `{{VARIABLE}}`.

### What can go wrong

| You see | Cause | Fix |
| --- | --- | --- |
| `Unknown action "aiAct"`, `Unknown field "colour"` and other problems in the Debug console | The agent invented an action or a field | Paste the Debug console's lines back to the agent and ask it to fix every one. See [Diagnostics](../reference/diagnostics.md) |
| `No element matches "#login-btn" within 15000ms` when it runs | The agent guessed a selector without seeing the page | Copy the selector from the real page, or add a `target` so Jev can find the element when the selector fails |
| A password or token in the file itself | The agent wrote the value instead of a Variable | Replace it with `{{NAME}}` and set the Variable on the Project |

## 3. Upload it and set the Variables

In the web workspace, open the **+** menu on a Project or a folder and choose **Upload files…**, or drag `.yaml` files or
whole folders from your computer onto a Project or folder in the sidebar. You can also choose **New test file** and
paste the YAML into the editor.

Then open the Project's **Variables** (in the sidebar, under the Project) and set every Variable the file uses, such as
`BASE`. Every file in the Project, in any folder, uses the Project's Variables.

The file is checked when it arrives and every time you save: the **Debug console** lists every problem with its line.

### What can go wrong

| You see | Cause | Fix |
| --- | --- | --- |
| `Only .yaml and .yml files can be imported.` | The file has another extension | Rename it to `.yaml`. A `.yml` file is renamed to `.yaml` for you |
| `Test file names use only letters, digits, -, _ and ., with no spaces, and end in .yaml.` | The file name has spaces or other characters | Rename it, such as `checkout-total.yaml` |
| `Folders can be at most 4 levels deep, counting the project.` | The folder you dropped is nested too deep | Flatten the folders: a Project and at most three levels of folders under it |
| `The test file is too long: it can be at most 262,144 characters.` | The file is larger than a test file can be | Split it into several files |
| `A folder or test file with this name already exists in this folder.` (or `… in this project.`) in the skipped list | A file of that name is already there; nothing is overwritten | Rename the file, or delete the old one first |
| `Variable names use capital letters, digits and _, and do not start with a digit, for example BASE_URL.` | The Variable name in the Variables form is not valid | Use names such as `BASE` or `APP_PASSWORD`, as the file writes them |
| Problems in the Debug console after the upload | The file breaks the syntax | Fix them, or paste them back to your agent; a file with problems cannot run |

## 4. Run it and read the report

Click **Run**. The **Output console** follows each step live; when the Run ends, **Open run details** shows the report:
each step's status, its duration, how its element was found (`selector`, `visual` or `dom`), the reason of a failed step,
and a screenshot of the page after each step. The report also offers **Download report** (the JSON report) and
**Download trace**, a Playwright trace that you can open at [trace.playwright.dev](https://trace.playwright.dev) to step
through the Run with the page, the network and the console.

A Run stops at the first failed step; the steps after it stay **Pending**.

### What can go wrong

| You see | Cause | Points at |
| --- | --- | --- |
| `Variable {{BASE}} is not set` | The Project has no Variable of that name | Your setup: add the Variable on the Project that holds the file |
| `The page did not finish loading within 15000ms` | The page is slow to load | Your app, or a `timeoutMs` too short for it |
| `No element matches "[data-test="checkout"]" within 15000ms` | No element on the page matches the selector | Your test file (a wrong selector) or your app (the page changed, or showed something else: look at the screenshot) |
| `"#save" was found but could not be clicked within 15000ms: it stayed hidden, disabled, or covered by another element` | The element is there but cannot be used, often behind a cookie banner or a dialog | Your app: close the banner in an earlier step, or wait for the page |
| `Could not locate "Green Login button":` followed by one line per method, such as `visual — confidence 0.4 below 0.7` | Jev could not find what the `target` describes with enough confidence | Your test file: describe the element as it looks, with its text, color and position, or add a `selector` |
| `Text of "[data-test="title"]" did not contain "Products" within 15000ms; it was "Your Cart"` | The element's text is not what the step expects | Your app's behavior, or the test's expectation |
| `The URL did not match "**/inventory.html" within 15000ms; it was "https://…/"` | The page did not go where the step expects, often a failed sign-in | Your app or your test file; look at the screenshot of the step before |
| `Statement does not hold (noul=0.05)` | Jev judged the `statement` false from the screenshot | Usually your app; `noul` is how likely Jev thinks the statement is true, from 0 to 1. Look at the screenshot |
| `Statement is uncertain after 2 asks (noul=0.5)` | Jev could not decide | Your test file: make the statement more specific, or check it with a selector |
| `Unexpected alert dialog: "Profile saved"` | The page opened a dialog that the step does not answer | Your test file: add [`dialog`](../reference/actions.md#dialogs) to the step that opens it |
| `The run did not finish within runTimeoutMs (600000 ms)` | The whole Run took too long | Your test file: split it, or raise `runTimeoutMs` (a Run lasts at most 10 minutes) |
| A step passes on one Run and fails on the next | The app is slow or changes between Runs (data, A/B tests, ads), or a Jev answer differed | Your app or your test file: wait for the page with `waitFor`, and prefer selectors for steps that must never vary |
| `Browser error: …` or `Something went wrong while running the test. Try running it again.` | The browser or the server failed during the Run | Jevwright: run it again, and report it if it keeps happening |

### Is it my app, my test, or Jevwright?

1. **Look at the step's screenshot.** If the page shows an error, a sign-in page, a banner or an unexpected state, the
   cause is the app or the session: open the same URL in your browser.
2. **Read the reason.** Messages about selectors, text, URLs and statements describe what the browser found; compare
   them with the page in the screenshot. Messages starting with `net::` are about reaching the app.
3. **Open the trace** for the full story: every action, request and console message, with the page before and after.
4. **Report a Jevwright bug** when the screenshot shows the element the step needs, the selector matches it in your
   browser's developer tools, and the step still fails, or for `Browser error` and `Something went wrong` messages that
   repeat. Open an issue at [github.com/yike2/Jevwright](https://github.com/yike2/Jevwright/issues) with the test file and
   the downloaded report.
