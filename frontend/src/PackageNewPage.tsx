import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ContentCatalogPhoto, ContentVisibility } from '../../contracts/api/content-api.generated';
import type { ContentIdeaPromptChoice } from '../../contracts/flow/content-idea-generate-request.generated';
import { demoCampaignDetail, loadCampaign, type DemoCampaign } from './campaign-data-source';
import CampaignSteps from './CampaignSteps';
import { loadCatalogItem, mediaUrl, type DemoCatalogItem } from './catalog-data-source';
import { ContentDataSourceError } from './content-data-source';
import { OwnerWriteError } from './data-source';
import { IDEA_MODELS, loadIdeas, purposeDisplayKind, purposeLabel, type IdeaEntry, type IdeaList } from './idea-data-source';
import {
  CAPTION_ELEMENTS,
  CAPTION_LENGTHS,
  CAPTION_STYLES,
  PACKAGE_BATCH_LIMIT,
  PART_LABELS,
  POSTER_ELEMENTS,
  POSTER_FORMATS,
  POSTER_MAX_REFERENCES,
  POSTER_MODELS,
  DemoPackageError,
  PackageAiError,
  createDemoPackages,
  demoPackageList,
  emptyRowDraft,
  generateDemoPart,
  loadPackages,
  packageCallSummary,
  packageCreateBlocker,
  packageCreateRequest,
  packageRunPlan,
  packageableAngles,
  rowHasOverrides,
  saveDemoPackageDefaults,
  submitCampaignDefaults,
  submitPackageCreate,
  submitPackageGenerate,
  type CaptionSettings,
  type DemoPackage,
  type DemoPackageContext,
  type DemoPackageDefaults,
  type PackageDefaults,
  type PackageList,
  type PackagePart,
  type PackageRowDraft,
  type PackageRunCall,
  type PosterSettings,
} from './package-data-source';
import { loadPrompts, type PromptList } from './prompt-data-source';
import { routeToHash } from './routing';

export interface ReferencePhoto { readonly sha: string; readonly url: string; readonly label: string; readonly posterDefault: boolean }
/** Photos of the campaign's products; `skipped` counts photos of items revised since the campaign pinned them. */
export interface References { readonly photos: readonly ReferencePhoto[]; readonly skipped: number }

export interface PackageNewPageProps {
  readonly mode: 'real' | 'demo';
  readonly campaignId: string;
  readonly angleCodes: readonly string[];
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  /** Demo campaign context, or null when the demo campaign does not exist. */
  readonly demoContext: DemoPackageContext | null;
  readonly demoPackages: readonly DemoPackage[];
  readonly setDemoPackages: (packages: DemoPackage[]) => void;
  readonly demoDefaults: readonly DemoPackageDefaults[];
  readonly setDemoDefaults: (defaults: DemoPackageDefaults[]) => void;
  readonly demoReferences: References | null;
  readonly notify: (message: string) => void;
}

type Loaded =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly ideas: IdeaList; readonly packages: PackageList; readonly prompts: PromptList | null; readonly references: References | null }
  | { readonly status: 'missing' }
  | { readonly status: 'failed'; readonly message: string };

interface PromptOption { readonly key: string; readonly label: string; readonly choice: ContentIdeaPromptChoice; readonly isDefault: boolean }

interface RunCall { readonly call: PackageRunCall; readonly label: string }

interface RunState {
  readonly calls: readonly RunCall[];
  readonly done: number;
  readonly failures: readonly { readonly label: string; readonly message: string }[];
  readonly active: boolean;
  readonly stopped: string | null;
  /** Index to continue from after a connection loss; the same request ids make it an exact retry. */
  readonly resumeAt: number | null;
}

interface Form { readonly caption: CaptionSettings; readonly poster: PosterSettings }

type CaptionElement = (typeof CAPTION_ELEMENTS)[number];
type PosterElement = (typeof POSTER_ELEMENTS)[number];

const RUN_PARTS: readonly PackagePart[] = ['CAPTION', 'POSTER'];
const DEMO_BANNER = 'Chế độ demo — Caption & Poster được tạo bằng bộ sinh giả lập và chỉ lưu trong trình duyệt này.';
const ELEMENT_LABELS: Readonly<Record<PosterElement, string>> = { name: 'Tên thương hiệu', logo: 'Logo', tagline: 'Tagline', hotline: 'Hotline', web: 'Website & Fanpage', address: 'Địa chỉ' };
const VISIBILITIES: readonly { readonly key: ContentVisibility; readonly label: string }[] = [{ key: 'ALWAYS', label: 'Luôn' }, { key: 'OPTIONAL', label: 'Tùy' }, { key: 'HIDDEN', label: 'Ẩn' }];
const FREESTYLE: ContentIdeaPromptChoice = { source: 'FREESTYLE', creativeText: '' };

