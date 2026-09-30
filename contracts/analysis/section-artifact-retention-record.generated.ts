/* Generated from section-artifact-retention-record.schema.json. Do not edit by hand. */

export type Digest = string;

export interface SectionArtifactRetentionRecord {
  contractVersion: '1.0.0';
  sectionArtifactSha256: Digest;
  section: {
    sectionId: 'M03';
    title: 'Quy mô và diễn biến';
  };
  renderer: {
    rendererProfile: 'm03-section-artifact-html-vi-v1';
  };
  dependencies: {
    preparationSha256: Digest;
    metricSetSha256: Digest;
    chartBundleSha256: Digest;
    envelopeSha256: Digest;
    narrativeSha256: Digest;
  };
  members: {
    metricSet: Member;
    chartBundle: Member;
    envelope: Member;
    narrative: Member;
    receipt: Member;
    html: Member;
  };
}
export interface Member {
  artifactSha256: Digest;
  byteSize: number;
}
