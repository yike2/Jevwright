# P2 Design Context Collection

This document merges `ctx/decision-log.md`, `GLOSSARY.md`, `docs/adr/0001`, and `docs/adr/0002` with their original content preserved.

## Design Decision Log (Grilling Session, 2026-10-26)

Records all questions, options, recommendations, and final conclusions from the design discussion, including decisions that were later superseded. Terminology follows `GLOSSARY.md`; hard-to-reverse decisions are documented in `docs/adr/`.

Status legend: ✅ Active ｜ 🔁 Superseded by a later decision ｜ ⏸ Shelved / Obsolete (premise no longer holds)

### I. Currently Active Design (Summary)
- **Product**: Write web tests step-by-step using YAML files (matching Midscene Instant Action capabilities, with our own custom key names that do not overlap with Midscene). Steps are written by a human or an External Agent; the platform does not perform step planning (ADR 0001).
- **Executor**: Shared `core` package (Playwright + Jev, no LLM), accepting an externally injected `page`. Locating order: XPath (optional) → Visual Locate (`Box` + `Noul`) → DOM Locate (`Choice`, including `"None of the above"`) (ADR 0002). The platform never rewrites a Test Case.
- **Harness**: Page stability wait → Three-tier confidence handling (high: act immediately / medium: crop and re-check first / low: fall back) → Actionability check → Execute. Assertions pass at `Noul` ≥ 0.8, fail at ≤ 0.2, and in between re-ask once before failing if still uncertain. Thresholds are configurable; no separate evaluation dataset for now.
- **Actions**: `open`, `click`, `input`, `press`, `scroll`, `sleep`, `waitFor`, plus `assert`.
- **Variables**: `{{NAME}}`, substituted only at input time; content sent to Jev, logs, and live streams are all redacted. Encrypted storage on the Web platform; read from `.env` in the CLI.
- **CLI**: Runs local YAML files locally, keeps results locally (terminal + HTML/JSON report), and provides `validate`.
- **Web Platform**: Deployed on the team server. Three main features: Test Authoring (editor + API upload), Live Run (dedicated worker process + WebSocket), and Run History & Reports. Public API with OpenAPI documentation. Email/password + JWT + bcrypt. Jev uses the platform key; only logged-in users can run tests, with rate limiting.
- **Contract for External Agents**: JSON Schema + `docs/test-file-format.md` + `validate`.
- **Out of Scope**: LLM planning and self-healing, TypeScript / Playwright Test integration, running user code on the server, Git sync, uploading CLI results to the server.

### II. Key Facts (Research Findings)
- **Jev 1.14** (released 2026-10-14/15, `jev-1.14.0` / `jev-preview`): Experimental image input (PNG/JPEG, requires request header `TypeSafe-Danger-Zone-Images: true`); adds `Box` question type returning normalized bounding box coordinates and confidence. `Box` never answers "not found", so official guidance recommends pairing it with a `Noul` question in the same request to ask whether the target exists. TypeSafe warns that image performance is worse than pure text and does not recommend it for production. `Choice`/`Score` include confidence, while `Noul` values are probabilities themselves. Official guidance recommends three-tier (high/medium/low) confidence handling and setting thresholds using labeled data.
- **Midscene**: Offers both Auto Planning (`ai`/`aiAct`, replanning during execution with `replanningCycleLimit` defaulting to 20) and Instant Actions (`aiTap`/`aiInput`/`aiKeyboardPress`/`aiScroll`/`aiAssert`/`aiWaitFor`/`sleep`, where AI only handles locating). Both can be mixed in YAML. Instant Actions support an optional `xpath` (priority: `xpath` → cache → AI). Has planning cache and locating cache (XPath), and replaces expired cache entries during replan (runtime self-healing). `${VAR}` is substituted before execution and its value is sent to the model. Playwright integration lives at the TS layer (`PlaywrightAgent` / fixture / reporter). Currently maintains two YAML formats: legacy `tasks`/`flow` (command `midscene`) and newer `cases`/`steps` (command `midscene-test`).
- **Playwright Test Agents (1.56+)**: `planner` outputs a Markdown test plan → `generator` produces `.spec.ts` and verifies selectors live → `healer` repairs failing tests or marks `test.fixme()`. Playwright MCP's `--secrets` flag keeps sensitive values out of the model context.

### III. Full Question Log (In Chronological Order)

#### Round 1

**Q1 Deliverable Form** ✅ (later refined by Q23/CLI)
- (a) Web platform as the core, with CLI deferred as a client of the public API ← Recommended
- (b) Framework/CLI first, with a thin dashboard shell
- (c) Equal weight to both
- **Conclusion**: (a). Later updated so Web is one entry point alongside a local CLI (see Q25). The Rubric still requires a deployed Web app, auth, and public API.

