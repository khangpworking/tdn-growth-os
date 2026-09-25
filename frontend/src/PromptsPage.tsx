import { useEffect, useReducer, useRef, useState } from 'react';
import type { Dispatch, FormEvent } from 'react';
import type { ContentPromptHistoryItem, ContentPromptSystemLayer } from '../../contracts/api/content-api.generated';
import { ContentDataSourceError } from './content-data-source';
import { OwnerWriteError } from './data-source';
import { noticeText } from './draft-editor';
import {
  PROMPT_TYPES,
  changeDemoLifecycle,
  createDemoPrompt,
  draftFromPrompt,
  emptyPromptDraft,
  generatedPromptKey,
  loadPrompt,
  loadPrompts,
  loadSystemPrompt,
  modelLabel,
  modelsForType,
  promptDraftBlocker,
  promptEditorReducer,
  promptRequestFromDraft,
  reviseDemoPrompt,
  samePromptContent,
  submitPromptCreate,
  submitPromptLifecycle,
  submitPromptRevision,
  type DemoPrompt,
  type PromptContent,
  type PromptDraft,
  type PromptEditor,
  type PromptEditorEvent,
  type PromptLineage,
  type PromptList,
  type PromptType,
} from './prompt-data-source';
import { routeToHash } from './routing';

type LoadState<T> = { readonly status: 'loading' } | { readonly status: 'ready'; readonly value: T } | { readonly status: 'failed'; readonly message: string };

/** A system or user prompt as shown in the library. */
export interface PromptView {
  readonly source: 'SYSTEM' | 'USER';
  readonly id: string;
  readonly promptType: PromptType;
  readonly version: number;
  readonly prompt: PromptContent;
  readonly isDefault: boolean;
  readonly systemLayer: ContentPromptSystemLayer | null;
  readonly history: readonly ContentPromptHistoryItem[];
  readonly lifecycle: { readonly sequence: number; readonly deleted?: { readonly deletedAt: string; readonly restorableUntil: string } };
  readonly duplicatedFrom?: PromptLineage;
}

export interface PromptsPageProps {
  readonly mode: 'real' | 'demo';
  readonly promptType: PromptType;
  readonly promptRef: string | null;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly demoPrompts: readonly DemoPrompt[];
  readonly setDemoPrompts: (prompts: DemoPrompt[]) => void;
  readonly navigate: (hash: string) => void;
  readonly notify: (message: string) => void;
}

/** Demo mode has no runtime: system prompts are listed by name only. */
const DEMO_SYSTEM: PromptList['systemPrompts'] = [
  { id: 'system-big-idea-strategic', promptType: 'BIG_IDEA', version: 1, name: 'Big Idea chiến lược v3.1', recommendedModel: 'gpt-5.6-sol', tags: [], isDefault: true },
  { id: 'system-angle-social', promptType: 'ANGLE', version: 1, name: 'Góc khai thác mạng xã hội v3', recommendedModel: 'gpt-5.6-sol', tags: [], isDefault: true },
  { id: 'system-caption-facebook', promptType: 'CAPTION', version: 1, name: 'Caption Facebook v3', recommendedModel: 'gpt-5.6-sol', tags: [], isDefault: true },
  { id: 'system-poster-b2b-infographic', promptType: 'POSTER', version: 1, name: 'Poster infographic B2B v2', recommendedModel: 'gpt-image-2', tags: [], isDefault: true },
];
const DEMO_NOTE = 'Bản demo không kết nối runtime: nội dung prompt hệ thống chỉ xem được với dữ liệu thật.';

const formatDate = (value: string) => new Date(value).toLocaleDateString('vi-VN');

