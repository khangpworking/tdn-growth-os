import type { ContentPosterFormat, ContentPosterModel } from '../../../contracts/flow/content-package-create-request.generated.js';
import { CREATIVE_IMAGE_FORMATS } from '../../platform/ai/creative-ai-gateway.js';

/**
 * Poster prompt assembly (Task 051): the creative layer, then poster system layer v1 with its
 * placeholders filled. Pure; the result is hashed into the attempt's input bundle.
 */

/** C4: one reference slot per model until Task 053 verifies more against CLIProxy. */
export const POSTER_MAX_REFERENCES: Readonly<Record<ContentPosterModel, number>> = Object.freeze({ 'gpt-image-2': 1, 'gemini-3.1-flash-image': 1 });

const RATIO_LABELS: Readonly<Record<ContentPosterFormat, string>> = {
  square: 'Square 1:1', portrait: 'Portrait 4:5', story: 'Story 9:16', landscape: 'Landscape 16:9',
};

const LAYOUT_PROFILES: Readonly<Record<ContentPosterFormat, string>> = {
  square: 'square feed post: one headline block, one visual focal area and at most three compact information modules on a balanced grid',
  portrait: 'portrait feed post: headline at the top, a central visual area and at most four stacked information modules below it',
  story: 'full-screen story: three to five vertical bands, large type, the key message in the upper-middle third, and no text in the top and bottom 250 px',
  landscape: 'landscape banner: headline and key message on one side, the visual on the other, and at most three short information modules',
};

const PLACEHOLDERS = ['RATIO_LABEL', 'CANVAS_WIDTH', 'CANVAS_HEIGHT', 'LAYOUT_PROFILE', 'CAPTION_CONTENT', 'LOGO_INSTRUCTION', 'BRAND_JSON_LINE'] as const;
type PosterPlaceholder = (typeof PLACEHOLDERS)[number];
const PLACEHOLDER_PATTERN = new RegExp(`\\{\\{(${PLACEHOLDERS.join('|')})\\}\\}`, 'gu');

export class ContentPosterPromptError extends Error {}

export interface PosterReferencePlan {
  /** Product photos in send order. */
  readonly photos: readonly string[];
  /** The logo, when it is switched on, registered and a slot is left. */
  readonly logo?: string;
}

/** C4: ticked product photos first, then the logo if there is room. */
export function planPosterReferences(model: ContentPosterModel, photos: readonly string[], logoOn: boolean, logoMediaSha256: string | undefined): PosterReferencePlan {
  const max = POSTER_MAX_REFERENCES[model];
  const sent = photos.slice(0, max);
  return logoOn && logoMediaSha256 !== undefined && sent.length < max ? { photos: sent, logo: logoMediaSha256 } : { photos: sent };
}

export function logoInstruction(plan: PosterReferencePlan, logoOn: boolean): string {
  const lines: string[] = [];
  plan.photos.forEach((_, index) => lines.push(`Reference image ${index + 1} is a product photo. Keep the product faithful to it; do not add products it does not show.`));
  if (plan.logo !== undefined) lines.push(`Reference image ${plan.photos.length + 1} is the brand logo. Place it small and unaltered; do not redraw, recolor or distort it.`);
  if (plan.photos.length === 0 && plan.logo === undefined) lines.push('No reference images are supplied.');
  if (logoOn && plan.logo === undefined) lines.push('No logo image is supplied. If a brand mark is needed, render the brand name as a small text wordmark. Never invent a logo, symbol or icon.');
  if (!logoOn) lines.push('Do not render any logo, brand symbol or icon.');
  return lines.join('\n');
}

export function buildPosterPrompt(input: {
  readonly creativeText: string;
  readonly layerText: string;
  readonly format: ContentPosterFormat;
  readonly captionPost: string;
  readonly brandData: Readonly<Record<string, string>>;
  readonly plan: PosterReferencePlan;
  readonly logoOn: boolean;
}): string {
  const canvas = CREATIVE_IMAGE_FORMATS[input.format];
  const values: Readonly<Record<PosterPlaceholder, string>> = {
    RATIO_LABEL: RATIO_LABELS[input.format],
    CANVAS_WIDTH: String(canvas.width),
    CANVAS_HEIGHT: String(canvas.height),
    LAYOUT_PROFILE: LAYOUT_PROFILES[input.format],
    CAPTION_CONTENT: JSON.stringify(input.captionPost),
    LOGO_INSTRUCTION: logoInstruction(input.plan, input.logoOn),
    BRAND_JSON_LINE: JSON.stringify(input.brandData),
  };
  let layerWithoutKnownPlaceholders = input.layerText;
  for (const name of PLACEHOLDERS) {
    const token = `{{${name}}}`;
    const occurrences = input.layerText.split(token).length - 1;
    if (occurrences === 0) throw new ContentPosterPromptError(`Poster layer is missing ${token}`);
    if (occurrences > 1) throw new ContentPosterPromptError(`Poster layer repeats ${token}`);
    layerWithoutKnownPlaceholders = layerWithoutKnownPlaceholders.replace(token, '');
  }
  if (layerWithoutKnownPlaceholders.includes('{{') || layerWithoutKnownPlaceholders.includes('}}')) {
    throw new ContentPosterPromptError('Poster layer has an unknown or malformed placeholder');
  }
  const layer = input.layerText.replace(PLACEHOLDER_PATTERN, (_token, name: PosterPlaceholder) => values[name]);
  return `${input.creativeText}\n\n${layer}`;
}
