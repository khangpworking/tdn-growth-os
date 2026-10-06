/* Generated from research-automation-supplemental-intake-api.schema.json. Do not edit by hand. */

/**
 * Metadata and safe receipt for one run-bound, operator-supplied supplemental method source package (M08 quote or M10/I11/I12/I16 bounded). Exact file bytes travel separately; the server computes every digest and size. Preparation stores an unverified, non-independent source only: it is not revision admission, report execution, data collection, provider authentication or business approval.
 */
export type ResearchAutomationSupplementalIntakeApi =
  | ResearchAutomationSupplementalPrepareRequest
  | ResearchAutomationSupplementalPrepareReceipt
  | ResearchAutomationSupplementalPreparedList;
/**
 * QUOTE targets the existing GenericQuoteUnit literal-structured-quote-v1 descriptor (without sourcePackage). BOUNDED targets the existing ReportMethodPacketsInput descriptor with gates only.
 */
export type Family = 'QUOTE' | 'BOUNDED';
/**
 * JSON sources and descriptors only. text/markdown is admitted solely for BOUNDED packages and only when the existing bounded owner consumes the file as a digest-pinned method authority; it is never parsed as a source.
 */
export type MediaType = 'application/json' | 'text/markdown';

export interface ResearchAutomationSupplementalPrepareRequest {
  contractVersion: 'automation-supplemental-prepare-v1';
  requestKey: string;
  family: Family;
  sourceLabel: string;
  acquiredAt: string | null;
  /**
   * Uploaded logical path. The automation-supplemental/ directory is reserved for the server-created context member and is rejected.
   */
  descriptorPath: string;
  /**
   * @minItems 1
   * @maxItems 16
   */
  files: ResearchAutomationSupplementalFile[];
}
export interface ResearchAutomationSupplementalFile {
  /**
   * Uploaded logical path. The automation-supplemental/ directory is reserved for the server-created context member and is rejected.
   */
  path: string;
  mediaType: MediaType;
  representationRole: 'primary' | 'alternate' | 'structured' | 'derived';
}
/**
 * Exact package identity for an explicit later quote/bounded revision selection. The owning method replays the exact package semantically again at revision admission.
 */
export interface ResearchAutomationSupplementalPrepareReceipt {
  contractVersion: 'automation-supplemental-prepared-v1';
  requestKey: string;
  family: Family;
  state: 'PREPARED_NOT_ADMITTED';
  exactRetry: boolean;
  packageId: string;
  manifestArtifactSha256: string;
  packageContentSha256: string;
  /**
   * Uploaded logical path. The automation-supplemental/ directory is reserved for the server-created context member and is rejected.
   */
  descriptorPath: string;
  /**
   * @minItems 1
   * @maxItems 16
   */
  files: ResearchAutomationSupplementalReceiptFile[];
  sourceLabel: string;
  acquiredAt: string | null;
  provenance: 'OPERATOR_SUPPLIED_UNVERIFIED';
  admission: 'SEMANTIC_REPLAY_REQUIRED_AT_REVISION';
}
export interface ResearchAutomationSupplementalReceiptFile {
  /**
   * Uploaded logical path. The automation-supplemental/ directory is reserved for the server-created context member and is rejected.
   */
  path: string;
  sha256: string;
  byteSize: number;
  mediaType: MediaType;
}
/**
 * Read-only reload inventory for one run. Every listed package passed prefix, origin-binding, context and manifest/member verification; any corrupt package fails the whole read closed. Listing performs no method replay, provider authentication or admission.
 */
export interface ResearchAutomationSupplementalPreparedList {
  contractVersion: 'automation-supplemental-prepared-list-v1';
  workspaceId: string;
  runId: string;
  /**
   * @maxItems 100
   */
  packages: ResearchAutomationSupplementalPreparedPackage[];
}
/**
 * One verified prepared package recovered from its server-created context. State describes the stored source only: it stays PREPARED_NOT_ADMITTED even if a revision later selected it, and implies no report, revision or historical run state.
 */
export interface ResearchAutomationSupplementalPreparedPackage {
  requestKey: string;
  family: Family;
  state: 'PREPARED_NOT_ADMITTED';
  packageId: string;
  manifestArtifactSha256: string;
  packageContentSha256: string;
  /**
   * Uploaded logical path. The automation-supplemental/ directory is reserved for the server-created context member and is rejected.
   */
  descriptorPath: string;
  /**
   * @minItems 1
   * @maxItems 16
   */
  files: ResearchAutomationSupplementalReceiptFile[];
  sourceLabel: string;
  acquiredAt: string | null;
  provenance: 'OPERATOR_SUPPLIED_UNVERIFIED';
  admission: 'SEMANTIC_REPLAY_REQUIRED_AT_REVISION';
}
