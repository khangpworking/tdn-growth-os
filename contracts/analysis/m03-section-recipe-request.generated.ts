/* Generated from m03-section-recipe-request.schema.json. Do not edit by hand. */

export type Digest = string;

export interface M03SectionRecipeRequest {
  contractVersion: '1.0.0';
  sectionId: 'M03';
  recipeId: 'm03-scope-totals';
  recipeVersion: '1.0.0';
  preparationSha256: Digest;
  catalogSha256: Digest;
  readinessSha256: Digest;
}
