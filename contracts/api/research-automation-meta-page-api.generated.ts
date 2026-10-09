/* Generated from research-automation-meta-page-api.schema.json. Do not edit by hand. */

export type ResearchAutomationMetaPageApi =
  MetaPagePrepareRequest | MetaPageConfirmRequest | MetaPageSourceView | History;
/**
 * Who drafted the keyword/exclusion data. Source and model-drafted provenance stay distinct; neither implies human approval.
 */
export type KeywordListProvenance = 'OPERATOR_SUPPLIED' | 'MODEL_DRAFTED';
export type KeywordMeaningDecision = 'INCLUDED' | 'EXCLUDED' | 'UNCLEAR';
export type KeywordMeaningReason =
  | 'MATCHED_KEYWORD'
  | 'RESOLVED_BY_CONTEXT'
  | 'EXCLUDED_TERM'
  | 'EXCLUDED_CONTEXT'
  | 'UNRESOLVED_UNDIACRITICIZED'
  | 'UNLISTED_ACCENTED_LOOKALIKE'
  | 'NO_KEYWORD_MATCH'
  | 'EMPTY_TEXT';
/**
 * @maxItems 1000
 */
export type History = MetaPageSourceView[];

export interface MetaPagePrepareRequest {
  contractVersion: 'meta-page-prepare-v1';
  requestKey: string;
  expectedRevision: number;
  selection: MetaPageSelection;
  htmlBase64: string;
  visibleFieldsBase64: string;
}
export interface MetaPageSelection {
  pairId: string;
  peerFrameIndex: number;
  peerIdentityKey: string;
  keywordDraftSha256: string;
  searchCaptureId: string;
  searchPosition: number;
  pageId: string;
}
export interface MetaPageConfirmRequest {
  contractVersion: 'meta-page-confirm-v1';
  requestKey: string;
  expectedRevision: number;
  packageId: string;
}
export interface MetaPageSourceView {
  contractVersion: 'meta-page-view-v1';
  state: 'PREPARED' | 'CONFIRMED';
  prepared: MetaPagePackageIdentity;
  confirmation: MetaPagePackageIdentity | null;
  binding: MetaPageBinding;
  projection: MetaPageProjection;
  runtimeCollector: 'UNAVAILABLE_OPENCLI_CONTRACT_MISSING';
  capture: MetaPageSavedCapture;
}
export interface MetaPagePackageIdentity {
  packageId: string;
  manifestSha256: string;
  contentSha256: string;
}
export interface MetaPageBinding {
  contractVersion: 'meta-page-binding-v1';
  workspaceId: string;
  runId: string;
  startSha256: string;
  scopeSha256: string;
  sourceSetSha256: string;
  marketReportSha256: string;
  selection: MetaPageSelection;
  peerFrame: Frame;
  peerMember: Member;
  search: MetaPageRetainedSearch;
  keywordData: KeywordMeaningFilterData;
  searchDecision: KeywordMeaningFilterResult;
}
export interface Frame {
  platform: 'shopee' | 'tiktok';
  group: string;
  sampleKey: string;
  period: Period;
  unit: 'VND';
  membershipBasis: string;
}
export interface Period {
  start: string;
  end: string;
}
export interface Member {
  identity: Identity;
  revenue: string;
  /**
   * @maxItems 20000
   */
  sources: Source[];
}
export interface Identity {
  kind: 'TITLE_LABEL' | 'SHOP';
  key: string;
  label: string;
  source: Source;
}
export interface Source {
  sourceSha256: string;
  locator: string;
}
export interface MetaPageRetainedSearch {
  captureId: string;
  captureArtifactSha256: string;
  position: number;
  title: string;
  snippet: string | null;
  url: string;
  retrievedAt: string;
}
export interface KeywordMeaningFilterData {
  contractVersion: 'l9-keyword-data-v1';
  dataVersion: string;
  category: string;
  provenance: KeywordListProvenance;
  /**
   * @minItems 1
   * @maxItems 500
   */
  keywords: string[];
  /**
   * @maxItems 500
   */
  exclusions: KeywordMeaningExclusion[];
}
export interface KeywordMeaningExclusion {
  term: string;
  reason: string;
}
export interface KeywordMeaningFilterResult {
  contractVersion: 'keyword-meaning-filter-v1';
  dataVersion: string;
  category: string;
  provenance: KeywordListProvenance;
  /**
   * @minItems 1
   * @maxItems 500
   */
  keywords: string[];
  /**
   * @maxItems 500
   */
  exclusions: KeywordMeaningExclusion[];
  /**
   * @maxItems 5000
   */
  results: KeywordMeaningRecordResult[];
  accounting: {
    included: number;
    excluded: number;
    unclear: number;
    byReason: {
      [k: string]: number;
    };
  };
}
export interface KeywordMeaningRecordResult {
  recordId: string;
  decision: KeywordMeaningDecision;
  reason: KeywordMeaningReason;
  matchedKeyword: string | null;
  excludedBy: string | null;
  exclusionReason: string | null;
  text: string;
  contextText: string | null;
}
export interface MetaPageProjection {
  contractVersion: 'meta-page-projection-v1';
  bindingSha256: string;
  captureSha256: string;
  htmlSha256: string;
  capturedAt: string;
  pageId: string;
  /**
   * @maxItems 5000
   */
  observations: MetaPageAdObservation[];
  adFilter: KeywordMeaningFilterResult;
  /**
   * @maxItems 5000
   */
  includedLibraryIds: string[];
  duplicateObservations: number;
  limitations: 'OPERATOR_DECLARATIONS_NOT_AUTHENTIC_DOM_OR_EFFECTIVENESS_EVIDENCE';
}
export interface MetaPageAdObservation {
  libraryId: string;
  libraryLink: string;
  pageId: string;
  pageName: string;
  startDateLiteral: string;
  startDate: string;
  stopDateLiteral: string | null;
  stopDate: string | null;
  statusLiteral: string;
  status: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN';
  platforms: string[] | null;
  versionCountLiteral: string | null;
  spendRangeLiteral: string | null;
  impressionRangeLiteral: string | null;
  textFirst200: string;
  ageDaysToCapture: number;
}
export interface MetaPageSavedCapture {
  contractVersion: 'meta-page-saved-capture-v1';
  profile: 'operator-located-visible-declarations-v1';
  provenance: 'OPERATOR_SUPPLIED_UNVERIFIED' | 'SYNTHETIC';
  controlState: 'READY';
  pageId: string;
  libraryUrl: string;
  capturedAt: string;
  htmlSha256: string;
  /**
   * @maxItems 5000
   */
  ads: MetaPageVisibleAd[];
}
export interface MetaPageVisibleAd {
  libraryId: MetaPageLocatedLiteral;
  libraryLink: MetaPageLocatedLiteral;
  pageId: MetaPageLocatedLiteral;
  pageName: MetaPageLocatedLiteral;
  startDate: MetaPageLocatedLiteral;
  stopDate: MetaPageLocatedLiteral | null;
  status: MetaPageLocatedLiteral;
  platforms: MetaPageLocatedLiteral[] | null;
  versionCount: MetaPageLocatedLiteral | null;
  spendRange: MetaPageLocatedLiteral | null;
  impressionRange: MetaPageLocatedLiteral | null;
  text: MetaPageLocatedLiteral;
}
export interface MetaPageLocatedLiteral {
  value: string;
  span: MetaPageByteSpan;
}
export interface MetaPageByteSpan {
  byteOffset: number;
  byteLength: number;
}
