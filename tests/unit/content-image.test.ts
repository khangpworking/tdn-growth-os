import assert from 'node:assert/strict';
import test from 'node:test';
import { ContentImageError, inspectContentImage } from '../../src/modules/flow/content-image.js';
import { fixtureImage, pngChunk, syntheticJpeg, syntheticPng, syntheticWebp } from '../helpers/content-images.js';

const rejects = (bytes: Buffer, declaredType: string, kind: 'LOGO' | 'PHOTO', code: string) =>
  assert.throws(() => inspectContentImage(bytes, { declaredType, kind }), (error: unknown) => error instanceof ContentImageError && error.code === code, code);
const accepts = (bytes: Buffer, declaredType: string) => inspectContentImage(bytes, { declaredType, kind: 'PHOTO' });

/** Replaces the entropy-coded bytes of the first scan with `data` (keeps every header). */
function withFirstScanData(jpeg: Buffer, data: Buffer): Buffer {
  const sos = jpeg.indexOf(Buffer.from([0xff, 0xda]));
  const headerEnd = sos + 2 + jpeg.readUInt16BE(sos + 2);
  let next = headerEnd;
  while (!(jpeg[next] === 0xff && jpeg[next + 1] !== 0x00 && !(jpeg[next + 1]! >= 0xd0 && jpeg[next + 1]! <= 0xd7))) next += 1;
  return Buffer.concat([jpeg.subarray(0, headerEnd), data, jpeg.subarray(next)]);
}

test('real encoder PNG and JPEG output is accepted with its dimensions', () => {
  assert.deepEqual(accepts(fixtureImage('rgb.png'), 'image/png'), { mediaType: 'image/png', width: 96, height: 64, byteSize: fixtureImage('rgb.png').length });
  const expected: Record<string, [number, number]> = {
    'baseline-420.jpg': [96, 64], 'baseline-444-restart.jpg': [96, 64], 'progressive-420.jpg': [96, 64],
    'progressive-444-odd.jpg': [97, 65], 'gray.jpg': [80, 72], 'gray-progressive.jpg': [72, 72],
  };
  for (const [name, [width, height]] of Object.entries(expected)) {
    const info = accepts(fixtureImage(name), 'image/jpeg');
    assert.deepEqual([info.mediaType, info.width, info.height], ['image/jpeg', width, height], name);
  }
  assert.equal(accepts(syntheticPng(96, 64), 'image/png').width, 96);
});

test('JPEG headers without complete decodable image data are rejected', () => {
  for (const name of ['baseline-420.jpg', 'progressive-420.jpg', 'baseline-444-restart.jpg']) {
    const jpeg = fixtureImage(name);
    rejects(withFirstScanData(jpeg, Buffer.alloc(0)), 'image/jpeg', 'PHOTO', 'invalid');
    const sos = jpeg.indexOf(Buffer.from([0xff, 0xda]));
    rejects(Buffer.concat([jpeg.subarray(0, sos + 2 + jpeg.readUInt16BE(sos + 2) + 40), Buffer.from([0xff, 0xd9])]), 'image/jpeg', 'PHOTO', 'invalid');
  }
  rejects(syntheticJpeg(800, 600), 'image/jpeg', 'PHOTO', 'invalid');
  const noHuffman = fixtureImage('baseline-420.jpg');
  const dht = noHuffman.indexOf(Buffer.from([0xff, 0xc4]));
  rejects(Buffer.concat([noHuffman.subarray(0, dht), noHuffman.subarray(dht + 2 + noHuffman.readUInt16BE(dht + 2))]), 'image/jpeg', 'PHOTO', 'invalid');
  const restart = Buffer.from(fixtureImage('baseline-444-restart.jpg'));
  const rst = restart.indexOf(Buffer.from([0xff, 0xd1]));
  restart[rst + 1] = 0xd3;
  rejects(restart, 'image/jpeg', 'PHOTO', 'invalid');
});

