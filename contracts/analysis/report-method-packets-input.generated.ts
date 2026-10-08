/* Generated from report-method-packets-input.schema.json. Do not edit by hand. */

/**
 * @maxItems 1000
 */
export type Keys = string[];
/**
 * @maxItems 100
 */
export type Strings = string[];

export interface ReportMethodPacketsInput {
  contractVersion: 'report-method-packets-v1';
  gates: Input | null;
  decisions: Input1 | null;
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
      groupBasis?: {
        platform: {
          state: 'SOURCE_STATED' | 'NOT_STATED';
          value: string | null;
          source: Source | null;
        };
        buyerType: {
          state: 'SOURCE_STATED' | 'NOT_STATED';
          value: string | null;
          source: Source | null;
        };
      };
      /**
       * @maxItems 10000
       */
      memberSources?: Source[];
      /**
       * @maxItems 10000
       */
      numeratorMemberSources?: Source[];
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
  semanticsVersion?: '1.0.0' | '1.1.0';
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
export interface Input1 {
  contractVersion: '1.0.0';
  synthesisProfileSha256: '5fd879f42d6c9c82cbc87710b69206aaac2fc8d6bac2da18ba158825f910225a';
  adoptionSha256: '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7';
  question: OwnerField;
  constraints: Constraints;
  /**
   * @maxItems 1000
   */
  claims: Claim[];
  questionClaimKeys: Keys;
  /**
   * @maxItems 100
   */
  ownerHypotheses: OwnerGroup[];
  /**
   * @maxItems 100
   */
  ownerDirections: OwnerGroup[];
  /**
   * @maxItems 100
   */
  ownerOptions: OwnerOption[];
}
export interface OwnerField {
  state: 'SUPPLIED' | 'UNSET';
  text: string | null;
}
export interface Constraints {
  cost: OwnerField;
  capability: OwnerField;
  time: OwnerField;
  risk: OwnerField;
  accountableRole: OwnerField;
  criteria: OwnerField;
  reviewTrigger: OwnerField;
}
export interface Claim {
  claimKey: string;
  reference: {
    fileName: 'metric-result.json';
    sha256: string;
    /**
     * Exact FactObservation pointer in the current verified packet, derived from the referenced metric result bytes. Not a pointer inside metric-result.json.
     */
    claimPointer: string;
  };
  payload: FactObservation;
  reviewDeclaration: {
    state: 'UNREVIEWED' | 'DECLARED_REVIEWED' | 'EXCLUDED';
    reason: string | null;
  };
  counterclaimKeys: Keys;
}
export interface FactObservation {
  claimId: string;
  sectionId: string;
  claimType: 'FACT';
  evidenceState: 'DETERMINISTIC_NORMALIZED_OBSERVATION';
  approvalState: 'UNREVIEWED';
  statementKind: 'LISTING_COUNT' | 'SHOP_COUNT' | 'OBSERVED_REVENUE' | 'OBSERVED_UNITS' | 'TOP_SHOP_SHARE';
  scopeKey: 'all' | 'wide' | 'core';
  value: string | number;
  unit: 'listing' | 'shop' | 'VND' | 'unit' | 'percent';
  metricPointer: string;
  scopePointer: '/input/scope';
  membershipPointer: string;
  denominatorPointer: string | null;
  coveragePointer: string | null;
  /**
   * @minItems 1
   * @maxItems 20
   */
  limitations:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
}
export interface OwnerGroup {
  label: string;
  claimKeys: Keys;
  counterclaimKeys: Keys;
  missingEvidence: Strings;
}
export interface OwnerOption {
  label: string;
  claimKeys: Keys;
  counterclaimKeys: Keys;
  missingEvidence: Strings;
  constraints: OptionConstraints;
}
export interface OptionConstraints {
  cost: OwnerField;
  capability: OwnerField;
  time: OwnerField;
  risk: OwnerField;
}
