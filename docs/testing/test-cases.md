# Test Cases

System-level test cases for Jevwright, run through the Web UI against the Demo App. The same cases drive the Playwright E2E tests (`src/tests/e2e/`, `docs/tech/e2e.md`) and manual test passes, so a manual tester and an E2E test check the same steps and the same expected results.

Unit and integration tests cover each module (`docs/tech/<module>.md`, 5); this document covers what a user sees from the browser, plus a short CLI and API smoke check.

## 1. Approach

### 1.1 Test design

| Technique | Applied to |
| --------- | ---------- |
| Requirements-based | Every case traces to a PRD user story (7) |
| Equivalence partitioning | Test files: passing, failing, invalid; locating by `selector`, `target`, or both; Playwright checks and Jev statements |
| Boundary values | Name lengths, the source size limit, `timeoutMs` and `runTimeoutMs` |
| State transition | Run `queued → running → passed / failed`; Step `pending → running → passed / failed` |
| Negative and error guessing | Wrong input, duplicates, missing Variables, unexpected dialogs, another user's data |
| Edge cases | Empty and comment-only sources, Unicode and HTML in names, surrounding spaces, double clicks, a file deleted while its Run waits, malformed ids, path traversal |
| Risk-based priority | P0 first; see 1.2 |

### 1.2 Priority

| Priority | Meaning | When to run |
| -------- | ------- | ----------- |
| **P0** | Smoke: the main PRD flow (PRD 4.2.2). A failure blocks a release | Every PR (E2E) and before every deploy |
| **P1** | Regression: every Must requirement, error paths, security | Every PR (E2E), and manually before a release |
| **P2** | Extended: rare states, accessibility, Should and Could items | Before a release, manually |

### 1.3 Execution type

| Type | Meaning |
| ---- | ------- |
| **E2E** | Automated in `src/tests/e2e/*.e2e.ts`; also runnable by hand |
| **Manual** | Run by hand only: needs a server restart, a second browser, the production network, or human judgment |
| **Live** | Calls the real Jev API. Never part of `pnpm test:e2e` (AGENTS.md 5); run by hand or as an `@live` test. Jev answers can vary; repeat a failed Live case once before reporting it |

### 1.4 Case format

Each case has an ID `TC-<AREA>-<nn>`, a title, its priority, execution type, the user story it covers, preconditions, steps, and expected results. A case passes only when every expected result holds. Steps name buttons and fields by their visible text; E2E tests locate them by the same role and name (`docs/tech/frontend.md` 1.6–1.11).

| Area | Covers |
| ---- | ------ |
| `LAND` | The landing page |
| `THEME` | Light, Dark, and System themes |
| `AUTH` | Register, log in, log out, access without a token |
| `QS` | The Quick Start project |
| `WS` | Sidebar: Projects, Modules, Test Files, rename, delete |
| `ED` | Editor: edit, upload, validate, save |
| `VAR` | Project Variables |
| `RUN` | Running a Test File, Live Progress, the Run Queue |
| `RPT` | Run page after the Run: steps, screenshots, report, trace, history |
| `OV` | Files overview |
| `SEC` | Account isolation, Variable redaction, private networks |
| `JEV` | Jev locating and judging |
| `CLI`, `API` | Smoke checks outside the Web UI |
| `A11Y` | Accessibility (AGENTS.md 7.2) |

## 2. Test Environment

### 2.1 Local

| Part | How |
| ---- | --- |
| PostgreSQL | `docker compose -f compose.dev.yaml up -d postgres`, then `pnpm --filter @jevwright/backend exec prisma migrate deploy` (`docs/deploy/backend-local.md`) |
| Backend | `pnpm backend` (dev mode, `RUN_CONCURRENCY=1`), `http://127.0.0.1:4000` |
| Frontend | `pnpm frontend`, `http://localhost:3000` |
| Demo App | `http://127.0.0.1:8080`, served as in `docs/deploy/demo-app.md` 6. A dev-mode backend's Runs may open local addresses |
| Browser | Chromium (E2E); any current browser for manual passes |

`pnpm test:e2e` starts the backend and frontend itself (`docs/tech/e2e.md` 2); PostgreSQL must already run.

### 2.2 Production

The deployed frontend and API, with the Demo App at its public `DEMO_DOMAIN` (`docs/deploy/backend-prod.md`). Cloud Runs refuse private addresses, so `BASE` must be the public Demo App URL. Run P0 and the Manual cases marked *production*.

### 2.3 Test data

**Project Variables**, set in each test Project before its first Run (TC-VAR-01):

| Name | Local | Production |
| ---- | ----- | ---------- |
| `BASE` | `http://127.0.0.1:8080` | `https://<DEMO_DOMAIN>` |
| `SWAG_PASSWORD` | `secret_sauce`, the password shown on the Demo App's sign-in page | the same |

**Accounts**: each case registers a new account, `e2e-<timestamp>-<random>@example.com` with password `e2e-password-123`, so cases do not depend on each other. A new account starts with the Quick Start project (TC-QS-01); unless a case says otherwise, delete it first (**Delete project Quick Start**), so the workspace starts empty. The E2E helper `signUp` does this through the API. Isolation cases (TC-SEC-01, TC-SEC-02) use two accounts, A and B.

**Workspace**: unless a case says otherwise, Project `Demo Shop`, Module `Shopping`, and the Test File named in the case, with the source of the fixture named in the case.

**Demo App users**: `standard_user` and `locked_out_user` (`docs/tech/benchmark.md` 1.2).

### 2.4 Test files

The test files are in `src/tests/e2e/fixtures/`, grouped by expected outcome. E2E tests read them from there; manual testers load them with **Upload file** (TC-ED-03) or paste them (Appendix A). The first line of each file states its expected result. Every file uses only `{{BASE}}` and `{{SWAG_PASSWORD}}`, except `pass/variable-value.yaml`, which also needs `{{DISPLAY_NAME}}` (TC-VAR-06), so each runs unchanged locally and in production.

| File | Locates by | Expected outcome | Used by |
| ---- | ---------- | ---------------- | ------- |
| `pass/sign-in.yaml` | `selector` | Passed, 6/6 | RUN-01, RPT-01, OV-02, CLI-02, QS-01 |
| `pass/checkout.yaml` | `selector` | Passed, 16/16 | RUN-02 |
| `pass/locked-out.yaml` | `selector` | Passed: the app's own error is asserted | RUN-03 |
| `pass/all-actions.yaml` | `selector` | Passed, 35/35: every action and dialog answer | RUN-04 |
| `pass/slow.yaml` | `selector` | Passed after about 8 s | RUN-07, RUN-08 |
| `pass/variable-value.yaml` | `selector` | Passed: `{{DISPLAY_NAME}}` is typed and read back unchanged | VAR-06 |
| `fail/wrong-total.yaml` | `selector` | Failed at step 14; steps 15–16 pending | RUN-05, RPT-02, OV-02 |
| `fail/missing-element.yaml` | `selector` | Failed at step 2 within about 3 s; no Jev call | RUN-06 |
| `fail/missing-variable.yaml` | `selector` | Failed at step 2: `Variable {{NOT_SET}} is not set` | VAR-03 |
| `fail/redaction.yaml` | `selector` | Failed at step 2; the reason shows `{{SWAG_PASSWORD}}` | SEC-03 |
| `fail/unexpected-dialog.yaml` | `selector` | Failed at step 2: `Unexpected alert dialog` | RUN-09 |
| `fail/run-timeout.yaml` | `selector` | Failed: Run error `timeout` after about 10 s | RUN-10 |
| `fail/dialog-message.yaml` | `selector` | Failed at step 2: the alert text is not the expected message | RUN-17 |
| `fail/no-tab.yaml` | `selector` | Failed at step 2 within about 3 s: no tab matches | RUN-18 |
| `fail/no-history.yaml` | `selector` | Failed at step 2: no page to go back to | RUN-19 |
| `invalid/multiple-errors.yaml` | – | 7 validation errors; Run refused | ED-04, RUN-11, CLI-01 |
| `invalid/yaml-syntax.yaml` | – | 1 validation error (`E001`) at line 7 | ED-05 |
| `invalid/empty.yaml` | – | 1 validation error (`E002`) at line 1: a comment only | ED-08 |
| `invalid/timeout-bounds.yaml` | – | 2 validation errors (`E007`) at lines 5 and 7 | ED-09 |
| `jev/target-sign-in.yaml` | `target` | Passed; steps 2–4 by `visual` or `dom` | JEV-01, QS-04 |
| `jev/stale-selector.yaml` | both | Passed; step 4 falls back to Jev | JEV-02, QS-04 |
| `jev/statement-holds.yaml` | `selector` | Passed; Jev judges step 8, step 9 is a fallback pass | JEV-03, QS-04 |
| `jev/statement-fails.yaml` | `selector` | Failed at step 8: the statement does not hold | JEV-04, QS-04 |

