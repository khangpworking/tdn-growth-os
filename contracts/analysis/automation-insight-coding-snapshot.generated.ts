/* Generated from automation-insight-coding-snapshot.schema.json. Do not edit by hand. */

/**
 * @maxItems 10000
 */
export type Strings = string[];
/**
 * @maxItems 10000
 */
export type Pointers = string[];

export interface AutomationInsightCodingSnapshot {
  contractVersion: 'automation-insight-coding-snapshot-v1';
  selectionContractVersion?: 'automation-insight-selection-v2';
  binding: InsightSourceBinding;
  selection: InsightReportSelection;
  adoptionId: string;
  proposalSha256: string;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  receipts: [
    {
      receiptId: string;
      sha256: string;
    },
    ...{
      receiptId: string;
      sha256: string;
    }[],
  ];
  output: LocatedInsightMethods;
}
export interface InsightSourceBinding {
  workspaceId: string;
  runId: string;
  pairId: string;
  scopeSha256: string;
  reportSha256: string;
  sourceKind: 'NATIVE' | 'EXACT_SHOPEE';
  sourcePackageSha256: string;
  inputSha256: string;
}
export interface InsightReportSelection {
  proposalId: string;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  receiptIds: [string, ...string[]];
}
export interface LocatedInsightMethods {
  contractVersion: '1.0.0';
  methodId: 'located-insight-methods';
  methodVersion: '1.0.0';
  methodOutputId: string;
  input: Input;
  sections: {
    I01: {
      briefPointer: '/input/brief' | null;
      briefSha256: string | null;
      unresolvedFields: Strings;
      reviewState: 'DECLARED_NOT_AUTHENTICATED';
      blockers: Strings;
    };
    I02: Section;
    I04: Section;
    I05: {
      recordPointers: Pointers;
      annotationPointers: Pointers;
      pendingAnnotationPointers: Pointers;
      locatedRecordCount: number;
      semanticValidation: 'DECLARED_NOT_VERIFIED';
      blockers: Strings;
      /**
       * @maxItems 10000
       */
      recordPolarities: {
        recordPointer: string;
        polarity: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL' | 'UNCLEAR' | 'NOT_STATED';
      }[];
    };
    I06: {
      recordPointers: Pointers;
      annotationPointers: Pointers;
      pendingAnnotationPointers: Pointers;
      locatedRecordCount: number;
      semanticValidation: 'DECLARED_NOT_VERIFIED';
      blockers: Strings;
      /**
       * @maxItems 10000
       */
      sequences: {
        annotationPointer: string;
        sequenceBasis: 'SOURCE_EXPLICIT_SAME_RECORD';
        identityScope: 'RECORD_LOCAL';
        sequenceState: 'SOURCE_STATED_ORDER';
      }[];
    };
    I07: Section;
    I08: Section;
    I09: {
      recordPointers: Pointers;
      annotationPointers: Pointers;
      pendingAnnotationPointers: Pointers;
      locatedRecordCount: number;
      semanticValidation: 'DECLARED_NOT_VERIFIED';
      blockers: Strings;
      /**
       * @maxItems 10000
       */
      candidates: {
        annotationPointer: string;
        unmetNeedCandidate: boolean;
        state: 'EXPLICIT_GAP' | 'DESIRE_ONLY' | 'CURRENT_STATE_ONLY' | 'RELATION_UNCLEAR' | 'UNLOCATED';
      }[];
    };
    I10: CorpusSection;
    I13: CorpusSection;
  };
  limitations: Strings;
}
export interface Input {
  contractVersion: '1.0.0';
  codebookId: 'located-evidence-v1-draft';
  profileSha256: '6bae6b549273d163899c6a342082a84b85a11bffc69ab0d6e34131a311dfaded';
  adoptionSha256: '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7';
  question: string | null;
  inclusionRule: string;
  codingUnit: 'LOCATED_RECORD';
  adjudicationRule: string;
  /**
   * @maxItems 10000
   */
  sources: {
    logicalPath: string;
    sha256: string;
  }[];
  /**
   * @maxItems 10000
   */
  records: Record[];
  brief: Brief | null;
  /**
   * @maxItems 10000
   */
  i02: Context[];
  /**
   * @maxItems 10000
   */
  i04: Behavior[];
  /**
   * @maxItems 10000
   */
  i05: Attitude[];
  /**
   * @maxItems 10000
   */
  i06: Journey[];
  /**
   * @maxItems 10000
   */
  i07: Reason[];
  /**
   * @maxItems 10000
   */
  i08: Barrier[];
  /**
   * @maxItems 10000
   */
  i09: Gap[];
  /**
   * @maxItems 10000
   */
  corpora: Corpus[];
  /**
   * @maxItems 10000
   */
  i13Mentions: {
    recordIndex: number;
    span: Span;
    provenance: Provenance;
  }[];
}
export interface Record {
  sourceSha256: string;
  locator: string;
  text: string | null;
  sourceAttribution: string;
  timeText: string | null;
  disposition: 'INCLUDED' | 'EXCLUDED' | 'UNREADABLE';
  dispositionReason: string | null;
}
export interface Brief {
  version: string;
  questionText: OwnerField;
  decisionToInform: OwnerField;
  intendedAudience: OwnerField;
  scope: OwnerField;
  knownConstraints: OwnerField;
  /**
   * @maxItems 10000
   */
  selectedSectionIds: string[];
}
export interface OwnerField {
  state: 'SUPPLIED' | 'UNSET';
  text: string | null;
}
export interface Context {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  role: Field;
  situation: Field;
  task: Field;
  setting: Field;
  time: Field;
}
/**
 * Declared annotation provenance, never authenticated application approval. Pointer resolution proves text location only, not semantic truth or human authority. AI suggestions remain pending.
 */
