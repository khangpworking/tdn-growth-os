import type { ContentBrandHistoryItem } from '../../contracts/api/content-api.generated';
import { BRAND_ELEMENTS, BRAND_PURPOSES, brandRequestFromDraft, emptyBrandDraft, type BrandDraft } from './content-data-source';
import { createDraftEditorReducer, type DraftEditor, type DraftEditorEvent, type EditorNotice } from './draft-editor';

/** The saved brand version an edit is based on. */
export interface BrandBase {
  readonly brandId: string;
  readonly version: number;
  readonly draft: BrandDraft;
  readonly history: readonly ContentBrandHistoryItem[];
}

export type BrandEditorNotice = EditorNotice;
export type BrandEditor = DraftEditor<BrandDraft, BrandBase>;
export type BrandEditorEvent = DraftEditorEvent<BrandDraft, BrandBase>;

export function sameContent(left: BrandDraft, right: BrandDraft): boolean {
  return JSON.stringify(brandRequestFromDraft(left)) === JSON.stringify(brandRequestFromDraft(right));
}

const PROFILE_LABELS: readonly [keyof Omit<BrandDraft, 'displayRules'>, string][] = [
  ['brandName', 'Tên thương hiệu'], ['logoMediaSha256', 'Logo'], ['tagline', 'Tagline'], ['hotline', 'Hotline'],
  ['website', 'Website'], ['fanpage', 'Fanpage'], ['address', 'Địa chỉ'],
];

/** Labels of the fields where the draft differs from a saved version. */
export function draftDifferences(draft: BrandDraft, saved: BrandDraft): string[] {
  const fields = PROFILE_LABELS.filter(([key]) => draft[key].trim() !== saved[key].trim()).map(([, label]) => label);
  for (const purpose of BRAND_PURPOSES) {
    if (BRAND_ELEMENTS.some((element) => draft.displayRules[purpose.key][element.key] !== saved.displayRules[purpose.key][element.key])) fields.push(`Hiển thị · ${purpose.label}`);
  }
  return fields;
}

export const brandEditorReducer = createDraftEditorReducer<BrandDraft, BrandBase>({
  idOf: (base) => base.brandId,
  empty: emptyBrandDraft,
  same: sameContent,
  differences: draftDifferences,
});
