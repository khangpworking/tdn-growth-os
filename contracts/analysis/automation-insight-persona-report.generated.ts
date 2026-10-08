/* Generated from automation-insight-persona-report.schema.json. Do not edit by hand. */

/**
 * Explicit pending persona selection from one authenticated retained SYNTHESIZE proposal and original source22 pair; no adoption, approval, receipt or implicit latest.
 */
export type AutomationInsightPersonaReport =
  AutomationInsightPersonaReportRevisionRequest | PersonaSelectedReportSnapshot;
export type PersonaClassification = PersonaClassifiedRecord | PersonaUnclassifiedRecord;

export interface AutomationInsightPersonaReportRevisionRequest {
  contractVersion: 'automation-insight-persona-report-revision-v1';
  requestKey: string;
  previousPairId: string;
  sources: PersonaReportKeptSources;
  personaInsight: PersonaReportSelection;
}
export interface PersonaReportKeptSources {
  metric: PersonaReportKeep;
  nativeReview: PersonaReportKeep;
}
export interface PersonaReportKeep {
  decision: 'KEEP';
}
export interface PersonaReportSelection {
  contractVersion: 'insight-persona-report-select-v1';
  proposalId: string;
  proposalSha256: string;
  binding: PersonaBinding;
}
export interface PersonaBinding {
  workspaceId: string;
  runId: string;
  startSha256: string;
  scopeSha256: string;
  confirmedSourceSetSha256: string;
  scopeConfirmedAt: string;
  pairId: string;
  semanticSha256: string;
  corpusSha256: string;
  collectionId: string;
  collectionSha256: string;
  sourceRequestSha256: string;
  viewSha256: string;
  sourceSha256: string;
}
export interface PersonaSelectedReportSnapshot {
  contractVersion: 'automation-insight-persona-report-snapshot-v1';
  selection: PersonaReportSelection;
  executionId: string;
  source: PersonaSource;
  snapshot: PersonaSnapshot;
}
export interface PersonaSource {
  evidenceVersion: 'persona-private-source-evidence-v1';
  binding: PersonaRunBinding;
  corpus: PersonaCorpusReference;
  viewSha256: string;
  platform: 'SHOPEE';
  sourceType: 'S05';
  capture: PersonaCapture;
  records: PersonaSourceRecord[];
  eligibleRecordIndexes: number[];
  taxonomySample: PersonaTaxonomySample;
  sourceDateEligibility: 'UNKNOWN';
  /**
   * @minItems 5
   * @maxItems 5
   */
  limits: [
    (
      | 'UNDATED_QUALITATIVE_CONTEXT_ONLY'
      | 'VERBATIM_TEXT_MAY_CONTAIN_PERSONAL_DATA'
      | 'SOURCE_REPORTED_AUTHORS_NOT_INDEPENDENTLY_VERIFIED_PEOPLE'
      | 'NO_CROSS_PLATFORM_JOIN_OR_SUM'
      | 'U11_RELEASE_UNAVAILABLE'
    ),
    (
      | 'UNDATED_QUALITATIVE_CONTEXT_ONLY'
      | 'VERBATIM_TEXT_MAY_CONTAIN_PERSONAL_DATA'
      | 'SOURCE_REPORTED_AUTHORS_NOT_INDEPENDENTLY_VERIFIED_PEOPLE'
      | 'NO_CROSS_PLATFORM_JOIN_OR_SUM'
      | 'U11_RELEASE_UNAVAILABLE'
    ),
    (
      | 'UNDATED_QUALITATIVE_CONTEXT_ONLY'
      | 'VERBATIM_TEXT_MAY_CONTAIN_PERSONAL_DATA'
      | 'SOURCE_REPORTED_AUTHORS_NOT_INDEPENDENTLY_VERIFIED_PEOPLE'
      | 'NO_CROSS_PLATFORM_JOIN_OR_SUM'
      | 'U11_RELEASE_UNAVAILABLE'
    ),
    (
      | 'UNDATED_QUALITATIVE_CONTEXT_ONLY'
      | 'VERBATIM_TEXT_MAY_CONTAIN_PERSONAL_DATA'
      | 'SOURCE_REPORTED_AUTHORS_NOT_INDEPENDENTLY_VERIFIED_PEOPLE'
      | 'NO_CROSS_PLATFORM_JOIN_OR_SUM'
      | 'U11_RELEASE_UNAVAILABLE'
    ),
    (
      | 'UNDATED_QUALITATIVE_CONTEXT_ONLY'
      | 'VERBATIM_TEXT_MAY_CONTAIN_PERSONAL_DATA'
      | 'SOURCE_REPORTED_AUTHORS_NOT_INDEPENDENTLY_VERIFIED_PEOPLE'
      | 'NO_CROSS_PLATFORM_JOIN_OR_SUM'
      | 'U11_RELEASE_UNAVAILABLE'
    ),
  ];
}
export interface PersonaRunBinding {
  workspaceId: string;
  runId: string;
  startSha256: string;
  scopeSha256: string;
  confirmedSourceSetSha256: string;
  scopeConfirmedAt: string;
}
export interface PersonaCorpusReference {
  artifactSha256: string;
  corpusId: string;
  collectionId: string;
  collectionSha256: string;
  requestSha256: string;
}
export interface PersonaCapture {
  mode: 'fixture' | 'live';
  retrievedAt: string;
  stopReason: string | null;
}
export interface PersonaSourceRecord {
  recordIndex: number;
  recordId: string;
  locator: Locator;
  text: string | null;
  /**
   * Source rating presence/state; never manufacture an absent source field. Invalid finite safe numeric source values survive, arbitrary strings/nested values do not.
   */
  rating:
    | {
        fieldPresent: false;
        state: 'ABSENT';
        value: null;
      }
    | {
        fieldPresent: true;
        state: 'MISSING';
        value: null;
      }
    | {
        fieldPresent: true;
        state: 'VALID';
        value: number;
      }
    | {
        fieldPresent: true;
        state: 'INVALID';
        value: null | number;
      };
  sourceProduct: PersonaSourceProduct;
  sourceDate: PersonaSourceDate;
  disposition: 'INCLUDED' | 'EXCLUDED' | 'UNREADABLE';
  exclusionReason: string | null;
  aliasOfRecordIndex: number | null;
}
export interface Locator {
  collectionId: string;
  pageSha256: string;
  pageIndex: number;
  rowIndex: number;
  textPointer: string;
}
export interface PersonaSourceProduct {
  shopId: string | null;
  itemId: string | null;
}
export interface PersonaSourceDate {
  literal: string | null;
  eligibility: 'UNKNOWN';
}
export interface PersonaTaxonomySample {
  version: 'retained-source-order-first-300-v1';
  /**
   * @maxItems 300
   */
  recordIndexes: number[];
}
export interface PersonaSnapshot {
  contractVersion: 'insight-persona-snapshot-v1';
  binding: PersonaBinding;
  taxonomy: PersonaTaxonomy | null;
  codebookSha256: string | null;
  classifications: PersonaClassification[];
  cards: PersonaEvidenceCard[];
  personas:
    | []
    | [PersonaProposal, PersonaProposal, PersonaProposal]
    | [PersonaProposal, PersonaProposal, PersonaProposal, PersonaProposal]
    | [PersonaProposal, PersonaProposal, PersonaProposal, PersonaProposal, PersonaProposal]
    | [PersonaProposal, PersonaProposal, PersonaProposal, PersonaProposal, PersonaProposal, PersonaProposal];
  insufficiency: string | null;
  classificationComplete: boolean;
  status: 'PROPOSED';
  releaseEligibility: 'UNAVAILABLE';
}
export interface PersonaTaxonomy {
  contractVersion: 'insight-persona-taxonomy-v1';
  /**
   * @minItems 1
   */
  topics: [PersonaTaxonomyCode, ...PersonaTaxonomyCode[]];
  /**
   * @minItems 1
   */
  journeys: [PersonaTaxonomyCode, ...PersonaTaxonomyCode[]];
}
export interface PersonaTaxonomyCode {
  code: string;
  label: string;
  meaning: string;
  /**
   * @minItems 1
   */
  examples: [PersonaQuoteSelection, ...PersonaQuoteSelection[]];
}
export interface PersonaQuoteSelection {
  recordIndex: number;
  recordId: string;
  locator: Locator;
  span: Span;
}
/**
 * Half-open UTF-16 offsets in the exact record text, with no Unicode or whitespace normalization.
 */
