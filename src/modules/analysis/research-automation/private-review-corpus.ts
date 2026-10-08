import { createHash } from 'node:crypto';
import type { AutomationPrivateShopeeSource } from '../../../../contracts/analysis/automation-private-shopee-source.generated.js';
import type { ResearchPrivateReviewCorpus } from '../../../../contracts/analysis/research-private-review-corpus.generated.js';
import type { PrivateReviewReportView } from '../../../../contracts/analysis/private-review-report-view.generated.js';
import type { PrivateShopeeCollectionReader, VerifiedPrivateShopeeCollection } from '../../foundation/shopee-collection-service.js';
import { projectPrivateShopeeCollection } from '../../foundation/shopee-private-projection.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { privateReviewCorpus, privateReviewReportView, privateShopeeMarker } from './private-review-contracts.js';

export type PrivateReviewReference = ResearchPrivateReviewCorpus['collection'];
export type PrivateReviewBinding = ResearchPrivateReviewCorpus['binding'];
const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

/** Exact run/profile/source binding through Foundation's declared private reader. No collector or salt is needed for replay. */
export async function readPrivateReviewCollection(reader: PrivateShopeeCollectionReader, reference: PrivateReviewReference,
  request: unknown, marker: AutomationPrivateShopeeSource): Promise<VerifiedPrivateShopeeCollection> {
  privateShopeeMarker(marker);
  if (reference.privateVersion !== '3.0.0') throw new Error('Private source version mismatch');
  const source = await reader.readExact(reference.collectionId, { privacy: true });
  if (source.sha256 !== reference.collectionSha256 || source.packet.requestSha256 !== reference.requestSha256 ||
    !same(source.request, request) || !same(source.packet.privacy, marker.profile)) throw new Error('Private review source differs from its frozen run/profile');
  return source;
}

export function buildPrivateReviewCorpus(source: VerifiedPrivateShopeeCollection, binding: PrivateReviewBinding): { output: ResearchPrivateReviewCorpus; bytes: Buffer } {
  if (source.request.runKey !== `auto-${binding.runId}` || source.request.source.acquiredAt !== binding.scopeConfirmedAt ||
    hash(source.request) !== source.packet.requestSha256) throw new Error('Private corpus run binding differs');
  const body = { contractVersion: 'research-private-review-corpus-v2' as const, binding,
    collection: { privateVersion: '3.0.0' as const, collectionId: source.packet.collectionId,
      collectionSha256: source.sha256, requestSha256: source.packet.requestSha256 },
    projection: projectPrivateShopeeCollection(source),
    capture: { mode: source.packet.mode, retrievedAt: source.packet.actor.retrievedAt } };
  const output = privateReviewCorpus({ ...body, corpusId: hash(body) });
  const bytes = Buffer.from(canonicalJson(output));
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Private review corpus output too large');
  return { output, bytes };
}
export function verifyPrivateReviewCorpus(value: unknown, source: VerifiedPrivateShopeeCollection, binding: PrivateReviewBinding): ResearchPrivateReviewCorpus {
  const retained = privateReviewCorpus(value);
  const expected = buildPrivateReviewCorpus(source, binding).output;
  if (!same(retained, expected)) throw new Error('Private review corpus exact replay mismatch');
  return retained;
}

/** Closed projection for reports/model inputs: no author IDs/hashes/key/profile or native reviewer metadata. */
export function buildPrivateReviewReportView(corpus: ResearchPrivateReviewCorpus): PrivateReviewReportView {
  privateReviewCorpus(corpus);
  const { corpusId: _id, ...body } = corpus;
  if (hash(body) !== corpus.corpusId) throw new Error('Private corpus digest mismatch');
  const p = corpus.projection;
  return privateReviewReportView({ contractVersion: 'private-review-report-view-v1',
    corpus: { artifactSha256: hash(corpus), corpusId: corpus.corpusId, collectionId: corpus.collection.collectionId,
      collectionSha256: corpus.collection.collectionSha256, requestSha256: corpus.collection.requestSha256    }, capture: corpus.capture,
    records: p.records.map(row => ({ recordId: hash([corpus.corpusId, row.locator]), shopId: row.shopId, itemId: row.itemId,
      text: row.comment, textState: row.comment === null ? 'UNREADABLE' : row.comment.trim() ? 'READABLE' : 'EMPTY',
      rating: row.rating, createdAt: row.createdAt, region: row.region, admission: row.admission, locator: row.locator })),
    accounting: { retainedRecords: p.accounting.retainedRecords, selectedTextRecords: p.accounting.selectedTextRecords,
      distinctContents: p.accounting.distinctContents, missingIdentityRecords: p.accounting.missingIdentityRecords,
      invalidIdentityRecords: p.accounting.invalidIdentityRecords },
    missingIdentityLabel: p.missingIdentityLabel, fallbackRequirement: p.fallbackRequirement, limits: p.limits });
}
