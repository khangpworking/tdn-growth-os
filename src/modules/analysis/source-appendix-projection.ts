// U-27 source-appendix projection (M13/I17): one row per retained source use.
//
// Each row is derived from a caller-supplied registry table plus one retained
// use binding: the registry ID must exist in the table, the tier and report
// name must match the table exactly, and E12/E13 attributions are enforced by
// ID, never trusted from the caller. Tiers are never aggregated: a multi-tier
// ID keeps tier null with a per-tier detail string, and tier D (never used in
// reports) is rejected outright. The same registry ID may appear for distinct
// retained bindings (e.g. two video kinds); an identical ID plus binding is
// rejected as a duplicate retained use, and L9 counts stay per binding so no
// accounting is duplicated across IDs. Empty usage lists project zero rows.
// This projection is pure data for Market/Insight renderers (Sol/OMP own
// rendering); it renders nothing itself and calls no provider.

export const SOURCE_APPENDIX_PROJECTION_CONTRACT = 'source-appendix-projection-v1' as const;

export type SourceAppendixTier = 'A' | 'B' | 'C' | 'D';
export type SourceAppendixL10Type = 'review-video' | 'seller-video';
export type SourceAppendixBindingKind = 'package' | 'capture' | 'upload' | 'fetch';

export const E12_ATTRIBUTION = 'Cục Thống kê (nso.gov.vn)' as const;
export const E13_ATTRIBUTION = 'Ngân hàng Thế giới (World Bank Open Data)' as const;

const E12_IDS = new Set(['S21', 'S22']);
const E13_IDS = new Set(['S23']);

export interface SourceAppendixRegistryEntry {
  /** All tiers attested for this ID; length 1 normally, several for mixed IDs. */
  readonly tiers: readonly SourceAppendixTier[];
  readonly reportName: string;
  readonly group: string;
}

export interface SourceAppendixL9Accounting {
  readonly excluded: number;
  readonly unclear: number;
  readonly byReason: Readonly<Record<string, number>>;
}

export interface SourceAppendixUsage {
  readonly registryId: string;
  /** Retained-evidence binding distinguishing repeated uses of one ID. */
  readonly binding: { readonly kind: SourceAppendixBindingKind; readonly ref: string };
  /** L9 accounting for keyword-collected uses; null otherwise. */
  readonly l9: SourceAppendixL9Accounting | null;
  /** L10 comment source type; null unless comments under videos. */
  readonly l10SourceType: SourceAppendixL10Type | null;
}

export interface SourceAppendixProjectionInput {
  /** Real registry mapping callers mirror from input-data-sources-30-sections.md. */
  readonly registry: Readonly<Record<string, SourceAppendixRegistryEntry>>;
  readonly usages: readonly SourceAppendixUsage[];
}

export interface SourceAppendixRow {
  readonly registryId: string;
  readonly tier: SourceAppendixTier | null;
  readonly tierDetail: string | null;
  readonly group: string;
  readonly reportName: string;
  readonly binding: { readonly kind: SourceAppendixBindingKind; readonly ref: string };
  readonly l9Excluded: number | null;
  readonly l9Unclear: number | null;
  readonly l9Reasons: Readonly<Record<string, number>>;
  readonly l10SourceType: SourceAppendixL10Type | null;
  readonly attribution: string | null;
}

export interface SourceAppendixProjection {
  readonly contractVersion: typeof SOURCE_APPENDIX_PROJECTION_CONTRACT;
  readonly rows: readonly SourceAppendixRow[];
}

export class SourceAppendixProjectionError extends Error {
  readonly code = 'INVALID_SOURCE_APPENDIX_INPUT';
}

function fail(message: string): never {
  throw new SourceAppendixProjectionError(message);
}

function checkCount(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(`${what} must be a non-negative safe integer`);
  return value as number;
}

