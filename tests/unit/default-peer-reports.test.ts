import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { sync2ReportFixture } from '../helpers/sync2-report-fixture.js';
import type { AutomationClassifiedMetricSnapshot } from '../../contracts/analysis/automation-classified-metric.generated.js';
import type { DefaultMarketPeers } from '../../contracts/analysis/default-market-peers.generated.js';
import { DEFAULT_MARKET_PEER_RULE, verifyDefaultMarketPeers } from '../../src/modules/analysis/default-market-peers.js';
import { calculateMetricScopes, metricLabelFingerprint } from '../../src/modules/analysis/metric-scope-calculator.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

const hash = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');

test('marker-free retained descriptive1.0/1.1 drafts preserve frozen full HTML and semantic bytes for both reports', () => {
  for (const [version, marketHtml, marketSemantic] of [
    ['1.0.0', 'ad13eeefb55c6a7b74666f9a905cb8c4976a62ffc49574b13fb7c5a4fb6aeb5b', '731622684f06cbffe6429ec067ec1f97501927e37cf3a1ce40abf4822f7a87d9'],
    ['1.1.0', 'db9c8203566cd1431eb44d49c52dbbee726f8713c521f89f21cb6dd954030145', '1d0e4f5ea8ee35a4e1c5f1abc7d32ba3b9823b5a0661bfeabe967173b8429d6e'],
  ] as const) {
    const input = sync2ReportFixture(version);
    const market = buildResearchAutomationReport(input, 'MARKET'), insight = buildResearchAutomationReport(input, 'INSIGHT');
    assert.equal(hash(market.html), marketHtml); assert.equal(hash(canonicalJson(market.semantic)), marketSemantic);
    assert.equal(hash(insight.html), '9ec19e38e5ad8b03d8f6eb199f42cefde361fb28dc5e210c50807f19686cc52e');
    assert.equal(hash(canonicalJson(insight.semantic)), '7019d58c4b689709eaffa5d0741f5ab0d0460d45289fc38ef8cdd45070fd06ec');
  }
});

function classified(): AutomationClassifiedMetricSnapshot {
  const input = metricFixture();
  input.records = input.records.slice(0, 2);
  input.records.forEach((row, index) => {
    row.shopId = `shop-${index}`;
    row.label!.group = 'Bình';
    row.label!.contentSha256 = metricLabelFingerprint(input.scope.platform, row);
  });
  const result = calculateMetricScopes(input);
  return { contractVersion: 'automation-classified-metric-v1', result, proofSha256: 'a'.repeat(64),
    binding: { workspaceId: '22222222-2222-4222-8222-222222222222', runId: '11111111-1111-4111-8111-111111111111',
      pairId: 'b'.repeat(64), adoptionId: 'c'.repeat(64), adoptionSha256: 'd'.repeat(64), preparationSha256: 'e'.repeat(64),
      inputSha256: result.inputSha256, sourcePackageId: '33333333-3333-4333-8333-333333333333', scopeSha256: 'f'.repeat(64) },
    selection: { adoptionId: 'c'.repeat(64), receiptIds: ['44444444-4444-4444-8444-444444444444'] } };
}

test('frozen start rule dispatches Metric-only and retained descriptive1.1 Market drafts to one valid default peer', () => {
  for (const detail of [false, true]) {
    const input = { ...sync2ReportFixture() };
    input.start = { ...input.start, defaultPeerRule: { ...DEFAULT_MARKET_PEER_RULE } };
    input.metricClassified = classified();
    if (!detail) delete input.descriptiveMethods;
    input.scope = { ...input.scope, peerProductIds: ['kalodata:owner-added'] };
    const report = buildResearchAutomationReport(input, 'MARKET');
    const semantic = report.semantic as { rendererVersion: string; defaultMarketPeers: DefaultMarketPeers; sections: { sectionId: string; state: string }[] };
    assert.equal(semantic.rendererVersion, 'automation-report-kit-v14');
    assert.equal(semantic.sections.find(row => row.sectionId === 'M07')!.state, 'METHOD_OUTPUT');
    const peers = verifyDefaultMarketPeers(semantic.defaultMarketPeers);
    assert.equal(peers.frames[0]!.totalRevenue, '150');
    assert.equal(peers.frames[0]!.selectedRevenue, '100');
    assert.equal(peers.frames[0]!.selected.length, 1);
    assert.deepEqual(peers.input.ownerAdditions, ['kalodata:owner-added']);
    assert.match(report.html.toString(), /Gian hàng nguồn; chưa rõ thương hiệu/);
    assert.match(report.html.toString(), /Bổ sung của chủ, giữ riêng/);
    assert.deepEqual(providerNameViolations(report.html.toString()), []);
    assert.deepEqual(visibleTextViolations(reportVisibleText(report.html.toString())), []);
    const insight = buildResearchAutomationReport(input, 'INSIGHT');
    assert.equal((insight.semantic as { defaultMarketPeers?: unknown }).defaultMarketPeers, undefined);
    const { defaultPeerRule: _rule, ...markerFreeStart } = input.start;
    assert.deepEqual(insight.html, buildResearchAutomationReport({ ...input, start: markerFreeStart }, 'INSIGHT').html);
  }
});

test('new Market drafts retain explicit absent, zero, missing and incompatible sales outcomes without discovery membership', () => {
  for (const outcome of ['absent', 'zero', 'missing', 'period', 'identity'] as const) {
    const input = { ...sync2ReportFixture() };
    input.start = { ...input.start, defaultPeerRule: { ...DEFAULT_MARKET_PEER_RULE } };
    if (outcome !== 'absent') {
      input.metricClassified = classified();
      const sales = input.metricClassified.result.input;
      if (outcome === 'zero') for (const row of sales.records) row.revenue = { ...row.revenue, state: 'observed_zero', value: '0' };
      if (outcome === 'missing') sales.records[0]!.revenue = { ...sales.records[0]!.revenue, state: 'missing', value: null };
      if (outcome === 'period') for (const row of sales.records) row.measurement.end = '2026-09-14';
      if (outcome === 'identity') sales.records[1]!.listingId = sales.records[0]!.listingId;
    }
    const report = buildResearchAutomationReport(input, 'MARKET');
    const peers = (report.semantic as { defaultMarketPeers: DefaultMarketPeers }).defaultMarketPeers;
    assert.ok(peers.frames.every(frame => frame.selected.length === 0));
    if (outcome === 'absent') { assert.deepEqual(peers.input.records, []); assert.deepEqual(peers.frames, []); }
    else assert.equal(peers.frames[0]!.state, outcome === 'zero' ? 'ZERO_REVENUE' : outcome === 'period' ? 'NO_SALES' : 'INCOMPLETE');
    assert.equal(peers.frames[0]?.totalRevenue ?? null, outcome === 'zero' ? '0' : null);
    assert.match(report.html.toString(), /Bổ sung không thay đổi mẫu số/);
    assert.deepEqual(providerNameViolations(report.html.toString()), []);
  }
});
