import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ContentIdeaPromptChoice } from '../../contracts/flow/content-idea-generate-request.generated';
import { ContentDataSourceError } from './content-data-source';
import { OwnerWriteError } from './data-source';
import CampaignSteps from './CampaignSteps';
import ConfirmDialog from './ConfirmDialog';
import { generatedPromptKey, loadPrompts, submitPromptCreate, type PromptContent, type PromptList } from './prompt-data-source';
import {
  IDEA_MODELS,
  MAX_CALLS_PER_PROMPT,
  MAX_PURPOSES,
  PURPOSE_KINDS,
  IdeaAiError,
  anglesOf,
  bigIdeasOf,
  changeDemoIdeaState,
  contentAiCallCount,
  createDemoPurposeTag,
  demoIdeaList,
  developingBigIdeas,
  freestyleBlocker,
  generateDemoIdea,
  ideaRunBlocker,
  ideaRunPlan,
  loadIdeas,
  modelLabel,
  purposeDisplayKind,
  purposeLabel,
  purposeTagBlocker,
  submitIdeaGenerate,
  submitIdeaState,
  submitPurposeTag,
  type DemoIdea,
  type DemoIdeaCampaign,
  type IdeaEntry,
  type IdeaKind,
  type IdeaList,
  type IdeaModel,
  type IdeaPromptSelection,
  type IdeaRunCall,
  type PurposeKind,
  type PurposeTag,
} from './idea-data-source';
import { PACKAGE_BATCH_LIMIT } from './package-data-source';
import { routeToHash } from './routing';

export interface IdeasPageProps {
  readonly mode: 'real' | 'demo';
  readonly campaignId: string;
  readonly kind: IdeaKind;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  /** Demo campaign with its locked Insight, or null when the demo campaign does not exist. */
  readonly demoCampaign: DemoIdeaCampaign | null;
  readonly demoIdeas: readonly DemoIdea[];
  readonly setDemoIdeas: (ideas: DemoIdea[]) => void;
  readonly demoTags: readonly PurposeTag[];
  readonly setDemoTags: (tags: PurposeTag[]) => void;
  readonly demoPrompts: PromptList;
  readonly notify: (message: string) => void;
}

type Loaded =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly list: IdeaList; readonly prompts: PromptList | null }
  | { readonly status: 'missing' }
  | { readonly status: 'failed'; readonly message: string };

interface PromptOption {
  readonly key: string;
  readonly label: string;
  readonly detail: string;
  readonly choice: ContentIdeaPromptChoice;
  readonly isDefault: boolean;
}

interface RunState {
  readonly calls: readonly IdeaRunCall[];
  readonly done: number;
  readonly failures: readonly { readonly label: string; readonly message: string }[];
  readonly active: boolean;
  readonly stopped: string | null;
  /** Index to continue from after a connection loss; the same request ids make it an exact retry. */
  readonly resumeAt: number | null;
}

type StateAction = 'DEVELOP' | 'STOP' | 'DELETE' | 'RESTORE' | 'PURPOSES';

const FREESTYLE_LABEL = 'Prompt tự do';
const DEFAULT_COUNT = 3;
const DEMO_BANNER = 'Chế độ demo — ý tưởng được tạo bằng bộ sinh giả lập và chỉ lưu trong trình duyệt này.';
const formatDateTime = (value: string): string => new Date(value).toLocaleString('vi-VN');
/** The generated purposes type is a tuple union (maxItems) whose empty member makes includes() take never. */
const purposesOf = (idea: IdeaEntry): readonly string[] => idea.purposes;
const hasPurpose = (idea: IdeaEntry, value: string): boolean => purposesOf(idea).includes(value);
const formatDate = (value: string): string => new Date(value).toLocaleDateString('vi-VN');
const clampCount = (value: number): number => Math.min(MAX_CALLS_PER_PROMPT, Math.max(1, Math.trunc(Number.isFinite(value) ? value : 1)));