test('WebP is not accepted, including header-only containers', () => {
  const headerOnly = Buffer.alloc(26);
  headerOnly.write('RIFF', 0, 'latin1'); headerOnly.writeUInt32LE(18, 4); headerOnly.write('WEBP', 8, 'latin1');
  headerOnly.write('VP8L', 12, 'latin1'); headerOnly.writeUInt32LE(5, 16); headerOnly[20] = 0x2f; headerOnly.writeUInt32LE(63 | (63 << 14), 21);
  rejects(headerOnly, 'image/webp', 'PHOTO', 'unsupported_format');
  rejects(headerOnly, 'image/png', 'PHOTO', 'unsupported_format');
  rejects(fixtureImage('lossy.webp'), 'image/webp', 'PHOTO', 'unsupported_format');
  rejects(syntheticWebp(320, 240), 'image/webp', 'PHOTO', 'unsupported_format');
});

test('unsupported formats and declared-type mismatches are rejected', () => {
  rejects(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml', 'LOGO', 'unsupported_format');
  rejects(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/png', 'LOGO', 'unsupported_format');
  rejects(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'), 'image/gif', 'PHOTO', 'unsupported_format');
  rejects(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic', 'ascii'), Buffer.alloc(16)]), 'image/jpeg', 'PHOTO', 'unsupported_format');
  rejects(syntheticPng(), 'image/jpeg', 'LOGO', 'type_mismatch');
  rejects(fixtureImage('baseline-420.jpg'), 'image/png', 'PHOTO', 'type_mismatch');
  rejects(fixtureImage('baseline-420.jpg'), 'image/jpeg; charset=binary', 'PHOTO', 'unsupported_format');
  rejects(Buffer.alloc(0), 'image/jpeg', 'PHOTO', 'unsupported_format');
});

test('size and dimension limits depend on the media kind and are checked before decoding', () => {
  const bigLogo = syntheticPng(96, 64, { extraChunks: [pngChunk('tEXt', Buffer.alloc(2 * 1024 * 1024))] });
  rejects(bigLogo, 'image/png', 'LOGO', 'too_large');
  assert.equal(inspectContentImage(bigLogo, { declaredType: 'image/png', kind: 'PHOTO' }).width, 96);
  rejects(syntheticPng(32, 64), 'image/png', 'LOGO', 'dimensions');
  rejects(syntheticJpeg(9000, 600), 'image/jpeg', 'PHOTO', 'dimensions');
  rejects(syntheticJpeg(8192, 8000), 'image/jpeg', 'PHOTO', 'dimensions');
});

test('structurally broken, animated or padded images are rejected', () => {
  const png = syntheticPng();
  const badCrc = Buffer.from(png); badCrc[png.length - 20] = badCrc[png.length - 20]! ^ 0xff;
  rejects(badCrc, 'image/png', 'LOGO', 'invalid');
  rejects(png.subarray(0, png.length - 12), 'image/png', 'LOGO', 'invalid');
  rejects(syntheticPng(96, 64, { extraChunks: [pngChunk('acTL', Buffer.alloc(8))] }), 'image/png', 'LOGO', 'animated');
  rejects(Buffer.concat([png, Buffer.from('<script>')]), 'image/png', 'LOGO', 'invalid');
  rejects(syntheticJpeg(800, 600, { sof: 0xc9 }), 'image/jpeg', 'PHOTO', 'unsupported_format');
  rejects(Buffer.concat([fixtureImage('baseline-420.jpg'), Buffer.from('PK\x03\x04', 'latin1')]), 'image/jpeg', 'PHOTO', 'trailing_data');
  const jpeg = fixtureImage('baseline-420.jpg');
  rejects(jpeg.subarray(0, jpeg.length - 2), 'image/jpeg', 'PHOTO', 'invalid');
});

test('stored images can be re-checked quickly without decoding', () => {
  const header = syntheticJpeg(800, 600);
  assert.deepEqual(inspectContentImage(header, { declaredType: 'image/jpeg', kind: 'PHOTO', decode: false }).width, 800);
  rejects(header, 'image/jpeg', 'PHOTO', 'invalid');
});
