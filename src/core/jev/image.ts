export type ImageInfo = {
  width: number;
  height: number;
  mimeType: "image/png" | "image/jpeg";
};

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function readImageDimensions(buf: Buffer): ImageInfo {
  if (
    buf.length >= 24 &&
    PNG_SIG.every((byte, idx) => buf[idx] === byte) &&
    buf.toString("ascii", 12, 16) === "IHDR"
  ) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width > 0 && height > 0) {
      return { width, height, mimeType: "image/png" };
    }
  }

  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= buf.length) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > buf.length) break;
      const segLength = buf.readUInt16BE(offset);
      if (segLength < 2) break;
      // SOF0..SOF3, SOF5..SOF7, SOF9..SOF11, SOF13..SOF15
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        if (offset + 7 <= buf.length) {
          const height = buf.readUInt16BE(offset + 3);
          const width = buf.readUInt16BE(offset + 5);
          if (width > 0 && height > 0) {
            return { width, height, mimeType: "image/jpeg" };
          }
        }
        break;
      }
      offset += segLength;
    }
  }

  throw new Error("Unsupported or invalid image buffer");
}
