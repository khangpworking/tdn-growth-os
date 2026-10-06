/* Generated from generic-quote-unit.schema.json. Do not edit by hand. */

export type Digest = string;
export type Text = string;
export type Pointer = string;
export type NullableText = Text | null;
export type NullableRef = Ref | null;
export type NullableDecimal = Decimal | null;
export type Decimal = string;

export interface GenericQuoteUnit {
  contractVersion: '1.0.0';
  methodId: 'generic-quote-unit-v1';
  methodVersion: '1.0.0';
  physicalCountUnitMappingRevision: 'physical-count-unit-v1';
  inputSha256: Digest;
  methodOutputId: Digest;
  input: Input;
  /**
   * @maxItems 500
   */
  quotes: {
    quoteId: Text;
    quoteInputSha256: Digest;
    inventoryPointer: Pointer;
    pricePerPurchasedPack: Result;
    pricePerPhysicalItem: Result;
    pricePer100gNet: Result;
    pricePer100gDrained: Result;
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
    role: 'SOURCE' | 'OWNER_DECLARATION';
  }[];
  configuration: {
    parserProfileId: Text;
    parserRevision: Text;
    parserProfileSha256: Digest;
    parserProfileRef: Ref;
    mappingRevision: Text;
    configurationRef: Ref;
  };
  /**
   * @maxItems 500
   */
  quotes: {
    quoteId: Text;
    source: Ref;
    acquiredAt: string;
    observedAt: string | null;
    authenticationState: 'DECLARED_AUTHENTICATED' | 'UNAUTHENTICATED' | 'UNKNOWN';
    reviewState: 'DECLARED_REVIEWED' | 'UNREVIEWED' | 'UNKNOWN';
    identity: {
      state: 'EXACT' | 'UNKNOWN' | 'CONFLICTING';
      platform: NullableText;
      shopId: NullableText;
      listingId: NullableText;
      variantState: 'EXACT' | 'NOT_APPLICABLE' | 'UNKNOWN' | 'CONFLICTING';
      variantId: NullableText;
      /**
       * @maxItems 50
       */
      variantAttributes: {
        name: Text;
        literal: Text;
        binding: Ref;
      }[];
      binding: NullableRef;
      linkage: 'MATCHED' | 'UNKNOWN' | 'CONFLICTING';
    };
    offerText: NullableText;
    packText: NullableText;
    price: {
      state: 'EXACT' | 'RANGE' | 'MISSING' | 'NON_EXACT' | 'UNREADABLE' | 'CONFLICTING' | 'UNKNOWN';
      value: NullableDecimal;
      range: {
        minimum: Decimal;
        maximum: Decimal;
      } | null;
      currency: string | null;
      priceState: 'LISTED' | 'STRUCK_THROUGH' | 'PROMO_CONDITIONAL' | 'OBSERVED_CHECKOUT' | 'UNKNOWN';
      binding: NullableRef;
      checkoutBinding: NullableRef;
      /**
       * @maxItems 50
       */
      conditions: {
        literal: Text;
        binding: Ref;
      }[];
      tax: 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN';
      shipping: 'INCLUDED' | 'EXCLUDED' | 'UNKNOWN';
    };
    pack: {
      count: Quantity;
      compositionState: 'HOMOGENEOUS' | 'MIXED' | 'WITH_GIFT' | 'UNKNOWN';
      linkage: 'MATCHED' | 'UNKNOWN' | 'CONFLICTING';
      binding: NullableRef;
      /**
       * @maxItems 50
       */
      components: Text[];
    };
    netMass: Mass;
    drainedMass: Mass;
    /**
     * @maxItems 2
     */
    selectedMassBases: ('NET' | 'DRAINED')[];
    massSelectionBinding: NullableRef;
  }[];
}
export interface Ref {
  sourceSha256: Digest;
  locator: Text;
  fieldPointer: Pointer;
}
export interface Quantity {
  state: 'EXACT' | 'MISSING' | 'NON_EXACT' | 'UNREADABLE' | 'CONFLICTING' | 'UNKNOWN';
  value: NullableDecimal;
  unit: NullableText;
  dimension: 'PHYSICAL_COUNT' | 'MASS' | 'OTHER' | 'UNKNOWN';
  origin: 'SOURCE_STATED' | 'OWNER_DECLARED' | 'UNKNOWN';
  binding: NullableRef;
  literal: NullableText;
}
export interface Mass {
  quantity: Quantity;
  basis: 'PER_ITEM' | 'PER_PURCHASED_PACK' | 'UNKNOWN';
  linkage: 'MATCHED' | 'UNKNOWN' | 'CONFLICTING';
  basisBinding: NullableRef;
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
  operandPointers: Pointer[];
}
export interface Rational {
  numerator: string;
  denominator: string;
}
