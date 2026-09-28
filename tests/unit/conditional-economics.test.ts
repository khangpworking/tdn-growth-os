import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateConditionalEconomics, replayConditionalEconomics } from '../../src/modules/analysis/conditional-economics.js';
import { conditionalEconomicsFixture } from '../helpers/conditional-economics-fixture.js';

// Owner-boundary tests use hand-calculated synthetic values. They exercise the
// public production entry point, not a test-only seam or an implementation helper.
function output(result: ReturnType<typeof calculateConditionalEconomics>, key: 'contributionPerUnit' | 'pmin' | 'cmax' | 'mmax') {
  const item = result.outputs[key];
  if (!item) throw new Error(`fixture did not request ${key}`);
  return item;
}

test('independent hand calculation preserves exact conditional outputs and declared boundaries', () => {
  const result = calculateConditionalEconomics(conditionalEconomicsFixture());
  assert.equal(result.status, 'SCENARIO');
  assert.equal(result.approvalState, 'UNREVIEWED');
  assert.equal(result.evidenceState, 'DECLARED_UNVERIFIED');
  assert.equal(result.sourceAuthenticity, 'NOT_AUTHENTICATED');
  assert.deepEqual(output(result, 'contributionPerUnit').exactValue, { numerator: '52600', denominator: '1', reduced: true });
  assert.equal(output(result, 'contributionPerUnit').displayValue?.value, '52600.00');
  assert.deepEqual(output(result, 'pmin').exactValue, { numerator: '18600000', denominator: '157', reduced: true });
  assert.equal(output(result, 'pmin').displayValue?.value, '118472');
  assert.deepEqual(output(result, 'cmax').exactValue, { numerator: '82600', denominator: '1', reduced: true });
  assert.equal(output(result, 'cmax').displayValue?.value, '82600.00');
  assert.deepEqual(output(result, 'mmax').exactValue, { numerator: '42600', denominator: '1', reduced: true });
  assert.equal(output(result, 'mmax').displayValue?.value, '42600.00');
  assert.equal(output(result, 'pmin').displayValue?.roundingVersion, 'CEIL_INTEGER_VND_V1');
  assert.equal(output(result, 'cmax').displayValue?.roundingVersion, 'HALF_EVEN_DECIMAL_2_VND_V1');
  assert.equal(result.inputProvenance.cogsPerUnit?.kind, 'OWNER_DECLARED');
  assert.equal(result.inputProvenance.otherVariableCostPerUnit?.kind, 'SOURCE_DECLARED');
  assert.equal(result.inputProvenance.sharedMarketingPerUnit?.kind, 'SCENARIO_ASSUMPTION');
  assert.equal(result.feeBindings.commissionRate.categoryPath, '/marketplace/category/food');
  assert.ok(result.modeledTerms.includes('processingFeePerOrder'));
  assert.equal(result.excludedTerms.sellerBusinessTax.status, 'NOT_MODELED');
  assert.equal(result.excludedTerms.sellerBusinessTax.value, null);
});

test('processing fee is divided by positive units per order under the same percentage fee base', () => {
  const input = conditionalEconomicsFixture();
  input.inputs.unitsPerOrder!.value = '3';
  const result = calculateConditionalEconomics(input);
  assert.deepEqual(output(result, 'contributionPerUnit').exactValue, { numerator: '54600', denominator: '1', reduced: true });
  assert.deepEqual(output(result, 'pmin').exactValue, { numerator: '18200000', denominator: '157', reduced: true });
  assert.equal(output(result, 'pmin').displayValue?.value, '115924');
  assert.equal(output(result, 'cmax').displayValue?.value, '84600.00');
  assert.equal(output(result, 'mmax').displayValue?.value, '44600.00');
});

test('requested output selection is explicit: unrequested calculations are omitted', () => {
  const input = conditionalEconomicsFixture();
  input.requestedOutputs = ['cmax'];
  const result = calculateConditionalEconomics(input);
  assert.deepEqual(Object.keys(result.outputs), ['cmax']);
  assert.equal(output(result, 'cmax').state, 'AVAILABLE');
  assert.equal(result.outputs.pmin, undefined);
});

test('solved variables are not required for their own maxima, while null remains unavailable rather than zero', () => {
  const noCogs = conditionalEconomicsFixture();
  noCogs.inputs.cogsPerUnit = null;
  const cmax = calculateConditionalEconomics(noCogs);
  assert.equal(output(cmax, 'cmax').state, 'AVAILABLE');
  assert.equal(output(cmax, 'mmax').state, 'UNAVAILABLE');
  assert.equal(output(cmax, 'mmax').exactValue, null);
  assert.ok(output(cmax, 'mmax').missingInputs.includes('inputs.cogsPerUnit'));
  assert.equal(output(cmax, 'contributionPerUnit').state, 'UNAVAILABLE');

  const noMarketing = conditionalEconomicsFixture();
  noMarketing.inputs.sharedMarketingPerUnit = null;
  const mmax = calculateConditionalEconomics(noMarketing);
  assert.equal(output(mmax, 'mmax').state, 'AVAILABLE');
  assert.equal(output(mmax, 'cmax').state, 'UNAVAILABLE');
  assert.equal(output(mmax, 'cmax').exactValue, null);
  assert.ok(output(mmax, 'cmax').missingInputs.includes('inputs.sharedMarketingPerUnit'));
});

