import { crc32, inflateSync } from 'node:zlib';

/** Pure PNG→JPEG cover codec: no image libraries, deterministic JPEG bytes. */
export type CoverImageErrorCode = 'COVER_AI_INVALID_IMAGE' | 'COVER_AI_TOO_LARGE';
export class CoverImageError extends Error {
  constructor(readonly code: CoverImageErrorCode, message: string) { super(message); this.name = 'CoverImageError'; }
}
export interface RgbRaster { width: number; height: number; data: Uint8Array }

export const MAX_COVER_PNG_BYTES = 8 * 1024 * 1024;
export const MAX_COVER_PNG_SIDE = 4096;
export const MAX_COVER_JPEG_BYTES = 600_000;
export const COVER_WIDTH = 1024;
export const COVER_HEIGHT = 576;
const invalid = (message: string): never => { throw new CoverImageError('COVER_AI_INVALID_IMAGE', message); };
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function decodePng(bytes: Uint8Array): RgbRaster {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_COVER_PNG_BYTES) invalid('PNG is missing or too large.');
  if (bytes.byteLength < 8 || SIGNATURE.some((value, index) => bytes[index] !== value)) invalid('PNG signature is invalid.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, width = 0, height = 0, channels = 0, ended = false;
  const idat: Uint8Array[] = [];
  while (!ended) {
    if (offset + 12 > bytes.byteLength) invalid('PNG chunk is truncated.');
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (length > 0x7fffffff || end > bytes.byteLength) invalid('PNG chunk exceeds the file.');
    if (view.getUint32(offset + 8 + length) !== crc32(bytes.subarray(offset + 4, offset + 8 + length))) invalid(`PNG chunk ${JSON.stringify(type)} fails its CRC check.`);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (offset === 8 && type !== 'IHDR') invalid('PNG must start with IHDR.');
    if (type === 'IHDR') {
      if (offset !== 8 || length !== 13) invalid('PNG IHDR is invalid.');
      width = view.getUint32(offset + 8); height = view.getUint32(offset + 12);
      const [depth, colour, compression, filter, interlace] = data.subarray(8);
      if (!width || !height || width > MAX_COVER_PNG_SIDE || height > MAX_COVER_PNG_SIDE) invalid('PNG dimensions are out of range.');
      if (depth !== 8 || (colour !== 2 && colour !== 6) || compression !== 0 || filter !== 0 || interlace !== 0) invalid('PNG format is unsupported.');
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') ended = true;
    else if (!(type.charCodeAt(0) & 0x20)) invalid(`PNG critical chunk ${JSON.stringify(type)} is unsupported.`);
    offset = end;
  }
  if (!channels || !idat.length) invalid('PNG lacks image data.');
  const stride = width * channels, expected = height * (1 + stride);
  let raw: Buffer;
  try { raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expected + 1 }); } catch { return invalid('PNG image data is corrupt.'); }
  if (raw.byteLength !== expected) invalid('PNG image data has the wrong size.');
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (1 + stride)]!, src = y * (1 + stride) + 1, row = y * stride, prior = row - stride;
    if (filterType > 4) invalid('PNG filter type is invalid.');
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? pixels[row + i - channels]! : 0, b = y ? pixels[prior + i]! : 0, c = y && i >= channels ? pixels[prior + i - channels]! : 0;
      let predictor = 0;
      if (filterType === 1) predictor = a;
      else if (filterType === 2) predictor = b;
      else if (filterType === 3) predictor = (a + b) >> 1;
      else if (filterType === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[row + i] = (raw[src + i]! + predictor) & 0xff;
    }
  }
  if (channels === 3) return { width, height, data: pixels };
  const rgb = new Uint8Array(width * height * 3);
  for (let p = 0, q = 0; p < pixels.length; p += 4, q += 3) {
    const alpha = pixels[p + 3]!;
    for (let k = 0; k < 3; k++) rgb[q + k] = Math.round((pixels[p + k]! * alpha + 255 * (255 - alpha)) / 255);
  }
  return { width, height, data: rgb };
}

