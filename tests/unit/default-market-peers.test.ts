import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { DefaultMarketPeers } from '../../contracts/analysis/default-market-peers.generated.js';
import type { MetricScopeInput } from '../../contracts/analysis/metric-scope-input.generated.js';
import { DEFAULT_MARKET_PEER_RULE, classifiedMetricDefaultPeers, deriveDefaultMarketPeers, verifyDefaultMarketPeers } from '../../src/modules/analysis/default-market-peers.js';
import { buildMarketReport, computeReaderReportData, lint, READER_SECTION_ANCHORS, visibleText } from '../../src/modules/analysis/reader-report/index.js';
import { buildDescriptiveMarketMethods, verifyDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { descriptiveMarketFixture } from '../helpers/descriptive-market-fixture.js';

type Input = DefaultMarketPeers['input'];
type Frame = Input['frames'][number];
const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
function fixture(): Input {
  const frame: Frame = { platform: 'shopee', group: 'Bình', sampleKey: 'sample-a',
    period: { start: '2026-01-01', end: '2026-01-31' }, unit: 'VND', membershipBasis: 'frozen-synthetic-group-rule' };
  return { rule: { ...DEFAULT_MARKET_PEER_RULE }, ownerAdditions: ['owner-only-listing'], frames: [frame],
    records: ['Alpha', 'Beta', 'Gamma', 'Delta'].map((brand, i) => ({
      platform: frame.platform, group: frame.group, membership: 'IN_GROUP' as const, unit: 'VND', sampleKey: frame.sampleKey, period: frame.period,
      listingId: `listing-${i}`, title: `Bình ${brand}`, brandLabel: brand, shopId: `shop-${i}`, shopLabel: `Gian hàng ${brand}`,
      source: { sourceSha256: 'a'.repeat(64), locator: `/sales/${i}` }, revenue: '25',
    })),
  };
}

test('frozen rule reaches the exact 50% boundary with stable ties and separate owner additions', () => {
  const input = fixture(), snapshot = deriveDefaultMarketPeers(input), frame = snapshot.frames[0]!;
  assert.deepEqual(frame.selected.map(member => member.identity.label), ['Alpha', 'Beta']);
  assert.equal(frame.totalRevenue, '100'); assert.equal(frame.selectedRevenue, '50');
  assert.equal(frame.eligible.length, 4);
  assert.deepEqual(snapshot.input.ownerAdditions, ['owner-only-listing']);
  assert.ok(!frame.members.some(member => member.identity.label === 'owner-only-listing'));
  const reversed = structuredClone(input); reversed.records.reverse();
  assert.deepEqual(deriveDefaultMarketPeers(reversed).frames, snapshot.frames);
  assert.deepEqual(verifyDefaultMarketPeers(JSON.parse(JSON.stringify(snapshot))), snapshot);
  const different = structuredClone(input); different.ownerAdditions.push('another-addition');
  assert.deepEqual(deriveDefaultMarketPeers(different).frames, snapshot.frames);
  assert.throws(() => deriveDefaultMarketPeers({ ...input, rule: { ...input.rule, thresholdPercent: 49 } }), /INVALID|UNSUPPORTED/);
  const corrupted = structuredClone(snapshot); corrupted.frames[0]!.selectedRevenue = '51';
  assert.throws(() => verifyDefaultMarketPeers(corrupted), /REPLAY_MISMATCH/);
});

test('selection uses exact decimals beyond Number precision and stops at the first compatible prefix', () => {
  const input = fixture();
  input.records[0]!.revenue = '9007199254740993.01';
  input.records[1]!.revenue = '9007199254740993.00';
  input.records.splice(2);
  const result = deriveDefaultMarketPeers(input).frames[0]!;
  assert.equal(result.totalRevenue, '18014398509481986.01');
  assert.equal(result.selectedRevenue, '9007199254740993.01');
  assert.deepEqual(result.selected.map(member => member.identity.label), ['Alpha']);
});

test('unknown brands fall back to source-backed shop identities; ambiguous brands or shops stay explicit', () => {
  const input = fixture();
  input.records[0]!.brandLabel = null;
  const snapshot = deriveDefaultMarketPeers(input), fallback = snapshot.frames[0]!.members.find(member => member.identity.kind === 'SHOP')!;
  assert.equal(fallback.identity.key, JSON.stringify(['SHOP', 'shop-0']));
  assert.deepEqual(fallback.identity.source, input.records[0]!.source);
  const ambiguous = structuredClone(input); ambiguous.records[0]!.shopId = null;
  assert.equal(deriveDefaultMarketPeers(ambiguous).frames[0]!.state, 'INCOMPLETE');
  const brand = structuredClone(input); brand.records[1]!.title = 'Bình không nêu nhãn';
  assert.ok(deriveDefaultMarketPeers(brand).frames[0]!.excluded.some(row => row.reason === 'PEER_IDENTITY_AMBIGUOUS'));
});

test('missing differs from zero; unknown membership and absent lineage cannot fabricate group coverage', () => {
  const input = fixture();
  for (const row of input.records) row.revenue = '0';
  const zeros = deriveDefaultMarketPeers(input).frames[0]!;
  assert.equal(zeros.state, 'ZERO_REVENUE'); assert.equal(zeros.totalRevenue, '0'); assert.deepEqual(zeros.selected, []);
  for (const field of ['revenue', 'group', 'source'] as const) {
    const missing = fixture(); missing.records[0]![field] = null;
    const result = deriveDefaultMarketPeers(missing).frames[0]!;
    assert.equal(result.state, 'INCOMPLETE'); assert.equal(result.totalRevenue, null); assert.deepEqual(result.selected, []);
    assert.equal(result.excluded.length, 1);
  }
  const empty = fixture(); empty.records = [];
  assert.equal(deriveDefaultMarketPeers(empty).frames[0]!.state, 'NO_SALES');
});

test('different periods, platforms and frames are excluded; identical names never join across platforms', () => {
  const input = fixture(), sourceFrame = input.frames[0]!;
  const other = structuredClone(sourceFrame); other.platform = 'tiktok'; other.sampleKey = 'sample-b';
  const otherRows = structuredClone(input.records);
  for (const row of otherRows) { row.platform = 'tiktok'; row.sampleKey = 'sample-b'; row.revenue = '1000'; }
  input.frames.push(other);
  const mismatches = input.records.slice(0, 3).map(row => structuredClone(row));
  mismatches[0]!.platform = 'tiktok'; mismatches[1]!.sampleKey = 'another-frame'; mismatches[2]!.period!.end = '2026-02-01';
  for (const row of mismatches) row.revenue = '1000000';
  input.records.push(...mismatches, ...otherRows);
  const result = deriveDefaultMarketPeers(input);
  const shopee = result.frames.find(frame => frame.frame.platform === 'shopee')!;
  const tiktok = result.frames.find(frame => frame.frame.platform === 'tiktok')!;
  assert.equal(shopee.totalRevenue, '100'); assert.equal(tiktok.totalRevenue, '4000');
  assert.equal(shopee.excluded.filter(row => row.reason === 'PLATFORM_MISMATCH').length, 5);
  assert.equal(shopee.excluded.filter(row => row.reason === 'FRAME_MISMATCH').length, 1);
  assert.equal(shopee.excluded.filter(row => row.reason === 'PERIOD_MISMATCH').length, 1);
  assert.equal(result.frames.length, 2); assert.equal('totalRevenue' in result, false);
});

test('only exact source-reference duplicates collapse; conflicting refs and overlapping listing identities block selection', () => {
  const input = fixture(); input.records.push(structuredClone(input.records[0]!));
  const exact = deriveDefaultMarketPeers(input).frames[0]!;
  assert.equal(exact.totalRevenue, '100'); assert.equal(exact.excluded[0]!.reason, 'EXACT_REFERENCE_DUPLICATE');
  input.records.at(-1)!.revenue = '999';
  assert.equal(deriveDefaultMarketPeers(input).frames[0]!.state, 'INCOMPLETE');
  const overlap = fixture(); overlap.records[1]!.listingId = overlap.records[0]!.listingId;
  assert.ok(deriveDefaultMarketPeers(overlap).frames[0]!.excluded.some(row => row.reason === 'LISTING_IDENTITY_AMBIGUOUS'));
});

test('classified Metric adapter consumes retained group/source membership and never guesses brands or uses unknown groups', () => {
  const source = { sourceSha256: 'a'.repeat(64), locator: 'Sheet1!A2:T2' };
  const sales: MetricScopeInput = {
    contractVersion: '1.0.0', profileId: 'synthetic-profile', labelCodebookVersion: 'synthetic-groups-v1', wideUnknownPolicy: 'exclude',
    scope: { key: 'sample-a', platform: 'shopee', selection: 'UNSPECIFIED', start: '2026-01-01', end: '2026-01-31', periodBasis: 'Declared synthetic export', acquiredAt: null },
    sources: [{ sha256: source.sourceSha256, label: 'Synthetic rows', representationRole: 'primary', evidenceFamily: 'synthetic-sales', provenanceBasis: 'Synthetic fixture' }],
    records: [100, 60, 40].map((revenue, i) => ({
      listingId: `listing-${i}`, shopId: `shop-${i}`, title: 'Seller mentions Alpha', category: 'Bình', source: { ...source, locator: `/rows/${i}` },
      revenue: { state: 'observed_value', value: String(revenue), precision: 'estimated', source: { ...source, locator: `/rows/${i}/revenue` }, displayedValue: null },
      units: { state: 'observed_value', value: '2', precision: 'estimated', source: { ...source, locator: `/rows/${i}/units` }, displayedValue: null },
      label: { classification: 'CORE_CANDIDATE', group: 'Bình', contentSha256: 'b'.repeat(64), methodVersion: 'groups-v1', source, adjudication: 'human' },
      measurement: { profileId: 'synthetic-profile', scopeKey: 'sample-a', platform: 'shopee', selection: 'UNSPECIFIED', start: '2026-01-01', end: '2026-01-31', currency: 'VND' },
    })),
  };
  const result = classifiedMetricDefaultPeers(sales, { ...DEFAULT_MARKET_PEER_RULE }, ['owner-extra']);
  assert.equal(result.frames[0]!.selectedRevenue, '100');
  assert.equal(result.frames[0]!.selected[0]!.identity.kind, 'SHOP');
  assert.deepEqual(result.input.ownerAdditions, ['owner-extra']);
  assert.deepEqual(result.frames[0]!.selected[0]!.sources, [sales.records[0]!.revenue.source]);
  sales.records[1]!.label = null;
  assert.equal(classifiedMetricDefaultPeers(sales, { ...DEFAULT_MARKET_PEER_RULE }, []).frames[0]!.state, 'INCOMPLETE');
  for (const row of sales.records) row.label = null;
  assert.deepEqual(classifiedMetricDefaultPeers(sales, { ...DEFAULT_MARKET_PEER_RULE }, []).frames, []);
});

test('new reader M07 shows retained default peers, shop fallback and owner additions in both rendering paths', async () => {
  for (const nullable of [false, true]) {
    const input = { ...sync1ReaderFixture(), contractVersion: '1.3.0', peerRule: { ...DEFAULT_MARKET_PEER_RULE }, ownerPeerProductIds: ['owner-extra'] };
    for (const row of input.rows) { row.brand = '(không ghi)'; }
    if (nullable) input.rows[0]!.units = null;
    const data = computeReaderReportData(input), built = await buildMarketReport(data, sync1Options);
    const m07 = visibleText(built.html.match(/<section id="phan-7">[\s\S]*?<\/section>/)?.[0] ?? '');
    assert.ok(data.defaultMarketPeers!.frames.every(frame => frame.state === 'SELECTED'));
    assert.match(m07, /Đối thủ mặc định/); assert.match(m07, /theo danh tính, không xếp ưu tiên/);
    assert.match(m07, /Gian hàng nguồn; chưa rõ thương hiệu/); assert.match(m07, /Bổ sung của chủ, giữ riêng.*owner-extra/);
    assert.doesNotMatch(m07, /Nhóm đối thủ để so trực tiếp chưa chốt|Chưa có tập đối thủ đã đóng băng/);
    assert.ok(lint(built.html, { sectionIds: READER_SECTION_ANCHORS }).every(row => row.ok), JSON.stringify(lint(built.html).filter(row => !row.ok)));
    assert.deepEqual(built.narrator.checkHardcoded(built.extraOk).hardcoded, []);
    assert.deepEqual(built.narrator.notInBundle(built.extraOk), []);
    const missing = structuredClone(input); missing.rows[0]!.rev = null;
    const blocked = computeReaderReportData(missing);
    assert.ok(blocked.defaultMarketPeers!.frames.some(frame => frame.state === 'INCOMPLETE'));
    assert.ok(blocked.defaultMarketPeers!.frames.some(frame => frame.state === 'SELECTED'), 'unaffected platform/group remains usable');
  }
});

test('reader peer identities use literal source brand labels rather than inferred alias joins', () => {
  const input = { ...sync1ReaderFixture(), contractVersion: '1.3.0', peerRule: { ...DEFAULT_MARKET_PEER_RULE } };
  input.profile.brandAlias = { alpha: 'Merged name', beta: 'Merged name' };
  for (const row of input.rows) { row.brand = row.i % 2 ? 'Beta' : 'Alpha'; row.title += ` ${row.brand}`; }
  const data = computeReaderReportData(input);
  assert.ok(data.rows.every(row => row.brand === 'Merged name'), 'existing display aliases remain separate from default identity policy');
  assert.ok(data.defaultMarketPeers!.frames.every(frame => frame.state === 'SELECTED'));
  assert.ok(data.defaultMarketPeers!.frames.flatMap(frame => frame.members).every(member => ['Alpha', 'Beta'].includes(member.identity.label)));
});

test('retained reader1.2 positive/nullable and descriptive1.1 bytes remain unchanged alongside legacy tests', async () => {
  for (const [state, html, metrics] of [
    ['positive', 'c45ee04895526bb20d5510f8a6dd1c3de37611e79a83d4ca5c172fe14059edb4', '06ca29038c3887b9267d5b0e481ada0983443688ce04efaa4a58dcc46ff50876'],
    ['nullable', '60a02aebf8351c22f1f4524c9f2c65410db2f08869ea1396d5815b8f2c8bfe25', '276b583a99b20c773fafdbb3166f536d056c05a3de8cf88bc3533ecdf48ed0e8'],
  ]) {
    const input = sync1ReaderFixture();
    if (state === 'nullable') { input.rows[0]!.rev = null; input.rows[0]!.units = null; input.rows[0]!.asp = null; }
    const data = computeReaderReportData(input), built = await buildMarketReport(data, sync1Options);
    assert.equal(data.defaultMarketPeers, null); assert.equal(hash(built.html), html);
    assert.equal(hash(JSON.stringify(data.bundle.toJSON())), metrics);
  }
  const fixture = descriptiveMarketFixture();
  const input = { ...fixture.descriptor, sourcePackage: { packageId: '00000000-0000-4000-8000-000000000001', version: 1, manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64) } };
  assert.equal(hash(buildDescriptiveMarketMethods(input, { methodVersion: '1.1.0' }).bytes), 'ff5dd8500ad8faad17ea16226427f620586b6e232851805d7e0d141d2e911940');
});

