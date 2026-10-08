/**
 * Pure estimated-balance model for the optional document-indexing connector.
 * All money is integer micro-dollars; there are no floats, no dates and no I/O,
 * so the estimate is deterministic and trivially testable.
 */
export type PageIndexBalanceState = 'OK' | 'WARNING' | 'BLOCKED';

/** Rates and thresholds. Every field is configurable; defaults follow the P3 package spec. */
export interface PageIndexBalanceConfig {
  readonly indexedCostMicroDollarsPerPage: number;
  readonly activeCostMicroDollarsPerPagePerMonth: number;
  readonly freeActivePages: number;
  readonly warningFraction: number;
  readonly warningAbsoluteMicroDollars: number;
  readonly blockedMicroDollars: number;
}

export const DEFAULT_PAGEINDEX_BALANCE_CONFIG: PageIndexBalanceConfig = {
  indexedCostMicroDollarsPerPage: 10_000,
  activeCostMicroDollarsPerPagePerMonth: 1000,
  freeActivePages: 1000,
  warningFraction: 0.2,
  warningAbsoluteMicroDollars: 2_000_000,
  blockedMicroDollars: 500_000,
};

export interface PageIndexBalanceInput {
  readonly startingCreditMicroDollars: number;
  readonly indexedPagesTotal: number;
  readonly activePages: number;
  /** Share of the month the active pages were stored, 0..1. Defaults to 1. */
  readonly activeMonthFraction?: number;
  readonly config?: Partial<PageIndexBalanceConfig>;
}

export interface PageIndexBalanceEstimate {
  readonly balanceMicroDollars: number;
  readonly indexedCostMicroDollars: number;
  readonly activeCostMicroDollars: number;
  /** Full-month active-page cost at the current page count, before proration. */
  readonly estimatedMonthlyCostMicroDollars: number;
  readonly state: PageIndexBalanceState;
  /** True for WARNING and BLOCKED. Uploads must stop while this is true. */
  readonly lowBalance: boolean;
}

export type PageIndexBalanceErrorCode = 'INVALID_BALANCE_INPUT';

export class PageIndexBalanceError extends Error {
  constructor(readonly code: PageIndexBalanceErrorCode) {
    super(`PageIndex balance rejected: ${code}`);
    this.name = 'PageIndexBalanceError';
  }
}

/**
 * Estimates the remaining document-indexing credit.
 *
 * balance = starting credit − $0.01 per indexed page − $0.001 per active page
 * per month, prorated by `activeMonthFraction`, with the first 1000 active
 * pages free. WARNING at ≤ max(20%, $2); BLOCKED at ≤ $0.50.
 */
export function estimatePageIndexBalance(input: PageIndexBalanceInput): PageIndexBalanceEstimate {
  const config: PageIndexBalanceConfig = { ...DEFAULT_PAGEINDEX_BALANCE_CONFIG, ...input.config };
  const fraction = input.activeMonthFraction ?? 1;
  const nonNegative: readonly number[] = [
    input.startingCreditMicroDollars,
    input.indexedPagesTotal,
    input.activePages,
    config.indexedCostMicroDollarsPerPage,
    config.activeCostMicroDollarsPerPagePerMonth,
    config.freeActivePages,
    config.warningAbsoluteMicroDollars,
    config.blockedMicroDollars,
  ];
  for (const value of nonNegative) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
      throw new PageIndexBalanceError('INVALID_BALANCE_INPUT');
    }
  }
  if (typeof config.warningFraction !== 'number' || !(config.warningFraction > 0) || !(config.warningFraction <= 1)) {
    throw new PageIndexBalanceError('INVALID_BALANCE_INPUT');
  }
  if (typeof fraction !== 'number' || Number.isNaN(fraction) || fraction < 0 || fraction > 1) {
    throw new PageIndexBalanceError('INVALID_BALANCE_INPUT');
  }
  const billablePages = Math.max(0, input.activePages - config.freeActivePages);
  const indexedCostMicroDollars = input.indexedPagesTotal * config.indexedCostMicroDollarsPerPage;
  if (!Number.isSafeInteger(indexedCostMicroDollars)) throw new PageIndexBalanceError('INVALID_BALANCE_INPUT');
  const estimatedMonthlyCostMicroDollars = billablePages * config.activeCostMicroDollarsPerPagePerMonth;
  if (!Number.isSafeInteger(estimatedMonthlyCostMicroDollars)) throw new PageIndexBalanceError('INVALID_BALANCE_INPUT');
  const activeCostMicroDollars = Math.round(estimatedMonthlyCostMicroDollars * fraction);
  const balanceMicroDollars = input.startingCreditMicroDollars - indexedCostMicroDollars - activeCostMicroDollars;
  const warningAt = Math.max(
    Math.ceil(input.startingCreditMicroDollars * config.warningFraction),
    config.warningAbsoluteMicroDollars,
  );
  const state: PageIndexBalanceState =
    balanceMicroDollars <= config.blockedMicroDollars ? 'BLOCKED'
    : balanceMicroDollars <= warningAt ? 'WARNING'
    : 'OK';
  return {
    balanceMicroDollars,
    indexedCostMicroDollars,
    activeCostMicroDollars,
    estimatedMonthlyCostMicroDollars,
    state,
    lowBalance: state !== 'OK',
  };
}

