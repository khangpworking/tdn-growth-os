import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { COVER_HEIGHT, COVER_WIDTH, CoverImageError, MAX_COVER_JPEG_BYTES, coverBase64ScanSafe, decodePng, encodeJpeg, fallbackCoverJpeg, fallbackCoverRaster,
  fitCover, optimizeCoverPng, quantTables } from '../../src/modules/analysis/research-automation/cover-image-codec.js';

import { pngChunk as chunk, syntheticPng } from '../helpers/synthetic-png.js';

const colour = (x: number, y: number): number[] => [(x * 37 + y * 11) & 255, (x * 5 + y * 71) & 255, (x * y * 3 + 9) & 255, (x * 13 + y * 29) & 255];
const jpegInfo = (bytes: Buffer): { width: number; height: number; markers: number[] } => {
  const markers: number[] = []; let width = 0, height = 0, offset = 2;
  while (offset < bytes.length) {
    assert.equal(bytes[offset], 0xff); const marker = bytes[offset + 1]!; markers.push(marker);
    const length = bytes.readUInt16BE(offset + 2);
    if (marker === 0xc0) { height = bytes.readUInt16BE(offset + 5); width = bytes.readUInt16BE(offset + 7); }
    if (marker === 0xda) break;
    offset += 2 + length;
  }
  return { width, height, markers };
};
const invalidImage = (run: () => unknown) => assert.throws(run, (error: unknown) => error instanceof CoverImageError && error.code === 'COVER_AI_INVALID_IMAGE');

test('decodePng reverses all five filters exactly for RGB and RGBA, compositing alpha over white', () => {
  const rgb = decodePng(syntheticPng(7, 10, 3, colour, [0, 1, 2, 3, 4]));
  assert.equal(rgb.width, 7); assert.equal(rgb.height, 10);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 7; x++) assert.deepEqual([...rgb.data.subarray((y * 7 + x) * 3, (y * 7 + x) * 3 + 3)], colour(x, y).slice(0, 3));
  const rgba = decodePng(syntheticPng(6, 5, 4, colour, [4, 3, 2, 1, 0]));
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) {
    const [r, g, b, a] = colour(x, y) as [number, number, number, number];
    assert.deepEqual([...rgba.data.subarray((y * 6 + x) * 3, (y * 6 + x) * 3 + 3)], [r, g, b].map(v => Math.round((v * a + 255 * (255 - a)) / 255)));
  }
  assert.deepEqual([...decodePng(syntheticPng(1, 1, 3, () => [1, 2, 3], [0], [chunk('tEXt', Buffer.from('k\0v'))])).data], [1, 2, 3]);
});

test('decodePng refuses malformed, unsupported or oversized input as INVALID_IMAGE', () => {
  const good = syntheticPng(4, 4, 3, colour);
  invalidImage(() => decodePng(Buffer.from('not a png')));
  invalidImage(() => decodePng(good.subarray(0, good.length - 20)));
  invalidImage(() => decodePng(syntheticPng(2, 2, 3, colour, [0], [chunk('ZZZZ', Buffer.alloc(1))])));
  const badFilter = Buffer.from(good); const idat = badFilter.indexOf('IDAT');
  const raw = Buffer.alloc(4 * 13); raw[0] = 9;
  invalidImage(() => decodePng(Buffer.concat([badFilter.subarray(0, idat - 4), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])));
  const withIhdr = (edit: (data: Buffer) => void): Buffer => { const data = Buffer.from(good.subarray(16, 29)); edit(data); return Buffer.concat([good.subarray(0, 8), chunk('IHDR', data), good.subarray(33)]); };
  invalidImage(() => decodePng(withIhdr(data => data.writeUInt32BE(5000, 0))));
  invalidImage(() => decodePng(withIhdr(data => { data[9] = 3; })));
  assert.equal(decodePng(withIhdr(() => undefined)).width, 4);
  const flip = (bytes: Buffer, at: number): Buffer => { const out = Buffer.from(bytes); out[at] = out.readUInt8(at) ^ 0x01; return out; };
  invalidImage(() => decodePng(flip(good, 29)));
  invalidImage(() => decodePng(flip(good, good.indexOf('IEND') - 5)));
  invalidImage(() => decodePng(flip(good, good.indexOf('IDAT') + 6)));
  const text = chunk('tEXt', Buffer.from('k\0v'));
  invalidImage(() => decodePng(syntheticPng(1, 1, 3, () => [1, 2, 3], [0], [flip(text, text.length - 1)])));
  invalidImage(() => decodePng(Buffer.concat([good.subarray(0, good.indexOf('IDAT') - 4), chunk('IDAT', deflateSync(Buffer.alloc(3))), chunk('IEND', Buffer.alloc(0))])));
  invalidImage(() => fitCover(decodePng(syntheticPng(100, 4000, 3, () => [0, 0, 0]))));
});

