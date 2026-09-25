import type { ContentBrandHistoryItem } from '../../contracts/api/content-api.generated';
import { BRAND_ELEMENTS, BRAND_PURPOSES, brandRequestFromDraft, emptyBrandDraft, type BrandDraft } from './content-data-source';

/** The saved brand version an edit is based on. */
export interface BrandBase {
  readonly brandId: string;
  readonly version: number;
  readonly draft: BrandDraft;
  readonly history: readonly ContentBrandHistoryItem[];
}

export type BrandEditorNotice =
  | { readonly kind: 'stale' }
  | { readonly kind: 'rebased'; readonly fromVersion: number; readonly toVersion: number; readonly fields: readonly string[] }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Editing state owned by the brand page, so reloading the saved brand never
 * discards what the user typed (Task 047 §6: stale → reload keeping unsaved input).
 */
export interface BrandEditor {
  readonly target: string;
  readonly brandKey: string | null;
  readonly base: BrandBase | null;
  readonly draft: BrandDraft;
  readonly saving: boolean;
  readonly notice: BrandEditorNotice | null;
}

export type BrandEditorEvent =
  | { readonly type: 'new'; readonly brandKey: string }
  | { readonly type: 'loaded'; readonly base: BrandBase }
  | { readonly type: 'edit'; readonly draft: BrandDraft }
  | { readonly type: 'discard' }
  | { readonly type: 'submitted' }
  | { readonly type: 'saved' }
  | { readonly type: 'failed'; readonly conflict: boolean; readonly message: string };

export function brandEditorReducer(editor: BrandEditor | null, event: BrandEditorEvent): BrandEditor {
  if (event.type === 'new') return { target: 'new', brandKey: event.brandKey, base: null, draft: emptyBrandDraft(), saving: false, notice: null };
  if (event.type === 'loaded') {
    const latest = event.base;
    const fresh: BrandEditor = { target: latest.brandId, brandKey: null, base: latest, draft: latest.draft, saving: false, notice: null };
    if (!editor || editor.target !== latest.brandId || !editor.base) return fresh;
    if (editor.saving) return editor;
    if (sameContent(editor.draft, latest.draft) || sameContent(editor.draft, editor.base.draft)) return fresh;
    if (latest.version === editor.base.version) return { ...editor, base: latest };
    return { ...editor, base: latest, notice: { kind: 'rebased', fromVersion: editor.base.version, toVersion: latest.version, fields: draftDifferences(editor.draft, latest.draft) } };
  }
  if (!editor) throw new Error('Brand editor is not open');
  switch (event.type) {
    case 'edit': return editor.saving ? editor : { ...editor, draft: event.draft };
    case 'discard': return editor.saving ? editor : { ...editor, draft: editor.base?.draft ?? emptyBrandDraft(), notice: null };
    case 'submitted': return { ...editor, saving: true, notice: null };
    case 'saved': return { ...editor, saving: false, notice: null };
    case 'failed': return { ...editor, saving: false, notice: event.conflict ? { kind: 'stale' } : { kind: 'error', message: event.message } };
  }
}

export function sameContent(left: BrandDraft, right: BrandDraft): boolean {
  return JSON.stringify(brandRequestFromDraft(left)) === JSON.stringify(brandRequestFromDraft(right));
}

const PROFILE_LABELS: readonly [keyof Omit<BrandDraft, 'displayRules'>, string][] = [
  ['brandName', 'Tên thương hiệu'], ['tagline', 'Tagline'], ['hotline', 'Hotline'],
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
