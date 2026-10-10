import { useEffect, useRef, useState } from 'react';
import type { FrontendMode } from '../data-source';
import { loadSourceStatus, recheckPageIndex, ResearchAutomationError } from './api';
import type { ResearchAutomationSourceStatus, ResearchAutomationSourceStatusEntry } from './api';
import type { ResearchAutomationSourceGroup, ResearchAutomationSourceOperation } from '../../../contracts/api/research-automation-source-status-api.generated';
import { formatTime } from './run-status';
import './source-status.css';

export interface SourceStatusBoardProps {
  readonly mode: FrontendMode;
  readonly workspaceId: string;
  readonly ownerToken?: string | null;
  readonly writesAvailable?: boolean;
}

/** Board source IDs, one card per registry entry group. Trends is a SerpApi operation, not a card. */
export type BoardSource = ResearchAutomationSourceStatusEntry['source'];
export type BoardOperation = ResearchAutomationSourceOperation;
export type BoardEntry = ResearchAutomationSourceStatusEntry;

type BoardGroup = ResearchAutomationSourceGroup;

const GROUP_COPY: Record<BoardGroup, string> = {
  SALES_MARKET: 'Bán hàng và thị trường',
  CUSTOMER_VOICE: 'Lời khách',
  SELLER_VOICE: 'Lời người bán',
  MACRO: 'Số liệu vĩ mô',
  DOCUMENTS: 'Tài liệu',
};

const GROUP_ORDER: readonly BoardGroup[] = ['SALES_MARKET', 'CUSTOMER_VOICE', 'SELLER_VOICE', 'MACRO', 'DOCUMENTS'];

/** Fallback grouping for payloads that predate the group field. */
const LEGACY_GROUP: Record<string, BoardGroup> = {
  METRIC: 'SALES_MARKET', KALODATA: 'SALES_MARKET', APIFY_SHOPEE: 'CUSTOMER_VOICE', SERPAPI: 'SALES_MARKET', PAGEINDEX: 'DOCUMENTS',
};

const SOURCE_COPY: Record<BoardSource, { readonly name: string; readonly role: string; readonly unit: string }> = {
  METRIC: { name: 'Metric', role: 'File xuất tải lên tay', unit: 'file' },
  KALODATA: { name: 'Kalodata', role: 'Số liệu sản phẩm theo kỳ', unit: 'lần thu' },
  KALODATA_VIDEO_FILE: { name: 'Kalodata video', role: 'File video và creator tải lên tay', unit: 'file' },
  APIFY_SHOPEE: { name: 'Apify review Shopee', role: 'Review Shopee theo link', unit: 'lần thu' },
  APIFY_TIKTOK_COMMENTS: { name: 'Apify bình luận TikTok', role: 'Bình luận dưới video TikTok', unit: 'lần thu' },
  VIDEO_READING: { name: 'Đọc nội dung video', role: 'Lời thoại và chữ trên video bán hàng', unit: 'file' },
  META_AD_LIBRARY: { name: 'Thư viện quảng cáo Meta', role: 'Ngày bắt đầu và trạng thái quảng cáo', unit: 'lần đọc' },
  SERPAPI: { name: 'SerpApi', role: 'Tìm kiếm Google và Google Trends', unit: 'lần thu' },
  OFFICIAL_STATS: { name: 'Cục Thống kê', role: 'Số liệu vĩ mô từ nso.gov.vn', unit: 'file' },
  WORLD_BANK: { name: 'Ngân hàng Thế giới', role: 'Số liệu vĩ mô mở, không cần khóa', unit: 'lần lấy' },
  PAGEINDEX: { name: 'PageIndex', role: 'Tự lập chỉ mục cho PDF', unit: 'tài liệu' },
};

const OPERATION_COPY: Record<string, { readonly name: string; readonly tierNote: string }> = {
  'serpapi.google.search': { name: 'Tìm kiếm Google mở rộng', tierNote: 'Hạng theo trang gốc' },
  'serpapi.google.trends': { name: 'Google Trends', tierNote: 'Hạng B' },
};

