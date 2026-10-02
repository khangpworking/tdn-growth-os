import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { SourcePackageIntakeRequest } from '../../contracts/foundation/source-package-intake-request.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { SourcePackageService, type VerifiedSourcePackageFile } from '../../src/modules/foundation/source-package-service.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { mapDamiLocatedReviewSource, type DamiSelectedListing } from '../../src/modules/analysis/research-automation/dami-located-review-mapping.js';

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));
const acquiredAt = '2026-10-02T00:00:00.000Z';

/** Synthetic native capture through the real mapper and Foundation intake, not expected analytical results. */
export async function seedNativeDamiPackage(packages: SourcePackageService, options: {
  packageKey?: string;
  selected?: DamiSelectedListing;
  rawRows?: readonly Record<string, unknown>[];
  captureRunId?: string;
  extraFiles?: ReadonlyMap<string, Buffer>;
} = {}) {
  const selected = options.selected ?? { shopId: '78085196', itemId: '17678138164' };
  const rawRows = options.rawRows ?? [{ type: 'review', shopid: selected.shopId, itemid: selected.itemId,
    cmtid: '1', comment: 'Tôi đã dùng sản phẩm.', rating_star: 5,
    review_date: '2025-11-03T01:02:03.000Z', ctime: 1762131723, collected_at: acquiredAt, model_name: null }];
  const runId = options.captureRunId ?? 'synthetic-dami-run';
  const datasetId = `${runId}-dataset`;
  const actor = 'dami_studio/shopee-shop-reviews-scraper';
  const files = new Map<string, Buffer>([
    ['capture/request.json', json({ actor, input: { startUrls: [`https://shopee.vn/product/${selected.shopId}/${selected.itemId}`], maxItems: 100 }, synthetic: true })],
    ['capture/start-response.json', json({ data: { id: runId, defaultDatasetId: datasetId }, synthetic: true })],
    ['capture/terminal-status.json', json({ data: { id: runId, defaultDatasetId: datasetId, status: 'SUCCEEDED' }, synthetic: true })],
    ['capture/dataset.json', json(rawRows)],
    ['capture/notices.json', json({ synthetic: true, notices: ['Synthetic source; no provider call or independently authenticated identity.'] })],
  ]);
  const source: VerifiedSourcePackageFile = { ...metadata('capture/dataset.json', files.get('capture/dataset.json')!), bytes: files.get('capture/dataset.json')! };
  const mapped = mapDamiLocatedReviewSource(source, selected);
  const exactTextRows = mapped.mapping.rows.filter((row, index) => row.listingAdmission === 'SELECTED_LISTING' &&
    typeof rawRows[index]!.comment === 'string' && String(rawRows[index]!.comment).trim()).length;
  files.set('capture/receipt.json', json({ actor, runId, datasetSha256: source.sha256,
    requestSha256: sha(files.get('capture/request.json')!), terminalSha256: sha(files.get('capture/terminal-status.json')!),
    noticesSha256: sha(files.get('capture/notices.json')!), returnedRows: rawRows.length, exactTextRows, retrievedAt: acquiredAt, synthetic: true }));
  const [profile, adoption, mapper] = await Promise.all([
    fs.readFile(new URL('../../docs/research/method-configurations-v1/qualitative-profile.md', import.meta.url)),
    fs.readFile(new URL('../../docs/research/method-configurations-v1-adoption.md', import.meta.url)),
    fs.readFile(new URL('../../src/modules/analysis/research-automation/dami-located-review-mapping.ts', import.meta.url)),
  ]);
  files.set('authority/qualitative-profile.md', profile);
  files.set('authority/method-adoption.md', adoption);
  const descriptor = { contractVersion: '1.0.0', codebookId: 'located-evidence-v1-draft', profileSha256: sha(profile), adoptionSha256: sha(adoption),
    question: 'Synthetic retained listing reviews; not completed findings.',
    inclusionRule: 'Selected native shop/item and readable nonconflicting review rows; no category, annual or population admission.',
    codingUnit: 'LOCATED_RECORD', adjudicationRule: 'No semantic annotations or human approval.', brief: null,
    sources: [{ logicalPath: source.path, sha256: source.sha256 }], records: mapped.records,
    i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], corpora: [], i13Mentions: [] };
  files.set('methods/located-input.json', json(descriptor));
  files.set('methods/located-output.json', buildLocatedInsightMethods(descriptor).bytes);
  files.set('mapping/dami-review-fields-v2.json', json({ synthetic: true, mappingRevision: 'dami-shop-sweep-located-records-v2',
    sourceSha256: source.sha256, providerInputBinding: 'NOT_INDEPENDENTLY_RETRIEVED', receiptDatasetIdBinding: 'NO_DATASET_ID_IN_ORIGINAL_RECEIPT' }));
  files.set('mapping/provider-field-basis.md', Buffer.from('Synthetic field-basis fixture; source dates and identities remain provider-reported, not authenticated.\n'));
  const packageKey = options.packageKey ?? 'synthetic-source:dami-native';
  const intake = (version: number): SourcePackageIntakeRequest => {
    const firstPath = 'capture/dataset.json';
    return { contractVersion: '1.0.0', packageKey, version, sourceAcquiredAt: acquiredAt,
      sourceLabel: 'Synthetic native Dami source', files: [metadata(firstPath, files.get(firstPath)!),
        ...[...files].filter(([path]) => path !== firstPath).map(([path, bytes]) => metadata(path, bytes))] };
  };
  const priorReceipt = await packages.intake(intake(2), files);
  const prior = await packages.readVerified(priorReceipt.packageId);
  files.set('dependencies/source-package-v2.json', json({ packageId: prior.packageId, manifestArtifactSha256: prior.manifestArtifactSha256,
    packageContentSha256: prior.packageContentSha256, manifest: prior.manifest }));
  files.set('mapping/dami-production-mapping-v1.json', json(mapped.mapping));
  files.set('mapping/dami-production-mapper.ts', mapper);
  for (const [path, bytes] of options.extraFiles ?? []) files.set(path, bytes);
  const receipt = await packages.intake(intake(3), files);
  const retained = await packages.readVerified(receipt.packageId);
  return { identity: { packageId: retained.packageId, manifestArtifactSha256: retained.manifestArtifactSha256,
    packageContentSha256: retained.packageContentSha256, manifest: retained.manifest }, files, records: mapped.records, mapping: mapped.mapping };
}
function metadata(path: string, bytes: Buffer): SourcePackageIntakeRequest['files'][number] {
  return { path, sha256: sha(bytes), byteSize: bytes.length, mediaType: path.endsWith('.ts') ? 'text/plain' : path.endsWith('.md') ? 'text/markdown' : 'application/json',
    evidenceFamily: 'synthetic-dami-native', representationRole: path === 'capture/dataset.json' ? 'primary' : 'derived', independence: 'non_independent',
    providerProvenance: path === 'capture/dataset.json' ? 'provider_reported' : 'operator_supplied_unverified',
    provenanceBasis: 'Synthetic native capture fixture retained through Foundation; not a provider call or authenticated evidence.' };
}
