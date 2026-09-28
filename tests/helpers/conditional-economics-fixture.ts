import type { ConditionalEconomicsInput, Provenance } from '../../contracts/analysis/conditional-economics-input.generated.js';

const SOURCE_REF = { artifactSha256: 'a'.repeat(64), locator: 'retained-source://economics/conditional-v13#rates' };

function provenance(kind: Provenance['kind'], label: string, sourceRef = kind === 'SOURCE_DECLARED' ? SOURCE_REF : null): Provenance {
  return { kind, label, note: `${label} is declared for this synthetic scenario`, sourceRef };
}

function nonNegative(value: string, kind: Provenance['kind'] = 'SCENARIO_ASSUMPTION', label = 'scenario value') {
  return { value, provenance: provenance(kind, label) };
}

function decimal(value: string, kind: Provenance['kind'] = 'SCENARIO_ASSUMPTION', label = 'scenario value') {
  return { value, provenance: provenance(kind, label) };
}

function sourceBinding(label: string, categoryPath: string) {
  return { categoryPath, bindingState: 'ASSUMED_EXACT_MATCH' as const, provenance: provenance('SOURCE_DECLARED', label) };
}

function notModeled(label: string) {
  return { status: 'NOT_MODELED' as const, value: null, provenance: provenance('SCENARIO_ASSUMPTION', label), note: `${label} is intentionally not modeled` };
}

/** Synthetic-only fixture; it is not official evidence and is never imported by production code. */
export function conditionalEconomicsFixture(): ConditionalEconomicsInput {
  return {
    contractVersion: '1.0.0',
    methodVersion: 'conditional-economics-v1',
    scenarioId: 'synthetic-fixed-fee-base',
    currency: 'VND',
    unitBasis: 'VND_PER_UNIT',
    requestedOutputs: ['contributionPerUnit', 'pmin', 'cmax', 'mmax'],
    feeBasePolicy: { percentageBase: 'N_TIMES_PRICE_PER_ORDER', processingBase: 'PER_DELIVERED_ORDER' },
    fees: {
      commissionRate: nonNegative('0.155', 'SOURCE_DECLARED', 'marketplace commission rate'),
      transactionRate: nonNegative('0.06', 'OWNER_DECLARED', 'transaction rate'),
      processingFeePerOrder: nonNegative('3000', 'SCENARIO_ASSUMPTION', 'processing fee per delivered order'),
    },
    feeBindings: {
      commissionRate: sourceBinding('commission category rate', '/marketplace/category/food'),
      transactionRate: sourceBinding('transaction category rate', '/marketplace/category/food'),
      processingFeePerOrder: sourceBinding('processing fee category rate', '/marketplace/category/food'),
    },
    inputs: {
      pricePerUnit: nonNegative('160000', 'OWNER_DECLARED', 'scenario price'),
      cogsPerUnit: nonNegative('50000', 'OWNER_DECLARED', 'unit COGS'),
      otherVariableCostPerUnit: nonNegative('10000', 'SOURCE_DECLARED', 'other variable cost'),
      sharedMarketingPerUnit: nonNegative('10000', 'SCENARIO_ASSUMPTION', 'shared marketing allocation'),
      targetContributionPerUnit: decimal('20000', 'OWNER_DECLARED', 'target contribution'),
      unitsPerOrder: { value: '1', provenance: provenance('SCENARIO_ASSUMPTION', 'units per delivered order') },
    },
    excludedTerms: {
      sellerBusinessTax: notModeled('seller business tax'),
      fixedOverhead: notModeled('fixed overhead'),
      returnsRefunds: notModeled('returns and refunds'),
      vouchersDiscounts: notModeled('vouchers and discounts'),
      shippingSubsidy: notModeled('shipping subsidy'),
      settlementAdjustments: notModeled('settlement adjustments'),
      affiliateOrOtherFees: notModeled('affiliate and other fees'),
      demandConversion: notModeled('demand conversion'),
      inventoryCapital: notModeled('inventory capital'),
    },
  };
}
