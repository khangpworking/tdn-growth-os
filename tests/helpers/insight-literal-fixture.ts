import { createHash } from 'node:crypto';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { VerifyAutomationObservationsInput } from '../../src/modules/analysis/research-automation/verified-observations.js';
import type { VerifiedSourcePackageFile } from '../../src/modules/foundation/source-package-service.js';
export const literalRunId = '22222222-2222-4222-8222-222222222222';
export const literalWorkspaceId = '11111111-1111-4111-8111-111111111111';
export const literalSelected = { shopId: '78085196', itemId: '17678138164' };
export const literalHash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export function literalNativeFile(raw: unknown[]): VerifiedSourcePackageFile {
  const bytes = Buffer.from(canonicalJson(raw));
  return { path: 'capture/dataset.json', bytes, sha256: literalHash(bytes), byteSize: bytes.length, mediaType: 'application/json',
    evidenceFamily: 'synthetic-native-review', representationRole: 'primary', independence: 'non_independent',
    providerProvenance: 'provider_reported', provenanceBasis: 'Synthetic exact bytes; no provider or identity authenticity claim.' };
}
export function literalSellerFixture(data: Record<string, unknown> = { product_id: '101', product_region: 'vn',
  product_name: 'Sản phẩm dành cho người bận rộn', product_description: [{ text: 'Người bán nói: có an toàn không? Đây là lời giới thiệu.' }] }): VerifyAutomationObservationsInput {
  const window = { startDate: '2026-09-01', endDate: '2026-09-30' };
  const retrievedAt = '2026-10-02T00:00:01.000Z';
  const request = { region: 'VN', language: 'vi-VN', currency: 'VND', product_id: '101', date_range: '2026-09-01~2026-09-30', need_image: 1, need_extra: false };
  const response = Buffer.from(JSON.stringify({ success: true, data }));
  const envelope = { contractVersion: 'research-automation-capture-v1', captureId: 'synthetic-seller-detail', provider: 'KALODATA',
    operation: 'kalodata.product.detail', billing: 'PAID_CREDITS', method: 'POST', endpoint: 'https://www.kalodata.com/openapi/v1/tiktok/product/detail',
    requestParameters: request, requestBodyBytesBase64: Buffer.from(JSON.stringify(request)).toString('base64'), queryWindow: window,
    pageNumber: null, productRef: 'kalodata:101', requestedAt: '2026-10-02T00:00:00.000Z', completedAt: retrievedAt,
    outcome: 'OK', httpStatus: 200, responseBytesBase64: response.toString('base64'), responseSha256: literalHash(response),
    responseByteLength: response.length, providerCode: null };
  const bytes = Buffer.from(canonicalJson(envelope)), sha256 = literalHash(bytes);
  return { runId: literalRunId,
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId: literalWorkspaceId, country: 'VN', mode: 'PRODUCT', keyword: 'Synthetic', description: null,
      interview: null, requestedPeriod: { ...window, dayCount: 30 }, reports: ['INSIGHT'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId: literalWorkspaceId, runId: literalRunId, definition: 'Selected synthetic listing',
      includeTerms: [], excludeTerms: [], selectedProductIds: ['kalodata:101'], peerProductIds: [] },
    collection: { contractVersion: 'research-automation-step-result-v1', runId: literalRunId, stepId: 'COLLECTION', outcome: 'SUCCEEDED', productCards: [], comparables: [], coverage: [], limitations: [] },
    captures: [{ stepId: 'COLLECTION', ordinal: 0, artifactSha256: sha256, mediaType: 'application/vnd.tdn.research-automation.capture+json',
      provider: 'kalodata', operation: 'kalodata.product.detail', retrievedAt, window, truncated: false }], captureBytes: new Map([[sha256, bytes]]) };
}
