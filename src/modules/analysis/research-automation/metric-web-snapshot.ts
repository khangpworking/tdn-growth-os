import { createRequire } from 'node:module';
import snapshotSchema from '../../../../contracts/analysis/automation-metric-web-snapshot-v1.schema.json' with { type: 'json' };
import type { AutomationMetricWebSnapshotV1, Table } from '../../../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';

// The bridge keeps its Ajv instance private, so this module builds its own
// with the same library and options instead of editing metric-method-bridge.ts.
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateSchema = ajv.compile<AutomationMetricWebSnapshotV1>(snapshotSchema);

/** Allowed column keys per table group, from the #127 "B. Web snapshot" W-table. */
export const METRIC_WEB_TABLE_COLUMNS = {
  W5_category: ['category', 'level', 'platform', 'revenue'],
  W6_priceLevel: ['priceLevel', 'platform', 'revenue'],
  W9_brandByShopType: ['brand', 'revenueNormal', 'revenueMall'],
  W11_location: ['location', 'share'],
  W12_topProducts: ['name', 'shop', 'price', 'createdDate', 'minPrice', 'maxPrice', 'revenue', 'revenueChg', 'units', 'unitsChg',
    'lifetimeRevenue', 'lifetimeUnits', 'category'],
  W13_topShops: ['rankNew', 'rankOld', 'shop', 'platform', 'listings', 'revenue', 'revenueChg', 'units', 'unitsChg', 'lifetimeRevenue',
    'lifetimeUnits'],
  W14_topBrands: ['rankNew', 'rankOld', 'brand', 'listings', 'revenue', 'revenueChg', 'units', 'unitsChg', 'lifetimeRevenue', 'lifetimeUnits'],
  W16_detailHistory: ['entityKind', 'entity', 'month', 'revenue', 'units'],
} as const satisfies Record<string, readonly string[]>;
export type MetricWebTableGroup = keyof typeof METRIC_WEB_TABLE_COLUMNS;

/** W1 (scope), W2 and W3 must be on the page; the adapter reports their absence as METRIC_UI_CHANGED. */
const REQUIRED_GROUPS = ['W2_kpi', 'W3_platformSplit'] as const;

export type MetricWebSnapshotErrorCode = 'METRIC_WEB_SNAPSHOT_INVALID' | 'METRIC_UI_CHANGED';

export class MetricWebSnapshotError extends Error {
  constructor(readonly code: MetricWebSnapshotErrorCode, readonly issues: readonly string[]) {
    super(`${code}: ${issues.join('; ')}`);
    this.name = 'MetricWebSnapshotError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const isAbsentMarker = (value: unknown): boolean => isRecord(value) && 'absent' in value;

/** An Absent marker on W1-W3 means the page no longer shows a group the contract needs. */
function absentRequiredGroups(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const issues = isAbsentMarker(value.scope) ? ['scope (W1) is marked absent'] : [];
  const groups = value.groups;
  if (isRecord(groups)) {
    for (const name of REQUIRED_GROUPS) if (isAbsentMarker(groups[name])) issues.push(`${name} is marked absent`);
  }
  return issues;
}

function tableIssues(group: MetricWebTableGroup, table: Table): string[] {
  const allowed = new Set<string>(METRIC_WEB_TABLE_COLUMNS[group]);
  const issues = table.columns.filter(column => !allowed.has(column)).map(column => `${group}: unknown column "${column}"`);
  const declared = new Set<string>(table.columns);
  table.rows.forEach((row, index) => {
    for (const key of Object.keys(row.cells).sort()) {
      if (!declared.has(key)) issues.push(`${group}: row ${index} has undeclared cell "${key}"`);
    }
  });
  return issues;
}

/** Validates against the schema and the per-group column lists. Throws MetricWebSnapshotError on any problem. */
export function validateMetricWebSnapshot(value: unknown): AutomationMetricWebSnapshotV1 {
  const absent = absentRequiredGroups(value);
  if (absent.length > 0) throw new MetricWebSnapshotError('METRIC_UI_CHANGED', absent);
  if (!validateSchema(value)) {
    const issues = (validateSchema.errors ?? []).map(error => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`);
    throw new MetricWebSnapshotError('METRIC_WEB_SNAPSHOT_INVALID', [...new Set(issues)].sort());
  }
  const issues: string[] = [];
  const monthly = value.groups.W4_monthly;
  if (!('absent' in monthly)) {
    const firstMonth = value.scope.period.startDate.slice(0, 7);
    const lastMonth = value.scope.period.endDate.slice(0, 7);
    const seen = new Set<string>();
    for (const point of monthly) {
      const key = `${point.platform} ${point.month}`;
      if (seen.has(key)) issues.push(`W4_monthly: duplicate point ${key}`);
      seen.add(key);
      if (point.month < firstMonth || point.month > lastMonth) issues.push(`W4_monthly: ${key} is outside scope.period`);
    }
  }
  for (const group of Object.keys(METRIC_WEB_TABLE_COLUMNS) as MetricWebTableGroup[]) {
    const table = value.groups[group];
    if (!('absent' in table)) issues.push(...tableIssues(group, table));
  }
  if (issues.length > 0) throw new MetricWebSnapshotError('METRIC_WEB_SNAPSHOT_INVALID', issues);
  return value;
}

export interface MetricScopeSpec {
  readonly specDigest: string;
  readonly keywords: readonly string[];
  readonly platforms: readonly string[];
  readonly period: { readonly startDate: string; readonly endDate: string };
  readonly category: string | null;
}

export interface MetricXlsxScopeManifest extends MetricScopeSpec {
  readonly captureId: string;
}

export type SnapshotScopeResult = { ok: true } | { ok: false; code: 'METRIC_SNAPSHOT_SCOPE_MISMATCH'; fields: string[] };

const keywordSet = (keywords: readonly string[]): string => [...new Set(keywords.map(keyword => keyword.normalize('NFC').trim().toLowerCase()))].sort().join('\u0000');
const platformSet = (platforms: readonly string[]): string => [...new Set(platforms)].sort().join('\u0000');

/**
 * The snapshot must come from the same search as the spec and the xlsx capture.
 * Lists every differing field, sorted. Never throws on a mismatch.
 */
export function checkSnapshotScope(
  snapshot: AutomationMetricWebSnapshotV1,
  spec: MetricScopeSpec,
  xlsxManifest: MetricXlsxScopeManifest,
): SnapshotScopeResult {
  const scope = snapshot.scope;
  const fields = new Set<string>();
  for (const reference of [spec, xlsxManifest]) {
    if (snapshot.specDigest !== reference.specDigest) fields.add('specDigest');
    if (keywordSet(scope.keywords) !== keywordSet(reference.keywords)) fields.add('keywords');
    if (platformSet(scope.platforms) !== platformSet(reference.platforms)) fields.add('platforms');
    if (scope.period.startDate !== reference.period.startDate || scope.period.endDate !== reference.period.endDate) fields.add('period');
    if (scope.category !== reference.category) fields.add('category');
  }
  if (snapshot.captureId !== xlsxManifest.captureId) fields.add('captureId');
  return fields.size === 0 ? { ok: true } : { ok: false, code: 'METRIC_SNAPSHOT_SCOPE_MISMATCH', fields: [...fields].sort() };
}