function failureMessage(error: unknown): string {
  if (error instanceof ContentDataSourceError && error.kind === 'connection') return 'Không thể kết nối API nội dung.';
  return 'Dữ liệu Caption & Poster không vượt qua kiểm tra toàn vẹn.';
}

const choiceKey = (choice: ContentIdeaPromptChoice): string => choice.source === 'SYSTEM' ? `system:${choice.id}` : choice.source === 'USER' ? `user:${choice.promptId}` : 'freestyle';

function promptOptions(prompts: PromptList | null, type: 'CAPTION' | 'POSTER'): PromptOption[] {
  if (!prompts) return [];
  return [
    ...prompts.systemPrompts.filter((prompt) => prompt.promptType === type).map((prompt): PromptOption => ({
      key: `system:${prompt.id}`, label: `${prompt.name}${prompt.isDefault ? ' · mặc định' : ''}`, choice: { source: 'SYSTEM', id: prompt.id, version: prompt.version }, isDefault: prompt.isDefault,
    })),
    ...prompts.prompts.filter((prompt) => prompt.promptType === type && !prompt.deleted).map((prompt): PromptOption => ({
      key: `user:${prompt.promptId}`, label: `${prompt.name} · của bạn v${prompt.version}`, choice: { source: 'USER', promptId: prompt.promptId, version: prompt.version }, isDefault: false,
    })),
  ];
}

function photosOf(name: string, photos: readonly ContentCatalogPhoto[], url: (sha: string) => string | undefined): ReferencePhoto[] {
  return photos.flatMap((photo, index) => {
    const src = url(photo.mediaSha256);
    return src ? [{ sha: photo.mediaSha256, url: src, label: `${name} · ảnh ${index + 1}`, posterDefault: photo.posterDefault }] : [];
  });
}

function unique(photos: readonly ReferencePhoto[]): ReferencePhoto[] {
  return [...new Map(photos.map((photo) => [photo.sha, photo] as const)).values()];
}

async function loadReferences(campaignId: string): Promise<References | null> {
  const detail = await loadCampaign(campaignId);
  if (!detail) return null;
  const brandId = detail.campaign.brandId;
  const photos: ReferencePhoto[] = [];
  let skipped = 0;
  for (const ref of detail.items) {
    const item = await loadCatalogItem(brandId, ref.itemId);
    if (!item) continue;
    const list: readonly ContentCatalogPhoto[] = item.item.item.photos;
    if (item.item.version !== ref.itemVersion) { skipped += list.length; continue; }
    photos.push(...photosOf(ref.name, list, (sha) => mediaUrl(brandId, sha)));
  }
  return { photos: unique(photos), skipped };
}

/** Demo reference photos: the campaign's pinned item versions, with their in-memory media. */
export function demoReferencePhotos(campaigns: readonly DemoCampaign[], items: readonly DemoCatalogItem[], media: Readonly<Record<string, string>>, campaignId: string): References | null {
  const detail = demoCampaignDetail(campaigns, campaignId, items as never);
  if (!detail) return null;
  const photos: ReferencePhoto[] = [];
  let skipped = 0;
  for (const ref of detail.items) {
    const item = items.find((candidate) => candidate.itemId === ref.itemId && candidate.brandId === detail.campaign.brandId);
    if (!item) continue;
    const list: readonly ContentCatalogPhoto[] = item.item.photos;
    if (item.version !== ref.itemVersion) { skipped += list.length; continue; }
    photos.push(...photosOf(ref.name, list, (sha) => media[sha]));
  }
  return { photos: unique(photos), skipped };
}

function initialForm(defaults: PackageDefaults | undefined, prompts: PromptList | null, references: References | null): Form {
  const available = new Set((references?.photos ?? []).map((photo) => photo.sha));
  if (defaults) {
    return { caption: defaults.caption, poster: { ...defaults.poster, referenceMediaSha256s: defaults.poster.referenceMediaSha256s.filter((sha) => available.has(sha)).slice(0, POSTER_MAX_REFERENCES) } };
  }
  const pick = (type: 'CAPTION' | 'POSTER'): ContentIdeaPromptChoice => {
    const options = promptOptions(prompts, type);
    return (options.find((option) => option.isDefault) ?? options[0])?.choice ?? FREESTYLE;
  };
  return {
    caption: { prompt: pick('CAPTION'), model: 'gpt-5.6-luna', style: 'PROFESSIONAL', length: 'MEDIUM' },
    poster: {
      prompt: pick('POSTER'), model: 'gpt-image-2', format: 'square', includeLogo: true,
      referenceMediaSha256s: (references?.photos ?? []).filter((photo) => photo.posterDefault).map((photo) => photo.sha).slice(0, POSTER_MAX_REFERENCES),
    },
  };
}

