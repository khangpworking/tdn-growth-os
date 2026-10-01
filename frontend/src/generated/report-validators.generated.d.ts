// Types for the validators emitted by scripts/generate-report-validators.mjs (the .js file is generated, not committed).
export interface PrecompiledValidator {
  (data: unknown): boolean;
  errors?: unknown[] | null;
}

export declare const interpretationIndex: PrecompiledValidator;
export declare const interpretationDetail: PrecompiledValidator;
export declare const sectionReadiness: PrecompiledValidator;
export declare const reviewTarget: PrecompiledValidator;
export declare const ownerReviewTargetReceipt: PrecompiledValidator;
export declare const researchGenerationInputs: PrecompiledValidator;
export declare const researchGenerationReceipt: PrecompiledValidator;
export declare const researchGenerationMethodInputError: PrecompiledValidator;
