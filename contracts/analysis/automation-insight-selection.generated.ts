/* Generated from automation-insight-selection.schema.json. Do not edit by hand. */

export type Index = number;
/**
 * @maxItems 10000
 */
export type Indexes = Index[];

/**
 * Exact indexes within one immutable located Insight proposal. Selection is not authenticated acceptance; the owning receipt must bind the proposal and adoption separately.
 */
export interface AutomationInsightSelection {
  contractVersion: 'automation-insight-selection-v1' | 'automation-insight-selection-v2';
  i02?: Indexes;
  i04?: Indexes;
  i05?: Indexes;
  i07?: Indexes;
  i08?: Indexes;
  i06: Indexes;
  i09: Indexes;
  i13Mentions: Indexes;
  /**
   * @maxItems 100
   */
  corpora: InsightCorpusSelection[];
}
export interface InsightCorpusSelection {
  corpusIndex: Index;
  assignments: Indexes;
  dispositions: Indexes;
}
