import { crc32, deflateSync } from 'node:zlib';

export const pngChunk = (type: string, data: Uint8Array): Buffer => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
/** Synthetic PNG writer (8-bit RGB/RGBA): row y uses filters[y % filters.length]; extra chunks are inserted before IDAT. */
export function syntheticPng(width: number, height: number, channels: 3 | 4, pixel: (x: number, y: number) => number[], filters = [0], extra: Buffer[] = []): Buffer {
  const stride = width * channels, rows: number[][] = [];
  for (let y = 0; y < height; y++) { const row: number[] = []; for (let x = 0; x < width; x++) row.push(...pixel(x, y).slice(0, channels)); rows.push(row); }
  const raw: number[] = [];
  rows.forEach((row, y) => {
    const filter = filters[y % filters.length]!; raw.push(filter);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels]! : 0, b = y ? rows[y - 1]![i]! : 0, c = y && i >= channels ? rows[y - 1]![i - channels]! : 0;
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter]!;
      raw.push((row[i]! - predictor) & 0xff);
    }
  });
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), ...extra,
    pngChunk('IDAT', deflateSync(Buffer.from(raw))), pngChunk('IEND', Buffer.alloc(0))]);
}