test('every required cost and fee input is a gate, and omitted target only blocks threshold outputs', () => {
  const noOtherCost = conditionalEconomicsFixture();
  noOtherCost.inputs.otherVariableCostPerUnit = null;
  const unavailable = calculateConditionalEconomics(noOtherCost);
  for (const key of ['contributionPerUnit', 'pmin', 'cmax', 'mmax'] as const) {
    assert.equal(output(unavailable, key).state, 'UNAVAILABLE');
    assert.equal(output(unavailable, key).exactValue, null);
    assert.ok(output(unavailable, key).missingInputs.includes('inputs.otherVariableCostPerUnit'));
  }

  const noTarget = conditionalEconomicsFixture();
  noTarget.inputs.targetContributionPerUnit = null;
  const contributionOnly = calculateConditionalEconomics(noTarget);
  assert.equal(output(contributionOnly, 'contributionPerUnit').state, 'AVAILABLE');
  assert.equal(output(contributionOnly, 'pmin').state, 'UNAVAILABLE');
  assert.equal(output(contributionOnly, 'cmax').state, 'UNAVAILABLE');
  assert.equal(output(contributionOnly, 'mmax').state, 'UNAVAILABLE');

  const noTransactionRate = conditionalEconomicsFixture();
  noTransactionRate.fees.transactionRate = null;
  const noRate = calculateConditionalEconomics(noTransactionRate);
  assert.equal(output(noRate, 'contributionPerUnit').state, 'UNAVAILABLE');
  assert.ok(output(noRate, 'contributionPerUnit').missingInputs.includes('fees.transactionRate'));
  assert.equal(noRate.inputProvenance.transactionRate, null);
});

test('negative Cmax and Mmax remain visible with infeasible warnings instead of being clamped', () => {
  const input = conditionalEconomicsFixture();
  input.inputs.pricePerUnit!.value = '1000';
  input.inputs.cogsPerUnit!.value = '1000';
  input.inputs.otherVariableCostPerUnit!.value = '1000';
  input.inputs.sharedMarketingPerUnit!.value = '1000';
  input.inputs.targetContributionPerUnit!.value = '1000';
  input.fees.processingFeePerOrder!.value = '3000';
  const result = calculateConditionalEconomics(input);
  assert.deepEqual(output(result, 'cmax').exactValue, { numerator: '-5215', denominator: '1', reduced: true });
  assert.equal(output(result, 'cmax').displayValue?.value, '-5215.00');
  assert.deepEqual(output(result, 'cmax').warnings, ['INFEASIBLE_THRESHOLD']);
  assert.deepEqual(output(result, 'mmax').exactValue, { numerator: '-5215', denominator: '1', reduced: true });
  assert.deepEqual(output(result, 'mmax').warnings, ['INFEASIBLE_THRESHOLD']);
  assert.deepEqual(output(result, 'contributionPerUnit').warnings, ['NEGATIVE_CONTRIBUTION']);
});

test('negative target contribution is retained as a declared decimal and can yield a non-positive Pmin', () => {
  const input = conditionalEconomicsFixture();
  input.inputs.targetContributionPerUnit!.value = '-100000';
  const result = calculateConditionalEconomics(input);
  assert.deepEqual(output(result, 'pmin').exactValue, { numerator: '-5400000', denominator: '157', reduced: true });
  assert.equal(output(result, 'pmin').displayValue?.value, '-34394');
  assert.deepEqual(output(result, 'pmin').warnings, ['NON_POSITIVE_PRICE_THRESHOLD']);
});

test('negative prices or costs and a non-positive fee denominator are rejected', () => {
  const negativePrice = conditionalEconomicsFixture();
  negativePrice.inputs.pricePerUnit!.value = '-1';
  assert.throws(() => calculateConditionalEconomics(negativePrice), /Invalid conditional economics input/);

  const negativeCost = conditionalEconomicsFixture();
  negativeCost.inputs.cogsPerUnit!.value = '-1';
  assert.throws(() => calculateConditionalEconomics(negativeCost), /Invalid conditional economics input/);

  const zeroDenominator = conditionalEconomicsFixture();
  zeroDenominator.fees.commissionRate!.value = '0.6';
  zeroDenominator.fees.transactionRate!.value = '0.4';
  assert.throws(() => calculateConditionalEconomics(zeroDenominator), /FEE_DENOMINATOR_NON_POSITIVE/);

  const unconfirmedCategory = conditionalEconomicsFixture();
  unconfirmedCategory.feeBindings.transactionRate.bindingState = 'UNCONFIRMED';
  assert.throws(() => calculateConditionalEconomics(unconfirmedCategory), /FEE_CATEGORY_UNCONFIRMED/);
});

test('canonical input identity supports replay and changes when a declared input changes', () => {
  const input = conditionalEconomicsFixture();
  const first = calculateConditionalEconomics(input);
  assert.deepEqual(replayConditionalEconomics(structuredClone(input), structuredClone(first)), first);

  const changedInput = conditionalEconomicsFixture();
  changedInput.inputs.pricePerUnit!.value = '160001';
  const second = calculateConditionalEconomics(changedInput);
  assert.notEqual(first.inputSha256, second.inputSha256);
  assert.throws(() => replayConditionalEconomics(changedInput, first), /CONDITIONAL_ECONOMICS_REPLAY_MISMATCH/);
});

