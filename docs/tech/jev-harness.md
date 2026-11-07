# Jev Harness

The Jev Harness is the Core adapter that turns a small number of Locator and Asserter requests into Jev API calls through OpenRouter, validates the structured response, and returns only the values the rest of the runner can trust.

## 1. Functional Definition

The Harness owns the OpenRouter call to `POST https://openrouter.ai/api/alpha/decisions` and translates Jev’s structured output into the small, typed results used by the Locator and Asserter. It never imports Playwright and never manages page state; it only turns a question and page context into a request and parses the response.

### 1.1 Jev endpoint and auth

| Item        | Value                                            |
| ----------- | ------------------------------------------------ |
| Endpoint    | `POST https://openrouter.ai/api/alpha/decisions` |
| Auth header | `Authorization: Bearer $OPENROUTER_API_KEY`      |
| Model       | `typesafe/jev-1.14`                              |

The key comes from the environment, and the app fails early if it is missing. The Harness does not add a separate client SDK; it uses Node 22 built-in `fetch`.

### 1.2 Request body

The request body is:

```json
{
  "model": "typesafe/jev-1.14",
  "state": [
    "string content",
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ],
  "questions": {
    "<name>": {
      "type": "box",
      "instructions": "..."
    }
  }
}
```

`state` is a list of strings or image entries. Each image entry uses the exact format above and is a PNG data URI.

### 1.3 Supported question types

| Type     | Request shape                                                     | Response shape                                      | Notes                                                                                                                 |
| -------- | ----------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `box`    | `{ type: "box", instructions }`                                   | `{ box: { top, bottom, left, right }, confidence }` | `box` values are fractions of the image from the top-left. `Box` always returns a box even when the target is absent. |
| `choice` | `{ type: "choice", instructions, criteria: { id: description } }` | `{ choice, probabilities, confidence }`             | `choice` is the selected key; `probabilities` are raw probabilities.                                                  |
| `noul`   | `{ type: "noul", instructions }`                                  | `{ noul }`                                          | `noul` is the probability of yes. There is no confidence field on this answer type.                                   |

The Harness treats Jev’s model output as untrusted and validates the fields it uses before returning them.

Real Jev responses are wrapped by question name under an `answers` object. The harness reads `answers[target]` (or whichever question key it asked) and validates the nested payload before returning data. The `usage` block is metadata and is ignored for core result parsing.

```json
{
  "id": "gen-dec-123",
  "model": "typesafe/jev-1.14",
  "provider": "TypeSafe",
  "answers": {
    "target": { "type": "noul", "noul": 0.82 }
  },
  "usage": {
    "input_tokens": 476,
    "output_tokens": 70,
    "cost": 0.00002
  }
}
```

### 1.4 Public methods

The Harness exposes the functions required by the Locator and Asserter:

1. `bbox(question, image, viewport, signal?)`
   - Asks for a `box` question and a presence `noul` in the same request.
   - Converts `top/bottom/left/right` fractions to CSS pixels using the viewport size, not the PNG dimensions:
     - `x = left * width`
     - `y = top * height`
     - `width = (right - left) * width`
     - `height = (bottom - top) * height`
   - Returns `{ box: null, confidence }` when the presence `noul` probability is below `0.5`.
   - Keeps raw probabilities; thresholding is done by Locator or Asserter.
   - The method accepts an optional `AbortSignal` so the Executor can cancel it when a step times out.

2. `choice(question, options, signal?)`
   - Maps the array to criteria keys `"0"` through `"n-1"`.
   - Uses a presence `noul` in the same request rather than a fake `"none"` option.
   - Converts the returned choice key back to the original index.
   - Returns `{ index: null, confidence }` when the presence `noul` probability is below `0.5`.
   - Accepts an optional `AbortSignal` for cancellation.

3. `noul(question, context, signal?)`
   - Asks a `noul` question with either an image or an inline text state.
   - Returns `ReadResult<{ probability: number }>`.
   - There is no separate confidence field in the Jev `noul` answer.
   - Accepts an optional `AbortSignal` for cancellation.

### 1.5 Retry and timeout rules

