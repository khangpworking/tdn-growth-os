/**
 * Number trace map of a Market report: every number a builder prints, as
 * printed, with the raw values it came from. Builders record each token when
 * they print it; the map is stored with the report output so a later gate can
 * replay the inputs (`resolveMarketRawSource`) and scan the HTML for numbers
 * that are not in the map.
 */
import type { MarketRawSource } from './market-raw-series.js';

export const MARKET_NUMBER_TRACE_VERSION = 'market-number-trace-v1';

export interface MarketNumberTraceEntry {
  /** The number exactly as printed, e.g. «35,0 tỷ», «−5%», «20/09–19/10/2026». */
  readonly token: string;
  /** Block that prints it, e.g. `M03.kpi.30d.revenue`. */
  readonly blockId: string;
  /** `raw`: one stored value, formatted. `computed`: a declared formula over raw values. */
  readonly kind: 'raw' | 'computed';
  /** Raw-response pointers of every input value. */
  readonly inputs: readonly MarketRawSource[];
  /** Formula and rounding, e.g. `round1(value / 1e9) tỷ`, `round((cur - prev) / prev * 100)%`. */
  readonly formula: string;
}

export interface MarketNumberTrace {
  readonly contractVersion: typeof MARKET_NUMBER_TRACE_VERSION;
  readonly entries: readonly MarketNumberTraceEntry[];
}

/** Collects trace entries while a report is built; `record` returns the token so it can be printed in place. */
export class MarketNumberTraceCollector {
  readonly #entries: MarketNumberTraceEntry[] = [];

  record(token: string, blockId: string, kind: MarketNumberTraceEntry['kind'], inputs: readonly MarketRawSource[], formula: string): string {
    this.#entries.push({ token, blockId, kind, inputs: [...inputs], formula });
    return token;
  }

  get size(): number { return this.#entries.length; }

  snapshot(): MarketNumberTrace {
    return { contractVersion: MARKET_NUMBER_TRACE_VERSION, entries: this.#entries.map(entry => ({ ...entry, inputs: [...entry.inputs] })) };
  }
}
