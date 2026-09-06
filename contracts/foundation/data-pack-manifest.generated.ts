/* Generated from data-pack-manifest.schema.json. Do not edit by hand. */

export interface DataPackManifest {
  contractVersion: '1.0.0';
  packKey: string;
  version: number;
  purpose: string;
  finalizedAt: string;
  supersedesPackId?: string;
  period: {
    scope: string;
    start: string;
    end: string;
    grain: string;
  };
  /**
   * @minItems 1
   */
  observations: [
    {
      observationId: string;
      identityKey: string;
      platform: string;
      platformProductId: string;
      productName: string;
      metricCode: string;
      integerValue: string;
      unit: string;
      scale: string | null;
      /**
       * @minItems 1
       */
      evidence: [
        {
          evidenceId: string;
          grade: string;
          basis: string;
          sourceId: string;
          ingestionId: string;
          rawArtifactSha256: string;
        },
        ...{
          evidenceId: string;
          grade: string;
          basis: string;
          sourceId: string;
          ingestionId: string;
          rawArtifactSha256: string;
        }[],
      ];
    },
    ...{
      observationId: string;
      identityKey: string;
      platform: string;
      platformProductId: string;
      productName: string;
      metricCode: string;
      integerValue: string;
      unit: string;
      scale: string | null;
      /**
       * @minItems 1
       */
      evidence: [
        {
          evidenceId: string;
          grade: string;
          basis: string;
          sourceId: string;
          ingestionId: string;
          rawArtifactSha256: string;
        },
        ...{
          evidenceId: string;
          grade: string;
          basis: string;
          sourceId: string;
          ingestionId: string;
          rawArtifactSha256: string;
        }[],
      ];
    }[],
  ];
}
