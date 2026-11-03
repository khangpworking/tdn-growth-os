import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { createTikTokCommentPrivacy } from '../../src/platform/collectors/apify-tiktok-comments.js';
import { readTikTokCommentPrivacyFile } from '../../src/platform/collectors/apify-tiktok-comments-free.js';
import document from './raw-db-v1-s07.synthetic.json' with { type: 'json' };

export const S07_FILE = fileURLToPath(new URL('./raw-db-v1-s07.synthetic.json', import.meta.url));
export const S07_RUN = 'synthetic-s07-file';
export const S07_DOCUMENT = document;
export const S07_URLS = document.records[0]!.videos!;
export const S07_ITEMS = document.records[1]!.items!;
export const S07_COMPLETED = '2026-11-03T01:00:09Z';
// Synthetic only. This also matches the existing tiktok-coding fixture's salt.
const salt = Buffer.alloc(32, 17);
const keyId = '11111111-1111-4111-8111-111111111111';
export const s07Privacy = (privacyKeyId = keyId) => createTikTokCommentPrivacy({ salt, keyId: privacyKeyId });
export const s07Hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
// Independent formula pinned in COMMON-T §2, rather than a loader-generated expectation.
export const s07AuthorKey = (domain: 'author' | 'video-author-handle', value: string) =>
  createHmac('sha256', salt).update(`tdn:tiktok.com:${domain}:v1\0`).update(value).digest('hex');

export async function s07Fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-raw-s07-'));
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const { db } = openDatabase({ databasePath });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const privacyFile = path.join(root, 'synthetic-privacy.json');
  await fs.writeFile(privacyFile, JSON.stringify({ keyId, salt: salt.toString('base64') }), { mode: 0o600 });
  const privacy = readTikTokCommentPrivacyFile(privacyFile);
  const bytes = await fs.readFile(S07_FILE);
  return { root, databasePath, artifactRoot, db, privacyFile, privacy,
    artifacts: new ContentAddressedArtifactStore(artifactRoot), captureId: `S07:${s07Hash(bytes).slice(0, 12)}:1` };
}
