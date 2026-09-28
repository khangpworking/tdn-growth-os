import { useEffect, useState } from 'react';
import type {
  Citation,
  ReportInterpretationDetailResponse,
  ReportInterpretationIndexResponse,
} from '../../contracts/api/report-api.generated';
import {
  interpretationMatchesSummary,
  loadReportInterpretation,
  loadReportInterpretations,
  WorkspaceDataSourceError,
} from './data-source';

type LoadState = 'loading' | 'ready' | 'error';

interface Props {
  readonly reportId: string;
  readonly reportVersion: number;
  readonly semanticVersionId: string;
}

export default function ReportInterpretations({ reportId, reportVersion, semanticVersionId }: Props) {
  const [indexState, setIndexState] = useState<LoadState>('loading');
  const [index, setIndex] = useState<ReportInterpretationIndexResponse | null>(null);
  const [indexError, setIndexError] = useState('');
  const [indexRetry, setIndexRetry] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [detailState, setDetailState] = useState<LoadState>('loading');
  const [detail, setDetail] = useState<ReportInterpretationDetailResponse | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailRetry, setDetailRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setIndexState('loading');
    setIndex(null);
    setIndexError('');
    setSelectedId('');
    setDetail(null);
    void loadReportInterpretations(reportId, reportVersion).then(value => {
      if (!active) return;
      if (value.interpretations.some(item => item.sourceSemanticVersionId !== semanticVersionId)) {
        throw new WorkspaceDataSourceError('integrity', 'Nhận định AI không khớp semantic version đã chọn.');
      }
      setIndex(value);
      setIndexState('ready');
    }).catch(error => {
      if (!active) return;
      setIndexState('error');
      setIndexError(error instanceof WorkspaceDataSourceError && error.kind === 'integrity'
        ? 'Danh mục nhận định không vượt qua kiểm tra toàn vẹn.'
        : 'Chưa tải được các nhận định đã lưu.');
    });
    return () => { active = false; };
  }, [reportId, reportVersion, semanticVersionId, indexRetry]);

  useEffect(() => {
    if (!selectedId || !index) return;
    const summary = index.interpretations.find(item => item.interpretationId === selectedId);
    if (!summary) return;
    let active = true;
    setDetailState('loading');
    setDetail(null);
    setDetailError('');
    void loadReportInterpretation(reportId, reportVersion, selectedId).then(value => {
      if (!active) return;
      if (!interpretationMatchesSummary(value, summary)) {
        throw new WorkspaceDataSourceError('integrity', 'Chi tiết nhận định không khớp danh mục đã xác minh.');
      }
      setDetail(value);
      setDetailState('ready');
    }).catch(error => {
      if (!active) return;
      setDetailState('error');
      setDetailError(error instanceof WorkspaceDataSourceError && error.kind === 'integrity'
        ? 'Nhận định đã chọn không vượt qua replay toàn vẹn.'
        : 'Chưa tải được nhận định đã chọn.');
    });
    return () => { active = false; };
  }, [reportId, reportVersion, selectedId, index, detailRetry]);

  const selected = index?.interpretations.find(item => item.interpretationId === selectedId);
  return <section className="interpretation-workspace" aria-labelledby={`interpretations-${reportId}-${reportVersion}`}>
    <header className="interpretation-heading">
      <div>
        <p className="eyebrow">Lớp 3 · Nhận định AI đã lưu</p>
        <h5 id={`interpretations-${reportId}-${reportVersion}`}>Diễn giải cho đúng báo cáo v{reportVersion}</h5>
        <p>Mỗi lần tạo được lưu riêng. Hệ thống không gọi lại AI khi bạn mở phần này.</p>
      </div>
      <span className="status-pill hold">Chưa được duyệt</span>
    </header>
    <p className="interpretation-boundary">Nhận định AI là lớp diễn giải dựa trên bằng chứng và kết quả tính toán đã lưu. Nó không trở thành bằng chứng nguồn hoặc quyết định của bạn.</p>

    {indexState === 'loading' && <Loading>Đang kiểm tra các nhận định đã lưu cho phiên bản này…</Loading>}
    {indexState === 'error' && <ErrorMessage message={indexError} retry={() => setIndexRetry(value => value + 1)} />}
    {indexState === 'ready' && index?.interpretations.length === 0 && <div className="interpretation-empty">
      <strong>Phiên bản báo cáo này chưa có nhận định AI đã lưu.</strong>
      <p>Số liệu và chart vẫn là lớp kết quả xác minh; hệ thống không tự tạo nhận định khi mở trang.</p>
    </div>}
    {indexState === 'ready' && index && index.interpretations.length > 0 && <div className="interpretation-layout">
      <nav className="interpretation-runs" aria-label="Các lần diễn giải đã lưu">
        {index.interpretations.map(item => <button
          className={selectedId === item.interpretationId ? 'interpretation-run selected' : 'interpretation-run'}
          key={item.interpretationId}
          type="button"
          aria-pressed={selectedId === item.interpretationId}
          onClick={() => setSelectedId(item.interpretationId)}
        >
          <span>Lần diễn giải {item.interpretationNumber}</span>
          <small>{item.itemCount} nhận định · {item.sectionIds.join(', ')}</small>
          <small>Hoàn tất {formatDate(item.completedAt)}</small>
        </button>)}
      </nav>
      <div className="interpretation-detail" aria-live="polite">
        {!selected && <div className="interpretation-prompt"><strong>Chọn một lần diễn giải để đọc.</strong><p>Không có lần nào được ngầm coi là “mới nhất” hoặc chính thức.</p></div>}
        {selected && detailState === 'loading' && <Loading>Đang kiểm tra lại nhận định và các liên kết bằng chứng…</Loading>}
        {selected && detailState === 'error' && <ErrorMessage message={detailError} retry={() => setDetailRetry(value => value + 1)} />}
        {selected && detailState === 'ready' && detail && <InterpretationDetail value={detail} />}
      </div>
    </div>}
  </section>;
}

