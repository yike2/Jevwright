# Quick start

Every feature of Jevwright can be tried in a few minutes on the **Demo App**, a small online shop we host for you. This
page shows how, and then what your own app needs.

## The Demo App

The Demo App is a copy of the Swag Labs shop at **https://demo.94.72.126.118.sslip.io**. You sign in, add products to
the cart and check out. Its sign-in page lists the test users; all of them use the password `secret_sauce`:

| User | How the shop treats them |
| --- | --- |
| `standard_user` | Everything works |
| `locked_out_user` | Cannot sign in; the shop shows an error |
| `problem_user`, `performance_glitch_user`, `error_user`, `visual_user` | Broken images, slow pages, errors or a shifted layout, to see how tests react |

The shop keeps the signed-in user in a cookie named `session-username`, so a test can start already signed in by
setting that cookie (see `buy-a-backpack.yaml` below).

## 1. Register

Open the [web workspace](https://app.94.72.126.118.sslip.io) and click **Sign in**. Choose **Register** (1), enter your
email (2) and a password (3), and click **Register** (4).

![The sign-in page in Register mode, with markers on the Register tab (1), the Email field (2), the Password field (3) and the Register button (4)](/screenshots/register.webp)

Your account starts with a **Quick Start** project in the sidebar:

![The sidebar of a new account: the Quick Start project with its Variables key icon (1), the folder "1 Passing tests" (2) and the file sign-in-and-see-products.yaml (3); the files overview lists the same files on the right](/screenshots/quick-start-project.webp)

Its Variables are already set; the key icon on the project's row (1) opens them:

| Variable | Value |
| --- | --- |
| `BASE` | `https://demo.94.72.126.118.sslip.io`, the Demo App |
| `SWAG_PASSWORD` | `secret_sauce` |

Every Quick Start file starts with `baseUrl: "{{BASE}}"`, so it tests the Demo App. If you delete the project, **Add the
Quick Start project** under the sidebar's tree brings it back.

## 2. Pick a file

The project holds four numbered folders, such as **1 Passing tests** (2 in the picture above). Click a file in a
folder, such as `sign-in-and-see-products.yaml` (3), to open it in the editor. Each file opens with three comment
lines: what it does, what to expect, and something to try.

| Feature | Folder | File |
| --- | --- | --- |
| Steps with selectors only; Jev is never called | 1 Passing tests | `sign-in-and-see-products.yaml` |
| Skipping the sign-in page with a cookie | 1 Passing tests | `buy-a-backpack.yaml` |
| A test that passes because the shop refuses the user | 1 Passing tests | `locked-out-user-sees-an-error.yaml` |
| A failed check, with the step's reason and screenshot | 2 Failing tests - see why they fail | `wrong-total-fails-at-the-total.yaml` |
| A selector that matches nothing | 2 Failing tests - see why they fail | `missing-button-fails.yaml` |
| An alert the step does not expect | 2 Failing tests - see why they fail | `unexpected-alert-fails.yaml` |
| Every problem of a file listed at once | 3 Invalid files - fix the errors | `seven-errors-at-once.yaml` |
| A YAML syntax error | 3 Invalid files - fix the errors | `yaml-syntax-error.yaml` |
| Jev finding one element on the screenshot, one in the page, and judging a `statement` | 4 Jev - find and check by description | `find-and-check-with-jev.yaml` |
| Jev finding elements from descriptions only | 4 Jev - find and check by description | `find-elements-by-description.yaml` |
| Jev saving a step whose selector is out of date | 4 Jev - find and check by description | `fall-back-from-a-stale-selector.yaml` |
| Jev judging a true `statement` | 4 Jev - find and check by description | `judge-a-true-statement.yaml` |
| Jev judging a false `statement` | 4 Jev - find and check by description | `judge-a-false-statement.yaml` |

## 3. Run a passing test

Open `sign-in-and-see-products.yaml` and click **Run** (1) at the top right, or press `Ctrl+Enter`. The **Output
console** on the right follows the Run live, one line per step (2). A passing Run ends like this:

![The editor after a passing Run, with markers on the Run button (1), the six passed steps in the Output console (2) and the Open run details button (3)](/screenshots/run-passed.webp)

```text
Passed  6/6 passed
Step 1  open     line 8   Passed
Step 2  input    line 10  Passed
Step 3  input    line 13  Passed
Step 4  click    line 16  Passed
Step 5  waitFor  line 18  Passed
Step 6  assert   line 20  Passed
```

Click **Open run details** (3) to see the report, which slides in over the editor:

- the Run's status, when it started, its duration and how many steps passed (1);
- **Open full page** (2) opens the report on its own page, and **Download report** (3) saves it as JSON;
- every step, with a screenshot of the page after it (4) and how its element was found (5), `selector` here.

![The report of the passing Run beside the editor, with markers on the status (1), Open full page (2), Download report (3), the screenshot of step 1 (4) and the locate method "selector" of step 2 (5)](/screenshots/report.webp)

## 4. Run a failing test

Open `wrong-total-fails-at-the-total.yaml` and run it. It expects a total of `$99.99`, but the shop charges `$32.39`, so
the Run ends **Failed** (1): step 10 fails with its reason (2), and steps 11 and 12 stay **Pending** (3), because a Run
stops at the first failed step. **History** (4) keeps the Run, newest first.

![The Output console after a failed Run, with markers on the Failed badge (1), step 10 with its reason (2), the pending steps 11 and 12 (3) and the Run in History (4)](/screenshots/run-failed.webp)

The reason says what the browser found:

```text
Text of "[data-test="total-label"]" did not contain "Total: $99.99" within 3000ms; it was "Total: $32.39"
```

**Open run details** shows the same reason with a screenshot of the page at that moment. Do what the file's `# Try:`
line says, fix the total, and run it again.

## 5. Let Jev find and judge

Open the files in **4 Jev - find and check by description**:

- `find-and-check-with-jev.yaml` shows all three ways Jev helps. Jev finds the backpack's Add to cart button on the
  screenshot (`visual`). The red T-shirt's View details button is its picture, with no label you can see, so Jev
  finds it by its name in the page instead (`dom`). The last step is a `statement` alone, which Jev judges from a
  screenshot. The other steps are plain selectors and checks.
- `find-elements-by-description.yaml` has no selectors for its buttons, only a `target` such as `"'Add to cart' button
  of the Sauce Labs Backpack"`. The report shows `visual` or `dom` for those steps: Jev found them.
- `fall-back-from-a-stale-selector.yaml` has a selector that no longer matches. The step also has a `target`, so Jev
  finds the button and the step passes; the report shows how.
- `judge-a-true-statement.yaml` and `judge-a-false-statement.yaml` check the page with a `statement` in plain words,
  which Jev judges from a screenshot. The false one fails with a reason that starts with `Statement does not hold`.

In the report of `find-and-check-with-jev.yaml`, step 2 shows `visual` (1) and step 3 shows `dom` (2):

![The report of find-and-check-with-jev.yaml, with markers on the locate method "visual" of step 2 (1) and "dom" of step 3 (2), each above the step's screenshot](/screenshots/report-jev.webp)

## 6. Fix an invalid file

Open `seven-errors-at-once.yaml`. The editor underlines each line with a problem (1), and the **Debug console** lists
every problem with its line and its code (2), such as `Line 9: Unknown action "aiAct"` with `E005`. Click a problem to
jump to its line.

![seven-errors-at-once.yaml in the editor, with markers on the underlined line 5 (1) and its problem "Line 5" with code E007 at the top of the Debug console (2)](/screenshots/diagnostics.webp)

A file with problems cannot run. Fix them one by one; the list updates as you type and when you save. The
[Diagnostics](../reference/diagnostics.md) page explains every code.

## Test your own app

When you are ready to test your own app, check two things first.

::: warning Your app must be public
Runs happen on our server, which reaches **public** web addresses only. `localhost`, private IP addresses such as
`192.168.1.20` or `10.0.0.5`, an intranet, or a host you reach only over a VPN fail, usually with `net::ERR_FAILED` or
`net::ERR_CONNECTION_REFUSED` on the `open` step. Deploy the app, or a preview of it, to a public domain such as
`https://staging.example.com`.
:::

::: warning A sign-in needs a session the test can set
A test cannot solve a CAPTCHA, a code sent by email or text (2FA), or bot protection. Either sign in with a test user
whose sign-in has none of these, or start the test already signed in: put a session cookie, a token header, or a
storage entry in the file with [`cookies`, `headers`, `localStorage` or `sessionStorage`](../reference/test-file.md#headers-cookies-and-storage),
and keep the token itself in a Project Variable.
:::

Then create a Project for your app, set its `BASE` Variable to your app's URL, and follow the
[General workflow](./workflow.md).