/** Paid collectors with an independent USD charge cap. Others are request-bounded and show no cap row. */
const CAPPED_SOURCES: readonly BoardSource[] = ['APIFY_SHOPEE', 'APIFY_TIKTOK_COMMENTS'];

/** Upload cards billed through the owner's subscription quota: no extra per-call charge, unlike pay-per-call collectors. */
const SUBSCRIPTION_SOURCES: readonly BoardSource[] = ['METRIC', 'KALODATA_VIDEO_FILE'];

const costLabel = (entry: BoardEntry): string =>
  entry.paid ? 'Trả phí theo lượt'
    : SUBSCRIPTION_SOURCES.includes(entry.source) ? 'Theo gói thuê bao (không tốn thêm mỗi lượt)' : 'Không tốn phí';

export function sourceStateView(entry: ResearchAutomationSourceStatusEntry): { readonly tone: 'ready' | 'partial' | 'missing' | 'manual' | 'off'; readonly label: string; readonly detail: string } {
  const state = entry.state;
  const pending = entry.pendingPackage;
  const noKey = entry.credential === 'NOT_REQUIRED';
  switch (state) {
    case 'READY': return { tone: 'ready', label: 'Đã kết nối',
      detail: noKey ? 'Không cần khóa; phiên nghiên cứu đang dùng nguồn này.' : 'Đã cài khóa và phiên nghiên cứu đang dùng nguồn này.' };
    case 'CONFIGURED_NOT_WIRED': return { tone: 'partial', label: noKey ? 'Chưa dùng' : 'Có khóa, chưa dùng',
      detail: noKey ? 'Không cần khóa; phiên nghiên cứu chưa gọi nguồn này.' : 'Đã cài khóa nhưng phiên nghiên cứu chưa gọi nguồn này.' };
    case 'MANUAL_IMPORT': return { tone: 'manual', label: 'Nhập tay', detail: 'Không cần khóa. Dữ liệu vào khi bạn tải file lên trong từng phiên.' };
    case 'EXECUTOR_DISABLED': return { tone: 'off', label: 'Máy chủ không chạy', detail: 'Máy chủ này chỉ đọc, không chạy phiên nghiên cứu nên không gọi nguồn nào.' };
    case 'NOT_BUILT': return { tone: 'missing', label: 'Chưa có bộ thu',
      detail: pending ? `Chưa có bộ thu (gói ${pending}). Thẻ này chỉ giữ chỗ, không phải nguồn đang chạy.` : 'Chưa có bộ thu. Thẻ này chỉ giữ chỗ, không phải nguồn đang chạy.' };
    case 'NOT_CONFIGURED':
    default:
      return { tone: 'missing', label: 'Chưa kết nối', detail: entry.credential === 'CONFIGURED'
        ? ((entry.spendCapUsd ?? 0) > 0
          ? 'Đã có token và hạn mức chi, nhưng bộ thu chưa sẵn sàng nên không tự thu.'
          : 'Đã có token nhưng thiếu hạn mức chi tối đa, nên không tự thu.')
        : noKey ? 'Nguồn này chưa được cấu hình cho phiên nghiên cứu.' : 'Chưa cài khóa trên máy chủ.' };
  }
}

const credentialLabel = (value: ResearchAutomationSourceStatusEntry['credential']) =>
  value === 'CONFIGURED' ? 'Đã cài' : value === 'MISSING' ? 'Thiếu' : 'Không cần khóa';

/** Micro-dollars to a short dollar string, e.g. 500000 -> $0.50. Null stays unknown, never 0. */
export function formatMicroDollars(value: number | null): string {
  if (value === null || !Number.isSafeInteger(value)) return 'Chưa rõ';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  return `${sign}$${Math.floor(abs / 1_000_000)}.${String(Math.floor((abs % 1_000_000) / 10_000)).padStart(2, '0')}`;
}

/** Workspace PDF history: null means the ledger is unavailable (unknown), never zero. */
export function pageIndexWorkspaceCopy(dataCount: number | null): string {
  if (dataCount === null) return 'Chưa rõ số PDF trong workspace này';
  if (dataCount > 0) return `${dataCount} PDF trong workspace này`;
  return 'Chưa có PDF nào trong workspace này';
}

