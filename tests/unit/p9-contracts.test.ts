import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import collectionSchema from '../../contracts/analysis/tiktok-comment-collection-v1.schema.json' with { type: 'json' };
import readingSchema from '../../contracts/analysis/video-reading-v1.schema.json' with { type: 'json' };
import keywordSchema from '../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import { ApifyTikTokCommentsCollector, createTikTokCommentPrivacy, retainedTikTokCapture } from '../../src/platform/collectors/apify-tiktok-comments.js';
import { buildTikTokCommentCorpus, citeTikTokCommentCorpus } from '../../src/modules/analysis/research-automation/tiktok-comment-intake.js';
import { prepareVideoReading } from '../../src/modules/analysis/research-automation/video-reading-intake.js';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { TikTokVideoSelection } from '../../contracts/analysis/tiktok-comment-collection-v1.generated.js';
import type { KeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true }); addFormats(ajv);
ajv.addSchema(keywordSchema); ajv.addSchema(collectionSchema); ajv.addSchema(readingSchema);
const validate = (schema: typeof collectionSchema | typeof readingSchema, def: string, value: unknown) =>
  ajv.compile({ $ref: `${schema.$id}#/$defs/${def}` })(value);
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const uuid = '11111111-1111-4111-8111-111111111111';
const url = 'https://www.tiktok.com/@synthetic_creator/video/1234';
const selection: TikTokVideoSelection = { contractVersion: 'tiktok-video-selection-v1', workspaceId: uuid,
  runId: '22222222-2222-4222-8222-222222222222', scopeSha256: 'a'.repeat(64), sourceSetSha256: 'b'.repeat(64),
  requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' },
  sourcePeriod: { state: 'UNKNOWN_UNVERIFIED', startDate: null, endDate: null },
  sourcePackage: { packageId: '33333333-3333-4333-8333-333333333333', manifestArtifactSha256: 'c'.repeat(64), packageContentSha256: 'd'.repeat(64) },
  tableSha256: 'e'.repeat(64), option: 'A_TOP_20_PERCENT', tieRule: 'EXACT_SOURCE_ORDER', maximumVideos: 30,
  sampleVideoCount: 1, excluded: [], videos: [{ videoId: '1234', url, kind: 'SELLER_VIDEO', sourceLine: 'csv:row:2', revenue: '1' }] };
const keywords: KeywordMeaningFilterData = { contractVersion: 'l9-keyword-data-v1', dataVersion: 'synthetic-p9-v1', category: 'thạch dừa',
  provenance: 'OPERATOR_SUPPLIED', keywords: ['thạch dừa'], exclusions: [] };

test('actual sanitized capture/corpus canonical roundtrip strips raw identity and report view rejects private identity/key', async () => {
  let calls = 0;
  const collector = new ApifyTikTokCommentsCollector({ approvedMaxTotalChargeUsd: 3,
    privacy: createTikTokCommentPrivacy({ salt: Buffer.alloc(32, 1), keyId: uuid }), transport: {
      start: async () => { calls++; return { runId: 'synthetic-run', datasetId: 'synthetic-dataset', buildId: null,
        status: 'SUCCEEDED', retrievedAt: '2026-10-09T00:00:00Z', providerTotalRows: 1, usageTotalUsd: 0 }; },
      readPage: async () => { calls++; return Buffer.from(JSON.stringify([{ item_type: 'comment', video_id: '1234', comment_id: '1',
        text: 'thạch dừa nguyên văn @private_handle', user_id: '777', username: 'private_handle', nickname: 'PRIVATE_NAME', profile_url: 'https://example.test/private' }])); },
    } });
  const capture = await collector.collect([url], 'f'.repeat(64));
  const persisted = retainedTikTokCapture(capture);
  assert.ok(validate(collectionSchema, 'capture', persisted));
  assert.deepEqual(JSON.parse(canonicalJson(persisted)), persisted);
  const corpus = buildTikTokCommentCorpus({ selection, selectionSha256: digest(selection) }, capture, keywords);
  assert.ok(validate(collectionSchema, 'corpus', JSON.parse(canonicalJson(corpus))));
  const serialized = canonicalJson(corpus);
  for (const raw of ['PRIVATE_NAME', 'private_handle', 'profile_url', 'user_id', 'nickname']) assert.ok(!serialized.includes(raw));
  const view = { contractVersion: 'tiktok-comment-read-v1', registryId: 'S07', sampleLabel: 'bình luận thu được',
    rows: citeTikTokCommentCorpus(corpus, new CitationRegistry()), accounting: corpus.accounting, limitations: corpus.limitations };
  assert.ok(validate(collectionSchema, 'readView', view));
  for (const field of ['authorIdentity', 'privacy', 'salt', 'keyId', 'authorName'])
    assert.equal(validate(collectionSchema, 'readView', { ...view, [field]: 'forbidden' }), false);
  assert.equal(validate(collectionSchema, 'readView', { ...view, rows: [{ ...view.rows[0], authorIdentity: corpus.records[0]!.authorIdentity }] }), false);
  assert.equal(validate(collectionSchema, 'capture', { ...persisted, privacy: { ...persisted.privacy, salt: 'forbidden' } }), false);
  assert.equal(validate(collectionSchema, 'capture', { ...persisted, pages: [{ ...persisted.pages[0], rows: [{ ...persisted.pages[0]!.rows[0], authorName: 'forbidden' }] }] }), false);
  assert.equal(validate(collectionSchema, 'capture', { ...persisted, pages: [{ ...persisted.pages[0], rows: [{ ...persisted.pages[0]!.rows[0], authorIdentity: { state: 'MISSING', hash: 'a'.repeat(64) } }] }] }), false);
  const before = calls; assert.deepEqual(await collector.collect([url], 'f'.repeat(64)), capture); assert.equal(calls, before);
});