`invalid/multiple-errors.yaml` reports these diagnostics, one per error code it covers:

| Line | Code | Message |
| ---- | ---- | ------- |
| 3 | `E007` | `"timeoutMs" must be a positive integer up to 2147483647` |
| 6 | `E007` | `"url" is relative, so the test needs a "baseUrl"` |
| 7 | `E005` | `Unknown action "aiAct"` |
| 8 | `E006` | `Step must contain exactly one action, found "click" and "input"` |
| 13 | `E003` | `Missing required field "value"` |
| 15 | `E008` | `Needs at least one of "selector" and "target"` |
| 18 | `E004` | `Unknown field "colour"` |

## 3. Shared Steps

Cases refer to these instead of repeating them.

- **S1 Sign up**: open `/login`, click **Register** (the mode button), enter a new email and the password, click **Register** in the form. You are on `/files` and the sidebar shows the email. Delete the Quick Start project (2.3).
- **S2 Create the workspace**: in the sidebar, click **New project**, name it `Demo Shop`, **Create**; on `Demo Shop` click **New module in Demo Shop**, name it `Shopping`, **Create**.
- **S3 Set the Variables**: click **Variables for Demo Shop**; save `BASE` and `SWAG_PASSWORD` with the values of 2.3; **Close**.
- **S4 Add a Test File**: on `Shopping` click **New test file in Shopping**, enter the name, **Create**; the editor opens. Load the fixture with **Upload file**, then click **Save**.
- **S5 Run**: in the editor click **Run**, then **View run**. Wait until the status is final (`Passed` or `Failed`).

## 4. Test Cases

### 4.0 Landing page and themes (`LAND`, `THEME`)

#### TC-LAND-01 The landing page shows the product — P1, E2E

Covers PRD 4.2.2. Pre: no token.

1. Open `/`.
2. Click **Get started** in the hero.

Expected: step 1 shows the heading starting "Web tests as plain YAML steps.", the command `pnpm jevwright run tests/sign-in.yaml` with **Copy command**, the sections How does Jev find an element?, What does it fix?, Which should I write?, What runs where?, Checked before it runs, Light and dark, Quick start, and What it is, and what it is not, a **Docs** link to `https://yike2.github.io/Jevwright/`, and one **Sign in** button at the top right, with no **Log in**, **Register**, or **Open workspace**; step 2 opens `/register`, the auth page in Register mode, with the heading "Register".

#### TC-LAND-02 Sign in from the landing page — P1, E2E

Covers PRD 4.2.2. Pre: no token.

1. Open `/` and click **Sign in** at the top right.
2. Click **Register** (the mode button).

Expected: step 1 opens `/login` with the heading "Log in"; step 2 switches the same page to "Register".

#### TC-LAND-03 A signed-in visitor opens the workspace in one click — P1, E2E

Covers PRD 4.2.2. Pre: S1.

1. Open `/`.
2. Click **Open workspace** at the top right.

Expected: step 1 shows **Open workspace** instead of **Sign in**; step 2 opens `/files` with the sidebar.

#### TC-LAND-04 The logo leads to the landing page — P1, E2E

Covers PRD 4.2.2. Pre: none.

1. Without a token, open `/login` and look at the logo's link.
2. Do S1 with a Test File, open `/`, and look at the logo's link.
3. Open the Test File and click the logo at the top of the sidebar.

Expected: every logo links to `/` ("Jevwright home"), signed in or not; step 3 opens `/`, which shows **Open workspace**.

#### TC-LAND-05 The real Run replay — P1, E2E

Covers PRD 4.2.2. Pre: none.

1. Open `/`; in **Run replay** click **Show all steps**, then the button of step 4.
2. Choose the tab `fall-back-from-a-stale-selector.yaml` and click **Show all steps**.

Expected: step 1 lists six steps, step 4 is `click` with `selector` and `Passed`, and its screenshot "Step 4 screenshot" shows; in step 2 step 4 shows `visual` or `dom`.

#### TC-LAND-06 The replay with reduced motion — P2, E2E

Covers AGENTS.md 7.2. Pre: the system set to reduce motion.

1. Open `/`.

Expected: the replay shows all six steps as `Passed` at once, with no animation.

#### TC-LAND-07 Quick start tabs — P2, E2E

Covers PRD 4.2.2. Pre: none.

1. Open `/`; in **Quick start** look at **Web**, then choose **CLI**.

Expected: **Web** lists the Quick Start Modules, starting with `1 Passing tests`; **CLI** shows `pnpm jevwright validate tests/login.yaml` and the run command.

#### TC-LAND-08 The landing page on a phone — P2, Manual

Covers AGENTS.md 7.2. Pre: a 400px wide window, both themes.

1. Scroll through `/`.

Expected: nothing scrolls sideways except code boxes and the choice table; every diagram reads top to bottom; text and badges are readable in both themes.

#### TC-THEME-01 The theme follows the system by default — P1, E2E

Covers `docs/tech/design-system.md` 3. Pre: no stored theme; the operating system set to dark.

1. Open `/`.
2. Switch the operating system to light.

Expected: step 1 shows the dark theme and **System** pressed in the Theme switch; after step 2 the page turns light without a reload.

#### TC-THEME-02 A chosen theme persists — P1, E2E

Covers `docs/tech/design-system.md` 3. Pre: the operating system set to light.

1. Open `/`, click **Dark** in the Theme switch, and reload.
2. Click **System**.
3. Click **Light**, then switch the operating system to dark.

Expected: after step 1 the page is still dark and **Dark** is pressed; after step 2 it is light; after step 3 it stays light.

#### TC-THEME-03 No flash of the wrong theme — P1, E2E

Covers `docs/tech/design-system.md` 3. Pre: the operating system set to light, **Dark** chosen.

1. Reload `/` with the app's JavaScript blocked.

Expected: the page is dark; the theme is set by the server's HTML before any script of the app runs.

#### TC-THEME-04 The theme switch is on every page — P2, E2E

Covers `docs/tech/design-system.md` 3. Pre: none.

1. Open `/login`.
2. Do S1 and open `/files`.

Expected: the Theme switch with **Light**, **Dark**, and **System** is in the header of step 1 and in the sidebar's account area of step 2.

#### TC-THEME-05 Both themes are readable — P2, Manual

Covers `docs/tech/design-system.md` 2.2. Pre: S1–S3, a passed and a failed Run.

1. In each theme, look at the landing page, `/login`, the overview, the editor with diagnostics, and both Run pages.

Expected: text, status badges, icons, inputs, and focus rings are clearly readable on every surface; no status is shown by color alone; scrollbars, the editor's included, are thin, with a thumb that stands out from its surface and changes on hover.

### 4.1 Authentication (`AUTH`)

#### TC-AUTH-01 Register, log out, and log in — P0, E2E

Covers US-4.3.7. Pre: none.

1. Do S1.
2. Click **Log out**.
3. Click **Log in** (mode), enter the same email and password, click **Log in** in the form.

