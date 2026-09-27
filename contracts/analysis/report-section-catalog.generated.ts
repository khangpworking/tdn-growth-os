/* Generated from report-section-catalog.schema.json. Do not edit by hand. */

export interface ReportSectionCatalog {
  contractVersion: '1.0.0';
  catalogId: string;
  catalogVersion: string;
  authority: 'PLANNING_METADATA_NOT_EXECUTABLE_METHOD';
  /**
   * @minItems 1
   * @maxItems 100
   */
  sections: SectionDefinition[];
}
export interface SectionDefinition {
  sectionId: string;
  title: string;
  methodId: string;
  methodVersion: string;
  historicalTemplateMaturity: 'PILOT' | 'SYNTHESIS' | 'METHOD' | 'SCENARIO';
  /**
   * @minItems 1
   * @maxItems 10
   */
  moduleIds: string[];
  /**
   * @maxItems 20
   */
  requiredInputs: string[];
  reopenCondition: string;
  fallbackState: 'BLOCKED' | 'METHOD_ONLY' | 'MANUAL_REVIEW_REQUIRED' | 'NOT_IMPLEMENTED';
  /**
   * @minItems 1
   * @maxItems 20
   */
  fallbackReasons: string[];
}
