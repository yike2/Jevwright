import { describe, it, expect, vi } from "vitest";
import { JevHarness, readImageDimensions } from "../../../../core/jev/index.js";

function makeFakePng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR length (13) + "IHDR"
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function makeFakeJpeg(width: number, height: number): Buffer {
  // Minimal JPEG with SOI (FF D8), APP0 (FF E0, len 4), SOF0 (FF C0, len 11, precision 8, height, width)
  const buf = Buffer.alloc(20);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  buf.writeUInt16BE(4, 4);
  buf[8] = 0xff;
  buf[9] = 0xc0;
  buf.writeUInt16BE(11, 10);
  buf[12] = 8;
  buf.writeUInt16BE(height, 13);
  buf.writeUInt16BE(width, 15);
  return buf;
}

describe("readImageDimensions", () => {
  it("extracts width, height, and mimeType from PNG and JPEG buffers and rejects invalid buffers", () => {
    expect(readImageDimensions(makeFakePng(1280, 720))).toEqual({
      width: 1280,
      height: 720,
      mimeType: "image/png",
    });

    expect(readImageDimensions(makeFakeJpeg(800, 600))).toEqual({
      width: 800,
      height: 600,
      mimeType: "image/jpeg",
    });

    expect(() => readImageDimensions(Buffer.from("not-an-image"))).toThrow(
      "Unsupported or invalid image buffer",
    );
  });
});

describe("JevHarness.choice", () => {
  it("calls POST https://openrouter.ai/api/alpha/decisions with typesafe/jev-1.14 and parses option index or null for none", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: "typesafe/jev-1.14",
          answers: {
            target: {
              type: "choice",
              choice: "1",
              confidence: 0.89,
              probabilities: { "0": 0.05, "1": 0.92, none: 0.03 },
            },
          },
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const harness = new JevHarness({ apiKey: "test-key", fetchFn: fetchMock });
    const res = await harness.choice('Which element best matches: "Sign in"?', [
      'textbox "Email" type=email',
      'button "Sign in"',
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");

    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("typesafe/jev-1.14");
    expect(body.questions.target.type).toBe("choice");
    expect(body.questions.target.instructions).toBe('Which element best matches: "Sign in"?');
    expect(body.questions.target.criteria["0"]).toBe('textbox "Email" type=email');
    expect(body.questions.target.criteria["1"]).toBe('button "Sign in"');
    expect(body.questions.target.criteria.none).toBeDefined();

    expect(res).toEqual({ index: 1, confidence: 0.89 });

    // Also test when Jev selects "none"
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: "typesafe/jev-1.14",
          answers: {
            target: {
              type: "choice",
              choice: "none",
              confidence: 0.81,
            },
          },
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const noneRes = await harness.choice('Which element best matches: "Delete account"?', [
      'button "Sign in"',
    ]);
    expect(noneRes).toEqual({ index: null, confidence: 0.81 });
  });
});

describe("JevHarness.bbox", () => {
  it("calls Decisions API with image_url state and box + noul questions, converting normalized box to image pixels", async () => {
    const png = makeFakePng(1000, 800);
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: "typesafe/jev-1.14",
          answers: {
            present: {
              type: "noul",
              noul: 0.96,
            },
            target: {
              type: "box",
              box: { top: 0.25, bottom: 0.35, left: 0.1, right: 0.3 },
              confidence: 0.92,
            },
          },
          usage: { input_tokens: 500, output_tokens: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const harness = new JevHarness({ apiKey: "test-key", fetchFn: fetchMock });
    const res = await harness.bbox(
      'Find the element described as: "Sign in button". Return its bounding box.',
      png,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("typesafe/jev-1.14");
    expect(Array.isArray(body.state)).toBe(true);
    expect(body.state[1]).toEqual({
      type: "image_url",
      image_url: { url: `data:image/png;base64,${png.toString("base64")}` },
    });
    expect(body.questions.target.type).toBe("box");
    expect(body.questions.present.type).toBe("noul");

    expect(res.confidence).toBeCloseTo(0.92);
    expect(res.box).toEqual({
      x: 100,
      y: 200,
      width: 200,
      height: 80,
    });

    // When target is not present (noul < 0.5), returns box: null
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          model: "typesafe/jev-1.14",
          answers: {
            present: {
              type: "noul",
              noul: 0.12,
            },
            target: {
              type: "box",
              box: { top: 0.1, bottom: 0.2, left: 0.1, right: 0.2 },
              confidence: 0.85,
            },
          },
          usage: { input_tokens: 500, output_tokens: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const absentRes = await harness.bbox(
      'Find the element described as: "Nonexistent button". Return its bounding box.',
      png,
    );
    expect(absentRes).toEqual({ box: null, confidence: 0.12 });
  });

  it("retries failed HTTP or malformed responses up to maxRetries before succeeding or throwing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 503, message: "Service unavailable" } }), {
          status: 503,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: "typesafe/jev-1.14",
            answers: {
              target: { type: "choice", choice: "0", confidence: 0.95 },
            },
            usage: { input_tokens: 50, output_tokens: 5 },
          }),
          { status: 200 },
        ),
      );

    const harness = new JevHarness({
      apiKey: "test-key",
      fetchFn: fetchMock,
      maxRetries: 2,
      retryDelayMs: 0,
    });

    const recovered = await harness.choice("Pick one", ['button "Save"']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recovered).toEqual({ index: 0, confidence: 0.95 });

    // Exhaust all retries
    const failingFetch = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ error: { code: 502, message: "Bad gateway" } }), {
        status: 502,
      }),
    );

    const failingHarness = new JevHarness({
      apiKey: "test-key",
      fetchFn: failingFetch,
      maxRetries: 1,
      retryDelayMs: 0,
    });

    await expect(failingHarness.choice("Pick one", ['button "Save"'])).rejects.toThrow(
      /OpenRouter Decisions API error \(502\): Bad gateway/,
    );
    expect(failingFetch).toHaveBeenCalledTimes(2);
  });
});
