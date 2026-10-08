/* Generated from source-appendix-projection.schema.json. Do not edit by hand. */

export type SourceAppendixContract = SourceAppendixProjectionInput | SourceAppendixProjection;

export interface SourceAppendixProjectionInput {
  /**
   * @minItems 0
   * @maxItems 1024
   */
  usages: SourceAppendixUsage[];
}
export interface SourceAppendixUsage {
  registryId:
    | 'S01'
    | 'S02'
    | 'S03'
    | 'S04'
    | 'S05'
    | 'S06'
    | 'S07'
    | 'S08'
    | 'S09'
    | 'S10'
    | 'S11'
    | 'S12'
    | 'S13'
    | 'S14'
    | 'S15'
    | 'S16'
    | 'S17'
    | 'S18'
    | 'S19'
    | 'S20'
    | 'S21'
    | 'S22'
    | 'S23'
    | 'S24'
    | 'S25'
    | 'S26'
    | 'S27';
  binding: {
    kind: 'package' | 'capture' | 'upload' | 'fetch';
    ref: string;
  };
  l9: {
    excluded: number;
    unclear: number;
    byReason: {
      [k: string]: number;
    };
  } | null;
  l10SourceType: ('review-video' | 'seller-video') | null;
}
export interface SourceAppendixProjection {
  contractVersion: 'source-appendix-projection-v2';
  registryVersion: '1.9';
  /**
   * @minItems 0
   * @maxItems 1024
   */
  rows: SourceAppendixRow[];
}
export interface SourceAppendixRow {
  registryId:
    | 'S01'
    | 'S02'
    | 'S03'
    | 'S04'
    | 'S05'
    | 'S06'
    | 'S07'
    | 'S08'
    | 'S09'
    | 'S10'
    | 'S11'
    | 'S12'
    | 'S13'
    | 'S14'
    | 'S15'
    | 'S16'
    | 'S17'
    | 'S18'
    | 'S19'
    | 'S20'
    | 'S21'
    | 'S22'
    | 'S23'
    | 'S24'
    | 'S25'
    | 'S26'
    | 'S27';
  tier: ('A' | 'B' | 'C') | null;
  tierDetail: string | null;
  group: string;
  reportName: string;
  binding: {
    kind: 'package' | 'capture' | 'upload' | 'fetch';
    ref: string;
  };
  l9Excluded: number | null;
  l9Unclear: number | null;
  l9Reasons: {
    [k: string]: number;
  };
  l10SourceType: ('review-video' | 'seller-video') | null;
  attribution: string | null;
}
