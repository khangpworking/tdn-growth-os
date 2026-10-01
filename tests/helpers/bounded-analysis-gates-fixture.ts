import type { BoundedAnalysisGates } from '../../contracts/analysis/bounded-analysis-gates.generated.js';

type Input = BoundedAnalysisGates['input'];
const source = (locator: string) => ({ logicalPath: 'gate-source.json', sha256: '1'.repeat(64), locator });
const observed = (value: string) => ({ state: value === '0' ? 'observed_zero' as const : 'observed_value' as const, value });

export function boundedAnalysisGatesFixture(): Input {
  const scope = {
    measure: 'Recorded completions', unit: 'source aggregate events',
    period: { start: '2026-01-01', end: '2026-01-06' }, timezone: 'UTC',
    universe: 'Synthetic retained events', frame: 'Existing source report', inclusionRule: 'Source-declared eligible events',
  };
  return {
    contractVersion: '1.0.0',
    configuration: {
      advancedProfileSha256: 'c4e0f5fbda7f1afbb47571a384c59e59aa31264b2e5b79a38bce97a30605ba63',
      adoptionSha256: '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7',
    },
    m10: {
      source: source('/m10'), series: [{
        source: source('/m10/series/0'), entityLiteral: 'Source series A', metric: 'Recorded completions', unit: 'events',
        timezone: 'UTC', dailyBoundary: '00:00 UTC', universe: 'Synthetic retained events', frame: 'Existing daily report',
        aggregationRule: 'One source aggregate per declared day', period: { start: '2026-01-01', end: '2026-01-06' },
        rows: ['10', '0', '12', '8', '9', '7'].map((value, index) => ({
          source: source(`/m10/series/0/rows/${index}`), date: `2026-01-0${index + 1}`, observation: observed(value),
        })),
        splits: {
          train: { start: '2026-01-01', end: '2026-01-03' }, validation: { start: '2026-01-04', end: '2026-01-04' },
          holdout: { start: '2026-01-05', end: '2026-01-06' },
        },
        policy: { revision: null, modelId: null, baselineId: null, historyMinimumDays: null, horizonDays: null,
          gapPolicy: null, errorMetric: null, selectionRule: null, refitRule: null },
      }],
    },
    i11: {
      source: source('/i11'),
      groupPolicy: {
        source: source('/i11/groupPolicy'), revision: 'source-groups-v1',
        groups: [{ label: 'B', source: source('/i11/groupPolicy/groups/0') }, { label: 'A', source: source('/i11/groupPolicy/groups/1') }],
        overlap: 'UNKNOWN', exhaustiveness: 'UNKNOWN', suppressionRule: null,
      },
      cells: ['A', 'B'].map((group, index) => ({
        source: source(`/i11/cells/${index}`), group,
        assignment: { state: 'SOURCE_ASSIGNED', source: source(`/i11/cells/${index}/assignment`) },
        countUnit: 'SOURCE_AGGREGATE', identityEvidence: null, scope: structuredClone(scope),
        numerator: observed(index === 0 ? '4' : '3'), denominator: observed('10'),
      })),
    },
    i12: {
      source: source('/i12'), records: [
        { source: source('/i12/records/0'), kind: 'PRESENCE', touchpoint: 'Source page', channel: 'website',
          date: '2026-01-01', attribution: 'Synthetic existing source', scope: { ...structuredClone(scope), measure: null, unit: null }, window: null, observation: null },
        { source: source('/i12/records/1'), kind: 'EXPOSURE', touchpoint: 'Source page', channel: 'website',
          date: '2026-01-06', attribution: 'Synthetic existing source', scope: { ...structuredClone(scope), measure: 'Impressions', unit: 'exposure events' },
          window: 'Source six-day reporting window', observation: observed('100') },
        { source: source('/i12/records/2'), kind: 'OUTCOME', touchpoint: 'Source page', channel: 'website',
          date: '2026-01-06', attribution: 'Synthetic existing source', scope: { ...structuredClone(scope), measure: 'Store orders', unit: 'order events' },
          window: 'Source six-day reporting window', observation: observed('5') },
      ],
    },
    i16: {
      source: source('/i16'), mode: 'DESIGN_ONLY', protocolRef: null,
      fields: {
        question: 'What would the supplied measurement plan record?', assignmentMechanism: 'Owner-supplied assignment concept',
        assignmentUnit: 'source-issued assigned unit', treatment: 'Declared option A', comparator: 'Declared option B',
        eligibility: 'Existing protocol eligibility', instrumentation: 'Existing event logger', outcome: 'Recorded completion',
        unit: 'assigned units with completion', window: 'January 2026', exclusions: 'Source-declared exclusions', attrition: null,
        estimator: null, missingRule: null, uncertaintyRule: null, decisionRule: null,
      },
      outcomes: [],
    },
  };
}
