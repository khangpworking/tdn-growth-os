/* Generated from automation-search-ads.schema.json. Do not edit by hand. */

export type AutomationSearchAds =
  | {
      profile: 'search-ads-v1';
      status: 'OK' | 'NO_BRANDS' | 'NO_DATA' | 'FAILED' | 'CANCELLED';
      /**
       * @maxItems 3
       */
      brands: SearchAdsBrandV1[];
    }
  | {
      profile: 'search-ads-v2';
      status: 'OK' | 'NO_BRANDS' | 'NO_DATA' | 'FAILED' | 'CANCELLED';
      /**
       * @maxItems 3
       */
      brands: SearchAdsBrandV2[];
    };

export interface SearchAdsBrandV1 {
  label: string;
  domain: string | null;
  status: 'OK' | 'SKIPPED_NO_DOMAIN' | 'SKIPPED_AMBIGUOUS_DOMAIN' | 'FAILED' | 'CANCELLED';
  reason: string | null;
  totalResults: number | null;
  creativeCount: number | null;
  maxDaysShown: number | null;
  overlapCount: number | null;
  invalidCount: number | null;
  formats: {
    text: number;
    image: number;
    video: number;
  } | null;
  firstShown: string | null;
  lastShown: string | null;
  captureIndex: number | null;
  retrievedAt: string | null;
  responseSha256: string | null;
  usageOrdinal: null | 10;
}
export interface SearchAdsBrandV2 {
  label: string;
  domain: string | null;
  status: 'OK' | 'SKIPPED_NO_DOMAIN' | 'SKIPPED_AMBIGUOUS_DOMAIN' | 'FAILED' | 'CANCELLED';
  reason:
    | null
    | 'AMBIGUOUS_RUN_DOMAINS'
    | 'DISCOVERY_QUERY_REFUSED'
    | 'DISCOVERY_FAILED'
    | 'DISCOVERY_NO_MATCH'
    | 'DISCOVERY_AMBIGUOUS'
    | 'CANCELLED'
    | 'REQUEST_REFUSED'
    | 'TIMEOUT'
    | 'TRANSPORT_ERROR'
    | 'RESPONSE_TOO_LARGE'
    | 'CREDENTIAL_ECHO_REFUSED'
    | 'HTTP_ERROR'
    | 'INVALID_PAYLOAD'
    | 'CAPTURE_NOT_STORED';
  totalResults: number | null;
  creativeCount: number | null;
  maxDaysShown: number | null;
  overlapCount: number | null;
  invalidCount: number | null;
  formats: {
    text: number;
    image: number;
    video: number;
  } | null;
  firstShown: string | null;
  lastShown: string | null;
  captureIndex: number | null;
  retrievedAt: string | null;
  responseSha256: string | null;
  usageOrdinal: null | 10;
  domainDecision?: 'SINGLE_DOMAIN' | 'VIETNAMESE_SUFFIX' | 'ORGANIC_POSITION';
  domainSource: null | 'RUN_ROWS' | 'BRAND_SITE_SEARCH';
  discoveryCaptureIndex: number | null;
  discoveryUsageOrdinal: null | 17 | 18 | 19;
}
