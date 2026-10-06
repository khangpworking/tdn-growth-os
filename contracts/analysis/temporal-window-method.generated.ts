/* Generated from temporal-window-method.schema.json. Do not edit by hand. */

export type Digest = string;
export type Text = string;
export type Pointer = string;
export type NullableText = Text | null;
export type NullableDigest = Digest | null;
/**
 * @maxItems 500
 */
export type Keys = Text[];
export type NullableRef = Ref | null;
export type Decimal = string;
export type NullableInterval = Interval | null;
export type Operation = 'SUM_DISJOINT_WINDOWS' | 'ABSOLUTE_CHANGE' | 'RELATIVE_CHANGE';

export interface TemporalWindowMethod {
  contractVersion: '1.0.0';
  methodId: 'source-compatible-temporal-v1';
  methodVersion: '1.0.0';
  inputSha256: Digest;
  methodOutputId: Digest;
  input: Input;
  /**
   * @maxItems 500
   */
  series: {
    seriesKey: Digest;
    /**
     * @maxItems 500
     */
    observationPointers: Pointer[];
  }[];
  /**
   * @maxItems 100
   */
  operations: {
    operationId: Text;
    operation: Operation;
    status: 'AVAILABLE' | 'UNAVAILABLE';
    /**
     * @maxItems 30
     */
    reasons: (
      | 'NO_OPERANDS'
      | 'SERIES_MISMATCH'
      | 'IDENTITY_UNRESOLVED'
      | 'VALUE_NOT_EXACT'
      | 'METRIC_UNIT_UNKNOWN'
      | 'DEFINITION_UNKNOWN'
      | 'NOT_PERIOD_FLOW'
      | 'ADDITIVITY_NOT_PROVEN'
      | 'TIME_BASIS_UNKNOWN'
      | 'BOUNDARY_MAPPING_MISSING'
      | 'TIME_BASIS_MISMATCH'
      | 'MEMBERSHIP_INCOMPLETE'
      | 'UPSTREAM_SCALAR_NOT_READY'
      | 'DUPLICATE_CAPTURE'
      | 'WINDOW_REVISION_UNRESOLVED'
      | 'UNSELECTED_WINDOW_REVISION'
      | 'WINDOW_OVERLAP'
      | 'TARGET_GAP'
      | 'TARGET_BOUNDARY_MISMATCH'
      | 'NOT_CHRONOLOGICAL'
      | 'DURATION_UNKNOWN'
      | 'DURATION_MISMATCH'
      | 'BASELINE_ZERO'
    )[];
    seriesKey: Digest | null;
    exact: Rational | null;
    display: string | null;
    displayPolicy: 'EXACT_DECIMAL' | 'HALF_EVEN_2' | 'UNKNOWN';
    /**
     * @maxItems 500
     */
    operandPointers: Pointer[];
    coverage: {
      requiredObservationIds: Keys;
      exactObservationIds: Keys;
      subjectMemberKeys: Keys;
      frameMemberKeys: Keys;
      complete: boolean;
      entireFrameComplete: boolean;
    };
  }[];
  /**
   * @maxItems 20
   */
  limitations: Text[];
}
export interface Input {
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
  sources: {
    logicalPath: Text;
    sha256: Digest;
    role: 'SOURCE' | 'OWNER_DECLARATION' | 'UPSTREAM_RESULT';
  }[];
  configuration: {
    profileId: 'source-compatible-temporal-v1';
    profileVersion: '1.0.0';
    profileSha256: Digest;
    profileRef: Ref;
    mappingRevision: Text;
    compatibilityPolicyRevision: 'fixed-frame-equal-declared-duration-v1';
    configurationRef: Ref;
  };
  frame: {
    frameId: Text;
    revision: Text;
    universePurpose: Text;
    scopeRuleRevision: Text;
    labelsRevision: Text;
    selectionRef: Ref;
    scopeRef: Ref;
    externalCoverage: 'UNKNOWN_NOT_MARKET_POPULATION';
    /**
     * @minItems 1
     * @maxItems 500
     */
    members: {
      memberKey: Text;
      identityState: 'EXACT' | 'UNKNOWN' | 'CONFLICTING';
      provider: NullableText;
      country: NullableText;
      platform: NullableText;
      shopId: NullableText;
      listingId: NullableText;
      variantScope: 'EXACT_VARIANT' | 'LISTING_AGGREGATE' | 'UNKNOWN';
      variantId: NullableText;
      source: Ref;
    }[];
  };
  /**
   * @maxItems 500
   */
  observations: {
    observationId: Text;
    source: Ref;
    sourceNamespace: Text;
    rawRequestSha256: NullableDigest;
    rawResponseSha256: Digest;
    retrievedAt: string;
    subjectMemberKeys: Keys;
    measure: {
      literal: Text;
      canonicalMapping: Text;
      definition: NullableText;
      definitionRevision: NullableText;
      definitionRef: NullableRef;
      dimension: 'CURRENCY' | 'COUNT' | 'OTHER' | 'UNKNOWN';
      unit: NullableText;
      currency: NullableText;
      semantics: 'PERIOD_FLOW' | 'ROLLING' | 'CUMULATIVE' | 'STOCK' | 'UNKNOWN';
      semanticsRef: NullableRef;
      additive: boolean | null;
      additivityRef: NullableRef;
      displayPolicy: 'EXACT_DECIMAL' | 'HALF_EVEN_2' | 'UNKNOWN';
      displayPolicyRef: NullableRef;
    };
    value: {
      state: 'EXACT' | 'OBSERVED_ZERO' | 'MISSING' | 'NON_EXACT' | 'UNREADABLE' | 'CONFLICTING' | 'UNKNOWN';
      decimal: Decimal | null;
      literal: NullableText;
    };
    requestedWindow: RawWindow;
    rawQuery: RawWindow;
    observedWindow: {
      rawStart: NullableText;
      rawEnd: NullableText;
      interval: NullableInterval;
      basisKind: 'TIMEZONE' | 'SOURCE_CALENDAR' | 'UNKNOWN';
      basisLiteral: NullableText;
      basisRef: NullableRef;
      boundaryConvention: 'HALF_OPEN' | 'INCLUSIVE_BOTH' | 'START_EXCLUSIVE_END_INCLUSIVE' | 'UNKNOWN';
      boundaryRef: NullableRef;
      mappingRef: NullableRef;
      duration: {
        basis: 'ELAPSED_MILLISECONDS' | 'SOURCE_CALENDAR_UNITS' | 'UNKNOWN';
        value: string | null;
        unit: NullableText;
        proof: NullableRef;
      };
    };
    membership: {
      observedMemberKeys: Keys;
      unknownMemberKeys: Keys;
      excludedMemberKeys: Keys;
      complete: boolean;
      proof: NullableRef;
    };
    upstream: {
      kind: 'DIRECT_SOURCE_SCALAR' | 'METHOD_RESULT' | 'UNKNOWN';
      ready: boolean;
      complete: boolean;
      entityOverlapResolved: boolean;
      proof: NullableRef;
    };
  }[];
  /**
   * @maxItems 100
   */
  requests: {
    operationId: Text;
    operation: Operation;
    observationIds: Keys;
    targetInterval: NullableInterval;
    baselineId: NullableText;
    comparisonId: NullableText;
  }[];
  /**
   * @maxItems 500
   */
  snapshotDispositions: {
    selectedObservationId: Text;
    rejectedObservationIds: Keys;
    binding: Ref;
  }[];
}
export interface Ref {
  sourceSha256: Digest;
  locator: Text;
  fieldPointer: Pointer;
}
export interface RawWindow {
  start: NullableText;
  end: NullableText;
  binding: NullableRef;
}
export interface Interval {
  start: string;
  end: string;
}
export interface Rational {
  numerator: string;
  denominator: string;
}
