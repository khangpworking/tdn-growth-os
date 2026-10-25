/**
 * Number trace map of a Market report: every number a builder prints, as
 * printed, with the stored values it came from and the declared formula that
 * turns them into the printed text. Builders record each token when they print
 * it; the map is stored with the report output, and the number-trace gate
 * (`market-number-trace.ts`) replays every formula and scans the delivered
 * HTML for numbers that are not in the map.
 *
 * v1 (P4): raw-response inputs only, free-text formula. v2: an input may also
 * point at a capture table, the run record or another stored source record;
 * inputs carry the value read at the pointer and entries name a registered
 * formula. v1 maps stay readable: their entries have no `formulaId`.
 *
 * Exhibit labels the reader adds later («Hình 3.1», «Bảng 3.1») are labels, not numbers.
 */
import type { MarketRawSource } from './market-raw-series.js';

export const MARKET_NUMBER_TRACE_VERSION = 'market-number-trace-v2';
/** Every trace-map version a stored report may carry. */
export const MARKET_NUMBER_TRACE_VERSIONS = ['market-number-trace-v1', MARKET_NUMBER_TRACE_VERSION] as const;

/** Value read at an input's pointer: a number, a stored text or date, or a stored list (e.g. requested platforms). */
export type MarketTraceValue = number | string | readonly (number | string)[];

/** What an input stands for in its formula, e.g. the current and the previous side of a change. */
export type MarketTraceRole = 'current' | 'previous' | 'part' | 'total' | 'start' | 'end' | 'base' | 'offset';

interface MarketTraceInputValue {
  /** The value the builder read at the pointer; the gate replays the formula on it. */
  readonly value?: MarketTraceValue;
  readonly role?: MarketTraceRole;
}

/** A raw-response pointer inside one stored capture. */
export interface MarketRawTraceInput extends MarketRawSource, MarketTraceInputValue {
  /** Identity of the stored raw-responses capture the pointer is read in (e.g. its capture artifact sha256). */
  readonly captureId: string;
}

/**
 * Stores a number may come from besides raw responses:
 * - `capture-table`: a row of the stored capture table (identity: snapshot or source sha256; pointer: row locator);
 * - `run-record`: a field of the run record (identity: run id; pointer: field path, e.g. `/createdAt`);
 * - `stored-source`: another stored source record (identity: its sha256 or id; pointer inside it).
 */
export type MarketStoredSourceKind = 'capture-table' | 'run-record' | 'stored-source';

export interface MarketStoredTraceInput extends MarketTraceInputValue {
  readonly store: MarketStoredSourceKind;
  readonly identity: string;
  readonly pointer: string;
}

export type MarketTraceInput = MarketRawTraceInput | MarketStoredTraceInput;

/** Formulas the gate can replay (implementations: `MARKET_TRACE_FORMULAS` in market-number-trace.ts). */
export type MarketTraceFormulaId =
  | 'as-stored' | 'money' | 'count-scaled' | 'sum-money' | 'sum-count' | 'change-percent' | 'share-percent' | 'share-percent-1'
  | 'count' | 'date-range' | 'previous-range' | 'period-length' | 'month-year' | 'vi-date' | 'quarter' | 'year'
  | 'vi-number' | 'millions-vnd' | 'date-plus-days' | 'vn-day' | 'day-count' | 'chart-label' | 'axis-tick' | 'sum-number' | 'search-week' | 'search-day' | 'vi-date-range' | 'reader-money' | 'reader-count' | 'reader-decimal';

export interface MarketNumberTraceEntry {
  /** The number exactly as printed, e.g. «35,0 tỷ», «−5%», «20/09–19/10/2026». */
  readonly token: string;
  /** Block that prints it, e.g. `M03.30d.kpi.revenue`; its first segment is the report block (`M03`, `page`). */
  readonly blockId: string;
  /** `raw`: one stored value, formatted. `computed`: a declared formula over stored values. */
  readonly kind: 'raw' | 'computed';
  /** Pointer (and value) of every input; never empty. */
  readonly inputs: readonly MarketTraceInput[];
  /** Formula and rounding in words, e.g. `round1(value / 1e9) tỷ`, `round((cur - prev) / prev * 100)%`. */
  readonly formula: string;
  /** Registered formula the gate replays; absent on v1 entries. */
  readonly formulaId?: MarketTraceFormulaId;
}

export interface MarketNumberTrace {
  readonly contractVersion: (typeof MARKET_NUMBER_TRACE_VERSIONS)[number];
  readonly entries: readonly MarketNumberTraceEntry[];
}

/** Records the numbers of one capture; `record` returns the token so it can be printed in place. */
export interface MarketCaptureTrace {
  record(token: string, blockId: string, kind: MarketNumberTraceEntry['kind'], inputs: readonly (MarketRawSource & MarketTraceInputValue)[], formula: string, formulaId: MarketTraceFormulaId): string;
}

/** Collects trace entries while a report is built. */
export class MarketNumberTraceCollector {
  readonly #entries: MarketNumberTraceEntry[] = [];

  /** Records one printed number and returns it. A number without an input cannot be replayed, so it is never printed. */
  record(token: string, blockId: string, kind: MarketNumberTraceEntry['kind'], inputs: readonly MarketTraceInput[], formula: string, formulaId: MarketTraceFormulaId): string {
    if (!inputs.length) throw new TypeError(`MARKET_TRACE_INPUTS_MISSING:${blockId}`);
    this.#entries.push({ token, blockId, kind, inputs: [...inputs], formula, formulaId });
    return token;
  }

  /** Recorder whose input pointers all belong to the raw-responses capture `captureId`. */
  forCapture(captureId: string): MarketCaptureTrace {
    return { record: (token, blockId, kind, inputs, formula, formulaId) =>
      this.record(token, blockId, kind, inputs.map(input => ({ ...input, captureId })), formula, formulaId) };
  }

  get size(): number { return this.#entries.length; }

  snapshot(): MarketNumberTrace {
    return { contractVersion: MARKET_NUMBER_TRACE_VERSION, entries: this.#entries.map(entry => ({ ...entry, inputs: [...entry.inputs] })) };
  }
}

// The report builder is synchronous; while it runs, blocks deep in the call
// tree record into the collector it opened instead of threading it through.
let active: MarketNumberTraceCollector | null = null;

/** Runs `build` with `collector` as the collector `traceMarketNumber` records into. */
export function withMarketNumberTrace<T>(collector: MarketNumberTraceCollector | null, build: () => T): T {
  const previous = active;
  active = collector;
  try { return build(); } finally { active = previous; }
}

/**
 * Records a printed number into the collector of the report being built and returns the token.
 * Outside a traced build (no raw-response series) it only returns the token, so legacy bytes stay as they were.
 */
export function traceMarketNumber(token: string, blockId: string, kind: MarketNumberTraceEntry['kind'], inputs: readonly MarketTraceInput[], formula: string, formulaId: MarketTraceFormulaId): string {
  return active ? active.record(token, blockId, kind, inputs, formula, formulaId) : token;
}

/** Whether a traced build is running (blocks skip building inputs otherwise). */
export const marketNumberTraceActive = (): boolean => active !== null;