Expected: after step 1 and step 3 the URL is `/files` and the sidebar shows the email; after step 2 the URL is `/login`.

#### TC-AUTH-02 Register with an email that is taken — P1, E2E

Covers US-4.3.7. Pre: an account exists for the email.

1. Register again with the same email, once in upper case (`E2E-…@EXAMPLE.COM`).

Expected: the page stays on `/login` and the alert says `An account with this email already exists. Log in instead.`; no second account is created.

#### TC-AUTH-03 Log in with a wrong password — P1, E2E

Covers US-4.3.7. Pre: an account exists.

1. Log in with the right email and the password `wrong-password-1`.

Expected: an alert shows the backend's message; the URL stays `/login`; the submit button is enabled again after the response.

#### TC-AUTH-04 Register with a short password (boundary) — P1, E2E

Covers US-4.3.7. Pre: none.

1. Register with a 7-character password.
2. Register with an 8-character password.

Expected: step 1 shows `Password must be at least 8 characters.` under the Password field, which is marked invalid, sends no request, and stays on `/login`; step 2 succeeds and opens `/files`.

#### TC-AUTH-05 Open the workspace without a token — P0, E2E

Covers US-4.3.7. Pre: a fresh browser context, or **Log out** first.

1. Open `/files`, then `/files/<any id>`, then `/runs/<any id>`.

Expected: each ends on `/login`; no workspace data is shown. The landing page `/` needs no token (TC-LAND-01).

#### TC-AUTH-06 A stored token that the backend rejects — P2, Manual

Covers US-4.3.7. Pre: signed in.

1. In the browser's developer tools, change the stored token in `localStorage` to `invalid`.
2. Reload `/files`.

Expected: the app clears the token and goes to `/login`.

#### TC-AUTH-07 Emails are compared in lower case — P1, E2E

Covers US-4.3.7. Pre: an account registered with a lower-case email.

1. Log in with the same email in upper case.

Expected: the login succeeds; the sidebar shows the email as registered.

#### TC-AUTH-08 Log out in one tab — P1, E2E

Covers US-4.3.7. Pre: signed in, with the workspace open in two tabs.

1. In tab 1, click **Log out**.
2. In tab 2, open a Project's **Variables** dialog or reload the page.

Expected: tab 2 goes to `/login` on its next request, since both tabs share the stored token.

### 4.1a Quick Start project (`QS`)

#### TC-QS-01 A new account starts with the Quick Start project — P0, E2E

Covers PRD 4.2.2. Pre: the backend's `DEMO_APP_URL` is the Demo App of 2.1 or 2.2.

1. Open `/register`, enter a new email and the password, and click **Register** in the form.
2. Click **Variables for Quick Start**.
3. Open `sign-in-and-see-products.yaml` from the overview and do S5.

Expected: step 1 opens `/files`, where the overview shows the heading `Quick Start` with the Modules `1 Passing tests`, `2 Failing tests - see why they fail`, `3 Invalid files - fix the errors`, and `4 Jev - find and check by description`, in that order, and their files (`docs/tech/backend.md` 1.10); step 2 lists `BASE` and `SWAG_PASSWORD`; in step 3 the editor shows the three header lines (what it does, `# Expect:`, `# Try:`) and `baseUrl: "{{BASE}}"`, and the Run passes.

#### TC-QS-02 Add the Quick Start project to an empty workspace — P1, E2E

Covers PRD 4.2.2. Pre: S1 (Quick Start deleted).

1. Open `/files`.
2. Click **Add the Quick Start project**.

Expected: step 1 shows "No test files yet" and the button; after step 2 the overview and the sidebar show `Quick Start` with its files, and the button is gone.

#### TC-QS-03 The Quick Start project exists already — P2, E2E

Covers PRD 4.2.2. Pre: S1, then an empty Project named `Quick Start`.

1. Open `/files` and click **Add the Quick Start project**.

Expected: an alert says `You already have a project named Quick Start. Rename or delete it, then add it again.`; nothing is added.

#### TC-QS-04 Every Quick Start file has its expected result — P2, Manual

Covers PRD 4.2.2. Pre: TC-QS-01.

1. Run every file of the first two Modules, and validate both files of the third.
2. On a backend with a real `OPENROUTER_API_KEY`, run every file of the `4 Jev` Module (Live).
3. In one file, do what its `# Try:` line says, and run or validate it again.

Expected: each result matches the `# Expect:` line of its file: the passing files pass, the failing files fail at the stated step, the invalid files show their validation errors, two lines below the fixture's lines because of the header (`seven-errors-at-once.yaml` at lines 5, 8, 9, 10, 15, 17 and 20), and cannot run, and the Jev files pass or fail as TC-JEV-01 – TC-JEV-04 state; in step 3 the result changes as the line says.

### 4.2 Workspace sidebar (`WS`)

#### TC-WS-01 Create a Project, a Module, and a Test File — P0, E2E

Covers US-4.3.3. Pre: S1.

1. Do S2.
2. Click **New test file in Shopping**, enter `login` (no extension), **Create**.
3. Reload the page.

Expected: the tree shows `Demo Shop → Shopping → login.yaml`; the editor opens at `/files/<id>` with the heading `login.yaml`; the file link is marked current and its status dot is gray with the title "Never run"; after the reload the tree is the same.

#### TC-WS-02 Duplicate names in one parent — P1, E2E

Covers US-4.3.3. Pre: S1, S2, and `login.yaml` in `Shopping`.

1. Create a second Project named `Demo Shop`.
2. Create a second Module named `Shopping` in `Demo Shop`.
3. Create a second Test File named `login.yaml` in `Shopping`.
4. Create a Project named `Other`, a Module `Shopping` in it, and `login.yaml` in that Module.

Expected: steps 1–3 keep their dialog open with an alert, and nothing is added; step 4 succeeds, since names are unique only within their parent.

#### TC-WS-03 Name length boundaries — P2, E2E

Covers US-4.3.3. Pre: S1.

1. Create a Project with an empty name.
2. Create a Project with a 100-character name.
3. Create a Project with a 101-character name.

Expected: step 1 is refused (the dialog stays open); step 2 succeeds; step 3 shows an alert in the dialog and adds nothing.

#### TC-WS-04 Rename a Project, a Module, and the open Test File — P1, E2E

Covers US-4.3.3. Pre: S1, S2, `login.yaml` open in the editor.

1. **Rename test file login.yaml** → `sign-in`, **Save**.
2. **Rename module Shopping** → `Checkout`, **Save**.
3. **Rename project Demo Shop** → `Swag Labs`, **Save**.
4. Open **Rename test file sign-in.yaml** and leave the name unchanged.

Expected: steps 1–3 update the tree at once; the Test File's Rename input shows the name without `.yaml`, which is shown after it; after step 1 the editor heading is `sign-in.yaml`; in step 4 the input shows `sign-in` and **Save** is disabled.

#### TC-WS-05 Delete the open Test File — P1, E2E

Covers US-4.3.3. Pre: S1, S2, `login.yaml` open in the editor.

1. Click **Delete test file login.yaml**; the dialog shows `Delete test file "login.yaml"? Run history is kept.`; click **Delete**.

Expected: the app goes to `/files`; the file is gone from the tree and the overview.

#### TC-WS-06 Delete a Project with everything in it — P1, E2E

Covers US-4.3.3. Pre: S1, S2, S3, a Test File in `Shopping`.

1. Click **Delete project Demo Shop**; check the text; click **Delete**.

Expected: the dialog says `Delete project "Demo Shop" and all its modules, test files and variables? Run history is kept.`; afterwards the overview shows "No test files yet".

#### TC-WS-07 Collapse and expand the tree — P2, Manual

Covers US-4.3.3. Pre: S1, S2, a Test File.

1. Click the Project row, then the Module row, then each again.
2. Narrow the window below the mobile breakpoint.

Expected: rows toggle their children; on a narrow window the sidebar hides behind a ☰ button that opens it.

