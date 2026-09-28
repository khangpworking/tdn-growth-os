import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ContentDataSourceError } from './content-data-source';
import type { DemoCatalogItem } from './catalog-data-source';
import { OwnerWriteError } from './data-source';
import ConfirmDialog from './ConfirmDialog';
import { demoCampaignDetail, loadCampaign, type CampaignDetail, type DemoCampaign } from './campaign-data-source';
import {
  applyStpSuggestion,
  demoInsightDetail,
  draftFromInsight,
  editInsightDraft,
  insightDraftBlocker,
  insightRequestFromDraft,
  insightStage,
  loadInsight,
  lockDemoInsight,
  reviseDemoInsight,
  sameInsightContent,
  submitInsightLock,
  submitInsightRevision,
  type DemoInsight,
  type DemoResearchProduct,
  type InsightDetail,
  type InsightDraft,
} from './insight-data-source';
import { routeToHash } from './routing';

export interface InsightPageProps {
  readonly mode: 'real' | 'demo';
  readonly campaignId: string;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly demoCampaigns: readonly DemoCampaign[];
  readonly demoItems: readonly DemoCatalogItem[];
  readonly demoInsights: readonly DemoInsight[];
  readonly setDemoInsights: (insights: DemoInsight[]) => void;
  readonly researchProducts: readonly (DemoResearchProduct & { readonly name: string })[];
  readonly notify: (message: string) => void;
}

type Loaded =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly campaign: CampaignDetail; readonly insight: InsightDetail }
  | { readonly status: 'missing' }
  | { readonly status: 'failed'; readonly message: string };

const STEPS = ['Insight', 'Big Idea', 'Góc nội dung', 'Caption & Poster'] as const;
const DEMO_BANNER = 'Chế độ demo — Insight chỉ lưu trong trình duyệt này.';
const formatDateTime = (value: string): string => new Date(value).toLocaleString('vi-VN');

function failureMessage(error: unknown): string {
  if (error instanceof ContentDataSourceError && error.kind === 'connection') return 'Không thể kết nối API nội dung.';
  return 'Dữ liệu Insight không vượt qua kiểm tra toàn vẹn.';
}

function StepIndicator({ campaignId, locked }: { readonly campaignId: string; readonly locked: boolean }) {
  const href = (index: number): string | undefined => !locked ? undefined : index === 1 ? routeToHash.campaignBigIdea(campaignId) : index === 2 ? routeToHash.campaignAngle(campaignId) : undefined;
  const note = (index: number): string => index === 0 ? locked ? 'Đã khóa' : 'Đang soạn' : !locked ? 'Cần khóa Insight trước' : index === 1 ? 'Mở bước 2' : index === 2 ? 'Cần Big Idea đang phát triển' : 'Có ở bước tiếp theo';
  return <ol className="insight-steps" aria-label="Các bước chiến dịch">{STEPS.map((step, index) => {
    const target = href(index);
    return <li key={step} className={index === 0 ? 'current' : ''} aria-current={index === 0 ? 'step' : undefined}>
      {target ? <a href={target}><b>{step}</b><small>{note(index)}</small></a> : <><b>{step}</b><small>{note(index)}</small></>}
    </li>;
  })}</ol>;
}

function InsightSummary({ insight }: { readonly insight: InsightDetail }) {
  const latest = insight.latest;
  if (!latest) return null;
  return <dl className="insight-summary">
    <div><dt>Khách hàng mục tiêu</dt><dd>{latest.insight.customer}</dd></div>
    <div><dt>Nỗi đau</dt><dd>{latest.insight.painPoint}</dd></div>
    <div><dt>Insight</dt><dd>{latest.insight.insight}</dd></div>
    <div><dt>Nguồn</dt><dd>{latest.insight.source.kind === 'STP' ? 'Khách hàng từ STP đã khóa' : 'Tự nhập'} · v{latest.version}</dd></div>
  </dl>;
}

