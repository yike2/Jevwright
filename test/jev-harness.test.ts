import { describe, expect, it } from "vitest";
import { createJevHarness, JevError } from "../src/jev/harness.ts";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

interface Call {
  url: string;
  init: RequestInit;
  body: any;
}

// A fetch stand-in that records each request and replies with the given body.
function fakeFetch(reply: unknown, status = 200) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(reply), { status, headers: { "Content-Type": "application/json" } });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const boxReply = {
  model: "typesafe/jev-1.14",
  answers: {
    box: { type: "box", box: { top: 0.52, bottom: 0.59, left: 0.21, right: 0.28 }, confidence: 0.93 },
    visible: { type: "noul", noul: 0.98 },
  },
  usage: { input_tokens: 3075, output_tokens: 0, cost: 0.00012915 },
};

describe("Jev Harness", () => {
  it("locateBox sends a box question with the screenshot to the Decisions endpoint", async () => {
    const { fetch, calls } = fakeFetch(boxReply);
    const jev = createJevHarness({ apiKey: "test-key", fetch });

    await jev.locateBox({ image: png, target: "the Sign in button" });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(call.init.method).toBe("POST");
    expect(new Headers(call.init.headers).get("Authorization")).toBe("Bearer test-key");
    expect(call.body.model).toBe("typesafe/jev-1.14");
    expect(call.body.state.screenshot).toEqual({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${Buffer.from(png).toString("base64")}` },
    });
    expect(call.body.questions.box).toEqual({ type: "box", instructions: "the Sign in button in the screenshot" });
  });

  it("locateBox returns the box edges and confidence from the answer", async () => {
    const { fetch } = fakeFetch(boxReply);
    const jev = createJevHarness({ apiKey: "test-key", fetch });

    const answer = await jev.locateBox({ image: png, target: "the Sign in button" });

    expect(answer.box).toEqual({ top: 0.52, bottom: 0.59, left: 0.21, right: 0.28 });
    expect(answer.confidence).toBe(0.93);
  });

  it("locateBox asks in the same request whether the target is visible, since Box always answers", async () => {
    const { fetch, calls } = fakeFetch(boxReply);
    const jev = createJevHarness({ apiKey: "test-key", fetch });

    const answer = await jev.locateBox({ image: png, target: "the Sign in button" });

    expect(calls[0].body.questions.visible).toEqual({
      type: "noul",
      instructions: "The screenshot shows the Sign in button.",
    });
    expect(answer.visible).toBe(0.98);
  });

  it("chooseElement asks a choice question with one option per candidate and returns the pick", async () => {
    const { fetch, calls } = fakeFetch({
      model: "typesafe/jev-1.14",
      answers: {
        element: { type: "choice", choice: "e9", probabilities: { e8: 0.01, e9: 0.98, none: 0.01 }, confidence: 0.97 },
      },
      usage: { input_tokens: 120, output_tokens: 0, cost: 0.000005 },
    });
    const jev = createJevHarness({ apiKey: "test-key", fetch });

    const answer = await jev.chooseElement({
      target: "the GitHub sign-in button",
      candidates: [
        { id: "e8", description: 'button "Google"' },
        { id: "e9", description: 'button "GitHub"' },
      ],
    });

    expect(calls[0].body.model).toBe("typesafe/jev-1.14");
    expect(calls[0].body.state).toEqual({ target: "the GitHub sign-in button" });
    expect(calls[0].body.questions.element).toEqual({
      type: "choice",
      instructions: "Which page element is the one described by `target`?",
      criteria: {
        e8: 'button "Google"',
        e9: 'button "GitHub"',
        none: "None of these elements matches `target`.",
      },
    });
    expect(answer).toEqual({ id: "e9", confidence: 0.97 });
  });

  it("chooseElement reports no element when Jev picks none", async () => {
    const { fetch } = fakeFetch({
      model: "typesafe/jev-1.14",
      answers: { element: { type: "choice", choice: "none", probabilities: { e8: 0.1, none: 0.9 }, confidence: 0.8 } },
      usage: { input_tokens: 100, output_tokens: 0 },
    });
    const jev = createJevHarness({ apiKey: "test-key", fetch });

    const answer = await jev.chooseElement({
      target: "the Logout button",
      candidates: [{ id: "e8", description: 'button "Google"' }],
    });

    expect(answer).toEqual({ id: null, confidence: 0.8 });
  });

  it("throws a JevError with the status and OpenRouter's message when the request fails", async () => {
    const { fetch } = fakeFetch({ error: { code: 413, message: "Image exceeds 1568 pixels" } }, 413);
    const jev = createJevHarness({ apiKey: "secret-key", fetch });

    const error = await jev.locateBox({ image: png, target: "the Sign in button" }).catch((e) => e);

    expect(error).toBeInstanceOf(JevError);
    expect(error.status).toBe(413);
    expect(error.message).toBe("Jev request failed (413): Image exceeds 1568 pixels");
    expect(error.message).not.toContain("secret-key");
  });

  it("reports the usage of every response to onUsage", async () => {
    const { fetch } = fakeFetch(boxReply);
    const usages: unknown[] = [];
    const jev = createJevHarness({ apiKey: "test-key", fetch, onUsage: (u) => usages.push(u) });

    await jev.locateBox({ image: png, target: "the Sign in button" });

    expect(usages).toEqual([{ inputTokens: 3075, cost: 0.00012915 }]);
  });
});
