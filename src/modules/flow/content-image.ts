import { inflateSync } from 'node:zlib';
import { inspectJpeg, JpegError } from './content-jpeg.js';

/**
 * Validation for Content Studio reference images (brand logos and catalog photos).
 * Only still PNG and JPEG images are accepted. With `decode` (the default, used for
 * uploads) the image data itself must be complete: PNG data is fully decompressed and
 * its scanlines checked (ported from the original Content Studio logo inspector), and
 * every JPEG scan is entropy-decoded (content-jpeg.ts). WebP, SVG, GIF, HEIC,
 * animations, unknown critical chunks and trailing data are rejected.
 */

export type ContentMediaKind = 'LOGO' | 'PHOTO';
export type ContentImageType = 'image/png' | 'image/jpeg';
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

export const CONTENT_IMAGE_TYPES: readonly ContentImageType[] = ['image/png', 'image/jpeg'];
export const CONTENT_MEDIA_LIMITS: Readonly<Record<ContentMediaKind, { readonly maxBytes: number }>> = {
  LOGO: { maxBytes: 2 * 1024 * 1024 },
  PHOTO: { maxBytes: 8 * 1024 * 1024 },
};
const MIN_EDGE = 64;
const MAX_EDGE = 8192;
const MAX_PIXELS = 50_000_000;
const MAX_PNG_RAW_BYTES = 64 * 1024 * 1024;

const fail = (code: ContentImageErrorCode): never => { throw new ContentImageError(code); };

export function inspectContentImage(bytes: Buffer, options: { readonly declaredType: string; readonly kind: ContentMediaKind; readonly decode?: boolean }): ContentImageInfo {
  if (!CONTENT_IMAGE_TYPES.includes(options.declaredType as ContentImageType)) fail('unsupported_format');
  if (bytes.length > CONTENT_MEDIA_LIMITS[options.kind].maxBytes) fail('too_large');
  const detected = sniff(bytes);
  if (!detected) return fail('unsupported_format');
  if (detected !== options.declaredType) fail('type_mismatch');
  const decode = options.decode ?? true;
  let size: { width: number; height: number };
  if (detected === 'image/png') {
    size = png(bytes, decode);
  } else {
    try { size = inspectJpeg(bytes, { decode, checkDimensions }); }
    catch (error) { if (error instanceof JpegError) return fail(error.code); throw error; }
  }
  checkDimensions(size.width, size.height);
  return { mediaType: detected, width: size.width, height: size.height, byteSize: bytes.length };
}

function checkDimensions(width: number, height: number): void {
  if (width < MIN_EDGE || height < MIN_EDGE || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) fail('dimensions');
}

function sniff(bytes: Buffer): ContentImageType | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
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

function png(bytes: Buffer, decode: boolean): { width: number; height: number } {
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
  checkDimensions(header.width, header.height);
  if (!decode) return { width: header.width, height: header.height };
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