export default function InsightPage(props: InsightPageProps) {
  const { mode, campaignId } = props;
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [draft, setDraft] = useState<InsightDraft | null>(null);
  const [pending, setPending] = useState<'save' | 'lock' | null>(null);
  const [notice, setNotice] = useState<{ readonly message: string; readonly reload: boolean; readonly discard?: boolean } | null>(null);
  const [confirmingLock, setConfirmingLock] = useState(false);
  const mountedRef = useRef(true);
  // The saved state the draft was last taken from, and whether the next newer state must keep the draft (409 reload).
  const appliedBaseRef = useRef<string | null>(null);
  const keepDraftRef = useRef(false);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const reload = () => setReloadToken((value) => value + 1);
  const reloadKeepingDraft = () => { keepDraftRef.current = true; setNotice(null); reload(); };

  useEffect(() => {
    if (mode === 'demo') {
      const campaign = demoCampaignDetail(props.demoCampaigns, campaignId, props.demoItems as never);
      if (!campaign) { setLoaded({ status: 'missing' }); return; }
      const researchProductWorkspaceId = campaign.campaign.campaign.researchProductWorkspaceId;
      const insight = demoInsightDetail(props.demoInsights, { campaignId, version: campaign.campaign.version, deleted: campaign.lifecycle.deleted !== undefined, ...(researchProductWorkspaceId ? { researchProductWorkspaceId } : {}) }, props.researchProducts);
      setLoaded({ status: 'ready', campaign, insight });
      return;
    }
    let active = true;
    setLoaded({ status: 'loading' });
    Promise.all([loadCampaign(campaignId), loadInsight(campaignId)]).then(([campaign, insight]) => {
      if (!active) return;
      setLoaded(campaign && insight ? { status: 'ready', campaign, insight } : { status: 'missing' });
    }).catch((error: unknown) => { if (active) setLoaded({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, campaignId, reloadToken, props.demoCampaigns, props.demoInsights, props.demoItems, props.researchProducts]);

  const insight = loaded.status === 'ready' ? loaded.insight : null;
  const latestVersion = insight?.latest?.version ?? 0;
  const baseKey = insight ? `${campaignId}|${latestVersion}|${insight.lock !== undefined}` : null;
  useEffect(() => {
    // Runs once the detail is ready, including for a campaign with no Insight yet, and again when the saved state moves.
    if (!insight || baseKey === appliedBaseRef.current) return;
    const sameCampaign = appliedBaseRef.current?.startsWith(`${campaignId}|`) ?? false;
    appliedBaseRef.current = baseKey;
    if (keepDraftRef.current && sameCampaign && insight.lock === undefined) {
      keepDraftRef.current = false;
      setNotice({ message: `Đã tải phiên bản mới nhất (v${latestVersion}). Nội dung bạn đang soạn vẫn được giữ — lưu để tạo phiên bản ${latestVersion + 1}, hoặc bỏ nháp để dùng bản đã lưu.`, reload: false, discard: true });
      return;
    }
    keepDraftRef.current = false;
    setDraft(draftFromInsight(insight));
    setNotice(null);
  }, [baseKey]);

  if (loaded.status === 'loading') return <p className="muted">Đang tải Insight…</p>;
  if (loaded.status === 'failed') return <section className="surface surface-pad"><p className="form-error" role="alert">{loaded.message}</p><button className="button" type="button" onClick={reload}>Thử lại</button></section>;
  if (loaded.status === 'missing') return <div className="surface empty"><h1>Không tìm thấy chiến dịch.</h1><a className="button" href={routeToHash.content()}>Về danh sách chiến dịch</a></div>;

  const { campaign } = loaded;
  const view = loaded.insight;
  const stage = insightStage(view);
  const writable = mode === 'demo' || (props.writesAvailable && props.ownerToken !== null);
  const current = draft ?? draftFromInsight(view);
  const saved = draftFromInsight(view);
  const unchanged = view.latest !== undefined && sameInsightContent(current, saved);
  const blocker = insightDraftBlocker(current);
  const editable = stage !== 'locked' && stage !== 'deleted';
  const saveReason = !writable
    ? mode === 'real' && !props.writesAvailable ? 'Ghi OWNER hiện không khả dụng trong runtime này.' : 'Mở khóa OWNER cục bộ ở thanh phía trên để lưu Insight.'
    : pending ? 'Đang xử lý…' : blocker ?? (unchanged ? 'Chưa có thay đổi so với phiên bản đã lưu.' : null);
  const lockReason = !writable ? 'Mở khóa OWNER cục bộ để khóa Insight.'
    : pending ? 'Đang xử lý…'
      : stage === 'empty' ? 'Lưu Insight trước khi khóa.'
        : !unchanged ? 'Lưu thay đổi trước khi khóa — khóa luôn dùng phiên bản đã lưu.'
          : stage === 'blocked' ? view.gate.reason ?? 'Sản phẩm nghiên cứu chưa được duyệt ở B10.'
            : null;
  const researchName = view.gate.productWorkspaceId ? props.researchProducts.find((product) => product.id === view.gate.productWorkspaceId)?.name ?? view.gate.productWorkspaceId : null;
  const suggestion = view.stpSuggestion;
  const edit = (field: 'customer' | 'painPoint' | 'insight', value: string) => { if (!pending) setDraft(editInsightDraft(current, field, value)); };

  const fail = (error: unknown, fallback: string) => {
    if (!mountedRef.current) return;
    if (error instanceof OwnerWriteError && error.kind === 'conflict') setNotice({ message: error.message, reload: true });
    else if (error instanceof OwnerWriteError && error.kind === 'connection') setNotice({ message: 'Kết nối không rõ kết quả. Nội dung vẫn được giữ; gửi lại an toàn vì yêu cầu trùng sẽ không tạo bản mới.', reload: false });
    else setNotice({ message: error instanceof OwnerWriteError ? error.message : fallback, reload: false });
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saveReason || !editable) return;
    setNotice(null);
    keepDraftRef.current = false;
    if (mode === 'demo') {
      try {
        props.setDemoInsights(reviseDemoInsight(props.demoInsights, campaignId, latestVersion, current, new Date().toISOString()));
        props.notify(`Đã lưu Insight minh họa v${latestVersion + 1}.`);
      } catch { setNotice({ message: 'Insight minh họa đã thay đổi hoặc đã bị khóa.', reload: true }); }
      return;
    }
    setPending('save');
    try {
      const receipt = await submitInsightRevision({ campaignId, expectedVersion: latestVersion, insight: insightRequestFromDraft(current), token: props.ownerToken! });
      props.notify(receipt.exactRetry ? 'Yêu cầu đã được ghi trước đó; không tạo bản trùng.' : `Đã lưu Insight phiên bản ${receipt.version}.`);
      reload();
    } catch (error) { fail(error, 'Không thể lưu Insight.'); } finally { if (mountedRef.current) setPending(null); }
  };

  const lock = async () => {
    setConfirmingLock(false);
    if (lockReason || !view.latest) return;
    setNotice(null);
    if (mode === 'demo') {
      try {
        props.setDemoInsights(lockDemoInsight(props.demoInsights, campaignId, view.latest.version, view.campaignVersion, new Date().toISOString()));
        props.notify('Đã khóa Insight minh họa.');
      } catch { setNotice({ message: 'Insight minh họa đã thay đổi trước khi khóa.', reload: true }); }
      return;
    }
    setPending('lock');
    try {
      const receipt = await submitInsightLock({ campaignId, insightVersion: view.latest.version, campaignVersion: view.campaignVersion, token: props.ownerToken! });
      props.notify(receipt.exactRetry ? 'Insight đã được khóa trước đó.' : `Đã khóa Insight v${receipt.insightVersion}.`);
      reload();
    } catch (error) { fail(error, 'Không thể khóa Insight.'); } finally { if (mountedRef.current) setPending(null); }
  };

  return <article className="insight-page">
    {mode === 'demo' && <div className="demo-banner" role="note">{DEMO_BANNER}</div>}
    <nav className="crumb" aria-label="Đường dẫn"><a href={routeToHash.content()}>Chiến dịch</a><span aria-hidden="true">/</span><a href={routeToHash.campaign(campaignId)}>{campaign.campaign.campaign.name}</a><span aria-hidden="true">/</span><span>Insight</span></nav>
    <div className="heading"><div><h1>Insight</h1><p>Khách hàng là ai, họ đang đau ở đâu, và sự thật nào khiến thông điệp chạm tới họ.</p></div></div>
    <StepIndicator campaignId={props.campaignId} locked={stage === 'locked'} />
    {stage === 'deleted' && <div className="deleted-banner" role="status"><p>Chiến dịch đã bị xóa. Khôi phục chiến dịch để tiếp tục soạn Insight.</p><a className="button" href={routeToHash.campaign(campaignId)}>Mở chiến dịch</a></div>}
    {stage === 'locked' && view.lock && <section className="surface surface-pad insight-locked" aria-labelledby="insight-locked-title">
      <h2 id="insight-locked-title">Insight đã khóa</h2>
      <p className="muted">Khóa lúc {formatDateTime(view.lock.lockedAt)} · Insight v{view.lock.insightVersion} · chiến dịch v{view.lock.campaignVersion}{view.lock.b10 ? ` · B10 Duyệt #${view.lock.b10.effectiveDecisionNumber}` : ''}</p>
      <InsightSummary insight={view} />
      <p className="decision-note">Insight đã khóa không thể sửa. Sản phẩm và liên kết nghiên cứu của chiến dịch cũng được giữ cố định; tên và mục tiêu vẫn sửa được.</p>
    </section>}
    {stage === 'deleted' && <section className="surface surface-pad"><InsightSummary insight={view} />{!view.latest && <p className="muted">Chưa có Insight.</p>}</section>}
    {editable && <form className="brand-form insight-form" onSubmit={(event) => void save(event)} noValidate>
      <header className="brand-form-head"><div><h2>{view.latest ? `Sửa Insight · tạo phiên bản ${latestVersion + 1}` : 'Insight đầu tiên'}</h2><p className="muted">{researchName ? `Liên kết sản phẩm nghiên cứu: ${researchName}` : 'Chiến dịch không liên kết sản phẩm nghiên cứu — không cần duyệt B10.'}</p></div></header>
      {suggestion && <div className="insight-suggestion" role="note"><p><strong>Gợi ý từ STP đã khóa</strong> — điền khách hàng mục tiêu từ phân khúc chính. Nỗi đau và insight do bạn nhập; định vị sản phẩm hiện bên dưới để tham khảo.</p><button className="button" type="button" disabled={pending !== null || !writable || current.lockedStpId === suggestion.lockedStpId} onClick={() => setDraft(applyStpSuggestion(current, suggestion))}>{current.lockedStpId === suggestion.lockedStpId ? 'Đang dùng gợi ý STP' : 'Dùng gợi ý STP'}</button></div>}
      <fieldset className="catalog-fields" disabled={pending !== null || !writable}>
        <legend className="visually-hidden">Nội dung Insight</legend>
        <label className="field" htmlFor="insight-customer">Khách hàng mục tiêu<textarea id="insight-customer" className="search" value={current.customer} onChange={(event) => edit('customer', event.target.value)} maxLength={500} rows={2} /></label>
        <label className="field" htmlFor="insight-pain">Nỗi đau<textarea id="insight-pain" className="search" value={current.painPoint} onChange={(event) => edit('painPoint', event.target.value)} maxLength={1000} rows={3} /></label>
        <label className="field" htmlFor="insight-text">Insight<textarea id="insight-text" className="search" value={current.insight} onChange={(event) => edit('insight', event.target.value)} maxLength={2000} rows={5} /></label>
        {suggestion && suggestion.insight && <div className="insight-reference" role="note"><p className="muted"><strong>Định vị sản phẩm (tham khảo)</strong></p><p>{suggestion.insight}</p></div>}
        <p className="muted">Nguồn: {current.lockedStpId ? 'Khách hàng từ STP đã khóa' : 'Tự nhập'}</p>
      </fieldset>
      {notice && <div className="form-error brand-notice" role="alert"><p>{notice.message}</p>{notice.reload && <button className="button" type="button" onClick={reloadKeepingDraft}>Tải lại</button>}{notice.discard && <button className="button" type="button" disabled={pending !== null} onClick={() => { setDraft(draftFromInsight(view)); setNotice(null); }}>Bỏ nháp</button>}</div>}
      <div className="form-actions">
        <button className="button primary" type="submit" disabled={saveReason !== null}>{pending === 'save' ? 'Đang lưu…' : 'Lưu Insight'}</button>
        <button className="button" type="button" disabled={lockReason !== null} onClick={() => setConfirmingLock(true)}>{pending === 'lock' ? 'Đang khóa…' : 'Khóa Insight'}</button>
      </div>
      <p className="decision-note">{saveReason ?? 'Sẵn sàng lưu.'}</p>
      {stage === 'blocked' && <p className="snapshot-warning" role="status">{view.gate.reason ?? 'Sản phẩm nghiên cứu chưa được duyệt ở B10.'}{view.gate.effectiveDecision ? ` Quyết định B10 hiện hành: ${view.gate.effectiveDecision === 'HOLD' ? 'Tạm dừng' : 'Từ chối'}.` : ' Chưa có quyết định B10.'}</p>}
      {stage !== 'blocked' && lockReason && view.latest && <p className="decision-note">{lockReason}</p>}
    </form>}
    {confirmingLock && <ConfirmDialog titleId="insight-lock-title" descriptionId="insight-lock-description" title={`Khóa Insight v${latestVersion}?`} confirmLabel="Khóa Insight" pending={pending === 'lock'} onCancel={() => setConfirmingLock(false)} onConfirm={() => void lock()}><p id="insight-lock-description">Insight v{latestVersion} và chiến dịch v{view.campaignVersion} sẽ được ghim. Sau khi khóa không thể sửa Insight, sản phẩm hay liên kết nghiên cứu của chiến dịch.</p></ConfirmDialog>}
    {view.history.length > 0 && <section className="brand-history" aria-labelledby="insight-history-title"><h3 id="insight-history-title">Lịch sử phiên bản</h3><ol className="timeline">{[...view.history].reverse().map((entry) => <li key={entry.version}>v{entry.version} · {entry.sourceKind === 'STP' ? 'Từ STP' : 'Tự nhập'} · {formatDateTime(entry.createdAt)}</li>)}</ol></section>}
  </article>;
}
