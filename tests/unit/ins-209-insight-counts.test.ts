import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBoundedAnalysisGates } from '../../src/modules/analysis/bounded-analysis-gates.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { renderLocatedInsightSection } from '../../src/modules/analysis/report-located-insight-pages.js';
import { nextInsightFixture } from '../helpers/next-insight-fixture.js';
import { boundedAnalysisGatesFixture } from '../helpers/bounded-analysis-gates-fixture.js';

test('U-03 accepted corpus counts identify the codebook revision instead of an owner receipt', () => {
  const output = buildLocatedInsightMethods(nextInsightFixture()).output;
  const html = renderLocatedInsightSection(output, 'I10', { bundleDownload: false });
  assert.match(html ?? '', /Phiên bản bộ mã/);
  assert.match(html ?? '', /synthetic/);
  assert.doesNotMatch(html ?? '', /biên nhận lựa chọn/);
});

test('U-04 current groups derive from source-stated platform and stay counts-only without a policy', () => {
  const input = boundedAnalysisGatesFixture();
  input.semanticsVersion = '1.1.0';
  input.i11!.groupPolicy = null;
  input.i11!.cells = input.i11!.cells.map((cell, index) => ({
    ...cell,
    group: null,
    groupBasis: {
      platform: {
        state: 'SOURCE_STATED', value: index === 0 ? 'Shopee' : 'TikTok Shop',
        source: { logicalPath: 'gate-source.json', sha256: '1'.repeat(64), locator: `/i11/cells/${index}/platform` },
      },
      buyerType: { state: 'NOT_STATED', value: null, source: null },
    },
  }));

  const result = buildBoundedAnalysisGates(input).output.sections.I11;
  assert.deepEqual(result.partitions[0]!.groupOrder, ['Shopee', 'TikTok Shop']);
  assert.equal(result.rates, null, 'aggregate cells without retained text members cannot produce a rate');
  assert.equal(result.differences, null, 'inference remains disabled');
  assert.ok(result.blockers.includes('I11_DIFFERENCES_AND_INFERENCE_DISABLED'));
  assert.ok(!result.blockers.includes('I11_GROUP_POLICY_MISSING'));
  assert.ok(!result.blockers.includes('I11_PUBLICATION_NOT_AUTHORIZED'));
});
