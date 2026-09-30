import { useEffect, useMemo, useState } from 'react';
import type { ReportInputReadinessCheck, ReportSectionReadinessEntry, ReportSectionReadinessResponse } from '../../contracts/api/report-api.generated';
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

const inputStateCopy: Record<ReportInputReadinessCheck['state'], { readonly label: string; readonly className: string }> = {
  PRESENT: { label: 'Đã có', className: 'present' },
  ABSENT: { label: 'Còn thiếu', className: 'absent' },
  INVALID: { label: 'Chưa tương thích', className: 'invalid' },
};

const inputLabels: Readonly<Record<string, string>> = {
  'adjudication-provenance': 'Nguồn gốc việc phân loại case',
  'canonical-tablet-quote-input': 'Quote viên đã chuẩn hóa',
  'case-locators': 'Vị trí truy ngược từng case',
  'comparable-groups': 'Các nhóm có thể so sánh',
  'compatible-daily-series': 'Chuỗi ngày cùng định nghĩa',
  denominators: 'Mẫu số cho nhóm so sánh',
  'domain-specific-evidence': 'Bằng chứng riêng cho câu hỏi',
  'exact-raw-quote-source-and-locator': 'Nguồn quote và vị trí chính xác',
  'exact-source-package-lineage': 'Chuỗi nguồn chính xác',
  'existing-relevant-outcomes': 'Kết quả hành vi liên quan',
  'explicit-price-state-and-observation-time': 'Trạng thái giá và thời điểm quan sát',
  'frozen-label-decisions': 'Nhãn phân loại đã đóng băng',
  'held-out-horizon': 'Khoảng dữ liệu giữ lại để kiểm định',
  'measurement-design': 'Thiết kế đo lường',
  'metric-result': 'Kết quả tính deterministic',
  'normalization-receipt': 'Biên bản chuẩn hóa',
  'normalized-metric-rows': 'Dòng Metric đã chuẩn hóa',
  'optional-owner-declared-tablet-count': 'Số viên do người dùng khai báo — không bắt buộc',
  'owner-question': 'Câu hỏi kinh doanh của người dùng',
  'owner-review': 'Quyết định xem xét của người dùng',
  'resolved-fact-claim-pointers': 'Con trỏ fact đã phân giải',
  scope: 'Phạm vi báo cáo',
  'source-bound-claims': 'Fact gắn với nguồn',
  'source-manifest': 'Manifest nguồn',
  'source-package-manifest': 'Manifest gói nguồn',
  'source-scope': 'Phạm vi nguồn',
  'validated-metrics': 'Metric đã được tính và phát lại',
  'verified-locators': 'Vị trí nguồn đã kiểm tra',
  'verified-locators-and-denominators': 'Vị trí nguồn và mẫu số đã kiểm tra',
  'verified-method-artifacts': 'Hồ sơ phương pháp đã kiểm tra',
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
      <div><h5 id={`section-readiness-${reportId}-${reportVersion}`}>{readiness.sections.length} section đang ở đâu?</h5><p>Đang đối chiếu report v{reportVersion}. Mỗi input được kiểm tra là đã có, còn thiếu hay chưa tương thích. “Có phương pháp” không có nghĩa là đã có dữ liệu hoặc kết luận.</p></div>
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
  const present = section.inputChecks.filter(check => check.state === 'PRESENT').length;
  const blocked = section.inputChecks.filter(check => check.blocking).length;
  return <details className={`readiness-card ${copy.className}`}>
    <summary><span className="readiness-section-id">{section.sectionId}</span><span className="readiness-title"><strong>{section.title}</strong><small className={copy.className}>{copy.label}</small></span><span className="readiness-claims">{present}/{section.inputChecks.length} input · {blocked} chặn</span></summary>
    <div className="readiness-detail">
      <dl><div><dt>Method</dt><dd><code>{section.methodId}</code> · v{section.methodVersion}</dd></div><div><dt>Module</dt><dd>{section.moduleIds.join(', ')}</dd></div><div><dt>Maturity tham khảo</dt><dd>{section.historicalTemplateMaturity}</dd></div><div><dt>Fallback catalog</dt><dd>{section.fallbackState}</dd></div></dl>
      <section className="input-readiness"><strong>Điều kiện đầu vào đã đối chiếu</strong>{section.inputChecks.length === 0
        ? <p>Section này không khai báo input riêng.</p>
        : <div className="input-checks">{section.inputChecks.map(check => <InputCheck key={check.inputId} check={check} />)}</div>}</section>
      <List title="Blocker hiện tại" values={section.blockers} empty="Không có blocker được ghi trong packet." code />
      <List title="Lý do fallback" values={section.fallbackReasons} empty="Catalog chưa khai báo lý do fallback." code />
      <List title="Claim đã tạo" values={section.claimIds} empty="Chưa có claim định lượng." code />
      <List title="Evidence pointer" values={section.contextPointers} empty="Chưa có pointer đủ điều kiện." code />
      {section.methodArtifact && <section><strong>Hồ sơ phương pháp có cấu trúc</strong><p><code>{section.methodArtifact.fileName}</code></p><p>Output ID · <code>{section.methodArtifact.methodOutputId}</code></p><p>SHA-256 · <code>{section.methodArtifact.sha256}</code></p></section>}
      <section><strong>Điều kiện mở lại</strong><p>{section.reopenCondition}</p></section>
      <small className="section-digest">Section digest · <code>{section.sectionSha256}</code></small>
    </div>
  </details>;
}

function InputCheck({ check }: { readonly check: ReportInputReadinessCheck }) {
  const copy = inputStateCopy[check.state];
  return <details className={`input-check ${copy.className}`}>
    <summary><span>{inputLabels[check.inputId] ?? check.inputId}</span><small>{copy.label}{!check.blocking && check.state !== 'PRESENT' ? ' · không bắt buộc' : ''}</small></summary>
    <div><p>Mã kiểm tra: {check.codes.map(code => <code key={code}>{code}</code>)}</p>{check.evidenceRefs.length > 0
      ? <ul>{check.evidenceRefs.map(reference => <li key={`${reference.kind}:${reference.locator}`}><span>{reference.kind}</span> · <code>{reference.locator}</code><br /><small>SHA-256 · <code>{reference.sha256}</code></small></li>)}</ul>
      : <p>Chưa có evidence reference cho input này trong phiên bản báo cáo đang xem.</p>}</div>
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
