/**
 * Trace inputs for Market numbers read from stored sources other than raw
 * responses (P5): the capture table (results-page snapshot rows and scope),
 * the run record and other stored source records. Builders pass them to
 * `traceMarketNumber` when they print a number.
 */
import { traceMarketNumber, type MarketStoredSourceKind, type MarketStoredTraceInput, type MarketTraceRole, type MarketTraceValue } from './market-trace-map.js';

export function storedInput(store: MarketStoredSourceKind, identity: string, pointer: string, value: MarketTraceValue, role?: MarketTraceRole): MarketStoredTraceInput {
  return role ? { store, identity, pointer, value, role } : { store, identity, pointer, value };
}

/** A capture-table row: its stored revenue (or `title` when it has none), at the row's own source pointer. */
export interface MarketTraceRow {
  readonly source: { readonly sourceSha256: string; readonly locator: string };
  readonly revenue?: { readonly value: string | null; readonly source?: { readonly sourceSha256: string; readonly locator: string } };
  readonly title?: string;
}

/** One input per row; revenue rows point at their revenue cell. */
export function rowInputs(rows: readonly MarketTraceRow[], role?: MarketTraceRole): MarketStoredTraceInput[] {
  return rows.map(row => {
    const cell = row.revenue?.source ?? row.source;
    const value = row.revenue?.value ?? row.title ?? '';
    return storedInput('capture-table', cell.sourceSha256, cell.locator, row.revenue?.value !== undefined && row.revenue.value !== null ? Number(value) : value, role);
  });
}

/** Start and end of a stored capture scope (`/scope/period/...` of the snapshot). */
export function scopePeriodInputs(identity: string, scope: { readonly start: string; readonly end: string }): MarketStoredTraceInput[] {
  return [storedInput('capture-table', identity, '/scope/period/startDate', scope.start, 'start'), storedInput('capture-table', identity, '/scope/period/endDate', scope.end, 'end')];
}

/** The capture time of a stored snapshot. */
export const capturedAtInput = (identity: string, value: string): MarketStoredTraceInput => storedInput('capture-table', identity, '/capturedAt', value);

/**
 * The visible row label «Dòng N» of a capture sample row (`captureRowRefLabel`), its number recorded as the row's
 * 0-based position in its platform's stored record list (`identity`: that method input) plus one.
 */
export function tracedRowRefLabel(index: number, blockId: string, identity: string): string {
  return `Dòng ${traceMarketNumber(String(index + 1), blockId, 'computed', [storedInput('stored-source', identity, `/input/records/${index}`, index, 'offset')],
    'position of the row in its platform’s stored record list + 1', 'row-number')}`;
}
