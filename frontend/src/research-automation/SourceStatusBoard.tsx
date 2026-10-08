import { useEffect, useRef, useState } from 'react';
import type { FrontendMode } from '../data-source';
import { loadSourceStatus, recheckPageIndex, ResearchAutomationError } from './api';
import type { ResearchAutomationSourceStatus, ResearchAutomationSourceStatusEntry } from './api';
import { formatTime } from './run-status';
import './source-status.css';

export interface SourceStatusBoardProps {
  readonly mode: FrontendMode;
  readonly workspaceId: string;
  readonly ownerToken?: string | null;
  readonly writesAvailable?: boolean;
}

const SOURCE_COPY: Record<ResearchAutomationSourceStatusEntry['source'], { readonly name: string; readonly role: string; readonly unit: string }> = {
  KALODATA: { name: 'Kalodata', role: 'Số liệu sản phẩm theo kỳ', unit: 'lần thu' },
  SERPAPI: { name: 'SerpApi', role: 'Kết quả tìm Google', unit: 'lần thu' },
  APIFY_SHOPEE: { name: 'Apify', role: 'Review Shopee theo link', unit: 'lần thu' },
  METRIC: { name: 'Metric', role: 'File xuất tải lên tay', unit: 'file' },
  PAGEINDEX: { name: 'PageIndex', role: 'Tự lập chỉ mục cho PDF', unit: 'tài liệu' },
};

export function sourceStateView(entry: ResearchAutomationSourceStatusEntry): { readonly tone: 'ready' | 'partial' | 'missing' | 'manual' | 'off'; readonly label: string; readonly detail: string } {
  switch (entry.state) {
    case 'READY': return { tone: 'ready', label: 'Đã kết nối', detail: 'Đã cài khóa và phiên nghiên cứu đang dùng nguồn này.' };
    case 'CONFIGURED_NOT_WIRED': return { tone: 'partial', label: 'Có khóa, chưa dùng', detail: 'Đã cài khóa nhưng phiên nghiên cứu chưa gọi nguồn này.' };
    case 'MANUAL_IMPORT': return { tone: 'manual', label: 'Nhập tay', detail: 'Không cần khóa. Dữ liệu vào khi bạn tải file lên trong từng phiên.' };
    case 'EXECUTOR_DISABLED': return { tone: 'off', label: 'Máy chủ không chạy', detail: 'Máy chủ này chỉ đọc, không chạy phiên nghiên cứu nên không gọi nguồn nào.' };
    case 'NOT_CONFIGURED':
      return { tone: 'missing', label: 'Chưa kết nối', detail: entry.credential === 'CONFIGURED'
        ? 'Đã có token nhưng thiếu hạn mức chi tối đa, nên không tự thu.' : 'Chưa cài khóa trên máy chủ.' };
  }
}

const credentialLabel = (value: ResearchAutomationSourceStatusEntry['credential']) =>
  value === 'CONFIGURED' ? 'Đã cài' : value === 'MISSING' ? 'Thiếu' : 'Không cần';

