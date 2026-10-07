import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { openDatabase } from '../../src/platform/db/index.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ensureIndexed } from '../../src/modules/analysis/pageindex-documents.js';
import { estimatePageIndexBalance } from '../../src/modules/analysis/pageindex-balance.js';
import {
  buildVerifiedQuotesArtifact,
  planPageIndexQuestions,
  verifyPageIndexQuotes,
} from '../../src/modules/analysis/pageindex-questions.js';
import { buildResearchAutomationSourceStatus } from '../../src/modules/analysis/research-automation/source-status.js';
import sourceStatusSchema from '../../contracts/api/research-automation-source-status-api.schema.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(sourceStatusSchema);
const validateStatus = ajv.getSchema(`${(sourceStatusSchema as { $id: string }).$id}#/$defs/status`)!;

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const fixedNow = () => new Date('2026-10-07T00:00:00.000Z');

function pdfFixture(): Buffer {
  const text = 'BT /F1 12 Tf 20 100 Td (Calcium 120 mg) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}

// With fakes only: one attached PDF uploads once, reaches READY, yields
// verified quotes for the run page and the status card, and a second run
// with the same PDF uploads nothing.
test('fixture run indexes one attached PDF once and reports states with an estimated balance', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-pageindex-upload-'));
  try {
    const database = path.join(root, 'db.sqlite');
    const artifacts = path.join(root, 'artifacts');
    const bytes = pdfFixture();
    const digest = createHash('sha256').update(bytes).digest('hex');
    const opened = openDatabase({ databasePath: database });
    const db = opened.db;
    try {
      // The usage-limit flag row starts cleared by migration 0049.
      assert.deepEqual(db.prepare(`SELECT flag_value FROM analysis_pageindex_flags WHERE flag_key = 'usage_limit_reached'`).get(), { flag_value: '0' });
      const service = new SourcePackageService({ db, artifactStore: new ContentAddressedArtifactStore(artifacts) });
      await service.intake({ contractVersion: '1.0.0', packageKey: 'manual:pageindex-synthetic', version: 1,
        sourceAcquiredAt: null, sourceLabel: 'Synthetic PDF', files: [{ path: 'fixture.pdf', sha256: digest,
          byteSize: bytes.length, mediaType: 'application/pdf', evidenceFamily: 'synthetic', representationRole: 'primary',
          independence: 'independent', providerProvenance: 'synthetic', provenanceBasis: 'Public fixture' }] },
        new Map([['fixture.pdf', bytes]]));

      let uploads = 0;
      let polls = 0;
      const transport = {
        upload: async (): Promise<{ cloudDocId: string; pageCount: number | null }> => {
          uploads += 1;
          return { cloudDocId: 'pi-fixture', pageCount: 1 };
        },
        fetchStatus: async (): Promise<'processing' | 'completed' | 'failed' | 'unknown'> => {
          polls += 1;
          return polls === 1 ? 'processing' : 'completed';
        },
      };
      const first = await ensureIndexed({ sha256: digest, fileName: 'fixture.pdf', bytes },
        { db, now: fixedNow, enabled: true, countPages: () => 1, ...transport, sleep: async () => undefined });
      assert.equal(first.outcome, 'READY');
      assert.equal(first.cloudDocId, 'pi-fixture');
      assert.equal(first.uploadCalls, 1);
      assert.ok(polls >= 2, 'bounded wait polls until completed');

      // One fixed question per eligible section, answered once with no retry.
      const planned = planPageIndexQuestions({ sections: ['M05', 'I04'], pdfCount: 1 });
      assert.deepEqual(planned.map(entry => entry.sectionId), ['M05', 'I04']);
      const dropped: string[] = [];
      const verified = verifyPageIndexQuotes({
        candidates: [
          { page: 1, quote: 'Calcium 120 mg' },
          { page: 2, quote: 'Calcium 120 mg' },
        ],
        // Stand-in for the local pypdf extraction of the verified bytes.
        localPages: [{ page: 1, text: 'Serving contains Calcium 120 mg daily' }],
        pageCount: 1,
        sourceSha256: digest,
        cloudDocId: 'pi-fixture',
        sectionId: 'M05',
        onDrop: drop => { dropped.push(drop.reason); },
      });
      assert.equal(verified.length, 1);
      assert.deepEqual(dropped, ['PAGE_OUT_OF_RANGE']);
      const artifact = buildVerifiedQuotesArtifact(runId, verified);
      assert.equal(artifact.contractVersion, 'pageindex-verified-quotes-v1');
      assert.equal(artifact.quotes[0]?.quoteVerification, 'EXTERNAL_VERIFIER_ATTESTED');
      assert.ok(!('answer' in artifact), 'vendor answer text is never stored as report content');

      // A second run with the same PDF uploads nothing.
      const second = await ensureIndexed({ sha256: digest, fileName: 'fixture.pdf', bytes },
        { db, now: fixedNow, enabled: true, countPages: () => 1, ...transport, sleep: async () => undefined });
      assert.equal(second.outcome, 'READY');
      assert.equal(second.uploadCalls, 0);
      assert.equal(uploads, 1);

      // The PageIndex card carries documents sent, the estimated balance and billing.
      const balance = estimatePageIndexBalance({ startingCreditMicroDollars: 10_000_000, indexedPagesTotal: 1, activePages: 0 });
      assert.equal(balance.state, 'OK');
      const status = buildResearchAutomationSourceStatus({
        workspaceId, checkedAt: '2026-10-07T00:00:00.000Z', executorEnabled: true, providers: undefined,
        wired: { kalodata: false, serpapi: false, apifyShopee: false },
        activity: {
          kalodata: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
          serpapi: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
          'apify-shopee': { lastDataAt: null, dataCount: 0, lastUsageAt: null },
          metric: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
        },
        pageindex: {
          keyConfigured: true, enabled: true, lastCallAt: '2026-10-07T00:00:00.000Z', documentsSent: 1,
          balanceMicroDollars: balance.balanceMicroDollars, balanceCheckedAt: '2026-10-07T00:00:00.000Z',
          billingUrl: 'https://billing.example.invalid/pageindex',
          activePages: 0, estimatedMonthlyCostMicroDollars: balance.estimatedMonthlyCostMicroDollars, lowBalance: balance.lowBalance,
        },
      });
      assert.equal(validateStatus(status), true, JSON.stringify(validateStatus.errors));
      const card = status.sources.find(entry => entry.source === 'PAGEINDEX')!;
      assert.equal(card.state, 'READY');
      assert.equal(card.credential, 'CONFIGURED');
      assert.equal(card.dataCount, 1);
      assert.equal(card.pageindex?.automaticState, 'INDEXING_PDFS');
      assert.equal(card.pageindex?.balanceMicroDollars, 9_990_000);
      assert.equal(card.pageindex?.billingUrl, 'https://billing.example.invalid/pageindex');
    } finally {
      opened.db.close();
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('low balance pauses automatic indexing on the status card', () => {
  const status = buildResearchAutomationSourceStatus({
    workspaceId, checkedAt: '2026-10-07T00:00:00.000Z', executorEnabled: true, providers: undefined,
    wired: { kalodata: false, serpapi: false, apifyShopee: false },
    activity: {
      kalodata: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
      serpapi: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
      'apify-shopee': { lastDataAt: null, dataCount: 0, lastUsageAt: null },
      metric: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    },
    pageindex: {
      keyConfigured: true, enabled: true, lastCallAt: null, documentsSent: 2,
      balanceMicroDollars: 400_000, balanceCheckedAt: '2026-10-07T00:00:00.000Z', billingUrl: null,
      activePages: 1500, estimatedMonthlyCostMicroDollars: 500_000, lowBalance: true,
    },
  });
  assert.equal(validateStatus(status), true, JSON.stringify(validateStatus.errors));
  const card = status.sources.find(entry => entry.source === 'PAGEINDEX')!;
  assert.equal(card.state, 'READY');
  assert.equal(card.pageindex?.automaticState, 'PAUSED_LOW_BALANCE');
});
