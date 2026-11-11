import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { sha256 } from '../../scripts/module-pick.js';
import { moduleOutputs, readModuleEvidence } from '../../scripts/module-metric-output.js';
import { buildModuleRun as buildRun, distinctRows as distinct, preset, product, requestBytes, window } from '../helpers/module-run-fixture.js';

test('module outputs project a real retained capture and selection without recomputing identity', async t => {
  const { run, rawBytes } = await buildRun(t);
  const output = await moduleOutputs(run) as any;
  assert.equal(output.format, 'module-outputs-v1');
  assert.equal(output.runId, basename(run));
  assert.deepEqual([output.m1.captureSuccess, output.m1.dataValid, output.m1.errorCode], [true, true, null]);
  assert.deepEqual(output.m1.keywords, preset.keywords);
  assert.deepEqual(output.m1.period, window.period);
  assert.equal(output.m1.shopeeRowCount, 5);
  assert.deepEqual(Object.keys(output.m1.evidence), ['fullPage', 'raw']);
  for (const kind of ['fullPage', 'raw']) {
    const descriptor = output.m1.evidence[kind];
    assert.equal(descriptor.available, true);
    assert.equal(descriptor.errorCode, null);
    assert.match(descriptor.sha256, /^[a-f0-9]{64}$/);
    assert.equal(descriptor.byteSize, (await readFile(join(run, 'm1/selected/evidence', descriptor.fileName))).length);
  }
  assert.deepEqual(output.m1.evidence.raw.sha256, sha256(rawBytes));
  assert.equal(output.m2.policy, 'metric-products-unique-v1');
  assert.deepEqual([output.m2.legacyVerdict, output.m2.linksMatchSourceOrder, output.m2.fiveDistinct,
    output.m2.selectedCount, output.m2.shortageReason, output.m2.errorCode], [null, true, true, 5, null, null]);
  assert.deepEqual(output.m2.links.map((link: any) => [link.rank, link.sourceRank]), [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]);
  assert.deepEqual(Object.keys(output.m2.evidence), ['topProducts']);
  assert.equal(output.m2.evidence.topProducts.available, true);
  assert.deepEqual(output.m2.skipped, []);
});

test('module outputs keep legacy predicate fields null and label the saved gate verdict', async t => {
  const legacyRows = Array.from({ length: 5 }, (_, i) => ({
    product_base_id: `1__${9200 + i}__${811 + i}`, product_name: `Synthetic term one pickable ${i + 1}`,
    shop_base_id: String(811 + i), platform_id: 1, order_custom: 1, revenue_custom: 900 - i * 10,
    brand: 'Synthetic Brand', final_brand: 'Synthetic Brand',
  }));
  const { run } = await buildRun(t, { rows: legacyRows, policy: false, legacyGate: true, evidence: false });
  const output = await moduleOutputs(run) as any;
  assert.equal(output.m2.policy, 'legacy');
  assert.equal(output.m2.legacyVerdict, 'PASS');
  assert.deepEqual([output.m2.linksMatchSourceOrder, output.m2.fiveDistinct, output.m2.shortageReason], [null, null, null]);
  assert.deepEqual([output.m1.evidence.fullPage.available, output.m1.evidence.raw.available], [false, false]);
  assert.deepEqual([output.m1.evidence.fullPage.errorCode, output.m1.evidence.raw.errorCode],
    ['LEGACY_EVIDENCE_UNBOUND', 'LEGACY_EVIDENCE_UNBOUND']);
  assert.equal(output.m2.evidence.topProducts.errorCode, 'LEGACY_EVIDENCE_UNBOUND');
  const link = output.m2.links[0];
  assert.deepEqual([link.sourceRank, link.productName, link.groupKey, link.groupingBasis], [null, null, null, null]);
  assert.equal(link.brand, 'Synthetic Brand', 'existing legacy link fields are retained, not reinterpreted');
});

test('module outputs report an uncaptured run as unknown instead of failed or complete', async t => {
  const run = await mkdtemp(join(tmpdir(), 'shopee-module-output-'));
  t.after(() => rm(run, { recursive: true, force: true }));
  await writeFile(join(run, 'request.json'), requestBytes(true));
  const output = await moduleOutputs(run) as any;
  assert.deepEqual([output.m1.captureSuccess, output.m1.dataValid, output.m1.shopeeRowCount], [null, null, null]);
  assert.equal(output.m1.errorCode, 'CAPTURE_FILES_MISSING');
  assert.deepEqual([output.m1.evidence.fullPage.errorCode, output.m1.evidence.raw.errorCode],
    ['CAPTURE_FILES_MISSING', 'CAPTURE_FILES_MISSING']);
  assert.deepEqual([output.m2.links, output.m2.skipped], [[], []]);
  assert.equal(output.m2.errorCode, 'SELECTION_MISSING');
});