test('descriptive1.2 retains the default rule without fabricating compatible groups from detail records; legacy method versions reject new policy', () => {
  const fixture = descriptiveMarketFixture();
  const input = { ...fixture.descriptor, peerSet: null, defaultPeerRule: { ...DEFAULT_MARKET_PEER_RULE },
    sourcePackage: { packageId: '00000000-0000-4000-8000-000000000001', version: 1, manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64) } };
  const built = buildDescriptiveMarketMethods(input);
  assert.equal(built.output.methodVersion, '1.2.0');
  assert.deepEqual(built.output.input.defaultPeerRule, DEFAULT_MARKET_PEER_RULE);
  assert.deepEqual(built.output.sections.M07.comparisons, []);
  assert.ok(built.output.sections.M07.blockers.includes('M07_FROZEN_SALES_GROUP_MEMBERSHIP_REQUIRED'));
  assert.deepEqual(verifyDescriptiveMarketMethods(JSON.parse(built.bytes.toString())).bytes, built.bytes);
  assert.throws(() => buildDescriptiveMarketMethods(input, { methodVersion: '1.1.0' }), /METHOD_VERSION_MISMATCH/);
  const { defaultPeerRule: _rule, ...withoutRule } = input;
  assert.throws(() => buildDescriptiveMarketMethods(withoutRule, { methodVersion: '1.2.0' }), /METHOD_VERSION_MISMATCH/);
});
