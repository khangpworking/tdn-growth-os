/* Generated from decision-evidence-packets.schema.json. Do not edit by hand. */

export type Digest = string;
export type Text = string;
export type Key = string;
/**
 * @maxItems 1000
 */
export type Keys = Key[];
/**
 * @maxItems 100
 */
export type Strings = Text[];
export type Index = number;
/**
 * @maxItems 100
 */
export type Indexes = Index[];

export interface DecisionEvidencePackets {
  contractVersion: '1.0.0';
  methodId: 'decision-evidence-packets';
  methodVersion: '1.0.0';
  methodOutputId: Digest;
  input: Input;
  /**
   * @maxItems 1000
   */
  inventory: InventoryItem[];
  duplicateReferenceCount: number;
  sections: {
    M01: {
      claimKeys: Keys;
      questionClaimKeys: Keys;
      unassignedClaimKeys: Keys;
      declaredReviewedClaimKeys: Keys;
      unreviewedClaimKeys: Keys;
      excludedClaimKeys: Keys;
      conclusion: null;
      conclusionState: 'UNRANKED_INVENTORY';
      decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED';
      blockers: Strings;
    };
    M11: {
      /**
       * @maxItems 1000
       */
      groups: EvidenceGroup[];
      unassignedClaimKeys: Keys;
      priority: null;
      decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED';
      blockers: Strings;
    };
    I14: {
      /**
       * @maxItems 100
       */
      directions: EvidenceGroup[];
      unassignedClaimKeys: Keys;
      /**
       * @maxItems 1000
       */
      ambiguousClaims: {
        claimKey: Key;
        directionIndexes: Indexes;
      }[];
      priority: null;
      decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED';
      blockers: Strings;
    };
    I15: {
      /**
       * @maxItems 100
       */
      options: {
        ownerIndex: Index;
        label: Text;
        claimKeys: Keys;
        counterclaimKeys: Keys;
        excludedClaimKeys: Keys;
        constraints: OptionConstraints;
        missingEvidence: Strings;
        priority: null;
        decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED';
      }[];
      unassignedClaimKeys: Keys;
      preferredOption: null;
      decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED';
      blockers: Strings;
    };
    M12: {
      question: OwnerField;
      claimKeys: Keys;
      ownerOptionIndexes: Indexes;
      constraints: Constraints;
      decisionState: 'OPEN';
      chosen: null;
      executionAuthorization: null;
      decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED';
      blockers: Strings;
    };
  };
  limitations: Strings;
}
export interface Input {
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
  text: Text | null;
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
  claimKey: Key;
  reference: {
    fileName: 'metric-result.json';
    sha256: Digest;
    /**
     * Exact FactObservation pointer in the current verified packet, derived from the referenced metric result bytes. Not a pointer inside metric-result.json.
     */
    claimPointer: string;
  };
  payload: FactObservation;
  reviewDeclaration: {
    state: 'UNREVIEWED' | 'DECLARED_REVIEWED' | 'EXCLUDED';
    reason: Text | null;
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
  label: Text;
  claimKeys: Keys;
  counterclaimKeys: Keys;
  missingEvidence: Strings;
}
export interface OwnerOption {
  label: Text;
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
export interface InventoryItem {
  claimKey: Key;
  inputIndex: Index;
  sectionId: string;
  reviewState: 'UNREVIEWED' | 'DECLARED_REVIEWED' | 'EXCLUDED';
  counterclaimKeys: Keys;
  decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED';
}
export interface EvidenceGroup {
  basis: 'OWNER_DECLARATION' | 'SOURCE_SECTION';
  ownerIndex: Index | null;
  label: Text;
  claimKeys: Keys;
  counterclaimKeys: Keys;
  excludedClaimKeys: Keys;
  missingEvidence: Strings;
  priority: null;
  decisionSupportStatus: 'HUMAN_REVIEW_REQUIRED';
}
