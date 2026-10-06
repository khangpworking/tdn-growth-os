import { useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import MetricRuleForm from './MetricRuleForm';
import { ResearchAutomationError, type ResearchAutomationRun } from './api';
import {
  adoptMetricRule, loadMetricRuleAdoptions, loadMetricMembershipReview, proposeMetricMembership,
  loadMetricMembershipProposal, acceptMetricMembership, loadMetricMembershipReceipt,
  type AutomationMetricRuleAdoptionReceipt, type AutomationMetricRuleAdoptionRequest,
  type MetricMembershipProposeRequest, type MetricMembershipAcceptRequest, type ResearchMetricMembershipReview,
} from './metric-membership-api';
import { createReportRevision, type AutomationClassifiedReportRevisionRequest } from './report-revisions-api';

type Props = { run: ResearchAutomationRun; pairId: string; versionNumber: number; ownerToken: string | null;
  disabled: boolean; disabledReason?: string | null; onActivityChanged: () => void; onBusyChanged: (value: boolean) => void };
type Assignment = MetricMembershipProposeRequest['assignments'][number];
type Row = ResearchMetricMembershipReview['records'][number];
type SelectedRow = Assignment & { title: string; locator: string };
type Rule = AutomationMetricRuleAdoptionRequest['rulebook'];
type Operation = { kind: 'RULE'; body: AutomationMetricRuleAdoptionRequest }
  | { kind: 'PROPOSE'; body: MetricMembershipProposeRequest; rows: SelectedRow[] }
  | { kind: 'ACCEPT'; body: MetricMembershipAcceptRequest; rows: SelectedRow[] }
  | { kind: 'REPORT'; body: AutomationClassifiedReportRevisionRequest };
const labels: Record<Assignment['classification'], string> = {
  CORE_CANDIDATE: 'Ứng viên cốt lõi', ADJACENT: 'Liền kề', OUTSIDE: 'Ngoài phạm vi', UNKNOWN: 'Chưa xác định',
};
const classKeys = Object.keys(labels) as Assignment['classification'][];
const PAGE_SIZE = 20;
const sameKeys = (a: readonly string[], b: readonly string[]) => [...a].sort().join(',') === [...b].sort().join(',');
const ruleIdentity = (rule: Rule) => JSON.stringify([rule.ruleId, rule.revision, rule.title,
  classKeys.map(key => rule.definitions[key]), rule.groups.map(group => [group.key, group.label, group.definition]), rule.wideUnknownPolicy]);
const failureMessage = (error: unknown) => error instanceof ResearchAutomationError ? error.message : 'Chưa xác minh được kết quả. Hãy thử lại đúng thao tác.';
const mismatch = () => new ResearchAutomationError('integrity', 'Phản hồi không khớp nội dung đã xác nhận. Chưa chuyển sang bước tiếp theo.');

/** The parent keys this panel by exact run/pair; selections never travel to a different report. */
export default function MetricClassificationPanel({ run, pairId, versionNumber, ownerToken, disabled, disabledReason, onActivityChanged, onBusyChanged }: Props) {
  const [adoptions, setAdoptions] = useState<AutomationMetricRuleAdoptionReceipt[]>([]);
  const [adoptionId, setAdoptionId] = useState('');
  const [review, setReview] = useState<ResearchMetricMembershipReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tick, setTick] = useState(0);
  const [editingRule, setEditingRule] = useState(false);
  const [choices, setChoices] = useState<Record<string, { classification: string; group: string }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [dialog, setDialog] = useState<Operation | null>(null);
  const [retry, setRetry] = useState<Operation | null>(null);
  const [prepared, setPrepared] = useState<Extract<Operation, { kind: 'ACCEPT' }> | null>(null);
  const [pending, setPending] = useState(false);
  const mounted = useRef(false), inFlight = useRef(false);
  const held = pending || retry !== null || dialog !== null || prepared !== null;
  const selectedRule = adoptions.find(item => item.adoptionId === adoptionId);
  const staleRule = Boolean(selectedRule && adoptions.some(item => item.rulebook.ruleId === selectedRule.rulebook.ruleId && item.rulebook.revision > selectedRule.rulebook.revision));
  const block = !ownerToken ? 'Mở khóa OWNER để duyệt phân loại.' : disabled ? disabledReason ?? 'Chờ xác minh lịch sử và kết thúc lượt bổ sung đang chạy.'
    : loading ? 'Đang đọc quy tắc và các dòng đã duyệt.' : error ? 'Tải lại dữ liệu trước khi tiếp tục.' : staleRule ? 'Quy tắc này có bản mới hơn. Chọn bản mới trước khi duyệt.' : null;
  const reload = () => setTick(value => value + 1);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const hasDraft = held || editingRule || selected.size > 0;
  useEffect(() => { onBusyChanged(hasDraft); return () => onBusyChanged(false); }, [hasDraft, onBusyChanged]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasDraft) event.preventDefault(); };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [hasDraft]);
  useEffect(() => {
    const abort = new AbortController(); let alive = true;
    setLoading(true); setError(''); setReview(null);
    void (async () => {
      try {
        const rules = await loadMetricRuleAdoptions(run.workspaceId, run.runId, abort.signal);
        if (!alive) return;
        setAdoptions(rules.adoptions);
        if (adoptionId) {
          if (!rules.adoptions.some(item => item.adoptionId === adoptionId)) throw mismatch();
          const next = await loadMetricMembershipReview(run.workspaceId, run.runId, pairId, adoptionId, abort.signal);
          if (!alive) return;
          setReview(next);
          setSelected(prior => new Set([...prior].filter(key => next.records.some(row => row.recordKey === key && row.state === 'PENDING'))));
        }
      } catch (failure) { if (alive && !abort.signal.aborted) setError(failureMessage(failure)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; abort.abort(); };
  }, [run.workspaceId, run.runId, pairId, adoptionId, tick]);

  const submit = async (operation: Operation) => {
    if (inFlight.current || !ownerToken || disabled || (!retry && block)) return;
    inFlight.current = true; setPending(true); setNotice('');
    const readAbort = new AbortController();
    try {
      if (operation.kind === 'RULE') {
        const receipt = await adoptMetricRule(run.workspaceId, run.runId, operation.body, ownerToken);
        if (ruleIdentity(receipt.rulebook) !== ruleIdentity(operation.body.rulebook)) throw mismatch();
        if (!mounted.current) return;
        setAdoptionId(receipt.adoptionId); setEditingRule(false); setChoices({}); setSelected(new Set());
        setNotice('Đã duyệt quy tắc. Các dòng sản phẩm vẫn cần được chọn và duyệt riêng.');
      } else if (operation.kind === 'PROPOSE') {
        const receipt = await proposeMetricMembership(run.workspaceId, run.runId, operation.body, ownerToken);
        const proposal = await loadMetricMembershipProposal(run.workspaceId, run.runId, receipt.id, readAbort.signal);
        if (proposal.pairId !== pairId || proposal.adoptionId !== operation.body.adoptionId ||
            proposal.assignments.length !== operation.rows.length || operation.rows.some(row => !proposal.assignments.some(a =>
              a.recordKey === row.recordKey && a.classification === row.classification && a.group === row.group))) throw mismatch();
        if (!mounted.current) return;
        setPrepared({ kind: 'ACCEPT', rows: operation.rows, body: { contractVersion: 'metric-membership-accept-v1', requestKey: crypto.randomUUID(),
          proposalId: proposal.proposalId, selectedRecordKeys: operation.rows.map(row => row.recordKey) as [string, ...string[]] } });
        setNotice('Đã lưu đề xuất, chưa duyệt dòng nào. Xem lại toàn bộ các dòng đã chọn trước khi xác nhận.');
      } else if (operation.kind === 'ACCEPT') {
        const mutation = await acceptMetricMembership(run.workspaceId, run.runId, operation.body, ownerToken);
        const receipt = await loadMetricMembershipReceipt(run.workspaceId, run.runId, mutation.id, readAbort.signal);
        if (receipt.proposalId !== operation.body.proposalId || !sameKeys(receipt.selectedRecordKeys, operation.body.selectedRecordKeys)) throw mismatch();
        if (!mounted.current) return;
        setPrepared(null); setSelected(new Set()); setChoices({});
        setNotice('Đã xác minh biên nhận. Bản báo cáo hiện tại giữ nguyên; tạo phiên bản mới là thao tác riêng.');
      } else {
        await createReportRevision(run.workspaceId, run.runId, operation.body, ownerToken);
        if (!mounted.current) return;
        setNotice('Đã nhận lượt tính từ phân loại đã duyệt. Theo dõi trong lịch sử phiên bản; bản cũ giữ nguyên.');
        onActivityChanged();
      }
      if (mounted.current) { setRetry(null); setDialog(null); reload(); }
    } catch (failure) {
      if (!mounted.current) return;
      setDialog(null);
      if (failure instanceof ResearchAutomationError && ['rejected', 'authorization', 'conflict', 'notFound'].includes(failure.kind)) {
        setRetry(null); setPrepared(null); setNotice(failure.message); reload(); onActivityChanged();
      } else {
        setRetry(operation);
        setNotice('Chưa xác minh được kết quả thao tác. Thử lại dùng đúng nội dung và mã yêu cầu cũ; không gửi một yêu cầu mới.');
      }
    } finally { inFlight.current = false; if (mounted.current) setPending(false); }
  };

  const prepareRows = () => {
    if (block || held || !review || !selectedRule || selected.size < 1 || selected.size > 100) return;
    const rows: SelectedRow[] = [];
    for (const row of review.records.filter(item => selected.has(item.recordKey))) {
      const choice = choices[row.recordKey];
      if (row.state !== 'PENDING' || !choice || !classKeys.includes(choice.classification as Assignment['classification']) || !selectedRule.rulebook.groups.some(g => g.key === choice.group)) {
        setNotice('Chọn phân loại và nhóm cho từng dòng đã đánh dấu, kể cả dòng đang ẩn bởi bộ lọc.'); return;
      }
      rows.push({ recordKey: row.recordKey, classification: choice.classification as Assignment['classification'], group: choice.group, title: row.title, locator: row.locator });
    }
    if (rows.length !== selected.size) { setNotice('Danh sách nguồn đã thay đổi. Tải lại trước khi chọn.'); return; }
    const operation: Operation = { kind: 'PROPOSE', rows, body: { contractVersion: 'metric-membership-propose-v1', requestKey: crypto.randomUUID(), pairId,
      adoptionId, assignments: rows.map(({ recordKey, classification, group }) => ({ recordKey, classification, group })) as MetricMembershipProposeRequest['assignments'] } };
    void submit(operation);
  };
  const matching = review?.records.filter(row => `${row.title} ${row.category} ${row.shopId} ${row.listingId}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))) ?? [];
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = matching.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const hiddenSelected = [...selected].filter(key => !visible.some(row => row.recordKey === key)).length;
  const updateChoice = (row: Row, change: Partial<{ classification: string; group: string }>) => setChoices(prior => ({ ...prior,
    [row.recordKey]: { classification: '', group: '', ...prior[row.recordKey], ...change } }));
  const selectedRows = (rows: SelectedRow[]) => <ul className="ra-classification-confirm">{rows.map(row => <li key={row.recordKey}>
    <strong>{row.title}</strong><p>{labels[row.classification]} · {selectedRule?.rulebook.groups.find(g => g.key === row.group)?.label ?? row.group}</p><small>Nguồn: {row.locator}</small>
  </li>)}</ul>;

  return <section className="ra-classification" aria-labelledby="ra-classification-heading">
    <h4 id="ra-classification-heading">Phân loại mẫu để tính báo cáo</h4>
    <p className="ra-muted">Phiên bản {versionNumber} · {run.definition?.definition} · {run.requestedPeriod.startDate} đến {run.requestedPeriod.endDate}. Duyệt quy tắc không tự duyệt sản phẩm.</p>
    {loading && <p role="status">Đang đọc quy tắc và các dòng đã duyệt…</p>}
    {error && <p role="alert" className="ra-problem">{error} Nếu bản này chưa có bảng số liệu hợp lệ, bổ sung nguồn trước khi phân loại.</p>}
    <button className="button" type="button" disabled={held} onClick={reload}>Tải lại phân loại</button>
    <label className="ra-label" htmlFor="ra-classification-rule">Quy tắc đã duyệt<select className="ra-field" id="ra-classification-rule" value={adoptionId} disabled={held || loading}
      onChange={event => { setAdoptionId(event.target.value); setSelected(new Set()); setChoices({}); setPage(0); setEditingRule(false); }}>
      <option value="">Chọn quy tắc</option>{adoptions.map(item => <option key={item.adoptionId} value={item.adoptionId}>{item.rulebook.title} · bản {item.rulebook.revision}</option>)}</select></label>
    {!loading && !adoptions.length && <p className="ra-muted">Chưa có quy tắc đã duyệt. Nhập định nghĩa và nhóm trước; hệ thống không tự đặt quy tắc theo tên sản phẩm.</p>}
    {selectedRule && <details><summary>Xem định nghĩa và nhóm của quy tắc</summary><dl>{classKeys.map(key => <div key={key}><dt>{labels[key]}</dt><dd>{selectedRule.rulebook.definitions[key]}</dd></div>)}</dl>
      <ul>{selectedRule.rulebook.groups.map(group => <li key={group.key}><strong>{group.label}:</strong> {group.definition}</li>)}</ul></details>}
    <button type="button" className="button" disabled={held || !ownerToken || disabled || loading} onClick={() => setEditingRule(value => !value)}>{editingRule ? 'Đóng soạn quy tắc' : selectedRule ? 'Soạn bản quy tắc tiếp theo' : 'Soạn quy tắc'}</button>
    {editingRule && <MetricRuleForm key={adoptionId || 'new'} {...(selectedRule ? { existing: selectedRule.rulebook } : {})} disabled={Boolean(block) || held} onPrepare={rulebook => {
      if (block || held) return;
      setDialog({ kind: 'RULE', body: { contractVersion: 'automation-metric-rule-adopt-v1', requestKey: crypto.randomUUID(), expectedRevision: run.revision, rulebook } });
    }} />}
    {review && <>
      <p><strong>{review.acceptedCount}/{review.recordCount} dòng đã duyệt</strong> · {review.pendingCount} dòng chờ. Chưa xác định vẫn phải được duyệt và không tính vào WIDE.</p>
      <label className="ra-label" htmlFor="ra-classification-search">Tìm trong mẫu nguồn<input className="ra-field" id="ra-classification-search" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
      <p className="ra-muted">Đã chọn {selected.size} dòng, trong đó {hiddenSelected} dòng không ở trang đang xem. Tối đa 100 dòng mỗi lượt; bộ lọc không thay đổi lựa chọn.</p>
      <button type="button" className="button" disabled={held || !selected.size} onClick={() => setSelected(new Set())}>Bỏ chọn tất cả</button>
      {!matching.length && <p className="ra-muted">{review.recordCount ? 'Không có dòng khớp bộ lọc. Xóa từ khóa để xem lại mẫu.' : 'Mẫu nguồn không có dòng nào; chưa thể tạo báo cáo phân loại.'}</p>}
      <ul className="ra-classification-rows">{visible.map(row => <li key={row.recordKey}>
        <label className="ra-classification-choice"><input type="checkbox" checked={selected.has(row.recordKey)} aria-label={`Chọn ${row.title}`} disabled={Boolean(block) || held || row.state === 'ACCEPTED' || (selected.size >= 100 && !selected.has(row.recordKey))}
          onChange={event => setSelected(prior => { const next = new Set(prior); if (event.target.checked) next.add(row.recordKey); else next.delete(row.recordKey); return next; })} /><strong>{row.title}</strong></label>
        <p className="ra-muted">{row.category || 'Nguồn không có ngành hàng'} · Nguồn: {row.locator}</p>
        {row.state === 'ACCEPTED' ? <p>Đã duyệt: {labels[row.classification!]} · {selectedRule?.rulebook.groups.find(group => group.key === row.group)?.label ?? row.group}</p> :
          <div className="ra-classification-fields"><label className="ra-label">Phân loại<select className="ra-field" aria-label={`Phân loại ${row.title}`} value={choices[row.recordKey]?.classification ?? ''} disabled={Boolean(block) || held} onChange={event => updateChoice(row, { classification: event.target.value })}>
            <option value="">Chưa chọn</option>{classKeys.map(key => <option key={key} value={key}>{labels[key]}</option>)}</select></label>
            <label className="ra-label">Nhóm<select className="ra-field" aria-label={`Nhóm ${row.title}`} value={choices[row.recordKey]?.group ?? ''} disabled={Boolean(block) || held} onChange={event => updateChoice(row, { group: event.target.value })}>
              <option value="">Chưa chọn</option>{selectedRule?.rulebook.groups.map(group => <option key={group.key} value={group.key}>{group.label}</option>)}</select></label></div>}
      </li>)}</ul>
      {matching.length > PAGE_SIZE && <nav className="ra-actions" aria-label="Trang mẫu nguồn"><button className="button" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Trang trước</button><span>Trang {currentPage + 1}/{pageCount}</span><button className="button" type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Trang sau</button></nav>}
      <button type="button" className="button primary" disabled={Boolean(block) || held || !selected.size} onClick={prepareRows}>Lưu đề xuất và xem lại lựa chọn</button>
      {prepared && <div><p>Đề xuất đã lưu, chưa được duyệt. Xác nhận áp dụng đúng {prepared.rows.length} dòng đã chọn.</p>{selectedRows(prepared.rows)}<div className="ra-actions">
        <button className="button" type="button" disabled={pending || Boolean(retry)} onClick={() => setPrepared(null)}>Quay lại lựa chọn</button>
        <button className="button primary" type="button" disabled={Boolean(block) || pending || Boolean(retry)} onClick={() => setDialog(prepared)}>Xem xác nhận duyệt</button></div></div>}
      {!review.complete && <p className="ra-muted">Cần duyệt đủ {review.pendingCount} dòng còn lại trước khi tính mẫu phân loại. Các dòng chưa chọn vẫn chờ duyệt.</p>}
      {review.acceptedReceiptIds.length > 1000 && <p role="alert">Mẫu này vượt giới hạn 1.000 biên nhận của một lượt tính. Chưa thể gửi; không tự bỏ bớt biên nhận.</p>}
      <button type="button" className="button" disabled={Boolean(block) || held || !review.complete || review.acceptedReceiptIds.length > 1000} onClick={() => {
        if (block || held || !review.complete || !review.acceptedReceiptIds.length) return;
        setDialog({ kind: 'REPORT', body: { contractVersion: 'automation-classified-report-revision-v1', requestKey: crypto.randomUUID(), previousPairId: pairId,
          sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, acceptedMetric: { adoptionId, receiptIds: [...review.acceptedReceiptIds] as [string, ...string[]] } } });
      }}>Tạo bản báo cáo từ phân loại đã duyệt</button>
    </>}
    {block && <p className="ra-muted">{block}</p>}
    {notice && <p role="status">{notice}</p>}
    {retry && <button type="button" className="button" disabled={pending || !ownerToken || disabled} onClick={() => void submit(retry)}>Thử lại đúng thao tác</button>}
    {dialog && <ConfirmDialog titleId="ra-classification-confirm-title" title={dialog.kind === 'RULE' ? 'Duyệt quy tắc phân loại?' : dialog.kind === 'ACCEPT' ? `Duyệt ${dialog.rows.length} dòng đã chọn?` : 'Tạo bản báo cáo phân loại mới?'}
      confirmLabel="Xác nhận" pending={pending} onCancel={() => setDialog(null)} onConfirm={() => void submit(dialog)}>
      <div className="ra-classification-dialog-body">{dialog.kind === 'RULE' ? <><p>{dialog.body.rulebook.title} · bản {dialog.body.rulebook.revision}. Quy tắc gắn với phạm vi đang xem; chưa duyệt dòng sản phẩm nào.</p><dl>{classKeys.map(key => <div key={key}><dt>{labels[key]}</dt><dd>{dialog.body.rulebook.definitions[key]}</dd></div>)}</dl><ul>{dialog.body.rulebook.groups.map(group => <li key={group.key}>{group.label}: {group.definition}</li>)}</ul></>
        : dialog.kind === 'ACCEPT' ? <><p>Quy tắc {selectedRule?.rulebook.title} · bản {selectedRule?.rulebook.revision}. Danh sách bao gồm mọi dòng đã chọn, kể cả dòng bị bộ lọc ẩn. Dòng khác vẫn chờ duyệt; báo cáo cũ không đổi.</p>{selectedRows(dialog.rows)}</>
        : <p>Tạo cặp báo cáo mới từ toàn bộ mẫu đã duyệt của phiên bản {versionNumber}. Giữ đúng nguồn Metric và review đã lưu; không thu nguồn hoặc gọi lại AI Insight. Phạm vi và bản cũ giữ nguyên.</p>}</div>
    </ConfirmDialog>}
  </section>;
}
