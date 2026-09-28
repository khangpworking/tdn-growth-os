import type { TabletQuoteInput, Provenance } from '../../contracts/analysis/tablet-quote-input.generated.js';

const SOURCE_REF = {
  artifactSha256: 'b'.repeat(64),
  locator: 'retained-source://Comparable_Prices_v13_2026-09-21.json#/quotes/synthetic-01',
};

function provenance(kind: Provenance['kind'], label: string, sourceRef = kind === 'SOURCE_DECLARED' ? SOURCE_REF : null): Provenance {
  return { kind, label, note: `${label} is declared for this synthetic quote`, sourceRef };
}

/** Synthetic-only fixture; it is not official evidence and is never imported by production code. */
export function tabletQuoteFixture(): TabletQuoteInput {
  return {
    contractVersion: '1.0.0',
    methodVersion: 'tablet-quote-normalization-v1',
    quoteId: 'synthetic-quote-01',
    sourceRef: SOURCE_REF,
    observedAt: '2026-09-21T10:00:00.000Z',
    observationPeriod: '2026-09',
    observationTimeState: 'KNOWN',
    entityTitle: 'Synthetic calcium tablets',
    packText: '30 tablets',
    packCount: {
      declaration: 'OPERATOR_DECLARED',
      unit: 'TABLET',
      value: '30',
      provenance: provenance('OWNER_DECLARED', 'operator-declared tablet count'),
    },
    priceVnd: {
      value: '240000',
      provenance: provenance('SOURCE_DECLARED', 'displayed listed quote'),
    },
    currency: 'VND',
    priceState: 'DISPLAYED_LISTED',
    identityTier: 'TITLE_PACK_MATCH_ONLY',
    variantStatus: 'UNKNOWN',
    gtinStatus: 'UNKNOWN',
    versionStatus: 'UNKNOWN',
    sourceRole: 'MARKETPLACE',
  };
}
