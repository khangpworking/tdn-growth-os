/* Generated from research-pack-manifest.schema.json. Do not edit by hand. */

export interface ResearchPackManifest {
  contractVersion: '1.0.0';
  packKey: string;
  version: number;
  purpose: string;
  finalizedAt: string;
  supersedesPackId?: string;
  /**
   * @minItems 1
   */
  documents: [
    {
      documentId: string;
      documentType: 'news_article' | 'report' | 'web_page' | 'transcript' | 'other';
      title: string;
      sourceLocator: string;
      languageTag: string;
      publishedAt?: string;
      rightsStatus: 'unknown' | 'permitted' | 'restricted';
      rightsBasis: string;
      evidence: {
        evidenceId: string;
        grade: 'synthetic' | 'unverified' | 'provider_reported' | 'corroborated' | 'verified';
        basis: string;
      };
      source: {
        sourceId: string;
      };
      ingestion: {
        ingestionId: string;
        acquiredAt: string;
      };
      rawArtifact: {
        sha256: string;
        byteSize: number;
        mediaType: 'text/plain';
      };
    },
    ...{
      documentId: string;
      documentType: 'news_article' | 'report' | 'web_page' | 'transcript' | 'other';
      title: string;
      sourceLocator: string;
      languageTag: string;
      publishedAt?: string;
      rightsStatus: 'unknown' | 'permitted' | 'restricted';
      rightsBasis: string;
      evidence: {
        evidenceId: string;
        grade: 'synthetic' | 'unverified' | 'provider_reported' | 'corroborated' | 'verified';
        basis: string;
      };
      source: {
        sourceId: string;
      };
      ingestion: {
        ingestionId: string;
        acquiredAt: string;
      };
      rawArtifact: {
        sha256: string;
        byteSize: number;
        mediaType: 'text/plain';
      };
    }[],
  ];
}