export interface Provenance {
  basis: 'DECLARED' | 'HUMAN_REVIEWED' | 'PENDING_AI';
  coderRole: string;
  adjudication: string | null;
  disagreement: string | null;
}
/**
 * Half-open UTF-16 offsets in the exact record text, with no Unicode or whitespace normalization.
 */
export interface Span {
  start: number;
  end: number;
  quote: string;
}
export interface Field {
  state: 'SOURCE_STATED' | 'NOT_STATED' | 'UNKNOWN' | 'CONFLICTING' | 'UNLOCATED';
  span: Span | null;
}
export interface Behavior {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  span: Span;
  eventKind:
    'ATTEMPT_REPORTED' | 'ACTION_REPORTED' | 'COMPLETION_REPORTED' | 'NO_ACTION_EXPLICIT' | 'NOT_REPORTED' | 'UNKNOWN';
  attribution: 'SOURCE_LOGGED' | 'SELF_REPORTED' | 'OTHER_REPORTED' | 'UNKNOWN';
}
export interface Attitude {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  span: Span;
  polarity: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL' | 'UNCLEAR' | 'NOT_STATED';
  target: Field;
  speakerAttribution: Field;
}
export interface Journey {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  firstEvent: Span;
  secondEvent: Span;
  relation: Relation | null;
}
export interface Relation {
  context: Span;
  link: Span;
}
export interface Reason {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  choiceText: Span;
  reasonClause: Span;
  relation: Relation;
  reasonFacet:
    | 'PRICE_COST'
    | 'ACCESS_AVAILABILITY'
    | 'FIT_NEED'
    | 'PRODUCT_ATTRIBUTE'
    | 'INFORMATION_TRUST'
    | 'OTHER_EXPLICIT'
    | 'UNCLEAR';
  reasonPolarity: 'AFFIRMED' | 'NEGATED' | 'CONDITIONAL' | 'UNCLEAR';
  speakerBasis: 'SELF_STATED' | 'OTHER_REPORTED' | 'SOURCE_ATTRIBUTED' | 'UNKNOWN';
  resultState: Field;
}
export interface Barrier {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  attemptedTask: Span;
  obstacleClause: Span;
  relation: Relation;
  barrierFacet:
    | 'PRICE_COST'
    | 'ACCESS_AVAILABILITY'
    | 'FIT_NEED'
    | 'PRODUCT_ATTRIBUTE'
    | 'INFORMATION_TRUST'
    | 'OTHER_EXPLICIT'
    | 'UNCLEAR';
  resolutionState: Field;
}
export interface Gap {
  recordIndex: number;
  provenance: Provenance;
  /**
   * @maxItems 10000
   */
  qualifiers: Span[];
  /**
   * @maxItems 10000
   */
  counterevidence: Span[];
  desiredState: Span | null;
  currentState: Span | null;
  relation: Relation | null;
  workaround: Field;
}
export interface Corpus {
  sectionId: 'I10' | 'I13';
  /**
   * @maxItems 10000
   */
  recordIndexes: number[];
  question: string;
  unit: string;
  period: string | null;
  frame: string | null;
  channel: string | null;
  inclusionRule: string;
  membershipComplete: boolean;
  multiCode: boolean;
  externalSampling: string;
  codebook: {
    revision: string;
    /**
     * @maxItems 10000
     */
    codes: {
      code: string;
      label: string;
      phrase: string;
      firstRecordIndex: number | null;
      firstSpan: Span | null;
    }[];
  };
  /**
   * @maxItems 10000
   */
  assignments: {
    recordIndex: number;
    code: string;
    span: Span;
    provenance: Provenance;
  }[];
  /**
   * @maxItems 10000
   */
  dispositions: {
    recordIndex: number;
    state: 'CODED' | 'UNCODED' | 'UNCLEAR' | 'PENDING';
    provenance: Provenance;
  }[];
}
export interface Section {
  recordPointers: Pointers;
  annotationPointers: Pointers;
  pendingAnnotationPointers: Pointers;
  locatedRecordCount: number;
  semanticValidation: 'DECLARED_NOT_VERIFIED';
  blockers: Strings;
}
export interface CorpusSection {
  /**
   * @maxItems 10000
   */
  corpora: {
    corpusIndex: number;
    membershipCount: number;
    includedRecordCount: number;
    excludedCount: number;
    unreadableCount: number;
    pendingCount: number;
    unclearCount: number;
    uncodedCount: number;
    codedCount: number;
    multiCodedCount: number;
    duplicateReferenceCount: number;
    codingComplete: boolean;
    ratioStatus: 'COMPLETE' | 'PARTIAL' | 'ZERO_DENOMINATOR';
    /**
     * @maxItems 10000
     */
    counts: {
      code: string;
      recordCount: number;
      ratio: {
        numerator: number;
        denominator: number;
      } | null;
      annotationPointers: Pointers;
    }[];
    blockers: Strings;
  }[];
  mentionPointers: Pointers;
  pendingMentionPointers: Pointers;
  countUnit: 'LOCATED_RECORDS';
  semanticValidation: 'DECLARED_NOT_VERIFIED';
  blockers: Strings;
}
