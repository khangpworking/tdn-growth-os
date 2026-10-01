/* Generated from descriptive-market-methods.schema.json. Do not edit by hand. */

export type Digest = string;
export type Text = string;
export type NullableText = Text | null;
export type Decimal = string;
export type Count = number;
export type Pointer = string;
/**
 * @maxItems 10000
 */
export type Pointers = Pointer[];
export type Blockers = (
  | 'NO_LOCATED_RECORDS'
  | 'PERIOD_MISSING'
  | 'UNIT_MISSING'
  | 'ADDITIVITY_UNDECLARED'
  | 'AGGREGATION_OVERLAP_UNRESOLVED'
  | 'AGGREGATION_FRAME_INCOMPATIBLE'
  | 'MEMBERSHIP_INCOMPLETE'
  | 'VALUE_MISSING'
  | 'VALUE_UNKNOWN'
  | 'NON_EXACT_VALUE'
  | 'M07_PEER_SET_UNAPPROVED'
  | 'M07_IDENTITY_UNRESOLVED'
  | 'M07_PERIOD_INCOMPATIBLE'
  | 'M07_UNIVERSE_OR_MEASURE_INCOMPATIBLE'
  | 'M09_EVENT_DATE_UNKNOWN'
  | 'M09_ENTITY_LINK_UNRESOLVED'
  | 'M09_COUNTEREVIDENCE_CONFLICT'
)[];

export interface DescriptiveMarketMethods {
  contractVersion: '1.0.0';
  methodId: 'source-bound-descriptive-market';
  methodVersion: '1.0.0';
  methodOutputId: Digest;
  input: DescriptiveMarketInput;
  sections: {
    M05: {
      locatedRecordCount: Count;
      partitions: LiteralMarketPartition[];
      blockers: Blockers;
    };
    M06: {
      locatedRecordCount: Count;
      recordPointers: Pointers;
      uniqueEntityCount: null;
      blockers: Blockers;
    };
    M07: {
      mode: 'DECLARED_PEERS_SIDE_BY_SIDE' | 'UNRANKED_INVENTORY';
      recordPointers: Pointers;
      comparisons: DeclaredMarketComparison[];
      blockers: Blockers;
    };
    M09: {
      locatedRecordCount: Count;
      events: {
        recordPointer: Pointer;
        blockers: Blockers;
      }[];
      blockers: Blockers;
    };
  };
  /**
   * @minItems 1
   */
  limitations: [Text, ...Text[]];
}
export interface DescriptiveMarketInput {
  contractVersion: '1.0.0';
  sourcePackage: {
    packageId: string;
    version: number;
    manifestArtifactSha256: Digest;
    packageContentSha256: Digest;
  };
  /**
   * @minItems 1
   * @maxItems 1000
   */
  sources: [
    {
      logicalPath: Text;
      sha256: Digest;
      evidenceFamily: Text;
      providerProvenance: 'verified' | 'provider_reported' | 'operator_supplied_unverified' | 'synthetic';
    },
    ...{
      logicalPath: Text;
      sha256: Digest;
      evidenceFamily: Text;
      providerProvenance: 'verified' | 'provider_reported' | 'operator_supplied_unverified' | 'synthetic';
    }[],
  ];
  configuration: {
    profileId: 'source-bound-descriptive-market-v1';
    profileVersion: '1.0.0';
    policyRevision: Text;
    profileSha256: Digest;
    adoptionSha256: Digest;
    runConfiguration: EvidenceRef;
  };
  question: Text;
  scope: MarketObservationScope;
  /**
   * @maxItems 10000
   */
  m05: LiteralMarketObservation[];
  /**
   * @maxItems 10000
   */
  m06: SourceStatedSupplyRecord[];
  /**
   * @maxItems 10000
   */
  m07: LiteralMarketObservation[];
  peerSet: DeclaredMarketPeerSet | null;
  /**
   * @maxItems 10000
   */
  m09: AttributedMarketEvent[];
}
export interface EvidenceRef {
  sourceSha256: string;
  locator: string;
}
export interface MarketObservationScope {
  universe: Text;
  geography: Text;
  frame: Text;
  inclusionRule: Text;
  exclusionRule: Text;
  variantRule: Text;
}
export interface LiteralMarketObservation {
  source: EvidenceRef;
  sourceWording: Text;
  entityLabel: NullableText;
  measureLiteral: Text;
  measureDefinition: Text;
  unit: NullableText;
  period: MarketObservationPeriod | null;
  scope: MarketObservationScope;
  observation: LiteralMarketValue;
  aggregation: MarketMemberAggregation | null;
}
export interface MarketObservationPeriod {
  start: string;
  end: string;
  timezone: Text;
  basis: Text;
}
export interface LiteralMarketValue {
  state: 'missing' | 'observed_zero' | 'observed_value' | 'UNKNOWN';
  value: Decimal | null;
  precision: 'exact' | 'non_exact';
}
/**
 * Source-issued atomic member keys, never generated from text or locators. Proof must establish additivity, member granularity and complete required membership. Overlapping windows require upstream evidence of atomic disjoint members; v1 never infers disjoint windows.
 */
export interface MarketMemberAggregation {
  additive: boolean;
  aggregationUnit: Text;
  sourceKeyNamespace: Text;
  /**
   * @minItems 1
   * @maxItems 10000
   */
  members: [
    {
      sourceKey: Text;
      source: EvidenceRef;
    },
    ...{
      sourceKey: Text;
      source: EvidenceRef;
    }[],
  ];
  /**
   * @minItems 1
   * @maxItems 10000
   */
  requiredMemberKeys: [Text, ...Text[]];
  proof: EvidenceRef;
}
export interface SourceStatedSupplyRecord {
  observation: LiteralMarketObservation;
  objectLiteral: Text;
  statusLiteral: NullableText;
  dateMeaning: Text;
}
export interface DeclaredMarketPeerSet {
  anchorRef: EvidenceRef;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  peerRefs: [EvidenceRef, ...EvidenceRef[]];
  membershipBasis: Text;
  scope: MarketObservationScope;
  membershipRevision: Text;
  declaration: EvidenceRef;
}
export interface AttributedMarketEvent {
  source: EvidenceRef;
  statementType: 'DOCUMENTED_EVENT' | 'SOURCE_STATED_DIRECTION' | 'COUNTEREVIDENCE' | 'UNCLASSIFIED';
  sourceWording: Text;
  attribution: Text;
  publicationDate: string | null;
  eventDate: string | null;
  dateBasis: Text;
  namedScope: Text;
  targetLink: EvidenceRef | null;
  affectedMetricLiteral: NullableText;
  /**
   * @maxItems 1000
   */
  conflictRefs: EvidenceRef[];
}
export interface LiteralMarketPartition {
  recordPointers: Pointers;
  measureLiteral: Text;
  unit: NullableText;
  period: MarketObservationPeriod | null;
  scope: MarketObservationScope;
  subtotal: string | null;
  complete: boolean;
  coverage: {
    observedCount: Count;
    zeroCount: Count;
    missingCount: Count;
    unknownCount: Count;
    nonExactCount: Count;
  };
  blockers: Blockers;
}
export interface DeclaredMarketComparison {
  anchorRef: EvidenceRef;
  peerRef: EvidenceRef;
  anchorPointer: Pointer | null;
  peerPointer: Pointer | null;
  compatibility: 'COMPARABLE' | 'NOT_COMPARABLE';
  blockers: Blockers;
}
