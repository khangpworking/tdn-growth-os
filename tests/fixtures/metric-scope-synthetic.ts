import type { MetricScopeInput, Observation } from '../../contracts/analysis/metric-scope-input.generated.js';
import { metricLabelFingerprint } from '../../src/modules/analysis/metric-scope-calculator.js';

/** Independent business example supplied by Review marketing framework files. Synthetic only. */
export function metricFixture(): MetricScopeInput {
  const scope: MetricScopeInput['scope'] = { key: 'synthetic-market', platform: 'shopee', selection: 'ON', start: '2026-08-17', end: '2026-09-15', periodBasis: 'Synthetic declared period', acquiredAt: '2026-09-16T00:00:00Z' };
  const digest = 'a'.repeat(64);
  const ref = (locator: string) => ({ sourceSha256: digest, locator });
  const amount = (n: string, locator: string): Observation => ({ state: n === '0' ? 'observed_zero' : 'observed_value', value: n, precision: 'exact', source: ref(locator), displayedValue: n });
  const data = [['S1', 'L1', 'CORE_CANDIDATE', 'G1', '100', '10'], ['S1', 'L2', 'CORE_CANDIDATE', 'G2', '50', '5'], ['S2', 'L3', 'UNKNOWN', 'G1', '25', '5'], ['S2', 'L4', 'UNKNOWN', 'UNKNOWN', '0', '2'], ['S3', 'L5', 'OUTSIDE', 'G1', '10', '1']] as const;
  return { contractVersion: '1.0.0', profileId: 'synthetic-profile-v1', labelCodebookVersion: 'synthetic-codebook-v1', wideUnknownPolicy: 'include', scope,
    sources: [{ sha256: digest, label: 'Synthetic only', representationRole: 'structured', evidenceFamily: 'synthetic-metric', provenanceBasis: 'Constructed fixture, not provider data' }],
    records: data.map(([shopId, listingId, classification, group, revenue, units], i) => {
      const row = { shopId, listingId, title: `Synthetic ${listingId}`, category: 'Synthetic category' };
      return { ...row, source: ref(`/rows/${i}`), revenue: amount(revenue, `/rows/${i}/revenue`), units: amount(units, `/rows/${i}/units`),
        measurement: { profileId: 'synthetic-profile-v1', scopeKey: scope.key, platform: scope.platform, selection: scope.selection, start: scope.start, end: scope.end, currency: 'VND' },
        label: { classification, group, methodVersion: 'synthetic-codebook-v1', contentSha256: metricLabelFingerprint(scope.platform, row), adjudication: 'unknown', source: ref(`/labels/${i}`) } };
    }) };
}
