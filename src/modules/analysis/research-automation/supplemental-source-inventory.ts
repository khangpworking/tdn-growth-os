import type { ResearchAutomationSupplementalPreparedList, ResearchAutomationSupplementalPreparedPackage } from '../../../../contracts/api/research-automation-supplemental-intake-api.generated.js';
import type { AutomationSourcePackageLookup, FinalizedSourcePackageReader, SourceAttachmentOriginReader } from '../../foundation/source-package-reader.js';
import type { VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import {
  byPath, expectedSupplementalMetadata, parseSupplementalContext, preparedSupplementalPackage, SUPPLEMENTAL_CONTEXT_PATH, SUPPLEMENTAL_READ_BUDGET,
  supplementalPackageKey, supplementalPackageKeyPrefix, supplementalRunBindingSha256, type SupplementalRunBinding,
} from './supplemental-source-intake.js';

type SourceReader = AutomationSourcePackageLookup & FinalizedSourcePackageReader & SourceAttachmentOriginReader;

/** A stored package under this run's supplemental prefix that is not exactly server-prepared for this run. */
export class PreparedSupplementalSourceError extends Error {
  constructor(readonly code: string) { super(`Prepared supplemental source failed verification: ${code}`); }
}
function fail(code: string): never { throw new PreparedSupplementalSourceError(code); }

/**
 * Reloadable prepared supplemental packages for one confirmed run. Each package is re-verified from Foundation
 * bytes: key prefix, exact origin binding, closed canonical server context, and manifest/member metadata equal to
 * what preparation writes. Any mismatch fails the whole read closed. Listing replays no method, authenticates no
 * provider and admits nothing; every entry stays PREPARED_NOT_ADMITTED whether or not a revision selected it.
 */
export async function readPreparedSupplementalSources(reader: SourceReader, bound: SupplementalRunBinding): Promise<ResearchAutomationSupplementalPreparedList> {
  const packages: ResearchAutomationSupplementalPreparedList['packages'] = [];
  for (const entry of await reader.findAutomationAttachmentPackagesByKeyPrefix(supplementalPackageKeyPrefix(bound.runId))) {
    const source = await reader.readFinalizedSourcePackage(entry.packageId, SUPPLEMENTAL_READ_BUDGET);
    if (source.packageId !== entry.packageId || source.manifestArtifactSha256 !== entry.manifestArtifactSha256 ||
        source.manifest.packageKey !== entry.packageKey || source.manifest.version !== 1 || entry.version !== 1) fail('PACKAGE_IDENTITY_MISMATCH');
    packages.push(await verifyPreparedSupplementalSource(reader, bound, source));
  }
  return { contractVersion: 'automation-supplemental-prepared-list-v1', workspaceId: bound.start.workspaceId, runId: bound.runId, packages };
}

/** Same exact single-package verification for inventory, admission and historical replay; never scans other packages. */
export async function verifyPreparedSupplementalSource(reader: SourceAttachmentOriginReader, bound: SupplementalRunBinding,
  source: VerifiedFinalizedSourcePackage): Promise<ResearchAutomationSupplementalPreparedPackage> {
    const binding = supplementalRunBindingSha256(bound);
    if (source.manifest.version !== 1) fail('PACKAGE_IDENTITY_MISMATCH');
    const origin = await reader.readAutomationAttachmentOrigin(source.packageId, SUPPLEMENTAL_READ_BUDGET);
    if (!origin || origin.bindingSha256 !== binding || origin.manifestArtifactSha256 !== source.manifestArtifactSha256) fail('ORIGIN_BINDING_MISMATCH');

    const contextFiles = source.files.filter(file => file.path === SUPPLEMENTAL_CONTEXT_PATH);
    if (contextFiles.length !== 1 || contextFiles[0]!.mediaType !== 'application/json') fail('CONTEXT_MISSING');
    const context = parseSupplementalContext(contextFiles[0]!.bytes);
    if (!context) fail('CONTEXT_INVALID');
    const request = context.request;
    if (context.runId !== bound.runId || context.workspaceId !== bound.start.workspaceId || context.runBindingSha256 !== binding) fail('CONTEXT_RUN_MISMATCH');
    if (source.manifest.packageKey !== supplementalPackageKey(bound.runId, request.family, request.requestKey) ||
        source.manifest.sourceLabel !== request.sourceLabel || source.manifest.sourceAcquiredAt !== request.acquiredAt) fail('CONTEXT_REQUEST_MISMATCH');

    // Membership and every server-owned metadata field must equal what preparation writes for this exact request.
    const expected = expectedSupplementalMetadata(bound.runId, request, new Map(source.files.map(file => [file.path, file.bytes])));
    if (!expected || source.files.length !== expected.length ||
        canonicalJson([...source.files].sort(byPath).map(({ bytes: _bytes, ...file }) => file)) !== canonicalJson(expected) ||
        canonicalJson([...source.manifest.files].sort(byPath)) !== canonicalJson(expected)) fail('MEMBER_METADATA_MISMATCH');
    return preparedSupplementalPackage(request, source);
}
