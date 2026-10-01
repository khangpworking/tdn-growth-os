import { useEffect, useId, useRef, useState } from 'react';
import type {
  ResearchGenerationChoice,
  ResearchGenerationInputs,
  ResearchGenerationMethodCandidate,
  ResearchGenerationMethodSelectionIds,
  ResearchGenerationReceipt,
  ResearchGenerationRequest,
} from '../../contracts/api/research-generation-api.generated';
import { createResearchReport, loadResearchGenerationInputs, ResearchGenerationClientError } from './research-generation-client';

export interface ResearchReportCreatePanelProps {
  readonly workspaceId: string;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly onCreated: (receipt: ResearchGenerationReceipt) => void;
}

const METHOD_FAMILIES = [
  { key: 'descriptiveMethods', label: 'Phương pháp mô tả thị trường', hint: 'Bổ sung cho phần Thị trường.' },
  { key: 'locatedInsightMethods', label: 'Phương pháp Insight gắn vị trí bằng chứng', hint: 'Bổ sung cho phần Insight.' },
  { key: 'methodPackets', label: 'Gói kiểm tra điều kiện và tổng hợp', hint: 'Bổ sung bước kiểm tra điều kiện và phần tổng hợp.' },
] as const;
type MethodFamily = typeof METHOD_FAMILIES[number]['key'];
type MethodIds = ResearchGenerationMethodSelectionIds;
type ReportPresentation = NonNullable<ResearchGenerationRequest['reportPresentation']>;

const DEFAULT_PRESENTATION: ReportPresentation = 'report-kit-v1';
const REPORT_PRESENTATIONS: readonly { readonly value: ReportPresentation; readonly label: string; readonly hint: string }[] = [
  { value: 'report-kit-v1', label: 'Báo cáo chuẩn', hint: 'Cách trình bày Thị trường và Insight đang dùng, không có số tham chiếu.' },
  { value: 'report-kit-citations-v1', label: 'Báo cáo có số tham chiếu nguồn', hint: 'Cùng cách trình bày Thị trường và Insight, thêm số [1], [2] cạnh dữ kiện đã lưu nguồn. Bấm số để xem kết quả tính đã lưu và vị trí dòng/ô trong file nguồn. Dữ kiện chưa đủ nguồn thì không có số; không thêm số liệu hay nhận định AI.' },
];

const LIMITATION_COPY: Record<string, string> = {
  SCHEMA_VALIDATED_ONLY: 'Hệ thống mới nhận ra đúng loại hồ sơ, chưa xác nhận hồ sơ phù hợp với bộ dữ liệu này.',
  PACKAGE_RELATION_NOT_DECLARED: 'Package chưa ghi hồ sơ này được lập cho bộ dữ liệu nào.',
  CONSUMER_VALIDATION_ON_CREATE: 'Khi tạo, hệ thống đối chiếu hồ sơ với nguồn. Nếu không khớp, báo cáo không được tạo và form báo lại lý do.',
};

function emptyMethodIds(): MethodIds {
  return { descriptiveMethods: null, locatedInsightMethods: null, methodPackets: null };
}

function methodCandidates(choice: ResearchGenerationChoice | undefined, family: MethodFamily): ResearchGenerationMethodCandidate[] {
  return choice?.methodInputs?.[family] ?? [];
}

function hasMethodSelection(ids: MethodIds): boolean {
  return Object.values(ids).some(value => value !== null);
}

interface ReportRequestSnapshot {
  readonly source: string;
  readonly period: string;
  readonly families: Readonly<Record<MethodFamily, string | null>>;
  readonly includeMethodInputs: boolean;
  readonly presentation: ReportPresentation;
}

