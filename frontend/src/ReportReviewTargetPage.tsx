import { useEffect, useState } from 'react';
import type { ReportReviewTarget } from '../../contracts/api/report-api.generated';
import { reportArtifactUrl, type FrontendMode } from './data-source';
import { loadReportReviewTarget, ReportReviewTargetDataError } from './report-review-data-source';
import { routeToHash } from './routing';

type State = 'loading' | 'ready' | 'error';

export default function ReportReviewTargetPage({ mode, reviewTargetId, navigate }: { readonly mode: FrontendMode; readonly reviewTargetId: string; readonly navigate: (hash: string) => void }) {
  const [state, setState] = useState<State>('loading');
  const [target, setTarget] = useState<ReportReviewTarget | null>(null);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (mode === 'demo') { setState('error'); setMessage('Demo không tạo hoặc mô phỏng gói review.'); return; }
    let active = true;
    setState('loading'); setTarget(null); setMessage('');
    void loadReportReviewTarget(reviewTargetId).then(value => {
      if (!active) return;
      setTarget(value); setState('ready');
    }).catch(error => {
      if (!active) return;
      const problem = error instanceof ReportReviewTargetDataError ? error : new ReportReviewTargetDataError('connection', 'Không thể tải gói review.');
      setState('error');
      setMessage(problem.kind === 'not_found'
        ? 'Không tìm thấy gói review theo đúng định danh này.'
        : problem.kind === 'integrity'
          ? 'Gói review không vượt qua replay toàn vẹn. Nội dung đã được đóng an toàn.'
          : problem.message);
    });
    return () => { active = false; };
  }, [mode, reviewTargetId, retry]);

  if (state === 'loading') return <section className="surface review-target-page"><div className="report-loading" role="status"><span className="report-skeleton" /><span>Đang replay report, interpretation và gói review…</span></div></section>;
  if (state === 'error' || !target) return <section className="surface review-target-page"><div className="report-message error" role="alert"><strong>Chưa mở được gói review</strong><p>{message}</p>{mode === 'real' && <button className="button" type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button>}</div></section>;

  const deterministic = target.calculation.sections.filter(section => section.deliveryState === 'PARTIAL_DETERMINISTIC_DRAFT').length;
  return <section className="review-target-page">
    <nav className="crumb" aria-label="Đường dẫn">
      <button type="button" onClick={() => navigate(routeToHash.portfolio())}>Danh mục thị trường</button>
      <span aria-hidden="true">/</span><span>Gói review</span>
    </nav>
    <header className="review-target-hero">
      <div><p className="eyebrow">Gói review bất biến</p><h1>{target.report.reportKey} · v{target.report.version}</h1><p>{target.approvalScope.marketKey} · {target.approvalScope.platform.toUpperCase()} · {target.approvalScope.start} → {target.approvalScope.end}</p></div>
      <span className="status-pill hold">Chưa được duyệt</span>
    </header>
    <p className="review-target-boundary">Gói này chỉ gom đúng evidence, phép tính, nhận định AI và mục đích sử dụng để người dùng xem. Nó không phải quyết định và không cấp quyền xuất bản.</p>
    <div className="review-layer-grid" aria-label="Bốn lớp của gói review">
      <article><span>01</span><strong>Evidence nguồn</strong><b>{target.approvalScope.selectedSources.length} file</b><small>Đúng source package đã khóa</small></article>
      <article><span>02</span><strong>Kết quả tính toán</strong><b>{deterministic}/{target.calculation.sections.length} phần</b><small>Phương pháp deterministic hiện có</small></article>
      <article><span>03</span><strong>Nhận định AI</strong><b>{target.reviewableContent.interpretationItemIds.length} mục</b><small>Lần diễn giải {target.interpretation.interpretationNumber}</small></article>
      <article className="pending"><span>04</span><strong>Quyết định người dùng</strong><b>Chưa có</b><small>Không có nút phê duyệt trong bước này</small></article>
    </div>
    <div className="review-target-layout">
      <article className="surface surface-pad review-target-main">
        <section><p className="eyebrow">Mục đích đã khóa</p><h2>{target.approvalScope.intendedUse}</h2></section>
        <dl className="review-target-facts">
          <div><dt>Phạm vi thời gian</dt><dd>{target.approvalScope.start} → {target.approvalScope.end}</dd></div>
          <div><dt>Nền tảng</dt><dd>{target.approvalScope.platform.toUpperCase()}</dd></div>
          <div><dt>Cơ sở kỳ đo</dt><dd>{target.approvalScope.periodBasis}</dd></div>
          <div><dt>Filter nguồn</dt><dd>{target.approvalScope.selection}</dd></div>
        </dl>
        <div className="report-actions">
          <a className="button primary" href={reportArtifactUrl(target.report.reportId, target.report.version, target.renderedReport.fileName)} target="_blank" rel="noreferrer">Mở report đã khóa</a>
          <button className="button" type="button" onClick={() => navigate(routeToHash.portfolio())}>Về danh mục thị trường</button>
        </div>
      </article>
      <aside className="surface surface-pad review-target-aside">
        <h2>Điểm cần người dùng lưu ý</h2>
        <ul>{target.limitations.map(item => <li key={item}>{limitationLabel(item)}</li>)}</ul>
        <details><summary>Định danh truy vết</summary><dl><div><dt>Target</dt><dd><code>{target.reviewTargetId}</code></dd></div><div><dt>Model</dt><dd>{target.interpretation.modelId}</dd></div><div><dt>Prompt</dt><dd>{target.interpretation.promptId} · v{target.interpretation.promptVersion}</dd></div><div><dt>Method</dt><dd>{target.calculation.metricMethodVersion}</dd></div></dl></details>
      </aside>
    </div>
  </section>;
}

function limitationLabel(value: string): string {
  return ({
    UNAPPROVED_REVIEW_TARGET_NOT_A_HUMAN_DECISION: 'Gói này chưa được phê duyệt và không phải quyết định của con người.',
    TARGET_DOES_NOT_TRANSFER_TO_ANOTHER_REPORT_VERSION_INTERPRETATION_SCOPE_USE_OR_RENDERED_FILE: 'Kết quả review không tự chuyển sang report, interpretation, scope, mục đích hoặc file render khác.',
    SOURCE_RIGHTS_AND_EXTERNAL_PUBLICATION_NOT_GRANTED: 'Quyền sử dụng nguồn và xuất bản ra bên ngoài chưa được cấp.',
    GEOGRAPHY_NOT_DECLARED_IN_SOURCE_SCOPE: 'Địa lý chưa được khai báo trong source scope.',
    REVIEW_AUTHORITY_DELEGATION_AND_REVOCATION_NOT_DEFINED: 'Quyền duyệt, ủy quyền và thu hồi quyết định chưa được định nghĩa.',
  } as Record<string, string>)[value] ?? value;
}
