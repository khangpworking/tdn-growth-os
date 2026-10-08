import { createHash } from 'node:crypto';
import type { ReaderReportInput, UnitPriceObservation } from '../../../../contracts/analysis/reader-report-input.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';

export type UnitPricePacket = NonNullable<ReaderReportInput['unitPrices']>;
export type RetainedUnitPriceSource = { sha256: string; bytes: Buffer };
export type UnitPriceProjection = {
  rowI: number; observation: UnitPriceObservation; sources: UnitPricePacket['records'][number]['source'][];
  value: number | null; standard: string; comparisonKey: string; missing: string | null; ownerDeclared: boolean;
};
export class MarketUnitPriceError extends Error {}
const fail = (code: string): never => { throw new MarketUnitPriceError(code); };
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const equal = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);

/** Schema validation belongs to the reader boundary. This projection additionally
 * binds every value to the actual retained bytes, never a title or sales average.
 * The supported evidence format is an operator-retained JSON spec observation;
 * this verifies declarations, not seller/provider authenticity. */
export function projectMarketUnitPrices(input: Pick<ReaderReportInput, 'contractVersion' | 'unitPrices'> & { readonly rows: readonly ReaderReportInput['rows'][number][] }, retained: readonly RetainedUnitPriceSource[] = []): UnitPriceProjection[] {
  const packet = input.unitPrices;
  if (packet === undefined) return [];
  if (input.contractVersion !== '1.4.0') fail('UNIT_PRICE_VERSION_REQUIRED');
  const bytes = new Map<string, unknown>(), roles = new Map<string, string>();
  if (retained.reduce((sum, source) => sum + source.bytes.byteLength, 0) > 8 * 1024 * 1024) fail('UNIT_PRICE_EVIDENCE_TOO_LARGE');
  for (const source of retained) {
    if (hash(source.bytes) !== source.sha256) fail('UNIT_PRICE_SOURCE_HASH_MISMATCH');
    try { bytes.set(source.sha256, JSON.parse(source.bytes.toString('utf8'))); }
    catch { fail('UNIT_PRICE_SOURCE_UNREADABLE'); }
  }
  for (const source of packet.sources) {
    if (roles.has(source.sha256)) fail('UNIT_PRICE_DUPLICATE_SOURCE');
    if (!bytes.has(source.sha256)) fail('UNIT_PRICE_SOURCE_MISSING');
    roles.set(source.sha256, source.role);
  }
  const resolve = (ref: UnitPricePacket['records'][number]['source'], role: string): unknown => {
    if (roles.get(ref.sourceSha256) !== role) fail('UNIT_PRICE_SOURCE_ROLE_MISMATCH');
    let value = bytes.get(ref.sourceSha256);
    for (const part of ref.locator.slice(1).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'))) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) fail('UNIT_PRICE_LOCATOR_MISSING');
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  };
  const seen = new Set<string>(), rowVariants = new Set<string>();
  return packet.records.map(record => {
    if (!equal(resolve(record.source, 'LISTING_SPEC'), record.observation)) fail('UNIT_PRICE_OBSERVATION_MISMATCH');
    const row = input.rows.find(r => r.i === record.rowI);
    const original = record.observation;
    if (!row || row.listing !== original.listing || row.platform !== original.platform) fail('UNIT_PRICE_LISTING_MISMATCH');
    const key = `${record.source.sourceSha256}:${record.source.locator}`;
    const identity = canonicalJson([record.rowI, original.variant, original.price.kind, original.period]);
    if (seen.has(key) || rowVariants.has(identity)) fail('UNIT_PRICE_DUPLICATE_OBSERVATION');
    seen.add(key); rowVariants.add(identity);
    let observation = original;
    const sources = [record.source];
    if (record.quantityOverride !== undefined) {
      const override = record.quantityOverride;
      if (!equal(resolve(override.source, 'OWNER_DECLARATION'), override.observation)) fail('UNIT_PRICE_OWNER_DECLARATION_MISMATCH');
      if (!equal({ ...original, quantity: override.observation.quantity }, override.observation)) fail('UNIT_PRICE_OVERRIDE_BINDING_MISMATCH');
      observation = override.observation; sources.push(override.source);
    }
    const { category, quantity, price, period } = observation;
    if (period.start > period.end) fail('UNIT_PRICE_PERIOD_REVERSED');
    if (price.kind === 'CONDITIONAL_PROMO' && !price.conditions.length) fail('UNIT_PRICE_PROMO_CONDITIONS_MISSING');
    const expected = { MASS: 'g', VOLUME: 'ml', COUNT: 'count', DURABLE: 'item', COMBO: 'combo' }[category.kind];
    if (quantity.unit !== expected) fail('UNIT_PRICE_CATEGORY_UNIT_MISMATCH');
    if (category.kind === 'MASS' ? category.massBasis === 'NOT_APPLICABLE' : category.massBasis !== 'NOT_APPLICABLE') fail('UNIT_PRICE_MASS_BASIS_MISMATCH');
    if (category.kind === 'COUNT' && category.countKind === null) fail('UNIT_PRICE_COUNT_KIND_MISSING');
    if (category.kind === 'DURABLE' && category.specGroup === null) fail('UNIT_PRICE_DURABLE_SPEC_MISSING');
    if (['DURABLE', 'COMBO'].includes(category.kind) && quantity.value !== null && quantity.value !== 1) fail('UNIT_PRICE_PACK_SPLIT_FORBIDDEN');
    const standard = category.kind === 'MASS' ? `đồng/100g (${category.massBasis === 'NET' ? 'khối lượng tịnh' : 'khối lượng cái'})`
      : category.kind === 'VOLUME' ? 'đồng/100ml' : category.kind === 'COUNT' ? `đồng/${category.countKind}`
      : category.kind === 'DURABLE' ? `đồng/cái (${category.specGroup})` : 'đồng/combo';
    const missing = price.value === null ? 'Chưa rõ giá' : quantity.value === null ? 'Chưa rõ số lượng'
      : quantity.value === 0 ? 'Số lượng bằng không; không quy đổi' : null;
    const value = missing === null ? price.value! / quantity.value! * (['MASS', 'VOLUME'].includes(category.kind) ? 100 : 1) : null;
    if (value !== null && !Number.isFinite(value)) fail('UNIT_PRICE_NON_FINITE');
    return { rowI: record.rowI, observation, sources, value, standard, missing,
      comparisonKey: canonicalJson([observation.platform, category, standard, price.kind, price.conditions, period]),
      ownerDeclared: record.quantityOverride !== undefined };
  });
}
