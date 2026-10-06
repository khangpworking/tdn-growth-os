import { createHash } from 'node:crypto';
import { isUtf8 } from 'node:buffer';
import { canonicalJson } from '../../foundation/canonical-json.js';
import {
  MAX_CAPTURE_BYTES, MAX_CAPTURE_ENVELOPE_BYTES, MAX_CAPTURES_PER_STEP, MAX_PERIOD_DAYS,
  ResearchAutomationIntegrityError,
  type CaptureRecord, type ScopeSnapshot, type StartSnapshot, type StepResultDocument, type TypedComparable,
} from './model.js';
import { parseProviderProductRef } from './provider-common.js';
import { KALODATA_LIMITS } from './provider-kalodata.js';
import type { DateWindow } from './providers.js';

export interface VerifiedAutomationObservation {
  readonly comparable: TypedComparable;
  readonly evidence: {
    readonly captureSha256: string;
    readonly responseSha256: string;
    /** JSON Pointer into the exact retained response bytes. */
    readonly responseLocator: string;
    readonly requestWindow: DateWindow;
    readonly providerProductId: string;
    /** Original capture classification; INVALID_PAYLOAD is admitted only after raw revalidation. */
    readonly retainedOutcome: 'OK' | 'INVALID_PAYLOAD';
  };
  readonly sourceWording: string;
  readonly measureLiteral: 'revenue' | 'sales_volumn' | 'sales_volume';
  readonly entityLabel: string | null;
}

export interface VerifyAutomationObservationsInput {
  readonly runId: string;
  readonly start: StartSnapshot;
  readonly scope: ScopeSnapshot;
  readonly collection: StepResultDocument | null;
  readonly captures: readonly CaptureRecord[];
  readonly captureBytes: ReadonlyMap<string, Buffer>;
}

/** A successful, scope-bound detail exchange, including price-only responses. */
export interface VerifiedAutomationDetailCapture {
  readonly capture: CaptureRecord;
  readonly productRef: string;
  readonly providerProductId: string;
  readonly retainedOutcome: 'OK' | 'INVALID_PAYLOAD';
  readonly requestBytes: Buffer;
  readonly responseBytes: Buffer;
  readonly request: Readonly<Record<string, unknown>>;
  readonly data: Readonly<Record<string, unknown>>;
}

export function verifyAutomationDetailCaptures(input: VerifyAutomationObservationsInput): readonly VerifiedAutomationDetailCapture[] {
  const byOrdinal = verifyInventory(input);
  if (input.collection === null) return [];
  const approved = new Set([...input.scope.selectedProductIds, ...input.scope.peerProductIds]);
  const result: VerifiedAutomationDetailCapture[] = [];
  for (const capture of [...byOrdinal.values()].sort((a, b) => a.ordinal - b.ordinal)) {
    // Never interpret an unknown provider/operation as a Kalodata detail payload.
    if (capture.provider !== 'kalodata' || capture.operation !== 'kalodata.product.detail') continue;
    const bytes = input.captureBytes.get(capture.artifactSha256);
    const envelope = verifyEnvelopeBytes(capture, bytes);
    if (['PROVIDER_REJECTED', 'HTTP_ERROR', 'OVERSIZE', 'CREDENTIAL_ECHO_REFUSED', 'TIMEOUT_AMBIGUOUS', 'TRANSPORT_AMBIGUOUS', 'ABORTED_AMBIGUOUS'].includes(envelope.outcome as string)) continue;
    const days = capture.window === null ? NaN : windowDays(capture.window);
    if (capture.truncated !== false || capture.mediaType !== 'application/vnd.tdn.research-automation.capture+json' ||
        !Number.isSafeInteger(days) || days < 1 || days > KALODATA_LIMITS.rankWindowMaxDays || !capture.window ||
        capture.window.startDate < input.start.requestedPeriod.startDate || capture.window.endDate > input.start.requestedPeriod.endDate) {
      fail('Observation detail capture window or representation is incompatible.');
    }
    const parsed = verifyCapture(capture, bytes);
    const ref = parseProviderProductRef(parsed.envelope.productRef);
    if (!ref || !approved.has(parsed.envelope.productRef as string) || parsed.data.product_id !== ref.sourceProductId) {
      fail('Observation response product does not match its approved product.');
    }
    result.push({ capture, productRef: parsed.envelope.productRef as string, providerProductId: ref.sourceProductId,
      retainedOutcome: parsed.envelope.outcome as 'OK' | 'INVALID_PAYLOAD', requestBytes: parsed.requestBytes,
      responseBytes: parsed.responseBytes, request: parsed.request, data: parsed.data });
  }
  return result;
}

