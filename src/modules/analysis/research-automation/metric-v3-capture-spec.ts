import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/metric-v3-capture-spec.schema.json' with { type: 'json' };
import type { MetricV3CaptureSpec } from '../../../../contracts/analysis/metric-v3-capture-spec.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validate = ajv.compile<MetricV3CaptureSpec>(schema);

/** This mode takes a complete owner-supplied preset; it never derives terms or categories. */
export function validateMetricV3CaptureSpec(value: unknown): MetricV3CaptureSpec {
  if (!validate(value)) throw new Error('CAPTURE_PRESET_INVALID');
  const { preset, windows } = value;
  if (
    new Set(preset.keywords.map((s) => s.normalize('NFC').trim().toLowerCase())).size !== 2 ||
    preset.keywords.some((s) => !s.trim() || s !== s.normalize('NFC').trim()) ||
    new Set(preset.category.children.map((child) => child.id)).size !== 4 ||
    windows[0]?.id !== '30d' ||
    windows[0].intervalDays !== 7 ||
    windows[1]?.id !== '12m' ||
    windows[1].intervalDays !== 30 ||
    windows.some((window) => window.period.startDate > window.period.endDate) ||
    windows[0].period.endDate !== windows[1].period.endDate
  )
    throw new Error('CAPTURE_PRESET_INVALID');
  const days = (start: string, end: string) => (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
  if (
    days(windows[0].period.startDate, windows[0].period.endDate) !== 30 ||
    days(windows[1].period.startDate, windows[1].period.endDate) !== 365
  )
    throw new Error('CAPTURE_PRESET_INVALID');
  return structuredClone(value);
}
