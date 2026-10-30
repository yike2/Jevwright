import { describe, expect, it, vi } from "vitest";
import { createJevClient } from "../../../../core/jev/client.js";
import { JevError } from "../../../../core/jev/types.js";

function makePngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe("createJevClient", () => {
  it("choice sends a Decisions request to typesafe/jev-1.14 and returns the chosen index and confidence", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "typesafe/jev-1.14",
          answers: {
            choice: {
              type: "choice",
              choice: "1",
              confidence: 0.91,
              probabilities: { "0": 0.04, "1": 0.93, none: 0.03 },
            },
          },
          usage: { input_tokens: 120, output_tokens: 10 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = createJevClient({
      apiKey: "test-key",
      fetchFn: fetchMock,
    });

    const result = await client.choice('Which element best matches the description: "Sign in"?', [
      'textbox "Email" type=email',
      'button "Sign in"',
    ]);

    expect(result).toEqual({ index: 1, confidence: 0.91 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      questions: Record<string, { type: string; criteria: Record<string, string> }>;
    };
    expect(body.model).toBe("typesafe/jev-1.14");
    expect(body.questions.choice?.type).toBe("choice");
    expect(body.questions.choice?.criteria["0"]).toBe('textbox "Email" type=email');
    expect(body.questions.choice?.criteria["1"]).toBe('button "Sign in"');
    expect(body.questions.choice?.criteria.none).toBeDefined();
  });

  it("choice returns null index when Jev selects none or options is empty", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "typesafe/jev-1.14",
          answers: {
            choice: {
              type: "choice",
              choice: "none",
              confidence: 0.88,
              probabilities: { "0": 0.05, none: 0.95 },
            },
          },
          usage: { input_tokens: 100, output_tokens: 8 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = createJevClient({ apiKey: "test-key", fetchFn: fetchMock });

    const emptyRes = await client.choice("Question", []);
    expect(emptyRes).toEqual({ index: null, confidence: 0 });
    expect(fetchMock).not.toHaveBeenCalled();

    const noneRes = await client.choice("Question", ['button "Cancel"']);
    expect(noneRes).toEqual({ index: null, confidence: 0.88 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bbox sends screenshot and paired noul/box questions and converts normalized coordinates to pixels", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "typesafe/jev-1.14",
          answers: {
            present: {
              type: "noul",
              noul: 0.96,
            },
            box: {
              type: "box",
              box: { left: 0.25, top: 0.5, right: 0.75, bottom: 0.75 },
              confidence: 0.89,
            },
          },
          usage: { input_tokens: 800, output_tokens: 20 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = createJevClient({ apiKey: "test-key", fetchFn: fetchMock });
    const png = makePngBuffer(1000, 800);

    const res = await client.bbox('Find the element described as: "Sign in button". Return its bounding box.', png);

    expect(res).toEqual({
      box: { x: 250, y: 400, width: 500, height: 200 },
      confidence: 0.89,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      state: unknown[];
      questions: Record<string, { type: string }>;
    };
    expect(body.model).toBe("typesafe/jev-1.14");
    expect(Array.isArray(body.state)).toBe(true);
    expect(body.questions.present?.type).toBe("noul");
    expect(body.questions.box?.type).toBe("box");
  });

  it("bbox returns null box when present noul probability is below 0.5", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "typesafe/jev-1.14",
          answers: {
            present: {
              type: "noul",
              noul: 0.12,
            },
            box: {
              type: "box",
              box: { left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 },
              confidence: 0.85,
            },
          },
          usage: { input_tokens: 800, output_tokens: 20 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = createJevClient({ apiKey: "test-key", fetchFn: fetchMock });
    const png = makePngBuffer(1000, 800);

    const res = await client.bbox('Find the element described as: "Checkout button". Return its bounding box.', png);
    expect(res).toEqual({
      box: null,
      confidence: 0.12,
    });
  });

  it("retries transient failures up to maxRetries and throws JevError on persistent or 4xx failure", async () => {
    const fetchRetryOk = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network reset"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Overloaded" } }), { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "typesafe/jev-1.14",
            answers: { choice: { type: "choice", choice: "0", confidence: 0.85 } },
            usage: { input_tokens: 50, output_tokens: 5 },
          }),
          { status: 200 },
        ),
      );

    const clientOk = createJevClient({ apiKey: "test-key", maxRetries: 2, fetchFn: fetchRetryOk });
    const res = await clientOk.choice("Pick one", ['button "OK"']);
    expect(res).toEqual({ index: 0, confidence: 0.85 });
    expect(fetchRetryOk).toHaveBeenCalledTimes(3);

    // Non-retryable 400 fails immediately without retrying
    const fetch400 = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ error: { message: "Bad request" } }), { status: 400 }));
    const client400 = createJevClient({ apiKey: "test-key", maxRetries: 2, fetchFn: fetch400 });
    await expect(client400.choice("Pick one", ['button "OK"'])).rejects.toThrow(JevError);
    expect(fetch400).toHaveBeenCalledTimes(1);

    // Exhausted retries on 502 throws JevError
    const fetch502 = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response("Bad Gateway", { status: 502 }));
    const client502 = createJevClient({ apiKey: "test-key", maxRetries: 1, fetchFn: fetch502 });
    await expect(client502.choice("Pick one", ['button "OK"'])).rejects.toThrow(JevError);
    expect(fetch502).toHaveBeenCalledTimes(2);

    // Missing API key throws JevError
    const clientNoKey = createJevClient({ apiKey: "", fetchFn: fetchRetryOk });
    await expect(clientNoKey.choice("Pick one", ['button "OK"'])).rejects.toThrow(JevError);
  });
});
