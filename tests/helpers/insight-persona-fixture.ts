import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { createShopeePrivateIntake } from '../../src/platform/collectors/shopee-private-intake.js';
import { ShopeeCollectionService, type VerifiedPrivateShopeeCollection } from '../../src/modules/foundation/shopee-collection-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildPrivateReviewCorpus, buildPrivateReviewReportView, type PrivateReviewBinding } from '../../src/modules/analysis/research-automation/private-review-corpus.js';
import { readPrivatePersonaEvidence, type PersonaQuoteSelection } from '../../src/modules/analysis/research-automation/insight-persona-evidence.js';

export const PERSONA_WORKSPACE = '11111111-1111-4111-8111-111111111111';
export const PERSONA_RUN = '22222222-2222-4222-8222-222222222222';
export const PERSONA_KEY = '33333333-3333-4333-8333-333333333333';
export const PERSONA_NOW = '2026-10-08T00:00:00.000Z';
export const personaRows = (size = 6) => Array.from({ length: size }, (_, index) => ({ reviewId: String(7000000001 + index),
  shopId: '2001', itemId: String(3001 + index % 3), authorId: String(918273640 + index), author: 'PRIVATE_AUTHOR',
  profileUrl: 'PRIVATE_PROFILE', comment: `Exact source ${index}: I do not want a sweet drink; I want to carry it to work.`,
  ratingStar: 5, createdAt: null }));

export async function personaSourceFixture(t: TestContext, rows: unknown[] = personaRows(), products = 3) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-persona-source-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite') }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const foundation = new ShopeeCollectionService(db, artifacts);
  const intake = createShopeePrivateIntake({ salt: Buffer.alloc(32, 7), keyId: PERSONA_KEY });
  const collector = new FixtureShopeeCollector(Buffer.from(JSON.stringify(rows)), intake);
  let calls = 0;
  const request: VerifiedPrivateShopeeCollection['request'] = { contractVersion: '2.0.0', runKey: `auto-${PERSONA_RUN}`,
    topic: 'Synthetic qualitative customer evidence', selectionBasis: 'OWNER_EXACT_URL',
    source: { label: 'Exact synthetic source', acquiredAt: PERSONA_NOW },
    productUrls: Array.from({ length: products }, (_, index) => `https://shopee.vn/product/2001/${3001 + index}`) };
  const source = await foundation.collectExact(Buffer.from(canonicalJson(request)), {
    mode: collector.mode, privacyProfile: collector.privacyProfile,
    collect: async (...args) => { calls++; return collector.collect(...args); },
  }, { privacy: true });
  const binding: PrivateReviewBinding = { workspaceId: PERSONA_WORKSPACE, runId: PERSONA_RUN,
    startSha256: 'a'.repeat(64), scopeSha256: 'b'.repeat(64), confirmedSourceSetSha256: 'c'.repeat(64), scopeConfirmedAt: PERSONA_NOW };
  const corpus = buildPrivateReviewCorpus(source, binding).output;
  const view = buildPrivateReviewReportView(corpus);
  const stored = await artifacts.put(Buffer.from(canonicalJson(corpus)));
  const selection = { reader: foundation, retainedCorpus: corpus, retainedView: view, corpusSha256: stored.sha256,
    binding, request, marker: { contractVersion: 'automation-private-shopee-source-v1' as const, profile: intake.profile } };
  const before = db.prepare('SELECT total_changes() n').get();
  let puts = 0;
  artifacts.put = async () => { puts++; throw new Error('Evidence must never write'); };
  db.pragma('query_only = ON');
  t.after(async () => {
    try { assert.equal(calls, 1); assert.equal(puts, 0); assert.deepEqual(db.prepare('SELECT total_changes() n').get(), before); }
    finally { db.close(); await fs.rm(root, { recursive: true, force: true }); }
  });
  const evidence = await readPrivatePersonaEvidence(selection);
  const quote = (recordIndex: number): PersonaQuoteSelection => {
    const record = view.records[recordIndex]!;
    return { recordIndex, recordId: record.recordId, locator: structuredClone(record.locator),
      span: { start: 0, end: record.text!.length, quote: record.text! } };
  };
  return { root, db, artifacts, source, corpus, view, selection, evidence, quote };
}
