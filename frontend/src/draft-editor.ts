/**
 * Page-owned editing state for versioned Content Studio records (brands, catalog
 * items), so reloading the saved record never discards what the user typed
 * (Task 047 §6: stale → reload keeping unsaved input).
 *
 * Asynchronous results (image uploads) are bound to the editing session that started
 * them: every newly opened record or new draft gets a new `session`, and results for
 * any other session are ignored. Running uploads are counted so Save can wait for them;
 * a result that still arrives while a save is running is kept and applied once the
 * save settles, so it stays visible as an unsaved change instead of disappearing.
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
  /** Identity of this editing session; changes whenever a different record or a new draft is opened. */
  readonly session: number;
  /** Uploads started in this session that have not finished. */
  readonly uploads: number;
  /** Upload results that arrived while saving, applied when the save settles. */
  readonly deferred: readonly ((draft: D) => D)[];
  /** The version (and record) this session's last save created, until it is loaded back. */
  readonly expected: { readonly id: string; readonly version: number } | null;
}

export type DraftEditorEvent<D, B extends EditorBase<D>> =
  | { readonly type: 'new'; readonly key: string; readonly target?: string }
  | { readonly type: 'loaded'; readonly base: B }
  | { readonly type: 'edit'; readonly draft: D }
  /** Applies an asynchronous result to the draft of the session that requested it. */
  | { readonly type: 'update'; readonly session: number; readonly update: (draft: D) => D }
  | { readonly type: 'upload'; readonly session: number; readonly phase: 'start' | 'end' }
  | { readonly type: 'discard' }
  | { readonly type: 'submitted' }
  | { readonly type: 'saved'; readonly version: number; readonly id?: string }
  | { readonly type: 'failed'; readonly conflict: boolean; readonly message: string };

export interface DraftEditorOptions<D, B extends EditorBase<D>> {
  readonly idOf: (base: B) => string;
  readonly empty: () => D;
  readonly same: (left: D, right: D) => boolean;
  readonly differences: (draft: D, saved: D) => string[];
}

export function createDraftEditorReducer<D, B extends EditorBase<D>>(options: DraftEditorOptions<D, B>) {
  const open = (previous: DraftEditor<D, B> | null, patch: Pick<DraftEditor<D, B>, 'target' | 'newKey' | 'base' | 'draft'>): DraftEditor<D, B> =>
    ({ ...patch, saving: false, notice: null, session: (previous?.session ?? 0) + 1, uploads: 0, deferred: [], expected: null });
  const settle = (editor: DraftEditor<D, B>): D => editor.deferred.reduce((draft, update) => update(draft), editor.draft);

  return (editor: DraftEditor<D, B> | null, event: DraftEditorEvent<D, B>): DraftEditor<D, B> => {
    if (event.type === 'new') return open(editor, { target: event.target ?? 'new', newKey: event.key, base: null, draft: options.empty() });
    if (event.type === 'loaded') {
      const latest = event.base;
      const id = options.idOf(latest);
      if (editor && !editor.saving && editor.expected && editor.expected.id === id && editor.expected.version === latest.version) {
        // Our own save came back: keep this session and any change made since (e.g. an upload that finished during the save).
        return { ...editor, target: id, newKey: null, base: latest, draft: options.same(editor.draft, latest.draft) ? latest.draft : editor.draft, notice: null, expected: null };
      }
      if (!editor || editor.target !== id || !editor.base) return open(editor, { target: id, newKey: null, base: latest, draft: latest.draft });
      if (editor.saving) return editor;
      if (options.same(editor.draft, latest.draft) || options.same(editor.draft, editor.base.draft)) return { ...editor, base: latest, draft: latest.draft, notice: null, expected: null };
      if (latest.version === editor.base.version) return { ...editor, base: latest };
      return { ...editor, base: latest, notice: { kind: 'rebased', fromVersion: editor.base.version, toVersion: latest.version, fields: options.differences(editor.draft, latest.draft) } };
    }
    if (!editor) throw new Error('Editor is not open');
    switch (event.type) {
      case 'edit': return editor.saving ? editor : { ...editor, draft: event.draft };
      case 'update':
        if (event.session !== editor.session) return editor;
        return editor.saving ? { ...editor, deferred: [...editor.deferred, event.update] } : { ...editor, draft: event.update(editor.draft) };
      case 'upload':
        if (event.session !== editor.session) return editor;
        return { ...editor, uploads: event.phase === 'start' ? editor.uploads + 1 : Math.max(0, editor.uploads - 1) };
      case 'discard': return editor.saving ? editor : { ...editor, draft: editor.base?.draft ?? options.empty(), notice: null };
      case 'submitted': return { ...editor, saving: true, notice: null };
      case 'saved': return { ...editor, saving: false, notice: null, draft: settle(editor), deferred: [], expected: { id: event.id ?? editor.target, version: event.version } };
      case 'failed': return { ...editor, saving: false, draft: settle(editor), deferred: [], notice: event.conflict ? { kind: 'stale' } : { kind: 'error', message: event.message } };
    }
  };
}

/** Upload callbacks bound to one editing session: results for any other session are ignored by the reducer. */
export function uploadCallbacks<D, B extends EditorBase<D>>(dispatch: (event: DraftEditorEvent<D, B>) => void, session: number, apply: (draft: D, mediaSha256: string) => D) {
  return {
    onStart: () => dispatch({ type: 'upload', session, phase: 'start' }),
    onUploaded: (mediaSha256: string) => dispatch({ type: 'update', session, update: (draft) => apply(draft, mediaSha256) }),
    onEnd: () => dispatch({ type: 'upload', session, phase: 'end' }),
  };
}

export const UPLOAD_PENDING_MESSAGE = 'Đang tải ảnh lên. Chờ tải xong rồi lưu.';

export function noticeText(notice: EditorNotice): string {
  if (notice.kind === 'error') return notice.message;
  if (notice.kind === 'stale') return 'Dữ liệu đã thay đổi ở nơi khác. Đang tải phiên bản mới nhất; bản nháp của bạn được giữ nguyên.';
  return `Phiên bản ${notice.toVersion} đã được lưu ở nơi khác trong lúc bạn sửa phiên bản ${notice.fromVersion}. Bản nháp của bạn được giữ nguyên. Khác với phiên bản ${notice.toVersion}: ${notice.fields.join(', ')}. Lưu để tạo phiên bản ${notice.toVersion + 1} từ bản nháp này, hoặc bỏ thay đổi.`;
}
