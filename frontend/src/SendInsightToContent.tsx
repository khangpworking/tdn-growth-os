import { useEffect, useRef, useState } from 'react';
import type { ContentCampaignSummary } from '../../contracts/api/content-api.generated';
import type { InsightReportStatement } from '../../contracts/analysis/insight-report-statement.generated';
import InsightReportPicker, { StatementLabels } from './InsightReportPicker';
import { loadCampaigns } from './campaign-data-source';
import { loadInsight } from './insight-data-source';
import { sendReport } from './insight-report-data-source';
import { OwnerWriteError } from './data-source';
import ConfirmDialog from './ConfirmDialog';
import { routeToHash } from './routing';
export default function SendInsightToContent({ revisionId, ownerToken, writesAvailable, onClose }: { revisionId: string; ownerToken: string | null; writesAvailable: boolean; onClose: () => void }) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [statement, setStatement] = useState<InsightReportStatement | null>(null);
  const [campaigns, setCampaigns] = useState<ContentCampaignSummary[] | null>(null);
  const [campaignId, setCampaignId] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<number | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    loadCampaigns().then(value => { if (active) setCampaigns(value.campaigns.filter(campaign => !campaign.deleted)); }).catch(() => { if (active) setError('Chưa tải được chiến dịch. Đóng và thử lại.'); });
    return () => { active = false; };
  }, []);
  const send = async (confirmReplacement: boolean, expected?: number) => {
    if (!ownerToken || !writesAvailable || !statement || !campaignId || pending) return;
    setPending(true); setError('');
    try {
      let expectedVersion = expected ?? version;
      if (expectedVersion === null) {
        const detail = await loadInsight(campaignId);
        if (!detail) throw new Error('Không tìm thấy chiến dịch.');
        if (detail.lock) throw new Error('Insight đã chốt, hãy tạo chiến dịch mới');
        expectedVersion = detail.latest?.version ?? 0;
        setVersion(expectedVersion);
      }
      if (expectedVersion > 0 && !confirmReplacement) { setConfirmation(expectedVersion); return; }
      await sendReport(campaignId, { contractVersion: '1.0.0', expectedVersion, revisionId: statement.revisionId, statementId: statement.statementId, confirmReplacement }, ownerToken);
      if (mounted.current) window.location.hash = routeToHash.campaignInsight(campaignId);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Không gửi được câu insight.'); if (failure instanceof OwnerWriteError && failure.kind === 'conflict') setConfirmation(null); }
    finally { setPending(false); }
  };
  return <section className="surface surface-pad" role="dialog" aria-label="Gửi sang Content">
    <h3>Gửi sang Content</h3>
    {!statement ? <InsightReportPicker initialRevisionId={revisionId} disabled={pending || !ownerToken || !writesAvailable} onApply={setStatement} /> : <>
      <StatementLabels statement={statement} /><p>{statement.insight}</p>
      <label>Chiến dịch<select disabled={pending} value={campaignId} onChange={event => { setCampaignId(event.target.value); setVersion(null); setConfirmation(null); }}><option value="">Chọn chiến dịch</option>{campaigns?.map(campaign => <option key={campaign.campaignId} value={campaign.campaignId}>{campaign.name}</option>)}</select></label>
      <button type="button" className="button" disabled={!campaignId || pending || !ownerToken || !writesAvailable} onClick={() => void send(false)}>Gửi sang chiến dịch</button>
      <a className="button" href={routeToHash.campaignNewFromReport(statement.revisionId, statement.statementId)}>Tạo chiến dịch mới</a>
    </>}
    {error && <p role="alert">{error} {version !== null && <button type="button" onClick={() => { setVersion(null); setConfirmation(null); setError(''); }}>Tải lại trạng thái chiến dịch</button>}</p>}
    <button type="button" className="button" disabled={pending} onClick={onClose}>Đóng</button>
    {confirmation !== null && <ConfirmDialog titleId="send-report-title" descriptionId="send-report-description" title="Thay Insight nháp?" confirmLabel="Thay Insight" pending={pending} onCancel={() => setConfirmation(null)} onConfirm={() => void send(true, confirmation)}><p id="send-report-description">Bản nháp sẽ được thay bằng câu đã chọn; lịch sử vẫn được giữ.</p></ConfirmDialog>}
  </section>;
}
