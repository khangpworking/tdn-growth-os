import { useEffect, useState } from 'react';
import type { ResearchAutomationReaderRevisionV2, ResearchAutomationShopeeReaderRevision } from '../../../contracts/api/research-automation-reader-report-api.generated';
import type { ShopeeCitedFinding } from '../../../contracts/analysis/shopee-review-coding-v1.generated';
import { ResearchAutomationError, type ResearchAutomationRun } from './api';
import { canonical } from './insight-coding-ui';
import { decideReaderReportV2, loadReaderReportsV2, readerReportPdfUrl, readerReportUrl } from './reader-report-api';
import {
  buildShopeeReader, digestShopeeDraft, digestShopeeReport, loadShopeeCodingContext, loadShopeeCodingHistory, loadShopeeCodingView, loadShopeeSampleSelection, proposeShopeeCoding,
  type ShopeeCodingContextView, type ShopeeCodingHistory, type ShopeeCodingReadView, type ShopeeSampleSelection,
} from './shopee-report-api';

interface Props {
  readonly run: ResearchAutomationRun;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
}

interface Keyed { readonly identity: string; readonly key: string }

const SHOPEE_BUILDER = 'reader-report-insight-shopee-v1';
const message = (failure: unknown, fallback: string) => failure instanceof ResearchAutomationError ? failure.message : fallback;
const isShopeeRevision = (revision: ResearchAutomationReaderRevisionV2): revision is ResearchAutomationShopeeReaderRevision =>
  revision.reportKind === 'INSIGHT' && 'builderVersion' in revision && revision.builderVersion === SHOPEE_BUILDER;
const keyed = (entry: Keyed | null, identity: string): Keyed => entry?.identity === identity ? entry : { identity, key: crypto.randomUUID() };
const UNRESOLVED_TOKEN = /\{\{[^}]*\}\}/;

/** Substitutes only the finding's own code-record token with the application distinct record count. */
function renderFinding(finding: ShopeeCitedFinding, records: number): { text: string; unresolved: boolean } {
  const text = finding.template.split(`{{shopee.codes.${finding.code}.records}}`).join(String(records));
  return { text, unresolved: UNRESOLVED_TOKEN.test(text) };
}