export interface Span {
  start: number;
  end: number;
  quote: string;
}
export interface PersonaClassifiedRecord {
  recordIndex: number;
  confidence: 'HIGH' | 'MEDIUM';
  status: 'CLASSIFIED';
  topic: string;
  journey: string;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED';
  /**
   * @minItems 1
   */
  quotes: [PersonaQuoteSelection, ...PersonaQuoteSelection[]];
  uncertainty: null;
}
export interface PersonaUnclassifiedRecord {
  recordIndex: number;
  confidence: 'LOW' | 'AMBIGUOUS';
  status: 'UNCLASSIFIED';
  topic: null;
  journey: null;
  sentiment: null;
  quotes: PersonaQuoteSelection[];
  uncertainty: string;
}
export interface PersonaEvidenceCard {
  cardId: string;
  cardKey: string;
  situation: PersonaAttribute;
  /**
   * @minItems 2
   */
  quotes: [PersonaQuote, PersonaQuote, ...PersonaQuote[]];
  attributes: PersonaAttribute[];
  /**
   * @minItems 2
   */
  recordIndexes: [number, number, ...number[]];
  authorEvidence: 'MET_WITH_SOURCE_AUTHOR_PROOF' | 'MET_WITH_DISTINCT_CONTENT_FALLBACK';
  identityLimitation: 'nguồn không có mã người viết; chưa xác minh là 5 người' | null;
  status: 'PROPOSED';
}
export interface PersonaAttribute {
  kind: 'SITUATION' | 'NEED' | 'WORRY' | 'PURCHASE_REASON' | 'CHANNEL';
  value: string;
  /**
   * @minItems 1
   */
  quotes: [PersonaQuoteSelection, ...PersonaQuoteSelection[]];
}
export interface PersonaQuote {
  recordIndex: number;
  recordId: string;
  locator: Locator;
  text: string;
  selectedSpan: Span;
  sourceDate: PersonaSourceDate;
}
export interface PersonaProposal {
  personaId: string;
  /**
   * @minItems 3
   */
  cardIds: [string, string, string, ...string[]];
  /**
   * @minItems 1
   */
  attributes: [PersonaAttribute, ...PersonaAttribute[]];
  /**
   * @minItems 5
   */
  recordIndexes: [number, number, number, number, number, ...number[]];
  authorEvidence: 'MET_WITH_SOURCE_AUTHOR_PROOF' | 'MET_WITH_DISTINCT_CONTENT_FALLBACK';
  broaderScopeEligible: true;
  sampleSize: PersonaSampleSize;
  sampleSizeLabel: string;
  label: 'Chân dung do AI tổng hợp từ lời khách thật, không phải một khách hàng có thật';
  identityLimitation: 'nguồn không có mã người viết; chưa xác minh là 5 người' | null;
  status: 'PROPOSED';
  releaseEligibility: 'UNAVAILABLE';
}
export interface PersonaSampleSize {
  numerator: number;
  denominator: number;
}