/** Verifies supported measures against retained HTTP bytes before method admission. */
export function verifyAutomationObservations(input: VerifyAutomationObservationsInput): readonly VerifiedAutomationObservation[] {
  const byOrdinal = verifyInventory(input);
  const { start, scope, collection, captureBytes } = input;
  if (collection === null) return [];
  const approved = new Set([...scope.selectedProductIds, ...scope.peerProductIds]);
  const seen = new Set<string>();
  const verifiedCaptures = new Map<number, ReturnType<typeof verifyCapture>>();
  return collection.comparables.map(comparable => {
    const ref = parseProviderProductRef(comparable.productId);
    if (!ref || comparable.provider !== 'kalodata' || !approved.has(comparable.productId) ||
        (comparable.metric !== 'GMV_VND' && comparable.metric !== 'UNITS_SOLD')) {
      fail('Observation provider, product or measure is not supported or approved.');
    }
    const window = comparable.window;
    const duration = windowDays(window);
    if (!Number.isSafeInteger(duration) || duration < 1 || duration > KALODATA_LIMITS.rankWindowMaxDays ||
        window.startDate < start.requestedPeriod.startDate || window.endDate > start.requestedPeriod.endDate) {
      fail('Observation window is outside the supported requested period.');
    }
    if (typeof comparable.value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(comparable.value)) {
      fail('Observation amount is outside the supported decimal range.');
    }
    const key = JSON.stringify([comparable.productId, comparable.metric, window.startDate, window.endDate]);
    if (seen.has(key)) fail('Observation product metric window is duplicated.');
    seen.add(key);
    const capture = byOrdinal.get(comparable.captureIndex);
    if (!Number.isSafeInteger(comparable.captureIndex) || !capture || capture.truncated !== false ||
        capture.provider !== 'kalodata' || capture.operation !== 'kalodata.product.detail' ||
        capture.mediaType !== 'application/vnd.tdn.research-automation.capture+json' || !sameWindow(capture.window, window)) {
      fail('Observation references an incompatible collection capture.');
    }
    let parsed = verifiedCaptures.get(capture.ordinal);
    if (!parsed) {
      parsed = verifyCapture(capture, captureBytes.get(capture.artifactSha256));
      verifiedCaptures.set(capture.ordinal, parsed);
    }
    const { envelope, data } = parsed;
    if (envelope.productRef !== comparable.productId || data.product_id !== ref.sourceProductId) {
      fail('Observation response product does not match its approved product.');
    }
    const field = comparable.metric === 'GMV_VND' ? 'revenue'
      : data.sales_volumn !== undefined && data.sales_volumn !== null ? 'sales_volumn' : 'sales_volume';
    const value = data[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER ||
        (comparable.metric === 'UNITS_SOLD' && !Number.isSafeInteger(value)) || String(value) !== comparable.value) {
      fail('Observation amount does not match its actual provider field.');
    }
    return {
      comparable,
      evidence: {
        captureSha256: capture.artifactSha256,
        responseSha256: envelope.responseSha256 as string,
        responseLocator: `/data/${field}`,
        requestWindow: { startDate: window.startDate, endDate: window.endDate },
        providerProductId: ref.sourceProductId,
        retainedOutcome: envelope.outcome as 'OK' | 'INVALID_PAYLOAD',
      },
      sourceWording: JSON.stringify({ [field]: value }),
      measureLiteral: field,
      entityLabel: typeof data.product_name === 'string' && /\S/.test(data.product_name) &&
        data.product_name.length <= KALODATA_LIMITS.nameMaxChars ? data.product_name : null,
    };
  });
}