**Q2 Element Locating Method** 🔁 → Q4′
- (a) Playwright extracts DOM candidates + Jev `Choice` ← Recommended
- (b) Screenshot + VLM outputs coordinates
- (c) Screenshot passed to Jev experimental image input
- **Conclusion**: User asked to check Jev's image capabilities first (found Jev 1.14 supports `Box`), then decided to include both (a) and (c).

**Q3 Who Breaks Tests into Steps** 🔁 → ADR 0001
- (a) User writes Steps one by one ← Recommended
- (b) User writes a high-level goal, LLM plans the steps
- (c) Support both
- **Conclusion**: User answered "(a) and (b)", initially interpreted as (c). Later changed overall to "write explicit Steps only; leave planning to External Agents."

#### Round 2

**Q4 Locating Strategy (Based on Jev 1.14)** 🔁 → Q4′
- (a) DOM first, `Box` as fallback ← Recommended
- (b) `Box` first (Midscene style)
- (c) DOM only

**Q5 When Does Goal Mode Call the LLM** ⏸ (Obsolete after ADR 0001)
- (a) Generate once at authoring time, then replay ← Recommended
- (b) Plan live on every Run (autonomous agent)
- (c) (a) first, then (b)
- **Conclusion**: User initially chose in-loop planning and replanning on failure. Later made obsolete as a whole.

**Q6 Three Roles** 🔁 → Q10
- (a) Owner / Editor / Viewer ← Recommended
- (b) No role system; satisfy the rubric with 3 distinct features instead
- **Conclusion**: Confirmed the Rubric requires "3+ distinct features/roles" (either/or), so roles are not mandatory; switched to 3 distinct features.

**Q4′ How to Combine DOM and Image Locating** ✅ (ADR 0002)
- (a) Automatic fallback chain: DOM → Visual ← Recommended
- (b) Manual selection by the user
- (c) Run both and cross-check
- **Conclusion**: Run Visual first, fall back to DOM if it fails (opposite of the recommended order). Fallback trigger: low `Noul` (target presence) or low `Box` confidence.

#### Round 3

**Q7 Should a Failed Step Trigger Replan** ⏸
- (a) Fail immediately; only Goal lines trigger Replan ← Recommended
- (b) Hand Step failures over to LLM Replan as well
- **Conclusion**: User noted the need to distinguish authoring time from runtime. Obsolete after the model changed.

**Q8 When Is a Goal Considered Complete** ⏸ (Obsolete after ADR 0001)
- (a) Judge after each step using Jev `Noul`, with Replan limit `N=3` ← Recommended
- (b) LLM declares completion itself
- **Conclusion**: Chose (a), later made obsolete.

**Q9 Should Successful Plans Be Cached for Replay** ⏸
- (a) Do not save ← Recommended
- (b) Save (Midscene caching approach)
- **Conclusion**: No longer needed after switching to the two-stage authoring/runtime model.

**Q10 Three Features** ✅
- (a) Test Authoring, Live Run, Run History & Reports ← Recommended
- (b) Replace one with scheduled runs or CI webhooks
- **Conclusion**: (a).

#### Round 4

**Q11 / Q11′ Overall Model and Mixing Goals with Steps** ⏸
- **Q11**: (a) Goal only (b) User writes Steps, LLM refines (c) Both ← Recommended (d) Misunderstood
- **Q11′**: (a) Mix Goal lines and Step lines ← Recommended (b) Single Goal only (c) Steps only
- **Conclusion**: Referencing Midscene, the user decided to allow runtime auto-repair and asked to see a mixed example. Later superseded by the explicit YAML file model.

**Q12 How to Report a Repaired Run** ⏸
- (a) Separate `passed (repaired)` status ← Recommended
- (b) Count directly as `passed`
- (c) Count as `failed`
- **Conclusion**: (b) (do not report separately). Obsolete after auto-repair was removed.

**Q14 Can a Failed Assertion Be Repaired** ✅
- (a) No ← Recommended
- (b) Hand over to LLM to replan
- **Conclusion**: (a). The platform now performs no repair on any Step.

**Q15 / Q15′ How to Mark Line Types** ⏸ (Replaced by YAML keys)
- **Q15**: (a) Prefix assertions only ← Recommended (b) Prefix all three types (c) Jev infers automatically
- **Q15′** (revised after checking how Midscene Instant Action works): (a) Prefix all three types; unprefixed lines are treated as Goals ← Recommended (b) Prefix assertions only
- **Conclusion**: Q15′ (a), later superseded by YAML format.

