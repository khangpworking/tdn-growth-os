import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import schema from '../../../contracts/analysis/default-market-peers.schema.json' with { type: 'json' };
import type { DefaultMarketPeers } from '../../../contracts/analysis/default-market-peers.generated.js';
import type { MetricScopeInput } from '../../../contracts/analysis/metric-scope-input.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

type Input = DefaultMarketPeers['input'];
type Frame = Input['frames'][number];
type Record = Input['records'][number];
type Result = DefaultMarketPeers['frames'][number];
type Member = Result['members'][number];
type Reason = Result['excluded'][number]['reason'];
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv); ajv.addSchema(schema);
const validateInput = ajv.getSchema<Input>(`${schema.$id}#/$defs/input`)!;
const validateOutput = ajv.getSchema<DefaultMarketPeers>(schema.$id)!;
const order = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const key = (value: unknown): string => canonicalJson(value);

/** Fixed before reading sales. Changing any policy requires a new retained rule version. */
export const DEFAULT_MARKET_PEER_RULE: Readonly<Input['rule']> = Object.freeze({
  version: 'e11-sales-peers-v1', thresholdPercent: 50,
  boundary: 'MINIMAL_PREFIX_REVENUE_DESC_IDENTITY_ASC',
  identity: 'EXACT_TITLE_LABEL_OR_SOURCE_SHOP_PER_PLATFORM',
  denominator: 'COMPLETE_COMPATIBLE_GROUP_SAMPLE',
});

function decimal(value: string, scale: number): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0') || '0');
}
function amount(value: bigint, scale: number): string {
  if (!scale) return value.toString();
  const padded = value.toString().padStart(scale + 1, '0');
  return `${padded.slice(0, -scale)}.${padded.slice(-scale)}`.replace(/\.?0+$/, '') || '0';
}
const unknownBrand = (value: string | null): boolean => value === null ||
  ['', '(không ghi)', 'no brand', 'none', 'oem'].includes(value.trim().toLowerCase());

function identity(row: Record): Member['identity'] | null {
  if (row.source === null) return null;
  if (!unknownBrand(row.brandLabel)) {
    // Literal title labels, not legal-brand identities or cross-source aliases.
    const label = row.brandLabel!.trim();
    if (!row.title.normalize('NFC').toLowerCase().includes(label.normalize('NFC').toLowerCase())) return null;
    return { kind: 'TITLE_LABEL', key: key(['TITLE_LABEL', label]), label, source: row.source };
  }
  if (row.shopId === null || !row.shopId.trim()) return null;
  return { kind: 'SHOP', key: key(['SHOP', row.shopId]), label: row.shopLabel?.trim() || row.shopId, source: row.source };
}

function deriveFrame(frame: Frame, records: Input['records']): Result {
  if (frame.period.start > frame.period.end) throw new TypeError('DEFAULT_PEER_PERIOD_REVERSED');
  const excluded: Result['excluded'] = [], eligible: Result['eligible'] = [];
  const included: { row: Record; identity: Member['identity'] }[] = [];
  let incomplete = false;
  const seenRefs = new Map<string, string>(), seenListings = new Set<string>();
  const exclude = (row: Record, reason: Reason, blocks: boolean): void => {
    excluded.push({ source: row.source, listingId: row.listingId, reason });
    incomplete ||= blocks;
  };
  for (const row of [...records].sort((a, b) => order(key(a.source), key(b.source)) || order(key(a), key(b)))) {
    if (row.platform !== frame.platform) { exclude(row, 'PLATFORM_MISMATCH', false); continue; }
    if (row.sampleKey !== frame.sampleKey) { exclude(row, 'FRAME_MISMATCH', false); continue; }
    if (key(row.period) !== key(frame.period)) { exclude(row, 'PERIOD_MISMATCH', false); continue; }
    if (row.unit !== frame.unit) { exclude(row, 'UNIT_MISMATCH', false); continue; }
    if (row.membership === 'OTHER_GROUP') { exclude(row, 'OTHER_GROUP', false); continue; }
    if (row.membership === 'UNKNOWN' || row.group === null) { exclude(row, 'GROUP_UNKNOWN', true); continue; }
    if (row.group !== frame.group) { exclude(row, 'OTHER_GROUP', false); continue; }
    if (row.source === null) { exclude(row, 'SOURCE_MISSING', true); continue; }
    const ref = key(row.source), bytes = key(row), previous = seenRefs.get(ref);
    if (previous !== undefined) {
      exclude(row, previous === bytes ? 'EXACT_REFERENCE_DUPLICATE' : 'CONFLICTING_REFERENCE', previous !== bytes);
      continue;
    }
    seenRefs.set(ref, bytes);
    if (row.listingId === null || !row.listingId.trim() || seenListings.has(row.listingId)) {
      exclude(row, 'LISTING_IDENTITY_AMBIGUOUS', true); continue;
    }
    seenListings.add(row.listingId);
    if (row.revenue === null) { exclude(row, 'REVENUE_MISSING', true); continue; }
    const who = identity(row);
    if (!who) { exclude(row, 'PEER_IDENTITY_AMBIGUOUS', true); continue; }
    eligible.push(row.source); included.push({ row, identity: who });
  }
  const base = { frame, eligible, excluded };
  // Never silently shrink the group denominator around missing/ambiguous members.
  if (incomplete) return { ...base, state: 'INCOMPLETE', totalRevenue: null, selectedRevenue: null, members: [], selected: [] };
  if (!included.length) return { ...base, state: 'NO_SALES', totalRevenue: null, selectedRevenue: null, members: [], selected: [] };
  const scale = Math.max(...included.map(({ row }) => row.revenue!.split('.')[1]?.length ?? 0));
  const groups = new Map<string, { identity: Member['identity']; revenue: bigint; sources: Member['sources'] }>();
  for (const { row, identity: who } of included) {
    const group = groups.get(who.key) ?? { identity: who, revenue: 0n, sources: [] };
    group.revenue += decimal(row.revenue!, scale); group.sources.push(row.source!); groups.set(who.key, group);
  }
  const candidates = [...groups.values()].sort((a, b) => a.revenue > b.revenue ? -1 : a.revenue < b.revenue ? 1 : order(a.identity.key, b.identity.key));
  const total = candidates.reduce((sum, candidate) => sum + candidate.revenue, 0n);
  const member = (candidate: typeof candidates[number]): Member => ({ identity: candidate.identity, revenue: amount(candidate.revenue, scale), sources: candidate.sources });
  const members = candidates.map(member).sort((a, b) => order(a.identity.key, b.identity.key));
  if (total === 0n) return { ...base, state: 'ZERO_REVENUE', totalRevenue: '0', selectedRevenue: '0', members, selected: [] };
  let covered = 0n;
  const selected: Member[] = [];
  for (const candidate of candidates) {
    selected.push(member(candidate)); covered += candidate.revenue;
    if (covered * 100n >= total * BigInt(DEFAULT_MARKET_PEER_RULE.thresholdPercent)) break;
  }
  // Display/retention order expresses identities, not a recommendation ranking.
  selected.sort((a, b) => order(a.identity.key, b.identity.key));
  return { ...base, state: 'SELECTED', totalRevenue: amount(total, scale), selectedRevenue: amount(covered, scale), members, selected };
}

