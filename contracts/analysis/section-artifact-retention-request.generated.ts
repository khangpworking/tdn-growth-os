/* Generated from section-artifact-retention-request.schema.json. Do not edit by hand. */

export type Digest = string;

export interface SectionArtifactRetentionRequest {
  contractVersion: '1.0.0';
  sectionId: 'M03';
  rendererProfile: 'm03-section-artifact-html-vi-v1';
  metricSetSha256: Digest;
  chartBundleSha256: Digest;
  envelopeSha256: Digest;
  narrativeSha256: Digest;
  sectionArtifactSha256: Digest;
  htmlSha256: Digest;
}
