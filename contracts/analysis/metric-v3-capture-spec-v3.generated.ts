/* Generated from metric-v3-capture-spec-v3.schema.json. Do not edit by hand. */

/**
 * One immutable selected date window and effective owner-confirmed Metric options; retained v1/v2 are unchanged.
 */
export interface MetricV3CaptureSpecV3 {
  contractVersion: 'metric-v3-capture-spec-v3';
  preset: Preset;
  /**
   * @minItems 1
   * @maxItems 1
   */
  windows: [Window];
}
export interface Preset {
  /**
   * @minItems 1
   * @maxItems 2
   */
  keywords: [string] | [string, string];
  smartQuery: boolean;
  category: {
    id: 'c2035652732';
    label: 'Sức Khoẻ';
    /**
     * @minItems 1
     * @maxItems 4
     */
    children:
      | [
          | {id: 'c407923064'; label: 'Chăm sóc sức khỏe'}
          | {id: 'c1221630203'; label: 'Dinh dưỡng thể thao, protein'}
          | {id: 'c1110582659'; label: 'Sức khỏe khác'}
          | {id: 'c2140822537'; label: 'Thực phẩm chức năng'},
        ]
      | [
          (
            | {id: 'c407923064'; label: 'Chăm sóc sức khỏe'}
            | {id: 'c1221630203'; label: 'Dinh dưỡng thể thao, protein'}
            | {id: 'c1110582659'; label: 'Sức khỏe khác'}
            | {id: 'c2140822537'; label: 'Thực phẩm chức năng'}
          ),
          (
            | {id: 'c407923064'; label: 'Chăm sóc sức khỏe'}
            | {id: 'c1221630203'; label: 'Dinh dưỡng thể thao, protein'}
            | {id: 'c1110582659'; label: 'Sức khỏe khác'}
            | {id: 'c2140822537'; label: 'Thực phẩm chức năng'}
          ),
        ]
      | [
          (
            | {id: 'c407923064'; label: 'Chăm sóc sức khỏe'}
            | {id: 'c1221630203'; label: 'Dinh dưỡng thể thao, protein'}
            | {id: 'c1110582659'; label: 'Sức khỏe khác'}
            | {id: 'c2140822537'; label: 'Thực phẩm chức năng'}
          ),
          (
            | {id: 'c407923064'; label: 'Chăm sóc sức khỏe'}
            | {id: 'c1221630203'; label: 'Dinh dưỡng thể thao, protein'}
            | {id: 'c1110582659'; label: 'Sức khỏe khác'}
            | {id: 'c2140822537'; label: 'Thực phẩm chức năng'}
          ),
          (
            | {id: 'c407923064'; label: 'Chăm sóc sức khỏe'}
            | {id: 'c1221630203'; label: 'Dinh dưỡng thể thao, protein'}
            | {id: 'c1110582659'; label: 'Sức khỏe khác'}
            | {id: 'c2140822537'; label: 'Thực phẩm chức năng'}
          ),
        ]
      | [
          (
            | {id: 'c407923064'; label: 'Chăm sóc sức khỏe'}
            | {id: 'c1221630203'; label: 'Dinh dưỡng thể thao, protein'}
            | {id: 'c1110582659'; label: 'Sức khỏe khác'}
            | {id: 'c2140822537'; label: 'Thực phẩm chức năng'}
          ),
          (
            | {id: 'c407923064'; label: 'Chăm sóc sức khỏe'}
            | {id: 'c1221630203'; label: 'Dinh dưỡng thể thao, protein'}
            | {id: 'c1110582659'; label: 'Sức khỏe khác'}
            | {id: 'c2140822537'; label: 'Thực phẩm chức năng'}
          ),
          (
            | {id: 'c407923064'; label: 'Chăm sóc sức khỏe'}
            | {id: 'c1221630203'; label: 'Dinh dưỡng thể thao, protein'}
            | {id: 'c1110582659'; label: 'Sức khỏe khác'}
            | {id: 'c2140822537'; label: 'Thực phẩm chức năng'}
          ),
          (
            | {id: 'c407923064'; label: 'Chăm sóc sức khỏe'}
            | {id: 'c1221630203'; label: 'Dinh dưỡng thể thao, protein'}
            | {id: 'c1110582659'; label: 'Sức khỏe khác'}
            | {id: 'c2140822537'; label: 'Thực phẩm chức năng'}
          ),
        ];
  };
  usefulFilters: {
    fake: boolean;
    gifts: boolean;
    deleted: boolean;
  };
  advancedFilter: {
    firstField: 'rating_count';
    operator: '>';
    firstRate: 1;
    secondField: 'order_count';
    secondRate: 0.02;
  };
  /**
   * @minItems 1
   * @maxItems 2
   */
  shopTypes: ['mall' | 'regular'] | ['mall' | 'regular', 'mall' | 'regular'];
  /**
   * @minItems 4
   * @maxItems 4
   */
  platforms: [
    'shopee' | 'lazada' | 'tiki' | 'tiktok',
    'shopee' | 'lazada' | 'tiki' | 'tiktok',
    'shopee' | 'lazada' | 'tiki' | 'tiktok',
    'shopee' | 'lazada' | 'tiki' | 'tiktok',
  ];
  aiNormalisation: boolean;
  customizeCategory: boolean;
  /**
   * @maxItems 0
   */
  exclusions: [];
  smartExclusion: boolean;
}
export interface Window {
  id: 'selected';
  period: {
    startDate: string;
    endDate: string;
  };
  intervalDays: 7;
}