/** Offline calculation only. Callers authenticate source bytes and retain this exact snapshot through their owning service. */
export function deriveDefaultMarketPeers(value: unknown): DefaultMarketPeers {
  if (!validateInput(value)) throw new TypeError(`DEFAULT_PEER_INPUT_INVALID:${ajv.errorsText(validateInput.errors)}`);
  const input = JSON.parse(canonicalJson(value)) as Input;
  if (key(input.rule) !== key(DEFAULT_MARKET_PEER_RULE)) throw new TypeError('DEFAULT_PEER_RULE_UNSUPPORTED');
  const frames = [...input.frames].sort((a, b) => order(key(a), key(b)));
  if (new Set(frames.map(key)).size !== frames.length) throw new TypeError('DEFAULT_PEER_FRAME_DUPLICATE');
  const result: DefaultMarketPeers = { contractVersion: 'default-market-peers-v1', input, frames: frames.map(frame => deriveFrame(frame, input.records)) };
  if (!validateOutput(result)) throw new TypeError(`DEFAULT_PEER_OUTPUT_INVALID:${ajv.errorsText(validateOutput.errors)}`);
  return result;
}

export function verifyDefaultMarketPeers(value: unknown): DefaultMarketPeers {
  if (!validateOutput(value)) throw new TypeError('DEFAULT_PEER_SNAPSHOT_INVALID');
  const rebuilt = deriveDefaultMarketPeers((value as DefaultMarketPeers).input);
  if (key(value) !== key(rebuilt)) throw new TypeError('DEFAULT_PEER_REPLAY_MISMATCH');
  return rebuilt;
}

/** Already admitted classified sales input, never quick-search cards or unclassified keyword exports. */
export function classifiedMetricDefaultPeers(
  sales: MetricScopeInput, rule: Input['rule'], ownerAdditions: Input['ownerAdditions'],
): DefaultMarketPeers {
  const groups = [...new Set(sales.records.filter(row => row.label?.classification === 'CORE_CANDIDATE').map(row => row.label!.group))].sort(order);
  const sampleKey = createHash('sha256').update(key([sales.scope.key, sales.sources.map(source => source.sha256).sort()])).digest('hex');
  const frames: Input['frames'] = groups.map(group => ({ platform: sales.scope.platform, group, sampleKey,
      period: { start: sales.scope.start, end: sales.scope.end }, unit: 'VND',
      membershipBasis: `retained-classification:${sales.labelCodebookVersion}` }));
  const records: Input['records'] = sales.records.map(row => ({
      platform: row.measurement.platform,
      sampleKey: row.measurement.scopeKey === sales.scope.key ? sampleKey : row.measurement.scopeKey,
      period: { start: row.measurement.start, end: row.measurement.end }, unit: row.measurement.currency,
      group: row.label?.group ?? null,
      membership: row.label === null || row.label.classification === 'UNKNOWN' ? 'UNKNOWN'
        : row.label.classification === 'CORE_CANDIDATE' ? 'IN_GROUP' : 'OTHER_GROUP',
      listingId: row.listingId, title: row.title,
      // This normalized profile has no brand identity field. A title is never parsed into a guessed brand.
      brandLabel: null, shopId: row.shopId, shopLabel: row.shopId,
      revenue: row.revenue.state === 'missing' ? null : row.revenue.value, source: row.revenue.source,
    }));
  return deriveDefaultMarketPeers({ rule, frames, records, ownerAdditions });
}