export default function PromptsPage(props: PromptsPageProps) {
  const { mode, promptType, promptRef, demoPrompts } = props;
  const [list, setList] = useState<LoadState<PromptList>>({ status: 'loading' });
  const [detail, setDetail] = useState<LoadState<PromptView | null>>({ status: 'loading' });
  const [editor, dispatch] = useReducer(promptEditorReducer, null);
  const [editing, setEditing] = useState<{ readonly kind: 'new' | 'edit'; readonly lineage: PromptLineage | null; readonly from?: PromptView } | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((value) => value + 1);

  useEffect(() => {
    if (mode === 'demo') {
      setList({ status: 'ready', value: { contractVersion: '1.0.0', systemPrompts: DEMO_SYSTEM, prompts: demoPrompts.map((entry) => ({ promptId: entry.promptId, promptKey: entry.promptKey, promptType: entry.promptType, version: entry.version, name: entry.prompt.name, recommendedModel: entry.prompt.recommendedModel, tags: entry.prompt.tags, updatedAt: entry.createdAt, ...(entry.deleted ? { deleted: entry.deleted } : {}) })) } });
      return;
    }
    let active = true;
    loadPrompts().then((value) => { if (active) setList({ status: 'ready', value }); }).catch((error: unknown) => { if (active) setList({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, demoPrompts, reloadToken]);

  useEffect(() => {
    if (!promptRef) { setDetail({ status: 'ready', value: null }); return; }
    if (mode === 'demo') {
      const system = DEMO_SYSTEM.find((entry) => entry.id === promptRef);
      const user = demoPrompts.find((entry) => entry.promptId === promptRef);
      setDetail({ status: 'ready', value: system
        ? { source: 'SYSTEM', id: system.id, promptType: system.promptType, version: system.version, prompt: { name: system.name, creativeText: DEMO_NOTE, recommendedModel: system.recommendedModel as PromptContent['recommendedModel'], tags: [] }, isDefault: true, systemLayer: null, history: [], lifecycle: { sequence: 0 } }
        : user ? { source: 'USER', id: user.promptId, promptType: user.promptType, version: user.version, prompt: user.prompt, isDefault: false, systemLayer: null, history: user.history, lifecycle: { sequence: user.sequence, ...(user.deleted ? { deleted: user.deleted } : {}) }, ...(user.duplicatedFrom ? { duplicatedFrom: user.duplicatedFrom } : {}) }
        : null });
      return;
    }
    let active = true; setDetail({ status: 'loading' });
    const load = promptRef.startsWith('system-')
      ? loadSystemPrompt(promptRef).then((value): PromptView | null => value && { source: 'SYSTEM', id: value.systemPrompt.id, promptType: value.systemPrompt.promptType, version: value.systemPrompt.version, prompt: value.systemPrompt.prompt, isDefault: value.systemPrompt.isDefault, systemLayer: value.systemLayer, history: [], lifecycle: { sequence: 0 } })
      : loadPrompt(promptRef).then((value): PromptView | null => value && { source: 'USER', id: value.prompt.promptId, promptType: value.prompt.promptType, version: value.prompt.version, prompt: value.prompt.prompt, isDefault: false, systemLayer: value.systemLayer, history: value.history, lifecycle: value.lifecycle, ...(value.prompt.duplicatedFrom ? { duplicatedFrom: value.prompt.duplicatedFrom } : {}) });
    load.then((value) => { if (active) setDetail({ status: 'ready', value }); }).catch((error: unknown) => { if (active) setDetail({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, promptRef, demoPrompts, reloadToken]);

  useEffect(() => { setEditing(null); }, [promptRef, promptType]);
  const view = detail.status === 'ready' ? detail.value : null;
  useEffect(() => {
    if (editing?.kind === 'edit' && view?.source === 'USER') dispatch({ type: 'loaded', base: { promptId: view.id, promptType: view.promptType, version: view.version, draft: draftFromPrompt(view.prompt, view.promptType), history: view.history } });
  }, [editing, view]);

  const openNew = (from?: PromptView) => {
    const lineage: PromptLineage | null = from ? { kind: from.source, id: from.id, version: from.version } : null;
    dispatch({ type: 'new', key: generatedPromptKey(), target: `new:${promptType}` });
    if (from) dispatch({ type: 'edit', draft: { ...draftFromPrompt(from.prompt, promptType), name: `${from.prompt.name} (bản sao)`.slice(0, 120) } });
    else dispatch({ type: 'edit', draft: emptyPromptDraft(promptType) });
    setEditing({ kind: 'new', lineage, ...(from ? { from } : {}) });
  };

  const changeLifecycle = async (target: PromptView, action: 'DELETE' | 'RESTORE') => {
    try {
      if (mode === 'demo') props.setDemoPrompts(changeDemoLifecycle(props.demoPrompts, target.id, action, new Date().toISOString()));
      else await submitPromptLifecycle({ promptId: target.id, action, expectedSequence: target.lifecycle.sequence, token: props.ownerToken! });
      props.notify(action === 'DELETE' ? `Đã xóa prompt. Có thể khôi phục trong ${30} ngày.` : 'Đã khôi phục prompt.');
      reload();
    } catch (error) {
      props.notify(error instanceof OwnerWriteError ? error.message : 'Không thể cập nhật prompt.');
      reload();
    }
  };

  const all = list.status === 'ready' ? list.value : null;
  const system = all?.systemPrompts.filter((entry) => entry.promptType === promptType) ?? [];
  const mine = all?.prompts.filter((entry) => entry.promptType === promptType && !entry.deleted) ?? [];
  const deleted = all?.prompts.filter((entry) => entry.promptType === promptType && entry.deleted) ?? [];
  const count = (type: PromptType) => (all?.systemPrompts.filter((entry) => entry.promptType === type).length ?? 0) + (all?.prompts.filter((entry) => entry.promptType === type && !entry.deleted).length ?? 0);

  return <>
    <div className="heading">
      <div><h1>Thư viện prompt</h1><p>Phần sáng tạo do bạn viết; hệ thống tự thêm dữ liệu khóa, quy tắc an toàn và định dạng kết quả khi tạo nội dung.</p></div>
      <button className="button primary" type="button" onClick={() => { props.navigate(routeToHash.prompts(promptType)); openNew(); }}>+ Prompt mới</button>
    </div>
    <div className="prompt-layout">
      <nav className="surface prompt-nav" aria-label="Danh sách prompt">
        <div className="segmented prompt-types" role="tablist" aria-label="Loại prompt">
          {PROMPT_TYPES.map((type) => <a key={type.key} role="tab" aria-selected={type.key === promptType} className={type.key === promptType ? 'on' : ''} href={routeToHash.prompts(type.key)}>{type.label} · {count(type.key)}</a>)}
        </div>
        {list.status === 'loading' && <p className="muted">Đang tải thư viện…</p>}
        {list.status === 'failed' && <p className="form-error" role="alert">{list.message}</p>}
        <ul className="prompt-list">
          {system.map((entry) => <li key={entry.id}><a className={`prompt-link${entry.id === promptRef ? ' active' : ''}`} href={routeToHash.prompt(promptType, entry.id)} aria-current={entry.id === promptRef ? 'page' : undefined}>
            <strong>{entry.name}</strong><small><span className="source-badge system">Hệ thống</span>{entry.isDefault ? ' Mặc định' : ''}</small>
          </a></li>)}
          {mine.map((entry) => <li key={entry.promptId}><a className={`prompt-link${entry.promptId === promptRef ? ' active' : ''}`} href={routeToHash.prompt(promptType, entry.promptId)} aria-current={entry.promptId === promptRef ? 'page' : undefined}>
            <strong>{entry.name}</strong><small><span className="source-badge mine">Của tôi</span> v{entry.version} · {modelLabel(entry.recommendedModel)}</small>
          </a></li>)}
        </ul>
        {all && mine.length === 0 && <p className="muted">Chưa có prompt riêng cho loại này. Nhân bản prompt hệ thống hoặc tạo prompt mới.</p>}
        {deleted.length > 0 && <div className="recently-deleted">
          <button className="button quiet" type="button" aria-expanded={showDeleted} onClick={() => setShowDeleted((value) => !value)}>Đã xóa gần đây · {deleted.length}</button>
          {showDeleted && <ul className="prompt-list">{deleted.map((entry) => <li key={entry.promptId}><a className="prompt-link deleted" href={routeToHash.prompt(promptType, entry.promptId)}>
            <strong>{entry.name}</strong><small>Khôi phục được đến {formatDate(entry.deleted!.restorableUntil)}</small>
          </a></li>)}</ul>}
        </div>}
      </nav>
      <section className="surface surface-pad prompt-detail">
        {editing && editor && (editing.kind === 'new' ? editor.target === `new:${promptType}` : editor.target === view?.id)
          ? <PromptForm mode={mode} ownerToken={props.ownerToken} writesAvailable={props.writesAvailable} promptType={promptType} editor={editor} lineage={editing.lineage} dispatch={dispatch}
              demoPrompts={props.demoPrompts} setDemoPrompts={props.setDemoPrompts} notify={props.notify} onCancel={() => setEditing(null)} onConflict={reload}
              onSaved={(savedId) => { setEditing(null); reload(); props.navigate(routeToHash.prompt(promptType, savedId)); }} />
          : !promptRef ? <div className="empty"><h2>Chọn một prompt</h2><p>Chọn prompt hệ thống để xem hoặc nhân bản, hoặc tạo prompt mới cho {PROMPT_TYPES.find((type) => type.key === promptType)!.label}.</p></div>
          : detail.status === 'loading' ? <p className="muted">Đang tải prompt…</p>
          : detail.status === 'failed' ? <p className="form-error" role="alert">{detail.message}</p>
          : !view ? <div className="empty"><h2>Không tìm thấy prompt</h2><p>Prompt này không có trong thư viện.</p></div>
          : <PromptDetail mode={mode} ownerToken={props.ownerToken} writesAvailable={props.writesAvailable} view={view}
              onDuplicate={() => openNew(view)} onEdit={() => setEditing({ kind: 'edit', lineage: null })} onLifecycle={(action) => void changeLifecycle(view, action)} />}
      </section>
    </div>
  </>;
}

export function PromptDetail(props: { readonly mode: 'real' | 'demo'; readonly ownerToken: string | null; readonly writesAvailable: boolean; readonly view: PromptView; readonly onDuplicate: () => void; readonly onEdit: () => void; readonly onLifecycle: (action: 'DELETE' | 'RESTORE') => void }) {
  const { view } = props;
  const [confirming, setConfirming] = useState(false);
  const canWrite = props.mode === 'demo' || (props.writesAvailable && props.ownerToken !== null);
  const deleted = view.lifecycle.deleted;
  const expired = deleted ? Date.now() > Date.parse(deleted.restorableUntil) : false;
  return <article className="prompt-view">
    <header className="prompt-head">
      <div>
        <h2>{view.prompt.name}</h2>
        {view.prompt.description && <p className="muted">{view.prompt.description}</p>}
        <p className="prompt-meta">
          <span className={`source-badge ${view.source === 'SYSTEM' ? 'system' : 'mine'}`}>{view.source === 'SYSTEM' ? 'Hệ thống' : 'Của tôi'}{view.source === 'USER' ? ` · v${view.version}` : ''}</span>
          {view.isDefault && <span className="source-badge default">Mặc định</span>}
          <span>Mô hình: {modelLabel(view.prompt.recommendedModel)}</span>
          {view.prompt.tags.length > 0 && <span className="tags">{view.prompt.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}</span>}
        </p>
        {view.duplicatedFrom && <p className="muted small">Nhân bản từ {view.duplicatedFrom.kind === 'SYSTEM' ? 'prompt hệ thống' : 'prompt của bạn'} (phiên bản {view.duplicatedFrom.version}).</p>}
      </div>
      <div className="prompt-actions">
        <button className="button" type="button" disabled={!canWrite} onClick={props.onDuplicate}>Nhân bản</button>
        {view.source === 'USER' && !deleted && <>
          <button className="button" type="button" disabled={!canWrite} onClick={props.onEdit}>Sửa (tạo v{view.version + 1})</button>
          <details className="overflow-menu">
            <summary aria-label="Thêm thao tác">⋯</summary>
            <button className="button quiet danger" type="button" disabled={!canWrite} onClick={() => setConfirming(true)}>Xóa prompt</button>
          </details>
        </>}
      </div>
    </header>
    {!canWrite && <p className="decision-note">Mở khóa OWNER cục bộ ở thanh phía trên để nhân bản, sửa hoặc xóa prompt.</p>}
    {confirming && !deleted && <div className="confirm-box" role="alert">
      <p>Xóa prompt “{view.prompt.name}”? Bạn có thể khôi phục trong 30 ngày ở “Đã xóa gần đây”. Nội dung đã tạo bằng prompt này không thay đổi.</p>
      <div className="form-actions"><button className="button danger-solid" type="button" onClick={() => { setConfirming(false); props.onLifecycle('DELETE'); }}>Xóa</button><button className="button" type="button" onClick={() => setConfirming(false)}>Giữ lại</button></div>
    </div>}
    {deleted && <div className="deleted-banner" role="status">
      <p>{expired ? `Đã xóa ngày ${formatDate(deleted.deletedAt)}; đã quá hạn khôi phục.` : `Đã xóa ngày ${formatDate(deleted.deletedAt)} · khôi phục được đến ${formatDate(deleted.restorableUntil)}.`}</p>
      {!expired && <button className="button" type="button" disabled={!canWrite} onClick={() => props.onLifecycle('RESTORE')}>Khôi phục</button>}
    </div>}
    <section className="prompt-layer creative" aria-labelledby="creative-title">
      <h3 id="creative-title">Phần sáng tạo · bạn viết</h3>
      <pre className="prompt-text">{view.prompt.creativeText}</pre>
    </section>
    <details className="prompt-layer system">
      <summary>Phần hệ thống · tự thêm <small>Dữ liệu khóa · quy tắc an toàn và sự thật · định dạng kết quả{view.systemLayer ? ` · v${view.systemLayer.version}` : ''}</small></summary>
      {view.systemLayer ? <pre className="prompt-text">{view.systemLayer.text}</pre> : <p className="muted">{DEMO_NOTE}</p>}
    </details>
    {(view.prompt.demoInput || view.prompt.demoOutput) && <section className="prompt-demo" aria-label="Demo">
      {view.prompt.demoInput && <div><h3>Demo · đầu vào</h3><p>{view.prompt.demoInput}</p></div>}
      {view.prompt.demoOutput && <div><h3>Demo · kết quả</h3><p>{view.prompt.demoOutput}</p></div>}
    </section>}
    {view.history.length > 0 && <section className="brand-history" aria-labelledby="prompt-history-title">
      <h3 id="prompt-history-title">Lịch sử phiên bản</h3>
      <ol className="timeline">{[...view.history].reverse().map((entry) => <li key={entry.version}><strong>Phiên bản {entry.version}</strong> · {entry.name}<small>{new Date(entry.createdAt).toLocaleString('vi-VN')}</small></li>)}</ol>
    </section>}
  </article>;
}

export function PromptForm(props: {
  readonly mode: 'real' | 'demo'; readonly ownerToken: string | null; readonly writesAvailable: boolean; readonly promptType: PromptType;
  readonly editor: PromptEditor; readonly lineage: PromptLineage | null; readonly dispatch: Dispatch<PromptEditorEvent>;
  readonly onSaved: (promptId: string) => void; readonly onConflict: () => void; readonly onCancel: () => void; readonly notify: (message: string) => void;
  readonly demoPrompts: readonly DemoPrompt[]; readonly setDemoPrompts: (prompts: DemoPrompt[]) => void;
}) {
  const { mode, ownerToken, writesAvailable, promptType, editor, dispatch } = props;
  const { draft, base: current, saving: pending, notice } = editor;
  const inFlight = useRef(false);
  const blocker = promptDraftBlocker(draft);
  const unchanged = current !== null && samePromptContent(draft, current.draft);
  const disabledReason = mode === 'real' && !writesAvailable ? 'Ghi OWNER hiện không khả dụng trong runtime này.'
    : mode === 'real' && !ownerToken ? 'Mở khóa OWNER cục bộ ở thanh phía trên để bật lưu.'
    : pending ? 'Đang gửi yêu cầu…'
    : blocker ?? (unchanged ? 'Chưa có thay đổi so với phiên bản hiện tại.' : null);
  const set = (key: keyof PromptDraft, value: string) => dispatch({ type: 'edit', draft: { ...draft, [key]: value } });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || disabledReason) return;
    if (mode === 'demo') {
      try {
        const id = current?.promptId ?? crypto.randomUUID(); const now = new Date().toISOString();
        props.setDemoPrompts(current ? reviseDemoPrompt(props.demoPrompts, id, current.version, draft, now) : createDemoPrompt(props.demoPrompts, promptType, draft, id, now, props.lineage ?? undefined));
        props.notify(current ? 'Đã lưu phiên bản minh họa mới.' : 'Đã tạo prompt minh họa.');
        props.onSaved(id);
      } catch { dispatch({ type: 'failed', conflict: false, message: 'Prompt minh họa đã thay đổi hoặc đã bị xóa.' }); }
      return;
    }
    inFlight.current = true; dispatch({ type: 'submitted' });
    try {
      const prompt = promptRequestFromDraft(draft);
      const receipt = current
        ? await submitPromptRevision({ promptId: current.promptId, promptType, expectedVersion: current.version, prompt, token: ownerToken! })
        : await submitPromptCreate({ promptKey: editor.newKey ?? generatedPromptKey(), promptType, prompt, ...(props.lineage ? { duplicatedFrom: props.lineage } : {}), token: ownerToken! });
      dispatch({ type: 'saved', version: receipt.version, id: receipt.promptId });
      props.notify(receipt.exactRetry ? 'Yêu cầu đã được ghi trước đó; không tạo bản trùng.' : current ? `Đã lưu phiên bản ${receipt.version}.` : 'Đã tạo prompt.');
      props.onSaved(receipt.promptId);
    } catch (error) {
      if (error instanceof OwnerWriteError && error.kind === 'conflict') { dispatch({ type: 'failed', conflict: true, message: '' }); props.onConflict(); }
      else if (error instanceof OwnerWriteError && error.kind === 'connection') dispatch({ type: 'failed', conflict: false, message: 'Kết nối không rõ kết quả. Form giữ nguyên nội dung; hãy gửi lại an toàn.' });
      else dispatch({ type: 'failed', conflict: false, message: error instanceof OwnerWriteError ? error.message : 'Không thể lưu prompt.' });
    } finally { inFlight.current = false; }
  };

  const typeLabel = PROMPT_TYPES.find((type) => type.key === promptType)!.label;
  return <form className="brand-form prompt-form" onSubmit={(event) => void submit(event)} noValidate>
    <header className="brand-form-head">
      <div><h2>{current ? `Sửa prompt · tạo phiên bản ${current.version + 1}` : `Prompt ${typeLabel} mới`}</h2>
        <p className="muted">{props.lineage ? `Nhân bản từ ${props.lineage.kind === 'SYSTEM' ? 'prompt hệ thống' : 'prompt của bạn'} (phiên bản ${props.lineage.version}). ` : ''}Chỉ viết phần sáng tạo; hệ thống tự thêm dữ liệu khóa, quy tắc an toàn và định dạng kết quả.{mode === 'demo' ? ' Dữ liệu minh họa, chỉ tồn tại trong phiên này.' : ''}</p></div>
    </header>
    <fieldset className="catalog-fields" disabled={pending}>
      <legend className="visually-hidden">Thông tin prompt</legend>
      <label className="field">Tên<input className="search" value={draft.name} onChange={(event) => set('name', event.target.value)} maxLength={120} required /></label>
      <label className="field">Mô tả ngắn<input className="search" value={draft.description} onChange={(event) => set('description', event.target.value)} maxLength={300} /></label>
      <label className="field">Mô hình đề xuất<select className="search" value={draft.recommendedModel} onChange={(event) => set('recommendedModel', event.target.value)}>
        {modelsForType(promptType).map((model) => <option key={model.key} value={model.key}>{model.label}</option>)}
      </select></label>
      <label className="field">Thẻ <small className="muted">(phân cách bằng dấu phẩy)</small><input className="search" value={draft.tagsText} onChange={(event) => set('tagsText', event.target.value)} /></label>
      <label className="field">Phần sáng tạo · bạn viết<textarea className="search prompt-textarea" value={draft.creativeText} onChange={(event) => set('creativeText', event.target.value)} rows={14} /></label>
      <label className="field">Demo · đầu vào<textarea className="search" value={draft.demoInput} onChange={(event) => set('demoInput', event.target.value)} rows={3} /></label>
      <label className="field">Demo · kết quả<textarea className="search" value={draft.demoOutput} onChange={(event) => set('demoOutput', event.target.value)} rows={4} /></label>
    </fieldset>
    {notice && <div className="form-error brand-notice" role="alert">{noticeText(notice)}
      {notice.kind === 'rebased' && <button className="button" type="button" onClick={() => dispatch({ type: 'discard' })}>Bỏ thay đổi, dùng phiên bản {notice.toVersion}</button>}
    </div>}
    <div className="form-actions">
      <button className="button primary" type="submit" disabled={disabledReason !== null} aria-describedby="prompt-save-note">{pending ? 'Đang lưu…' : current ? `Lưu phiên bản ${current.version + 1}` : 'Tạo prompt'}</button>
      <button className="button" type="button" disabled={pending} onClick={props.onCancel}>Hủy</button>
    </div>
    <p id="prompt-save-note" className="decision-note">{disabledReason ?? 'Sẵn sàng lưu.'}</p>
  </form>;
}

function failureMessage(error: unknown): string {
  if (error instanceof ContentDataSourceError && error.kind === 'connection') return 'Không thể kết nối API nội dung.';
  return 'Dữ liệu thư viện prompt không vượt qua kiểm tra toàn vẹn.';
}
