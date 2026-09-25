import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

/**
 * Images for Content Studio media tests. `fixtureImage` returns small real encoder
 * outputs (generated synthetic patterns, committed under tests/fixtures/content-images);
 * the synthetic* builders produce header structures only and are not decodable.
 */

export function fixtureImage(name: string): Buffer {
  return fs.readFileSync(path.join('tests', 'fixtures', 'content-images', name));
}

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

export function pngChunk(type: string, data: Buffer = Buffer.alloc(0)): Buffer {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** RGB 8-bit PNG filled with one colour. */
export function syntheticPng(width = 96, height = 64, options: { readonly extraChunks?: readonly Buffer[]; readonly seed?: number } = {}): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0;
  const row = Buffer.alloc(1 + width * 3, options.seed ?? 0x7f); row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    ...(options.extraChunks ?? []),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND'),
  ]);
}

function segment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.from([0xff, marker, 0, 0]); head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/** Baseline JPEG marker structure with a fake scan: not decodable, used for header-level checks. */
export function syntheticJpeg(width = 800, height = 600, options: { readonly sof?: number; readonly trailing?: Buffer; readonly seed?: number } = {}): Buffer {
  const sof = Buffer.alloc(15);
  sof[0] = 8; sof.writeUInt16BE(height, 1); sof.writeUInt16BE(width, 3); sof[5] = 3;
  for (let component = 0; component < 3; component += 1) { sof[6 + component * 3] = component + 1; sof[7 + component * 3] = 0x11; sof[8 + component * 3] = 0; }
  const sos = Buffer.from([3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]);
  const entropy = Buffer.from([0x12, options.seed ?? 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78]);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('4a46494600010100000100010000', 'hex')),
    segment(0xdb, Buffer.alloc(65, 1)),
    segment(options.sof ?? 0xc0, sof),
    segment(0xc4, Buffer.from([0x00, 1, ...Array<number>(15).fill(0), 0x00])),
    segment(0xda, sos),
    entropy,
    Buffer.from([0xff, 0xd9]),
    options.trailing ?? Buffer.alloc(0),
  ]);
}

function riffChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8); head.write(type, 0, 'ascii'); head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}
function riff(chunks: readonly Buffer[]): Buffer {
  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), ...chunks]);
  const head = Buffer.alloc(8); head.write('RIFF', 0, 'ascii'); head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

/** Lossless WebP header structure. */
export function syntheticWebp(width = 320, height = 240, options: { readonly animated?: boolean } = {}): Buffer {
  const vp8l = Buffer.alloc(9);
  vp8l[0] = 0x2f; vp8l.writeUInt32LE(((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14), 1);
  if (!options.animated) return riff([riffChunk('VP8L', vp8l)]);
  const vp8x = Buffer.alloc(10); vp8x[0] = 0x02;
  vp8x.writeUIntLE(width - 1, 4, 3); vp8x.writeUIntLE(height - 1, 7, 3);
  return riff([riffChunk('VP8X', vp8x), riffChunk('ANIM', Buffer.alloc(6)), riffChunk('ANMF', Buffer.concat([Buffer.alloc(16), riffChunk('VP8L', vp8l)]))]);
}
