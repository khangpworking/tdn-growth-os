/* Generated from research-document-import.schema.json. Do not edit by hand. */

export interface ResearchDocumentImport {
  contractVersion: '1.0.0';
  source: {
    sourceId: string;
    sourceType: 'manual';
    displayName: string;
  };
  ingestion: {
    idempotencyKey: string;
    acquiredAt: string;
    mediaType: 'text/plain';
    evidenceGrade: {
      grade: 'synthetic' | 'unverified' | 'provider_reported' | 'corroborated' | 'verified';
      basis: string;
    };
  };
  document: {
    documentType: 'news_article' | 'report' | 'web_page' | 'transcript' | 'other';
    title: string;
    sourceLocator: string;
    languageTag: string;
    publishedAt?: string;
    rightsStatus: 'unknown' | 'permitted' | 'restricted';
    rightsBasis: string;
  };
}