export default function ResearchReportCreatePanel({ workspaceId, ownerToken, writesAvailable, onCreated }: ResearchReportCreatePanelProps) {
  const id = useId();
  const sourceSelect = useRef<HTMLSelectElement | null>(null);
  const focusSourceAfterReload = useRef(false);
  const [inventory, setInventory] = useState<ResearchGenerationInputs | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [selectionId, setSelectionId] = useState('');
  const [methodIds, setMethodIds] = useState<MethodIds>(emptyMethodIds);
  const [methodAnnouncement, setMethodAnnouncement] = useState('');
  const [presentation, setPresentation] = useState<ReportPresentation>(DEFAULT_PRESENTATION);
  const [status, setStatus] = useState<'idle' | 'pending' | 'error' | 'done'>('idle');
  const [failure, setFailure] = useState<ResearchGenerationClientError | null>(null);
  const [receipt, setReceipt] = useState<ResearchGenerationReceipt | null>(null);
  const operation = useRef<ResearchGenerationRequest | null>(null);
  const operationDisplay = useRef<ReportRequestSnapshot | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const session = useRef({ workspaceId, ownerToken, writesAvailable });
  if (session.current.workspaceId !== workspaceId || session.current.ownerToken !== ownerToken || session.current.writesAvailable !== writesAvailable) {
    session.current = { workspaceId, ownerToken, writesAvailable };
  }
  const priorWorkspace = useRef(workspaceId);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (priorWorkspace.current !== workspaceId) {
      priorWorkspace.current = workspaceId;
      operation.current = null; operationDisplay.current = null; busy.current = false;
      setSelectionId(''); setMethodIds(emptyMethodIds()); setMethodAnnouncement(''); setPresentation(DEFAULT_PRESENTATION); setStatus('idle'); setFailure(null); setReceipt(null);
    }
    setInventory(null); setLoadError('');
    if (!writesAvailable || !ownerToken) { setLoadState('idle'); return; }
    const controller = new AbortController();
    let active = true;
    setLoadState('loading');
    void loadResearchGenerationInputs(workspaceId, ownerToken, controller.signal).then(value => {
      if (!active) return;
      setInventory(value); setLoadState('ready');
    }).catch(error => {
      if (!active) return;
      setLoadState('error');
      setLoadError(error instanceof ResearchGenerationClientError ? error.message : 'Chưa tải được danh sách nguồn.');
    });
    return () => { active = false; controller.abort(); };
  }, [workspaceId, ownerToken, writesAvailable, reload]);

  const selected = inventory?.workspaceId === workspaceId ? inventory.choices.find(choice => choice.selectionId === selectionId) : undefined;
  const inventoryHasMethodInputs = inventory?.choices.some(choice => choice.methodInputs !== undefined) ?? false;
  const lockedOperation = status === 'pending' || status === 'error' || status === 'done';
  const retryable = status === 'error' && (failure?.kind === 'connection' || failure?.kind === 'integrity');
  const canChooseAgain = status === 'done' || (status === 'error' && (failure?.kind === 'source' || failure?.kind === 'selection' || failure?.kind === 'method'));

  useEffect(() => {
    if (loadState !== 'ready' || !focusSourceAfterReload.current) return;
    focusSourceAfterReload.current = false;
    sourceSelect.current?.focus();
  }, [inventory, loadState]);

  useEffect(() => {
    if (loadState !== 'ready' || status !== 'idle' || !selected) return;
    let changed = false;
    const next = { ...methodIds };
    for (const family of METHOD_FAMILIES) {
      if (next[family.key] !== null && (!selected.methodInputs || !methodCandidates(selected, family.key).some(candidate => candidate.methodSelectionId === next[family.key]))) {
        next[family.key] = null;
        changed = true;
      }
    }
    if (changed) {
      setMethodIds(next);
      setMethodAnnouncement('Hồ sơ đã chọn không còn trong package sau khi tải lại; đã đặt về Không dùng.');
    }
  }, [loadState, methodIds, selected, status]);

  const chosenCandidates = selected?.methodInputs ? METHOD_FAMILIES.flatMap(family => {
    const selectedId = methodIds[family.key];
    const candidate = selectedId === null ? undefined : methodCandidates(selected, family.key).find(item => item.methodSelectionId === selectedId);
    return candidate ? [{ family, candidate }] : [];
  }) : [];
  const limitationFamilies = new Map<string, MethodFamily[]>();
  for (const { family, candidate } of chosenCandidates) {
    for (const code of candidate.limitations) {
      const families = limitationFamilies.get(code) ?? [];
      if (!families.includes(family.key)) families.push(family.key);
      limitationFamilies.set(code, families);
    }
  }

  async function submit() {
    if (busy.current || !ownerToken || !writesAvailable || (!operation.current && !selected) || (status === 'error' && !retryable)) return;
    if (!operation.current) {
      const includeMethodInputs = selected!.methodInputs !== undefined;
      const methodSelectionIds = includeMethodInputs ? Object.freeze({ ...methodIds }) as MethodIds : undefined;
      operation.current = Object.freeze({
        contractVersion: '1.0.0', workspaceId, selectionId: selected!.selectionId, requestKey: crypto.randomUUID(),
        reportPresentation: presentation,
        ...(methodSelectionIds ? { methodSelectionIds } : {}),
      }) as ResearchGenerationRequest;
      operationDisplay.current = Object.freeze({
        source: `${selected!.sourceLabel} · v${selected!.packageVersion}`,
        period: `${selected!.period.start} đến ${selected!.period.end} · ${selected!.period.basis}`,
        families: Object.freeze(Object.fromEntries(METHOD_FAMILIES.map(family => {
          const candidate = methodCandidates(selected, family.key).find(item => item.methodSelectionId === methodIds[family.key]);
          return [family.key, candidate?.logicalPath ?? null];
        }))) as Readonly<Record<MethodFamily, string | null>>,
        includeMethodInputs,
        presentation,
      });
    }
    const body = operation.current;
    const activeSession = session.current;
    busy.current = true; setStatus('pending'); setFailure(null);
    const current = () => mounted.current && session.current === activeSession && operation.current === body;
    try {
      const value = await createResearchReport(body, ownerToken);
      if (!current()) return;
      setReceipt(value); setStatus('done');
      onCreated(value);
    } catch (error) {
      if (!current()) return;
      setFailure(error instanceof ResearchGenerationClientError ? error : new ResearchGenerationClientError('connection', 'Chưa xác nhận được kết quả.'));
      setStatus('error');
    } finally {
      if (operation.current === body) {
        busy.current = false;
        if (mounted.current && session.current.workspaceId === body.workspaceId && session.current !== activeSession) {
          setStatus('error');
          setFailure(new ResearchGenerationClientError('connection', 'Phiên OWNER đã đổi trong khi đang tạo. Mở khóa và thử lại cùng yêu cầu để xác nhận kết quả.'));
        }
      }
    }
  }

  function chooseAgain() {
    if (busy.current) return;
    operation.current = null; operationDisplay.current = null; setSelectionId(''); setMethodIds(emptyMethodIds()); setMethodAnnouncement(''); setPresentation(DEFAULT_PRESENTATION); setStatus('idle'); setFailure(null); setReceipt(null);
    focusSourceAfterReload.current = true;
    setReload(value => value + 1);
  }

  function changeSource(value: string) {
    if (hasMethodSelection(methodIds) && value !== selectionId) setMethodAnnouncement('Đã đặt lại hồ sơ phương pháp về Không dùng vì nguồn đã đổi.');
    setSelectionId(value);
    setMethodIds(emptyMethodIds());
  }

  function renderMethodInputs() {
    if (!inventoryHasMethodInputs) return null;
    return <fieldset className="report-method-inputs">
      <legend>Hồ sơ phương pháp bổ sung (không bắt buộc)</legend>
      <p className="report-limit">Chỉ lấy từ package của nguồn đã chọn. Mỗi loại mặc định là Không dùng.</p>
      <p className="report-limit" role="status" aria-live="polite">{methodAnnouncement}</p>
      {!selected && <p className="report-message">Chọn nguồn trước. Hồ sơ phương pháp chỉ lấy từ package của nguồn đó.</p>}
      {selected && !selected.methodInputs && <div className="report-message"><strong>Package này chưa có hồ sơ phương pháp bổ sung</strong><p>Báo cáo vẫn tạo được như hiện nay.</p></div>}
      {selected?.methodInputs && chosenCandidates.length === 0 && METHOD_FAMILIES.every(family => methodCandidates(selected, family.key).length === 0) && <div className="report-message"><strong>Package này chưa có hồ sơ phương pháp bổ sung</strong><p>Báo cáo vẫn tạo được như hiện nay. Muốn dùng hồ sơ, nhập lại package có kèm file hồ sơ bằng công cụ intake hiện có, rồi tải lại nguồn.</p><button className="button" type="button" onClick={() => setReload(value => value + 1)}>Tải lại nguồn</button></div>}
      {selected?.methodInputs && METHOD_FAMILIES.some(family => methodCandidates(selected, family.key).length > 0) && METHOD_FAMILIES.map(family => {
        const candidates = methodCandidates(selected, family.key);
        const selectedCandidate = candidates.find(candidate => candidate.methodSelectionId === methodIds[family.key]);
        const hintId = `${id}-${family.key}-hint`;
        const fileId = `${id}-${family.key}-file`;
        if (candidates.length === 0) return <div className="report-version-picker" key={family.key}><span>{family.label}</span><small id={hintId}>Package này chưa có hồ sơ loại này.</small></div>;
        return <label className="report-version-picker" htmlFor={`${id}-${family.key}`} key={family.key}>
          {family.label}
          <small id={hintId}>{family.hint}</small>
          <select id={`${id}-${family.key}`} value={methodIds[family.key] ?? ''} disabled={lockedOperation} aria-describedby={[hintId, selectedCandidate ? fileId : ''].filter(Boolean).join(' ')} onChange={event => setMethodIds(current => ({ ...current, [family.key]: event.target.value || null }))}>
            <option value="">Không dùng</option>
            {candidates.map(candidate => <option key={candidate.methodSelectionId} value={candidate.methodSelectionId}>{candidate.logicalPath}</option>)}
          </select>
          {selectedCandidate && <small id={fileId}>File: {selectedCandidate.logicalPath}</small>}
        </label>;
      })}
      {chosenCandidates.length > 0 && <div className="report-limit"><strong>Lưu ý về hồ sơ đã chọn</strong><ul>{[...limitationFamilies].map(([code, families]) => <li key={code}>{LIMITATION_COPY[code] ?? `Có thêm giới hạn chưa có mô tả (${code}).`}{families.length < chosenCandidates.length ? ` (${families.map(family => METHOD_FAMILIES.find(item => item.key === family)!.label).join(', ')})` : ''}</li>)}</ul></div>}
    </fieldset>;
  }

  function renderPresentation() {
    return <fieldset className="report-method-inputs">
      <legend>Cách trình bày báo cáo</legend>
      {REPORT_PRESENTATIONS.map(option => {
        const hintId = `${id}-${option.value}-hint`;
        return <label className="report-presentation-option" key={option.value}>
          <input type="radio" name={`${id}-presentation`} value={option.value} checked={presentation === option.value} disabled={lockedOperation} aria-describedby={hintId} onChange={() => setPresentation(option.value)} />
          <strong>{option.label}</strong>
          <small id={hintId}>{option.hint}</small>
        </label>;
      })}
      <p className="report-limit">Chỉ áp dụng cho báo cáo tạo lần này. Các phiên bản đã lưu giữ nguyên cách trình bày lúc tạo và không được vẽ lại.</p>
    </fieldset>;
  }

  const snapshot = operationDisplay.current;
  return <section className="report-version-summary" aria-labelledby={`${id}-title`}>
    <h4 id={`${id}-title`}>Tạo báo cáo mới</h4>
    <p className="report-limit">Chọn nguồn đã nhập và kiểm tra kỳ dữ liệu. Báo cáo lưu được phần có đủ bằng chứng; các phần còn thiếu vẫn được ghi rõ.</p>
    {!writesAvailable ? <p className="report-prompt">Chế độ hiện tại chưa cho phép tạo báo cáo.</p>
      : !ownerToken ? <p className="report-prompt">Mở khóa OWNER ở đầu trang để chọn nguồn và tạo báo cáo.</p>
        : <>
          {loadState === 'loading' && <p className="report-loading" role="status">Đang kiểm tra danh sách nguồn đã lưu…</p>}
          {loadState === 'error' && <div className="report-message error" role="alert"><p>{loadError}</p><button className="button" type="button" onClick={() => setReload(value => value + 1)}>Tải lại nguồn</button></div>}
          {loadState === 'ready' && inventory?.choices.length === 0 && <div className="report-message"><strong>Chưa có nguồn phù hợp</strong><p>Cần package đã nhập với workbook Metric Shopee Sheet1 và manifest nêu rõ phạm vi, kỳ đo. Nhập nguồn bằng công cụ intake hiện có rồi tải lại.</p><button className="button" type="button" onClick={() => setReload(value => value + 1)}>Tải lại nguồn</button></div>}
          {loadState === 'ready' && inventory && inventory.choices.length > 0 && <form onSubmit={event => { event.preventDefault(); void submit(); }}>
            <label className="report-version-picker" htmlFor={`${id}-source`}>Nguồn cho báo cáo
              <select ref={sourceSelect} id={`${id}-source`} value={selectionId} disabled={lockedOperation} required onChange={event => changeSource(event.target.value)}>
                <option value="">Chọn package và bộ dữ liệu…</option>
                {inventory.choices.map(choice => <option key={choice.selectionId} value={choice.selectionId}>{choice.sourceLabel} · v{choice.packageVersion} · {choice.workbookPath} · {choice.labelsPath ? `Phân loại: ${choice.labelsPath}` : 'Chưa có phân loại'}</option>)}
              </select>
            </label>
            {selected && <div className="report-message">
              <strong>{selected.sourceName}</strong>
              <p>Kỳ dữ liệu: {selected.period.start} đến {selected.period.end}. {selected.period.basis}</p>
              <p>{selected.labelsPath ? 'Có file phân loại. Khi tạo, hệ thống kiểm tra độ phủ trước khi chạy phương pháp quy mô.' : 'Chưa có phân loại: chỉ tạo báo cáo nguồn một phần, chưa chạy phương pháp M03 đã chuẩn bị.'}</p>
              <p>Chưa chọn báo giá theo viên. Báo cáo chưa có nhận định AI và chưa được duyệt.</p>
            </div>}
            {renderMethodInputs()}
            {renderPresentation()}
            {(status !== 'error' || retryable) && <div className="report-actions"><button className="button primary" type="submit" disabled={status === 'pending' || status === 'done' || (!selected && !operation.current)}>{status === 'pending' ? 'Đang tạo báo cáo…' : status === 'error' ? 'Thử lại cùng yêu cầu' : 'Tạo báo cáo mới'}</button></div>}
          </form>}
        </>}
    {snapshot && (snapshot.includeMethodInputs || snapshot.presentation !== DEFAULT_PRESENTATION) && <div className="report-request-snapshot report-version-summary" aria-labelledby={`${id}-request-title`}>
      <h5 id={`${id}-request-title`}>Yêu cầu đã gửi</h5>
      <dl>
        <div><dt>Nguồn</dt><dd>{snapshot.source}</dd></div>
        <div><dt>Kỳ dữ liệu</dt><dd>{snapshot.period}</dd></div>
        <div><dt>Cách trình bày</dt><dd>{REPORT_PRESENTATIONS.find(option => option.value === snapshot.presentation)!.label}</dd></div>
        {snapshot.includeMethodInputs && METHOD_FAMILIES.map(family => <div key={family.key}><dt>{family.label}</dt><dd>{snapshot.families[family.key] ?? 'Không dùng'}</dd></div>)}
      </dl>
    </div>}
    {status === 'pending' && <p className="report-prompt" role="status">{snapshot?.includeMethodInputs ? 'Đang xác minh nguồn, hồ sơ đã chọn và lưu báo cáo. Chỉ gửi một yêu cầu; thao tác này không gọi AI.' : 'Đang xác minh nguồn và lưu báo cáo. Chỉ gửi một yêu cầu; thao tác này không gọi AI.'}</p>}
    {status === 'error' && failure && <div className="report-message error" role="alert"><p>{failure.message}</p>{retryable && <p>{failure.kind === 'integrity' ? 'Bằng chứng lưu trữ chưa vượt qua kiểm tra toàn vẹn. Thử lại cùng yêu cầu; nếu vẫn lỗi, cần kiểm tra package và kho lưu trữ.' : snapshot?.includeMethodInputs ? 'Yêu cầu, nguồn và hồ sơ đã chọn đang được giữ nguyên. Thử lại để xác nhận kết quả, tránh tạo bản trùng.' : 'Yêu cầu và nguồn đang được giữ nguyên. Thử lại để xác nhận kết quả, tránh tạo bản trùng.'}</p>}</div>}
    {status === 'done' && receipt && <div className="report-message" role="status"><strong>Đã lưu báo cáo v{receipt.version}{receipt.exactRetry ? ' từ yêu cầu trước' : ''}.</strong><p>{snapshot?.includeMethodInputs ? `${receipt.profile === 'source-backed-v1' ? 'Báo cáo nguồn một phần; phương pháp M03 đã chuẩn bị chưa chạy.' : 'Báo cáo đã ghép các phương pháp hiện hỗ trợ.'} ${hasMethodSelection(operation.current?.methodSelectionIds ?? emptyMethodIds()) ? `Đã gửi kèm ${Object.values(operation.current?.methodSelectionIds ?? emptyMethodIds()).filter(Boolean).length} hồ sơ phương pháp. ` : ''}Mở báo cáo để xem phần nào có kết quả và phần nào còn thiếu dữ liệu. Bản nháp chưa duyệt.` : `${receipt.profile === 'source-backed-v1' ? 'Báo cáo nguồn một phần; phương pháp M03 đã chuẩn bị chưa chạy.' : 'Báo cáo đã ghép các phương pháp hiện hỗ trợ.'} Bản nháp chưa duyệt.`}</p></div>}
    {canChooseAgain && <div className="report-actions"><button className="button" type="button" onClick={chooseAgain}>{status === 'done' ? 'Chọn nguồn cho báo cáo khác' : failure?.kind === 'method' ? 'Chọn lại nguồn và hồ sơ' : 'Chọn lại nguồn'}</button></div>}
  </section>;
}