/** Accrued storage is integrated over calendar months, including earlier months.
 * Reservations without an acknowledgement remain conservatively billable. */
export function estimatePageIndexLedgerBalance(input: {
  startingCreditMicroDollars: number;
  now: Date;
  documents: readonly { pageCount: number; uploadAttempted: boolean; uploadAttemptedAt: string | null }[];
}): PageIndexBalanceEstimate {
  const end = input.now.getTime();
  if (!Number.isFinite(end)) throw new PageIndexBalanceError('INVALID_BALANCE_INPUT');
  const events = input.documents.filter(row => row.uploadAttempted).map(row => {
    const at = Date.parse(row.uploadAttemptedAt ?? '');
    if (!Number.isFinite(at) || at > end || !Number.isSafeInteger(row.pageCount) || row.pageCount < 1)
      throw new PageIndexBalanceError('INVALID_BALANCE_INPUT');
    return { at, pages: row.pageCount };
  }).sort((a, b) => a.at - b.at);
  let active = 0; let accrued = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!; active += event.pages;
    const until = events[index + 1]?.at ?? end;
    let from = event.at;
    // Bound date/accounting work independently of malformed external timestamps.
    if (end - from > 100 * 366 * 86400_000) throw new PageIndexBalanceError('INVALID_BALANCE_INPUT');
    while (from < until) {
      const date = new Date(from);
      const monthStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
      const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
      const to = Math.min(until, nextMonth);
      accrued += Math.max(0, active - DEFAULT_PAGEINDEX_BALANCE_CONFIG.freeActivePages) *
        DEFAULT_PAGEINDEX_BALANCE_CONFIG.activeCostMicroDollarsPerPagePerMonth * (to - from) / (nextMonth - monthStart);
      from = to;
    }
  }
  const base = estimatePageIndexBalance({ startingCreditMicroDollars: input.startingCreditMicroDollars,
    indexedPagesTotal: active, activePages: active, activeMonthFraction: 0 });
  const activeCostMicroDollars = Math.round(accrued);
  if (!Number.isSafeInteger(activeCostMicroDollars)) throw new PageIndexBalanceError('INVALID_BALANCE_INPUT');
  const balanceMicroDollars = base.balanceMicroDollars - activeCostMicroDollars;
  const warning = Math.max(Math.ceil(input.startingCreditMicroDollars * DEFAULT_PAGEINDEX_BALANCE_CONFIG.warningFraction),
    DEFAULT_PAGEINDEX_BALANCE_CONFIG.warningAbsoluteMicroDollars);
  const state: PageIndexBalanceState = balanceMicroDollars <= DEFAULT_PAGEINDEX_BALANCE_CONFIG.blockedMicroDollars ? 'BLOCKED' : balanceMicroDollars <= warning ? 'WARNING' : 'OK';
  return { ...base, activeCostMicroDollars, balanceMicroDollars, state, lowBalance: state !== 'OK' };
}
