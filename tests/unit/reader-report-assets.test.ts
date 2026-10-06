import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import {
  READER_COVER_MAX_BYTES, ReaderAssetError, cover, loadCoverImage, loadReaderProfile, storeCoverImage, storeReaderProfile,
  verifyReaderProfile,
} from '../../src/modules/analysis/reader-report/index.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

const profile = () => ({
  slug: 'synthetic', product: 'Bình thử', status: 'proposed' as const,
  segments: { S1: 'Bình nhỏ', N1: 'Hàng tặng kèm' }, short: { S1: 'Nhỏ' },
  core: ['S1'], non: ['N1'],
  rules: [{ seg: 'N1', when: { titleRe: 'nước giặt' } }, { seg: 'S1', when: {} }],
  signals: [['Quà tặng', 'quà']],
});
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);

async function storeFor(t: TestContext): Promise<ContentAddressedArtifactStore> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-assets-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return new ContentAddressedArtifactStore(root);
}
const code = (expected: string, message?: RegExp) => (error: unknown) =>
  error instanceof ReaderAssetError && error.code === expected && (message === undefined || message.test(error.message));

test('profile is stored canonically and read back verified', async t => {
  const store = await storeFor(t);
  const first = await storeReaderProfile(store, profile());
  assert.deepEqual(first.status, 'proposed');
  assert.deepEqual(await loadReaderProfile(store, first.sha256), profile());
  const p = profile();
  const reordered = { signals: p.signals, rules: p.rules, non: p.non, core: p.core, short: p.short, segments: p.segments, status: p.status, product: p.product, slug: p.slug };
  assert.equal((await storeReaderProfile(store, reordered)).sha256, first.sha256, 'Key order does not change the sha');
  assert.equal((await storeReaderProfile(store, { ...profile(), status: 'approved' })).status, 'approved');
  assert.equal(first.artifact.sha256, first.sha256);

  const broken = { ...profile(), rules: [{ seg: 'Z9', when: {} }] };
  assert.throws(() => verifyReaderProfile(broken), /nhóm Z9 chưa khai báo trong profile/);
  await assert.rejects(storeReaderProfile(store, broken), code('PROFILE_INVALID', /^nhóm Z9 chưa khai báo trong profile$/));
  await assert.rejects(storeReaderProfile(store, { ...profile(), extra: 1 }), code('PROFILE_INVALID', /profile bản đọc sai khuôn/));
  await assert.rejects(storeReaderProfile(store, { ...profile(), signals: [['Quà', '(']] }), code('PROFILE_INVALID', /mẫu chữ không hợp lệ/));

  const wrongContract = await store.put(Buffer.from(canonicalJson({ contractVersion: 'other', profile: profile() }), 'utf8'));
  await assert.rejects(loadReaderProfile(store, wrongContract.sha256), code('PROFILE_INVALID'));
  const notJson = await store.put(Buffer.from('{', 'utf8'));
  await assert.rejects(loadReaderProfile(store, notJson.sha256), code('PROFILE_INVALID'));
  await assert.rejects(loadReaderProfile(store, 'a'.repeat(64)), code('ASSET_MISSING'));
});

test('cover images are recognised by their bytes, bounded and paired with a licence sidecar', async t => {
  const store = await storeFor(t);
  for (const [bytes, mime] of [[JPEG, 'image/jpeg'], [PNG, 'image/png'], [WEBP, 'image/webp']] as const) {
    const stored = await storeCoverImage(store, bytes, { licence: 'CC0', credit: 'Ảnh tự chụp' });
    assert.notEqual(stored.coverSha256, stored.imageSha256);
    assert.deepEqual([stored.image.sha256, stored.sidecar.sha256], [stored.imageSha256, stored.coverSha256]);
    assert.notEqual(stored.coverSha256, stored.imageSha256);
    const loaded = await loadCoverImage(store, stored.coverSha256);
    assert.equal(loaded.mime, mime);
    assert.deepEqual([...loaded.bytes], [...bytes]);
  }
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');
  await assert.rejects(storeCoverImage(store, svg, { licence: 'CC0' }), code('COVER_TYPE'));
  await assert.rejects(storeCoverImage(store, Uint8Array.from([1, 2, 3, 4, 5]), { licence: 'CC0' }), code('COVER_TYPE'));
  await assert.rejects(storeCoverImage(store, Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]), { licence: 'CC0' }), code('COVER_TYPE'), 'RIFF that is not WebP');
  const big = new Uint8Array(READER_COVER_MAX_BYTES + 1);
  big.set(JPEG);
  await assert.rejects(storeCoverImage(store, big, { licence: 'owner-supplied' }), code('COVER_TOO_LARGE'));
  await assert.rejects(storeCoverImage(store, JPEG, { licence: 'CC0', credit: 'x'.repeat(201) }), code('COVER_META_INVALID'));
  await assert.rejects(storeCoverImage(store, JPEG, { licence: 'stolen' as never }), code('COVER_META_INVALID'));
});

test('cover sidecar faults fail closed', async t => {
  const store = await storeFor(t);
  const sidecar = (value: unknown) => store.put(Buffer.from(canonicalJson(value), 'utf8')).then(x => x.sha256);
  const good = { contractVersion: 'reader-cover-v1', imageSha256: 'b'.repeat(64), mime: 'image/jpeg', byteLength: JPEG.byteLength, licence: 'CC0' };
  await assert.rejects(loadCoverImage(store, await sidecar(good)), code('ASSET_MISSING'), 'Sidecar points at a missing image');
  await assert.rejects(loadCoverImage(store, 'c'.repeat(64)), code('ASSET_MISSING'));
  for (const bad of [{ ...good, mime: 'image/svg+xml' }, { ...good, byteLength: 0 }, { ...good, licence: 'x' },
    { ...good, imageSha256: 'not-a-sha' }, { ...good, url: 'https://example.com/a.jpg' }, { ...good, contractVersion: 'v0' }]) {
    await assert.rejects(loadCoverImage(store, await sidecar(bad)), code('COVER_META_INVALID'), JSON.stringify(bad));
  }
  const png = await store.put(PNG);
  await assert.rejects(loadCoverImage(store, await sidecar({ ...good, imageSha256: png.sha256, byteLength: PNG.byteLength })), code('COVER_HASH_MISMATCH'), 'mime differs');
  await assert.rejects(loadCoverImage(store, await sidecar({ ...good, imageSha256: png.sha256, mime: 'image/png', byteLength: 99 })), code('COVER_HASH_MISMATCH'), 'length differs');
});

test('assets load without any network and the cover renders inline', async t => {
  const store = await storeFor(t);
  const profileSha = (await storeReaderProfile(store, profile())).sha256;
  const coverSha = (await storeCoverImage(store, JPEG, { licence: 'public-domain' })).coverSha256;
  const original = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('network is not allowed'); }) as typeof fetch;
  try {
    assert.equal((await loadReaderProfile(store, profileSha)).product, 'Bình thử');
    const html = cover(await loadCoverImage(store, coverSha), 'Shopee', ['Báo cáo thị trường', 'Bình thử', 'Shopee']);
    assert.match(html, /data:image\/jpeg;base64,/);
    assert.doesNotMatch(html, /http/);
  } finally {
    globalThis.fetch = original;
  }
});
