/* Generated from automation-quote-method-snapshot.schema.json. Do not edit by hand. */

export type Uuid = string;
export type Digest = string;

/**
 * GenericQuoteUnit recomputed from one exact Foundation package descriptor admitted under literal-structured-quote-v1. Literal declarations only: no provider truth, checkout attestation, imported review authority, cost, margin, ranking or completion claim.
 */
export interface AutomationQuoteMethodSnapshot {
  contractVersion: 'automation-quote-method-snapshot-v1';
  binding: AutomationQuoteMethodBinding;
  selection: QuoteMethodPackageSelection;
  descriptorSha256: Digest;
  sourceMetadata: File[];
  output: GenericQuoteUnit;
}
export interface AutomationQuoteMethodBinding {
  workspaceId: Uuid;
  runId: Uuid;
  startSha256: Digest;
  scopeSha256: Digest;
  previousPairId: Digest;
}
/**
 * Exact finalized Foundation package and GenericQuoteUnit descriptor path (descriptor without sourcePackage). Package identity, source bytes and the literal structured-quote profile are checked; this verifies literal declarations only, not provider truth, variant/pack correctness, checkout or approval.
 */
export interface QuoteMethodPackageSelection {
  decision: 'USE_PACKAGE';
  packageId: string;
  manifestArtifactSha256: string;
  packageContentSha256: string;
  descriptorPath: string;
}
export interface File {
  path: string;
  sha256: string;
  byteSize: number;
  mediaType: string;
  evidenceFamily: string;
  representationRole: 'primary' | 'alternate' | 'structured' | 'derived';
  independence: 'independent' | 'non_independent';
  providerProvenance: 'verified' | 'provider_reported' | 'operator_supplied_unverified' | 'synthetic';
  provenanceBasis: string;
  period?: Period;
}
export interface Period {
  start: string;
  end: string;
}
export interface GenericQuoteUnit {
  contractVersion: '1.0.0';
  methodId: 'generic-quote-unit-v1';
  methodVersion: '1.0.0';
  physicalCountUnitMappingRevision: 'physical-count-unit-v1';
  inputSha256: string;
  methodOutputId: string;
  input: Input;
  /**
   * @maxItems 500
   */
  quotes: {
    quoteId: string;
    quoteInputSha256: string;
    inventoryPointer: string;
    pricePerPurchasedPack: Result;
    pricePerPhysicalItem: Result;
    pricePer100gNet: Result;
    pricePer100gDrained: Result;
  }[];
  /**
   * @maxItems 20
   */
  limitations: string[];
}
export interface Input {
  contractVersion: '1.0.0';
  sourcePackage: {
    packageId: string;
    version: number;
    manifestArtifactSha256: string;
    packageContentSha256: string;
  };
  /**
   * @minItems 1
   * @maxItems 1000
   */
  sources: {
    logicalPath: string;
    sha256: string;
    role: 'SOURCE' | 'OWNER_DECLARATION';
  }[];
  configuration: {
    parserProfileId: string;
    parserRevision: string;
    parserProfileSha256: string;
    parserProfileRef: Ref;
    mappingRevision: string;
    configurationRef: Ref;
  };
  /**
   * @maxItems 500
   */
  quotes: {
    quoteId: string;
    source: Ref;
    acquiredAt: string;
    observedAt: string | null;
    authenticationState: 'DECLARED_AUTHENTICATED' | 'UNAUTHENTICATED' | 'UNKNOWN';
    reviewState: 'DECLARED_REVIEWED' | 'UNREVIEWED' | 'UNKNOWN';
    identity: {
      state: 'EXACT' | 'UNKNOWN' | 'CONFLICTING';
      platform: string | null;
      shopId: string | null;
      listingId: string | null;
      variantState: 'EXACT' | 'NOT_APPLICABLE' | 'UNKNOWN' | 'CONFLICTING';
      variantId: string | null;
      /**
       * @maxItems 50
       */
      variantAttributes: {
        name: string;
        literal: string;
        binding: Ref;
      }[];
      binding: Ref | null;
      linkage: 'MATCHED' | 'UNKNOWN' | 'CONFLICTING';
    };
    offerText: string | null;
    packText: string | null;
    price: {
      state: 'EXACT' | 'RANGE' | 'MISSING' | 'NON_EXACT' | 'UNREADABLE' | 'CONFLICTING' | 'UNKNOWN';
      value: string | null;
      range: {
        minimum: string;
        maximum: string;
      } | null;
      currency: string | null;
      priceState: 'LISTED' | 'STRUCK_THROUGH' | 'PROMO_CONDITIONAL' | 'OBSERVED_CHECKOUT' | 'UNKNOWN';
      binding: Ref | null;
      checkoutBinding: Ref | null;
      /**
       * @maxItems 50
       */
      conditions: {
        literal: string;
        binding: Ref;
      }[];
      tax: 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN';
      shipping: 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN';
    };
    pack: {
      count: Quantity;
      compositionState: 'HOMOGENEOUS' | 'MIXED' | 'WITH_GIFT' | 'UNKNOWN';
      linkage: 'MATCHED' | 'UNKNOWN' | 'CONFLICTING';
      binding: Ref | null;
      /**
       * @maxItems 50
       */
      components: string[];
    };
    netMass: Mass;
    drainedMass: Mass;
    /**
     * @maxItems 2
     */
    selectedMassBases: ('NET' | 'DRAINED')[];
    massSelectionBinding: Ref | null;
  }[];
}
export interface Ref {
  sourceSha256: string;
  locator: string;
  fieldPointer: string;
}
export interface Quantity {
  state: 'EXACT' | 'MISSING' | 'NON_EXACT' | 'UNREADABLE' | 'CONFLICTING' | 'UNKNOWN';
  value: string | null;
  unit: string | null;
  dimension: 'PHYSICAL_COUNT' | 'MASS' | 'OTHER' | 'UNKNOWN';
  origin: 'SOURCE_STATED' | 'OWNER_DECLARED' | 'UNKNOWN';
  binding: Ref | null;
  literal: string | null;
}
export interface Mass {
  quantity: Quantity;
  basis: 'PER_ITEM' | 'PER_PURCHASED_PACK' | 'UNKNOWN';
  linkage: 'MATCHED' | 'UNKNOWN' | 'CONFLICTING';
  basisBinding: Ref | null;
}
export interface Result {
  status: 'AVAILABLE' | 'UNAVAILABLE';
  basis: 'SOURCED' | 'SCENARIO' | null;
  /**
   * @maxItems 20
   */
  reasons: (
    | 'PRICE_NOT_EXACT'
    | 'CURRENCY_UNKNOWN'
    | 'IDENTITY_UNRESOLVED'
    | 'VARIANT_UNRESOLVED'
    | 'OFFER_LINKAGE_UNRESOLVED'
    | 'COUNT_NOT_EXACT'
    | 'COUNT_UNIT_NOT_PHYSICAL'
    | 'UNSUPPORTED_PHYSICAL_COUNT_UNIT'
    | 'INVALID_COUNT_VALUE'
    | 'PACK_NOT_HOMOGENEOUS'
    | 'MASS_BASIS_NOT_SELECTED'
    | 'MASS_NOT_EXACT'
    | 'INVALID_MASS_VALUE'
    | 'MASS_LINKAGE_UNRESOLVED'
    | 'MASS_BASIS_UNKNOWN'
    | 'UNSUPPORTED_MASS_UNIT'
  )[];
  exact: Rational | null;
  display: string | null;
  rounding: 'decimal-2-half-even-v1';
  denominator: Rational | null;
  /**
   * @maxItems 12
   */
  operandPointers: string[];
}
export interface Rational {
  numerator: string;
  denominator: string;
}
