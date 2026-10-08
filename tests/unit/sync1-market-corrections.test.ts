import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildMarketReport, computeReaderReportData, lint, READER_SECTION_ANCHORS, verifyReaderReportInput, visibleText } from '../../src/modules/analysis/reader-report/index.js';
import { readerRowsFromMetricWorkbook } from '../../src/modules/analysis/reader-report/metric-rows.js';
import { buildDescriptiveMarketMethods, verifyDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import { describeDescriptiveSection } from '../../src/modules/analysis/research-automation/descriptive-report.js';
import { webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { descriptiveMarketFixture } from '../helpers/descriptive-market-fixture.js';

const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const part = (html: string, n: number): string => visibleText(html.match(new RegExp(`<section id="phan-${n}">[\\s\\S]*?<\\/section>`))?.[0] ?? '');

test('current reader preserves missing versus zero through classification, metrics, ratios, dates and the final gates', async () => {
  const input = sync1ReaderFixture();
  input.rows[0]!.rev = null; input.rows[0]!.units = null; input.rows[0]!.asp = null;
  input.rows[1]!.rev = 0; input.rows[1]!.units = 0; input.rows[1]!.asp = null;
  input.source!.displayedHeadlines.revenueVnd = null;
  input.source!.platformBreakdown.shopee!.displayedRevenueVnd = null;
  const d = computeReaderReportData(input), B = d.bundle;
  assert.equal(B.value('shopee.core.rev'), null);
  assert.equal(B.value('shopee.core.units'), null);
  assert.equal(B.value('shopee.core.asp'), null);
  assert.equal(B.v('shopee.core.rev.zero'), 1);
  assert.equal(B.v('shopee.core.rev.missing'), 1);
  assert.equal(B.value('shopee.seg.A.revShare'), null);
  assert.equal(B.value('shopee.coh.n'), null, 'no dates is unknown, not zero new listings');
  assert.equal(B.value('src.shopee.cover'), null);
  const report = await buildMarketReport(d, sync1Options);
  assert.ok(lint(report.html, { sectionIds: READER_SECTION_ANCHORS }).every(row => row.ok), JSON.stringify(lint(report.html).filter(row => !row.ok)));
  assert.deepEqual(report.narrator.checkHardcoded(report.extraOk).hardcoded, []);
  assert.deepEqual(report.narrator.notInBundle(report.extraOk), []);
  assert.match(part(report.html, 5), /Nhu cầu, đo bằng doanh số \(ước tính\) trong mẫu/);
  assert.match(part(report.html, 5), /Chưa có dữ liệu/);
  assert.equal(report.html.split('<section id="phu-luc">')[1]!.match(/<span data-quote>Bình (nhỏ|lớn)<\/span>/g)?.length, 12, 'all retained rows remain inspectable');
  for (const version of ['1.0.0', '1.1.0'] as const) assert.throws(() => verifyReaderReportInput({ ...input, contractVersion: version }), /sai khuôn|webSnapshot/);
  const zeros = sync1ReaderFixture();
  for (const row of zeros.rows) { row.rev = 0; row.units = 0; row.asp = null; row.start = '2025-01-01'; }
  const z = computeReaderReportData(zeros).bundle;
  assert.equal(z.v('shopee.core.rev'), 0);
  assert.equal(z.value('shopee.core.asp'), null);
  assert.equal(z.v('shopee.coh.n'), 0, 'complete dates with none in period is observed zero');
});

test('workbook blank cells stay null, actual zeros stay zero, and legacy conversion is explicit', () => {
  const result = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2', cells: { E2: null, D2: null } }) });
  assert.equal(result.status, 0, result.stderr.toString());
  const current = readerRowsFromMetricWorkbook(result.stdout, ['shopee']);
  assert.deepEqual([current[0]!.rev, current[0]!.units, current[0]!.asp], [null, null, null]);
  assert.deepEqual([current[1]!.units, current[1]!.asp], [0, null]);
  const legacy = readerRowsFromMetricWorkbook(result.stdout, ['shopee'], { version: '1.0.0' });
  assert.deepEqual([legacy[0]!.rev, legacy[0]!.units, legacy[0]!.asp], [0, 0, 0]);
});

test('new reader has no cross-platform totals or name identity proof; findings and proposals keep unranked evidence', async () => {
  const input = sync1ReaderFixture(), d = computeReaderReportData(input);
  const report = await buildMarketReport(d, sync1Options);
  assert.equal([...d.bundle.m.keys()].some(id => id.startsWith('both.')), false);
  assert.equal(d.bundle.has('brand.bothCount'), false);
  assert.equal(d.bundle.value('src.cover.rev'), null);
  assert.doesNotMatch(part(report.html, 1), /lớn nhất|nhiều.*nhất|nhóm dẫn|hàng đầu/);
  assert.match(part(report.html, 1), /Bình nhỏ.*Bình lớn/);
  assert.match(part(report.html, 1), /Hình 4.1/);
  assert.match(part(report.html, 6), /theo tiêu đề người bán/);
  assert.doesNotMatch(part(report.html, 6), /thương hiệu bán trên cả hai sàn/);
  const twelve = part(report.html, 12);
  assert.doesNotMatch(twelve, /Thứ tự theo doanh thu|Doanh thu liên quan|phương án A/);
  assert.match(twelve, /Thứ tự chỉ theo phụ thuộc dữ liệu/);
  assert.equal(report.html.match(/<section id="phan-12">[\s\S]*?<\/section>/)?.[0].match(/<tbody><tr>|<\/tr><tr>/g)?.length, 3);
  assert.match(twelve, /Người phụ trách đề xuất.*Hạn đề xuất/);
  assert.match(part(report.html, 5), /Mức quan tâm tìm kiếm ghi riêng/);
  assert.match(part(report.html, 5), /01\/01\/2026.*31\/01\/2026/);
  assert.doesNotMatch(part(report.html, 5), /để trống|không đo nhu cầu trực tiếp/);
  const swapped = structuredClone(input);
  swapped.rows.forEach(row => { row.rev = row.rev! * (row.title.includes('lớn') ? 100 : 1); row.asp = row.rev! / row.units!; });
  const other = await buildMarketReport(computeReaderReportData(swapped), sync1Options);
  assert.equal(part(other.html, 12), twelve, 'revenue cannot choose or prioritize proposals');
  assert.ok(lint(report.html, { sectionIds: READER_SECTION_ANCHORS }).every(row => row.ok), JSON.stringify(lint(report.html).filter(row => !row.ok)));
  assert.deepEqual(report.narrator.checkHardcoded(report.extraOk).hardcoded, []);
});

test('nullable web headline derivation accepts and renders missing data only for the new reader contract', async () => {
  const snapshot = JSON.parse(readFileSync(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8'));
  // Clear the first retained headline using the real snapshot contract shape.
  const headline = snapshot.groups.W2_kpi;
  headline.revenue.current.value = null; headline.revenue.current.displayed = '–';
  const input = sync1ReaderFixture(); delete input.source;
  input.webSnapshot = snapshot; input.webSnapshotSha256 = webSnapshotDigest(snapshot);
  const data = computeReaderReportData(input);
  assert.equal(data.input.source!.displayedHeadlines.revenueVnd, null);
  const report = await buildMarketReport(data, sync1Options);
  assert.ok(lint(report.html, { sectionIds: READER_SECTION_ANCHORS }).every(row => row.ok), JSON.stringify(lint(report.html).filter(row => !row.ok)));
  assert.deepEqual(report.narrator.checkHardcoded(report.extraOk).hardcoded, []);
  assert.deepEqual(report.narrator.notInBundle(report.extraOk), []);
  assert.throws(() => computeReaderReportData({ ...input, contractVersion: '1.1.0' }), /thiếu số liệu|sai khuôn/);
});

test('descriptive M05 changes only the versioned interpretation, retains source bytes and replays legacy calculations', () => {
  const fixture = descriptiveMarketFixture();
  const input = { ...fixture.descriptor, sourcePackage: { packageId: '00000000-0000-4000-8000-000000000001', version: 1, manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64) } };
  const legacy = buildDescriptiveMarketMethods(input, { methodVersion: '1.0.0' });
  const current = buildDescriptiveMarketMethods(input);
  assert.equal(current.output.methodVersion, '1.1.0');
  assert.deepEqual(current.output.input, legacy.output.input);
  assert.deepEqual(current.output.sections, legacy.output.sections);
  assert.deepEqual(verifyDescriptiveMarketMethods(JSON.parse(legacy.bytes.toString())).bytes, legacy.bytes);
  const citations = { mark: () => '[source]' };
  const oldHtml = describeDescriptiveSection(legacy.output, 'M05', citations).html;
  const newHtml = describeDescriptiveSection(current.output, 'M05', citations).html;
  assert.match(oldHtml, /không phải nhu cầu hay quy mô thị trường/);
  assert.doesNotMatch(newHtml, /không phải nhu cầu hay quy mô thị trường/);
  assert.match(newHtml, /Nhu cầu, đo bằng doanh số \(ước tính\) trong mẫu/);
  assert.match(newHtml, /Mức quan tâm tìm kiếm ghi riêng/);
  assert.match(newHtml, /2026-01-01.*2026-01-31/);
  assert.match(newHtml, /12 reported searches/);
  assert.notEqual(current.output.methodOutputId, legacy.output.methodOutputId);
  assert.equal(hash(legacy.bytes), 'f9a69c9ea4260c9f62bf951b6940f9f555755a2d84f575412a9508372dc89eed');
  assert.equal(hash(oldHtml), '2db629efe7b5f0533d7db0620f431d4843d3b5cd903ee411220d68bdf6f7ec00');
});

test('legacy reader HTML and metrics replay exact synthetic pre-change bytes', async () => {
  const d = computeReaderReportData(sync1ReaderFixture('1.0.0'));
  const report = await buildMarketReport(d, sync1Options);
  assert.equal(hash(report.html), 'ab0407f429eae2b7ce1d621d1bed076837f47e985ca9f3fe5454759db1838d0a');
  assert.equal(hash(JSON.stringify(d.bundle.toJSON())), '087275ea655be50b577c127fccce8543714dbb20d7712c7a458a34897912f61c');
  const input = sync1ReaderFixture('1.1.0'); delete input.source;
  input.webSnapshot = JSON.parse(readFileSync(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8'));
  input.webSnapshotSha256 = webSnapshotDigest(input.webSnapshot);
  const oldWebData = computeReaderReportData(input), oldWeb = await buildMarketReport(oldWebData, sync1Options);
  assert.equal(hash(oldWeb.html), 'cb35d7fa8b576e0d5e4d23da1f252a60ee6384cad7c8cbaa64579eb862270b34');
  assert.equal(hash(JSON.stringify(oldWebData.bundle.toJSON())), 'b0b9e76445a803c4931719f4f1594fa3f51242f5844411caa4b37baf09f976ca');
});


test('new nullable path retains known platform reconciliation and source monthly evidence without an unsupported combined sum', async () => {
  const snapshot = JSON.parse(readFileSync(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8'));
  const input = sync1ReaderFixture(); delete input.source;
  input.webSnapshot = snapshot; input.webSnapshotSha256 = webSnapshotDigest(snapshot);
  input.rows.filter(row => row.platform === 'tiktok').forEach(row => { row.rev = 10_000_000_000; row.asp = row.rev / row.units!; });
  input.rows[0]!.rev = null; input.rows[0]!.asp = null;
  const data = computeReaderReportData(input);
  assert.deepEqual(data.webReconciliation.map(row => row.check), ['R4']);
  assert.equal(data.webReconciliation[0]!.numbers.tiktok, 60_000_000_000);
  assert.equal('shopee' in data.webReconciliation[0]!.numbers, false, 'missing amount does not claim a complete platform sum');
  const report = await buildMarketReport(data, sync1Options);
  assert.match(part(report.html, 2), /TikTok Shop/);
  assert.match(part(report.html, 3), /Doanh thu theo tháng/);
  assert.ok(report.charts.some(chart => chart.id === 'M03.monthly'));
  const monthlyId = data.webKeys.find(id => /^web\.shopee\.m\.\d/.test(id))!;
  assert.ok(monthlyId);
  assert.ok(part(report.html, 3).includes(data.bundle.f(monthlyId)), 'monthly table retains the known source value');
  assert.match(part(report.html, 7), /Shop A/);
  assert.ok(report.html.includes('Sản phẩm C 500ml'), 'missing sample inputs retain the source product table');
  assert.ok(report.html.includes('Ngành A'), 'missing sample inputs retain the source category table');
  assert.ok(lint(report.html, { sectionIds: READER_SECTION_ANCHORS }).every(row => row.ok), JSON.stringify(lint(report.html).filter(row => !row.ok)));
  assert.deepEqual(report.narrator.checkHardcoded(report.extraOk).hardcoded, []);
  const complete = structuredClone(input); complete.rows[0]!.rev = 1_000_000; complete.rows[0]!.asp = 100_000;
  assert.deepEqual(computeReaderReportData(complete).webReconciliation.map(row => row.check), ['R4']);
});
