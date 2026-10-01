/* Generated from m03-narrative-evidence-request.schema.json. Do not edit by hand. */

export type Digest = string;

export interface M03NarrativeEvidenceRequest {
  contractVersion: '1.0.0';
  sectionId: 'M03';
  profile: 'm03-narrative-evidence-v1';
  metricSetSha256: Digest;
  chartBundleSha256: Digest;
}