function InterpretationDetail({ value }: { readonly value: ReportInterpretationDetailResponse }) {
  const { interpretation } = value;
  return <>
    <div className="interpretation-meta">
      <div><span>Phiên bản nguồn</span><strong>Báo cáo v{value.reportVersion}</strong></div>
      <div><span>Hoàn tất</span><strong>{formatDate(interpretation.completedAt)}</strong></div>
      <div><span>Model đã dùng</span><strong>{interpretation.generation.modelId}</strong></div>
    </div>
    <ol className="interpretation-items">
      {interpretation.items.map(item => <li key={item.itemId}>
        <header>
          <span className="section-label">{item.sectionId}</span>
          <span className={item.kind === 'HYPOTHESIS' ? 'kind hypothesis' : 'kind'}>{item.kind === 'HYPOTHESIS' ? 'Giả thuyết' : 'Nhận định'}</span>
        </header>
        <h6>{item.conclusion}</h6>
        <section className="logic-block" aria-label="Logic bằng chứng">
          <strong>Vì sao có nhận định này</strong>
          <p>{item.evidenceLogic}</p>
        </section>
        <div className="citation-list">
          <strong>Bằng chứng được viện dẫn</strong>
          {item.citations.map((citation, index) => <CitationRow key={`${item.itemId}-${citation.claimId}-${index}`} value={citation} />)}
        </div>
        {item.assumptions.length > 0 && <TextList title="Giả định" values={item.assumptions} />}
        <TextList title="Giới hạn" values={item.limitations} />
      </li>)}
    </ol>
    <section className="interpretation-overall-limit">
      <TextList title="Giới hạn chung của lần diễn giải" values={interpretation.limitations} />
    </section>
    <details className="interpretation-trace">
      <summary>Định danh truy vết và cấu hình lần tạo</summary>
      <dl>
        <div><dt>Provider / model</dt><dd>{interpretation.generation.providerId} / {interpretation.generation.modelId}</dd></div>
        <div><dt>Prompt</dt><dd>{interpretation.generation.promptId} · v{interpretation.generation.promptVersion}</dd></div>
        <div><dt>Output schema</dt><dd>{interpretation.generation.outputSchemaVersion}</dd></div>
        <div><dt>Semantic version</dt><dd><code>{interpretation.source.semanticVersionId}</code></dd></div>
        <div><dt>Packet</dt><dd><code>{interpretation.source.packetId}</code></dd></div>
        <div><dt>Claims digest</dt><dd><code>{interpretation.source.claimsSha256}</code></dd></div>
      </dl>
    </details>
  </>;
}

function CitationRow({ value }: { readonly value: Citation }) {
  return <details className="citation-row">
    <summary>
      <span><b>{value.claimId}</b><small>{statementLabel(value.statementKind)} · phạm vi {value.scopeKey}</small></span>
      <strong>{formatMetric(value.value, value.unit)}</strong>
    </summary>
    <dl>
      <div><dt>Metric</dt><dd><code>{value.metricPointer}</code></dd></div>
      <div><dt>Membership</dt><dd><code>{value.membershipPointer}</code></dd></div>
      {value.denominatorPointer && <div><dt>Mẫu số</dt><dd><code>{value.denominatorPointer}</code></dd></div>}
      {value.coveragePointer && <div><dt>Coverage</dt><dd><code>{value.coveragePointer}</code></dd></div>}
    </dl>
    <TextList title="Giới hạn của citation" values={value.limitations} />
  </details>;
}

function TextList({ title, values }: { readonly title: string; readonly values: readonly string[] }) {
  return <section className="interpretation-list"><strong>{title}</strong><ul>{values.map(value => <li key={value}>{value}</li>)}</ul></section>;
}

function Loading({ children }: { readonly children: string }) {
  return <div className="report-loading" role="status"><span className="report-skeleton" /><span>{children}</span></div>;
}

function ErrorMessage({ message, retry }: { readonly message: string; readonly retry: () => void }) {
  return <div className="report-message error" role="alert"><p>{message}</p><button className="button" type="button" onClick={retry}>Thử lại</button></div>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function statementLabel(value: Citation['statementKind']): string {
  return ({ LISTING_COUNT: 'Số listing', SHOP_COUNT: 'Số shop', OBSERVED_REVENUE: 'Doanh thu quan sát', OBSERVED_UNITS: 'Sản lượng quan sát', TOP_SHOP_SHARE: 'Tỷ trọng top shop' } as const)[value];
}

function formatMetric(value: Citation['value'], unit: Citation['unit']): string {
  const rendered = typeof value === 'number' ? value.toLocaleString('vi-VN') : value;
  if (unit === 'VND') return `${rendered} ₫`;
  if (unit === 'percent') return `${rendered}%`;
  return `${rendered} ${unit === 'listing' ? 'listing' : unit === 'shop' ? 'shop' : 'đơn vị'}`;
}
