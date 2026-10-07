import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatePageIndexBalance, PageIndexBalanceError } from '../../src/modules/analysis/pageindex-balance.js';

test('balance subtracts indexed pages and prorated active pages above the free allowance', () => {
  const estimate = estimatePageIndexBalance({
    startingCreditMicroDollars: 10_000_000,
    indexedPagesTotal: 100,
    activePages: 1200,
    activeMonthFraction: 0.5,
  });
  // 100 * $0.01 = $1.00; (1200 - 1000) * $0.001 * 0.5 = $0.10.
  assert.equal(estimate.indexedCostMicroDollars, 1_000_000);
  assert.equal(estimate.activeCostMicroDollars, 100_000);
  assert.equal(estimate.estimatedMonthlyCostMicroDollars, 200_000);
  assert.equal(estimate.balanceMicroDollars, 8_900_000);
  assert.equal(estimate.state, 'OK');
  assert.equal(estimate.lowBalance, false);
});

test('first 1000 active pages are free', () => {
  const estimate = estimatePageIndexBalance({
    startingCreditMicroDollars: 5_000_000, indexedPagesTotal: 0, activePages: 1000,
  });
  assert.equal(estimate.activeCostMicroDollars, 0);
  assert.equal(estimate.estimatedMonthlyCostMicroDollars, 0);
  assert.equal(estimate.state, 'OK');
});

test('WARNING at max(20%, $2) and BLOCKED at $0.50', () => {
  // 20% of $10 is $2, so the absolute $2 floor binds here.
  assert.equal(estimatePageIndexBalance({ startingCreditMicroDollars: 10_000_000, indexedPagesTotal: 800, activePages: 0 }).state, 'WARNING');
  // 20% of $100 is $20, so the fraction binds here.
  const fraction = estimatePageIndexBalance({ startingCreditMicroDollars: 100_000_000, indexedPagesTotal: 7900, activePages: 0 });
  assert.equal(fraction.balanceMicroDollars, 21_000_000);
  assert.equal(fraction.state, 'OK');
  const warning = estimatePageIndexBalance({ startingCreditMicroDollars: 100_000_000, indexedPagesTotal: 8100, activePages: 0 });
  assert.equal(warning.balanceMicroDollars, 19_000_000);
  assert.equal(warning.state, 'WARNING');
  assert.equal(warning.lowBalance, true);
  // BLOCKED wins over WARNING at $0.50.
  const blocked = estimatePageIndexBalance({ startingCreditMicroDollars: 10_000_000, indexedPagesTotal: 960, activePages: 0 });
  assert.equal(blocked.balanceMicroDollars, 400_000);
  assert.equal(blocked.state, 'BLOCKED');
  assert.equal(blocked.lowBalance, true);
});

test('rates and thresholds are configurable', () => {
  const estimate = estimatePageIndexBalance({
    startingCreditMicroDollars: 1_000_000, indexedPagesTotal: 1, activePages: 0,
    config: { indexedCostMicroDollarsPerPage: 100_000, blockedMicroDollars: 950_000, warningAbsoluteMicroDollars: 950_000, warningFraction: 1 },
  });
  assert.equal(estimate.balanceMicroDollars, 900_000);
  assert.equal(estimate.state, 'BLOCKED');
});

test('invalid inputs raise a domain error', () => {
  for (const input of [
    { startingCreditMicroDollars: -1, indexedPagesTotal: 0, activePages: 0 },
    { startingCreditMicroDollars: 1.5, indexedPagesTotal: 0, activePages: 0 },
    { startingCreditMicroDollars: 100, indexedPagesTotal: 0, activePages: 0, activeMonthFraction: 2 },
    { startingCreditMicroDollars: 100, indexedPagesTotal: 0, activePages: 0, activeMonthFraction: Number.NaN },
    { startingCreditMicroDollars: 100, indexedPagesTotal: 0, activePages: 0, config: { warningFraction: 0 } },
  ]) {
    assert.throws(() => estimatePageIndexBalance(input), error => error instanceof PageIndexBalanceError && error.code === 'INVALID_BALANCE_INPUT');
  }
});