/** OWNER Shopee U22 flow: confirm one retained sample, propose cited findings, then save and decide a Reader revision. */
export default function ShopeeReportPanel({ run, ownerToken, writesAvailable }: Props) {
  const [selection, setSelection] = useState<ShopeeSampleSelection | null>(null);
  const [context, setContext] = useState<ShopeeCodingContextView | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [history, setHistory] = useState<ShopeeCodingHistory | null>(null);
  const [view, setView] = useState<ShopeeCodingReadView | null>(null);
  const [saved, setSaved] = useState<ResearchAutomationShopeeReaderRevision[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [tick, setTick] = useState(0);
  const [requestKey, setRequestKey] = useState<Keyed | null>(null);
  const [readerKey, setReaderKey] = useState<Keyed | null>(null);
  const [decisionKey, setDecisionKey] = useState<Keyed | null>(null);
  const canWrite = writesAvailable && ownerToken !== null;
  const selectionMatches = selection !== null && context !== null &&
    canonical(selection.binding) === canonical(context.binding) && canonical(selection.sample) === canonical(context.sample);
  const sampleConfirmed = selectionMatches && confirmed === canonical(context!.sample);

  useEffect(() => {
    const controller = new AbortController();
    setView(null); setExpanded(null); setError(''); setSaved([]); setConfirmed(null);
    // Admission first: the saved Shopee list loads only after the retained sample, context and
    // history all succeed, so a run without Shopee admission issues no saved-list request.
    Promise.all([
      loadShopeeSampleSelection(run.workspaceId, run.runId, controller.signal),
      loadShopeeCodingContext(run.workspaceId, run.runId, controller.signal),
      loadShopeeCodingHistory(run.workspaceId, run.runId, controller.signal),
    ])
      .then(([selected, value, list]) => {
        if (controller.signal.aborted) return undefined;
        setSelection(selected); setContext(value); setHistory(list);
        return loadReaderReportsV2(run.workspaceId, run.runId, controller.signal);
      })
      .then(readers => {
        if (controller.signal.aborted || !readers) return;
        setSaved(readers.revisions.filter(isShopeeRevision));
      })
      .catch((failure: unknown) => { if (!controller.signal.aborted) { setContext(null); setSelection(null); setError(message(failure, 'Chưa tải được mẫu Shopee.')); } });
    return () => controller.abort();
  }, [run.workspaceId, run.runId, tick]);

  const refreshSaved = async () => {
    const readers = await loadReaderReportsV2(run.workspaceId, run.runId, new AbortController().signal);
    const shopee = readers.revisions.filter(isShopeeRevision);
    setSaved(shopee);
    return shopee;
  };

  const propose = async () => {
    if (!context || !sampleConfirmed || !canWrite) return;
    const entry = keyed(requestKey, canonical({ workspaceId: run.workspaceId, runId: run.runId, binding: context.binding, sample: context.sample, keywordDigest: context.keywordDigest }));
    setRequestKey(entry);
    setPending(true);
    try {
      const receipt = await proposeShopeeCoding(run.workspaceId, run.runId, {
        contractVersion: 'shopee-coding-propose-v1', requestKey: entry.key, binding: context.binding, sample: context.sample, keywordDigest: context.keywordDigest,
      }, ownerToken!);
      setNotice(receipt.exactRetry ? 'Đề xuất đã có. Không gọi lại mô hình.' : 'Đã tạo đề xuất. Kết quả đang chờ bạn duyệt.');
      setTick(value => value + 1);
    } catch (failure: unknown) {
      setError(message(failure, 'Chưa tạo được đề xuất mã Shopee.'));
    } finally { setPending(false); }
  };

  const open = async (packageId: string) => {
    try { setView(await loadShopeeCodingView(run.workspaceId, run.runId, packageId, new AbortController().signal)); setExpanded(null); setError(''); }
    catch (failure: unknown) { setError(message(failure, 'Chưa mở được báo cáo mã Shopee.')); }
  };

  const buildReader = async () => {
    if (!view || !canWrite) return;
    setPending(true); setError(''); setNotice('');
    try {
      const draftPairId = await digestShopeeDraft(view.draft);
      const semanticSha256 = await digestShopeeReport(view.report);
      const entry = keyed(readerKey, canonical({ workspaceId: run.workspaceId, runId: run.runId, draftPairId, semanticSha256 }));
      setReaderKey(entry);
      const receipt = await buildShopeeReader(run.workspaceId, run.runId, {
        contractVersion: 'insight-reader-build-shopee-v1', reportKind: 'INSIGHT', requestKey: entry.key, draftPairId, semanticSha256, sourceKind: 'SHOPEE',
      }, ownerToken!);
      const listed = await refreshSaved();
      if (!listed.some(item => item.revisionId === receipt.revision.revisionId)) throw new ResearchAutomationError('integrity', 'Chưa thấy bản đọc vừa lưu trong danh sách.');
      const page = await fetch(readerReportUrl(run.workspaceId, run.runId, receipt.revision.revisionId), { cache: 'no-store' });
      if (!page.ok) throw new ResearchAutomationError('connection', 'Chưa đọc được bản đọc vừa lưu.');
      setNotice(receipt.exactRetry ? 'Bản đọc đã có. Không tạo thêm bản mới.' : 'Đã lưu bản đọc. Chờ bạn duyệt.');
    } catch (failure: unknown) {
      setError(message(failure, 'Chưa lưu được bản đọc Shopee.'));
    } finally { setPending(false); }
  };

  const decide = async (revision: ResearchAutomationShopeeReaderRevision, decision: 'APPROVED' | 'REJECTED') => {
    if (!canWrite) return;
    setPending(true); setError(''); setNotice('');
    try {
      const entry = keyed(decisionKey, canonical({ workspaceId: run.workspaceId, runId: run.runId, revisionId: revision.revisionId, decision }));
      setDecisionKey(entry);
      const receipt = await decideReaderReportV2(run.workspaceId, run.runId, {
        contractVersion: 'reader-report-decision-v2', requestKey: entry.key, revisionId: revision.revisionId, decision, reason: null, reportKind: 'INSIGHT', htmlSha256: revision.htmlSha256,
      }, ownerToken!);
      const listed = await refreshSaved();
      const current = listed.find(item => item.revisionId === receipt.revision.revisionId);
      if (current?.decision?.decision !== decision) throw new ResearchAutomationError('integrity', 'Danh sách chưa cho thấy quyết định vừa lưu.');
      setNotice(decision === 'APPROVED' ? 'Đã duyệt bản đọc.' : 'Đã từ chối bản đọc.');
    } catch (failure: unknown) {
      setError(message(failure, 'Chưa lưu được quyết định bản đọc.'));
    } finally { setPending(false); }
  };

  return <section className="ra-shopee" aria-labelledby="ra-shopee-title">
    <h2 id="ra-shopee-title">Tổng hợp đánh giá Shopee</h2>
    {error && <p className="ra-message error" role="alert">{error}</p>}
    {notice && <p className="ra-banner" role="status">{notice}</p>}
    {!canWrite && <p className="ra-muted">Mở khóa OWNER để tạo đề xuất.</p>}
    {selection && context && <div>
      <p>Mẫu Shopee đã chọn · Đánh giá đủ điều kiện: {selection.counts.eligible} · Loại trừ: {selection.counts.excluded} · Không đọc được: {selection.counts.unreadable}</p>
      <details><summary>Chi tiết kỹ thuật</summary><p>Mã mẫu: {selection.sample.sampleId} · Mã corpus: {selection.sample.corpusArtifactSha256}</p></details>
      {!selectionMatches && <p className="ra-message error" role="alert">Mẫu đã chọn không khớp ngữ cảnh đề xuất. Tải lại trước khi tiếp tục.</p>}
      <button type="button" className="button" disabled={!selectionMatches || sampleConfirmed} onClick={() => setConfirmed(canonical(context.sample))}>{sampleConfirmed ? 'Đã chọn mẫu này' : 'Chọn mẫu này'}</button>
      {' '}<button type="button" className="button" disabled={!canWrite || !sampleConfirmed || pending} onClick={() => void propose()}>Tạo bản tổng hợp</button>
    </div>}
    <h3>Lịch sử đề xuất</h3>
    {history && history.sources.length === 0 && <p className="ra-muted">Chưa có đề xuất nào cho mẫu này.</p>}
    <ul>{history?.sources.map((item, index) => <li key={item.proposalId}><span>Bản tổng hợp {index + 1}</span> · <span>Đề xuất, chờ bạn duyệt</span> <button type="button" className="button" onClick={() => void open(item.packageId)}>Mở</button></li>)}</ul>
    {view && <article className="ra-shopee-report">
      <p>Đề xuất, chờ bạn duyệt. Số liệu do ứng dụng tính trên mã đề xuất, chưa được chủ sở hữu phê duyệt.</p>
      <p>Đã mã hóa: {view.draft.counts.recordsCoded} · Mã đề xuất: {view.draft.counts.codesProposed} · Trích dẫn: {view.draft.counts.quotesCited}</p>
      <ul>{view.report.findings.map(finding => {
        const codes = view.draft.codes.filter(code => code.code === finding.code);
        const records = new Set(codes.map(code => code.recordIndex)).size;
        const rendered = renderFinding(finding, records);
        return <li key={`${finding.sectionId}:${finding.code}`}>
          <b>{finding.label}</b> · {rendered.unresolved ? <span role="alert">Mẫu câu chưa đầy đủ, cần kiểm tra</span> : rendered.text} · Phạm vi: {finding.scope}{' '}
          <button type="button" className="button" aria-expanded={expanded === finding.code} onClick={() => setExpanded(expanded === finding.code ? null : finding.code)}>Xem bằng chứng</button>
          {expanded === finding.code && <ul>{codes.map((code, index) => {
            const citation = view.citations.find(item => item.citationId === code.citationId);
            return <li key={`${code.citationId}:${index}`}>
              bình luận {code.recordIndex}: <q>{code.quote.text}</q>
              {citation ? <> · {citation.locator} · ngữ cảnh: <q>{citation.context}</q></> : <span> · Thiếu vị trí nguồn</span>}
            </li>;
          })}</ul>}
        </li>;
      })}</ul>
      <ul>{view.draft.limitations.map(item => <li key={item}>{item}</li>)}</ul>
      <button type="button" className="button" disabled={!canWrite || pending} onClick={() => void buildReader()}>Lưu bản đọc</button>
    </article>}
    <h3>Bản đọc đã lưu</h3>
    {saved.length === 0 && <p className="ra-muted">Chưa có bản đọc Shopee nào.</p>}
    <ul>{saved.map((revision, index) => <li key={revision.revisionId}>
      <span>Bản đọc {index + 1}</span> · <span>{revision.decision ? (revision.decision.decision === 'APPROVED' ? 'Đã duyệt' : 'Đã từ chối') : 'Chờ bạn duyệt'}</span>{' '}
      <a href={readerReportUrl(run.workspaceId, run.runId, revision.revisionId)} target="_blank" rel="noopener noreferrer">Mở bản đọc</a>{' '}
      <a href={readerReportPdfUrl(run.workspaceId, run.runId, revision.revisionId)} rel="noopener noreferrer">Tải PDF</a>
      {!revision.decision && <>
        {' '}<button type="button" className="button" disabled={!canWrite || pending} onClick={() => void decide(revision, 'APPROVED')}>Duyệt</button>
        {' '}<button type="button" className="button" disabled={!canWrite || pending} onClick={() => void decide(revision, 'REJECTED')}>Từ chối</button>
      </>}
    </li>)}</ul>
  </section>;
}
