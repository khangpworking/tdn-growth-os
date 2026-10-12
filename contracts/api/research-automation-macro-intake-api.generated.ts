/* Generated from research-automation-macro-intake-api.schema.json. Do not edit by hand. */

export type ResearchAutomationMacroIntakeApi =
  PrepareRequest | PrepareReceipt | ConfirmRequest | Confirmed | View | History;

export interface PrepareRequest {
  contractVersion: 'automation-world-bank-prepare-v1';
  requestKey: string;
  sourceLabel: string;
  acquiredAt: string;
  sourceUrl: string;
  metadataUrl: string;
}
export interface PrepareReceipt {
  contractVersion: 'automation-world-bank-prepared-v1';
  requestKey: string;
  source: PackageRef;
  state: 'PREPARED_NOT_ADMITTED';
  exactRetry: boolean;
  recordCount: number;
}
export interface PackageRef {
  packageId: string;
  manifestArtifactSha256: string;
  packageContentSha256: string;
}
export interface ConfirmRequest {
  contractVersion: 'automation-world-bank-confirm-v1';
  requestKey: string;
  source: PackageRef;
}
export interface Confirmed {
  contractVersion: 'automation-world-bank-confirmed-v1';
  requestKey: string;
  binding: Binding;
  source: PackageRef;
  descriptorSha256: string;
  confirmedBy: string;
  confirmedAt: string;
}
export interface Binding {
  workspaceId: string;
  runId: string;
  startSha256: string;
  scopeSha256: string;
  sourceSetSha256: string;
}
export interface View {
  contractVersion: 'automation-world-bank-view-v1';
  confirmation: Confirmed;
  confirmationSource: PackageRef;
  descriptor: WorldBankIntakeV1;
}
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
export interface History {
  contractVersion: 'automation-world-bank-history-v1';
  sources: View[];
}
