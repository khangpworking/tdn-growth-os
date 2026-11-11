import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/metric-v3-capture-spec.schema.json' with { type: 'json' };
import selectedSchema from '../../../../contracts/analysis/metric-v3-capture-spec-v3.schema.json' with { type: 'json' };
import type { MetricV3CaptureSpecV3 } from '../../../../contracts/analysis/metric-v3-capture-spec-v3.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import legacySchema from '../../../../contracts/analysis/metric-v3-capture-spec-v1.schema.json' with { type: 'json' };
import type { MetricV3CaptureSpec as MetricV3CaptureSpecV2 } from '../../../../contracts/analysis/metric-v3-capture-spec.generated.js';
import type { MetricV3CaptureSpecV1 } from '../../../../contracts/analysis/metric-v3-capture-spec-v1.generated.js';

/** Single-window v3 is explicit; retained two-window v1/v2 keep their semantics. */
export type MetricV3CaptureSpec = MetricV3CaptureSpecV2 | MetricV3CaptureSpecV1 | MetricV3CaptureSpecV3;

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateV2 = ajv.compile<MetricV3CaptureSpecV2>(schema);
const validateV3 = ajv.compile<MetricV3CaptureSpecV3>(selectedSchema);
const validateInput = ajv.compile({ $ref: `${selectedSchema.$id}#/$defs/confirmedInput` });
const validateV1 = ajv.compile<MetricV3CaptureSpecV1>(legacySchema);

/** This mode takes a complete owner-supplied preset; it never derives terms or categories. */
export function validateMetricV3CaptureSpec(value: unknown): MetricV3CaptureSpec {
  const version = (value as { contractVersion?: unknown } | null)?.contractVersion;
  const selected = version === 'metric-v3-capture-spec-v3';
  const spec = value as MetricV3CaptureSpec;
  const validate = selected ? validateV3 : version === 'metric-v3-capture-spec-v1' ? validateV1 : validateV2;
  if (!validate(value)) throw new Error('CAPTURE_PRESET_INVALID');
  const { preset, windows } = spec;
  if (
    new Set(preset.keywords.map((s) => s.normalize('NFC').trim().toLowerCase())).size !== preset.keywords.length ||
    preset.keywords.some((s) => !s.trim() || s !== s.normalize('NFC').trim()) ||
    new Set(preset.category.children.map((child) => child.id)).size !== preset.category.children.length ||
    windows.some((window) => window.period.startDate > window.period.endDate)
  ) throw new Error('CAPTURE_PRESET_INVALID');
  if (!selected) {
    const [primary, annual] = windows;
    const days = (start: string, end: string) => (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
    if (preset.category.children.length !== 4 || primary?.id !== '30d' || primary.intervalDays !== 7 ||
        annual?.id !== '12m' || annual.intervalDays !== 30 || primary.period.endDate !== annual.period.endDate ||
        days(primary.period.startDate, primary.period.endDate) !== 30 || days(annual.period.startDate, annual.period.endDate) !== 365)
      throw new Error('CAPTURE_PRESET_INVALID');
  }
  return structuredClone(spec);
}

/** Validate the independent confirmed snapshot, not just the capture's internal shape. */
export function assertMetricInputMatches(input: unknown, spec: MetricV3CaptureSpec): void {
  const selected = spec.contractVersion === 'metric-v3-capture-spec-v3';
  if (!selected && input === undefined) return;
  if (!selected || !validateInput(input)) throw new Error('CAPTURE_INPUT_INVALID');
  const confirmed = input as { preset: unknown; window: unknown };
  if (canonicalJson(confirmed.preset) !== canonicalJson(spec.preset) ||
      canonicalJson(confirmed.window) !== canonicalJson(spec.windows[0])) throw new Error('CAPTURE_SPEC_MISMATCH');
}

/** Chart aggregation does not derive or modify the concrete acquisition period. */
export function metricCapturePeriod(spec: MetricV3CaptureSpec) {
  return spec.windows[spec.contractVersion === 'metric-v3-capture-spec-v3' ? 0 : 1]!.period;
}

export const METRIC_V3_STOP_CODES = [
  'CAPTURE_CATEGORY_NOT_SELECTABLE', 'CAPTURE_PRESET_INVALID', 'CAPTURE_ORIGIN_CHANGED', 'CAPTURE_LOGIN_REQUIRED',
  'CAPTURE_ACCESS_RESTRICTED', 'CAPTURE_UI_CHANGED', 'CAPTURE_CONTROL_NOT_SELECTABLE', 'CAPTURE_APPLIED_STATE_MISMATCH',
  'CAPTURE_COMPARISON_MISMATCH', 'CAPTURE_RESPONSE_MISSING', 'CAPTURE_REQUEST_SCOPE_MISMATCH',
  'CAPTURE_TREND_INTERVAL_MISMATCH', 'CAPTURE_MANIFEST_INVALID', 'CAPTURE_INITIAL_STATE_UNEXPECTED',
  'CAPTURE_KEYWORDS_NOT_APPLIED', 'CAPTURE_RESPONSE_LIMIT', 'CAPTURE_RESPONSE_TIMEOUT', 'CAPTURE_PERIOD_NOT_SELECTABLE',
  'CAPTURE_TAB_UNAVAILABLE', 'CAPTURE_FAILED', 'CAPTURE_BRIDGE_TIMEOUT', 'CAPTURE_SELECTOR_TIMEOUT',
  'CAPTURE_PROVIDER_DATA_ERROR', 'CAPTURE_PAGE_REQUEST_FAILED', 'CAPTURE_FALLBACK_FAILED', 'CAPTURE_PAGE_SESSION_UNAVAILABLE', 'CAPTURE_CUSTOM_CATEGORY_FALLBACK_UNSUPPORTED',
] as const;
export type MetricV3StopCode = typeof METRIC_V3_STOP_CODES[number];
