/* Generated from m03-factual-narrative.schema.json. Do not edit by hand. */

export type Digest = string;

export interface M03FactualNarrative {
  contractVersion: '1.0.0';
  narrativeSha256: Digest;
  request: M03FactualNarrativeRequest;
  section: {
    sectionId: 'M03';
    title: 'Quy mô và diễn biến';
  };
  dependencies: {
    envelopeSha256: Digest;
    metricSetSha256: Digest;
    chartBundleSha256: Digest;
  };
  language: 'vi';
  /**
   * @minItems 6
   * @maxItems 6
   */
  paragraphs: [
    {
      paragraphId: 'scope-all' | 'scope-wide' | 'scope-core' | 'sensitivity-wide' | 'sensitivity-core' | 'limitations';
      kind: 'FACT' | 'CAVEAT';
      text: string;
      /**
       * @maxItems 4
       */
      claimIds: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
      /**
       * @maxItems 3
       */
      chartIds:
        | []
        | ['m03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity']
        | [
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
          ]
        | [
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
          ];
    },
    {
      paragraphId: 'scope-all' | 'scope-wide' | 'scope-core' | 'sensitivity-wide' | 'sensitivity-core' | 'limitations';
      kind: 'FACT' | 'CAVEAT';
      text: string;
      /**
       * @maxItems 4
       */
      claimIds: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
      /**
       * @maxItems 3
       */
      chartIds:
        | []
        | ['m03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity']
        | [
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
          ]
        | [
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
          ];
    },
    {
      paragraphId: 'scope-all' | 'scope-wide' | 'scope-core' | 'sensitivity-wide' | 'sensitivity-core' | 'limitations';
      kind: 'FACT' | 'CAVEAT';
      text: string;
      /**
       * @maxItems 4
       */
      claimIds: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
      /**
       * @maxItems 3
       */
      chartIds:
        | []
        | ['m03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity']
        | [
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
          ]
        | [
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
          ];
    },
    {
      paragraphId: 'scope-all' | 'scope-wide' | 'scope-core' | 'sensitivity-wide' | 'sensitivity-core' | 'limitations';
      kind: 'FACT' | 'CAVEAT';
      text: string;
      /**
       * @maxItems 4
       */
      claimIds: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
      /**
       * @maxItems 3
       */
      chartIds:
        | []
        | ['m03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity']
        | [
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
          ]
        | [
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
          ];
    },
    {
      paragraphId: 'scope-all' | 'scope-wide' | 'scope-core' | 'sensitivity-wide' | 'sensitivity-core' | 'limitations';
      kind: 'FACT' | 'CAVEAT';
      text: string;
      /**
       * @maxItems 4
       */
      claimIds: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
      /**
       * @maxItems 3
       */
      chartIds:
        | []
        | ['m03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity']
        | [
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
          ]
        | [
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
          ];
    },
    {
      paragraphId: 'scope-all' | 'scope-wide' | 'scope-core' | 'sensitivity-wide' | 'sensitivity-core' | 'limitations';
      kind: 'FACT' | 'CAVEAT';
      text: string;
      /**
       * @maxItems 4
       */
      claimIds: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
      /**
       * @maxItems 3
       */
      chartIds:
        | []
        | ['m03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity']
        | [
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
          ]
        | [
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
            'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
          ];
    },
  ];
  status: 'DETERMINISTIC_FACTUAL_DRAFT_NOT_OWNER_APPROVED';
}
export interface M03FactualNarrativeRequest {
  contractVersion: '1.0.0';
  sectionId: 'M03';
  rendererProfile: 'm03-factual-narrative-vi-v1';
  envelopeSha256: string;
}
