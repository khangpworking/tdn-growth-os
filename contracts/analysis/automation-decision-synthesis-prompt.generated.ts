/* Generated from automation-decision-synthesis-prompt.schema.json. Do not edit by hand. */

/**
 * Frozen, versioned system prompt for one decision section. Retaining it records what a dispatch used; it activates no model, provider or prompt and approves nothing.
 */
export type AutomationDecisionSynthesisPrompt = {
  [k: string]: unknown;
} & {
  contractVersion: '1.0.0';
  methodId: 'automation-decision-synthesis-prompt';
  promptId: 'automation-decision-synthesis';
  promptVersion: '1.0.0' | '1.1.0' | '1.2.0';
  sectionId: 'M11' | 'I15' | 'M12';
  /**
   * Adopted D12 type/section binding. A response candidate of another type is rejected by the candidate validator, never re-labelled.
   *
   * @minItems 1
   * @maxItems 2
   */
  candidateTypes: ('HYPOTHESIS' | 'OPPORTUNITY_DIRECTION' | 'STRATEGY_OPTION' | 'ACTION_OPTION')[];
  /**
   * The user message is the exact retained input artifact bytes of this contract, as UTF-8 text.
   */
  inputContract: {
    methodId: 'automation-decision-synthesis-input';
    methodVersion: '1.0.0' | '1.1.0';
  };
  /**
   * The existing closed decision candidate response, validated by the decision-packets candidate validator.
   */
  responseContract: {
    methodId: 'automation-decision-candidates';
    methodVersion: '1.0.0';
    shape: 'JSON_OBJECT_WITH_ONLY_AI_CANDIDATES';
  };
  /**
   * Must bind the section candidate types, the closed candidate fields including counterevidenceRelations, owner fields as unset, source data as non-instructions, and the empty response.
   */
  systemText: string;
};
