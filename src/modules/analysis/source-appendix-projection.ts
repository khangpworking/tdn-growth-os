// U-27 source-appendix projection (M13/I17): one row per registry source ID.
//
// Each row carries the actual registry ID, per-source or mixed tier metadata,
// the report citation name, L9 exclusion/unclear counts with retained reasons,
// the L10 comment source type where it applies, and the mandatory E12/E13
// attribution where required. Tiers are never aggregated into a scalar: mixed
// sources keep tier null with a per-ID tier detail string. This projection is
// pure data for Market/Insight renderers (Sol/OMP own rendering); it renders
// nothing itself and calls no provider.

export const SOURCE_APPENDIX_PROJECTION_CONTRACT = 'source-appendix-projection-v1' as const;

export type SourceAppendixTier = 'A' | 'B' | 'C' | 'D';
export type SourceAppendixL10Type = 'review-video' | 'seller-video';

export interface SourceAppendixL9Accounting {
  readonly excluded: number;
  readonly unclear: number;
  readonly byReason: Readonly<Record<string, number>>;
}

export interface SourceAppendixSourceInput {
  /** Registry IDs covered by this source entry, e.g. ["S07"]. */
  readonly registryIds: readonly string[];
  /** Single tier only when every ID shares it; mixed sources keep null with tierDetail. */
  readonly tier: SourceAppendixTier | null;
  readonly tierDetail: string | null;
  readonly group: string;
  /** The "tên trong báo cáo" citation name from the registry. */
  readonly reportName: string;
  /** L9 accounting for keyword-collected sources; null otherwise. */
  readonly l9: SourceAppendixL9Accounting | null;
  /** L10 comment source type; null unless comments under videos. */
  readonly l10SourceType: SourceAppendixL10Type | null;
  /** Mandatory E12/E13 attribution citation, or null. */
  readonly attribution: string | null;
}

export interface SourceAppendixRow {
  readonly registryId: string;
  readonly tier: SourceAppendixTier | null;
  readonly tierDetail: string | null;
  readonly group: string;
  readonly reportName: string;
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

function checkSource(entry: SourceAppendixSourceInput, index: number): void {
  const what = `sources[${index}]`;
  if (!entry || typeof entry !== 'object') fail(`${what} must be an object`);
  if (!Array.isArray(entry.registryIds) || entry.registryIds.length === 0 || entry.registryIds.length > 4) {
    fail(`${what}.registryIds must list 1-4 registry IDs`);
  }
  for (const id of entry.registryIds) {
    if (typeof id !== 'string' || !/^S[0-9]{1,2}$/.test(id)) fail(`${what} has a malformed registry ID`);
  }
  if (entry.tier !== null && !['A', 'B', 'C', 'D'].includes(entry.tier)) fail(`${what}.tier must be A-D or null`);
  if (entry.tierDetail !== null && (typeof entry.tierDetail !== 'string' || entry.tierDetail.length === 0 || entry.tierDetail.length > 200)) {
    fail(`${what}.tierDetail must be null or 1-200 characters`);
  }
  if (typeof entry.group !== 'string' || entry.group.length === 0 || entry.group.length > 120) fail(`${what}.group is required`);
  if (typeof entry.reportName !== 'string' || entry.reportName.length === 0 || entry.reportName.length > 300) {
    fail(`${what}.reportName is required`);
  }
  if (entry.l9 !== null) {
    if (typeof entry.l9 !== 'object') fail(`${what}.l9 must be an object or null`);
    checkCount(entry.l9.excluded, `${what}.l9.excluded`);
    checkCount(entry.l9.unclear, `${what}.l9.unclear`);
    checkReasons(entry.l9.byReason, `${what}.l9.byReason`);
  }
  if (entry.l10SourceType !== null && entry.l10SourceType !== 'review-video' && entry.l10SourceType !== 'seller-video') {
    fail(`${what}.l10SourceType must be a video-comment kind or null`);
  }
  if (entry.attribution !== null && (typeof entry.attribution !== 'string' || entry.attribution.length === 0 || entry.attribution.length > 300)) {
    fail(`${what}.attribution must be null or 1-300 characters`);
  }
}

/**
 * Expand source entries into one row per registry ID. Order follows the input;
 * nothing is summed across sources and no tier is fabricated. Pure and
 * deterministic: the same input always yields the same rows.
 */
export function buildSourceAppendixProjection(sources: readonly SourceAppendixSourceInput[]): SourceAppendixProjection {
  if (!Array.isArray(sources) || sources.length === 0 || sources.length > 50) fail('sources must be a list of 1-50 entries');
  const seen = new Set<string>();
  const rows: SourceAppendixRow[] = [];
  sources.forEach((entry, index) => {
    checkSource(entry, index);
    for (const registryId of entry.registryIds) {
      if (seen.has(registryId)) fail(`duplicate registry ID: ${registryId}`);
      seen.add(registryId);
      rows.push({
        registryId, tier: entry.tier, tierDetail: entry.tierDetail, group: entry.group, reportName: entry.reportName,
        l9Excluded: entry.l9?.excluded ?? null, l9Unclear: entry.l9?.unclear ?? null,
        l9Reasons: entry.l9 ? checkReasons(entry.l9.byReason, `sources[${index}].l9.byReason`) : {},
        l10SourceType: entry.l10SourceType, attribution: entry.attribution,
      });
    }
  });
  return { contractVersion: SOURCE_APPENDIX_PROJECTION_CONTRACT, rows };
}
