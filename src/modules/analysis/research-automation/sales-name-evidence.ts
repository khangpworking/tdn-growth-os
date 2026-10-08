import { createHash } from 'node:crypto';
import type { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import { MAX_CAPTURE_ENVELOPE_BYTES, ResearchAutomationIntegrityError, type CaptureRecord, type ScopeSnapshot } from './model.js';
import type { KeywordListDraftSalesRef } from '../keyword-list-draft-record.js';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function decodeSalesCapture(envelope: Record<string, unknown>): { bytes: Buffer; value: unknown } {
  if (envelope.contractVersion !== 'research-automation-capture-v1' || envelope.provider !== 'KALODATA' ||
      !['kalodata.product.rank', 'kalodata.product.detail'].includes(String(envelope.operation)) || envelope.outcome !== 'OK' ||
      typeof envelope.responseBytesBase64 !== 'string') throw new ResearchAutomationIntegrityError('Sales capture is unavailable');
  const bytes = Buffer.from(envelope.responseBytesBase64, 'base64');
  if (bytes.toString('base64') !== envelope.responseBytesBase64 || hash(bytes) !== envelope.responseSha256 || bytes.length !== envelope.responseByteLength)
    throw new ResearchAutomationIntegrityError('Sales response failed exact byte verification');
  return { bytes, value: JSON.parse(bytes.toString('utf8')) };
}
/** Only actual sales connector captures admitted to this run are eligible; cards and arbitrary caller strings never become sales evidence. */
export async function readSalesNameEvidence(store: ContentAddressedArtifactStore, captures: readonly CaptureRecord[], scope: ScopeSnapshot): Promise<{
  productNames: string[]; refs: KeywordListDraftSalesRef[];
}> {
  const productNames: string[] = []; const refs: KeywordListDraftSalesRef[] = []; const seen = new Set<string>();
  const ids = new Set([...scope.selectedProductIds, ...scope.peerProductIds].map(id => id.replace(/^kalodata:/, '')));
  for (const capture of captures) {
    if (capture.provider !== 'kalodata' || !['kalodata.product.rank', 'kalodata.product.detail'].includes(capture.operation)) continue;
    const envelope = JSON.parse((await store.read(capture.artifactSha256, { maxBytes: MAX_CAPTURE_ENVELOPE_BYTES })).toString('utf8')) as Record<string, unknown>;
    const raw = decodeSalesCapture(envelope);
    const data = (raw.value as { data?: unknown }).data;
    const rows = Array.isArray(data) ? data.map((value, index) => ({ value, locator: `/data/${index}/product_name` })) : [{ value: data, locator: '/data/product_name' }];
    for (const row of rows) {
      const product = row.value as { product_id?: unknown; product_name?: unknown } | null;
      if (!product || typeof product.product_id !== 'string' || !ids.has(product.product_id) || typeof product.product_name !== 'string' || !product.product_name.trim()) continue;
      const digest = hash(raw.bytes); const key = `${digest}#${row.locator}`;
      if (seen.has(key)) continue; seen.add(key);
      await store.put(raw.bytes);
      productNames.push(product.product_name);
      refs.push({ digest, locator: row.locator, captureDigest: capture.artifactSha256 });
    }
  }
  return { productNames, refs };
}
