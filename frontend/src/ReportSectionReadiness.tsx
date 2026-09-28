import { useEffect, useMemo, useState } from 'react';
import type { ReportSectionReadinessEntry, ReportSectionReadinessResponse } from '../../contracts/api/report-api.generated';
import { loadReportSectionReadiness, WorkspaceDataSourceError } from './data-source';

type LoadState = 'loading' | 'ready' | 'error';
type Family = 'ALL' | 'MARKET' | 'INSIGHT';

const stateCopy: Record<ReportSectionReadinessEntry['deliveryState'], { readonly label: string; readonly className: string }> = {
  PARTIAL_DETERMINISTIC_DRAFT: { label: 'Code đã tính · một phần', className: 'calculated' },
  METHOD_ONLY: { label: 'Có phương pháp · chưa chạy', className: 'method' },
  BLOCKED: { label: 'Thiếu điều kiện', className: 'blocked' },
  MANUAL_REVIEW_REQUIRED: { label: 'Cần người dùng', className: 'manual' },
  NOT_IMPLEMENTED: { label: 'Chưa triển khai', className: 'not-implemented' },
};

export default function ReportSectionReadiness({ reportId, reportVersion, semanticVersionId }: { readonly reportId: string; readonly reportVersion: number; readonly semanticVersionId: string }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [readiness, setReadiness] = useState<ReportSectionReadinessResponse | null>(null);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const [family, setFamily] = useState<Family>('ALL');

  useEffect(() => {
    let active = true;
    setLoadState('loading'); setReadiness(null); setMessage(''); setFamily('ALL');
    void loadReportSectionReadiness(reportId, reportVersion).then(value => {
      if (!active) return;
      if (value.semanticVersionId !== semanticVersionId) throw new WorkspaceDataSourceError('integrity', 'Ma trận section không thuộc semantic version đang xem.');
      setReadiness(value); setLoadState('ready');
    }).catch(error => {
      if (!active) return;
      setLoadState('error');
      setMessage(error instanceof WorkspaceDataSourceError && error.kind === 'integrity'
        ? 'Ma trận section không vượt qua kiểm tra toàn vẹn.'
        : 'Chưa tải được điều kiện chạy của các section.');
    });
    return () => { active = false; };
  }, [reportId, reportVersion, semanticVersionId, retry]);

  const visible = useMemo(() => readiness?.sections.filter(section => family === 'ALL' || (family === 'MARKET' ? section.sectionId.startsWith('M') : section.sectionId.startsWith('I'))) ?? [], [readiness, family]);
  if (loadState === 'loading') return <section className="section-readiness surface"><div className="report-loading" role="status"><span className="report-skeleton" /><span>Đang đối chiếu điều kiện chạy của từng section…</span></div></section>;
  if (loadState === 'error' || !readiness) return <section className="section-readiness surface"><div className="report-message error" role="alert"><p>{message}</p><button className="button" type="button" onClick={() => setRetry(value => value + 1)}>Thử lại</button></div></section>;

  const counts = countStates(readiness.sections);
  return <section className="section-readiness" aria-labelledby={`section-readiness-${reportId}-${reportVersion}`}>
    <header className="section-readiness-heading">
      <div><h5 id={`section-readiness-${reportId}-${reportVersion}`}>{readiness.sections.length} section đang ở đâu?</h5><p>Đang đối chiếu report v{reportVersion}. Trạng thái đến từ packet đã replay. “Có phương pháp” không có nghĩa là đã có dữ liệu hoặc kết luận.</p></div>
      <div className="readiness-total"><strong>{counts.PARTIAL_DETERMINISTIC_DRAFT}</strong><span>section có kết quả code</span></div>
    </header>
    <div className="readiness-counts" aria-label="Tổng hợp trạng thái section">
      {Object.entries(stateCopy).map(([state, copy]) => <div key={state}><i className={copy.className} /><strong>{counts[state as keyof typeof counts]}</strong><span>{copy.label}</span></div>)}
    </div>
    <div className="readiness-toolbar" role="group" aria-label="Lọc nhóm section">
      {([['ALL', `Tất cả ${readiness.sections.length}`], ['MARKET', 'Market M01–M13'], ['INSIGHT', 'Insight I01–I17']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={family === value} onClick={() => setFamily(value)}>{label}</button>)}
    </div>
    <div className="readiness-grid">
      {visible.map(section => <SectionCard key={section.sectionId} section={section} />)}
    </div>
    <details className="readiness-trace"><summary>Định danh catalog và packet</summary><dl><div><dt>Catalog</dt><dd>{readiness.catalogId} · {readiness.catalogVersion}</dd></div><div><dt>Catalog SHA-256</dt><dd><code>{readiness.catalogSha256}</code></dd></div><div><dt>Packet ID</dt><dd><code>{readiness.packetId}</code></dd></div><div><dt>Semantic version</dt><dd><code>{readiness.semanticVersionId}</code></dd></div></dl></details>
  </section>;
}

function SectionCard({ section }: { readonly section: ReportSectionReadinessEntry }) {
  const copy = stateCopy[section.deliveryState];
  return <details className={`readiness-card ${copy.className}`}>
    <summary><span className="readiness-section-id">{section.sectionId}</span><span className="readiness-title"><strong>{section.title}</strong><small className={copy.className}>{copy.label}</small></span><span className="readiness-claims">{section.claimIds.length} claim</span></summary>
    <div className="readiness-detail">
      <dl><div><dt>Method</dt><dd><code>{section.methodId}</code> · v{section.methodVersion}</dd></div><div><dt>Module</dt><dd>{section.moduleIds.join(', ')}</dd></div><div><dt>Maturity tham khảo</dt><dd>{section.historicalTemplateMaturity}</dd></div><div><dt>Fallback catalog</dt><dd>{section.fallbackState}</dd></div></dl>
      <List title="Input cần có" values={section.requiredInputs} empty="Catalog chưa khai báo input riêng." />
      <List title="Blocker hiện tại" values={section.blockers} empty="Không có blocker được ghi trong packet." code />
      <List title="Lý do fallback" values={section.fallbackReasons} empty="Catalog chưa khai báo lý do fallback." code />
      <List title="Claim đã tạo" values={section.claimIds} empty="Chưa có claim định lượng." code />
      <List title="Evidence pointer" values={section.contextPointers} empty="Chưa có pointer đủ điều kiện." code />
      <section><strong>Điều kiện mở lại</strong><p>{section.reopenCondition}</p></section>
      <small className="section-digest">Section digest · <code>{section.sectionSha256}</code></small>
    </div>
  </details>;
}

function List({ title, values, empty, code = false }: { readonly title: string; readonly values: readonly string[]; readonly empty: string; readonly code?: boolean }) {
  return <section><strong>{title}</strong>{values.length > 0 ? <ul>{values.map(value => <li key={value}>{code ? <code>{value}</code> : value}</li>)}</ul> : <p>{empty}</p>}</section>;
}

function countStates(sections: readonly ReportSectionReadinessEntry[]): Record<ReportSectionReadinessEntry['deliveryState'], number> {
  const counts = { PARTIAL_DETERMINISTIC_DRAFT: 0, METHOD_ONLY: 0, BLOCKED: 0, MANUAL_REVIEW_REQUIRED: 0, NOT_IMPLEMENTED: 0 };
  for (const section of sections) counts[section.deliveryState] += 1;
  return counts;
}