test('a shortage is reported with its reason while the captured rows stay visible', async t => {
  const groups = distinct(4).map((row, i) => ({ ...row, revenue_custom: [10_000, 9_900, 9_700, 9_600][i] }));
  const rows = [groups[0]!, groups[1]!, product('DHC Kẽm / DHC Vitamin C', 801, 9_800), groups[2]!, groups[3]!];
  const { run } = await buildRun(t, { rows });
  const output = await moduleOutputs(run) as any;
  assert.equal(output.m2.fiveDistinct, false);
  assert.equal(output.m2.shortageReason, 'PICK_TITLE_GROUP_UNRESOLVED');
  assert.equal(output.m2.errorCode, 'PICK_TITLE_GROUP_UNRESOLVED');
  assert.equal(output.m2.selectedCount, 4);
  assert.equal(output.m2.evidence.topProducts.available, true, 'a business shortage does not hide available evidence');
});

test('a selected source rank outside the pictured panel is an explicit technical M2 error', async t => {
  const duplicates = Array.from({ length: 15 }, (_, i) => ({ ...product('DHC Kẽm 60 viên', 801, 10_000 - i * 10) }));
  const later = ['DHC Vitamin C 60 ngày', 'DHC Biotin 60 ngày', 'DHC Magiê 60 ngày', 'DHC Canxi 60 ngày']
    .map((name, i) => product(name, 801, 9_000 - i * 10));
  const { run } = await buildRun(t, { rows: [...duplicates, ...later], pictured: Array.from({ length: 15 }, (_, i) => i) });
  const output = await moduleOutputs(run) as any;
  assert.equal(output.m2.fiveDistinct, true, 'business predicates stay truthful');
  assert.equal(output.m2.selectedCount, 5);
  assert.equal(output.m2.errorCode, 'EVIDENCE_RANK_NOT_COVERED', 'the uncovered rank is a specific technical failure');
  assert.equal(output.m2.evidence.topProducts.available, false);
});

test('a panel without both native sorting controls cannot certify the selected ranks', async t => {
  const { run } = await buildRun(t, { controls: false });
  const output = await moduleOutputs(run) as any;
  assert.deepEqual([output.m2.fiveDistinct, output.m2.selectedCount], [true, 5]);
  assert.equal(output.m2.evidence.topProducts.available, false);
  assert.equal(output.m2.evidence.topProducts.errorCode, 'EVIDENCE_PRODUCTS_CONTROLS_MISSING');
  assert.equal(output.m2.errorCode, 'EVIDENCE_PRODUCTS_CONTROLS_MISSING');
});

test('raw candidates beyond the pictured panel stay captured and source-ordered', async t => {
  const rows = [...distinct(5), ...Array.from({ length: 15 }, () => product('DHC Kẽm 60 viên', 801, 8_000))];
  const { run } = await buildRun(t, { rows, pictured: Array.from({ length: 15 }, (_, i) => i) });
  const output = await moduleOutputs(run) as any;
  const saved = JSON.parse(await readFile(join(run, 'm2/selection.json'), 'utf8'));
  assert.equal(saved.selectionProof.candidateCount, 20, 'all captured candidates are retained');
  assert.equal(output.m2.selectedCount, 5);
  assert.equal(output.m2.linksMatchSourceOrder, true);
  assert.deepEqual([output.m2.fiveDistinct, output.m2.errorCode], [true, null],
    'chosen ranks inside the pictured panel are covered; unused raw rows do not block M2');
});

test('retained evidence opens only with the exact saved digest', async t => {
  const { run, rawBytes } = await buildRun(t);
  const output = await moduleOutputs(run) as any;
  const raw = await readModuleEvidence(run, 'raw', output.m1.evidence.raw.sha256);
  assert.deepEqual(Buffer.from(raw), Buffer.from(rawBytes));
  const panel = await readModuleEvidence(run, 'top-products', output.m2.evidence.topProducts.sha256);
  assert.equal(Buffer.from(panel).length, output.m2.evidence.topProducts.byteSize);
  await assert.rejects(readModuleEvidence(run, 'top-products', 'b'.repeat(64)),
    (error: any) => error?.code === 'EVIDENCE_HASH_MISMATCH');
});