function withKey<K extends string, V>(entries: Partial<Record<K, V>>, key: K, value: V | undefined): Partial<Record<K, V>> {
  const next = { ...entries };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

function PromptField(props: { readonly id: string; readonly label: string; readonly value: ContentIdeaPromptChoice; readonly options: readonly PromptOption[]; readonly onChange: (choice: ContentIdeaPromptChoice) => void }) {
  const key = choiceKey(props.value);
  const known = key === 'freestyle' || props.options.some((option) => option.key === key);
  return <>
    <label className="field" htmlFor={props.id}>{props.label}<select id={props.id} className="search" value={key} onChange={(event) => {
      const next = event.target.value;
      props.onChange(next === 'freestyle' ? FREESTYLE : props.options.find((option) => option.key === next)?.choice ?? props.value);
    }}>
      {!known && <option value={key}>Prompt đã lưu trong mặc định</option>}
      {props.options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
      <option value="freestyle">Prompt tự do</option>
    </select></label>
    {props.value.source === 'FREESTYLE' && <label className="field" htmlFor={`${props.id}-text`}>Nội dung prompt tự do<textarea id={`${props.id}-text`} className="search" rows={3} maxLength={12000} value={props.value.creativeText} onChange={(event) => props.onChange({ source: 'FREESTYLE', creativeText: event.target.value })} /></label>}
  </>;
}

function ReferencePicker(props: { readonly id: string; readonly photos: readonly ReferencePhoto[]; readonly value: readonly string[]; readonly onChange: (value: string[]) => void }) {
  if (props.photos.length === 0) return <p className="muted">Sản phẩm của chiến dịch chưa có ảnh dùng được.</p>;
  return <div className="package-refs" role="group" aria-label="Ảnh tham chiếu">{props.photos.map((photo) => {
    const checked = props.value.includes(photo.sha);
    return <label key={photo.sha} className="package-ref" htmlFor={`${props.id}-${photo.sha}`}>
      <input id={`${props.id}-${photo.sha}`} type="checkbox" checked={checked} disabled={!checked && props.value.length >= POSTER_MAX_REFERENCES}
        onChange={() => props.onChange(checked ? props.value.filter((sha) => sha !== photo.sha) : [...props.value, photo.sha])} />
      <img src={photo.url} alt="" loading="lazy" />
      <span>{photo.label}</span>
    </label>;
  })}</div>;
}

export default function PackageNewPage(props: PackageNewPageProps) {
  const { mode, campaignId } = props;
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [form, setForm] = useState<Form | null>(null);
  const [rows, setRows] = useState<readonly PackageRowDraft[]>([]);
  const [run, setRun] = useState<RunState | null>(null);
  const [created, setCreated] = useState<readonly { readonly packageId: string; readonly code: string }[]>([]);
  const [busy, setBusy] = useState<'create' | 'defaults' | null>(null);
  const [notice, setNotice] = useState<{ readonly message: string; readonly reload: boolean } | null>(null);
  const mountedRef = useRef(true);
  const cancelRef = useRef(false);
  const initRef = useRef(false);
  /** The create request id stays the same while the body is unchanged, so a resend after a lost connection is an exact retry. */
  const createIdRef = useRef<{ readonly body: string; readonly id: string } | null>(null);
  /** Packages whose Caption failed before a connection loss, so a resumed run still skips their Poster. */
  const resumeFailedRef = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const reload = () => setReloadToken((value) => value + 1);

  useEffect(() => {
    if (mode === 'demo') {
      const context = props.demoContext;
      setLoaded(context
        ? { status: 'ready', ideas: context.ideas, packages: demoPackageList(props.demoPackages, props.demoDefaults, context, new Date().toISOString()), prompts: context.prompts, references: props.demoReferences }
        : { status: 'missing' });
      return;
    }
    let active = true;
    setLoaded({ status: 'loading' });
    Promise.all([loadIdeas(campaignId), loadPackages(campaignId), loadPrompts().catch(() => null), loadReferences(campaignId).catch(() => null)]).then(([ideas, packages, prompts, references]) => {
      if (active) setLoaded(ideas && packages ? { status: 'ready', ideas, packages, prompts, references } : { status: 'missing' });
    }).catch((error: unknown) => { if (active) setLoaded({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, campaignId, reloadToken, props.demoContext, props.demoPackages, props.demoDefaults, props.demoReferences]);

  const refresh = async (): Promise<void> => {
    if (mode === 'demo') return;
    try {
      const packages = await loadPackages(campaignId);
      if (!mountedRef.current) return;
      setLoaded((current) => current.status === 'ready' && packages ? { ...current, packages } : current);
    } catch { /* the list stays as it was; the owner can reload */ }
  };

  const ready = loaded.status === 'ready' ? loaded : null;
  const angles = ready ? packageableAngles(ready.ideas) : [];

  useEffect(() => {
    if (initRef.current || !ready) return;
    initRef.current = true;
    setForm(initialForm(ready.packages.defaults?.defaults, ready.prompts, ready.references));
    const byCode = new Map(angles.map((angle) => [angle.code, angle]));
    setRows(props.angleCodes.flatMap((code) => {
      const angle = byCode.get(code);
      return angle ? [emptyRowDraft(angle.ideaId)] : [];
    }).slice(0, PACKAGE_BATCH_LIMIT));
  }, [loaded.status]);

  if (loaded.status === 'loading' || (ready && !form)) return <p className="muted">Đang tải Caption & Poster…</p>;
  if (loaded.status === 'failed') return <section className="surface surface-pad"><p className="form-error" role="alert">{loaded.message}</p><button className="button" type="button" onClick={reload}>Thử lại</button></section>;
  if (loaded.status === 'missing' || !ready || !form) return <div className="surface empty"><h1>Không tìm thấy chiến dịch.</h1><a className="button" href={routeToHash.content()}>Về danh sách chiến dịch</a></div>;

  const { ideas, packages } = ready;
  const photos = ready.references?.photos ?? [];
  const angleById = new Map(angles.map((angle) => [angle.ideaId, angle]));
  const unresolved = props.angleCodes.filter((code) => !angles.some((angle) => angle.code === code));
  const addable = angles.filter((angle) => !rows.some((row) => row.angleId === angle.ideaId));
  const writable = mode === 'demo' || (props.writesAvailable && props.ownerToken !== null);
  const running = run?.active === true;
  const captionOptions = promptOptions(ready.prompts, 'CAPTION');
  const posterOptions = promptOptions(ready.prompts, 'POSTER');
  const blocker = running ? 'Đang tạo Caption & Poster…'
    : mode === 'demo' && !props.demoContext?.brand ? 'Chiến dịch minh họa chưa có thương hiệu.'
      : packageCreateBlocker({ writesAvailable: writable, campaignDeleted: packages.campaignDeleted, insightLocked: packages.insightLocked, rows, caption: form.caption, poster: form.poster });
  const defaultsBlocker = !writable ? 'Cần mở khóa OWNER để lưu mặc định.'
    : [form.caption.prompt, form.poster.prompt].some((prompt) => prompt.source === 'FREESTYLE' && !prompt.creativeText.trim()) ? 'Nhập nội dung prompt tự do trước khi lưu mặc định.' : null;

  const setCaption = (caption: Partial<CaptionSettings>) => setForm({ ...form, caption: { ...form.caption, ...caption } });
  const setPoster = (poster: Partial<PosterSettings>) => setForm({ ...form, poster: { ...form.poster, ...poster } });
  const updateRow = (angleId: string, change: (row: PackageRowDraft) => PackageRowDraft) => setRows(rows.map((row) => row.angleId === angleId ? change(row) : row));

  const fail = (error: unknown, fallback: string) => {
    if (!mountedRef.current) return;
    if (error instanceof OwnerWriteError && error.kind === 'conflict') setNotice({ message: error.message, reload: true });
    else if (error instanceof OwnerWriteError && error.kind === 'connection') setNotice({ message: 'Kết nối không rõ kết quả. Bấm lại để gửi đúng yêu cầu cũ — không tạo gói trùng.', reload: false });
    else if (error instanceof DemoPackageError) setNotice({ message: 'Dữ liệu minh họa đã thay đổi.', reload: true });
    else setNotice({ message: error instanceof OwnerWriteError ? error.message : fallback, reload: false });
  };

  /** In demo the App state lands on a later render, so a run carries its own copy of the packages, starting from `demoStart`. */
  const executeRun = async (calls: readonly RunCall[], startAt: number, captionFailed: ReadonlySet<string>, demoStart: readonly DemoPackage[] = props.demoPackages) => {
    cancelRef.current = false;
    setNotice(null);
    const failed = new Set(captionFailed);
    const failures: { label: string; message: string }[] = [];
    let done = startAt;
    let stopped: string | null = null;
    let resumeAt: number | null = null;
    let demoPackages = demoStart;
    setRun({ calls, done, failures: [], active: true, stopped: null, resumeAt: null });
    for (let index = startAt; index < calls.length; index += 1) {
      if (cancelRef.current) { stopped = `Đã dừng — còn ${calls.length - index} lần gọi chưa chạy.`; break; }
      const { call, label } = calls[index]!;
      if (call.part === 'POSTER' && failed.has(call.packageId)) {
        failures.push({ label, message: 'Bỏ qua vì Caption chưa tạo được.' });
        done = index + 1;
        if (mountedRef.current) setRun({ calls, done, failures: [...failures], active: true, stopped: null, resumeAt: null });
        continue;
      }
      try {
        if (mode === 'demo') {
          const result = generateDemoPart(demoPackages, props.demoContext!, call, new Date().toISOString(), crypto.randomUUID());
          demoPackages = result.packages;
          props.setDemoPackages(result.packages);
        } else {
          await submitPackageGenerate({ call, token: props.ownerToken! });
        }
        done = index + 1;
      } catch (error) {
        if (error instanceof PackageAiError && error.unavailable) { stopped = error.message; break; }
        if (error instanceof OwnerWriteError && error.kind === 'connection') {
          stopped = 'Mất kết nối giữa chừng. Tiếp tục an toàn: lần gọi dở dang dùng lại cùng mã yêu cầu nên không tạo phiên bản trùng.';
          resumeAt = index;
          break;
        }
        if (error instanceof OwnerWriteError && error.kind !== 'invalid' && error.kind !== 'integrity' && error.kind !== 'conflict') { stopped = error.message; break; }
        if (call.part === 'CAPTION') failed.add(call.packageId);
        failures.push({ label, message: error instanceof DemoPackageError ? 'Gói minh họa đã thay đổi.' : error instanceof Error && error.message ? error.message : 'Không tạo được phần này.' });
        done = index + 1;
      }
      if (mountedRef.current) setRun({ calls, done, failures: [...failures], active: true, stopped: null, resumeAt: null });
    }
    await refresh();
    if (!mountedRef.current) return;
    setRun({ calls, done, failures, active: false, stopped, resumeAt });
    if (resumeAt !== null) resumeFailedRef.current = failed;
    const made = done - startAt - failures.length;
    if (made > 0) props.notify(`Đã tạo ${made} phần Caption & Poster.`);
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blocker || busy) return;
    const body = JSON.stringify(packageCreateRequest({ ...form, rows }, ''));
    const requestId = createIdRef.current?.body === body ? createIdRef.current.id : crypto.randomUUID();
    createIdRef.current = { body, id: requestId };
    const request = packageCreateRequest({ ...form, rows }, requestId);
    setNotice(null);
    setBusy('create');
    let receipt;
    let demoStart = props.demoPackages;
    try {
      if (mode === 'demo') {
        const result = createDemoPackages(props.demoPackages, props.demoContext!, request, new Date().toISOString());
        props.setDemoPackages(result.packages);
        demoStart = result.packages;
        receipt = result.receipt;
      } else {
        receipt = await submitPackageCreate({ campaignId, request, token: props.ownerToken! });
      }
    } catch (error) {
      fail(error, 'Không thể tạo gói Caption & Poster.');
      if (mountedRef.current) setBusy(null);
      return;
    }
    createIdRef.current = null;
    if (!mountedRef.current) return;
    setBusy(null);
    setCreated(receipt.packages);
    const plan = packageRunPlan(receipt.packages, RUN_PARTS).map((call) => ({ call, label: `${call.code} · ${PART_LABELS[call.part]}` }));
    void executeRun(plan, 0, new Set(), demoStart);
  };

  const saveDefaults = async () => {
    if (defaultsBlocker || busy) return;
    const defaults: PackageDefaults = { caption: form.caption, poster: form.poster };
    const expectedVersion = packages.defaults?.version ?? 0;
    setNotice(null);
    if (mode === 'demo') {
      try {
        props.setDemoDefaults(saveDemoPackageDefaults(props.demoDefaults, campaignId, expectedVersion, defaults, new Date().toISOString()));
        props.notify('Đã lưu mặc định cho chiến dịch.');
      } catch (error) { fail(error, 'Không thể lưu mặc định.'); }
      return;
    }
    setBusy('defaults');
    try {
      await submitCampaignDefaults({ campaignId, expectedVersion, defaults, token: props.ownerToken! });
      props.notify('Đã lưu mặc định cho chiến dịch.');
      await refresh();
    } catch (error) { fail(error, 'Không thể lưu mặc định.'); } finally { if (mountedRef.current) setBusy(null); }
  };

  const angleSummary = (angle: IdeaEntry) => <>
    <span className="idea-code">{angle.code}</span> <b>{angle.name}</b>
    <ul className="chip-list" aria-label="Mục đích">{angle.purposes.map((value) => <li key={value} className={`purpose-chip purpose-${(purposeDisplayKind(value, ideas.purposeTags) ?? 'EDUCATION').toLowerCase()}`}>{purposeLabel(value, ideas.purposeTags)}</li>)}</ul>
  </>;

  const rowEditor = (row: PackageRowDraft) => {
    const angle = angleById.get(row.angleId);
    const id = `row-${row.angleId}`;
    return <li key={row.angleId} className="package-row">
      <div className="package-row-head">
        <div>{angle ? angleSummary(angle) : <b>{row.angleId}</b>}</div>
        <button className="button quiet" type="button" disabled={running} onClick={() => setRows(rows.filter((entry) => entry.angleId !== row.angleId))} aria-label={`Bỏ ${angle?.code ?? 'góc này'}`}>Bỏ</button>
      </div>
      <details className="package-row-edit">
        <summary>Sửa riêng{rowHasOverrides(row) ? ' · đã chỉnh' : ''}</summary>
        <div className="package-row-grid">
          <label className="field" htmlFor={`${id}-style`}>Giọng văn<select id={`${id}-style`} className="search" value={row.style ?? ''} onChange={(event) => updateRow(row.angleId, ({ style: _style, ...rest }) => event.target.value ? { ...rest, style: event.target.value as CaptionSettings['style'] } : rest)}>
            <option value="">Theo lô</option>{CAPTION_STYLES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select></label>
          <label className="field" htmlFor={`${id}-length`}>Độ dài<select id={`${id}-length`} className="search" value={row.length ?? ''} onChange={(event) => updateRow(row.angleId, ({ length: _length, ...rest }) => event.target.value ? { ...rest, length: event.target.value as CaptionSettings['length'] } : rest)}>
            <option value="">Theo lô</option>{CAPTION_LENGTHS.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select></label>
        </div>
        <fieldset className="package-display">
          <legend>Caption hiển thị</legend>
          {CAPTION_ELEMENTS.map((element) => <label key={element} className="field" htmlFor={`${id}-caption-${element}`}>{ELEMENT_LABELS[element]}<select id={`${id}-caption-${element}`} className="search" value={row.caption[element] ?? ''}
            onChange={(event) => updateRow(row.angleId, (current) => ({ ...current, caption: withKey<CaptionElement, ContentVisibility>(current.caption, element, event.target.value ? event.target.value as ContentVisibility : undefined) }))}>
            <option value="">Theo mục đích</option>{VISIBILITIES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select></label>)}
        </fieldset>
        <fieldset className="package-display">
          <legend>Poster hiển thị</legend>
          {POSTER_ELEMENTS.map((element) => <label key={element} className="field" htmlFor={`${id}-poster-${element}`}>{ELEMENT_LABELS[element]}<select id={`${id}-poster-${element}`} className="search" value={row.poster[element] === undefined ? '' : row.poster[element] ? 'on' : 'off'}
            onChange={(event) => updateRow(row.angleId, (current) => ({ ...current, poster: withKey<PosterElement, boolean>(current.poster, element, event.target.value === '' ? undefined : event.target.value === 'on') }))}>
            <option value="">Theo mục đích</option><option value="on">Bật</option><option value="off">Tắt</option>
          </select></label>)}
        </fieldset>
        <label className="idea-pick" htmlFor={`${id}-own-refs`}><input id={`${id}-own-refs`} type="checkbox" checked={row.references !== undefined}
          onChange={() => updateRow(row.angleId, ({ references, ...rest }) => references === undefined ? { ...rest, references: [] } : rest)} /> Ảnh tham chiếu riêng cho góc này</label>
        {row.references !== undefined && <ReferencePicker id={`${id}-refs`} photos={photos} value={row.references} onChange={(value) => updateRow(row.angleId, (current) => ({ ...current, references: value }))} />}
      </details>
    </li>;
  };

  return <article className="package-page">
    {mode === 'demo' && <div className="demo-banner" role="note">{DEMO_BANNER}</div>}
    <nav className="crumb" aria-label="Đường dẫn"><a href={routeToHash.content()}>Chiến dịch</a><span aria-hidden="true">/</span><a href={routeToHash.campaign(campaignId)}>{packages.campaignName}</a><span aria-hidden="true">/</span><span>Caption & Poster</span></nav>
    <div className="heading"><div><h1>Caption & Poster</h1><p>Mỗi góc nội dung thành một gói: Caption kèm khối liên hệ từ hồ sơ thương hiệu và một Poster.</p></div></div>
    <CampaignSteps campaignId={campaignId} current={3} />
    {packages.campaignDeleted && <div className="deleted-banner" role="status"><p>Chiến dịch đã bị xóa. Khôi phục chiến dịch để tiếp tục.</p><a className="button" href={routeToHash.campaign(campaignId)}>Mở chiến dịch</a></div>}
    {!packages.insightLocked && !packages.campaignDeleted && <div className="snapshot-warning" role="status"><p>Cần khóa Insight trước khi tạo Caption & Poster.</p><a className="button" href={routeToHash.campaignInsight(campaignId)}>Mở Insight</a></div>}
    {unresolved.length > 0 && <p className="decision-note">Không dùng được {unresolved.join(', ')}: góc đã xóa, không tồn tại hoặc chưa gắn mục đích.</p>}

    <form className="brand-form package-form" onSubmit={(event) => void create(event)} noValidate>
      <fieldset className="package-inspector" disabled={running || busy !== null}>
        <legend>Thiết lập cho cả lô</legend>
        {ready.prompts === null && mode === 'real' && <p className="decision-note">Không tải được thư viện prompt — vẫn dùng được prompt tự do.</p>}
        <div className="package-columns">
          <section aria-labelledby="package-caption-title">
            <h2 id="package-caption-title">Caption</h2>
            <PromptField id="caption-prompt" label="Prompt" value={form.caption.prompt} options={captionOptions} onChange={(prompt) => setCaption({ prompt })} />
            <label className="field" htmlFor="caption-model">Mô hình<select id="caption-model" className="search" value={form.caption.model} onChange={(event) => setCaption({ model: event.target.value as CaptionSettings['model'] })}>{IDEA_MODELS.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label>
            <label className="field" htmlFor="caption-style">Giọng văn<select id="caption-style" className="search" value={form.caption.style} onChange={(event) => setCaption({ style: event.target.value as CaptionSettings['style'] })}>{CAPTION_STYLES.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label>
            <label className="field" htmlFor="caption-length">Độ dài<select id="caption-length" className="search" value={form.caption.length} onChange={(event) => setCaption({ length: event.target.value as CaptionSettings['length'] })}>{CAPTION_LENGTHS.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label>
          </section>
          <section aria-labelledby="package-poster-title">
            <h2 id="package-poster-title">Poster</h2>
            <PromptField id="poster-prompt" label="Prompt" value={form.poster.prompt} options={posterOptions} onChange={(prompt) => setPoster({ prompt })} />
            <label className="field" htmlFor="poster-model">Mô hình<select id="poster-model" className="search" value={form.poster.model} onChange={(event) => setPoster({ model: event.target.value as PosterSettings['model'] })}>{POSTER_MODELS.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label>
            <label className="field" htmlFor="poster-format">Khổ<select id="poster-format" className="search" value={form.poster.format} onChange={(event) => setPoster({ format: event.target.value as PosterSettings['format'] })}>{POSTER_FORMATS.map((entry) => <option key={entry.key} value={entry.key}>{entry.label} · {entry.width}×{entry.height}</option>)}</select></label>
            <label className="idea-pick" htmlFor="poster-logo"><input id="poster-logo" type="checkbox" checked={form.poster.includeLogo} onChange={() => setPoster({ includeLogo: !form.poster.includeLogo })} /> Dùng logo thương hiệu</label>
            <p className="muted">Ảnh tham chiếu (tối đa {POSTER_MAX_REFERENCES})</p>
            {ready.references === null ? <p className="decision-note">Không tải được ảnh sản phẩm — Poster sẽ tạo không có ảnh tham chiếu.</p>
              : <ReferencePicker id="poster-refs" photos={photos} value={form.poster.referenceMediaSha256s} onChange={(value) => setPoster({ referenceMediaSha256s: value })} />}
            {(ready.references?.skipped ?? 0) > 0 && <p className="muted">Ẩn {ready.references!.skipped} ảnh của sản phẩm đã có phiên bản mới hơn phiên bản chiến dịch dùng.</p>}
          </section>
        </div>
        <div className="form-actions">
          <button className="button" type="button" disabled={defaultsBlocker !== null} title={defaultsBlocker ?? undefined} onClick={() => void saveDefaults()}>{busy === 'defaults' ? 'Đang lưu…' : 'Lưu làm mặc định cho chiến dịch'}</button>
          {packages.defaults && <span className="muted">Mặc định v{packages.defaults.version}</span>}
        </div>
      </fieldset>

      <fieldset className="package-rows" disabled={running || busy !== null}>
        <legend>Góc nội dung ({rows.length}/{PACKAGE_BATCH_LIMIT})</legend>
        {rows.length === 0 ? <p className="muted">Chưa chọn góc nào.</p> : <ul className="package-row-list">{rows.map(rowEditor)}</ul>}
        <div className="form-actions">
          {addable.length > 0 && rows.length < PACKAGE_BATCH_LIMIT && <label className="field" htmlFor="package-add">Thêm góc<select id="package-add" className="search" value="" onChange={(event) => { if (event.target.value) setRows([...rows, emptyRowDraft(event.target.value)]); }}>
            <option value="">Chọn góc…</option>{addable.map((angle) => <option key={angle.ideaId} value={angle.ideaId}>{angle.code} · {angle.name}</option>)}
          </select></label>}
          <button className="button" type="button" disabled={!rows.some(rowHasOverrides)} onClick={() => setRows(rows.map((row) => emptyRowDraft(row.angleId)))}>Áp dụng cho tất cả</button>
        </div>
        {angles.length === 0 && <p className="muted">Chưa có góc nào gắn mục đích. <a href={routeToHash.campaignAngle(campaignId)}>Mở Góc nội dung</a></p>}
      </fieldset>

      <div className="form-actions">
        <button className="button primary" type="submit" disabled={blocker !== null || busy !== null}>{busy === 'create' ? 'Đang tạo gói…' : running ? 'Đang tạo…' : `Tạo ${rows.length} gói`}</button>
        <span className="idea-call-count" aria-live="polite">{packageCallSummary(rows.length, RUN_PARTS)} · {rows.length * RUN_PARTS.length} lần gọi AI</span>
      </div>
      {blocker && !running && <p className="decision-note">{blocker}</p>}
    </form>

    {run && <section className="idea-tray" aria-live="polite" aria-label="Tiến trình tạo">
      <p><b>{run.active ? `Đang tạo · ${run.calls.length - run.done}` : 'Lượt tạo đã xong'}</b> <span className="muted">{run.done}/{run.calls.length} lần gọi</span></p>
      <progress max={run.calls.length} value={run.done} />
      {run.failures.length > 0 && <ul className="idea-failures">{run.failures.map((failure, index) => <li key={index}>{failure.label}: {failure.message}</li>)}</ul>}
      {run.stopped && <p className="form-error" role="alert">{run.stopped}</p>}
      {created.length > 0 && <p>Mở gói: {created.map((entry, index) => <span key={entry.packageId}>{index > 0 && ', '}<a href={routeToHash.package(campaignId, entry.code)}>{entry.code}</a></span>)}</p>}
      <div className="form-actions">
        {run.active && <button className="button" type="button" onClick={() => { cancelRef.current = true; }}>Dừng sau lần gọi này</button>}
        {!run.active && run.resumeAt !== null && <button className="button primary" type="button" onClick={() => void executeRun(run.calls, run.resumeAt!, resumeFailedRef.current)}>Tiếp tục</button>}
        {!run.active && <button className="button" type="button" onClick={() => setRun(null)}>Đóng</button>}
      </div>
    </section>}

    {notice && <div className="form-error brand-notice" role="alert"><p>{notice.message}</p>{notice.reload && <button className="button" type="button" onClick={reload}>Tải lại</button>}</div>}

    <section aria-labelledby="package-list-title">
      <h2 id="package-list-title">Gói đã tạo ({packages.packages.filter((entry) => !entry.deleted).length})</h2>
      {packages.packages.length === 0 ? <p className="muted">Chưa có gói nào.</p> : <ul className="package-list">{packages.packages.map((entry) => {
        const angle = angleById.get(entry.angleId) ?? ideas.ideas.find((idea) => idea.ideaId === entry.angleId);
        return <li key={entry.packageId} className={entry.deleted ? 'deleted' : ''}>
          <a href={routeToHash.package(campaignId, entry.code)}><span className="idea-code">{entry.code}</span> {angle?.kind === 'ANGLE' ? angle.name : ''}</a>
          <span className="muted">Caption v{entry.captionVersion} · Poster v{entry.posterVersion}{entry.deleted ? ' · đã xóa' : ''}</span>
          {entry.captionPreview && <p className="package-preview">{entry.captionPreview}</p>}
        </li>;
      })}</ul>}
    </section>
  </article>;
}
