/* Generated from bounded-analysis-gates.schema.json. Do not edit by hand. */

export type Digest = string;
export type Text = string;
export type NullableText = Text | null;
export type Date = string;

export interface BoundedAnalysisGates {
  contractVersion: '1.0.0';
  methodId: 'bounded-analysis-gates';
  methodVersion: '1.0.0';
  methodOutputId: Digest;
  input: Input;
  sections: {
    M10: M10Output;
    I11: I11Output;
    I12: I12Output;
    I16: I16Output;
  };
  /**
   * @maxItems 10000
   */
  limitations: Text[];
}
export interface Input {
  contractVersion: '1.0.0';
  configuration: {
    advancedProfileSha256: 'c4e0f5fbda7f1afbb47571a384c59e59aa31264b2e5b79a38bce97a30605ba63';
    adoptionSha256: '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7';
  };
  m10: {
    source: Source;
    /**
     * @maxItems 10000
     */
    series: {
      source: Source;
      entityLiteral: NullableText;
      metric: NullableText;
      unit: NullableText;
      timezone: NullableText;
      dailyBoundary: NullableText;
      universe: NullableText;
      frame: NullableText;
      aggregationRule: NullableText;
      period: Period;
      /**
       * @maxItems 10000
       */
      rows: {
        source: Source;
        date: Date;
        observation: Value;
      }[];
      splits: {
        train: Period | null;
        validation: Period | null;
        holdout: Period | null;
      };
      policy: {
        revision: NullableText;
        modelId: NullableText;
        baselineId: NullableText;
        historyMinimumDays: number | null;
        horizonDays: number | null;
        gapPolicy: NullableText;
        errorMetric: NullableText;
        selectionRule: NullableText;
        refitRule: NullableText;
      };
    }[];
  } | null;
  i11: {
    source: Source;
    groupPolicy: {
      source: Source;
      revision: Text;
      /**
       * @maxItems 10000
       */
      groups: {
        label: Text;
        source: Source;
      }[];
      overlap: 'DISJOINT' | 'OVERLAPPING' | 'UNKNOWN';
      exhaustiveness: 'EXHAUSTIVE' | 'NON_EXHAUSTIVE' | 'UNKNOWN';
      suppressionRule: NullableText;
    } | null;
    /**
     * @maxItems 10000
     */
    cells: {
      source: Source;
      group: NullableText;
      assignment: {
        state: 'SOURCE_ASSIGNED' | 'UNKNOWN';
        source: Source | null;
      };
      countUnit: 'LOCATED_RECORD' | 'SOURCE_AGGREGATE' | 'SOURCE_IDENTIFIED_ENTITY';
      identityEvidence: Source | null;
      scope: Scope;
      numerator: Value;
      denominator: Value;
    }[];
  } | null;
  i12: {
    source: Source;
    /**
     * @maxItems 10000
     */
    records: {
      source: Source;
      kind: 'PRESENCE' | 'EXPOSURE' | 'OUTCOME';
      touchpoint: Text;
      channel: NullableText;
      date: Date | null;
      attribution: Text;
      scope: Scope;
      window: NullableText;
      observation: Value | null;
    }[];
  } | null;
  i16: {
    source: Source;
    mode: 'DESIGN_ONLY' | 'EXISTING_RESULT';
    protocolRef: Source | null;
    fields: {
      question: NullableText;
      assignmentMechanism: NullableText;
      assignmentUnit: NullableText;
      treatment: NullableText;
      comparator: NullableText;
      eligibility: NullableText;
      instrumentation: NullableText;
      outcome: NullableText;
      unit: NullableText;
      window: NullableText;
      exclusions: NullableText;
      attrition: NullableText;
      estimator: NullableText;
      missingRule: NullableText;
      uncertaintyRule: NullableText;
      decisionRule: NullableText;
    };
    /**
     * @maxItems 10000
     */
    outcomes: {
      source: Source;
      arm: 'TREATMENT' | 'COMPARATOR' | 'UNKNOWN';
      assignmentUnit: NullableText;
      outcome: NullableText;
      unit: NullableText;
      window: NullableText;
      observation: Value;
      denominator: Value;
    }[];
  } | null;
}
export interface Source {
  logicalPath: Text;
  sha256: Digest;
  locator: string;
}
export interface Period {
  start: Date;
  end: Date;
}
export interface Value {
  state: 'observed_value' | 'observed_zero' | 'missing' | 'UNKNOWN';
  value: string | null;
}
export interface Scope {
  measure: NullableText;
  unit: NullableText;
  period: Period | null;
  timezone: NullableText;
  universe: NullableText;
  frame: NullableText;
  inclusionRule: NullableText;
}
export interface M10Output {
  status: 'BLOCKED';
  /**
   * @maxItems 10000
   */
  partitions: {
    seriesPointer: Text;
    /**
     * @maxItems 10000
     */
    recordPointers: Text[];
    /**
     * @maxItems 10000
     */
    missingCalendarDates: Date[];
    /**
     * @maxItems 10000
     */
    missingValueDates: Date[];
    /**
     * @maxItems 10000
     */
    unknownValueDates: Date[];
    /**
     * @maxItems 10000
     */
    observedZeroDates: Date[];
    splitStatus: 'VALID' | 'INVALID' | 'MISSING';
    structurallyComplete: boolean;
    /**
     * @maxItems 10000
     */
    blockers: Text[];
  }[];
  forecasts: null;
  errorMetrics: null;
  baselineEvaluation: null;
  /**
   * @maxItems 10000
   */
  blockers: Text[];
}
export interface I11Output {
  status: 'INTERNAL_INVENTORY';
  /**
   * @maxItems 10000
   */
  partitions: {
    /**
     * @maxItems 10000
     */
    cellPointers: Text[];
    /**
     * @maxItems 10000
     */
    groupOrder: Text[];
    /**
     * @maxItems 10000
     */
    unknownAssignmentPointers: Text[];
    /**
     * @maxItems 10000
     */
    blockers: Text[];
  }[];
  rates: null;
  differences: null;
  publicationStatus: 'NOT_AUTHORIZED';
  /**
   * @maxItems 10000
   */
  blockers: Text[];
}
export interface I12Output {
  status: 'SEPARATE_INVENTORIES';
  /**
   * @maxItems 10000
   */
  presencePointers: Text[];
  /**
   * @maxItems 10000
   */
  exposurePointers: Text[];
  /**
   * @maxItems 10000
   */
  outcomePointers: Text[];
  /**
   * @maxItems 10000
   */
  partitions: {
    kind: 'PRESENCE' | 'EXPOSURE' | 'OUTCOME';
    /**
     * @maxItems 10000
     */
    recordPointers: Text[];
    /**
     * @maxItems 10000
     */
    blockers: Text[];
  }[];
  joins: null;
  rates: null;
  effectiveness: null;
  /**
   * @maxItems 10000
   */
  blockers: Text[];
}
export interface I16Output {
  mode: 'DESIGN_ONLY' | 'EXISTING_RESULT' | null;
  status: 'METHOD_ONLY' | 'ELIGIBILITY_ONLY' | 'BLOCKED';
  executionState: 'NOT_EXECUTED';
  structurallyComplete: boolean;
  protocolPointer: NullableText;
  /**
   * @maxItems 10000
   */
  outcomePointers: Text[];
  /**
   * @maxItems 10000
   */
  missingFields: Text[];
  /**
   * @maxItems 10000
   */
  incompatibleOutcomePointers: Text[];
  estimate: null;
  uncertainty: null;
  /**
   * @maxItems 10000
   */
  blockers: Text[];
}
