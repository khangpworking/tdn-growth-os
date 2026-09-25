import assert from 'node:assert/strict';
import test from 'node:test';
import { ContentImageError, inspectContentImage } from '../../src/modules/flow/content-image.js';
import { pngChunk, syntheticJpeg, syntheticPng, syntheticWebp } from '../helpers/content-images.js';

const rejects = (bytes: Buffer, declaredType: string, kind: 'LOGO' | 'PHOTO', code: string) =>
  assert.throws(() => inspectContentImage(bytes, { declaredType, kind }), (error: unknown) => error instanceof ContentImageError && error.code === code, code);

test('PNG, JPEG and WebP reference images are accepted with their dimensions', () => {
  assert.deepEqual(inspectContentImage(syntheticPng(96, 64), { declaredType: 'image/png', kind: 'LOGO' }), { mediaType: 'image/png', width: 96, height: 64, byteSize: syntheticPng(96, 64).length });
  const jpeg = syntheticJpeg(4032, 3024);
  assert.deepEqual(inspectContentImage(jpeg, { declaredType: 'image/jpeg', kind: 'PHOTO' }), { mediaType: 'image/jpeg', width: 4032, height: 3024, byteSize: jpeg.length });
  assert.deepEqual(inspectContentImage(syntheticJpeg(640, 480, { sof: 0xc2 }), { declaredType: 'image/jpeg', kind: 'PHOTO' }).width, 640);
  const webp = syntheticWebp(320, 240);
  assert.deepEqual(inspectContentImage(webp, { declaredType: 'image/webp', kind: 'PHOTO' }), { mediaType: 'image/webp', width: 320, height: 240, byteSize: webp.length });
});

test('unsupported formats and declared-type mismatches are rejected', () => {
  rejects(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml', 'LOGO', 'unsupported_format');
  rejects(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/png', 'LOGO', 'unsupported_format');
  rejects(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'), 'image/gif', 'PHOTO', 'unsupported_format');
  rejects(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic', 'ascii'), Buffer.alloc(16)]), 'image/jpeg', 'PHOTO', 'unsupported_format');
  rejects(syntheticPng(), 'image/jpeg', 'LOGO', 'type_mismatch');
  rejects(syntheticJpeg(), 'image/png', 'PHOTO', 'type_mismatch');
  rejects(syntheticJpeg(), 'image/jpeg; charset=binary', 'PHOTO', 'unsupported_format');
});

test('size and dimension limits depend on the media kind', () => {
  const bigLogo = syntheticPng(96, 64, { extraChunks: [pngChunk('tEXt', Buffer.alloc(2 * 1024 * 1024))] });
  rejects(bigLogo, 'image/png', 'LOGO', 'too_large');
  assert.equal(inspectContentImage(bigLogo, { declaredType: 'image/png', kind: 'PHOTO' }).width, 96);
  rejects(syntheticJpeg(800, 600, { trailing: Buffer.alloc(0) }).subarray(0, 0), 'image/jpeg', 'PHOTO', 'unsupported_format');
  rejects(syntheticPng(32, 64), 'image/png', 'LOGO', 'dimensions');
  rejects(syntheticJpeg(9000, 600), 'image/jpeg', 'PHOTO', 'dimensions');
  rejects(syntheticJpeg(8192, 8000), 'image/jpeg', 'PHOTO', 'dimensions');
});

test('structurally broken, animated or padded images are rejected', () => {
  const png = syntheticPng();
  const badCrc = Buffer.from(png); badCrc[png.length - 20] ^= 0xff;
  rejects(badCrc, 'image/png', 'LOGO', 'invalid');
  rejects(png.subarray(0, png.length - 12), 'image/png', 'LOGO', 'invalid');
  rejects(syntheticPng(96, 64, { extraChunks: [pngChunk('acTL', Buffer.alloc(8))] }), 'image/png', 'LOGO', 'animated');
  rejects(Buffer.concat([png, Buffer.from('<script>')]), 'image/png', 'LOGO', 'invalid');
  rejects(syntheticJpeg(800, 600, { sof: 0xc9 }), 'image/jpeg', 'PHOTO', 'unsupported_format');
  rejects(syntheticJpeg(800, 600, { trailing: Buffer.from('PK\x03\x04', 'latin1') }), 'image/jpeg', 'PHOTO', 'trailing_data');
  const jpeg = syntheticJpeg();
  rejects(jpeg.subarray(0, jpeg.length - 2), 'image/jpeg', 'PHOTO', 'invalid');
  rejects(syntheticWebp(320, 240, { animated: true }), 'image/webp', 'PHOTO', 'animated');
  const webp = syntheticWebp();
  const wrongSize = Buffer.from(webp); wrongSize.writeUInt32LE(webp.length, 4);
  rejects(wrongSize, 'image/webp', 'PHOTO', 'invalid');
});
