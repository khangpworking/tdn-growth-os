import { useEffect, useState } from 'react';
import type { InsightReportStatement } from '../../contracts/analysis/insight-report-statement.generated';
import type { ContentInsightReport } from '../../contracts/api/content-insight-reports-api.generated';
import { EMPTY_REPORTS, loadInsightReports, loadReportStatements, reportLabel } from './insight-report-data-source';
export const STAGE_LABEL = { AWARENESS: 'Biết đến', INTEREST: 'Quan tâm', DESIRE: 'Muốn mua', PURCHASE: 'Mua', POST_PURCHASE: 'Sau mua' } as const;
export const CONFIDENCE_LABEL = { CERTAIN: 'Chắc', FAIR: 'Khá', WEAK: 'Yếu', NONE: 'Không' } as const;
export function StatementLabels({ statement }: { statement: InsightReportStatement }) {
  return <span>{STAGE_LABEL[statement.purchaseStage]} · {CONFIDENCE_LABEL[statement.confidence.level]}{statement.confidence.hypothesis ? ' · Giả thuyết' : ''}</span>;
}
export default function InsightReportPicker({ disabled, initialRevisionId = '', demo = false, onApply }: { disabled: boolean; initialRevisionId?: string; demo?: boolean; onApply: (statement: InsightReportStatement) => void }) {
  const [reports, setReports] = useState<ContentInsightReport[] | null>(null);
  const [revisionId, setRevisionId] = useState(initialRevisionId);
  const [statements, setStatements] = useState<InsightReportStatement[] | null>(null);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => { setRevisionId(initialRevisionId); }, [initialRevisionId]);
  useEffect(() => {
    if (demo) { setReports([]); return; }
    let active = true;
    setError(''); setReports(null);
    loadInsightReports().then(value => { if (active) setReports(value.reports); }).catch(() => { if (active) setError('Chưa tải được báo cáo Insight.'); });
    return () => { active = false; };
  }, [demo, tick]);
  useEffect(() => {
    setSelected(''); setStatements(null);
    if (!revisionId || demo) return;
    let active = true;
    setError('');
    loadReportStatements(revisionId).then(value => { if (active) setStatements(value.statements.filter(statement => statement.confidence.level !== 'NONE')); }).catch(() => { if (active) setError('Không đọc được câu insight của bản đã chọn.'); });
    return () => { active = false; };
  }, [revisionId, demo, tick]);
  const statement = statements?.find(entry => entry.statementId === selected);
  return <section className="surface surface-pad" aria-label="Chọn câu từ báo cáo Insight">
    <label>Báo cáo Insight<select value={revisionId} disabled={disabled || !reports?.length} onChange={event => setRevisionId(event.target.value)}>
      <option value="">{reports?.length === 0 ? EMPTY_REPORTS : 'Chọn báo cáo Insight'}</option>
      {reports?.map(report => <option key={report.revisionId} value={report.revisionId} title={report.runId}>{reportLabel(report)}</option>)}
    </select></label>
    {reports?.length === 0 && <p>{EMPTY_REPORTS}</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => setTick(value => value + 1)}>Thử lại</button></p>}
    {!error && reports === null && <p>Đang tải báo cáo…</p>}
    {revisionId && statements?.length === 0 && <p>Không có câu insight có thể chọn trong bản này.</p>}
    <div role="radiogroup" aria-label="Câu insight">{statements?.map(entry => <label className="surface surface-pad" key={entry.statementId}>
      <input type="radio" name="report-statement" value={entry.statementId} checked={selected === entry.statementId} disabled={disabled} onChange={() => setSelected(entry.statementId)} />
      <StatementLabels statement={entry} /><p>{entry.insight}</p>
    </label>)}</div>
    <button type="button" className="button" disabled={disabled || !statement} onClick={() => statement && onApply(statement)}>Dùng câu insight</button>
  </section>;
}

export function InsightReportReference({ source, current }: { source: { revisionId: string; statementId: string; snapshot: InsightReportStatement }; current: { customer: string; painPoint: string; insight: string } }) {
  const statement = source.snapshot;
  const originals = { customer: statement.customer, painPoint: statement.conflict, insight: statement.insight };
  const labels = { customer: 'Khách hàng', painPoint: 'Nỗi đau', insight: 'Insight' };
  return <section className="surface surface-pad" aria-label="Từ báo cáo"><h2>Từ báo cáo</h2>
    <p>Bản báo cáo {source.revisionId} · Câu {source.statementId}</p><StatementLabels statement={statement} />
    <dl><dt>Sự thật ngầm</dt><dd>{statement.hiddenTruth}</dd><dt>Động lực</dt><dd>{statement.motivation}</dd>
      {statement.threeC && <><dt>3C · Khách hàng</dt><dd>{statement.threeC.customer}</dd><dt>3C · Thương hiệu</dt><dd>{statement.threeC.brand}</dd><dt>3C · Ngành</dt><dd>{statement.threeC.category}</dd></>}
      <dt>Bằng chứng</dt><dd>{statement.evidence.map((entry, index) => <p key={index}>{entry.platform === 'shopee' ? 'Shopee' : 'TikTok Shop'}: {entry.count} bản ghi{entry.denominator === undefined ? '' : ` / ${entry.denominator} bản ghi`}</p>)}</dd>
      {(Object.keys(originals) as (keyof typeof originals)[]).map(field => <div key={field}><dt>{labels[field]} gốc{current[field] !== originals[field] && ' · Đã sửa so với báo cáo'}</dt><dd>{originals[field]}</dd></div>)}
    </dl>
  </section>;
}