#### TC-WS-08 Unicode and surrounding spaces in names — P1, E2E

Covers US-4.3.3. Pre: S1.

1. Create a Project named `Démo 商店 🛒`.
2. Create a Project named `  Padded  `.
3. Create a Project named three spaces.

Expected: step 1 shows the name unchanged, also after a reload; step 2 is saved as `Padded`; step 3 keeps the dialog open with an alert and adds nothing.

#### TC-WS-09 Test File names use letters, digits, `-`, `_` and `.`, before a fixed `.yaml` — P1, E2E

Covers US-4.3.3. Pre: S1, S2.

1. Open **New test file in Shopping**: `.yaml` is shown after the Name input.
2. Create Test Files named `sign in`, `商店`, and `a/b`, one at a time.
3. Create Test Files named `  spaced  `, `v1.2`, and `pasted.yaml`.

Expected: each name of step 2 keeps the dialog open with `Use only letters, digits, -, _ and ., with no spaces.` under the input, marked invalid, and adds nothing; step 3 creates `spaced.yaml`, `v1.2.yaml`, and `pasted.yaml` (a typed `.yaml` is not doubled).

### 4.3 Editor (`ED`)

#### TC-ED-01 Starter source and unsaved changes — P0, E2E

Covers US-4.3.3. Pre: S1, S2, a new Test File `editor.yaml`.

1. Look at the textarea.
2. Type a character.
3. Delete it again.

Expected: step 1 shows `name: "editor"` with one `open` step; step 2 shows "Unsaved changes" and enables **Save**; step 3 hides "Unsaved changes" and disables **Save**.

#### TC-ED-02 Save, keep showing, and reload — P0, E2E

Covers US-4.3.3. Pre: TC-ED-01.

1. Replace the source with `pass/sign-in.yaml`, click **Save**.
2. Reload the page.

Expected: after step 1 "Unsaved changes" disappears, the textarea still shows the saved source, and the result bar shows "Valid. Ready to run."; after step 2 the textarea shows the saved source.

#### TC-ED-03 Upload a file — P1, E2E

Covers US-4.3.3. Pre: S1, S2, a new Test File.

1. Click **Upload file** and choose `pass/checkout.yaml`.
2. Reload the page without saving.
3. Upload it again and click **Save**.

Expected: step 1 replaces the textarea with the file and shows "Unsaved changes"; step 2 shows the old source (Upload does not save); step 3 saves it. The picker accepts `.yaml` and `.yml`.

#### TC-ED-04 Validate a file with several errors — P0, E2E

Covers US-4.3.1. Pre: S1, S2, a new Test File.

1. Load `invalid/multiple-errors.yaml`; click **Validate**.
2. Click **Save**.

Expected: the result bar shows "7 validation errors" and one item per row of the table in 2.4, as `Line <line>: <message>`, in line order; no browser is started. Save still saves the file and shows the same diagnostics.

#### TC-ED-05 Validate a YAML syntax error — P1, E2E

Covers US-4.3.1. Pre: S1, S2, a new Test File.

1. Load `invalid/yaml-syntax.yaml`; click **Validate**.

Expected: "1 validation error" and `Line 7: Nested mappings are not allowed in compact mappings`.

#### TC-ED-06 Fix the errors — P1, E2E

Covers US-4.3.1. Pre: TC-ED-04.

1. Replace the source with `pass/sign-in.yaml`; click **Validate**.

Expected: "Valid. Ready to run." with no list items; editing again clears the result bar.

#### TC-ED-07 Source size limit (boundary) — P2, E2E

Covers US-4.3.3. Pre: S1, S2, a new Test File.

1. Save a valid source padded with a YAML comment to exactly 262,144 characters.
2. Save it with one more character.

Expected: step 1 saves; step 2 shows `The test file is too long: it can be at most 262,144 characters.` in an alert, and keeps the draft.

#### TC-ED-08 A file with no steps at all — P2, E2E

Covers US-4.3.1. Pre: S1, S2, a new Test File.

1. Clear the textarea; click **Validate**.
2. Load `invalid/empty.yaml` (a comment only); click **Validate**.

Expected: both show "1 validation error" and `Line 1: The root must be an object`.

#### TC-ED-09 Integer limits (boundary) — P2, E2E

Covers US-4.3.1. Pre: S1, S2, a new Test File.

1. Load `invalid/timeout-bounds.yaml`; click **Validate**.

Expected: "2 validation errors": `Line 5: "ms" must be a positive integer up to 2147483647` and the same at line 7 (`1e3`). Line 3 (`timeoutMs: 2147483647`) and line 6 (`ms: 1`) are valid.

### 4.4 Project Variables (`VAR`)

#### TC-VAR-01 Add, replace, and delete a Variable — P0, E2E

Covers US-4.3.3. Pre: S1, S2.

1. Open **Variables for Demo Shop**: it shows "No variables yet".
2. Save `BASE` with the value of 2.3.
3. Save `BASE` again with another value.
4. Click **Delete BASE**.

Expected: after step 2 `BASE` is listed once and its value is not shown anywhere; step 3 keeps one `BASE`; step 4 removes it.

#### TC-VAR-02 Invalid Variable names — P1, E2E

Covers US-4.3.3. Pre: S1, S2, the Variables dialog open.

1. Save `base` with any value.
2. Save `1BASE`.
3. Save `_BASE_1`.

Expected: steps 1–2 show `Variable names use capital letters, digits and _, and do not start with a digit, for example BASE_URL.` without a request; step 3 is saved.

#### TC-VAR-03 Run with a Variable that is not set — P1, E2E

Covers US-4.3.4. Pre: S1–S3.

1. S4 with `fail/missing-variable.yaml`; S5.

Expected: Status `Failed`; step 1 Passed; step 2 Failed with `Variable {{NOT_SET}} is not set`; step 3 Pending; "1/3 passed".

#### TC-VAR-04 Variables are per Project — P2, E2E

Covers US-4.3.3. Pre: S1–S3, a second Project `Other` with a Module and `pass/sign-in.yaml`, and no Variables.

1. Run the file in `Other`.

Expected: step 1 fails with `Variable {{BASE}} is not set`; Variables of `Demo Shop` are not used.

#### TC-VAR-05 Variable value limits (boundary) — P2, E2E

Covers US-4.3.3. Pre: S1, S2, the Variables dialog open.

1. Fill only the Name, then only the Value.
2. Save `LONG` with a value of 10,000 characters.
3. Save `LONG` with a value of 10,001 characters.

Expected: step 1 keeps **Save** disabled; step 2 lists `LONG`; step 3 shows `A Variable value can be at most 10,000 characters.` in the dialog's alert without a request, and the dialog stays open.

#### TC-VAR-06 A value with special characters — P1, E2E

Covers US-4.3.4. Pre: S1–S3, and `DISPLAY_NAME` set to `Zoë "the <b>Swag</b>" Fan & 商店`.

1. S4 with `pass/variable-value.yaml`; S5.

Expected: `Passed`, "3/3 passed": the value is typed into the prompt and read back unchanged, without being treated as HTML.

### 4.5 Runs and Live Progress (`RUN`)

#### TC-RUN-01 Run a passing test and watch it live — P0, E2E

Covers US-4.3.4. Pre: S1–S3.

1. S4 with `pass/sign-in.yaml`.
2. Click **Run**.
3. Click **View run** and watch the page without reloading.

Expected:
- Step 2 shows "Run queued." and the Runs list gains one Run.
- On the Run page the heading is `sign-in.yaml`; the status moves from `Queued` or `Running` to `Passed` without a reload.
- The "Steps" list has 6 items; each moves from Pending to Running to Passed, in order.
- At the end: "6/6 passed", a duration, every element step shows `selector`, and the sidebar dot is green with the title "Passed".

#### TC-RUN-02 Run a longer flow — P1, E2E

Covers US-4.3.4. Pre: S1–S3.

1. S4 with `pass/checkout.yaml`; S5.