/** Configured USD cap, e.g. 3 -> $3. Null stays unconfigured, never defaulted. */
export function formatCapUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return 'Chưa cấu hình';
  return `$${value} mỗi lượt`;
}

export function pageIndexAutomaticCopy(state: 'INDEXING_PDFS' | 'PAUSED_LOW_BALANCE' | 'DISABLED'): string {
  switch (state) {
    case 'INDEXING_PDFS': return 'Đang tự dùng cho PDF';
    case 'PAUSED_LOW_BALANCE': return 'Tạm dừng vì số dư thấp';
    case 'DISABLED': return 'Đã tắt';
  }
}

function groupOf(entry: BoardEntry): BoardGroup {
  const group = entry.group;
  if (group && GROUP_ORDER.includes(group)) return group;
  return LEGACY_GROUP[entry.source] ?? 'SALES_MARKET';
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

  const entries = (status?.sources ?? []).filter(entry => SOURCE_COPY[entry.source]);
  const grouped = GROUP_ORDER.map(group => ({ group, cards: entries.filter(entry => groupOf(entry) === group) })).filter(section => section.cards.length);

  return <section className="ra-sources surface" aria-labelledby="ra-sources-title">
    <div className="ra-sources-head"><div><h2 id="ra-sources-title">Nguồn dữ liệu</h2><p className="ra-muted">Tình trạng kết nối của từng nguồn{status ? ` · kiểm tra lúc ${formatTime(status.checkedAt)}` : ''}.</p></div>{mode !== 'demo' && <button type="button" className="button" onClick={() => setTick(value => value + 1)}>Kiểm tra lại</button>}</div>
    {mode === 'demo' ? <p className="ra-muted">Demo không đọc cấu hình máy chủ. Chuyển sang dữ liệu thật để xem nguồn nào đã kết nối.</p>
      : loadingWorkspace === workspaceId && !status ? <p className="ra-muted" role="status">Đang kiểm tra nguồn dữ liệu…</p>
        : message ? <div className="ra-message error" role="alert"><p>{message}</p><button type="button" className="button" onClick={() => setTick(value => value + 1)}>Thử lại</button></div>
          : status ? <>
            {grouped.map(section => <div key={section.group} className="ra-sources-group" data-group={section.group}>
              <h3 className="ra-sources-group-title">{GROUP_COPY[section.group]}</h3>
              <ul className="ra-sources-grid">{section.cards.map(entry => {
                const copy = SOURCE_COPY[entry.source]; const view = sourceStateView(entry);
                const tier = entry.tier ?? entry.tierDetail ?? null;
                const capped = CAPPED_SOURCES.includes(entry.source);
                return <li key={entry.source} className={`ra-source ${view.tone}`} data-source={entry.source}>
                  <div><h3>{copy.name}</h3><small>{copy.role}</small></div>
                  <span className="status-pill">{view.label}</span>
                  <small>{view.detail}</small>
                  <dl>
                    <dt>Khóa</dt><dd>{credentialLabel(entry.credential)}</dd>
                    <dt>Chi phí</dt><dd>{costLabel(entry)}</dd>
                    {capped && <><dt>Trần chi</dt><dd>{formatCapUsd(entry.spendCapUsd)}</dd></>}
                    {entry.registryIds && entry.registryIds.length ? <><dt>Mã nguồn</dt><dd>{entry.registryIds.join(', ')}</dd></> : null}
                    {tier ? <><dt>Hạng</dt><dd>{entry.tier ?? ''}{entry.tier && entry.tierDetail ? ` (${entry.tierDetail})` : entry.tierDetail ?? ''}</dd></> : null}
                    {entry.reportName ? <><dt>Tên trong báo cáo</dt><dd>{entry.reportName}</dd></> : null}
                    <dt>Dữ liệu</dt><dd>{entry.source === 'PAGEINDEX'
                      ? pageIndexWorkspaceCopy(entry.dataCount)
                      : (entry.dataCount === null ? 'Chưa rõ' : entry.dataCount ? `${entry.dataCount} ${copy.unit} · gần nhất ${entry.lastDataAt ? formatTime(entry.lastDataAt) : '-'}` : 'Chưa có trong workspace')}</dd>
                    {entry.paid && <><dt>Gọi gần nhất</dt><dd>{entry.lastUsageAt ? formatTime(entry.lastUsageAt) : 'Chưa gọi'}</dd></>}
                    {entry.source === 'SERPAPI' && (entry.operations ?? []).map(operation => {
                      const operationCopy = OPERATION_COPY[operation.operation];
                      return <div key={operation.operation} className="ra-source-operation" data-operation={operation.operation}>
                        <dt>{operationCopy?.name ?? operation.operation}</dt>
                        <dd>{operation.count ? `${operation.count} lần thu · gần nhất ${operation.lastDataAt ? formatTime(operation.lastDataAt) : '-'}` : 'Chưa có lượt nào trong workspace'}{operationCopy ? ` · ${operationCopy.tierNote}` : ''}</dd>
                      </div>;
                    })}
                    {entry.source === 'PAGEINDEX' && entry.pageindex && <>
                      <dt>Số dư tài khoản (ước tính)</dt><dd>{formatMicroDollars(entry.pageindex.balanceMicroDollars)}{entry.pageindex.balanceCheckedAt ? ` · kiểm tra lúc ${formatTime(entry.pageindex.balanceCheckedAt)}` : ''}{entry.pageindex.billingUrl ? <> · <a href={entry.pageindex.billingUrl} target="_blank" rel="noopener noreferrer">Thanh toán</a></> : null}</dd>
                      <dt>Tài liệu đã gửi (tài khoản)</dt><dd>{entry.pageindex.documentsSent ?? 'Chưa rõ'}</dd>
                      <dt>Trang đang lưu (tài khoản)</dt><dd>{entry.pageindex.activePages === null ? 'Chưa rõ' : `${entry.pageindex.activePages} trang`} · khoảng {formatMicroDollars(entry.pageindex.estimatedMonthlyCostMicroDollars)}/tháng</dd>
                      <dt>Tự động</dt><dd>{pageIndexAutomaticCopy(entry.pageindex.automaticState)}</dd>
                    </>}
                  </dl>
                  {entry.source === 'PAGEINDEX' && entry.pageindex && <>
                    {entry.pageindex.automaticState !== 'INDEXING_PDFS' && <div className="ra-message error" role="alert"><p>{entry.pageindex.automaticState === 'PAUSED_LOW_BALANCE' ? entry.pageindex.usageLimited ? 'Đã tạm dừng gửi PDF mới. PageIndex báo đã hết số dư.' : 'Đã tạm dừng gửi PDF mới vì số dư thấp.' : 'Lập chỉ mục tự động đang tắt; PDF mới không được gửi.'}</p></div>}
                    <button type="button" className="button" disabled={!ownerToken || !writesAvailable || rechecking} onClick={() => void checkPdfConnector()}>{rechecking ? 'Đang kiểm tra PDF…' : 'Kiểm tra lại PDF'}</button>
                    <small>Nút này là hành động riêng của chủ sở hữu: đọc danh sách tài liệu miễn phí của tài khoản PageIndex rồi ghi lại kết quả. Không gửi PDF mới, không hỏi đáp tài liệu.</small>
                  </>}
                </li>;
              })}</ul>
            </div>)}
            <p className="ra-muted ra-sources-note">Bảng đọc cấu hình và lịch sử trong workspace này qua yêu cầu GET, không gọi thử nguồn nên không tốn phí. Nút “Kiểm tra lại” chỉ tải lại bảng. Nút “Kiểm tra lại PDF” là hành động POST riêng của chủ sở hữu. “Đã kết nối” nghĩa là khóa đã được cài, chưa chứng minh khóa còn hạn hoặc còn hạn mức. Số dư, tài liệu đã gửi và trang đang lưu của PageIndex là số của cả tài khoản, không phải của workspace này.</p>
          </> : null}
  </section>;
}
