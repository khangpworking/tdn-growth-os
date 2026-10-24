/* Generated from population-baseline-v1.schema.json. Do not edit by hand. */

export type Count = number;
export type Sex = 'MALE' | 'FEMALE';
export type Region =
  | 'Trung du và miền núi phía Bắc'
  | 'Đồng bằng sông Hồng'
  | 'Bắc Trung Bộ và Duyên hải miền Trung'
  | 'Tây Nguyên'
  | 'Đông Nam Bộ'
  | 'Đồng bằng sông Cửu Long';
export type Zone = 'URBAN' | 'RURAL';

/**
 * Counts of a synthetic whole-population dataset (S28), aggregated to three small tables. Only count columns; no profile text. Used only as an unnamed whole-population baseline in Insight I02.
 */
export interface PopulationBaselineV1 {
  contractVersion: 'population-baseline-v1';
  sourceRevision: string;
  /**
   * Rows read from the distribution CSV.
   */
  rowCount: number;
  builtAt: string;
  /**
   * Sum of n over all CSV rows (number of synthetic adult profiles).
   */
  total: number;
  sexAge: {
    total: Count;
    rows: {
      sex: Sex;
      /**
       * Decade floor of age: 10 means ages 18-19, 90 means 90 and over.
       */
      ageBand: 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90;
      n: Count;
    }[];
  };
  region: {
    total: Count;
    rows: {
      region: Region;
      n: Count;
    }[];
  };
  zone: {
    total: Count;
    rows: {
      zone: Zone;
      n: Count;
    }[];
  };
}