Expected: `Passed`, "16/16 passed".

#### TC-RUN-03 Assert the app's own error — P1, E2E

Covers US-4.3.4. Pre: S1–S3.

1. S4 with `pass/locked-out.yaml`; S5.

Expected: `Passed`, "6/6 passed". A sign-in that the Demo App refuses is a passing test when the test expects it.

#### TC-RUN-04 Every action and dialog answer — P1, E2E

Covers US-4.3.4. Pre: S1–S3.

1. S4 with `pass/all-actions.yaml`; S5.

Expected: `Passed`, "35/35 passed". The steps include `open`, `input`, `click`, `doubleClick`, `rightClick`, `hover`, `press`, `scroll`, `sleep`, `back`, `forward`, `reload`, `switchTab`, `waitFor`, and `assert`, and accepted, prompted, and dismissed dialogs.

#### TC-RUN-05 A failing assertion stops the Run — P0, E2E

Covers US-4.3.2, US-4.3.4. Pre: S1–S3.

1. S4 with `fail/wrong-total.yaml`; S5.

Expected: `Failed`, "13/16 passed"; step 14 is Failed with the reason `Text of "[data-test="total-label"]" did not contain "Total: $99.99" within 3000ms; it was "Total: $32.39"` and a screenshot; steps 15–16 are Pending with no screenshot; the sidebar dot is red with the title "Failed".

#### TC-RUN-06 A selector that matches nothing — P1, E2E

Covers US-4.3.2. Pre: S1–S3.

1. S4 with `fail/missing-element.yaml`; S5.

Expected: `Failed` within about 5 s; step 2 Failed with locate method `selector` and the reason `No element matches "[data-test="no-such-button"]" within 3000ms`; step 3 Pending. With a `selector` and no `target`, Jev is never called.

#### TC-RUN-07 A second Run waits in the queue — P0, E2E

Covers US-4.3.4. Pre: S1–S3; `RUN_CONCURRENCY=1`; no other Run active.

1. S4 with `pass/slow.yaml` as `slow.yaml`, click **Run**.
2. Within 5 s, S4 with `pass/sign-in.yaml` as `sign-in.yaml`, click **Run**, then **View run**.

Expected: the second Run shows `Queued` while `slow.yaml` runs, then `Running`, then `Passed`, all without a reload. Both Runs pass.

#### TC-RUN-08 Open a Run page late — P1, E2E

Covers US-4.3.4. Pre: S1–S3.

1. S4 with `pass/slow.yaml`, click **Run**, wait 3 s, then click **View run**.

Expected: steps already done show as Passed at once (the snapshot); the rest follow live; the Run ends `Passed`.

#### TC-RUN-09 An unexpected dialog fails the step — P1, E2E

Covers US-4.3.4. Pre: S1–S3.

1. S4 with `fail/unexpected-dialog.yaml`; S5.

Expected: `Failed`; step 2 Failed with `Unexpected alert dialog: "Profile saved"`; step 3 Pending.

#### TC-RUN-10 The whole Run times out (boundary) — P1, E2E

Covers US-4.3.4. Pre: S1–S3.

1. S4 with `fail/run-timeout.yaml`; S5.

Expected: `Failed` after about 10 s; the header shows `Timed out: The run did not finish within runTimeoutMs (10000 ms)`; step 2 Failed with the same reason; step 3 Pending.

#### TC-RUN-11 Run an invalid file — P0, E2E

Covers US-4.3.1. Pre: S1–S3.

1. S4 with `invalid/multiple-errors.yaml`; click **Run**.

Expected: no "Run queued."; the result bar shows the 7 diagnostics; the Runs list still shows "No runs yet".

#### TC-RUN-12 Run with unsaved changes — P1, E2E

Covers US-4.3.4. Pre: S1–S3, a saved Test File.

1. Load `pass/sign-in.yaml` without saving; click **Run**.
2. Reload the page.

Expected: Run saves first, then queues the Run; after the reload the saved source is the new one; the Run uses the new source.

#### TC-RUN-13 Live Progress is lost — P2, Manual

Covers US-4.3.4. Pre: S1–S3, a Run of `pass/slow.yaml` open on its Run page.

1. While it runs, stop the backend.

Expected: the page keeps the last state and shows "Live progress disconnected".

#### TC-RUN-14 The server restarts during a Run — P2, Manual

Covers US-4.3.4. Pre: TC-RUN-13.

1. Start the backend again; open the Run page.

Expected: `Failed` with `Interrupted: Interrupted by a server restart`; "No step results".

#### TC-RUN-15 A double click on Run — P1, E2E

Covers US-4.3.4. Pre: S1–S3, S4 with `pass/sign-in.yaml`.

1. Double-click **Run**.

Expected: one "Run queued."; after a reload the Runs list shows exactly one Run, since **Run** is disabled while its request is in flight.

#### TC-RUN-16 The file is deleted while its Run waits — P1, E2E

Covers US-4.3.4, US-4.3.5. Pre: S1–S3, a Run of `pass/slow.yaml` running, then a queued Run of `pass/sign-in.yaml`.

1. Delete `sign-in.yaml` while its Run is still `Queued`; open that Run.

Expected: the Run still runs its copy of the source and ends `Passed`, "6/6 passed"; the Run page has no "Back to …" link.

#### TC-RUN-17 A dialog with another message — P1, E2E

Covers US-4.3.4. Pre: S1–S3.

1. S4 with `fail/dialog-message.yaml`; S5.

Expected: `Failed`; step 2 Failed with `The dialog said "Profile saved", which does not contain "Profile deleted"`; step 3 Pending.

#### TC-RUN-18 switchTab with no matching tab — P1, E2E

Covers US-4.3.4. Pre: S1–S3.

1. S4 with `fail/no-tab.yaml`; S5.

Expected: `Failed` within about 5 s; step 2's reason starts with `No tab matched "**/extras/returns.html" within 3000ms` and lists the open tab as `{{BASE}}/extras/tabs.html`, with the Variable, not its value.

#### TC-RUN-19 back on the first page — P2, E2E

Covers US-4.3.4. Pre: S1–S3.

1. S4 with `fail/no-history.yaml`; S5.

Expected: `Failed`; step 2 Failed with `There is no previous page to go back to`; step 3 Pending.

### 4.6 Run page and history (`RPT`)

#### TC-RPT-01 Report of a passed Run — P0, E2E

Covers US-4.3.5. Pre: TC-RUN-01.

1. On the finished Run page, look at each step.
2. Click **Download report**, then **Download trace**.
3. Click **Back to sign-in.yaml**.

Expected:
- Each step shows "Step n", its action, "line n", "Passed", a duration, and a screenshot with alt "Step n screenshot"; element steps also show `selector`.
- `report.json` has `status: "passed"`, `summary` `{ total: 6, passed: 6, failed: 0, pending: 0 }`, and one entry per step; `trace.zip` opens in `pnpm exec playwright show-trace`.
- Step 3 returns to the editor, where the Runs list shows the Run as "Passed" with its trigger time and duration.

#### TC-RPT-02 Report of a failed Run — P1, E2E

Covers US-4.3.5. Pre: TC-RUN-05.

1. Look at step 14; click its screenshot, then press Escape.
2. Download the report.

Expected: the screenshot shows the checkout overview with `Total: $32.39`; clicking it opens the image full size in a dialog named "Step 14 screenshot", which Escape closes; `report.json` has `status: "failed"` and step 14's `reason`.

#### TC-RPT-03 Run history lists every Run — P1, E2E

Covers US-4.3.5. Pre: S1–S3, S4 with `pass/sign-in.yaml`.

1. Run it three times; between Runs, replace the source with `fail/wrong-total.yaml` once and save.

Expected: the Runs list shows three Runs, newest first, each with status, trigger time, and duration; each link opens its Run, whose "Source when it ran" section shows the source as it was when it ran.

#### TC-RPT-04 Runs are kept after their file is deleted — P2, E2E