/** Micro-dollars to a short dollar string, e.g. 500000 -> $0.50. Null stays unknown, never 0. */
export function formatMicroDollars(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return 'Chưa rõ';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${Math.floor(abs / 1_000_000)}.${String(Math.floor((abs % 1_000_000) / 10_000)).padStart(2, '0')}`;
}

export function pageIndexAutomaticCopy(state: 'INDEXING_PDFS' | 'PAUSED_LOW_BALANCE' | 'DISABLED'): string {
  switch (state) {
    case 'INDEXING_PDFS': return 'Đang tự dùng cho PDF';
    case 'PAUSED_LOW_BALANCE': return 'Tạm dừng vì số dư thấp';
    case 'DISABLED': return 'Đã tắt';
  }
}

export default function SourceStatusBoard({ mode, workspaceId, ownerToken = null, writesAvailable = false }: SourceStatusBoardProps) {
  const [data, setData] = useState<ResearchAutomationSourceStatus | null>(null);
  const [error, setError] = useState<{ readonly workspaceId: string; readonly message: string } | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [rechecking, setRechecking] = useState(false);
  const recheck = useRef<AbortController | null>(null);
  const status = data?.workspaceId === workspaceId ? data : null;
  const message = error?.workspaceId === workspaceId ? error.message : '';
  useEffect(() => {
    if (mode === 'demo') { setData(null); setError(null); setLoadingWorkspace(null); return; }
    const controller = new AbortController(); let active = true;
    setLoadingWorkspace(workspaceId);
    void loadSourceStatus(workspaceId, controller.signal).then(value => { if (active) { setData(value); setError(null); setLoadingWorkspace(null); } }).catch(failure => { if (active && !controller.signal.aborted) { setError({ workspaceId, message: failure instanceof ResearchAutomationError ? failure.message : 'Chưa tải được trạng thái nguồn dữ liệu.' }); setLoadingWorkspace(null); } });
    return () => { active = false; controller.abort(); };
  }, [mode, workspaceId, tick]);
  useEffect(() => { setRechecking(false); return () => { recheck.current?.abort(); recheck.current = null; }; }, [workspaceId, mode]);
  const checkPdfConnector = async () => {
    if (mode === 'demo' || !ownerToken || !writesAvailable || recheck.current) return;
    const controller = new AbortController(); recheck.current = controller; setRechecking(true);
    try {
      const result = await recheckPageIndex(workspaceId, ownerToken, controller.signal);
      if (controller.signal.aborted) return;
      setData(result); setError(null);
    } catch (failure) {
      if (!controller.signal.aborted) setError({ workspaceId, message: failure instanceof ResearchAutomationError ? failure.message : 'Chưa kiểm tra được kết nối PDF.' });
    } finally { if (recheck.current === controller) { recheck.current = null; setRechecking(false); } }
  };

  return <section className="ra-sources surface" aria-labelledby="ra-sources-title">
    <div className="ra-sources-head"><div><h2 id="ra-sources-title">Nguồn dữ liệu</h2><p className="ra-muted">Tình trạng kết nối của từng nguồn{status ? ` · kiểm tra lúc ${formatTime(status.checkedAt)}` : ''}.</p></div>{mode !== 'demo' && <button type="button" className="button" onClick={() => setTick(value => value + 1)}>Kiểm tra lại</button>}</div>
    {mode === 'demo' ? <p className="ra-muted">Demo không đọc cấu hình máy chủ. Chuyển sang dữ liệu thật để xem nguồn nào đã kết nối.</p>
      : loadingWorkspace === workspaceId && !status ? <p className="ra-muted" role="status">Đang kiểm tra nguồn dữ liệu…</p>
        : message ? <div className="ra-message error" role="alert"><p>{message}</p><button type="button" className="button" onClick={() => setTick(value => value + 1)}>Thử lại</button></div>
          : status ? <>
            <ul className="ra-sources-grid">{status.sources.map(entry => {
              const copy = SOURCE_COPY[entry.source]; const view = sourceStateView(entry);
              return <li key={entry.source} className={`ra-source ${view.tone}`} data-source={entry.source}>
                <div><h3>{copy.name}</h3><small>{copy.role}</small></div>
                <span className="status-pill">{view.label}</span>
                <small>{view.detail}</small>
                <dl>
                  <dt>Khóa</dt><dd>{credentialLabel(entry.credential)}</dd>
                  <dt>Chi phí</dt><dd>{entry.paid ? 'Trả phí theo lượt' : 'Không tốn phí'}</dd>
                  <dt>Dữ liệu</dt><dd>{entry.dataCount === null ? 'Chưa rõ' : entry.dataCount ? `${entry.dataCount} ${copy.unit} · gần nhất ${entry.lastDataAt ? formatTime(entry.lastDataAt) : '-'}` : 'Chưa có trong workspace'}</dd>
                  {entry.paid && <><dt>Gọi gần nhất</dt><dd>{entry.lastUsageAt ? formatTime(entry.lastUsageAt) : 'Chưa gọi'}</dd></>}
                  {entry.source === 'PAGEINDEX' && entry.pageindex && <>
                    <dt>Số dư (ước tính)</dt><dd>{formatMicroDollars(entry.pageindex.balanceMicroDollars)}{entry.pageindex.balanceCheckedAt ? ` · kiểm tra lúc ${formatTime(entry.pageindex.balanceCheckedAt)}` : ''}{entry.pageindex.billingUrl ? <> · <a href={entry.pageindex.billingUrl} target="_blank" rel="noopener noreferrer">Thanh toán</a></> : null}</dd>
                    <dt>Tài liệu đã gửi</dt><dd>{entry.pageindex.documentsSent ?? 'Chưa rõ'}</dd>
                    <dt>Trang đang lưu</dt><dd>{entry.pageindex.activePages === null ? 'Chưa rõ' : `${entry.pageindex.activePages} trang`} · khoảng {formatMicroDollars(entry.pageindex.estimatedMonthlyCostMicroDollars)}/tháng</dd>
                    <dt>Tự động</dt><dd>{pageIndexAutomaticCopy(entry.pageindex.automaticState)}</dd>
                  </>}
                </dl>
                {entry.source === 'PAGEINDEX' && entry.pageindex && <>
                  {entry.pageindex.automaticState !== 'INDEXING_PDFS' && <div className="ra-message error" role="alert"><p>{entry.pageindex.automaticState === 'PAUSED_LOW_BALANCE' ? entry.pageindex.usageLimited ? 'Đã tạm dừng gửi PDF mới. PageIndex báo đã hết số dư.' : 'Đã tạm dừng gửi PDF mới vì số dư thấp.' : 'Lập chỉ mục tự động đang tắt; PDF mới không được gửi.'}</p></div>}
                  <button type="button" className="button" disabled={!ownerToken || !writesAvailable || rechecking} onClick={() => void checkPdfConnector()}>{rechecking ? 'Đang kiểm tra PDF…' : 'Kiểm tra lại PDF'}</button>
                  <small>Chỉ đọc danh sách tài liệu miễn phí, không gửi PDF hoặc câu hỏi.</small>
                </>}
              </li>;
            })}</ul>
            <p className="ra-muted ra-sources-note">Bảng chỉ đọc cấu hình và lịch sử đã lưu, không gọi thử nguồn nên không tốn phí. “Đã kết nối” nghĩa là khóa đã được cài, chưa chứng minh khóa còn hạn hoặc còn hạn mức.</p>
          </> : null}
  </section>;
}
