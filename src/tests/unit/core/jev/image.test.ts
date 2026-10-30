import { describe, expect, it } from "vitest";
import { getImageDimensions } from "../../../../core/jev/image.js";
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

function makeJpegBuffer(width: number, height: number): Buffer {
  // SOI (FF D8), APP0 segment (FF E0, len 4, 2 bytes), SOF0 (FF C0, len 11, precision 8, height, width)
  const buf = Buffer.alloc(17);
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

describe("getImageDimensions", () => {
  it("reads width and height from a valid PNG buffer", () => {
    const png = makePngBuffer(1024, 768);
    expect(getImageDimensions(png)).toEqual({
      width: 1024,
      height: 768,
      format: "png",
    });
  });

  it("reads width and height from a valid JPEG buffer and rejects invalid buffers", () => {
    const jpeg = makeJpegBuffer(800, 600);
    expect(getImageDimensions(jpeg)).toEqual({
      width: 800,
      height: 600,
      format: "jpeg",
    });
    expect(() => getImageDimensions(Buffer.from("not-an-image"))).toThrow(JevError);
  });
});
