/* Generated from research-evidence-index-result.schema.json. Do not edit by hand. */

export interface ResearchEvidenceIndexResult {
  contractVersion: '1.0.0';
  resultId: string;
  calculationKey: 'research_evidence_index_v1';
  calculationVersion: 1;
  completedAt: string;
  researchPack: {
    researchPackId: string;
    manifestArtifactSha256: string;
  };
  coverage: {
    documentCount: number;
    retainedSegmentCount: number;
  };
  /**
   * @minItems 1
   * @maxItems 1048576
   */
  documents: [
    {
      documentId: string;
      rawArtifactSha256: string;
      languageTag: string;
      documentType: 'news_article' | 'report' | 'web_page' | 'transcript' | 'other';
      title: string;
      sourceLocator: string;
      /**
       * @minItems 1
       * @maxItems 524288
       */
      segments: [
        {
          segmentIndex: number;
          byteStart: number;
          byteEnd: number;
          textSha256: string;
          text: string;
          citationPointer: string;
        },
        ...{
          segmentIndex: number;
          byteStart: number;
          byteEnd: number;
          textSha256: string;
          text: string;
          citationPointer: string;
        }[],
      ];
    },
    ...{
      documentId: string;
      rawArtifactSha256: string;
      languageTag: string;
      documentType: 'news_article' | 'report' | 'web_page' | 'transcript' | 'other';
      title: string;
      sourceLocator: string;
      /**
       * @minItems 1
       * @maxItems 524288
       */
      segments: [
        {
          segmentIndex: number;
          byteStart: number;
          byteEnd: number;
          textSha256: string;
          text: string;
          citationPointer: string;
        },
        ...{
          segmentIndex: number;
          byteStart: number;
          byteEnd: number;
          textSha256: string;
          text: string;
          citationPointer: string;
        }[],
      ];
    }[],
  ];
}