// Area-average a line of n samples down to m (m <= n) samples.
function boxWeights(n: number, m: number): { start: number; weights: number[] }[] {
  const scale = n / m;
  return Array.from({ length: m }, (_, i) => {
    const x0 = i * scale, x1 = (i + 1) * scale, start = Math.floor(x0), weights: number[] = [];
    for (let s = start; s < Math.min(n, Math.ceil(x1)); s++) weights.push((Math.min(x1, s + 1) - Math.max(x0, s)) / scale);
    return { start, weights };
  });
}

export function fitCover(raster: RgbRaster, width = COVER_WIDTH, height = COVER_HEIGHT): RgbRaster {
  let cropW = raster.width, cropH = Math.round(raster.width * height / width);
  if (cropH > raster.height) { cropH = raster.height; cropW = Math.round(raster.height * width / height); }
  if (cropW < 320) throw new CoverImageError('COVER_AI_INVALID_IMAGE', 'Cover image is too small.');
  const outW = Math.min(width, cropW), outH = outW === width ? height : Math.round(outW * height / width);
  const left = Math.floor((raster.width - cropW) / 2), top = Math.floor((raster.height - cropH) / 2);
  const xs = boxWeights(cropW, outW), ys = boxWeights(cropH, outH);
  const horizontal = new Float64Array(cropH * outW * 3);
  for (let y = 0; y < cropH; y++) {
    const srcRow = ((top + y) * raster.width + left) * 3;
    xs.forEach(({ start, weights }, x) => {
      let r = 0, g = 0, b = 0;
      weights.forEach((w, k) => { const s = srcRow + (start + k) * 3; r += raster.data[s]! * w; g += raster.data[s + 1]! * w; b += raster.data[s + 2]! * w; });
      const d = (y * outW + x) * 3; horizontal[d] = r; horizontal[d + 1] = g; horizontal[d + 2] = b;
    });
  }
  const data = new Uint8Array(outW * outH * 3);
  ys.forEach(({ start, weights }, y) => {
    for (let i = 0; i < outW * 3; i++) {
      let sum = 0;
      weights.forEach((w, k) => { sum += horizontal[(start + k) * outW * 3 + i]! * w; });
      data[y * outW * 3 + i] = Math.min(255, Math.max(0, Math.round(sum)));
    }
  });
  return { width: outW, height: outH, data };
}

const ZIGZAG = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const LUMA_QT = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const CHROMA_QT = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
  ...Array<number>(32).fill(99)];
const AC_LUMA_VALUES = [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a,
  0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65,
  0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96,
  0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2,
  0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];
const AC_CHROMA_VALUES = [0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
  0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64,
  0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94,
  0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2,
  0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];
const DC_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
type HuffSpec = { cls: number; bits: number[]; values: number[] };
const HUFFMAN: HuffSpec[] = [
  { cls: 0x00, bits: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], values: DC_VALUES },
  { cls: 0x10, bits: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d], values: AC_LUMA_VALUES },
  { cls: 0x01, bits: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], values: DC_VALUES },
  { cls: 0x11, bits: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77], values: AC_CHROMA_VALUES },
];
type Code = { code: number; length: number };
function huffmanCodes({ bits, values }: HuffSpec): Code[] {
  const codes: Code[] = [];
  let code = 0, k = 0;
  bits.forEach((count, index) => { for (let i = 0; i < count; i++) codes[values[k++]!] = { code: code++, length: index + 1 }; code <<= 1; });
  return codes;
}
const [DC_LUMA, AC_LUMA, DC_CHROMA, AC_CHROMA] = HUFFMAN.map(huffmanCodes) as [Code[], Code[], Code[], Code[]];
const AAN = [1, 1.387039845, 1.306562965, 1.175875602, 1, 0.785694958, 0.5411961, 0.275899379];

export function quantTables(quality: number): { luma: number[]; chroma: number[] } {
  if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new RangeError('JPEG quality must be an integer from 1 to 100.');
  const scale = quality < 50 ? Math.floor(5000 / quality) : 200 - quality * 2;
  const table = (base: number[]): number[] => base.map(value => Math.min(255, Math.max(1, Math.floor((value * scale + 50) / 100))));
  return { luma: table(LUMA_QT), chroma: table(CHROMA_QT) };
}