Covers US-4.3.5. Pre: TC-RPT-01; note the Run URL.

1. Delete `sign-in.yaml`; open the noted Run URL.

Expected: the Run page still shows its steps and report; the "Back to …" link is hidden.

#### TC-RPT-05 A Run that does not exist — P2, E2E

Covers US-4.3.5. Pre: S1.

1. Open `/runs/00000000-0000-4000-8000-000000000000`.

Expected: "Run not found".

#### TC-RPT-06 Malformed ids in the URL — P2, E2E

Covers US-4.3.5. Pre: S1.

1. Open `/runs/not-a-uuid`.
2. Open `/files/not-a-uuid`.

Expected: step 1 shows "Run not found" and step 2 "Test file not found", as for ids that do not exist; the app does not crash.

### 4.7 Files overview (`OV`)

#### TC-OV-01 Empty and grouped overview — P1, E2E

Covers PRD 5.4.3. Pre: S1.

1. Open `/files`.
2. Do S2 and add `sign-in.yaml`; open `/files` again.
3. Click the file link in the "Test files" region.

Expected: step 1 shows "No test files yet"; step 2 shows the heading `Demo Shop`, the heading `Shopping`, and `sign-in.yaml` with "Never run"; step 3 opens `/files/<id>`.

#### TC-OV-02 Latest status per file — P1, E2E

Covers PRD 5.4.3. Pre: S1–S3, `sign-in.yaml` (`pass/sign-in.yaml`) and `wrong-total.yaml` (`fail/wrong-total.yaml`) in `Shopping`.

1. Run both; wait until both finish; open `/files`.
2. Run `wrong-total.yaml` again; while it runs, open `/files`.

Expected: step 1 shows "Passed" and "Failed" with their trigger times; step 2 shows "Running" for `wrong-total.yaml`, and "Failed" again when the page is reloaded after the Run finishes. The overview does not update itself while it is open (`docs/tech/frontend.md` 1.10).

### 4.8 Security (`SEC`)

#### TC-SEC-01 Another user's Test File — P0, E2E

Covers US-4.3.7. Pre: user A with a Test File; note its URL.

1. In a new browser context, register user B; open A's file URL.

Expected: "Test file not found"; B's sidebar shows none of A's Projects.

#### TC-SEC-02 Another user's Run — P0, E2E

Covers US-4.3.7. Pre: user A with a finished Run; note its URL and a screenshot URL without its `token`.

1. As user B, open A's Run URL.
2. As user B, open A's screenshot URL with B's token.

Expected: step 1 shows "Run not found"; step 2 answers `404`.

#### TC-SEC-03 A secret Variable never shows — P1, E2E

Covers US-4.3.7. Pre: S1–S3.

1. S4 with `fail/redaction.yaml`; S5; download the report.

Expected: step 2's reason contains `{{SWAG_PASSWORD}}` and not `secret_sauce`, on the page, in Live Progress, and in `report.json`.

#### TC-SEC-04 Cloud Runs cannot open private addresses — P1, Manual (*production*)

Covers PRD 4.3.10 (blocking private networks is in scope). Pre: production; S1, S2.

1. Set `BASE` to `http://127.0.0.1:8080`; S4 with `pass/sign-in.yaml`; S5.
2. Set `BASE` to `http://169.254.169.254`; run again.

Expected: both Runs fail at step 1 with `net::ERR_FAILED` or `net::ERR_CONNECTION_REFUSED`; no page content from those addresses appears in the screenshot.

#### TC-SEC-05 HTML in Project and Module names is shown as text — P1, E2E

Covers US-4.3.7. Pre: S1.

1. Create a Project and a Module named `<img src=x onerror=alert(1)>`, and in it a Test File named `plain` (Test File names allow no `<` or `>`, TC-WS-09).
2. Open `/files` and the Test File.

Expected: the names show as the literal text in the sidebar and the overview; no `img` element is added and no dialog opens.

#### TC-SEC-06 Run Files cannot leave their Run — P1, E2E

Covers US-4.3.7. Pre: a finished Run of user A.

1. As A, request `/runs/<id>/files/` with `../../../.env`, `..%2F..%2F..%2F.env`, and `..%2f..%2f..%2f..%2f..%2fetc%2fpasswd`, each with A's token.

Expected: each answers `404`, and no answer contains the server's `.env` or `/etc/passwd`.

#### TC-SEC-07 Live Progress checks the token and the owner — P1, E2E

Covers US-4.3.7. Pre: a Run of user A; user B.

1. Open `/runs/<id>/live?token=invalid` as a WebSocket.
2. Open it with B's token.
3. Open it with A's token.

Expected: step 1 closes with code `4401`, step 2 with `4404`, and step 3 receives a `snapshot` message.

### 4.9 Jev locating and judging (`JEV`)

These cases call Jev. Run each up to twice; report a case only when both attempts fail.

#### TC-JEV-01 Locate by description only — P1, Live

Covers US-4.3.2. Pre: S1–S3.

1. S4 with `jev/target-sign-in.yaml`; S5.

Expected: `Passed`, "6/6 passed"; steps 2–4 show `visual` or `dom`, never `selector`.

#### TC-JEV-02 Fall back from a stale selector — P1, Live

Covers US-4.3.2. Pre: S1–S3.

1. S4 with `jev/stale-selector.yaml`; S5.

Expected: `Passed`; step 4 shows `visual` or `dom` and takes longer than the selector steps (the selector probe waits up to 2 s first).

#### TC-JEV-03 A true statement holds — P1, Live

Covers US-4.3.2. Pre: S1–S3.

1. S4 with `jev/statement-holds.yaml`; S5.

Expected: `Passed`, "9/9 passed". Step 9's `selector` matches nothing and its statement holds, so it passes as a fallback.

#### TC-JEV-04 A false statement fails — P1, Live

Covers US-4.3.2. Pre: S1–S3.

1. S4 with `jev/statement-fails.yaml`; S5.

Expected: `Failed`; step 8 Failed with `Statement does not hold`; "7/8 passed".

#### TC-JEV-05 Nothing can be located — P2, Live

Covers US-4.3.2. Pre: S1–S3, a Test File whose step 2 is `click: { target: "Purple 'Teleport' button" }` after `open: { url: "/" }`.

1. S5.

Expected: `Failed`; step 2's reason lists `visual` and `dom`, each with why it failed; a screenshot is recorded.

### 4.10 CLI and API smoke (`CLI`, `API`)

#### TC-CLI-01 Validate from the command line — P1, Manual

Covers US-4.3.1, US-4.3.6. Pre: the repository installed.

1. `pnpm jevwright validate src/tests/e2e/fixtures/invalid/multiple-errors.yaml`; note the exit code.
2. Add `--json`.
3. `pnpm jevwright validate src/tests/e2e/fixtures/pass`.

Expected: step 1 prints the 7 diagnostics of 2.4 as `file:line — Error: message` and exits `2`; step 2 prints only a JSON array; step 3 exits `0`. No browser starts.

#### TC-CLI-02 Run from the command line — P1, Manual

Covers US-4.3.6. Pre: the Demo App on `http://127.0.0.1:8080`; `SWAG_PASSWORD` in `.env`.

1. `BASE=http://127.0.0.1:8080 pnpm jevwright run src/tests/e2e/fixtures/pass/sign-in.yaml`.
2. The same with `fail/wrong-total.yaml`.

Expected: step 1 prints each step, `PASSED (6/6 passed)`, exits `0`, and writes `report.json`, `trace.zip`, and screenshots under `jevwright-reports/`; step 2 exits `1`.

#### TC-API-01 OpenAPI document and Swagger UI — P2, Manual

Covers US-4.3.8. Pre: the backend running.

1. Open `<API>/api/v1/docs`.
2. With a token from login, call `POST /test-files/:id/runs` and `GET /runs/:id` from Swagger UI.

Expected: the docs load; the Run answers `202` and then its result, with the shapes the document shows; without a token both answer `401`.