| Rule                 | Value                                          |
| -------------------- | ---------------------------------------------- |
| Request timeout      | `5s` per request                               |
| Max retries          | `2` retries after the first attempt            |
| Backoff              | `500ms`, then `1000ms`                         |
| Retry-after cap      | `2s` maximum per retry delay                   |
| Retry only on        | `429`, `5xx`, network errors, unparseable body |
| Do not retry on      | other `4xx` such as `401`                      |
| Retry-after handling | Honor `Retry-After` if present, capped at `2s` |

The Harness should never swallow infrastructure errors; it should return `{ ok: false, reason }` when the request cannot be completed, and the caller decides whether that is a failure or a fallback.

### 1.6 Screenshot requirement

The screenshot must cover exactly the current viewport, not the full page, and it must be taken at the same scroll position as the snapshot. The box conversion uses the viewport size, not the PNG size, so the screenshot and snapshot must describe the same page state and same viewport coordinates.

## 2. Internal Flow

```mermaid
flowchart LR
  A[Caller] --> B[Build request]
  B --> C[POST /decisions]
  C --> D{Response ok?}
  D -->|No| E[Retry policy]
  E -->|Retry| C
  E -->|Stop| F[Return { ok: false, reason }]
  D -->|Yes| G[Parse structured output]
  G --> H[Normalize box / index / probability]
  H --> I[Return { ok: true, data }]
```

1. Build the `state` and `questions` payload from the caller’s question and page context.
2. Send one authenticated `POST` request to the Jev decisions endpoint.
3. If the response is a transient failure, apply the retry policy.
4. Parse the structured `box`, `choice`, or `noul` answer.
5. Convert fractions to pixels when the question is a box.
6. Return a typed structured result to the caller.

## 3. External Interface

The public Harness contract is intentionally small and keeps the Locator interface stable.

```ts
type BoundingBox = { x: number; y: number; width: number; height: number };

type ReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

interface JevClient {
  bbox(
    question: string,
    image: Buffer,
    viewport: { width: number; height: number },
    signal?: AbortSignal,
  ): Promise<ReadResult<{ box: BoundingBox | null; confidence: number }>>;

  choice(
    question: string,
    options: string[],
    signal?: AbortSignal,
  ): Promise<ReadResult<{ index: number | null; confidence: number }>>;

  noul(
    question: string,
    context: { image: Buffer } | { text: string },
    signal?: AbortSignal,
  ): Promise<ReadResult<{ probability: number }>>;
}
```

The Locator contract in [docs/tech/locator.md](docs/tech/locator.md) stays compatible:

```ts
bbox(
  question: string,
  image: Buffer,
  viewport: { width: number; height: number },
  signal?: AbortSignal,
): Promise<ReadResult<{ box: BoundingBox | null; confidence: number }>>;

choice(
  question: string,
  options: string[],
  signal?: AbortSignal,
): Promise<ReadResult<{ index: number | null; confidence: number }>>;
```

Transport and API failures are returned as `{ ok: false, reason }`; only successful model answers are wrapped in `{ ok: true, data }`.

## 4. Class Architecture

### 4.1 Modules

| Module / Class   | Responsibility                                                                  |
| ---------------- | ------------------------------------------------------------------------------- |
| `jev-harness.ts` | Request assembly, retries, HTTP call, response validation, result normalization |
| `types.ts`       | Shared request/response types for `box`, `choice`, and `noul`                   |
| `fetch.ts`       | Node 22 built-in `fetch` wrapper and retry logic                                |

### 4.2 Directory Layout

```text
src/core/jev/
├── index.ts
├── types.ts
├── jev-harness.ts
├── fetch.ts
└── ...
```

## 5. Test Plan

| Type | Coverage                                                                                                                                                       | Location                                 |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Unit | Mocked `fetch` for all request shapes and retry behavior; invalid response handling; box fraction conversion; choice index mapping; presence check with `noul` | `src/tests/unit/core/jev/*.test.ts`      |
| Live | Real OpenRouter requests behind `describe.skipIf(!process.env.OPENROUTER_API_KEY)`                                                                             | `src/tests/live/core/jev/*.live.test.ts` |

Live tests run via `pnpm test:live`.
