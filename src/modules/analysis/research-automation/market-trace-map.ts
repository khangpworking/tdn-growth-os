/**
 * Number trace map of a Market report: every number a builder prints, as
 * printed, with the raw values it came from. Builders record each token when
 * they print it; the map is stored with the report output so a later gate can
 * replay the inputs (`resolveMarketRawSource` on the capture each input names)
 * and scan the HTML for numbers that are not in the map.
 *
 * Coverage: the raw-number blocks (`.market-raw-scale`, `.market-capture-scope`).
 * Exhibit labels the reader adds later («Hình 3.1», «Bảng 3.1») are labels, not numbers.
 */
import type { MarketRawSource } from './market-raw-series.js';

export const MARKET_NUMBER_TRACE_VERSION = 'market-number-trace-v1';

/** A raw-response pointer inside one stored capture. */
export interface MarketTraceInput extends MarketRawSource {
  /** Identity of the stored raw-responses capture the pointer is read in (e.g. its capture artifact sha256). */
  readonly captureId: string;
}

export interface MarketNumberTraceEntry {
  /** The number exactly as printed, e.g. «35,0 tỷ», «−5%», «20/09–19/10/2026». */
  readonly token: string;
  /** Block that prints it, e.g. `M03.30d.kpi.revenue`. */
  readonly blockId: string;
  /** `raw`: one stored value, formatted. `computed`: a declared formula over raw values. */
  readonly kind: 'raw' | 'computed';
  /** Capture and raw-response pointer of every input value; never empty. */
  readonly inputs: readonly MarketTraceInput[];
  /** Formula and rounding, e.g. `round1(value / 1e9) tỷ`, `round((cur - prev) / prev * 100)%`. */
  readonly formula: string;
}

export interface MarketNumberTrace {
  readonly contractVersion: typeof MARKET_NUMBER_TRACE_VERSION;
  readonly entries: readonly MarketNumberTraceEntry[];
}

/** Records the numbers of one capture; `record` returns the token so it can be printed in place. */
export interface MarketCaptureTrace {
  record(token: string, blockId: string, kind: MarketNumberTraceEntry['kind'], inputs: readonly MarketRawSource[], formula: string): string;
}

/** Collects trace entries while a report is built. */
export class MarketNumberTraceCollector {
  readonly #entries: MarketNumberTraceEntry[] = [];

  /** Recorder whose input pointers all belong to the capture `captureId`. */
  forCapture(captureId: string): MarketCaptureTrace {
    return { record: (token, blockId, kind, inputs, formula) => {
      // A number without a raw input cannot be replayed, so it is never printed.
      if (!inputs.length) throw new TypeError(`MARKET_TRACE_INPUTS_MISSING:${blockId}`);
      this.#entries.push({ token, blockId, kind, inputs: inputs.map(input => ({ ...input, captureId })), formula });
      return token;
    } };
  }

  get size(): number { return this.#entries.length; }

  snapshot(): MarketNumberTrace {
    return { contractVersion: MARKET_NUMBER_TRACE_VERSION, entries: this.#entries.map(entry => ({ ...entry, inputs: [...entry.inputs] })) };
  }
}
