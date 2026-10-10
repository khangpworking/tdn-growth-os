import { useEffect, useRef, useState } from 'react';
import { ResearchAutomationError, type ResearchAutomationRun } from './api';
import {
  loadShopeeCodingContext, loadShopeeCodingHistory, loadShopeeCodingView, proposeShopeeCoding,
  type ShopeeCodingContextView, type ShopeeCodingHistory, type ShopeeCodingReadView,
} from './shopee-report-api';

interface Props {
  readonly run: ResearchAutomationRun;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly sampleId: string;
}

const message = (failure: unknown, fallback: string) => failure instanceof ResearchAutomationError ? failure.message : fallback;

/** OWNER Shopee U22 flow: proposed draft coding, compact cited findings, expandable exact evidence. */
export default function ShopeeReportPanel({ run, ownerToken, writesAvailable, sampleId }: Props) {
  const [context, setContext] = useState<ShopeeCodingContextView | null>(null);
  const [history, setHistory] = useState<ShopeeCodingHistory | null>(null);
  const [view, setView] = useState<ShopeeCodingReadView | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [tick, setTick] = useState(0);
  const requestKey = useRef<string | null>(null);
  const canWrite = writesAvailable && ownerToken !== null;

  useEffect(() => {
    const controller = new AbortController();
    setView(null); setExpanded(null); setError('');
    Promise.all([
      loadShopeeCodingContext(run.workspaceId, run.runId, sampleId, controller.signal),
      loadShopeeCodingHistory(run.workspaceId, run.runId, controller.signal),
    ])
      .then(([value, list]) => { if (!controller.signal.aborted) { setContext(value); setHistory(list); } })
      .catch((failure: unknown) => { if (!controller.signal.aborted) { setContext(null); setError(message(failure, 'Chưa tải được mẫu Shopee.')); } });
    return () => controller.abort();
  }, [run.workspaceId, run.runId, sampleId, tick]);

  const propose = async () => {
    if (!context || !canWrite) return;
    requestKey.current ??= crypto.randomUUID();
    setPending(true);
    try {
      const receipt = await proposeShopeeCoding(run.workspaceId, run.runId, {
        contractVersion: 'shopee-coding-propose-v1', requestKey: requestKey.current, binding: context.binding, sample: context.sample, keywordDigest: context.keywordDigest,
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

  return <section className="ra-shopee" aria-labelledby="ra-shopee-title">
    <h2 id="ra-shopee-title">Tổng hợp đánh giá Shopee</h2>
    {error && <p className="ra-message error" role="alert">{error}</p>}
    {notice && <p className="ra-banner" role="status">{notice}</p>}
    {!canWrite && <p className="ra-muted">Mở khóa OWNER để tạo đề xuất.</p>}
    {context && <div>
      <p>Đánh giá đủ điều kiện: {context.counts.eligible} · Loại trừ: {context.counts.excluded} · Không đọc được: {context.counts.unreadable}</p>
      <button type="button" className="button" disabled={!canWrite || pending} onClick={() => void propose()}>Tạo bản tổng hợp</button>
    </div>}
    <h3>Lịch sử đề xuất</h3>
    {history && history.sources.length === 0 && <p className="ra-muted">Chưa có đề xuất nào cho mẫu này.</p>}
    <ul>{history?.sources.map((item, index) => <li key={item.proposalId}><span>Bản tổng hợp {index + 1}</span> · <span>Đề xuất, chờ bạn duyệt</span> <button type="button" className="button" onClick={() => void open(item.packageId)}>Mở</button></li>)}</ul>
    {view && <article className="ra-shopee-report">
      <p>Đề xuất, chờ bạn duyệt. Số lượng là đề xuất của mô hình, chưa được chủ sở hữu phê duyệt.</p>
      <p>Đã mã hóa: {view.draft.counts.recordsCoded} · Mã đề xuất: {view.draft.counts.codesProposed} · Trích dẫn: {view.draft.counts.quotesCited}</p>
      <ul>{view.report.findings.map(finding => <li key={`${finding.sectionId}:${finding.code}`}>
        <b>{finding.label}</b> · {finding.scope} · {finding.citations.length} trích dẫn (đề xuất, chờ bạn duyệt){' '}
        <button type="button" className="button" aria-expanded={expanded === finding.code} onClick={() => setExpanded(expanded === finding.code ? null : finding.code)}>Xem bằng chứng</button>
        {expanded === finding.code && <ul>{view.draft.codes.filter(code => code.code === finding.code).map((code, index) => <li key={`${code.citationId}:${index}`}>
          bình luận {code.recordIndex}: <q>{code.quote.text}</q> · trích dẫn [{code.citationId}]
        </li>)}</ul>}
      </li>)}</ul>
      <ul>{view.citations.map(citation => <li key={citation.citationId}>[{citation.citationId}] {citation.locator}{citation.url ? <> · <a href={citation.url} rel="noreferrer">nguồn</a></> : null}</li>)}</ul>
      <ul>{view.draft.limitations.map(item => <li key={item}>{item}</li>)}</ul>
    </article>}
  </section>;
}