function failureMessage(error: unknown): string {
  if (error instanceof ContentDataSourceError && error.kind === 'connection') return 'Không thể kết nối API nội dung.';
  return 'Dữ liệu ý tưởng không vượt qua kiểm tra toàn vẹn.';
}

function promptOptions(prompts: PromptList | null, kind: IdeaKind): PromptOption[] {
  if (!prompts) return [];
  const system: PromptOption[] = prompts.systemPrompts.filter((prompt) => prompt.promptType === kind).map((prompt) => ({
    key: `system:${prompt.id}`, label: prompt.name, detail: prompt.isDefault ? 'Prompt hệ thống · mặc định' : 'Prompt hệ thống',
    choice: { source: 'SYSTEM', id: prompt.id, version: prompt.version }, isDefault: prompt.isDefault,
  }));
  const own: PromptOption[] = prompts.prompts.filter((prompt) => prompt.promptType === kind && !prompt.deleted).map((prompt) => ({
    key: `user:${prompt.promptId}`, label: prompt.name, detail: `Của bạn · v${prompt.version}`,
    choice: { source: 'USER', promptId: prompt.promptId, version: prompt.version }, isDefault: false,
  }));
  return [...system, ...own];
}

export default function IdeasPage(props: IdeasPageProps) {
  const { mode, campaignId, kind } = props;
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [picked, setPicked] = useState<Readonly<Record<string, number>>>({});
  const [freestyle, setFreestyle] = useState({ on: false, text: '', count: DEFAULT_COUNT, name: '' });
  const [model, setModel] = useState<IdeaModel>('gpt-5.6-luna');
  const [parentId, setParentId] = useState<string | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [notice, setNotice] = useState<{ readonly message: string; readonly reload: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<IdeaEntry | null>(null);
  const [purposeEditor, setPurposeEditor] = useState<string | null>(null);
  /** Angle codes picked for Caption & Poster, in the order they were ticked. */
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [tagDraft, setTagDraft] = useState<{ readonly label: string; readonly displayLike: PurposeKind }>({ label: '', displayLike: 'EDUCATION' });
  const mountedRef = useRef(true);
  const cancelRef = useRef(false);
  const pickedInitRef = useRef(false);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const reload = () => setReloadToken((value) => value + 1);

  useEffect(() => {
    if (mode === 'demo') {
      setLoaded(props.demoCampaign
        ? { status: 'ready', list: demoIdeaList(props.demoIdeas, props.demoTags, props.demoCampaign, new Date().toISOString()), prompts: props.demoPrompts }
        : { status: 'missing' });
      return;
    }
    let active = true;
    setLoaded({ status: 'loading' });
    Promise.all([loadIdeas(campaignId), loadPrompts().catch(() => null)]).then(([list, prompts]) => {
      if (active) setLoaded(list ? { status: 'ready', list, prompts } : { status: 'missing' });
    }).catch((error: unknown) => { if (active) setLoaded({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, campaignId, reloadToken, props.demoCampaign, props.demoIdeas, props.demoTags, props.demoPrompts]);

  // Quiet refresh after a write: keeps the page (and a running tray) on screen instead of a loading state.
  const refresh = async (): Promise<void> => {
    if (mode === 'demo') return;
    try {
      const list = await loadIdeas(campaignId);
      if (!mountedRef.current) return;
      setLoaded((current) => list ? { status: 'ready', list, prompts: current.status === 'ready' ? current.prompts : null } : { status: 'missing' });
    } catch (error) { if (mountedRef.current) setLoaded({ status: 'failed', message: failureMessage(error) }); }
  };

  const list = loaded.status === 'ready' ? loaded.list : null;
  const options = promptOptions(loaded.status === 'ready' ? loaded.prompts : null, kind);
  const developing = list ? developingBigIdeas(list) : [];
  const parent = kind === 'ANGLE' ? developing.find((idea) => idea.ideaId === parentId) ?? developing[0] ?? null : null;

  useEffect(() => {
    if (pickedInitRef.current || loaded.status !== 'ready') return;
    pickedInitRef.current = true;
    const preferred = options.find((option) => option.isDefault) ?? options[0];
    if (preferred) setPicked({ [preferred.key]: DEFAULT_COUNT });
    else setFreestyle((current) => ({ ...current, on: true }));
  }, [loaded.status]);

  if (loaded.status === 'loading') return <p className="muted">Đang tải ý tưởng…</p>;
  if (loaded.status === 'failed') return <section className="surface surface-pad"><p className="form-error" role="alert">{loaded.message}</p><button className="button" type="button" onClick={reload}>Thử lại</button></section>;
  if (loaded.status === 'missing' || !list) return <div className="surface empty"><h1>Không tìm thấy chiến dịch.</h1><a className="button" href={routeToHash.content()}>Về danh sách chiến dịch</a></div>;

  const writable = mode === 'demo' || (props.writesAvailable && props.ownerToken !== null);
  const running = run?.active === true;
  const selections: IdeaPromptSelection[] = [
    ...options.filter((option) => picked[option.key] !== undefined).map((option) => ({ key: option.key, label: option.label, choice: option.choice, count: picked[option.key]! })),
    ...(freestyle.on ? [{ key: 'freestyle', label: FREESTYLE_LABEL, choice: { source: 'FREESTYLE', creativeText: freestyle.text } as ContentIdeaPromptChoice, count: freestyle.count }] : []),
  ];
  const callCount = contentAiCallCount(selections);
  const runBlocker = running ? 'Đang tạo ý tưởng…' : ideaRunBlocker({
    kind, ...(parent ? { parentIdeaId: parent.ideaId } : {}), selections, insightLocked: list.insightLocked, campaignDeleted: list.campaignDeleted, writesAvailable: writable,
  });
  const visible = kind === 'BIG_IDEA' ? bigIdeasOf(list) : parent ? anglesOf(list, parent.ideaId) : [];
  const title = kind === 'BIG_IDEA' ? 'Big Idea' : 'Góc nội dung';

  const fail = (error: unknown, fallback: string) => {
    if (!mountedRef.current) return;
    if (error instanceof OwnerWriteError && error.kind === 'conflict') setNotice({ message: 'Ý tưởng đã thay đổi ở nơi khác. Tải lại để xem trạng thái mới nhất.', reload: true });
    else if (error instanceof OwnerWriteError && error.kind === 'connection') setNotice({ message: 'Kết nối không rõ kết quả. Tải lại để kiểm tra trước khi thử lại.', reload: true });
    else setNotice({ message: error instanceof OwnerWriteError ? error.message : fallback, reload: false });
  };

  const executeRun = async (calls: readonly IdeaRunCall[], startAt: number) => {
    cancelRef.current = false;
    setNotice(null);
    const failures: { label: string; message: string }[] = [];
    let done = startAt;
    let stopped: string | null = null;
    let resumeAt: number | null = null;
    let demoIdeas = props.demoIdeas;
    setRun({ calls, done, failures: [], active: true, stopped: null, resumeAt: null });
    for (let index = startAt; index < calls.length; index += 1) {
      if (cancelRef.current) { stopped = `Đã dừng — còn ${calls.length - index} lần gọi chưa chạy.`; break; }
      const call = calls[index]!;
      try {
        if (mode === 'demo') {
          const result = generateDemoIdea(demoIdeas, props.demoCampaign!, call, new Date().toISOString(), crypto.randomUUID());
          demoIdeas = result.ideas;
          props.setDemoIdeas(result.ideas);
        } else {
          await submitIdeaGenerate({ campaignId, request: call.request, token: props.ownerToken! });
          await refresh();
        }
        done = index + 1;
      } catch (error) {
        if (error instanceof IdeaAiError && error.unavailable) { stopped = error.message; break; }
        if (error instanceof OwnerWriteError && error.kind === 'connection') {
          stopped = 'Mất kết nối giữa chừng. Tiếp tục an toàn: lần gọi dở dang dùng lại cùng mã yêu cầu nên không tạo ý trùng.';
          resumeAt = index;
          break;
        }
        if (error instanceof OwnerWriteError && error.kind !== 'invalid' && error.kind !== 'integrity') {
          stopped = error.kind === 'conflict' ? 'Chiến dịch hoặc Big Idea đã thay đổi — lượt tạo dừng lại. Tải lại để xem trạng thái mới.' : error.message;
          break;
        }
        failures.push({ label: call.label, message: error instanceof Error && error.message ? error.message : 'Không tạo được ý này.' });
        done = index + 1;
      }
      if (mountedRef.current) setRun({ calls, done, failures: [...failures], active: true, stopped: null, resumeAt: null });
    }
    if (!mountedRef.current) return;
    setRun({ calls, done, failures, active: false, stopped, resumeAt });
    const created = done - startAt - failures.length;
    if (created > 0) props.notify(`Đã tạo ${created} ${kind === 'BIG_IDEA' ? 'Big Idea' : 'góc nội dung'}.`);
  };

  const startRun = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (runBlocker) return;
    void executeRun(ideaRunPlan({ kind, ...(parent ? { parentIdeaId: parent.ideaId } : {}), model, selections }), 0);
  };

  const changeState = async (idea: IdeaEntry, action: StateAction, purposes?: readonly string[]) => {
    if (!writable || busyId || running) return;
    setNotice(null);
    const input = { ideaId: idea.ideaId, expectedSequence: idea.stateSequence, action, ...(purposes ? { purposes } : {}) };
    if (mode === 'demo') {
      try { props.setDemoIdeas(changeDemoIdeaState(props.demoIdeas, input, new Date().toISOString())); } catch { setNotice({ message: 'Ý tưởng minh họa đã thay đổi.', reload: true }); }
      return;
    }
    setBusyId(idea.ideaId);
    try {
      const receipt = await submitIdeaState({ ...input, token: props.ownerToken! });
      if (action === 'DELETE') props.notify(`Đã xóa ${idea.code}. Có thể khôi phục đến ${formatDate(receipt.restorableUntil!)}.`);
      else if (action === 'RESTORE') props.notify(`Đã khôi phục ${idea.code}.`);
      await refresh();
    } catch (error) { fail(error, 'Không thể cập nhật ý tưởng.'); } finally { if (mountedRef.current) setBusyId(null); }
  };

  const togglePurpose = (idea: IdeaEntry, value: string) => {
    const current = purposesOf(idea);
    const next = current.includes(value) ? current.filter((purpose) => purpose !== value) : [...current, value];
    if (next.length > MAX_PURPOSES) { setNotice({ message: `Mỗi góc tối đa ${MAX_PURPOSES} mục đích.`, reload: false }); return; }
    void changeState(idea, 'PURPOSES', next);
  };

  const tagBlocker = purposeTagBlocker(tagDraft.label, list.purposeTags);
  const createTag = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (tagBlocker || !writable || busyId) return;
    const label = tagDraft.label.trim();
    if (mode === 'demo') {
      props.setDemoTags(createDemoPurposeTag(props.demoTags, label, tagDraft.displayLike, crypto.randomUUID(), new Date().toISOString()));
      setTagDraft({ label: '', displayLike: tagDraft.displayLike });
      return;
    }
    setBusyId('tag');
    try {
      await submitPurposeTag({ label, displayLike: tagDraft.displayLike, token: props.ownerToken! });
      if (mountedRef.current) setTagDraft({ label: '', displayLike: tagDraft.displayLike });
      await refresh();
    } catch (error) { fail(error, 'Không thể thêm mục đích.'); } finally { if (mountedRef.current) setBusyId(null); }
  };

  const freestyleSaveReason = mode === 'demo' ? 'Lưu prompt chỉ có ở chế độ thật.'
    : !writable ? 'Mở khóa OWNER để lưu prompt.'
      : freestyleBlocker(freestyle.text) ?? (!freestyle.name.trim() ? 'Đặt tên cho prompt.' : [...freestyle.name.trim()].length > 120 ? 'Tên prompt tối đa 120 ký tự.' : null);
  const saveFreestyle = async () => {
    if (freestyleSaveReason || savingPrompt) return;
    setSavingPrompt(true);
    setNotice(null);
    try {
      const prompt = { name: freestyle.name.trim(), creativeText: freestyle.text.trim(), recommendedModel: model, tags: [] } as unknown as PromptContent;
      const receipt = await submitPromptCreate({ promptKey: generatedPromptKey(), promptType: kind, prompt, token: props.ownerToken! });
      const prompts = await loadPrompts();
      if (!mountedRef.current) return;
      setLoaded((current) => current.status === 'ready' ? { ...current, prompts } : current);
      setPicked((current) => ({ ...current, [`user:${receipt.promptId}`]: freestyle.count }));
      setFreestyle({ on: false, text: '', count: DEFAULT_COUNT, name: '' });
      props.notify(`Đã lưu prompt “${receipt.name}” vào thư viện.`);
    } catch (error) { fail(error, 'Không thể lưu prompt.'); } finally { if (mountedRef.current) setSavingPrompt(false); }
  };

  const togglePick = (key: string) => setPicked((current) => {
    if (current[key] === undefined) return { ...current, [key]: DEFAULT_COUNT };
    return Object.fromEntries(Object.entries(current).filter(([entry]) => entry !== key));
  });

  const ideaCard = (idea: IdeaEntry) => {
    const busy = busyId === idea.ideaId || running || !writable;
    return <li key={idea.ideaId} className={`idea-card${idea.deleted ? ' deleted' : ''}${idea.developing ? ' developing' : ''}`}>
      <header className="idea-card-head">
        <span className="idea-code" aria-label={`Mã ${idea.code}`}>{idea.code}</span>
        <h3>{idea.kind === 'BIG_IDEA' ? idea.concept : idea.name}</h3>
        {!idea.deleted && <details className="idea-menu">
          <summary aria-label={`Thao tác khác cho ${idea.code}`}>⋯</summary>
          <button className="button danger" type="button" disabled={busy} onClick={() => setConfirmDelete(idea)}>Xóa</button>
        </details>}
      </header>
      {idea.kind === 'BIG_IDEA' ? idea.expression && <p className="idea-expression">{idea.expression}</p> : <p className="idea-expression">{idea.concept}</p>}
      <p className="muted idea-meta">{modelLabel(idea.model)} · {idea.promptLabel} · {formatDateTime(idea.createdAt)}</p>
      {idea.deleted ? <div className="idea-actions">
        <span className="muted">Đã xóa{idea.restorableUntil ? ` · khôi phục được đến ${formatDate(idea.restorableUntil)}` : ''}</span>
        <button className="button" type="button" disabled={busy} onClick={() => void changeState(idea, 'RESTORE')}>Khôi phục</button>
      </div> : idea.kind === 'BIG_IDEA' ? <div className="idea-actions">
        {idea.developing
          ? <><span className="status-pill good">Đang phát triển</span><button className="button" type="button" disabled={busy} onClick={() => void changeState(idea, 'STOP')}>Ngừng phát triển</button><a className="button" href={routeToHash.campaignAngle(campaignId)}>Tạo góc nội dung</a></>
          : <button className="button primary" type="button" disabled={busy} onClick={() => void changeState(idea, 'DEVELOP')}>Phát triển ý này</button>}
      </div> : <div className="idea-purposes">
        {idea.purposes.length > 0
          ? <label className="idea-pick" htmlFor={`package-pick-${idea.ideaId}`}><input id={`package-pick-${idea.ideaId}`} type="checkbox" checked={chosen.includes(idea.code)} disabled={!chosen.includes(idea.code) && chosen.length >= PACKAGE_BATCH_LIMIT} onChange={() => setChosen(chosen.includes(idea.code) ? chosen.filter((code) => code !== idea.code) : [...chosen, idea.code])} /> Chọn để tạo Caption & Poster</label>
          : <p className="muted">Gắn mục đích để tạo Caption & Poster.</p>}
        <ul className="chip-list" aria-label="Mục đích">{idea.purposes.map((value) => <li key={value} className={`purpose-chip purpose-${(purposeDisplayKind(value, list.purposeTags) ?? 'EDUCATION').toLowerCase()}`}>{purposeLabel(value, list.purposeTags)}</li>)}</ul>
        <button className="button" type="button" disabled={busy} aria-expanded={purposeEditor === idea.ideaId} onClick={() => setPurposeEditor(purposeEditor === idea.ideaId ? null : idea.ideaId)}>{idea.purposes.length ? 'Sửa mục đích' : 'Gắn mục đích'}</button>
        {purposeEditor === idea.ideaId && <div className="purpose-editor">
          <p className="muted">Gợi ý</p>
          <div className="chip-list">{PURPOSE_KINDS.map((purpose) => <button key={purpose.key} type="button" className={`purpose-chip purpose-${purpose.key.toLowerCase()}`} aria-pressed={hasPurpose(idea, purpose.key)} disabled={busy} onClick={() => togglePurpose(idea, purpose.key)}>{purpose.label}</button>)}</div>
          <p className="muted">Của bạn</p>
          <div className="chip-list">{list.purposeTags.length === 0 ? <span className="muted">Chưa có mục đích riêng.</span> : list.purposeTags.map((tag) => <button key={tag.tagId} type="button" className={`purpose-chip purpose-${tag.displayLike.toLowerCase()}`} aria-pressed={hasPurpose(idea, `tag:${tag.tagId}`)} disabled={busy} onClick={() => togglePurpose(idea, `tag:${tag.tagId}`)}>{tag.label}</button>)}</div>
          <form className="purpose-tag-form" onSubmit={(event) => void createTag(event)} noValidate>
            <label className="field" htmlFor={`tag-label-${idea.ideaId}`}>Mục đích mới<input id={`tag-label-${idea.ideaId}`} className="search" value={tagDraft.label} maxLength={40} onChange={(event) => setTagDraft({ ...tagDraft, label: event.target.value })} /></label>
            <label className="field" htmlFor={`tag-kind-${idea.ideaId}`}>Hiển thị giống<select id={`tag-kind-${idea.ideaId}`} className="search" value={tagDraft.displayLike} onChange={(event) => setTagDraft({ ...tagDraft, displayLike: event.target.value as PurposeKind })}>{PURPOSE_KINDS.map((purpose) => <option key={purpose.key} value={purpose.key}>{purpose.label}</option>)}</select></label>
            <button className="button" type="submit" disabled={tagBlocker !== null || busyId !== null || !writable}>Thêm</button>
            {tagDraft.label.trim() && tagBlocker && <p className="decision-note">{tagBlocker}</p>}
          </form>
        </div>}
      </div>}
    </li>;
  };

  return <article className="ideas-page">
    {mode === 'demo' && <div className="demo-banner" role="note">{DEMO_BANNER}</div>}
    <nav className="crumb" aria-label="Đường dẫn"><a href={routeToHash.content()}>Chiến dịch</a><span aria-hidden="true">/</span><a href={routeToHash.campaign(campaignId)}>{list.campaignName}</a><span aria-hidden="true">/</span><span>{title}</span></nav>
    <div className="heading"><div><h1>{title}</h1><p>{kind === 'BIG_IDEA' ? 'Ý tưởng lớn dẫn dắt cả chiến dịch, sinh từ Insight đã khóa. Chọn ý để phát triển thành các góc nội dung.' : 'Mỗi góc là một cách kể Big Idea cho một mục đích cụ thể.'}</p></div></div>
    <CampaignSteps campaignId={campaignId} current={kind === 'BIG_IDEA' ? 1 : 2} />
    {list.campaignDeleted && <div className="deleted-banner" role="status"><p>Chiến dịch đã bị xóa. Khôi phục chiến dịch để tiếp tục.</p><a className="button" href={routeToHash.campaign(campaignId)}>Mở chiến dịch</a></div>}
    {!list.insightLocked && !list.campaignDeleted && <div className="snapshot-warning" role="status"><p>Cần khóa Insight trước khi tạo ý tưởng.</p><a className="button" href={routeToHash.campaignInsight(campaignId)}>Mở Insight</a></div>}
    {kind === 'ANGLE' && list.insightLocked && developing.length === 0 && <div className="snapshot-warning" role="status"><p>Chưa có Big Idea nào đang phát triển. Chọn “Phát triển ý này” ở bước Big Idea.</p><a className="button" href={routeToHash.campaignBigIdea(campaignId)}>Mở Big Idea</a></div>}
    {kind === 'ANGLE' && developing.length > 0 && <label className="field idea-parent" htmlFor="idea-parent">Big Idea đang phát triển<select id="idea-parent" className="search" value={parent?.ideaId ?? ''} disabled={running} onChange={(event) => setParentId(event.target.value)}>{developing.map((idea) => <option key={idea.ideaId} value={idea.ideaId}>{idea.code} · {idea.concept}</option>)}</select></label>}

    {list.insightLocked && !list.campaignDeleted && (kind === 'BIG_IDEA' || parent) && <form className="brand-form idea-run" onSubmit={startRun} noValidate>
      <header className="brand-form-head"><div><h2>Tạo {kind === 'BIG_IDEA' ? 'Big Idea' : `góc cho ${parent?.code ?? ''}`}</h2><p className="muted">Insight v{list.insightVersion} · mỗi ý là một lần gọi AI.</p></div></header>
      <fieldset className="idea-prompts" disabled={running || !writable}>
        <legend>Prompt</legend>
        {loaded.prompts === null && mode === 'real' && <p className="decision-note">Không tải được thư viện prompt — vẫn dùng được prompt tự do.</p>}
        {options.map((option) => <div key={option.key} className="idea-prompt-row">
          <label htmlFor={`pick-${option.key}`}><input id={`pick-${option.key}`} type="checkbox" checked={picked[option.key] !== undefined} onChange={() => togglePick(option.key)} /> <b>{option.label}</b> <small className="muted">{option.detail}</small></label>
          {picked[option.key] !== undefined && <label className="idea-count" htmlFor={`count-${option.key}`}>Số ý<input id={`count-${option.key}`} type="number" min={1} max={MAX_CALLS_PER_PROMPT} value={picked[option.key]} onChange={(event) => setPicked({ ...picked, [option.key]: clampCount(event.target.valueAsNumber) })} /></label>}
        </div>)}
        <div className="idea-prompt-row">
          <label htmlFor="pick-freestyle"><input id="pick-freestyle" type="checkbox" checked={freestyle.on} onChange={() => setFreestyle({ ...freestyle, on: !freestyle.on })} /> <b>{FREESTYLE_LABEL}</b> <small className="muted">Viết hướng dẫn riêng cho lượt này</small></label>
          {freestyle.on && <label className="idea-count" htmlFor="count-freestyle">Số ý<input id="count-freestyle" type="number" min={1} max={MAX_CALLS_PER_PROMPT} value={freestyle.count} onChange={(event) => setFreestyle({ ...freestyle, count: clampCount(event.target.valueAsNumber) })} /></label>}
        </div>
        {freestyle.on && <div className="idea-freestyle">
          <label className="field" htmlFor="freestyle-text">Nội dung prompt<textarea id="freestyle-text" className="search" rows={4} maxLength={12000} value={freestyle.text} onChange={(event) => setFreestyle({ ...freestyle, text: event.target.value })} /></label>
          <div className="idea-save-prompt">
            <label className="field" htmlFor="freestyle-name">Tên để lưu vào thư viện<input id="freestyle-name" className="search" maxLength={120} value={freestyle.name} onChange={(event) => setFreestyle({ ...freestyle, name: event.target.value })} /></label>
            <button className="button" type="button" disabled={freestyleSaveReason !== null || savingPrompt} title={freestyleSaveReason ?? undefined} onClick={() => void saveFreestyle()}>{savingPrompt ? 'Đang lưu…' : 'Lưu thành prompt'}</button>
          </div>
        </div>}
        <label className="field idea-model" htmlFor="idea-model">Mô hình<select id="idea-model" className="search" value={model} onChange={(event) => setModel(event.target.value as IdeaModel)}>{IDEA_MODELS.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label>
      </fieldset>
      <div className="form-actions">
        <button className="button primary" type="submit" disabled={runBlocker !== null}>{running ? 'Đang tạo…' : `Tạo ${callCount} ý`}</button>
        <span className="idea-call-count" aria-live="polite">{callCount} lần gọi AI · {modelLabel(model)}</span>
      </div>
      {runBlocker && !running && <p className="decision-note">{runBlocker}</p>}
    </form>}

    {run && <section className="idea-tray" aria-live="polite" aria-label="Tiến trình tạo">
      <p><b>{run.active ? `Đang tạo · ${run.calls.length - run.done}` : 'Lượt tạo đã xong'}</b> <span className="muted">{run.done}/{run.calls.length} lần gọi</span></p>
      <progress max={run.calls.length} value={run.done} />
      {run.failures.length > 0 && <ul className="idea-failures">{run.failures.map((failure, index) => <li key={index}>{failure.label}: {failure.message}</li>)}</ul>}
      {run.stopped && <p className="form-error" role="alert">{run.stopped}</p>}
      <div className="form-actions">
        {run.active && <button className="button" type="button" onClick={() => { cancelRef.current = true; }}>Dừng sau lần gọi này</button>}
        {!run.active && run.resumeAt !== null && <button className="button primary" type="button" onClick={() => void executeRun(run.calls, run.resumeAt!)}>Tiếp tục</button>}
        {!run.active && <button className="button" type="button" onClick={() => setRun(null)}>Đóng</button>}
      </div>
    </section>}

    {notice && <div className="form-error brand-notice" role="alert"><p>{notice.message}</p>{notice.reload && <button className="button" type="button" onClick={reload}>Tải lại</button>}</div>}

    <section aria-labelledby="idea-list-title">
      <div className="idea-list-head">
        <h2 id="idea-list-title">{kind === 'BIG_IDEA' ? `Big Idea (${visible.filter((idea) => !idea.deleted).length})` : parent ? `Góc của ${parent.code} (${visible.filter((idea) => !idea.deleted).length})` : 'Góc nội dung'}</h2>
        {kind === 'ANGLE' && chosen.length > 0 && <a className="button primary" href={routeToHash.packageNew(campaignId, chosen)}>Tạo Caption & Poster ({chosen.length})</a>}
      </div>
      {visible.length === 0 ? <p className="muted">Chưa có ý nào. Chọn prompt và bấm “Tạo”.</p> : <ul className="idea-grid">{visible.map(ideaCard)}</ul>}
    </section>

    {confirmDelete && <ConfirmDialog titleId="idea-delete-title" descriptionId="idea-delete-description" title={`Xóa ${confirmDelete.code}?`} confirmLabel="Xóa" pending={busyId === confirmDelete.ideaId} onCancel={() => setConfirmDelete(null)} onConfirm={() => { const idea = confirmDelete; setConfirmDelete(null); void changeState(idea, 'DELETE'); }}>
      <p id="idea-delete-description">Có thể khôi phục trong 30 ngày.{confirmDelete.kind === 'BIG_IDEA' && confirmDelete.developing ? ' Ý đang phát triển sẽ ngừng phát triển.' : ''}</p>
    </ConfirmDialog>}
  </article>;
}
