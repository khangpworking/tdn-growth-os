/* Generated from m03-section-artifact.schema.json. Do not edit by hand. */

export type Digest = string;

export interface M03SectionArtifact {
  contractVersion: '1.0.0';
  artifactSha256: Digest;
  request: M03SectionArtifactRequest;
  section: {
    sectionId: 'M03';
    title: 'Quy mô và diễn biến';
  };
  renderer: {
    rendererProfile: 'm03-section-artifact-html-vi-v1';
  };
  dependencies: {
    metricSetSha256: Digest;
    chartBundleSha256: Digest;
    envelopeSha256: Digest;
    narrativeSha256: Digest;
  };
  html: {
    sha256: Digest;
    byteSize: number;
  };
  /**
   * @minItems 5
   * @maxItems 5
   */
  limitations: [
    (
      | 'NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO'
      | 'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE'
      | 'SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH'
      | 'CONTENT_IS_COPIED_FROM_VERIFIED_DEPENDENCIES_NOT_GENERATED'
      | 'DETERMINISTIC_FACTUAL_DRAFT_NOT_OWNER_APPROVED'
    ),
    (
      | 'NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO'
      | 'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE'
      | 'SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH'
      | 'CONTENT_IS_COPIED_FROM_VERIFIED_DEPENDENCIES_NOT_GENERATED'
      | 'DETERMINISTIC_FACTUAL_DRAFT_NOT_OWNER_APPROVED'
    ),
    (
      | 'NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO'
      | 'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE'
      | 'SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH'
      | 'CONTENT_IS_COPIED_FROM_VERIFIED_DEPENDENCIES_NOT_GENERATED'
      | 'DETERMINISTIC_FACTUAL_DRAFT_NOT_OWNER_APPROVED'
    ),
    (
      | 'NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO'
      | 'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE'
      | 'SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH'
      | 'CONTENT_IS_COPIED_FROM_VERIFIED_DEPENDENCIES_NOT_GENERATED'
      | 'DETERMINISTIC_FACTUAL_DRAFT_NOT_OWNER_APPROVED'
    ),
    (
      | 'NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO'
      | 'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE'
      | 'SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH'
      | 'CONTENT_IS_COPIED_FROM_VERIFIED_DEPENDENCIES_NOT_GENERATED'
      | 'DETERMINISTIC_FACTUAL_DRAFT_NOT_OWNER_APPROVED'
    ),
  ];
  status: 'DETERMINISTIC_FACTUAL_DRAFT_NOT_OWNER_APPROVED';
}
export interface M03SectionArtifactRequest {
  contractVersion: '1.0.0';
  sectionId: 'M03';
  rendererProfile: 'm03-section-artifact-html-vi-v1';
  narrativeSha256: string;
}