test('before-call intent requires positive cap, key continuity and separate unknown source period', () => {
  const { workspaceId, runId, scopeSha256, sourceSetSha256, requestedPeriod, sourcePeriod } = selection;
  const intent = { contractVersion: 'tiktok-comment-intent-v1', requestKey: uuid,
    binding: { workspaceId, runId, scopeSha256, sourceSetSha256, requestedPeriod, sourcePeriod }, selection,
    selectionSha256: digest(selection), keywordData: keywords, actor: 'datadoping/tiktok-comment-reply-scraper',
    privacy: createTikTokCommentPrivacy({ salt: Buffer.alloc(32, 1), keyId: uuid }).profile,
    approvedMaxTotalChargeUsd: 3, maxCommentsPerVideo: 200, replyPolicy: 'TOP_LEVEL_ONLY', auditForm: 'SANITIZED_ALLOWLIST' };
  assert.ok(validate(collectionSchema, 'intent', intent));
  for (const cap of [null, 0, -1]) assert.equal(validate(collectionSchema, 'intent', { ...intent, approvedMaxTotalChargeUsd: cap }), false);
  assert.equal(validate(collectionSchema, 'intent', { ...intent, maxCommentsPerVideo: 201 }), false);
  assert.equal(validate(collectionSchema, 'intent', { ...intent, privacy: { ...intent.privacy, keyCommitment: 'bad' } }), false);
  assert.equal(validate(collectionSchema, 'intent', { ...intent, selection: { ...selection, sourcePeriod: requestedPeriod } }), false);
  assert.equal(validate(collectionSchema, 'selection', { ...selection, scopeSha256: 'bad' }), false);
});

test('actual S14 prepared roundtrip rejects raw metadata, malformed bindings and missing caption provenance', () => {
  const input = { videoUrl: url, videoKind: 'SELLER_VIDEO' as const, durationSeconds: 10,
    segments: [{ startSeconds: 0, endSeconds: 5, text: 'Nội dung nguyên văn.', captionSource: 'NATIVE' as const }], onScreenText: [], frames: [] };
  const binding = { workspaceId: uuid, runId: selection.runId, scopeSha256: selection.scopeSha256,
    sourceSetSha256: selection.sourceSetSha256, selectionSha256: digest(selection) };
  const prepared = prepareVideoReading(input, new Map(), binding);
  assert.ok(validate(readingSchema, 'reading', JSON.parse(prepared.bytes.toString())));
  assert.equal(validate(readingSchema, 'reading', { ...prepared.reading, salt: 'forbidden' }), false);
  assert.throws(() => prepareVideoReading({ ...input, authorName: 'forbidden' } as typeof input, new Map(), binding));
  assert.throws(() => prepareVideoReading(input, new Map(), { ...binding, scopeSha256: 'bad' }));
  assert.equal(validate(readingSchema, 'input', { ...input, segments: [{ startSeconds: 0, endSeconds: 5, text: 'source' }] }), false);
});