function verifyInventory(input: VerifyAutomationObservationsInput): Map<number, CaptureRecord> {
  const { runId, start, scope, collection, captures, captureBytes } = input;
  const days = windowDays(start.requestedPeriod);
  if (!runId || start.contractVersion !== 'research-automation-start-snapshot-v1' || start.country !== 'VN' ||
      scope.contractVersion !== 'research-automation-scope-snapshot-v1' || scope.runId !== runId ||
      scope.workspaceId !== start.workspaceId || !Number.isSafeInteger(days) || days < 1 || days > MAX_PERIOD_DAYS || start.requestedPeriod.dayCount !== days) {
    fail('Observation run, scope or requested period is inconsistent.');
  }
  if (!Array.isArray(scope.selectedProductIds) || scope.selectedProductIds.length > 4 ||
      !Array.isArray(scope.peerProductIds) || scope.peerProductIds.length > 8 ||
      [...scope.selectedProductIds, ...scope.peerProductIds].some(ref => !parseProviderProductRef(ref))) {
    fail('Observation approved product references are invalid.');
  }
  if (captures.length > MAX_CAPTURES_PER_STEP * 2 || captureBytes.size > MAX_CAPTURES_PER_STEP * 2) {
    fail('Observation capture inventory exceeds its bound.');
  }
  const byOrdinal = new Map<number, CaptureRecord>();
  let quickCount = 0;
  for (const capture of captures) {
    if (!Number.isSafeInteger(capture.ordinal) || capture.ordinal < 0 || capture.ordinal >= MAX_CAPTURES_PER_STEP) {
      fail('Observation capture ordinal is invalid.');
    }
    if (capture.stepId === 'QUICK_SEARCH') {
      quickCount += 1;
      if (quickCount > MAX_CAPTURES_PER_STEP) fail('Observation capture inventory exceeds its bound.');
    } else if (capture.stepId === 'COLLECTION') {
      if (byOrdinal.has(capture.ordinal)) fail('Observation collection capture ordinal is duplicated.');
      byOrdinal.set(capture.ordinal, capture);
    } else fail('Observation capture step is invalid.');
  }
  if (collection !== null && (collection.contractVersion !== 'research-automation-step-result-v1' || collection.runId !== runId ||
      collection.stepId !== 'COLLECTION' || !Array.isArray(collection.comparables) ||
      collection.comparables.length > MAX_CAPTURES_PER_STEP * 2)) {
    fail('Observation collection identity or bound is invalid.');
  }
  return byOrdinal;
}

function verifyEnvelopeBytes(capture: CaptureRecord, bytes: Buffer | undefined): Record<string, unknown> {
  if (!bytes || bytes.byteLength > MAX_CAPTURE_ENVELOPE_BYTES || !/^[a-f0-9]{64}$/.test(capture.artifactSha256) ||
      hash(bytes) !== capture.artifactSha256) fail('Observation capture bytes are missing, oversized or have a different digest.');
  const envelope = jsonObject(bytes, 'capture envelope');
  try {
    if (canonicalJson(envelope) !== bytes.toString('utf8')) fail('Observation capture envelope is not canonical JSON.');
  } catch (error) {
    if (error instanceof ResearchAutomationIntegrityError) throw error;
    fail('Observation capture envelope cannot be canonicalized.');
  }
  return envelope;
}

