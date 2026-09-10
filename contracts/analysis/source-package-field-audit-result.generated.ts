/* Generated from source-package-field-audit-result.schema.json. Do not edit by hand. */

export interface SourcePackageFieldAuditResult {
  contractVersion: '1.0.0';
  resultId: string;
  completedAt: string;
  sourcePackage: {
    packageId: string;
    packageKey: string;
    version: number;
    manifestSha256: string;
  };
  requestSha256: string;
  /**
   * @minItems 1
   */
  observations: [Observation, ...Observation[]];
  conflicts: Conflict[];
  periodComparisons: PeriodComparison[];
}
export interface Observation {
  observationKey: string;
  field: string;
  state: 'missing' | 'observed_zero' | 'observed_value';
  value: string | null;
  unit: string | null;
  precision: 'exact' | 'display_rounded' | 'estimated' | 'unknown';
  evidenceFamily: string;
  representationPath: string;
  representationSha256: string;
  locator:
    | {
        type: 'html_text';
        text: string;
      }
    | {
        type: 'pdf_page';
        page: number;
      }
    | {
        type: 'xlsx_cell';
        sheet: string;
        cell: string;
      }
    | {
        type: 'json_pointer';
        pointer: string;
      };
  notes: string;
}
export interface Conflict {
  type: 'representation_mismatch' | 'rounding_difference' | 'scope_mismatch' | 'other';
  /**
   * @minItems 2
   */
  observationKeys: [string, string, ...string[]];
  resolution: 'unresolved';
  notes: string;
}
export interface PeriodComparison {
  leftObservationKey: string;
  rightObservationKey: string;
  compatibility: 'compatible' | 'incompatible';
  claim: string | null;
  notes: string;
}
