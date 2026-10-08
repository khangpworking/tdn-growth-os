import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { sync2ReportFixture } from '../helpers/sync2-report-fixture.js';

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
