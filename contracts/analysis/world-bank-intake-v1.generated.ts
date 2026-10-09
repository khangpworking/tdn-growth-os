/* Generated from world-bank-intake-v1.schema.json. Do not edit by hand. */

export interface WorldBankIntakeV1 {
  contractVersion: 'world-bank-intake-v1';
  binding: Binding;
  requestKey: string;
  sourceLabel: string;
  acquiredAt: string;
  condition: 'MULTI_YEAR_SERIES';
  observationPath: 'macro/observations.json';
  metadataPath: 'macro/metadata.json';
  projection: Projection;
}
export interface Binding {
  workspaceId: string;
  runId: string;
  startSha256: string;
  scopeSha256: string;
  sourceSetSha256: string;
}
export interface Projection {
  profileId: 'world-bank-vn-two-indicators-v1';
  sourceSha256: string;
  metadataSha256: string;
  sourceUrl: string;
  metadataUrl: string;
  datasetId: string;
  datasetName: string;
  sourceNote: string;
  sourceOrganization: string;
  /**
   * @minItems 2
   * @maxItems 1000
   */
  rows: [Row, Row, ...Row[]];
}
export interface Row {
  locator: string;
  indicatorCode: 'NE.CON.PRVT.PC.KD' | 'SP.POP.TOTL';
  indicatorName: string;
  countryCode: 'VN';
  countryName: string;
  year: string;
  value: string | null;
  valueLexeme: string | null;
  unit: string | null;
  unitLiteral: string;
  observationUnitLiteral: string;
  lastUpdated: string;
  statusLiteral: string;
  footnote: string | null;
  decimal: number;
}
