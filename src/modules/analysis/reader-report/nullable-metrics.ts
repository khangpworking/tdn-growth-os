import type { ReaderReportInput } from '../../../../contracts/analysis/reader-report-input.generated.js';
import type { Bundle } from './bundle.js';
import type { Profile, NullableRow as Row } from './classify.js';

/** A complete sum is unknown if any member is missing; an empty set has observed count zero. */
export function completeSum(rows: readonly Row[], field: 'rev' | 'units'): number | null {
  return rows.some(row => row[field] === null) ? null : rows.reduce((total, row) => total + row[field]!, 0);
}
export const compatibleRatio = (a: number | null, b: number | null): number | null =>
  a === null || b === null || b === 0 ? null : a / b;

/** New reader arithmetic never combines platform frames. Missing/zero coverage is queryable in the bundle. */
export function computeNullableReaderMetrics(B: Bundle, input: ReaderReportInput, rows: Row[], profile: Profile): void {
  const set = (id: string, value: number | null, fmt = 'num'): void => {
    if (value === null) B.setMissing(id, fmt); else B.set(id, value, fmt);
  };
  B.set('src.rows', rows.length, 'num');
  for (const P of input.platforms) {
    const all = rows.filter(row => row.platform === P), core = all.filter(row => profile.core.includes(row.seg!));
    const groups = [['all', all], ['core', core], ['non', all.filter(row => !profile.core.includes(row.seg!))]] as const;
    for (const [group, members] of groups) {
      const id = `${P}.${group}`;
      B.set(`${id}.n`, members.length, 'num');
      set(`${id}.rev`, completeSum(members, 'rev'), 'ty');
      set(`${id}.units`, completeSum(members, 'units'));
      set(`${id}.asp`, compatibleRatio(completeSum(members, 'rev'), completeSum(members, 'units')), 'dong');
      for (const field of ['rev', 'units', 'asp'] as const) {
        B.set(`${id}.${field}.missing`, members.filter(row => row[field] === null).length, 'num');
        B.set(`${id}.${field}.zero`, members.filter(row => row[field] === 0).length, 'num');
      }
    }
    const denominator = completeSum(core, 'rev');
    set(`${P}.non.share`, compatibleRatio(completeSum(groups[2][1], 'rev'), completeSum(all, 'rev')) === null
      ? null : 100 * compatibleRatio(completeSum(groups[2][1], 'rev'), completeSum(all, 'rev'))!, 'pct');
    for (const k of [...profile.core, ...profile.non]) {
      const members = all.filter(row => row.seg === k), id = `${P}.seg.${k}`;
      B.set(`${id}.n`, members.length, 'num'); set(`${id}.rev`, completeSum(members, 'rev'), 'ty');
      set(`${id}.units`, completeSum(members, 'units'));
      const ratio = compatibleRatio(completeSum(members, 'rev'), denominator);
      set(`${id}.revShare`, ratio === null ? null : 100 * ratio, 'pct');
    }
    const known = core.filter(row => typeof row.start === 'string' && row.start > '1971');
    const fresh = known.filter(row => row.start! >= input.source!.measurementPeriod.start && row.start! <= input.source!.measurementPeriod.end);
    B.set(`${P}.coh.known`, known.length, 'num'); B.set(`${P}.coh.nodate`, core.length - known.length, 'num');
    set(`${P}.coh.n`, known.length === core.length ? fresh.length : null);
    set(`${P}.coh.nShare`, known.length === core.length ? compatibleRatio(fresh.length * 100, core.length) : null, 'pct');
    set(`${P}.coh.rev`, known.length === core.length ? completeSum(fresh, 'rev') : null, 'ty');
    set(`${P}.coh.revShare`, known.length === core.length ? compatibleRatio(completeSum(fresh, 'rev') === null ? null : completeSum(fresh, 'rev')! * 100, denominator) : null, 'pct');
    const sourceRevenue = input.source!.platformBreakdown[P]!.displayedRevenueVnd;
    set(`src.hl.${P}.rev`, sourceRevenue, 'ty');
    set(`src.${P}.cover`, compatibleRatio(completeSum(all, 'rev') === null ? null : completeSum(all, 'rev')! * 100, sourceRevenue), 'pct');
  }
}