function checkReasons(value: unknown, what: string): Readonly<Record<string, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${what} must be a reason-count record`);
  for (const [reason, count] of Object.entries(value as Record<string, unknown>)) {
    if (reason.length === 0 || reason.length > 200) fail(`${what} reason names must be 1-200 characters`);
    checkCount(count, `${what}["${reason}"]`);
  }
  return value as Readonly<Record<string, number>>;
}

function checkRegistry(registry: Readonly<Record<string, SourceAppendixRegistryEntry>>): void {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) fail('registry must be a table object');
  for (const [id, entry] of Object.entries(registry)) {
    const what = `registry[${id}]`;
    if (!/^S[0-9]{1,2}$/.test(id)) fail(`${what} has a malformed registry ID`);
    if (!entry || typeof entry !== 'object') fail(`${what} must be an object`);
    if (!Array.isArray(entry.tiers) || entry.tiers.length === 0 || entry.tiers.length > 3) fail(`${what}.tiers must list 1-3 tiers`);
    for (const tier of entry.tiers) {
      if (tier !== 'A' && tier !== 'B' && tier !== 'C') fail(`${what} keeps tier D out: only A-C reach reports`);
    }
    if (typeof entry.reportName !== 'string' || entry.reportName.length === 0 || entry.reportName.length > 300) {
      fail(`${what}.reportName is required`);
    }
    if (typeof entry.group !== 'string' || entry.group.length === 0 || entry.group.length > 120) fail(`${what}.group is required`);
  }
}

function attributionFor(registryId: string): string | null {
  if (E12_IDS.has(registryId)) return E12_ATTRIBUTION;
  if (E13_IDS.has(registryId)) return E13_ATTRIBUTION;
  return null;
}

/**
 * Expand retained uses into one row per (registry ID, binding). Order follows
 * the usages list; nothing is summed across rows and no tier is fabricated.
 * Pure and deterministic: the same input always yields the same rows.
 */
export function buildSourceAppendixProjection(input: SourceAppendixProjectionInput): SourceAppendixProjection {
  if (!input || typeof input !== 'object') fail('input must be an object');
  checkRegistry(input.registry);
  if (!Array.isArray(input.usages) || input.usages.length > 200) fail('usages must be a list of at most 200 retained uses');
  const seen = new Set<string>();
  const rows: SourceAppendixRow[] = [];
  input.usages.forEach((usage, index) => {
    const what = `usages[${index}]`;
    if (!usage || typeof usage !== 'object') fail(`${what} must be an object`);
    const entry = input.registry[usage.registryId];
    if (!entry) fail(`${what} names an unknown registry ID: ${usage.registryId}`);
    if (!usage.binding || typeof usage.binding !== 'object') fail(`${what}.binding must be an object`);
    if (!['package', 'capture', 'upload', 'fetch'].includes(usage.binding.kind)) fail(`${what}.binding.kind is not a retained-evidence kind`);
    if (typeof usage.binding.ref !== 'string' || usage.binding.ref.length === 0 || usage.binding.ref.length > 200) {
      fail(`${what}.binding.ref is required`);
    }
    const identity = `${usage.registryId}${usage.binding.kind}${usage.binding.ref}`;
    if (seen.has(identity)) fail(`duplicate retained use: ${usage.registryId} already bound to this evidence`);
    seen.add(identity);
    if (usage.l9 !== null) {
      if (typeof usage.l9 !== 'object') fail(`${what}.l9 must be an object or null`);
      checkCount(usage.l9.excluded, `${what}.l9.excluded`);
      checkCount(usage.l9.unclear, `${what}.l9.unclear`);
      checkReasons(usage.l9.byReason, `${what}.l9.byReason`);
    }
    if (usage.l10SourceType !== null && usage.l10SourceType !== 'review-video' && usage.l10SourceType !== 'seller-video') {
      fail(`${what}.l10SourceType must be a video-comment kind or null`);
    }
    const tiers = [...new Set(entry.tiers)];
    rows.push({
      registryId: usage.registryId,
      tier: tiers.length === 1 ? tiers[0]! : null,
      tierDetail: tiers.length === 1 ? null : tiers.map(tier => `${usage.registryId}: ${tier}`).join('; '),
      group: entry.group,
      reportName: entry.reportName,
      binding: { kind: usage.binding.kind, ref: usage.binding.ref },
      l9Excluded: usage.l9?.excluded ?? null,
      l9Unclear: usage.l9?.unclear ?? null,
      l9Reasons: usage.l9 ? checkReasons(usage.l9.byReason, `${what}.l9.byReason`) : {},
      l10SourceType: usage.l10SourceType,
      attribution: attributionFor(usage.registryId),
    });
  });
  return { contractVersion: SOURCE_APPENDIX_PROJECTION_CONTRACT, rows };
}
