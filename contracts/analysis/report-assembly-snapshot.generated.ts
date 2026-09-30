/* Generated from report-assembly-snapshot.schema.json. Do not edit by hand. */

export type Digest = string;

export interface ReportAssemblySnapshot {
  contractVersion: '1.0.0';
  assemblyProfile: 'report-assembly-snapshot-v1';
  assemblySha256: Digest;
  lifecycle: {
    status: 'DRAFT_PARTIAL';
    interpretation: 'NONE';
    reviewState: 'UNREVIEWED';
    finalityStatement: 'NOT_FINAL_NOT_PUBLISHABLE_NOT_COMMERCIAL_READY';
  };
  preparationSha256: Digest;
  readinessSha256: Digest;
  catalog: CatalogIdentity;
  source: {
    workspaceId: string;
    workspaceSnapshotSha256: Digest;
    sourcePackageId: string;
    sourcePackageManifestSha256: Digest;
    sourcePackageContentSha256: Digest;
    normalizedInputArtifactSha256: Digest;
    normalizedInputValueSha256: Digest;
    scope: Scope;
    labelPolicy: {
      codebookVersion: string;
      wideUnknownPolicy: 'include' | 'exclude';
    };
  };
  m03: {
    sectionArtifactSha256: Digest;
    preparationSha256: Digest;
    readinessSha256: Digest;
    members: {
      metricSet: Member;
      chartBundle: Member;
      envelope: Member;
      narrative: Member;
      receipt: Member;
      html: Member;
    };
    /**
     * @minItems 3
     * @maxItems 3
     */
    scopeTotals: [ScopeTotal, ScopeTotal, ScopeTotal];
  };
  /**
   * @minItems 30
   * @maxItems 30
   */
  sections: [
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
    SectionEntry,
  ];
}
export interface CatalogIdentity {
  catalogId: string;
  catalogVersion: string;
  sha256: Digest;
}
export interface Scope {
  key: string;
  platform: 'shopee' | 'tiktok';
  selection: 'ON' | 'OFF' | 'UNSPECIFIED';
  start: string;
  end: string;
  periodBasis: string;
}
export interface Member {
  artifactSha256: Digest;
  byteSize: number;
}
export interface ScopeTotal {
  key: 'all' | 'wide' | 'core';
  listingCount: number;
  shopCount: number;
  revenue: Total;
  units: Total;
  /**
   * @maxItems 20
   */
  warnings:
    | []
    | [
        | 'EMPTY_SCOPE'
        | 'MISSING_REVENUE'
        | 'MISSING_UNITS'
        | 'NON_EXACT_REVENUE'
        | 'NON_EXACT_UNITS'
        | 'ZERO_REVENUE'
        | 'LABELS_REQUIRE_ADJUDICATION',
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ]
    | [
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
        (
          | 'EMPTY_SCOPE'
          | 'MISSING_REVENUE'
          | 'MISSING_UNITS'
          | 'NON_EXACT_REVENUE'
          | 'NON_EXACT_UNITS'
          | 'ZERO_REVENUE'
          | 'LABELS_REQUIRE_ADJUDICATION'
        ),
      ];
}
export interface Total {
  value: string | null;
  observedCount: number;
  missingCount: number;
  nonExactCount: number;
  complete: boolean;
}
export interface SectionEntry {
  sectionId: string;
  title: string;
  catalog: {
    fallbackState: 'BLOCKED' | 'METHOD_ONLY' | 'MANUAL_REVIEW_REQUIRED' | 'NOT_IMPLEMENTED';
    /**
     * @minItems 1
     * @maxItems 20
     */
    fallbackReasons:
      | [string]
      | [string, string]
      | [string, string, string]
      | [string, string, string, string]
      | [string, string, string, string, string]
      | [string, string, string, string, string, string]
      | [string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ];
  };
  readiness: {
    state: 'READY_TO_CALCULATE' | 'BLOCKED' | 'INVALID';
    methodId: string;
    methodVersion: string;
    /**
     * @maxItems 20
     */
    requiredInputs:
      | []
      | [string]
      | [string, string]
      | [string, string, string]
      | [string, string, string, string]
      | [string, string, string, string, string]
      | [string, string, string, string, string, string]
      | [string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ]
      | [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ];
    /**
     * @maxItems 100
     */
    blockingCodes: string[];
    /**
     * @maxItems 20
     */
    inputChecks:
      | []
      | [InputCheck]
      | [InputCheck, InputCheck]
      | [InputCheck, InputCheck, InputCheck]
      | [InputCheck, InputCheck, InputCheck, InputCheck]
      | [InputCheck, InputCheck, InputCheck, InputCheck, InputCheck]
      | [InputCheck, InputCheck, InputCheck, InputCheck, InputCheck, InputCheck]
      | [InputCheck, InputCheck, InputCheck, InputCheck, InputCheck, InputCheck, InputCheck]
      | [InputCheck, InputCheck, InputCheck, InputCheck, InputCheck, InputCheck, InputCheck, InputCheck]
      | [InputCheck, InputCheck, InputCheck, InputCheck, InputCheck, InputCheck, InputCheck, InputCheck, InputCheck]
      | [
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
        ]
      | [
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
        ]
      | [
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
        ]
      | [
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
        ]
      | [
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
        ]
      | [
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
        ]
      | [
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
        ]
      | [
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
        ]
      | [
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
        ]
      | [
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
        ]
      | [
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
          InputCheck,
        ];
  };
  materialization: {
    deliveryState:
      'PARTIAL_DETERMINISTIC_DRAFT' | 'METHOD_ONLY' | 'BLOCKED' | 'MANUAL_REVIEW_REQUIRED' | 'NOT_IMPLEMENTED';
    materialized: boolean;
    /**
     * @maxItems 100
     */
    claimIds: string[];
    /**
     * @maxItems 10
     */
    contextPointers:
      | []
      | [string]
      | [string, string]
      | [string, string, string]
      | [string, string, string, string]
      | [string, string, string, string, string]
      | [string, string, string, string, string, string]
      | [string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string]
      | [string, string, string, string, string, string, string, string, string, string];
    /**
     * @maxItems 50
     */
    blockers: string[];
    sectionSha256: Digest;
    methodArtifact: MethodArtifactRef | null;
  };
  readinessBlockedWhileMaterialized: boolean;
}
export interface InputCheck {
  inputId: string;
  state: 'PRESENT' | 'ABSENT' | 'INVALID';
  blocking: boolean;
  /**
   * @minItems 1
   * @maxItems 20
   */
  codes:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
  /**
   * @maxItems 20
   */
  evidenceRefs:
    | []
    | [EvidenceRef]
    | [EvidenceRef, EvidenceRef]
    | [EvidenceRef, EvidenceRef, EvidenceRef]
    | [EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef]
    | [EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef]
    | [EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef]
    | [EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef]
    | [EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef, EvidenceRef]
    | [
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
      ]
    | [
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
      ]
    | [
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
      ]
    | [
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
      ]
    | [
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
      ]
    | [
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
      ]
    | [
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
      ]
    | [
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
      ]
    | [
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
      ]
    | [
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
      ]
    | [
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
      ]
    | [
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
        EvidenceRef,
      ];
}
export interface EvidenceRef {
  kind: 'PREPARATION_RESULT' | 'NORMALIZED_INPUT' | 'NORMALIZATION_RECEIPT' | 'SOURCE_PACKAGE' | 'SELECTED_SOURCE';
  locator: string;
  sha256: Digest;
}
export interface MethodArtifactRef {
  fileName:
    | 'm02-scope-method.json'
    | 'm08-tablet-quote-method.json'
    | 'm13-provenance-appendix.json'
    | 'i03-research-method.json'
    | 'i17-evidence-trace.json';
  sha256: Digest;
  methodOutputId: Digest;
}