**Q13 Should Repair Results Be Written Back** ✅ (Spirit preserved)
- (a) Do not write back ← Recommended
- (b) Overwrite automatically (Midscene replaces its locating cache)
- **Conclusion**: (a). The rule now is that the platform never rewrites a Test Case.

#### Round 5 (Comparing Each Point Against Midscene and Playwright)

**Q8 (Revisited)**: Conclusion (a) (Jev `Noul` check + Replan limit), later obsolete.

**Q16 Passwords in Tests** ✅
- (a) Plaintext
- (b) Project-level encrypted variables `{{NAME}}`, substituted only at execution time, redacted everywhere ← Recommended (matches Playwright MCP `--secrets`; Midscene's `${}` sends plaintext values to the model)
- **Conclusion**: (b).

**Q18 / Q18′ User Confirmation Before Saving** ⏸
- **Q18**: (a) Auto-save (b) Confirmation UI ← Recommended
- **Q18′** (acknowledging the earlier reasoning was flawed: Midscene's `ai:` also hides expansion until the post-run report): (a) Midscene-style auto-save with read-only Step display ← Recommended (b) Playwright-style confirmation UI
- **Conclusion**: Unanswered; obsolete with the file model.

#### Round 6 (Direction Pivot: Instant Action Only, Planning Left to External Agents → ADR 0001)

**Q19 What Remains of Runtime "Auto-Repair"** ✅
- (a) Only locating-layer fallback remains; true repair is left to External Agents (similar to Playwright `healer`) ← Recommended
- (b) Keep LLM Replan
- **Conclusion**: (a).

**Q20 How External Agents Integrate** 🔁
- (a) Provide REST API only; defer MCP ← Recommended
- (b) Build an MCP server in this Sprint
- **Conclusion**: Changed to "External Agents write `.yaml` files."

**Q21 Dry-Run Before Saving** ✅
- (a) Keep dry-run
- (b) No dry-run; an actual Run is the verification ← Recommended (matches Midscene)
- **Conclusion**: (b).

**Q22 File Format** ✅
- (a) YAML, Instant Action style ← Recommended
- (b) Custom plain-text prefixes
- (c) Markdown (Playwright plan style)
- **Conclusion**: (a) (key names in Q31).

**Q23 How Files Are Provided to the Platform** ✅
- (a) Stored in the database, with an in-browser editor and API upload/download ← Recommended
- (b) Git repository sync
- (c) Local CLI only
- **Conclusion**: (a), adding that "Web is not the only entry point; a local CLI also runs local YAML files."

#### Round 7

**Q25 Where Does the CLI Execute and Where Are Results Stored** ✅
- (a) Execute locally, keep results locally, share the `core` package with the worker ← Recommended
- (b) Execute locally, `--upload` results to the server
- (c) CLI acts as a remote control that executes on the server
- **Conclusion**: (a).

**Q24 How to Ensure External Agents Write Valid Files** ✅
- (a) JSON Schema + format documentation + `validate` command ← Recommended
- (b) Also add an `init-agents`-style initialization command
- **Conclusion**: (a).

**ADR 0001 / 0002**: Approved for writing. ✅

#### Round 8

**Q26 Variable Source for the CLI** ✅
- (a) Local `.env` + `{{NAME}}`, with the same substitution and redaction logic as the Web platform ← Recommended
- (b) Midscene's `${}`
- **Conclusion**: (a).

**Q27 Where Do Web Runs Execute** ✅
- (a) Dedicated worker process polling the `runs` table, executing one at a time, streaming via WebSocket ← Recommended
- (b) Execute inside the API process
- (c) GitHub Actions
- **Conclusion**: (a).

**Q28 Who Provides the Jev Key** ✅
- (a) Web uses the platform key (logged-in users only + rate limiting); CLI uses the user's own key ← Recommended
- (b) Configure a separate key per project
- **Conclusion**: (a).

#### Round 9

**Q29 Action Set** ✅
- (a) `open`/`click`/`input`/`press`/`scroll`/`assert` + `waitFor` ← Recommended
- (b) Omit `waitFor`
- **Conclusion**: (a), with `sleep` added shortly after.

**Q30 Authentication Method** ✅
- (a) Email & password + JWT + bcrypt ← Recommended
- (b) GitHub OAuth
- **Conclusion**: (a).

#### Round 10 (Midscene / Playwright Compatibility and TypeScript)

**Q31 Should YAML Be Compatible with Midscene** ✅ (Key names deferred)
- (a) Use our own syntax
- (b) Compatible with the Instant Action subset (`web`/`tasks`/`flow` + Midscene key names, rejecting planning keys) ← Recommended
- (c) Fully compatible, including `ai:` (violates ADR 0001)
- **Note**: Midscene has both legacy `tasks`/`flow` and newer `cases`/`steps` formats; compatibility with the legacy format was initially recommended.
- **Conclusion**: Decide exact key names later, using our own naming to avoid colliding with Midscene. Capabilities must cover: `click`, `input`, `press`, `scroll`, `assert`, `waitFor`, `sleep`, `xpath`.

**Q32 / Q32′ Deterministic Locator Operations** ✅
- **Q32**: (a) Always go through Jev (b) `selector` field using Playwright locator syntax ← Recommended (c) Embed Playwright code in YAML (security vulnerability) (d) TS SDK
- **Q32′** (revised after finding Midscene supports `xpath`): (a) Same as Midscene: try `xpath` first, fall back to Jev on failure, natural-language description required (b) Strict selector that fails immediately on mismatch (c) Combine both: fall back if description is present, strict if omitted ← Recommended
- **Conclusion**: YAML only, supporting `xpath` (a).

**Q33 Extent of TypeScript Integration** 🔁 → Q34
- (a) No SDK for now, but `core` accepts an externally provided `page` ← Recommended
- (b) `Agent` class + fixture (~3 person-days)
- (c) Add reporter for a full implementation (~5 person-days)
- **Conclusion**: User initially required TS integration, then switched back to YAML-only. Kept "`core` accepts an external `page`."

**Q34 / Q34′ How TS Files Would Run** ⏸ (TS cancelled)
- **Q34**: (a) Run exported functions with our CLI ← Recommended (b) Playwright Test fixture (c) Both
- **Q34′**: (a) Playwright library API only (b) Full Playwright Test `.spec.ts` (c) Both ← Recommended
- **Conclusion**: Previously chose Q34′ (b), later cancelled along with TS integration.

**Q35 / Q35′ Running TS on the Server** ⏸ (TS cancelled)
- **Q35**: (a) Local execution only ← Recommended (b) Docker sandbox
- **Q35′** (revised effort estimate to ~3–4 person-days): (a) Local only (b) One container per run, no keys inside the container, Jev calls proxied by the worker, resource and internal network restrictions ← Recommended (c) Whitelisted accounts
- **Conclusion**: Unanswered; obsolete with TS cancellation.

#### Round 11 (Executor Harness)

**Q36 Three-Tier Confidence Handling** ✅
- (a) Locating: high → act / medium → re-check / low → fall back, with `"None of the above"` in `Choice`; Assertions: ≥ 0.8 pass, ≤ 0.2 fail, in between re-ask once and fail with annotation if still uncertain ← Recommended
- (b) Single threshold only
- **Conclusion**: (a).

**Q38 Calibration Evaluation Dataset** ✅
- (a) 10–20 fixed pages + labels + batch scoring script (~1.5 person-days) ← Recommended
- (b) Start with default thresholds and tune manually
- **Conclusion**: (b). Make thresholds configurable so adding an evaluation dataset later requires no architectural change.

**Q39 Wait for Page Stability Before Locating** ✅
- (a) Wait for network idle + DOM stability; run Playwright actionability checks before acting; verify coordinate clicks with `elementFromPoint` ← Recommended
- (b) Do not wait
- **Conclusion**: (a).

**Q37 Pre-Execution Verification** ✅
- (a) Only on medium confidence, crop the region with padding and re-verify with `Noul` ← Recommended
- (b) Re-verify on every step
- (c) User opt-in per step (Midscene `deepThink` style)
- (d) Do not re-verify; fall back immediately on medium confidence
- **Conclusion**: (a).

### IV. Corrections to Earlier Recommendations (For Reference)
- **Q15**: Initially claimed distinguishing Step and Goal had no benefit; corrected after inspecting Midscene Instant Action—Steps skip the LLM, making them faster and more deterministic.
- **Q18**: Initially claimed Midscene needed no review because users wrote every line by hand; that was inaccurate because `ai:` lines are also expanded by AI at runtime. Updated the recommendation to auto-save.
- **Q32**: Initially claimed Midscene YAML could not specify fixed selectors; in fact, it supports `xpath`.
- **Q33/Q35**: Initially overestimated the effort ("equivalent to building a second product", "at least a week for sandboxing"), and later provided a corrected breakdown estimate.

---

## Glossary (`GLOSSARY.md`) — AI Web Testing Platform

A test runner, used through a web platform or a local CLI, that executes browser tests written as step-by-step YAML files instead of code; the steps are written by a person or by an external agent.

### Language

#### What Gets Written
- **Test Case**: A YAML file of ordered Steps that verifies one behavior on a target site. *Avoid: Script, spec, scenario, flow*
- **Step**: One line of a Test Case that is exactly one Action or one Assertion; it may carry an XPath, which is tried before Visual Locate. *Avoid: Command, instruction, instant action*
- **Action**: An operation on the page drawn from a fixed set: `open`, `click`, `input`, `press`, `scroll`, `sleep` (wait a fixed time), or `waitFor` (wait until a stated condition holds). *Avoid: Operation, interaction*
- **Assertion**: A Step that states something which must be true about the page; it passes or fails. *Avoid: Check, expectation, verification*
- **Variable**: A named secret stored with a project and referenced in a Test Case as `{{NAME}}`; its value is never shown to any model or log. *Avoid: Secret, env var, credential*
- **External Agent**: Any AI tool outside the platform that writes Test Cases; the platform does no step planning itself. *Avoid: Planner, plugin, copilot*

#### What the System Does
- **Run**: One execution of a Test Case's Steps, whose per-Step progress is streamed live and whose result is stored. *Avoid: Execution, job, session, replay*
- **Harness**: The fixed decision procedure in the executor that turns Jev's typed answers and their confidence into act, re-ask, fall back, or fail, with a bounded number of attempts. *Avoid: Agent loop, controller, orchestrator*
- **Visual Locate**: Finding a Step's target element from a screenshot of the page. *Avoid: Image mode, vision grounding*
- **DOM Locate**: Finding a Step's target element by choosing among the page's interactive elements. *Avoid: Selector mode, element picking*

### Relationships
- A Test Case is an ordered list of Steps, written by a person or an External Agent
- A Test Case has many Runs
- A Step with an XPath tries it first; then every Step tries Visual Locate and falls back to DOM Locate; if all fail, the Step fails
- The Harness acts on high-confidence locates, re-checks mid-confidence ones on a padded crop before acting, and falls back on low ones
- The Harness waits for the page to settle before every Step, and treats a mid-confidence Assertion as failed after one re-ask
- A failed Step fails the Run; the platform never rewrites a Test Case
- The platform does no step planning; External Agents write Test Cases

---

## ADR 0001: Step-Only YAML Runner; Planning Left to External Agents

Midscene offers both auto planning (`ai`/`aiAct`, an LLM plans and replans steps) and Instant Actions (the user names the action, AI only locates the element). We implement only the Instant Action half: a Test Case is a YAML file of explicit Steps, and planning is left to External Agents (Claude Code and similar) that write those files, the same split Playwright uses between its deterministic runner and its planner/generator/healer agents. This keeps the executor free of any LLM, so Runs are reproducible and unit-testable, and it removes the riskiest scope (planning loop, replan limits, goal-completion judging) from a four-week course project.

### Consequences
- There is no self-healing: if both Visual Locate and DOM Locate fail, the Step fails the Run, and the platform never rewrites a Test Case. Repair, like Playwright's healer, is an External Agent's job.
- External Agents need a precise contract: the JSON Schema, `docs/test-file-format.md`, and `validate` command are part of the product, not extras.
- The Test Case format covers the capabilities of Midscene's Instant Action YAML (`click`, `input`, key `press`, `scroll`, `assert`, `wait-for`, `sleep`, optional XPath tried before AI locating, `{{NAME}}` variables) but is not file-compatible with it: key names are our own, chosen later, so a Midscene file is not mistaken for ours. Planning keys have no equivalent and are rejected by `validate`.
- There is no TypeScript or Playwright Test integration in this scope; the core executor takes an injected Playwright page so one can be added without restructuring.

---

## ADR 0002: Visual Locate First, DOM Locate as Fallback

Every Step first locates its target from a screenshot using Jev 1.14's `Box` question, paired with a `Noul` asking whether the target is present (`Box` never answers "not found"); only when the `Noul` or `Box` confidence falls below a configured threshold do we fall back to choosing among the page's interactive DOM elements with Jev `Choice`. We chose this order deliberately even though TypeSafe marks image input and `Box` as experimental and warns they perform worse than text, because visual grounding is the Midscene-style capability the project is meant to demonstrate and it handles canvas and icon-only controls that DOM Locate cannot describe.

### Consequences
- Image requests need the `TypeSafe-Danger-Zone-Images: true` header and a pinned model (`jev-1.14.0`), and only PNG/JPEG screenshots are accepted.
- Every Step costs a screenshot request even when DOM Locate would have succeeded; if Visual Locate proves unreliable in practice, reversing the order is a config change, not a redesign.