class BitWriter {
  readonly bytes: number[] = [];
  #buffer = 0; #count = 0;
  write({ code, length }: Code): void {
    for (let i = length - 1; i >= 0; i--) {
      this.#buffer = (this.#buffer << 1) | ((code >> i) & 1);
      if (++this.#count === 8) { this.bytes.push(this.#buffer); if (this.#buffer === 0xff) this.bytes.push(0); this.#buffer = 0; this.#count = 0; }
    }
  }
  flush(): void { if (this.#count) this.write({ code: (1 << (8 - this.#count)) - 1, length: 8 - this.#count }); }
}

function forwardDct(block: Float64Array, divisors: Float64Array, out: Int32Array): void {
  const d = block;
  for (let pass = 0; pass < 2; pass++) {
    const step = pass ? 8 : 1, stride = pass ? 1 : 8;
    for (let line = 0; line < 8; line++) {
      const o = line * stride, i = (k: number) => o + k * step;
      const t0 = d[i(0)]! + d[i(7)]!, t7 = d[i(0)]! - d[i(7)]!, t1 = d[i(1)]! + d[i(6)]!, t6 = d[i(1)]! - d[i(6)]!;
      const t2 = d[i(2)]! + d[i(5)]!, t5 = d[i(2)]! - d[i(5)]!, t3 = d[i(3)]! + d[i(4)]!, t4 = d[i(3)]! - d[i(4)]!;
      let t10 = t0 + t3; const t13 = t0 - t3; let t11 = t1 + t2; const t12 = t1 - t2;
      d[i(0)] = t10 + t11; d[i(4)] = t10 - t11;
      const z1 = (t12 + t13) * 0.707106781;
      d[i(2)] = t13 + z1; d[i(6)] = t13 - z1;
      t10 = t4 + t5; t11 = t5 + t6; const t12b = t6 + t7;
      const z5 = (t10 - t12b) * 0.382683433, z2 = 0.5411961 * t10 + z5, z4 = 1.306562965 * t12b + z5, z3 = t11 * 0.707106781;
      const z11 = t7 + z3, z13 = t7 - z3;
      d[i(5)] = z13 + z2; d[i(3)] = z13 - z2; d[i(1)] = z11 + z4; d[i(7)] = z11 - z4;
    }
  }
  for (let k = 0; k < 64; k++) {
    const v = d[ZIGZAG[k]!]! * divisors[ZIGZAG[k]!]!;
    out[k] = v > 0 ? (v + 0.5) | 0 : (v - 0.5) | 0;
  }
}

function divisorTable(table: number[]): Float64Array {
  const out = new Float64Array(64);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) out[row * 8 + col] = 1 / (table[row * 8 + col]! * AAN[row]! * AAN[col]! * 8);
  return out;
}

function encodeBlock(writer: BitWriter, coefficients: Int32Array, previousDc: number, dc: Code[], ac: Code[]): number {
  const category = (value: number): number => { let v = Math.abs(value), n = 0; while (v) { n++; v >>= 1; } return n; };
  const emit = (value: number, size: number): void => { if (size) writer.write({ code: value < 0 ? value + (1 << size) - 1 : value, length: size }); };
  const diff = coefficients[0]! - previousDc, dcSize = category(diff);
  writer.write(dc[dcSize]!); emit(diff, dcSize);
  let last = 63;
  while (last > 0 && coefficients[last] === 0) last--;
  for (let k = 1, run = 0; k <= last; k++) {
    const value = coefficients[k]!;
    if (value === 0) { run++; continue; }
    while (run > 15) { writer.write(ac[0xf0]!); run -= 16; }
    const size = category(value);
    writer.write(ac[(run << 4) | size]!); emit(value, size); run = 0;
  }
  if (last < 63) writer.write(ac[0x00]!);
  return coefficients[0]!;
}

export function encodeJpeg(raster: RgbRaster, quality: number): Buffer {
  const { width, height, data } = raster;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 65535 || height > 65535 || data.length !== width * height * 3)
    throw new RangeError('JPEG raster is invalid.');
  const { luma, chroma } = quantTables(quality);
  const lumaDiv = divisorTable(luma), chromaDiv = divisorTable(chroma);
  const writer = new BitWriter(), block = new Float64Array(64), coefficients = new Int32Array(64);
  const cb = new Float64Array(256), cr = new Float64Array(256), y = new Float64Array(256);
  let dcY = 0, dcCb = 0, dcCr = 0;
  for (let my = 0; my < height; my += 16) for (let mx = 0; mx < width; mx += 16) {
    for (let row = 0; row < 16; row++) for (let col = 0; col < 16; col++) {
      const p = (Math.min(height - 1, my + row) * width + Math.min(width - 1, mx + col)) * 3;
      const r = data[p]!, g = data[p + 1]!, b = data[p + 2]!, k = row * 16 + col;
      y[k] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
      cb[k] = -0.168736 * r - 0.331264 * g + 0.5 * b;
      cr[k] = 0.5 * r - 0.418688 * g - 0.081312 * b;
    }
    for (const [bx, by] of [[0, 0], [8, 0], [0, 8], [8, 8]] as const) {
      for (let k = 0; k < 64; k++) block[k] = y[(by + (k >> 3)) * 16 + bx + (k & 7)]!;
      forwardDct(block, lumaDiv, coefficients);
      dcY = encodeBlock(writer, coefficients, dcY, DC_LUMA, AC_LUMA);
    }
    for (const [plane, isCb] of [[cb, true], [cr, false]] as const) {
      for (let k = 0; k < 64; k++) {
        const s = (k >> 3) * 32 + (k & 7) * 2;
        block[k] = (plane[s]! + plane[s + 1]! + plane[s + 16]! + plane[s + 17]!) / 4;
      }
      forwardDct(block, chromaDiv, coefficients);
      if (isCb) dcCb = encodeBlock(writer, coefficients, dcCb, DC_CHROMA, AC_CHROMA);
      else dcCr = encodeBlock(writer, coefficients, dcCr, DC_CHROMA, AC_CHROMA);
    }
  }
  writer.flush();
  const segment = (marker: number, body: number[]): number[] => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
  const header = [0xff, 0xd8,
    ...segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xdb, [0, ...ZIGZAG.map(k => luma[k]!), 1, ...ZIGZAG.map(k => chroma[k]!)]),
    ...segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    ...segment(0xc4, HUFFMAN.flatMap(spec => [spec.cls, ...spec.bits, ...spec.values])),
    ...segment(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0])];
  return Buffer.concat([Buffer.from(header), Buffer.from(writer.bytes), Buffer.from([0xff, 0xd9])]);
}

