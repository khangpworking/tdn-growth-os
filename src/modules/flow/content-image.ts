import { inflateSync } from 'node:zlib';

/**
 * Structural validation for Content Studio reference images (brand logos and
 * catalog photos). Only PNG, JPEG and WebP still images are accepted; SVG, GIF,
 * HEIC, animations, unknown critical chunks and trailing data are rejected.
 * The PNG checks are ported from the original Content Studio logo inspector.
 */

export type ContentMediaKind = 'LOGO' | 'PHOTO';
export type ContentImageType = 'image/png' | 'image/jpeg' | 'image/webp';
export type ContentImageErrorCode = 'unsupported_format' | 'type_mismatch' | 'too_large' | 'dimensions' | 'invalid' | 'animated' | 'trailing_data';

export interface ContentImageInfo {
  readonly mediaType: ContentImageType;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
}

export class ContentImageError extends Error {
  constructor(readonly code: ContentImageErrorCode) { super(`Content image rejected: ${code}`); }
}

export const CONTENT_IMAGE_TYPES: readonly ContentImageType[] = ['image/png', 'image/jpeg', 'image/webp'];
export const CONTENT_MEDIA_LIMITS: Readonly<Record<ContentMediaKind, { readonly maxBytes: number }>> = {
  LOGO: { maxBytes: 2 * 1024 * 1024 },
  PHOTO: { maxBytes: 8 * 1024 * 1024 },
};
const MIN_EDGE = 64;
const MAX_EDGE = 8192;
const MAX_PIXELS = 50_000_000;
const MAX_PNG_RAW_BYTES = 64 * 1024 * 1024;

const fail = (code: ContentImageErrorCode): never => { throw new ContentImageError(code); };

export function inspectContentImage(bytes: Buffer, options: { readonly declaredType: string; readonly kind: ContentMediaKind }): ContentImageInfo {
  if (!CONTENT_IMAGE_TYPES.includes(options.declaredType as ContentImageType)) fail('unsupported_format');
  if (bytes.length > CONTENT_MEDIA_LIMITS[options.kind].maxBytes) fail('too_large');
  const detected = sniff(bytes);
  if (!detected) return fail('unsupported_format');
  if (detected !== options.declaredType) fail('type_mismatch');
  const { width, height } = detected === 'image/png' ? png(bytes) : detected === 'image/jpeg' ? jpeg(bytes) : webp(bytes);
  if (width < MIN_EDGE || height < MIN_EDGE || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) fail('dimensions');
  return { mediaType: detected, width, height, byteSize: bytes.length };
}

function sniff(bytes: Buffer): ContentImageType | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// ---------------------------------------------------------------- PNG

const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');
const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});
function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC_TABLE[(value ^ byte) & 0xff]!;
  return (value ^ 0xffffffff) >>> 0;
}

interface PngHeader { width: number; height: number; bitDepth: number; colorType: number; interlace: number }

function pngPasses(header: PngHeader): { height: number; rowBytes: number }[] {
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[header.colorType]!;
  const rowBytes = (pixels: number) => Math.ceil(pixels * channels * header.bitDepth / 8);
  if (header.interlace === 0) return [{ height: header.height, rowBytes: rowBytes(header.width) }];
  return [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]].map(([x, y, dx, dy]) => {
    const passWidth = header.width <= x! ? 0 : Math.ceil((header.width - x!) / dx!);
    const passHeight = header.height <= y! ? 0 : Math.ceil((header.height - y!) / dy!);
    return { height: passWidth === 0 ? 0 : passHeight, rowBytes: rowBytes(passWidth) };
  });
}

function png(bytes: Buffer): { width: number; height: number } {
  let offset = 8;
  let header: PngHeader | undefined;
  let sawIdat = false; let idatEnded = false; let sawIend = false; let palette = false;
  const idat: Buffer[] = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail('invalid');
    const length = bytes.readUInt32BE(offset);
    const dataStart = offset + 8; const end = dataStart + length;
    if (end + 4 > bytes.length) fail('invalid');
    const typeBytes = bytes.subarray(offset + 4, dataStart);
    const type = typeBytes.toString('latin1');
    if (!/^[A-Za-z]{4}$/.test(type)) fail('invalid');
    if (bytes.readUInt32BE(end) !== crc32(bytes.subarray(offset + 4, end))) fail('invalid');
    if (!header) {
      if (type !== 'IHDR' || length !== 13) fail('invalid');
      const colorType = bytes[dataStart + 9]!; const bitDepth = bytes[dataStart + 8]!;
      const depths = ({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] } as Record<number, number[]>)[colorType];
      const interlace = bytes[dataStart + 12]!;
      if (!depths?.includes(bitDepth) || bytes[dataStart + 10] !== 0 || bytes[dataStart + 11] !== 0 || interlace > 1) fail('invalid');
      header = { width: bytes.readUInt32BE(dataStart), height: bytes.readUInt32BE(dataStart + 4), bitDepth, colorType, interlace };
      if (header.width === 0 || header.height === 0) fail('invalid');
    } else if (type === 'IHDR') {
      fail('invalid');
    } else if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') {
      fail('animated');
    } else if (type === 'IEND') {
      if (length !== 0 || end + 4 !== bytes.length) fail('invalid');
      sawIend = true;
      break;
    } else if (type === 'PLTE') {
      const entries = length / 3;
      if (palette || sawIdat || ![2, 3, 6].includes(header.colorType) || !Number.isInteger(entries) || entries < 1 || entries > 256 || (header.colorType === 3 && entries > 2 ** header.bitDepth)) fail('invalid');
      palette = true;
    } else if (type === 'IDAT') {
      if (idatEnded) fail('invalid');
      sawIdat = true;
      idat.push(bytes.subarray(dataStart, end));
    } else {
      if (sawIdat) idatEnded = true;
      if ((typeBytes[0]! & 0x20) === 0) fail('invalid');
    }
    offset = end + 4;
  }
  if (!header || !sawIdat || !sawIend || (header.colorType === 3 && !palette)) return fail('invalid');
  if (header.width > MAX_EDGE || header.height > MAX_EDGE || header.width * header.height > MAX_PIXELS) fail('dimensions');
  const passes = pngPasses(header);
  const rawLength = passes.reduce((total, pass) => total + pass.height * (1 + pass.rowBytes), 0);
  if (rawLength > MAX_PNG_RAW_BYTES) fail('dimensions');
  let raw: Buffer;
  try { raw = inflateSync(Buffer.concat(idat), { maxOutputLength: rawLength }); } catch { return fail('invalid'); }
  if (raw.length !== rawLength) fail('invalid');
  let position = 0;
  for (const pass of passes) {
    for (let row = 0; row < pass.height; row += 1) {
      if (raw[position]! > 4) fail('invalid');
      position += 1 + pass.rowBytes;
    }
  }
  return { width: header.width, height: header.height };
}