test('fitCover centre-crops to 16:9 and area-averages', () => {
  const wide = fitCover(decodePng(syntheticPng(1600, 600, 3, x => x < 800 ? [0, 0, 0] : [255, 255, 255])));
  assert.equal(wide.width, COVER_WIDTH); assert.equal(wide.height, COVER_HEIGHT);
  assert.deepEqual([...wide.data.subarray(0, 3)], [0, 0, 0]);
  assert.deepEqual([...wide.data.subarray(wide.data.length - 3)], [255, 255, 255]);
});

test('JPEG output is baseline JFIF 1024x576, deterministic and shrinks with quality', () => {
  const fallback = fallbackCoverJpeg();
  assert.deepEqual([fallback[0], fallback[1]], [0xff, 0xd8]);
  assert.deepEqual([fallback.at(-2), fallback.at(-1)], [0xff, 0xd9]);
  const info = jpegInfo(fallback);
  assert.deepEqual([info.width, info.height], [1024, 576]);
  for (const marker of [0xe0, 0xdb, 0xc0, 0xc4, 0xda]) assert.ok(info.markers.includes(marker), marker.toString(16));
  assert.ok(fallback.byteLength < 100_000);
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha(fallbackCoverJpeg()), sha(fallback));
  assert.ok(coverBase64ScanSafe(fallback));
  assert.equal(coverBase64ScanSafe(Buffer.from(['x', 'home', 'y'].join('/'), 'base64')), false);
  assert.equal(coverBase64ScanSafe(Buffer.from(['ab', 'Users', 'cdef'].join('/'), 'base64')), false);
  const raster = fallbackCoverRaster();
  assert.deepEqual([...raster.data.subarray(0, 3)], [0xff, 0xc8, 0x00]);
  assert.deepEqual([...raster.data.subarray(575 * 1024 * 3, 575 * 1024 * 3 + 3)], [0x3f - 14, 0x4f - 17, 0xc1 - 36]);
  const sizes = [95, 82, 65, 30].map(quality => encodeJpeg(raster, quality).byteLength);
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i]! < sizes[i - 1]!, String(sizes));
  assert.ok(quantTables(30).luma.every((value, i) => value >= quantTables(82).luma[i]!));
  assert.ok(quantTables(100).luma.every(value => value === 1));
});

test('optimizeCoverPng returns a bounded 1024x576 JPEG for smooth and noisy input', () => {
  const result = optimizeCoverPng(syntheticPng(1536, 1024, 4, (x, y) => [x & 255, y & 255, 200, 255]));
  assert.equal(result.mime, 'image/jpeg'); assert.equal(result.quality, 82);
  assert.deepEqual([result.width, result.height], [1024, 576]);
  assert.deepEqual([jpegInfo(result.bytes).width, jpegInfo(result.bytes).height], [1024, 576]);
  assert.ok(result.bytes.byteLength <= MAX_COVER_JPEG_BYTES);
  let seed = 1;
  const noise = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 24; };
  const noisy = optimizeCoverPng(syntheticPng(1024, 576, 3, () => [noise(), noise(), noise()]));
  assert.ok(noisy.bytes.byteLength <= MAX_COVER_JPEG_BYTES && noisy.bytes.byteLength > result.bytes.byteLength, `${noisy.quality} ${noisy.bytes.byteLength}`);
});
