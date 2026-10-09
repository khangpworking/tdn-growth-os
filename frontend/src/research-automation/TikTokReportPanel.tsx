import { useEffect, useRef, useState } from 'react';
import { ResearchAutomationError, type ResearchAutomationRun } from './api';
import {
  buildTikTokReader, digestTikTokDraft, digestTikTokReport, loadTikTokCodingContext, loadTikTokCodingHistory, loadTikTokCodingView,
  loadTikTokCommentSource, loadTikTokCommentSources, proposeTikTokCoding, type TikTokCodingContextView, type TikTokCodingReadView,
  type TikTokCommentReadView, type TikTokCommentSourceHistory,
} from './tiktok-report-api';
import type { TikTokCodingHistory, TikTokCodingProposeRequest } from '../../../contracts/analysis/tiktok-coding-proposal-v1.generated';

interface Props {
  readonly run: ResearchAutomationRun;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly onBuilt?: () => void;
}

const message = (failure: unknown, fallback: string) => failure instanceof ResearchAutomationError ? failure.message : fallback;

/** OWNER TikTok flow: explicit retained S07 selection, proposed draft coding, cited report, saved Reader. */
export default function TikTokReportPanel({ run, ownerToken, writesAvailable, onBuilt }: Props) {
  const [sources, setSources] = useState<TikTokCommentSourceHistory | null>(null);
  const [selected, setSelected] = useState('');
  const [sourceView, setSourceView] = useState<TikTokCommentReadView | null>(null);
  const [context, setContext] = useState<TikTokCodingContextView | null>(null);
  const [history, setHistory] = useState<TikTokCodingHistory | null>(null);
  const [codingView, setCodingView] = useState<TikTokCodingReadView | null>(null);
  const [draftSha, setDraftSha] = useState('');
  const [reportSha, setReportSha] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState(false);
  const [tick, setTick] = useState(0);
  const requestKeys = useRef(new Map<string, string>());
  const mounted = useRef(true);
  const openController = useRef<AbortController | null>(null);
  const selectedRef = useRef('');
  const canWrite = writesAvailable && ownerToken !== null;

  useEffect(() => {
    const controller = new AbortController();
    loadTikTokCommentSources(run.workspaceId, run.runId, controller.signal)
      .then(value => { if (!controller.signal.aborted) setSources(value); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(message(failure, 'Chưa tải được nguồn bình luận TikTok.')); });
    loadTikTokCodingHistory(run.workspaceId, run.runId, controller.signal)
      .then(value => { if (!controller.signal.aborted) setHistory(value); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(message(failure, 'Chưa tải được lịch sử mã TikTok.')); });
    return () => controller.abort();
  }, [run.workspaceId, run.runId, tick]);

  useEffect(() => {
    selectedRef.current = selected;
    openController.current?.abort();
    setSourceView(null); setContext(null); setCodingView(null); setDraftSha(''); setReportSha('');
    if (!selected) return;
    const controller = new AbortController();
    Promise.all([
      loadTikTokCommentSource(run.workspaceId, run.runId, selected, controller.signal),
      loadTikTokCodingContext(run.workspaceId, run.runId, selected, controller.signal),
    ])
      .then(([source, value]) => { if (!controller.signal.aborted) { setSourceView(source); setContext(value); setError(''); } })
      .catch((failure: unknown) => { if (!controller.signal.aborted) { setContext(null); setSourceView(null); setError(message(failure, 'Chưa tải được bối cảnh nguồn đã chọn.')); } });
    return () => controller.abort();
  }, [run.workspaceId, run.runId, selected]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const generate = async () => {
    if (!context || !canWrite) return;
    const identity = `${context.corpus.packageId}:${context.corpus.packageContentSha256}`;
    const requestKey = requestKeys.current.get(identity) ?? crypto.randomUUID();
    requestKeys.current.set(identity, requestKey);
    const body: TikTokCodingProposeRequest = {
      contractVersion: 'tiktok-coding-propose-v1', requestKey, binding: context.binding, corpus: context.corpus, keywordDigest: context.keywordDigest,
    };
    const scope = selected;
    setPending(true);
    try {
      const receipt = await proposeTikTokCoding(run.workspaceId, run.runId, body, ownerToken!);
      if (!mounted.current || scope !== selectedRef.current) return;
      setNotice(receipt.exactRetry ? 'Đề xuất mã đã có. Không gọi lại mô hình.' : 'Đã tạo đề xuất mã. Kết quả đang chờ bạn duyệt.');
      setTick(value => value + 1);
    } catch (failure: unknown) {
      if (mounted.current) setError(message(failure, 'Chưa tạo được đề xuất mã TikTok.'));
    } finally { if (mounted.current) setPending(false); }
  };

  const openCoding = async (packageId: string) => {
    const controller = new AbortController();
    openController.current?.abort();
    openController.current = controller;
    try {
      const view = await loadTikTokCodingView(run.workspaceId, run.runId, packageId, controller.signal);
      const [draft, report] = await Promise.all([digestTikTokDraft(view.draft), digestTikTokReport(view.report)]);
      if (!mounted.current || controller.signal.aborted) return;
      setCodingView(view); setDraftSha(draft); setReportSha(report); setError('');
    } catch (failure: unknown) {
      if (mounted.current && !controller.signal.aborted) setError(message(failure, 'Chưa mở được báo cáo mã TikTok.'));
    }
  };

  const build = async () => {
    if (!codingView || !canWrite) return;
    const identity = `${codingView.draft.proposalId}:reader`;
    const requestKey = requestKeys.current.get(identity) ?? crypto.randomUUID();
    requestKeys.current.set(identity, requestKey);
    setPending(true);
    try {
      const receipt = await buildTikTokReader(run.workspaceId, run.runId, {
        contractVersion: 'insight-reader-build-tiktok-v1', reportKind: 'INSIGHT', requestKey, draftPairId: draftSha, semanticSha256: reportSha, sourceKind: 'TIKTOK',
      }, ownerToken!);
      if (!mounted.current) return;
      setNotice(receipt.exactRetry ? 'Bản đọc đã có. Không dựng lại.' : 'Đã dựng bản đọc TikTok. Trạng thái: chờ bạn duyệt.');
      onBuilt?.();
    } catch (failure: unknown) {
      if (mounted.current) setError(message(failure, 'Chưa dựng được bản đọc TikTok.'));
    } finally { if (mounted.current) setPending(false); }
  };

  return <section className="ra-tiktok" aria-labelledby="ra-tiktok-title">
    <h2 id="ra-tiktok-title">Mã bình luận TikTok</h2>
    {error && <p className="ra-message error" role="alert">{error}</p>}
    {notice && <p className="ra-banner" role="status">{notice}</p>}
    {!canWrite && <p className="ra-muted">Mở khóa OWNER để tạo đề xuất và dựng bản đọc.</p>}
    <label>Nguồn bình luận đã lưu
      <select value={selected} onChange={event => setSelected(event.target.value)}>
        <option value="">Chọn nguồn</option>
        {sources?.sources.map(source => <option key={source.package.packageId} value={source.package.packageId}>{source.package.packageId}</option>)}
      </select>
    </label>
    {sourceView && <div className="ra-tiktok-source"><p>{sourceView.sampleLabel}</p><ul>{sourceView.rows.filter(row => row.text !== null).map((row, index) => <li key={`${row.citation ?? 'none'}:${index}`}><q>{row.text}</q>{row.citation !== null ? <span> · trích dẫn [{row.citation}]</span> : null}{row.createdAt ? <span> · {row.createdAt}</span> : <span> · Thời gian chưa rõ</span>}</li>)}</ul><ul>{sourceView.limitations.map(item => <li key={item}>{item}</li>)}</ul></div>}
    {context && <div className="ra-tiktok-context">
      <p>Bình luận đủ điều kiện: {context.counts.eligible} · Loại trừ: {context.counts.excluded} · Chưa rõ: {context.counts.unclear}</p>
      <button type="button" className="button" disabled={!canWrite || pending} onClick={() => void generate()}>Tạo đề xuất mã</button>
    </div>}
    <h3>Lịch sử đề xuất</h3>
    <ul>{history?.sources.map(item => <li key={item.proposalId}><span>{item.packageId}</span> · <span>Đề xuất, chờ bạn duyệt</span> <button type="button" className="button" onClick={() => void openCoding(item.packageId)}>Mở</button></li>)}</ul>
    {codingView && <article className="ra-tiktok-report">
      <p>Đề xuất, chờ bạn duyệt. Số lượng là đề xuất của mô hình, chưa được chủ sở hữu phê duyệt.</p>
      <p>Đã mã hóa: {codingView.draft.counts.recordsCoded} · Mã đề xuất: {codingView.draft.counts.codesProposed} · Trích dẫn: {codingView.draft.counts.quotesCited}</p>
      <ul>{codingView.report.findings.map(finding => <li key={finding.code}>{finding.label}</li>)}</ul>
      <ul>{codingView.draft.codes.map((code, index) => <li key={`${code.citationId}:${index}`}><b>{code.label}</b> (đề xuất, chờ bạn duyệt) · bình luận {code.recordIndex}: <q>{code.quote.text}</q> · trích dẫn [{code.citationId}]</li>)}</ul>
      <ul>{codingView.citations.map(citation => <li key={citation.citationId}>[{citation.citationId}] {citation.locator}{citation.url ? <> · <a href={citation.url} rel="noreferrer">nguồn</a></> : null}</li>)}</ul>
      <ul>{codingView.draft.limitations.map(item => <li key={item}>{item}</li>)}</ul>
      <button type="button" className="button" disabled={!canWrite || pending} onClick={() => void build()}>Dựng bản đọc TikTok</button>
    </article>}
  </section>;
}