export const COVER_JPEG_QUALITIES = [82, 75, 65] as const;
/** The report leak gate scans attribute values for local paths; a base64 payload that happens to spell one is re-encoded. */
export const coverBase64ScanSafe = (bytes: Buffer): boolean => !/\/(?:home|Users)\//iu.test(bytes.toString('base64'));
export function optimizeCoverPng(png: Uint8Array): { bytes: Buffer; mime: 'image/jpeg'; width: number; height: number; quality: number } {
  const raster = fitCover(decodePng(png));
  for (const quality of COVER_JPEG_QUALITIES) {
    const bytes = encodeJpeg(raster, quality);
    if (bytes.byteLength <= MAX_COVER_JPEG_BYTES && coverBase64ScanSafe(bytes)) return { bytes, mime: 'image/jpeg', width: raster.width, height: raster.height, quality };
  }
  throw new CoverImageError('COVER_AI_TOO_LARGE', 'Cover JPEG exceeds the size limit, or trips the report path scan, at every quality.');
}

// Report tokens: --blue #3F4FC1, --navy #232E7A, --yellow #FFC800. Integer maths only.
export function fallbackCoverRaster(): RgbRaster {
  const width = COVER_WIDTH, height = COVER_HEIGHT, data = new Uint8Array(width * height * 3);
  const from = [0x3f, 0x4f, 0xc1], to = [0x23, 0x2e, 0x7a], yellow = [0xff, 0xc8, 0x00];
  const span = (width - 1) * height + (height - 1) * width;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const t = x * height + y * width, p = (y * width + x) * 3, stripe = x * 9 + (height - 1 - y) * 16;
    const colour = stripe >= 8600 && stripe < 9400 ? yellow : from.map((a, k) => a + Math.floor(((to[k]! - a) * t) / span));
    data[p] = colour[0]!; data[p + 1] = colour[1]!; data[p + 2] = colour[2]!;
  }
  return { width, height, data };
}
export const fallbackCoverJpeg = (): Buffer => encodeJpeg(fallbackCoverRaster(), 82);