function verifyCapture(capture: CaptureRecord, bytes: Buffer | undefined): { envelope: Record<string, unknown>; data: Record<string, unknown>; request: Record<string, unknown>; requestBytes: Buffer; responseBytes: Buffer } {
  const envelope = verifyEnvelopeBytes(capture, bytes);
  const requestedAt = typeof envelope.requestedAt === 'string' ? Date.parse(envelope.requestedAt) : NaN;
  const completedAt = typeof envelope.completedAt === 'string' ? Date.parse(envelope.completedAt) : NaN;
  if (envelope.contractVersion !== 'research-automation-capture-v1' || envelope.provider !== 'KALODATA' ||
      envelope.operation !== capture.operation || envelope.completedAt !== capture.retrievedAt ||
      !sameWindow(envelope.queryWindow, capture.window) || !Number.isFinite(requestedAt) || !Number.isFinite(completedAt) ||
      requestedAt > completedAt || typeof envelope.captureId !== 'string' || envelope.captureId.length < 1 || envelope.captureId.length > 160 ||
      envelope.method !== 'POST' || envelope.endpoint !== `${KALODATA_LIMITS.origin}/openapi/v1/tiktok/product/detail` ||
      envelope.billing !== 'PAID_CREDITS' || envelope.pageNumber !== null ||
      (envelope.outcome !== 'OK' && envelope.outcome !== 'INVALID_PAYLOAD') ||
      !Number.isInteger(envelope.httpStatus) || Number(envelope.httpStatus) < 200 || Number(envelope.httpStatus) > 299) {
    fail('Observation capture metadata does not match a successful Kalodata detail exchange.');
  }
  const requestBytes = decodeBytes(envelope.requestBodyBytesBase64, MAX_CAPTURE_BYTES, 'request');
  const request = jsonObject(requestBytes, 'request');
  if (!record(envelope.requestParameters) || canonicalJson(request) !== canonicalJson(envelope.requestParameters) ||
      request.region !== 'VN' || request.currency !== 'VND' || !capture.window ||
      request.date_range !== `${capture.window.startDate}~${capture.window.endDate}` ||
      !parseProviderProductRef(envelope.productRef) || request.product_id !== parseProviderProductRef(envelope.productRef)!.sourceProductId) {
    fail('Observation request country, currency, product or dates are inconsistent.');
  }
  const response = decodeBytes(envelope.responseBytesBase64, Math.min(MAX_CAPTURE_BYTES, KALODATA_LIMITS.maxResponseBytes), 'response');
  if (envelope.responseByteLength !== response.byteLength || typeof envelope.responseSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(envelope.responseSha256) || hash(response) !== envelope.responseSha256) {
    fail('Observation response length or digest is inconsistent.');
  }
  const payload = jsonObject(response, 'response');
  if (payload.success !== true || !record(payload.data)) fail('Observation response has no successful provider record.');
  const data = payload.data;
  // Region may be absent in this supported response. Scope then comes from the exact request.
  if ((data.product_region !== undefined && data.product_region !== null &&
        !(typeof data.product_region === 'string' && /^vn$/i.test(data.product_region))) ||
      (data.currency !== undefined && data.currency !== null && data.currency !== request.currency) ||
      (data.date_range !== undefined && data.date_range !== null && data.date_range !== request.date_range)) {
    fail('Observation response contradicts its requested country, currency or dates.');
  }
  return { envelope, data, request, requestBytes, responseBytes: response };
}

function decodeBytes(value: unknown, max: number, label: string): Buffer {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 || value.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    fail(`Observation ${label} bytes are missing or invalid base64.`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength > max || bytes.toString('base64') !== value) fail(`Observation ${label} bytes exceed their bound or are invalid base64.`);
  return bytes;
}

function jsonObject(bytes: Buffer, label: string): Record<string, unknown> {
  if (!isUtf8(bytes)) fail(`Observation ${label} bytes are not valid UTF-8.`);
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); }
  catch { fail(`Observation ${label} bytes are not valid JSON.`); }
  if (!record(value)) fail(`Observation ${label} is not a JSON object.`);
  return value;
}

function windowDays(value: DateWindow): number {
  if (!record(value) || !validDate(value.startDate) || !validDate(value.endDate)) return NaN;
  return (Date.parse(value.endDate) - Date.parse(value.startDate)) / 86_400_000 + 1;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function sameWindow(left: unknown, right: DateWindow | null): boolean {
  return right !== null && record(left) && left.startDate === right.startDate && left.endDate === right.endDate;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hash(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function fail(message: string): never { throw new ResearchAutomationIntegrityError(message); }
