/* Generated from automation-i14-synthesis-prompt.schema.json. Do not edit by hand. */

export interface AutomationI14SynthesisPrompt {
  contractVersion: '1.0.0';
  methodId: 'automation-i14-synthesis-prompt';
  promptId: 'automation-i14-synthesis';
  promptVersion: '1.0.0';
  /**
   * The user message is the exact retained input artifact bytes of this contract.
   */
  inputContract: {
    methodId: 'automation-i14-synthesis-input';
    methodVersion: '1.0.0';
  };
  responseContract: {
    methodId: 'automation-i14-candidates';
    methodVersion: '1.0.0';
    shape: 'JSON_OBJECT_WITH_ONLY_AI_CANDIDATES';
  };
  /**
   * The retained prompt must require support-record counterevidence quotes to be acknowledged without duplicating the claim id in counterevidenceRefs.
   */
  systemText: string;
}