### 4.11 Accessibility (`A11Y`)

#### TC-A11Y-01 Keyboard only — P2, Manual

Pre: S1–S3, a Test File.

1. Without a mouse, sign in, create a Project, Module, and Test File, open the Variables dialog, edit, save, run, and open the Run.

Expected: every control is reachable with Tab and has a visible focus ring; dialogs take focus and close with Escape; row actions show on focus.

#### TC-A11Y-02 Status and live updates — P2, Manual

Pre: a Run in progress.

1. Look at status dots and step statuses; use a screen reader on the Run page.

Expected: every status has text or a title, not only a color; step updates are announced politely (`aria-live="polite"`); screenshots have their alt text; every field has a label and errors are linked with `aria-describedby`.

## 5. Running a Pass

**E2E**: `pnpm test:e2e` runs every E2E case (`docs/tech/e2e.md` 3). A case's ID appears in its test title, for example `test("TC-RUN-01 runs a passing test and watches it live", …)`, so a failure maps to this document.

**Manual**: work through the cases by priority, P0 first. For each, record pass or fail, the environment (local or production), the commit or deployed version, and for a failure the Run URL, `report.json`, and a screen capture. Open one issue per failure, naming the case ID.

## 6. Traceability

| Requirement | Cases |
| ----------- | ----- |
| US-4.3.1 Validation | ED-04 – ED-06, ED-08, ED-09, RUN-11, CLI-01 |
| US-4.3.2 Locating | RUN-05, RUN-06, JEV-01 – JEV-05 |
| US-4.3.3 Organization and authoring | WS-01 – WS-09, ED-01 – ED-03, ED-07, VAR-01, VAR-02, VAR-04, VAR-05 |
| US-4.3.4 Live execution | RUN-01 – RUN-19, VAR-03, VAR-06 |
| US-4.3.5 History and reports | RPT-01 – RPT-06, RUN-16 |
| US-4.3.6 Local CLI | CLI-01, CLI-02 |
| US-4.3.7 Authentication and isolation | AUTH-01 – AUTH-08, SEC-01 – SEC-03, SEC-05 – SEC-07 |
| PRD 4.2.2 Landing page and Quick Start | LAND-01 – LAND-08, QS-01 – QS-04 |
| `docs/tech/design-system.md` Themes and contrast | THEME-01 – THEME-05 |
| US-4.3.8 Public API | API-01 |
| PRD 5.4.3 Files overview | OV-01, OV-02 |
| Private network blocking (`docs/tech/backend.md` 1.6) | SEC-04 |
| AGENTS.md 7.2 Accessibility | A11Y-01, A11Y-02 |

## Appendix A. Test File Sources

The files in `src/tests/e2e/fixtures/` are the source; this appendix is a copy for pasting.

### `pass/sign-in.yaml`

```yaml
# Expect: passed, 6/6 steps, every locate method "selector"
name: "Sign in"
description: "A standard user signs in and sees the product list"
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
  - waitFor:
      url: "**/inventory.html"
  - assert:
      selector: '[data-test="title"]'
      text: "Products"
```

### `pass/checkout.yaml`

```yaml
# Expect: passed, 16/16 steps
name: "Checkout"
description: "A standard user buys the backpack"
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
  - waitFor:
      url: "**/inventory.html"
  - click:
      selector: '[data-test="add-to-cart-sauce-labs-backpack"]'
  - click:
      selector: '[data-test="shopping-cart-link"]'
  - assert:
      selector: '[data-test="title"]'
      text: "Your Cart"
  - click:
      selector: '[data-test="checkout"]'
  - input:
      selector: '[data-test="firstName"]'
      value: "Ada"
  - input:
      selector: '[data-test="lastName"]'
      value: "Lovelace"
  - input:
      selector: '[data-test="postalCode"]'
      value: "10001"
  - click:
      selector: '[data-test="continue"]'
  - assert:
      selector: '[data-test="total-label"]'
      text: "Total: $32.39"
  - click:
      selector: '[data-test="finish"]'
  - assert:
      selector: '[data-test="complete-header"]'
      text: "Thank you for your order!"
```

### `pass/locked-out.yaml`

```yaml
# Expect: passed; the test asserts the Demo App's own error, so a refused sign-in is a passing test
name: "Locked-out user"
description: "A locked-out user cannot sign in and sees why"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/"
  - input:
      selector: '[data-test="username"]'
      value: "locked_out_user"
  - input:
      selector: '[data-test="password"]'
      value: "{{SWAG_PASSWORD}}"
  - click:
      selector: '[data-test="login-button"]'
  - assert:
      selector: '[data-test="error"]'
      text: "Sorry, this user has been locked out."
  - assert:
      url: "/"
```

### `pass/all-actions.yaml`

```yaml
# Expect: passed; every action of the syntax runs once, by selector only
name: "All actions"
description: "Every action and dialog answer on the Demo App's extra pages"
baseUrl: "{{BASE}}"
timeoutMs: 10000
steps:
  # Dialogs: alert with message, prompt with text, confirm dismissed
  - open:
      url: "/extras/dialogs.html"
  - click:
      selector: "#save"
      dialog: { accept: true, message: "Profile saved" }
  - click:
      selector: "#rename"
      dialog: { accept: true, text: "Swag Lover" }
  - assert:
      selector: "#display-name"
      text: "Swag Lover"
  - click:
      selector: "#delete"
      dialog: { accept: false }
  - assert:
      selector: "#status"
      text: "Your account was kept."
  # Hover, right-click, double-click
  - open:
      url: "/extras/menus.html"
  - hover:
      selector: "#account-menu"
  - click:
      selector: "#sign-out-link"
  - assert:
      selector: "#status"
      text: "You are signed out."
  - rightClick:
      selector: '[data-file="packing-list.txt"]'
  - click:
      selector: "#delete-file"
  - assert:
      selector: "#status"
      text: "Deleted packing-list.txt."
  - doubleClick:
      selector: '[data-file="invoice-2026.pdf"]'
  - assert:
      selector: "#status"
      text: "Opened invoice-2026.pdf."
  # History: back, forward, reload
  - back: {}
  - assert:
      url: "/extras/dialogs.html"
  - forward: {}
  - assert:
      url: "/extras/menus.html"
  - reload: {}
  - waitFor:
      selector: '[data-file="packing-list.txt"]'
  # Tabs: open a new tab, switch to it and back
  - open:
      url: "/extras/tabs.html"
  - click:
      selector: "#returns-link"
  - switchTab:
      url: "**/extras/returns.html"
  - assert:
      selector: "#returns-window"
      text: "30 days"
  - switchTab:
      url: "**/extras/tabs.html"
  - assert:
      selector: "#shipping-link"
  # Keyboard, scroll, sleep on the product list
  - open:
      url: "/"
  - input:
      selector: '[data-test="username"]'
      value: "standard_user"
  - input:
      selector: '[data-test="password"]'
      value: "{{SWAG_PASSWORD}}"
  - press:
      key: "Enter"
  - waitFor:
      url: "**/inventory.html"
  - scroll:
      direction: "down"
      distance: 2000
  - sleep:
      ms: 300
  - assert:
      selector: '[data-test="footer-copy"]'
```

### `pass/slow.yaml`

```yaml
# Expect: passed after about 8 s; long enough for a second Run to wait as "queued" (RUN_CONCURRENCY=1)
name: "Slow"
description: "Holds the Run Queue for about 8 seconds"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/"
  - sleep:
      ms: 8000
  - assert:
      selector: '[data-test="login-button"]'
```

### `pass/variable-value.yaml`

```yaml
# Expect: passed; a Variable value with spaces, quotes, HTML, and non-ASCII text is typed and read back as is
name: "Variable value"
description: "A Variable's value reaches the page unchanged"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/extras/dialogs.html"
  - click:
      selector: "#rename"
      dialog: { accept: true, text: "{{DISPLAY_NAME}}" }
  - assert:
      selector: "#display-name"
      text: "{{DISPLAY_NAME}}"
```