// ---------------------------------------------------------------- JPEG

function jpeg(bytes: Buffer): { width: number; height: number } {
  let offset = 2;
  let size: { width: number; height: number } | undefined;
  let sawScan = false;
  for (;;) {
    if (offset >= bytes.length || bytes[offset] !== 0xff) fail('invalid');
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) fail('invalid');
    const marker = bytes[offset]!; offset += 1;
    if (marker === 0xd9) {
      if (!size || !sawScan) fail('invalid');
      if (bytes.subarray(offset).some((byte) => byte !== 0)) fail('trailing_data');
      return size!;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd8 || marker === 0x00) fail('invalid');
    if (offset + 2 > bytes.length) fail('invalid');
    const length = bytes.readUInt16BE(offset);
    const end = offset + length;
    if (length < 2 || end > bytes.length) fail('invalid');
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (marker !== 0xc0 && marker !== 0xc1 && marker !== 0xc2) fail('unsupported_format');
      if (size || length < 8) fail('invalid');
      const components = bytes[offset + 7]!;
      if (length !== 8 + 3 * components || ![1, 3, 4].includes(components) || ![8, 12].includes(bytes[offset + 2]!)) fail('invalid');
      size = { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
      if (size.width === 0 || size.height === 0) fail('invalid');
      offset = end;
    } else if (marker === 0xda) {
      if (!size || length < 6 || length !== 6 + 2 * bytes[offset + 2]!) fail('invalid');
      sawScan = true;
      offset = end;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset += 1; continue; }
        const next = bytes[offset + 1];
        if (next === undefined) fail('invalid');
        if (next === 0x00 || (next! >= 0xd0 && next! <= 0xd7)) { offset += 2; continue; }
        if (next === 0xff) { offset += 1; continue; }
        break;
      }
    } else {
      offset = end;
    }
  }
}

// ---------------------------------------------------------------- WebP

function webp(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 20 || bytes.readUInt32LE(4) + 8 !== bytes.length) fail('invalid');
  const chunks: { type: string; data: Buffer }[] = [];
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail('invalid');
    const type = bytes.toString('latin1', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8; const end = dataStart + length;
    if (end > bytes.length) fail('invalid');
    chunks.push({ type, data: bytes.subarray(dataStart, end) });
    offset = end + (length % 2);
  }
  if (offset !== bytes.length || chunks.length === 0) fail('invalid');
  if (chunks.some((chunk) => chunk.type === 'ANIM' || chunk.type === 'ANMF')) fail('animated');
  const [first] = chunks;
  if (first!.type === 'VP8X') {
    if (first!.data.length < 10) fail('invalid');
    if (first!.data[0]! & 0x02) fail('animated');
    const images = chunks.filter((chunk) => chunk.type === 'VP8 ' || chunk.type === 'VP8L');
    if (images.length !== 1 || !chunks.slice(1).every((chunk) => ['ICCP', 'ALPH', 'VP8 ', 'VP8L', 'EXIF', 'XMP '].includes(chunk.type))) fail('invalid');
    const canvas = { width: first!.data.readUIntLE(4, 3) + 1, height: first!.data.readUIntLE(7, 3) + 1 };
    const image = bitstream(images[0]!);
    if (image.width !== canvas.width || image.height !== canvas.height) fail('invalid');
    return canvas;
  }
  if (chunks.length !== 1) fail('invalid');
  return bitstream(first!);
}

function bitstream(chunk: { type: string; data: Buffer }): { width: number; height: number } {
  const data = chunk.data;
  if (chunk.type === 'VP8L') {
    if (data.length < 5 || data[0] !== 0x2f) fail('invalid');
    const bits = data.readUInt32LE(1);
    if (bits >>> 29 !== 0) fail('invalid');
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk.type === 'VP8 ') {
    if (data.length < 10 || (data[0]! & 0x01) !== 0 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) fail('invalid');
    return { width: data.readUInt16LE(6) & 0x3fff, height: data.readUInt16LE(8) & 0x3fff };
  }
  return fail('invalid');
}
