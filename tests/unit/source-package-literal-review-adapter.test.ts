import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { readLiteralReviewRulesV1 } from '../../src/modules/analysis/research-automation/literal-review-coding.js';
import { buildSourcePackageLiteralReviewDiagnostics } from '../../src/modules/analysis/research-automation/source-package-literal-review-adapter.js';
import { locatedInsightFixture, locatedSpan } from '../helpers/located-insight-fixture.js';

const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));
const rules = readLiteralReviewRulesV1();
type Descriptor = ReturnType<typeof locatedInsightFixture>;

// A real Foundation package boundary with synthetic Dami-shaped rows; no provider or private dataset is used.
async function fixture(t: TestContext) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-source-literal-'));
  const { db } = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  t.after(async () => {
    db.close();
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('tdn-source-literal-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const packages = new SourcePackageService({ db, artifactStore: new ContentAddressedArtifactStore(path.join(directory, 'artifacts')) });
  const source = json([
    { type: 'review', shopid: '100', itemid: '200', comment: '😀 Tôi đã dùng quạt.' },
    { type: 'review', shopid: '999', itemid: '200', comment: 'Tôi đã dùng sản phẩm.' },
    { type: 'review', shopid: '100', itemid: '200', comment: null },
    { type: 'review', shopid: '100', itemid: '200', comment: '  ' },
    { type: 'review', shopid: '100', itemid: '200', comment: 'Tôi đã dùng sản phẩm.'.normalize('NFD') },
    { type: 'review', shopid: '100', itemid: '200', comment: 'Quạt nhỏ.' },
  ]);
  const descriptor = locatedInsightFixture();
  descriptor.sources = [{ logicalPath: 'capture/dataset.json', sha256: sha(source) }];
  descriptor.records = JSON.parse(source.toString()).map((row: { shopid: string; comment: string | null }, index: number) => ({
    sourceSha256: sha(source), locator: `/${index}/comment`, text: row.comment,
    sourceAttribution: 'Synthetic Dami-shaped shop-sweep row; authors, dates and completeness unverified', timeText: null,
    disposition: row.comment === null ? 'UNREADABLE' : row.shopid !== '100' ? 'EXCLUDED' : 'INCLUDED',
    dispositionReason: row.comment === null ? 'UNREADABLE_TEXT' : row.shopid !== '100' ? 'WRONG_LISTING' : null,
  }));
  const nativeRequest = json({ actor: 'dami_studio/shopee-shop-reviews-scraper', input: { startUrls: ['https://shopee.vn/product/100/200'] } });
  const terminal = json({ data: { id: 'synthetic-dami-run', defaultDatasetId: 'synthetic-dami-dataset', status: 'SUCCEEDED' } });
  const baseFiles = new Map<string, Buffer>([
    ['capture/dataset.json', source], ['capture/request.json', nativeRequest], ['capture/terminal-status.json', terminal],
    ['authority/qualitative-profile.md', await fs.readFile(new URL('../../docs/research/method-configurations-v1/qualitative-profile.md', import.meta.url))],
    ['authority/method-adoption.md', await fs.readFile(new URL('../../docs/research/method-configurations-v1-adoption.md', import.meta.url))],
  ]);
  let serial = 0;
  const intake = async (change?: (input: Descriptor) => void) => {
    const input = structuredClone(descriptor); change?.(input);
    const files = new Map(baseFiles); files.set('methods/located-input.json', json(input));
    const receipt = await packages.intake({ contractVersion: '1.0.0', packageKey: `synthetic:dami-literal-${++serial}`, version: 1,
      sourceAcquiredAt: null, sourceLabel: 'Synthetic Dami capture without Zen lineage',
      files: [...files].map(([filePath, bytes]) => ({ path: filePath, sha256: sha(bytes), byteSize: bytes.length,
        mediaType: filePath.endsWith('.md') ? 'text/markdown' : 'application/json', evidenceFamily: 'synthetic-dami-shop-sweep',
        representationRole: filePath === 'capture/dataset.json' ? 'primary' : 'derived', independence: 'non_independent',
        providerProvenance: 'synthetic', provenanceBasis: 'Synthetic exact bytes; no provider authentication or source-date claim' })),
    }, files);
    const retained = await packages.readVerified(receipt.packageId);
    return { sourcePackage: { packageId: retained.packageId, manifestArtifactSha256: retained.manifestArtifactSha256,
      packageContentSha256: retained.packageContentSha256, manifest: retained.manifest }, logicalPath: 'methods/located-input.json' };
  };
  return { db, packages, reader: new FoundationSourcePackageReader(packages), intake, descriptor, source, nativeRequest, terminal };
}

test('SourcePackage diagnostics preserve native capture bytes and record locators without admitting proposals as report findings', async t => {
  const state = await fixture(t);
  const input = await state.intake();
  const before = state.db.prepare('SELECT total_changes() n').get();
  const result = await buildSourcePackageLiteralReviewDiagnostics(input, state.reader, rules);
  assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), before);
  assert.deepEqual(result.output.sourcePackage, input.sourcePackage);
  assert.deepEqual(result.output.diagnostics.records, state.descriptor.records);
  assert.deepEqual(result.output.diagnostics.units.map(unit => [unit.recordIndex, unit.eligibility]),
    [[0, 'ELIGIBLE'], [1, 'EXCLUDED'], [2, 'UNREADABLE_TEXT'], [3, 'EMPTY_TEXT'], [4, 'ELIGIBLE'], [5, 'ELIGIBLE']]);
  assert.deepEqual(result.output.diagnostics.candidates.i04.map(row => [row.recordIndex, row.span.start, row.span.end, row.span.quote]),
    [[0, 3, 19, 'Tôi đã dùng quạt']]);
  assert.equal(result.output.diagnostics.pending.filter(row => row.recordIndex === 4 && row.reason === 'NON_NFC_TEXT').length, 5);
  assert.equal(result.output.diagnostics.pending.filter(row => row.recordIndex === 5 && row.reason === 'NO_RULE_MATCH').length, 5);
  assert.equal(result.output.diagnostics.pending.some(row => [1, 2, 3].includes(row.recordIndex)), false);
  assert.equal(result.output.authorityState, 'RULE_PROPOSAL_ONLY');
  assert.equal(result.output.diagnostics.executionAuthority, 'NONE_RULE_PROPOSAL_ONLY');
  for (const key of ['i02', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09', 'corpora', 'i13Mentions'] as const)
    assert.deepEqual(result.locatedOutput.input[key], []);
  assert.equal(Object.hasOwn(result.output.diagnostics, 'corpus'), false);
  assert.equal(Object.hasOwn(result.output.diagnostics, 'collectionId'), false);
  const retained = await state.packages.readVerified(input.sourcePackage.packageId);
  assert.deepEqual(retained.files.find(file => file.path === 'capture/request.json')!.bytes, state.nativeRequest);
  assert.deepEqual(retained.files.find(file => file.path === 'capture/terminal-status.json')!.bytes, state.terminal);
  assert.deepEqual(retained.files.find(file => file.path === 'capture/dataset.json')!.bytes, state.source);
  const { codingId, ...body } = result.output;
  assert.equal(sha(json(body)), codingId);
  assert.equal(sha(result.files.get('rules/literal-review-parser.ts')!), result.output.implementation.parserSha256);
  assert.deepEqual(result.files.get('rules/literal-review-rules.json'), rules);
  assert.deepEqual((await buildSourcePackageLiteralReviewDiagnostics(input, state.reader, rules)).bytes, result.bytes);
});

test('SourcePackage diagnostics reject mismatched identity, self-consistent invented text and pre-admitted annotations', async t => {
  const state = await fixture(t);
  const input = await state.intake();
  await assert.rejects(buildSourcePackageLiteralReviewDiagnostics({ ...input,
    sourcePackage: { ...input.sourcePackage, packageContentSha256: 'f'.repeat(64) } }, state.reader, rules), /LOCATED_PACKAGE_IDENTITY_MISMATCH/);
  const invented = await state.intake(descriptor => { descriptor.records[0]!.text = 'Tôi đã mua sản phẩm.'; });
  await assert.rejects(buildSourcePackageLiteralReviewDiagnostics(invented, state.reader, rules), /LOCATED_RECORD_TEXT_MISMATCH/);
  const annotated = await state.intake(descriptor => {
    descriptor.i04 = [{ recordIndex: 0, provenance: { basis: 'DECLARED', coderRole: 'synthetic imported coder', adjudication: null, disagreement: null },
      qualifiers: [], counterevidence: [], span: locatedSpan(descriptor.records[0]!.text!, 'Tôi đã dùng quạt'),
      eventKind: 'ACTION_REPORTED', attribution: 'SELF_REPORTED' }];
  });
  await assert.rejects(buildSourcePackageLiteralReviewDiagnostics(annotated, state.reader, rules), /LITERAL_DIAGNOSTICS_REQUIRE_UNANNOTATED_INPUT/);
});