### `fail/wrong-total.yaml`

```yaml
# Expect: failed at step 14 (the total assert); steps 15-16 stay pending
name: "Wrong total"
description: "The checkout total is asserted with a wrong amount"
baseUrl: "{{BASE}}"
timeoutMs: 3000
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
  - waitFor:
      url: "**/inventory.html"
  - click:
      selector: '[data-test="add-to-cart-sauce-labs-backpack"]'
  - click:
      selector: '[data-test="shopping-cart-link"]'
  - assert:
      selector: '[data-test="title"]'
      text: "Your Cart"
  - click:
      selector: '[data-test="checkout"]'
  - input:
      selector: '[data-test="firstName"]'
      value: "Ada"
  - input:
      selector: '[data-test="lastName"]'
      value: "Lovelace"
  - input:
      selector: '[data-test="postalCode"]'
      value: "10001"
  - click:
      selector: '[data-test="continue"]'
  - assert:
      selector: '[data-test="total-label"]'
      text: "Total: $99.99"
  - click:
      selector: '[data-test="finish"]'
  - assert:
      selector: '[data-test="complete-header"]'
      text: "Thank you for your order!"
```

### `fail/missing-element.yaml`

```yaml
# Expect: failed at step 2 within about 3 s, locate method "selector"; step 3 stays pending; Jev is never called
name: "Missing element"
description: "A selector that matches nothing fails without calling Jev"
baseUrl: "{{BASE}}"
timeoutMs: 3000
steps:
  - open:
      url: "/"
  - click:
      selector: '[data-test="no-such-button"]'
  - assert:
      selector: '[data-test="login-button"]'
```

### `fail/missing-variable.yaml`

```yaml
# Expect: failed at step 2 with "Variable {{NOT_SET}} is not set"; step 3 stays pending
name: "Missing variable"
description: "A Variable that is not set fails its step"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/"
  - input:
      selector: '[data-test="username"]'
      value: "{{NOT_SET}}"
  - assert:
      selector: '[data-test="login-button"]'
```

### `fail/redaction.yaml`

```yaml
# Expect: failed at step 2; the reason shows {{SWAG_PASSWORD}}, never the password itself
name: "Redaction"
description: "A failing assert on a secret Variable does not reveal its value"
baseUrl: "{{BASE}}"
timeoutMs: 3000
steps:
  - open:
      url: "/"
  - assert:
      selector: '[data-test="login-button"]'
      text: "{{SWAG_PASSWORD}}"
```

### `fail/unexpected-dialog.yaml`

```yaml
# Expect: failed at step 2; an alert on a step without `dialog` is dismissed and fails the step
name: "Unexpected dialog"
description: "A dialog the test does not expect fails the step"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/extras/dialogs.html"
  - click:
      selector: "#save"
  - assert:
      selector: "#status"
      text: "Your profile was saved."
```

### `fail/run-timeout.yaml`

```yaml
# Expect: failed after about 10 s; step 2 (sleep) fails with the Run error "timeout", step 3 stays pending
name: "Run timeout"
description: "The whole Run is cut off by runTimeoutMs"
baseUrl: "{{BASE}}"
runTimeoutMs: 10000
steps:
  - open:
      url: "/"
  - sleep:
      ms: 30000
  - assert:
      selector: '[data-test="login-button"]'
```

### `fail/dialog-message.yaml`

```yaml
# Expect: failed at step 2; the alert says "Profile saved", not the expected message
name: "Dialog message"
description: "A dialog whose text differs from the expected message fails the step"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/extras/dialogs.html"
  - click:
      selector: "#save"
      dialog: { accept: true, message: "Profile deleted" }
  - assert:
      selector: "#status"
      text: "Your profile was saved."
```

### `fail/no-tab.yaml`

```yaml
# Expect: failed at step 2 within about 3 s; no tab matches the URL
name: "No such tab"
description: "switchTab fails when no tab matches"
baseUrl: "{{BASE}}"
timeoutMs: 3000
steps:
  - open:
      url: "/extras/tabs.html"
  - switchTab:
      url: "**/extras/returns.html"
  - assert:
      selector: "#returns-window"
```

### `fail/no-history.yaml`

```yaml
# Expect: failed at step 2; the first page has no history entry to go back to
name: "No history"
description: "back fails on the first page of a tab"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/extras/tabs.html"
  - back: {}
  - assert:
      selector: "#returns-link"
```

### `invalid/multiple-errors.yaml`

```yaml
# Expect: invalid; every error is reported at once with its line, and Run answers 422
name: "Multiple errors"
timeoutMs: 0
steps:
  - open:
      url: "/"
  - aiAct: "sign in as the standard user"
  - click:
      selector: "#a"
    input:
      selector: "#b"
      value: "x"
  - input:
      selector: '[data-test="username"]'
  - click: {}
  - assert:
      selector: "#status"
      colour: "green"
```

### `invalid/yaml-syntax.yaml`

```yaml
# Expect: invalid; one YAML syntax error (E001) at line 7
name: "YAML syntax"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/"
  - click: selector: '[data-test="login-button"]'
```

### `invalid/empty.yaml`

```yaml
# Expect: invalid; a file with no content has no root object (E002 at line 1)
```

### `invalid/timeout-bounds.yaml`

```yaml
# Expect: invalid; 2147483647 is the largest timeoutMs, so only lines 5 and 7 are errors
name: "Timeout bounds"
timeoutMs: 2147483647
steps:
  - sleep: { ms: 2147483648 }
  - sleep: { ms: 1 }
  - sleep: { ms: 1e3 }
```

### `jev/target-sign-in.yaml`

```yaml
# Expect: passed; steps 2-4 locate by "visual" or "dom" (Jev), never "selector"
name: "Sign in by description"
description: "Elements are found from plain-language descriptions only"
baseUrl: "{{BASE}}"
steps:
  - open:
      url: "/"
  - input:
      target: "Username text field in the login form"
      value: "standard_user"
  - input:
      target: "Password text field in the login form"
      value: "{{SWAG_PASSWORD}}"
  - click:
      target: "Green 'Login' button below the password field"
  - waitFor:
      url: "**/inventory.html"
  - assert:
      selector: '[data-test="title"]'
      text: "Products"
```

### `jev/stale-selector.yaml`

```yaml
# Expect: passed; step 4's selector matches nothing, so Jev locates the target ("visual" or "dom")
name: "Stale selector"
description: "An outdated selector falls back to its description"
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
      selector: "#login-btn"
      target: "Green 'Login' button below the password field"
  - waitFor:
      url: "**/inventory.html"
  - assert:
      selector: '[data-test="title"]'
      text: "Products"
```

### `jev/statement-holds.yaml`

```yaml
# Expect: passed; Jev judges step 8 true. Step 9's selector matches nothing, then Jev judges its statement true (fallback pass)
name: "Statement holds"
description: "Jev judges true statements about the cart"
baseUrl: "{{BASE}}"
timeoutMs: 5000
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
  - waitFor:
      url: "**/inventory.html"
  - click:
      selector: '[data-test="add-to-cart-sauce-labs-backpack"]'
  - click:
      selector: '[data-test="add-to-cart-sauce-labs-onesie"]'
  - assert:
      statement: "The page lists products with prices and 'Add to cart' or 'Remove' buttons"
  - assert:
      selector: '[data-test="products-heading-old"]'
      statement: "Several products are shown, each with a price"
```

### `jev/statement-fails.yaml`

```yaml
# Expect: failed at step 8; Jev judges the statement false
name: "Statement fails"
description: "Jev rejects a false statement about the cart"
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
  - waitFor:
      url: "**/inventory.html"
  - click:
      selector: '[data-test="add-to-cart-sauce-labs-backpack"]'
  - click:
      selector: '[data-test="shopping-cart-link"]'
  - assert:
      statement: "The cart has no items"
```
