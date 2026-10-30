import { type ImageInfo, JevError } from "./types.js";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Reads the pixel dimensions and format of a PNG or JPEG image buffer. */
export function getImageDimensions(image: Buffer): ImageInfo {
  if (
    image.length >= 24 &&
    PNG_SIGNATURE.every((byte, idx) => image[idx] === byte) &&
    image.toString("ascii", 12, 16) === "IHDR"
  ) {
    const width = image.readUInt32BE(16);
    const height = image.readUInt32BE(20);
    if (width > 0 && height > 0) {
      return { width, height, format: "png" };
    }
  }

  if (image.length >= 4 && image[0] === 0xff && image[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < image.length) {
      if (image[offset] !== 0xff) {
        break;
      }
      const marker = image[offset + 1]!;
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof && offset + 8 < image.length) {
        const height = image.readUInt16BE(offset + 5);
        const width = image.readUInt16BE(offset + 7);
        if (width > 0 && height > 0) {
          return { width, height, format: "jpeg" };
        }
      }
      const segmentLength = image.readUInt16BE(offset + 2);
      if (segmentLength < 2) {
        break;
      }
      offset += 2 + segmentLength;
    }
  }

  throw new JevError("Unsupported or malformed image buffer: expected PNG or JPEG");
}
