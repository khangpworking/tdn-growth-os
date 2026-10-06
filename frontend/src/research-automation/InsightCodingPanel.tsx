import { useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import InsightCodingDraftEditor from './InsightCodingDraftEditor';
import InsightCodingRuleForm from './InsightCodingRuleForm';
import { SourceRecordView } from './InsightCodingSpanPicker';
import InsightModelProposalPanel from './InsightModelProposalPanel';
import { ResearchAutomationError, type ResearchAutomationRun } from './api';
import {
  acceptInsightCoding, adoptInsightCoding, loadInsightCoding, proposeInsightCoding,
  type InsightCodingAcceptRequest, type InsightCodingAdoptRequest, type InsightCodingProposeRequest, type ResearchInsightCodingMutation,
} from './insight-coding-api';
import {
  MAX_WRITE_BYTES, annotationCount, bodyBytes, buildSelection, canonical, codingHistory, emptyAnnotations, orderedSelection, proposalEntries, proposalProblems,
  recordStateLabels, sectionLabels, selectionKeys,
  type Annotations, type Entry, type Rules, type SourceRecord, type View,
} from './insight-coding-ui';
import { createReportRevision, type AutomationInsightReportRevisionRequest } from './report-revisions-api';
import './insight-coding.css';

type Props = { run: ResearchAutomationRun; pairId: string; versionNumber: number; ownerToken: string | null; disabled: boolean; disabledReason?: string | null;
  reportBlock: string | null; onActivityChanged: () => void; onBusyChanged: (value: boolean) => void };
type Operation = { kind: 'ADOPT'; body: InsightCodingAdoptRequest }
  // records is the verified view the entries were read from, so the dialog never resolves an index against a later reload.
  | { kind: 'PROPOSE'; body: InsightCodingProposeRequest; entries: Entry[]; records: readonly SourceRecord[]; ruleLabel: string; previousLabel: string }
  | { kind: 'ACCEPT'; body: InsightCodingAcceptRequest; entries: Entry[]; records: readonly SourceRecord[]; proposalLabel: string }
  | { kind: 'REPORT'; body: AutomationInsightReportRevisionRequest; proposalLabel: string; receiptLabels: string[] };
type LoadFailure = { kind: ResearchAutomationError['kind'] | 'unknown'; message: string };
const PAGE_SIZE = 30;
const mismatch = () => new ResearchAutomationError('integrity', 'Phản hồi không khớp nội dung đã xác nhận. Chưa chuyển sang bước tiếp theo.');
const sourceKinds = { NATIVE: 'Review gốc đã lưu cùng phiên bản', EXACT_SHOPEE: 'Review Shopee đúng sản phẩm đã lưu' } as const;
const failureCopy = (failure: LoadFailure) => failure.kind === 'notFound' ? `${failure.message} Phiên bản này chưa có nguồn review lưu kèm để mã hóa; bổ sung nguồn review ở một phiên bản mới trước.`
  : failure.kind === 'integrity' ? `${failure.message} Nguồn hoặc lịch sử mã hóa không vượt qua kiểm tra toàn vẹn. Không thao tác tiếp; báo người vận hành kiểm tra.`
    : failure.kind === 'connection' || failure.kind === 'unknown' ? `${failure.message} Chưa kết nối được; tải lại khi có mạng.` : failure.message;

/** The whole stored record behind one entry, in a native disclosure. Toggling only reveals text: no write, selection change or model call. */
function SourceContext({ records, recordIndex }: { records: readonly SourceRecord[]; recordIndex: number }) {
  const record = records[recordIndex];
  // ConfirmDialog cycles Tab over [tabindex] but not summary; the explicit tabIndex keeps the disclosure reachable inside the dialog.
  return <details className="ic-context"><summary tabIndex={0}>Xem toàn văn nguồn</summary>
    {record ? <SourceRecordView record={record} index={recordIndex} />
      : <p className="ra-problem">Bản ghi {recordIndex + 1} không có trong nguồn đã xác minh; không có nội dung thay thế.</p>}</details>;
}

/** The parent keys this panel by exact run/pair; drafts, selections and retries never travel to another report. */
export default function InsightCodingPanel({ run, pairId, versionNumber, ownerToken, disabled, disabledReason, reportBlock, onActivityChanged, onBusyChanged }: Props) {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [tick, setTick] = useState(0);
  const [adoptionId, setAdoptionId] = useState('');
  const [proposalId, setProposalId] = useState('');
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [ruleEditing, setRuleEditing] = useState(false);
  const [editorEditing, setEditorEditing] = useState(false);
  const [draft, setDraft] = useState<Annotations>(emptyAnnotations);
  const [picks, setPicks] = useState<Set<string>>(new Set());
  const [receiptPicks, setReceiptPicks] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<Operation | null>(null);
  const [discard, setDiscard] = useState(false);
  const [discardRule, setDiscardRule] = useState(false);
  const [retry, setRetry] = useState<Operation | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [modelHeld, setModelHeld] = useState(false);
  const mounted = useRef(false), inFlight = useRef(false);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const reload = () => setTick(value => value + 1);

  // The model sequence shares inFlight, so one write of either kind runs at a time.
  const manualHeld = pending || retry !== null || dialog !== null || discard || discardRule;
  const held = manualHeld || modelHeld;
  const draftCount = annotationCount(draft);
  const hasDraft = held || ruleEditing || editorEditing || draftCount > 0 || picks.size > 0 || receiptPicks.size > 0;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onBusyChanged(hasDraft); return () => onBusyChanged(false); }, [hasDraft, onBusyChanged]);
  useEffect(() => {
    if (dialog || discard || discardRule) return;
    // Opening a modal disables the underlying form before ConfirmDialog mounts.
    // Restore the captured opener only after that form has been re-enabled.
    const opener = dialogOpener.current;
    dialogOpener.current = null;
    if (opener?.isConnected) opener.focus();
  }, [dialog, discard, discardRule]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasDraft) event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [hasDraft]);
  useEffect(() => {
    const abort = new AbortController(); let alive = true;
    setLoading(true); setFailure(null);
    void (async () => {
      try {
        const next = await loadInsightCoding(run.workspaceId, run.runId, pairId, abort.signal);
        if (!alive) return;
        setView(next);
      } catch (error) {
        if (!alive || abort.signal.aborted) return;
        // Keep the last verified view mounted so a failed refresh cannot erase
        // local editors. failure blocks every write until a successful reload.
        setFailure(error instanceof ResearchAutomationError ? { kind: error.kind, message: error.message } : { kind: 'unknown', message: 'Chưa đọc được nguồn mã hóa Insight.' });
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; abort.abort(); };
  }, [run.workspaceId, run.runId, pairId, tick]);

  const records = view?.context.input.records ?? [];
  const history: ReturnType<typeof codingHistory> = view ? codingHistory(view) : { adoptions: [], proposals: new Map(), receipts: new Map() };
  const adoption = history.adoptions.find(item => item.evidence.evidenceId === adoptionId);
  const proposals = adoption ? history.proposals.get(adoptionId) ?? [] : [];
  const latestProposal = proposals.find(item => item.latest);
  const proposal = proposals.find(item => item.evidence.evidenceId === proposalId);
  const receipts = proposal ? history.receipts.get(proposalId) ?? [] : [];
  const rules: Rules | undefined = adoption?.request.rules;
  const accepted = new Set(receipts.flatMap(item => selectionKeys(item.request.selection)));
  const entries = proposal && rules ? proposalEntries(proposal.request.annotations, rules, records, accepted) : [];
  const included = records.filter(item => item.disposition === 'INCLUDED').length;
  const ruleLabel = adoption ? `quy tắc bản ${adoption.request.rules.revision}` : '';

  const block = !ownerToken ? 'Mở khóa OWNER để mã hóa Insight. Lịch sử vẫn xem được.' : disabled ? disabledReason ?? 'Chờ xác minh lịch sử và kết thúc lượt bổ sung đang chạy.'
    : loading ? 'Đang đọc nguồn và lịch sử mã hóa.' : failure || !view ? 'Tải lại và xác minh nguồn trước khi tiếp tục.' : !records.length ? 'Nguồn của phiên bản này không có bản ghi nào để mã hóa.' : null;
  const stale = adoption && !adoption.current ? 'Quy tắc này đã có bản mới hơn. Chọn bản mới nhất trước khi đề xuất, duyệt hoặc tạo báo cáo.' : null;
  const draftProblems = rules ? proposalProblems(draft, rules, records) : [];
  const proposeBlock = block ?? (!adoption ? 'Chọn một quy tắc đã duyệt trước.' : stale ?? (draftProblems[0] ?? null));
  const chainBlock = !proposal ? 'Chọn một đề xuất đã lưu.' : stale ?? (!proposal.latest ? 'Đề xuất này đã có bản mới hơn của cùng quy tắc; chỉ còn để xem.' : null);
  const acceptBlock = block ?? chainBlock ?? (!picks.size ? 'Đánh dấu ít nhất một mục để duyệt.' : null);
  const reportChoice = receipts.filter(item => receiptPicks.has(item.evidence.evidenceId));
  const reportGate = block ?? reportBlock ?? chainBlock ?? (!receipts.length ? 'Đề xuất này chưa có biên nhận duyệt nào.' : !reportChoice.length ? 'Chọn biên nhận sẽ đưa vào báo cáo.' : reportChoice.length > 1000 ? 'Vượt giới hạn 1.000 biên nhận một lượt; không tự bỏ bớt.' : null);

  const submit = async (operation: Operation) => {
    if (inFlight.current || !ownerToken || disabled || (!retry && block)) return;
    inFlight.current = true; setPending(true); setNotice('');
    const readAbort = new AbortController();
    const readBack = async (mutation: ResearchInsightCodingMutation, check: (request: unknown) => boolean) => {
      if (!mounted.current) return null;
      const fresh = await loadInsightCoding(run.workspaceId, run.runId, pairId, readAbort.signal);
      const item = fresh.evidence.find(evidence => evidence.evidenceId === mutation.evidenceId);
      if (!item || item.kind !== mutation.kind || !check(item.request)) throw mismatch();
      return { fresh, item };
    };
    try {
      if (operation.kind === 'ADOPT') {
        const mutation = await adoptInsightCoding(run.workspaceId, run.runId, operation.body, ownerToken);
        const read = await readBack(mutation, request => canonical(request) === canonical(operation.body));
        if (!read || !mounted.current) return;
        const { fresh, item } = read;
        setView(fresh); setAdoptionId(item.evidenceId); setProposalId(''); setRuleOpen(false); setRuleEditing(false); setPicks(new Set()); setReceiptPicks(new Set());
        setNotice(`Đã duyệt quy tắc bản ${operation.body.rules.revision}. Chưa có mục mã hóa nào được đề xuất hoặc duyệt.`);
      } else if (operation.kind === 'PROPOSE') {
        const mutation = await proposeInsightCoding(run.workspaceId, run.runId, operation.body, ownerToken);
        const read = await readBack(mutation, request => canonical(request) === canonical(operation.body));
        if (!read || !mounted.current) return;
        const { fresh, item } = read;
        setView(fresh); setProposalId(item.evidenceId); setDraft(emptyAnnotations()); setEditorOpen(false); setEditorEditing(false); setPicks(new Set()); setReceiptPicks(new Set()); setPage(0);
        setNotice(`Đã lưu đề xuất ${item.sequence}. Chưa duyệt mục nào; đánh dấu mục cần duyệt bên dưới.`);
      } else if (operation.kind === 'ACCEPT') {
        const mutation = await acceptInsightCoding(run.workspaceId, run.runId, operation.body, ownerToken);
        const expected = { ...operation.body, selection: orderedSelection(operation.body.selection) };
        const read = await readBack(mutation, request => canonical(request) === canonical(expected));
        if (!read || !mounted.current) return;
        const { fresh, item } = read;
        setView(fresh); setPicks(new Set());
        setNotice(`Đã xác minh biên nhận ${item.sequence}. Báo cáo hiện tại giữ nguyên; tạo phiên bản mới là thao tác riêng.`);
      } else {
        await createReportRevision(run.workspaceId, run.runId, operation.body, ownerToken);
        if (!mounted.current) return;
        setReceiptPicks(new Set());
        setNotice('Đã nhận lượt tạo phiên bản từ mã hóa đã duyệt. Theo dõi trong lịch sử phiên bản; bản cũ giữ nguyên.');
        onActivityChanged();
      }
      if (mounted.current) { setRetry(null); setDialog(null); }
    } catch (error) {
      if (!mounted.current) return;
      setDialog(null);
      if (error instanceof ResearchAutomationError && ['rejected', 'authorization', 'conflict', 'notFound'].includes(error.kind)) {
        setRetry(null);
        setNotice(error.kind === 'conflict' ? `${error.message} Đã tải lại lịch sử; bản nháp vẫn giữ. Chọn lại quy tắc hoặc đề xuất mới nhất trước khi tiếp tục.` : error.message);
        reload(); if (operation.kind === 'REPORT') onActivityChanged();
      } else {
        setRetry(operation);
        setNotice('Chưa xác minh được kết quả thao tác. Thử lại dùng đúng nội dung và mã yêu cầu cũ; không gửi một yêu cầu mới.');
      }
    } finally { inFlight.current = false; readAbort.abort(); if (mounted.current) setPending(false); }
  };

  const open = (operation: Operation) => {
    if (held) return;
    if (operation.kind !== 'REPORT' && bodyBytes(operation.body) > MAX_WRITE_BYTES) { setNotice('Nội dung vượt giới hạn 8 MB của một lần gửi. Chia nhỏ bản nháp; hệ thống không tự cắt.'); return; }
    dialogOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotice(''); setDialog(operation);
  };
  const prepareRule = (next: Rules) => {
    if (block || held || !view) return;
    open({ kind: 'ADOPT', body: { contractVersion: 'insight-coding-adopt-v1', requestKey: crypto.randomUUID(), binding: structuredClone(view.context.binding), rules: next } });
  };
  const prepareProposal = () => {
    if (proposeBlock || held || !adoption || !rules) return;
    open({ kind: 'PROPOSE', ruleLabel, entries: proposalEntries(draft, rules, records), records,
      previousLabel: latestProposal ? `Nối tiếp ${latestProposal.label.toLocaleLowerCase('vi')}, bản mới nhất của ${ruleLabel}.` : `Đề xuất đầu tiên của ${ruleLabel}.`,
      body: { contractVersion: 'insight-coding-propose-v1', requestKey: crypto.randomUUID(), adoptionId, previousProposalId: latestProposal?.evidence.evidenceId ?? null, annotations: structuredClone(draft) } });
  };
  const prepareAcceptance = () => {
    if (acceptBlock || held || !proposal) return;
    const chosen = entries.filter(entry => picks.has(entry.key) && !entry.blocked);
    if (chosen.length !== picks.size) { setNotice('Danh sách mục đã thay đổi. Đánh dấu lại trước khi duyệt.'); return; }
    open({ kind: 'ACCEPT', entries: chosen, records, proposalLabel: proposal.label,
      body: { contractVersion: 'insight-coding-accept-v1', requestKey: crypto.randomUUID(), proposalId, proposalSha256: proposal.evidence.sha256, selection: buildSelection(picks, proposal.request.annotations.i02 !== undefined) } });
  };
  const prepareReport = () => {
    if (reportGate || held || !proposal) return;
    open({ kind: 'REPORT', proposalLabel: proposal.label, receiptLabels: reportChoice.map(item => item.label),
      body: { contractVersion: 'automation-insight-report-revision-v1', requestKey: crypto.randomUUID(), previousPairId: pairId,
        sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
        acceptedInsight: { proposalId, receiptIds: reportChoice.map(item => item.evidence.evidenceId) as [string, ...string[]] } } });
  };
  const chooseAdoption = (value: string) => { setAdoptionId(value); setProposalId(''); setPicks(new Set()); setReceiptPicks(new Set()); setPage(0); setRuleOpen(false); };
  const chooseProposal = (value: string) => { setProposalId(value); setPicks(new Set()); setReceiptPicks(new Set()); setPage(0); };
  const draftLocked = editorEditing || draftCount > 0;
  const modelStartBlock = manualHeld ? 'Đang có thao tác mã hóa khác; chờ xong trước khi tạo đề xuất AI.'
    : ruleEditing ? 'Đang soạn quy tắc. Duyệt hoặc bỏ bản nháp quy tắc trước khi tạo đề xuất AI.'
      : draftLocked ? 'Đang có bản nháp đề xuất. Lưu hoặc bỏ bản nháp trước khi tạo đề xuất AI; hệ thống không tự xóa bản nháp.'
        : picks.size || receiptPicks.size ? 'Đang đánh dấu mục hoặc biên nhận. Duyệt hoặc bỏ đánh dấu trước khi tạo đề xuất AI.' : null;
  const modelVerified = (fresh: View, id: string) => { setView(fresh); setProposalId(id); setPicks(new Set()); setReceiptPicks(new Set()); setPage(0); };
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = entries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const hiddenPicks = [...picks].filter(key => !visible.some(entry => entry.key === key)).length;
  const entryList = (rows: readonly Entry[], source: readonly SourceRecord[]) => <ul className="ic-entries">{rows.map(entry => <li key={entry.key}><p><span className="ic-tag">{sectionLabels[entry.section]}</span> <strong>{entry.title}</strong></p>
    {entry.lines.map((line, at) => <p className="ra-muted" key={at}>{line}</p>)}<SourceContext records={source} recordIndex={entry.recordIndex} /></li>)}</ul>;

  return <section className="ra-classification ic-panel" aria-labelledby="ic-heading">
    <h4 id="ic-heading">Mã hóa Insight theo nguyên văn nguồn</h4>
    <p className="ra-muted">Phiên bản {versionNumber} · {run.definition?.definition} · {run.requestedPeriod.startDate} đến {run.requestedPeriod.endDate}. Duyệt quy tắc, lưu đề xuất, duyệt mục và tạo báo cáo là bốn bước riêng.</p>
    {loading && <p role="status">Đang đọc nguồn và lịch sử mã hóa…</p>}
    {failure && <p role="alert" className="ra-problem">{failureCopy(failure)}</p>}
    <button className="button" type="button" disabled={held} onClick={reload}>Tải lại mã hóa</button>
    {view && <>
      <dl className="ic-facts">
        <div><dt>Nguồn</dt><dd>{sourceKinds[view.context.binding.sourceKind]} · {view.context.input.sources.length} tệp</dd></div>
        <div><dt>Bản ghi</dt><dd>{records.length} bản ghi: {(['INCLUDED', 'EXCLUDED', 'UNREADABLE'] as const).map(state => `${records.filter(item => item.disposition === state).length} ${recordStateLabels[state].toLocaleLowerCase('vi')}`).join(', ')}</dd></div>
        <div><dt>Lịch sử</dt><dd>{history.adoptions.length} quy tắc · {[...history.proposals.values()].flat().length} đề xuất · {[...history.receipts.values()].flat().length} biên nhận. Lịch sử chỉ để đọc.</dd></div>
      </dl>
      {!included && records.length > 0 && <p className="ra-muted">Không có bản ghi nào được đưa vào, nên chưa thể đề xuất mã hóa từ nguồn này.</p>}

      <label className="ra-label" htmlFor="ic-rule">Quy tắc mã hóa đã duyệt<select className="ra-field" id="ic-rule" value={adoptionId} disabled={held || draftLocked || ruleEditing} onChange={event => chooseAdoption(event.target.value)}>
        <option value="">Chọn quy tắc</option>{history.adoptions.map(item => <option key={item.evidence.evidenceId} value={item.evidence.evidenceId}>{item.label}{item.current ? '' : ' · đã có bản mới hơn'}</option>)}</select></label>
      {draftLocked && <p className="ra-muted">Đang có bản nháp theo {ruleLabel || 'quy tắc này'}. Lưu đề xuất hoặc bỏ bản nháp trước khi đổi quy tắc.</p>}
      {ruleEditing && <p className="ra-muted">Bản nháp quy tắc được giữ khi thu gọn. Duyệt hoặc bỏ bản nháp trước khi đổi quy tắc.</p>}
      {!history.adoptions.length && <p className="ra-muted">Chưa có quy tắc mã hóa nào. Soạn câu hỏi, tiêu chí và cách phân xử trước; hệ thống không tự đặt quy tắc.</p>}
      {adoption && <details><summary>Xem nội dung {ruleLabel}</summary><dl className="ic-facts">
        <div><dt>Câu hỏi</dt><dd>{adoption.request.rules.question}</dd></div><div><dt>Tiêu chí đưa vào</dt><dd>{adoption.request.rules.inclusionRule}</dd></div>
        <div><dt>Cách phân xử</dt><dd>{adoption.request.rules.adjudicationRule}</dd></div></dl>
        {adoption.request.rules.corpora.length ? <ul>{adoption.request.rules.corpora.map((corpus, at) => <li key={at}>Kho {at + 1} · {sectionLabels[corpus.sectionId]}: {corpus.question} · {corpus.recordIndexes.length} bản ghi · {corpus.codebook.codes.length} mã ({corpus.codebook.codes.map(code => code.label).join(', ') || 'chưa có mã'}) · Kỳ: {corpus.period ?? 'chưa khai báo'} · Khung: {corpus.frame ?? 'chưa khai báo'}{corpus.sectionId === 'I13' ? ` · Kênh: ${corpus.channel ?? 'chưa khai báo'}` : ''} · {corpus.membershipComplete ? 'Danh sách đã xác nhận đầy đủ' : 'Danh sách chưa xác nhận đầy đủ'}</li>)}</ul>
          : <p className="ra-muted">Quy tắc không có kho I10/I13.</p>}</details>}
      {stale && <p className="ra-muted">{stale}</p>}
      <button type="button" className="button" disabled={held || Boolean(block) || draftLocked || Boolean(adoption && !adoption.current)} aria-expanded={ruleOpen} onClick={() => { setRuleEditing(true); setRuleOpen(value => !value); }}>{ruleOpen ? 'Đóng soạn quy tắc mã hóa' : adoption ? 'Soạn bản quy tắc mã hóa tiếp theo' : 'Soạn quy tắc mã hóa'}</button>
      {ruleEditing && <>
        <button type="button" className="button" disabled={held} onClick={event => { dialogOpener.current = event.currentTarget; setDiscardRule(true); }}>Bỏ bản nháp quy tắc</button>
        <div hidden={!ruleOpen}><InsightCodingRuleForm key={adoptionId || 'new'} records={records} {...(rules ? { existing: rules } : {})} disabled={Boolean(block) || held} onPrepare={prepareRule} /></div>
      </>}

      {adoption && <>
        <h5>Đề xuất mã hóa</h5>
        <label className="ra-label" htmlFor="ic-proposal">Đề xuất đã lưu<select className="ra-field" id="ic-proposal" value={proposalId} disabled={held} onChange={event => chooseProposal(event.target.value)}>
          <option value="">Chọn đề xuất</option>{proposals.map(item => <option key={item.evidence.evidenceId} value={item.evidence.evidenceId}>{item.label}{item.latest ? ' · mới nhất' : ''}</option>)}</select></label>
        {!proposals.length && <p className="ra-muted">Quy tắc này chưa có đề xuất. Soạn bản nháp từ các đoạn nguyên văn.</p>}
        <div className="ra-actions">
          <button type="button" className="button" disabled={held || Boolean(block) || Boolean(stale) || ruleEditing} aria-expanded={editorOpen} onClick={() => { setEditorEditing(true); setEditorOpen(value => !value); }}>{editorOpen ? 'Thu gọn bản nháp' : 'Soạn bản nháp đề xuất'}</button>
          <button type="button" className="button" disabled={held || !proposal || draftLocked || ruleEditing} onClick={() => { if (proposal) { setDraft(structuredClone(proposal.request.annotations)); setEditorEditing(true); setEditorOpen(true); } }}>Chép đề xuất đang xem vào bản nháp</button>
          <button type="button" className="button" disabled={held || (!draftCount && !editorEditing)} onClick={event => { dialogOpener.current = event.currentTarget; setDiscard(true); }}>Bỏ bản nháp</button>
        </div>
        {editorEditing && rules && <div hidden={!editorOpen}><InsightCodingDraftEditor records={records} rules={rules} draft={draft} disabled={held || Boolean(block) || Boolean(stale)} onChange={setDraft} /></div>}
        <InsightModelProposalPanel key={adoptionId} run={run} pairId={pairId} versionNumber={versionNumber} ownerToken={ownerToken} view={view} adoption={adoption} ruleLabel={ruleLabel}
          block={block ?? stale} startBlock={modelStartBlock} inFlight={inFlight} onBusyChanged={setModelHeld} onVerified={modelVerified} onReload={reload} />
        {draftCount > 0 && <>
          {draftProblems.length > 0 && <div className="ra-problem" role="alert"><p>Chưa thể lưu đề xuất:</p><ul>{draftProblems.map(item => <li key={item}>{item}</li>)}</ul></div>}
          <button type="button" className="button primary" disabled={held || Boolean(proposeBlock)} onClick={prepareProposal}>Xem lại và lưu đề xuất</button>
        </>}

        {proposal && <>
          <h5>Duyệt mục của {proposal.label.toLocaleLowerCase('vi')}</h5>
          {!proposal.latest && <p className="ra-muted">Đề xuất này đã có bản mới hơn; chỉ còn để xem.</p>}
          <p className="ra-muted">Đã đánh dấu {picks.size} mục, trong đó {hiddenPicks} mục ở trang khác. Mục không đánh dấu vẫn ở trạng thái chờ; kho không bị thu nhỏ theo mục đã duyệt.</p>
          {!entries.length && <p className="ra-muted">Đề xuất không có mục nào.</p>}
          <ul className="ic-entries">{visible.map(entry => <li key={entry.key}>
            <label className="ra-check"><input type="checkbox" aria-label={`Chọn ${entry.title}`} checked={picks.has(entry.key)} disabled={held || Boolean(block) || Boolean(chainBlock) || Boolean(entry.blocked)}
              onChange={event => setPicks(prior => { const next = new Set(prior); if (event.target.checked) next.add(entry.key); else next.delete(entry.key); return next; })} />
              <span><span className="ic-tag">{sectionLabels[entry.section]}</span> <strong>{entry.title}</strong></span></label>
            {entry.lines.map((line, at) => <p className="ra-muted" key={at}>{line}</p>)}{entry.blocked && <p className="ic-hold">{entry.blocked}</p>}
            <SourceContext records={records} recordIndex={entry.recordIndex} /></li>)}</ul>
          {entries.length > PAGE_SIZE && <nav className="ra-actions" aria-label="Trang mục đề xuất"><button className="button" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Trang trước</button><span>Trang {currentPage + 1}/{pageCount}</span><button className="button" type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Trang sau</button></nav>}
          <div className="ra-actions">
            <button type="button" className="button" disabled={held || !picks.size} onClick={() => setPicks(new Set())}>Bỏ đánh dấu tất cả</button>
            <button type="button" className="button primary" disabled={held || Boolean(acceptBlock)} onClick={prepareAcceptance}>Xem xác nhận duyệt mục</button>
          </div>

          <h5>Tạo phiên bản báo cáo từ mã hóa đã duyệt</h5>
          {!receipts.length ? <p className="ra-muted">Chưa có biên nhận duyệt nào cho đề xuất này.</p> : <fieldset className="ic-receipts"><legend>Biên nhận đưa vào báo cáo</legend>
            {receipts.map(item => <label className="ra-check" key={item.evidence.evidenceId}><input type="checkbox" checked={receiptPicks.has(item.evidence.evidenceId)} disabled={held || Boolean(block) || Boolean(chainBlock)}
              onChange={event => setReceiptPicks(prior => { const next = new Set(prior); if (event.target.checked) next.add(item.evidence.evidenceId); else next.delete(item.evidence.evidenceId); return next; })} /> {item.label}</label>)}
          </fieldset>}
          <p className="ra-muted">Chỉ biên nhận bạn chọn được đưa vào; mục chưa duyệt vẫn hiện là chờ trong báo cáo mới.</p>
          <button type="button" className="button" disabled={held || Boolean(reportGate)} onClick={prepareReport}>Tạo bản báo cáo từ mã hóa đã duyệt</button>
          {reportGate && !block && <p className="ra-muted">{reportGate}</p>}
        </>}
      </>}
    </>}
    {block && <p className="ra-muted">{block}</p>}
    {!block && proposeBlock && adoption && draftCount > 0 && !draftProblems.length && <p className="ra-muted">{proposeBlock}</p>}
    {!block && proposal && acceptBlock && <p className="ra-muted">{acceptBlock}</p>}
    {pending && <p role="status">Đang gửi và xác minh…</p>}
    {notice && <p role="status">{notice}</p>}
    {retry && <button type="button" className="button" disabled={pending || !ownerToken || disabled} onClick={() => void submit(retry)}>Thử lại đúng thao tác</button>}
    {discardRule && <ConfirmDialog titleId="ic-discard-rule-title" title="Bỏ bản nháp quy tắc?" confirmLabel="Bỏ bản nháp quy tắc" onCancel={() => setDiscardRule(false)}
      onConfirm={() => { setRuleEditing(false); setRuleOpen(false); setDiscardRule(false); }}><p>Chỉ bỏ nội dung quy tắc đang soạn trên trang này. Quy tắc đã duyệt và lịch sử vẫn giữ nguyên.</p></ConfirmDialog>}
    {discard && <ConfirmDialog titleId="ic-discard-title" title={`Bỏ bản nháp ${draftCount} mục và phần đang soạn?`} confirmLabel="Bỏ bản nháp" onCancel={() => setDiscard(false)}
      onConfirm={() => { setDraft(emptyAnnotations()); setEditorOpen(false); setEditorEditing(false); setDiscard(false); }}><p>Bản nháp chỉ nằm trên trang này. Bỏ đi không ảnh hưởng quy tắc, đề xuất hay biên nhận đã lưu.</p></ConfirmDialog>}
    {dialog && <ConfirmDialog titleId="ic-confirm-title" confirmLabel="Xác nhận" pending={pending} onCancel={() => setDialog(null)} onConfirm={() => void submit(dialog)}
      title={dialog.kind === 'ADOPT' ? `Duyệt quy tắc mã hóa bản ${dialog.body.rules.revision}?` : dialog.kind === 'PROPOSE' ? `Lưu đề xuất ${dialog.entries.length} mục?` : dialog.kind === 'ACCEPT' ? `Duyệt ${dialog.entries.length} mục đã chọn?` : 'Tạo bản báo cáo từ mã hóa đã duyệt?'}>
      <div className="ic-dialog-body">{dialog.kind === 'ADOPT' ? <>
        <p>Quy tắc gắn đúng nguồn của phiên bản {versionNumber}. Chưa đề xuất hay duyệt mục nào.</p>
        <dl className="ic-facts"><div><dt>Câu hỏi</dt><dd>{dialog.body.rules.question}</dd></div><div><dt>Tiêu chí đưa vào</dt><dd>{dialog.body.rules.inclusionRule}</dd></div><div><dt>Cách phân xử</dt><dd>{dialog.body.rules.adjudicationRule}</dd></div></dl>
        {dialog.body.rules.corpora.length ? <ul>{dialog.body.rules.corpora.map((corpus, at) => <li key={at}>Kho {at + 1} · {sectionLabels[corpus.sectionId]}: {corpus.recordIndexes.length} bản ghi, {corpus.codebook.codes.length} mã{corpus.codebook.codes.length ? ` (${corpus.codebook.codes.map(code => code.label).join(', ')})` : ''}. {corpus.membershipComplete ? 'Danh sách đã xác nhận đầy đủ.' : 'Danh sách chưa xác nhận đầy đủ; kho chưa ra tỷ lệ.'}</li>)}</ul> : <p>Không có kho I10/I13.</p>}
      </> : dialog.kind === 'PROPOSE' ? <><p>{dialog.previousLabel} Đề xuất chỉ lưu khai báo; chưa duyệt mục nào và chưa tạo báo cáo.</p>{entryList(dialog.entries, dialog.records)}</>
        : dialog.kind === 'ACCEPT' ? <><p>{dialog.proposalLabel}. Danh sách gồm mọi mục đã đánh dấu, kể cả mục ở trang khác. Mục khác vẫn chờ; kho giữ nguyên thành viên; báo cáo cũ không đổi.</p>{entryList(dialog.entries, dialog.records)}</>
          : <><p>Tạo cặp báo cáo mới từ {dialog.proposalLabel.toLocaleLowerCase('vi')} và đúng {dialog.receiptLabels.length} biên nhận dưới đây. Giữ nguồn số liệu và nguồn review của phiên bản {versionNumber}; không thu nguồn mới. Bản cũ giữ nguyên.</p><ul>{dialog.receiptLabels.map(label => <li key={label}>{label}</li>)}</ul></>}</div>
    </ConfirmDialog>}
  </section>;
}
