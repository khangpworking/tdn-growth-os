/* Generated from located-insight-methods.schema.json. Do not edit by hand. */

export type Digest = string;
export type NullableText = Text | null;
export type Text = string;
export type Index = number;
export type Facet =
  | 'PRICE_COST'
  | 'ACCESS_AVAILABILITY'
  | 'FIT_NEED'
  | 'PRODUCT_ATTRIBUTE'
  | 'INFORMATION_TRUST'
  | 'OTHER_EXPLICIT'
  | 'UNCLEAR';
/**
 * @maxItems 10000
 */
export type Strings = Text[];
/**
 * @maxItems 10000
 */
export type Pointers = string[];
export type Count = number;

export interface LocatedInsightMethods {
  contractVersion: '1.0.0';
  methodId: 'located-insight-methods';
  methodVersion: '1.0.0' | '1.1.0';
  methodOutputId: Digest;
  input: Input;
  sections: {
    I01: {
      briefPointer: '/input/brief' | null;
      briefSha256: Digest | null;
      unresolvedFields: Strings;
      reviewState: 'DECLARED_NOT_AUTHENTICATED';
      blockers: Strings;
      workingQuestion?: {
        state: 'AI_PROPOSED_AWAITING_OWNER' | 'OWNER_SUPPLIED';
        label: Text | null;
        text: Text | null;
        /**
         * @maxItems 10000
         */
        ownerFieldsToAdd: Text[];
      };
    };
    I02: Section;
    I04: Section;
    I05: {
      recordPointers: Pointers;
      annotationPointers: Pointers;
      pendingAnnotationPointers: Pointers;
      locatedRecordCount: Count;
      semanticValidation: 'DECLARED_NOT_VERIFIED';
      blockers: Strings;
      /**
       * @maxItems 10000
       */
      recordPolarities: {
        recordPointer: Text;
        polarity: 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL' | 'UNCLEAR' | 'NOT_STATED';
      }[];
    };
    I06: {
      recordPointers: Pointers;
      annotationPointers: Pointers;
      pendingAnnotationPointers: Pointers;
      locatedRecordCount: Count;
      semanticValidation: 'DECLARED_NOT_VERIFIED';
      blockers: Strings;
      /**
       * @maxItems 10000
       */
      sequences: {
        annotationPointer: Text;
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
      locatedRecordCount: Count;
      semanticValidation: 'DECLARED_NOT_VERIFIED';
      blockers: Strings;
      /**
       * @maxItems 10000
       */
      candidates: {
        annotationPointer: Text;
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
  question: NullableText;
  inclusionRule: Text;
  codingUnit: 'LOCATED_RECORD';
  adjudicationRule: Text;
  /**
   * @maxItems 10000
   */
  sources: {
    logicalPath: Text;
    sha256: Digest;
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
    recordIndex: Index;
    span: Span;
    provenance: Provenance;
  }[];
  semanticsVersion?: '1.0.0' | '1.1.0';
  workingQuestionProposal?: Text | null;
}
export interface Record {
  sourceSha256: Digest;
  locator: string;
  text: string | null;
  sourceAttribution: Text;
  timeText: NullableText;
  disposition: 'INCLUDED' | 'EXCLUDED' | 'UNREADABLE';
  dispositionReason: NullableText;
}
export interface Brief {
  version: Text;
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
  text: NullableText;
}
export interface Context {
  recordIndex: Index;
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
  coderRole: Text;
  adjudication: NullableText;
  disagreement: NullableText;
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
  recordIndex: Index;
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
  recordIndex: Index;
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
  recordIndex: Index;
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
  recordIndex: Index;
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
  reasonFacet: Facet;
  reasonPolarity: 'AFFIRMED' | 'NEGATED' | 'CONDITIONAL' | 'UNCLEAR';
  speakerBasis: 'SELF_STATED' | 'OTHER_REPORTED' | 'SOURCE_ATTRIBUTED' | 'UNKNOWN';
  resultState: Field;
}
export interface Barrier {
  recordIndex: Index;
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
  barrierFacet: Facet;
  resolutionState: Field;
}
export interface Gap {
  recordIndex: Index;
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
  recordIndexes: Index[];
  question: Text;
  unit: Text;
  period: NullableText;
  frame: NullableText;
  channel: NullableText;
  inclusionRule: Text;
  membershipComplete: boolean;
  multiCode: boolean;
  externalSampling: Text;
  codebook: {
    revision: Text;
    /**
     * @maxItems 10000
     */
    codes: {
      code: Text;
      label: Text;
      phrase: Text;
      firstRecordIndex: Index | null;
      firstSpan: Span | null;
    }[];
  };
  /**
   * @maxItems 10000
   */
  assignments: {
    recordIndex: Index;
    code: Text;
    span: Span;
    provenance: Provenance;
  }[];
  /**
   * @maxItems 10000
   */
  dispositions: {
    recordIndex: Index;
    state: 'CODED' | 'UNCODED' | 'UNCLEAR' | 'PENDING';
    provenance: Provenance;
  }[];
}
export interface Section {
  recordPointers: Pointers;
  annotationPointers: Pointers;
  pendingAnnotationPointers: Pointers;
  locatedRecordCount: Count;
  semanticValidation: 'DECLARED_NOT_VERIFIED';
  blockers: Strings;
}
export interface CorpusSection {
  /**
   * @maxItems 10000
   */
  corpora: {
    corpusIndex: Index;
    membershipCount: Count;
    includedRecordCount: Count;
    excludedCount: Count;
    unreadableCount: Count;
    pendingCount: Count;
    unclearCount: Count;
    uncodedCount: Count;
    codedCount: Count;
    multiCodedCount: Count;
    duplicateReferenceCount: Count;
    codingComplete: boolean;
    ratioStatus: 'COMPLETE' | 'PARTIAL' | 'ZERO_DENOMINATOR';
    /**
     * @maxItems 10000
     */
    counts: {
      code: Text;
      recordCount: Count;
      ratio: {
        numerator: Count;
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
