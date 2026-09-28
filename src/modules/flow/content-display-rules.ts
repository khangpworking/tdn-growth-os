import type { ContentBrandArtifact, ContentBrandVisibility } from '../../../contracts/flow/content-brand-artifact.generated.js';
import type { ContentCaptionDisplay, ContentPosterDisplay } from '../../../contracts/flow/content-package-artifact.generated.js';
import type { ContentCaptionDisplayOverride, ContentPosterDisplayOverride } from '../../../contracts/flow/content-package-create-request.generated.js';
import type { ContentPurposeKind } from '../../../contracts/flow/content-purpose-tag-request.generated.js';

/**
 * Brand display resolution for Caption and Poster packages (Task 051, 047 §5). Pure functions:
 * purposes → brand rules → highest level wins (Luôn > Tùy > Ẩn) → package override.
 */

export type ContentBrandElement = 'name' | 'logo' | 'tagline' | 'hotline' | 'web' | 'address';
export type ContentBrandLevels = Readonly<Record<ContentBrandElement, ContentBrandVisibility>>;
type BrandProfile = ContentBrandArtifact['profile'];

export const BRAND_ELEMENTS: readonly ContentBrandElement[] = ['name', 'logo', 'tagline', 'hotline', 'web', 'address'];
const CAPTION_ELEMENTS = ['name', 'tagline', 'hotline', 'web', 'address'] as const;
const IDENTITY: ReadonlySet<ContentBrandElement> = new Set(['name', 'logo', 'tagline']);
const RANK: Readonly<Record<ContentBrandVisibility, number>> = { HIDDEN: 0, OPTIONAL: 1, ALWAYS: 2 };
const RULE_KEYS: Readonly<Record<ContentPurposeKind, keyof ContentBrandArtifact['displayRules']>> = {
  SALES: 'sales', TRUST: 'trust', EDUCATION: 'education', ENTERTAINMENT: 'entertainment', ENGAGEMENT: 'engagement',
};
const PURPOSE_KINDS: ReadonlySet<string> = new Set(Object.keys(RULE_KEYS));

export class ContentDisplayRuleError extends Error {}

/** Maps Angle purposes to purpose kinds; a custom purpose (`tag:<id>`) displays like its tag. */
export function purposeKinds(purposes: readonly string[], tagDisplayLike: (tagId: string) => ContentPurposeKind | undefined): ContentPurposeKind[] {
  if (purposes.length === 0) throw new ContentDisplayRuleError('An Angle needs at least one purpose before it can be packaged');
  const kinds = new Set<ContentPurposeKind>();
  for (const purpose of purposes) {
    if (purpose.startsWith('tag:')) {
      const kind = tagDisplayLike(purpose.slice(4));
      if (!kind) throw new ContentDisplayRuleError(`Unknown purpose tag: ${purpose.slice(4)}`);
      kinds.add(kind);
    } else if (PURPOSE_KINDS.has(purpose)) {
      kinds.add(purpose as ContentPurposeKind);
    } else {
      throw new ContentDisplayRuleError(`Unknown purpose: ${purpose}`);
    }
  }
  return [...kinds];
}

/** The highest level of each element across the purposes' brand rules. */
export function resolveBrandLevels(rules: ContentBrandArtifact['displayRules'], kinds: readonly ContentPurposeKind[]): ContentBrandLevels {
  if (kinds.length === 0) throw new ContentDisplayRuleError('At least one purpose kind is required');
  const levels = {} as Record<ContentBrandElement, ContentBrandVisibility>;
  for (const element of BRAND_ELEMENTS) {
    let best: ContentBrandVisibility = 'HIDDEN';
    for (const kind of kinds) {
      const level = rules[RULE_KEYS[kind]][element];
      if (RANK[level] > RANK[best]) best = level;
    }
    levels[element] = best;
  }
  return levels;
}

/** Caption levels: the row override replaces the resolved level element by element. */
export function resolveCaptionDisplay(levels: ContentBrandLevels, override?: ContentCaptionDisplayOverride): ContentCaptionDisplay {
  const display = {} as Record<(typeof CAPTION_ELEMENTS)[number], ContentBrandVisibility>;
  for (const element of CAPTION_ELEMENTS) display[element] = override?.[element] ?? levels[element];
  return display;
}

/**
 * Poster switches. Defaults: Luôn on; Tùy on for identity (name, logo, tagline) and off for
 * contact; Ẩn off. `includeLogo: false` turns the logo default off. The override is final.
 */
export function resolvePosterDisplay(levels: ContentBrandLevels, includeLogo: boolean, override?: ContentPosterDisplayOverride): ContentPosterDisplay {
  const display = {} as Record<ContentBrandElement, boolean>;
  for (const element of BRAND_ELEMENTS) {
    const level = levels[element];
    let on = level === 'ALWAYS' || (level === 'OPTIONAL' && IDENTITY.has(element));
    if (element === 'logo' && !includeLogo) on = false;
    display[element] = override?.[element] ?? on;
  }
  return display;
}

/** The system contact block ("Khối liên hệ"): Luôn contact values only, one line each, in a fixed order. */
export function captionFooter(profile: BrandProfile, display: ContentCaptionDisplay): string {
  const lines: string[] = [];
  if (display.hotline === 'ALWAYS' && profile.hotline) lines.push(`Hotline: ${profile.hotline}`);
  if (display.web === 'ALWAYS' && profile.website) lines.push(`Website: ${profile.website}`);
  if (display.web === 'ALWAYS' && profile.fanpage) lines.push(`Fanpage: ${profile.fanpage}`);
  if (display.address === 'ALWAYS' && profile.address) lines.push(`Địa chỉ: ${profile.address}`);
  return lines.join('\n');
}

/** Full caption text: the post, then a blank line and the footer when there is one. */
export function captionText(post: string, footer: string): string {
  return footer === '' ? post : `${post}\n\n${footer}`;
}

/** Brand identity sent to the caption model. Contact values are never sent; Ẩn values are left out. */
export function captionBrandContext(profile: BrandProfile, display: ContentCaptionDisplay): { name?: string; tagline?: string; mention_required: string[] } {
  const brand: { name?: string; tagline?: string; mention_required: string[] } = { mention_required: [] };
  if (display.name !== 'HIDDEN') {
    brand.name = profile.brandName;
    if (display.name === 'ALWAYS') brand.mention_required.push('name');
  }
  if (display.tagline !== 'HIDDEN' && profile.tagline) {
    brand.tagline = profile.tagline;
    if (display.tagline === 'ALWAYS') brand.mention_required.push('tagline');
  }
  return brand;
}

/** Brand values sent to the poster model: switched-on, present values only (the logo travels as an image). */
export function posterBrandData(profile: BrandProfile, display: ContentPosterDisplay): Record<string, string> {
  const data: Record<string, string> = {};
  if (display.name) data.brand_name = profile.brandName;
  if (display.tagline && profile.tagline) data.tagline = profile.tagline;
  if (display.hotline && profile.hotline) data.hotline = profile.hotline;
  if (display.web && profile.website) data.website = profile.website;
  if (display.web && profile.fanpage) data.fanpage = profile.fanpage;
  if (display.address && profile.address) data.address = profile.address;
  return data;
}
