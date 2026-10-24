import { lint as lintReaderReport } from '../reader-report/lint.js';
import { lintVisibleReportText } from '../report-visible-text-lint.js';
import { auditMarketReportHtml, type MarketBusinessGateResult, type PartialRowTotal } from './market-business-gate.js';
import { auditMarket14 } from './market-14-rules.js';

/**
 * One check of a Market report. The caller names its situation; this module owns
 * which checks run, their order and the error text (c2, owner 24/10/2026).
 * - DRAFT_PRESENTATION: the presentation draft (reports.ts): visible-text lint on the
 *   raw page, business gate (presentation), the fourteen rules, then the public-review
 *   name rules F1/W6.
 * - DRAFT_PLAIN: any other Market draft (reports.ts): the public-review name rules only.
 * - STORED: the bytes the service is about to store (service.ts): the business gate only.
 *   It is the only gate for public-review, qualitative and private Market runs.
 */
export type MarketCheckContext =
  | { readonly kind: 'DRAFT_PRESENTATION'; readonly publicReviewSource?: boolean; readonly partialTotals?: readonly PartialRowTotal[]; readonly requireFlint?: boolean }
  | { readonly kind: 'DRAFT_PLAIN'; readonly publicReviewSource?: boolean }
  | { readonly kind: 'STORED'; readonly presentation: boolean; readonly publicReviewSource?: boolean; readonly partialTotals?: readonly PartialRowTotal[] };

export type MarketCheckRow = { readonly rule: string; readonly ok: boolean; readonly detail: string };
/** The first failing step: its ordered failed rule ids and the message `assertMarketReport` throws. */
export type MarketCheckFailure = { readonly failed: readonly string[]; readonly message: string };
export interface MarketCheckOutcome { readonly results: readonly MarketCheckRow[]; readonly failure: MarketCheckFailure | null }

type Step = () => { readonly rows: readonly MarketCheckRow[]; readonly failed: readonly string[]; readonly message: string };

function steps(html: string, context: MarketCheckContext): Step[] {
  const publicReviewSource = Boolean(context.publicReviewSource);
  const names: Step = () => {
    const rows = lintReaderReport(html, { reportKind: 'MARKET', publicReviewSource: true }).filter(r => r.rule.startsWith('F1 ') || r.rule.startsWith('W6 '));
    return { rows, failed: rows.filter(r => !r.ok).map(r => r.rule), message: 'PUBLIC_REVIEW_READER_NAME_REFUSED' };
  };
  const gateStep = (gate: readonly MarketBusinessGateResult[]): ReturnType<Step> => {
    const failed = gate.filter(check => !check.ok).map(check => check.rule);
    return { rows: gate, failed, message: `MARKET_BUSINESS_GATE_FAILED:${failed.join(',')}` };
  };
  if (context.kind === 'STORED') {
    return [() => gateStep(auditMarketReportHtml(html, { presentation: context.presentation, publicReviewSource, partialTotals: context.partialTotals ?? [] }))];
  }
  if (context.kind === 'DRAFT_PLAIN') return publicReviewSource ? [names] : [];
  // The gate runs once; the fourteen rules read its G08 and U32 rows (neither depends on presentation or totals).
  let gate: readonly MarketBusinessGateResult[] = [];
  return [
    () => {
      const rows = lintVisibleReportText(html);
      const failed = rows.filter(check => !check.ok).map(check => check.rule);
      return { rows, failed, message: `MARKET_VISIBLE_TEXT_LINT_FAILED:${failed.join(',')}` };
    },
    () => gateStep(gate = auditMarketReportHtml(html, { presentation: true, publicReviewSource, partialTotals: context.partialTotals ?? [] })),
    () => {
      const rows = auditMarket14(html, undefined, { publicReviewSource, gate, ...(context.requireFlint === undefined ? {} : { requireFlint: context.requireFlint }) });
      const failed = rows.filter(rule => rule.kind === 'machine' && !rule.ok).map(rule => rule.rule);
      return { rows, failed, message: `MARKET_14_RULES_FAILED:${failed.join(',')}` };
    },
    ...(publicReviewSource ? [names] : []),
  ];
}

/**
 * Runs the checks for `context` in order and stops at the first step with a failure, as
 * the draft path always has. A rule seen twice (U13 on the raw page and inside the gate)
 * is listed once, at its first place, and fails if either run failed.
 */
export function checkMarketReport(html: string, context: MarketCheckContext): MarketCheckOutcome {
  const results: MarketCheckRow[] = [];
  const index = new Map<string, number>();
  for (const step of steps(html, context)) {
    const { rows, failed, message } = step();
    for (const row of rows) {
      const at = index.get(row.rule);
      if (at === undefined) { index.set(row.rule, results.length); results.push({ rule: row.rule, ok: row.ok, detail: row.detail }); }
      else if (!row.ok && results[at]!.ok) results[at] = { rule: row.rule, ok: false, detail: row.detail };
    }
    if (failed.length) return { results, failure: { failed, message } };
  }
  return { results, failure: null };
}

/** Throws a TypeError with today's message for the first failing step (prefix and ordered ids). */
export function assertMarketReport(html: string, context: MarketCheckContext): void {
  const { failure } = checkMarketReport(html, context);
  if (failure) throw new TypeError(failure.message);
}

const snippetBaselines = new Map<string, ReadonlySet<string>>();
const snippetFailures = (fragment: string): string[] => auditMarketReportHtml(fragment, { presentation: false }).filter(item => !item.ok).map(item => item.rule);
/** A page fragment passes when the plain business gate fails it on no rule that `baseline` (a benign fragment) passes. */
export function marketSnippetPasses(fragment: string, baseline: string): boolean {
  let allowed = snippetBaselines.get(baseline);
  if (!allowed) snippetBaselines.set(baseline, allowed = new Set(snippetFailures(baseline)));
  return snippetFailures(fragment).every(rule => allowed.has(rule));
}
