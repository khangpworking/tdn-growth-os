/**
 * Page-owned editing state for versioned Content Studio records (brands, catalog
 * items), so reloading the saved record never discards what the user typed
 * (Task 047 §6: stale → reload keeping unsaved input).
 */

export interface EditorBase<D> {
  readonly version: number;
  readonly draft: D;
}

export type EditorNotice =
  | { readonly kind: 'stale' }
  | { readonly kind: 'rebased'; readonly fromVersion: number; readonly toVersion: number; readonly fields: readonly string[] }
  | { readonly kind: 'error'; readonly message: string };

export interface DraftEditor<D, B extends EditorBase<D>> {
  readonly target: string;
  readonly newKey: string | null;
  readonly base: B | null;
  readonly draft: D;
  readonly saving: boolean;
  readonly notice: EditorNotice | null;
}

export type DraftEditorEvent<D, B extends EditorBase<D>> =
  | { readonly type: 'new'; readonly key: string; readonly target?: string }
  | { readonly type: 'loaded'; readonly base: B }
  | { readonly type: 'edit'; readonly draft: D }
  /** Applies a change to the current draft (for results that arrive asynchronously, such as uploads). */
  | { readonly type: 'update'; readonly update: (draft: D) => D }
  | { readonly type: 'discard' }
  | { readonly type: 'submitted' }
  | { readonly type: 'saved' }
  | { readonly type: 'failed'; readonly conflict: boolean; readonly message: string };

export interface DraftEditorOptions<D, B extends EditorBase<D>> {
  readonly idOf: (base: B) => string;
  readonly empty: () => D;
  readonly same: (left: D, right: D) => boolean;
  readonly differences: (draft: D, saved: D) => string[];
}

export function createDraftEditorReducer<D, B extends EditorBase<D>>(options: DraftEditorOptions<D, B>) {
  return (editor: DraftEditor<D, B> | null, event: DraftEditorEvent<D, B>): DraftEditor<D, B> => {
    if (event.type === 'new') return { target: event.target ?? 'new', newKey: event.key, base: null, draft: options.empty(), saving: false, notice: null };
    if (event.type === 'loaded') {
      const latest = event.base;
      const id = options.idOf(latest);
      const fresh: DraftEditor<D, B> = { target: id, newKey: null, base: latest, draft: latest.draft, saving: false, notice: null };
      if (!editor || editor.target !== id || !editor.base) return fresh;
      if (editor.saving) return editor;
      if (options.same(editor.draft, latest.draft) || options.same(editor.draft, editor.base.draft)) return fresh;
      if (latest.version === editor.base.version) return { ...editor, base: latest };
      return { ...editor, base: latest, notice: { kind: 'rebased', fromVersion: editor.base.version, toVersion: latest.version, fields: options.differences(editor.draft, latest.draft) } };
    }
    if (!editor) throw new Error('Editor is not open');
    switch (event.type) {
      case 'edit': return editor.saving ? editor : { ...editor, draft: event.draft };
      case 'update': return editor.saving ? editor : { ...editor, draft: event.update(editor.draft) };
      case 'discard': return editor.saving ? editor : { ...editor, draft: editor.base?.draft ?? options.empty(), notice: null };
      case 'submitted': return { ...editor, saving: true, notice: null };
      case 'saved': return { ...editor, saving: false, notice: null };
      case 'failed': return { ...editor, saving: false, notice: event.conflict ? { kind: 'stale' } : { kind: 'error', message: event.message } };
    }
  };
}

export function noticeText(notice: EditorNotice): string {
  if (notice.kind === 'error') return notice.message;
  if (notice.kind === 'stale') return 'Dữ liệu đã thay đổi ở nơi khác. Đang tải phiên bản mới nhất; bản nháp của bạn được giữ nguyên.';
  return `Phiên bản ${notice.toVersion} đã được lưu ở nơi khác trong lúc bạn sửa phiên bản ${notice.fromVersion}. Bản nháp của bạn được giữ nguyên. Khác với phiên bản ${notice.toVersion}: ${notice.fields.join(', ')}. Lưu để tạo phiên bản ${notice.toVersion + 1} từ bản nháp này, hoặc bỏ thay đổi.`;
}
