/* Generated from automation-bounded-method-snapshot.schema.json. Do not edit by hand. */

export type Uuid = string;
export type Digest = string;

/**
 * Bounded gates recomputed from one exact Foundation package descriptor. Gates only: no decision claims, approval, forecast, causal estimate or AI execution.
 */
export interface AutomationBoundedMethodSnapshot {
  contractVersion: 'automation-bounded-method-snapshot-v1';
  binding: AutomationBoundedMethodBinding;
  selection: BoundedMethodPackageSelection;
  descriptorSha256: Digest;
  output: BoundedAnalysisGates;
}
export interface AutomationBoundedMethodBinding {
  workspaceId: Uuid;
  runId: Uuid;
  startSha256: Digest;
  scopeSha256: Digest;
  previousPairId: Digest;
}
/**
 * Exact finalized Foundation package and descriptor path. Package identity is checked; descriptor references verify literal bytes only, not truth, period compatibility or approval.
 */
export interface BoundedMethodPackageSelection {
  decision: 'USE_PACKAGE';
  packageId: string;
  manifestArtifactSha256: string;
  packageContentSha256: string;
  descriptorPath: string;
}
export interface BoundedAnalysisGates {
  contractVersion: '1.0.0';
  methodId: 'bounded-analysis-gates';
  methodVersion: '1.0.0';
  methodOutputId: string;
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
  limitations: string[];
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
      entityLiteral: string | null;
      metric: string | null;
      unit: string | null;
      timezone: string | null;
      dailyBoundary: string | null;
      universe: string | null;
      frame: string | null;
      aggregationRule: string | null;
      period: Period;
      /**
       * @maxItems 10000
       */
      rows: {
        source: Source;
        date: string;
        observation: Value;
      }[];
      splits: {
        train: Period | null;
        validation: Period | null;
        holdout: Period | null;
      };
      policy: {
        revision: string | null;
        modelId: string | null;
        baselineId: string | null;
        historyMinimumDays: number | null;
        horizonDays: number | null;
        gapPolicy: string | null;
        errorMetric: string | null;
        selectionRule: string | null;
        refitRule: string | null;
      };
    }[];
  } | null;
  i11: {
    source: Source;
    groupPolicy: {
      source: Source;
      revision: string;
      /**
       * @maxItems 10000
       */
      groups: {
        label: string;
        source: Source;
      }[];
      overlap: 'DISJOINT' | 'OVERLAPPING' | 'UNKNOWN';
      exhaustiveness: 'EXHAUSTIVE' | 'NON_EXHAUSTIVE' | 'UNKNOWN';
      suppressionRule: string | null;
    } | null;
    /**
     * @maxItems 10000
     */
    cells: {
      source: Source;
      group: string | null;
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
      touchpoint: string;
      channel: string | null;
      date: string | null;
      attribution: string;
      scope: Scope;
      window: string | null;
      observation: Value | null;
    }[];
  } | null;
  i16: {
    source: Source;
    mode: 'DESIGN_ONLY' | 'EXISTING_RESULT';
    protocolRef: Source | null;
    fields: {
      question: string | null;
      assignmentMechanism: string | null;
      assignmentUnit: string | null;
      treatment: string | null;
      comparator: string | null;
      eligibility: string | null;
      instrumentation: string | null;
      outcome: string | null;
      unit: string | null;
      window: string | null;
      exclusions: string | null;
      attrition: string | null;
      estimator: string | null;
      missingRule: string | null;
      uncertaintyRule: string | null;
      decisionRule: string | null;
    };
    /**
     * @maxItems 10000
     */
    outcomes: {
      source: Source;
      arm: 'TREATMENT' | 'COMPARATOR' | 'UNKNOWN';
      assignmentUnit: string | null;
      outcome: string | null;
      unit: string | null;
      window: string | null;
      observation: Value;
      denominator: Value;
    }[];
  } | null;
}
export interface Source {
  logicalPath: string;
  sha256: string;
  locator: string;
}
export interface Period {
  start: string;
  end: string;
}
export interface Value {
  state: 'observed_value' | 'observed_zero' | 'missing' | 'UNKNOWN';
  value: string | null;
}
export interface Scope {
  measure: string | null;
  unit: string | null;
  period: Period | null;
  timezone: string | null;
  universe: string | null;
  frame: string | null;
  inclusionRule: string | null;
}
export interface M10Output {
  status: 'BLOCKED';
  /**
   * @maxItems 10000
   */
  partitions: {
    seriesPointer: string;
    /**
     * @maxItems 10000
     */
    recordPointers: string[];
    /**
     * @maxItems 10000
     */
    missingCalendarDates: string[];
    /**
     * @maxItems 10000
     */
    missingValueDates: string[];
    /**
     * @maxItems 10000
     */
    unknownValueDates: string[];
    /**
     * @maxItems 10000
     */
    observedZeroDates: string[];
    splitStatus: 'VALID' | 'INVALID' | 'MISSING';
    structurallyComplete: boolean;
    /**
     * @maxItems 10000
     */
    blockers: string[];
  }[];
  forecasts: null;
  errorMetrics: null;
  baselineEvaluation: null;
  /**
   * @maxItems 10000
   */
  blockers: string[];
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
    cellPointers: string[];
    /**
     * @maxItems 10000
     */
    groupOrder: string[];
    /**
     * @maxItems 10000
     */
    unknownAssignmentPointers: string[];
    /**
     * @maxItems 10000
     */
    blockers: string[];
  }[];
  rates: null;
  differences: null;
  publicationStatus: 'NOT_AUTHORIZED';
  /**
   * @maxItems 10000
   */
  blockers: string[];
}
export interface I12Output {
  status: 'SEPARATE_INVENTORIES';
  /**
   * @maxItems 10000
   */
  presencePointers: string[];
  /**
   * @maxItems 10000
   */
  exposurePointers: string[];
  /**
   * @maxItems 10000
   */
  outcomePointers: string[];
  /**
   * @maxItems 10000
   */
  partitions: {
    kind: 'PRESENCE' | 'EXPOSURE' | 'OUTCOME';
    /**
     * @maxItems 10000
     */
    recordPointers: string[];
    /**
     * @maxItems 10000
     */
    blockers: string[];
  }[];
  joins: null;
  rates: null;
  effectiveness: null;
  /**
   * @maxItems 10000
   */
  blockers: string[];
}
export interface I16Output {
  mode: 'DESIGN_ONLY' | 'EXISTING_RESULT' | null;
  status: 'METHOD_ONLY' | 'ELIGIBILITY_ONLY' | 'BLOCKED';
  executionState: 'NOT_EXECUTED';
  structurallyComplete: boolean;
  protocolPointer: string | null;
  /**
   * @maxItems 10000
   */
  outcomePointers: string[];
  /**
   * @maxItems 10000
   */
  missingFields: string[];
  /**
   * @maxItems 10000
   */
  incompatibleOutcomePointers: string[];
  estimate: null;
  uncertainty: null;
  /**
   * @maxItems 10000
   */
  blockers: string[];
}
