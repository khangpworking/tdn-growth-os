/* Generated from metric-source-labels.schema.json. Do not edit by hand. */

export interface MetricSourceLabels {
  contractVersion: '1.0.0';
  sourceSha256: string;
  codebookVersion: string;
  provenanceBasis: string;
  /**
   * @minItems 1
   * @maxItems 10000
   */
  rows: [
    {
      row: number;
      rowSha256: string;
      shopId: string;
      listingId: string;
      contentSha256: string;
      classification: 'CORE_CANDIDATE' | 'ADJACENT' | 'OUTSIDE' | 'UNKNOWN';
      group: string;
      methodVersion: string;
      adjudication: 'human' | 'assistant' | 'unknown';
    },
    ...{
      row: number;
      rowSha256: string;
      shopId: string;
      listingId: string;
      contentSha256: string;
      classification: 'CORE_CANDIDATE' | 'ADJACENT' | 'OUTSIDE' | 'UNKNOWN';
      group: string;
      methodVersion: string;
      adjudication: 'human' | 'assistant' | 'unknown';
    }[],
  ];
}
