import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { confirmScope, ResearchAutomationError } from './api';
import type { ResearchAutomationConfirmBody, ResearchAutomationProductCard, ResearchAutomationRun } from './api';
import { formatDay, reportsLabel } from './run-status';
import { safeHttpsUrl, safeImageUrl } from './safe-url';

export interface ScopeConfirmProps {
  readonly run: ResearchAutomationRun;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly onConfirmed: () => void;
  readonly onConflict: () => void;
}

/** The owner explicitly chooses intended products and comparison peers before paid collection. */
export default function ScopeConfirm({ run, ownerToken, writesAvailable, onConfirmed, onConflict }: ScopeConfirmProps) {
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [none, setNone] = useState(false);
  const [peers, setPeers] = useState<readonly string[]>([]);
  const [definition, setDefinition] = useState(run.definition?.definition ?? '');
  const [includeTerms, setIncludeTerms] = useState((run.definition?.includeTerms ?? []).join('\n'));
  const [excludeTerms, setExcludeTerms] = useState((run.definition?.excludeTerms ?? []).join('\n'));
  const [dialog, setDialog] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const operation = useRef<{ readonly fingerprint: string; readonly requestKey: string } | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const closeDialog = useCallback(() => { if (!pending) setDialog(false); }, [pending]);

  const cards = run.productCards;
  const chosen = cards.filter(card => selected.includes(card.productId));
  const chosenPeers = cards.filter(card => peers.includes(card.productId));
  const toggle = (list: readonly string[], id: string) => list.includes(id) ? list.filter(item => item !== id) : [...list, id];
  const terms = (value: string) => [...new Set(value.split('\n').map(term => term.trim()).filter(Boolean))];
  const blockedReason = !writesAvailable ? 'Ghi OWNER hiện không khả dụng trong runtime này.' : !ownerToken ? 'Mở khóa OWNER ở đầu trang để duyệt phạm vi.' : null;
  const incomplete = !none && selected.length === 0 ? 'Chọn ít nhất một thẻ giống ý bạn, hoặc chọn Không cái nào giống.' : !definition.trim() ? 'Viết định nghĩa phạm vi trước khi duyệt.' : null;

  const submit = async () => {
    if (busy.current || blockedReason || incomplete || !ownerToken) return;
    const body = (requestKey: string): ResearchAutomationConfirmBody => ({
      contractVersion: 'research-automation-confirm-v1', requestKey, expectedRevision: run.revision,
      definition: definition.trim(), includeTerms: terms(includeTerms), excludeTerms: terms(excludeTerms),
      selectedProductIds: none ? [] : [...selected], peerProductIds: [...peers],
    });
    const fingerprint = JSON.stringify(body(''));
    if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, requestKey: crypto.randomUUID() };
    const current = operation.current;
    if (!current) return;
    busy.current = true; setPending(true); setMessage('');
    try {
      await confirmScope(run.workspaceId, run.runId, body(current.requestKey), ownerToken);
      if (!mounted.current || operation.current !== current) return;
      setDialog(false); setConfirmed(true); onConfirmed();
    } catch (error) {
      if (!mounted.current || operation.current !== current) return;
      setDialog(false);
      if (error instanceof ResearchAutomationError && error.kind === 'conflict') { onConflict(); return; }
      setMessage(error instanceof ResearchAutomationError ? error.message : 'Chưa gửi được xác nhận. Duyệt lại sẽ dùng cùng mã yêu cầu nên không tạo xác nhận trùng.');
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  };

  return <div className="ra-scope">
    <div className="ra-section-head"><h2 id="ra-run-title" tabIndex={-1}>{run.mode === 'PRODUCT' ? 'Sản phẩm giống ý bạn' : 'Sản phẩm thật tìm được'}</h2>
      <p>Chọn thẻ giống ý bạn. Đối thủ so sánh là một lựa chọn riêng và không được suy ra tự động.</p></div>

    {cards.length === 0 ? <div className="ra-empty"><b>Tìm nhanh chưa trả về sản phẩm nào.</b><p>Bạn vẫn có thể viết định nghĩa phạm vi rồi chọn Không cái nào giống. Không có dữ liệu giả được thêm vào.</p></div>
      : <ul className="ra-cards" aria-label="Thẻ sản phẩm thật">{cards.map(card => <li key={card.productId}><ProductCard card={card} picked={!none && selected.includes(card.productId)} disabled={pending || none} onToggle={() => { setNone(false); setSelected(prior => toggle(prior, card.productId)); }} /></li>)}</ul>}
    <div className="ra-actions"><button type="button" className="button" aria-pressed={none} disabled={pending} onClick={() => { setNone(value => !value); setSelected([]); }}>Không cái nào giống ý tôi</button><span className="ra-muted" aria-live="polite">{none ? 'Không chọn thẻ nào. Định nghĩa bằng lời quyết định phạm vi.' : `Đã chọn ${selected.length} thẻ.`}</span></div>

    <section className="ra-block" aria-labelledby="ra-definition-title"><h3 id="ra-definition-title">Định nghĩa phạm vi</h3>
      <label className="ra-label" htmlFor="ra-definition">Sản phẩm nằm trong phạm vi nghiên cứu là<small>{run.definition ? 'Hệ thống đề xuất từ lựa chọn nhanh. Sửa lại cho đúng ý.' : 'Viết bằng lời của bạn; trường này bắt buộc.'}</small>
        <textarea id="ra-definition" className="ra-field" rows={3} value={definition} disabled={pending} onChange={event => setDefinition(event.target.value)} /></label>
      <div className="ra-two"><label className="ra-label" htmlFor="ra-include">Cụm từ phải có<small>Mỗi dòng một cụm từ.</small><textarea id="ra-include" className="ra-field" rows={3} value={includeTerms} disabled={pending} onChange={event => setIncludeTerms(event.target.value)} /></label>
        <label className="ra-label" htmlFor="ra-exclude">Cụm từ loại trừ<small>Mỗi dòng một cụm từ.</small><textarea id="ra-exclude" className="ra-field" rows={3} value={excludeTerms} disabled={pending} onChange={event => setExcludeTerms(event.target.value)} /></label></div>
    </section>

    <fieldset className="ra-block ra-peers" disabled={pending || cards.length === 0}><legend>Đối thủ để so sánh</legend><p className="ra-muted">Chọn riêng. Một thẻ có thể vừa là sản phẩm giống ý vừa là peer nếu bạn chủ động chọn cả hai.</p>
      {cards.length === 0 ? <p className="ra-muted">Chưa có thẻ nào để chọn làm đối thủ.</p> : cards.map(card => <label key={card.productId} className="ra-check" htmlFor={`ra-peer-${card.productId}`}><input id={`ra-peer-${card.productId}`} type="checkbox" checked={peers.includes(card.productId)} onChange={() => setPeers(prior => toggle(prior, card.productId))} /><span>{card.title ?? 'Sản phẩm không có tên'}<small>{card.provider} · ID {card.sourceProductId}</small></span></label>)}</fieldset>

    <div className="ra-start"><p>Báo cáo: <b>{reportsLabel(run.reports)}</b>. Kỳ {formatDay(run.requestedPeriod.startDate)} → {formatDay(run.requestedPeriod.endDate)} ({run.requestedPeriod.dayCount} ngày), Việt Nam.</p>
      {(blockedReason ?? incomplete) && <p className="ra-muted" role="note">{blockedReason ?? incomplete}</p>}{message && <p className="ra-problem" role="alert">{message}</p>}
      <div className="ra-actions"><button type="button" className="button primary" disabled={pending || confirmed || blockedReason !== null || incomplete !== null} onClick={() => setDialog(true)}>{pending ? 'Đang gửi…' : confirmed ? 'Đã xác nhận · đang tải trạng thái' : 'Duyệt định nghĩa'}</button></div>
    </div>
    {dialog && <ConfirmDialog titleId="ra-confirm-title" descriptionId="ra-confirm-description" title="Xác nhận phạm vi và bắt đầu thu thập?" confirmLabel="Xác nhận và bắt đầu" pending={pending} onCancel={closeDialog} onConfirm={() => void submit()}><div id="ra-confirm-description" className="ra-confirm"><p>{definition.trim()}</p><dl className="ra-kv"><div><dt>Thẻ giống ý</dt><dd>{none ? 'Không thẻ nào' : chosen.map(card => card.title ?? 'Không có tên').join(', ')}</dd></div><div><dt>Đối thủ so sánh</dt><dd>{chosenPeers.length ? chosenPeers.map(card => card.title ?? 'Không có tên').join(', ') : 'Không chọn'}</dd></div><div><dt>Báo cáo</dt><dd>{reportsLabel(run.reports)}</dd></div></dl><p>Sau khi xác nhận, hệ thống thu thập trong đúng kỳ đã chọn. Chi phí thực tế và nguồn chưa khả dụng sẽ được ghi riêng.</p></div></ConfirmDialog>}
  </div>;
}

function ProductCard({ card, picked, disabled, onToggle }: { readonly card: ResearchAutomationProductCard; readonly picked: boolean; readonly disabled: boolean; readonly onToggle: () => void }) {
  const link = safeHttpsUrl(card.sourceUrl);
  const title = card.title ?? 'Sản phẩm không có tên từ nguồn';
  const titleId = `ra-card-${card.productId}`;
  return <article className={`ra-card ${picked ? 'picked' : ''}`} aria-labelledby={titleId}><ProductImage url={card.imageUrl} title={title} /><div className="ra-card-body"><div className="ra-tags"><span className="ra-tag">{card.provider}</span>{card.role === 'EXPLORATION' && <span className="ra-tag explore">Thẻ khám phá</span>}</div><h4 id={titleId}>{title}</h4><p className={card.description ? 'ra-clamp' : 'ra-muted'}>{card.descriptionState === 'PRESENT' && card.description ? card.description : card.descriptionState === 'EMPTY' ? 'Nguồn không có mô tả.' : 'Nguồn chưa cung cấp mô tả.'}</p><dl className="ra-card-facts"><div><dt>Kỳ quan sát thẻ</dt><dd>{card.observedWindow ? card.observedWindow.label : 'Nguồn chưa báo'}</dd></div><div><dt>ID nguồn</dt><dd>{card.sourceProductId}</dd></div></dl>{link ? <a href={link} target="_blank" rel="noopener noreferrer">Xem trên nguồn<span className="ra-sr"> (mở tab mới)</span></a> : <span className="ra-muted">Nguồn không có link HTTPS hợp lệ</span>}</div><button type="button" className={`button ${picked ? 'primary' : ''}`} aria-pressed={picked} disabled={disabled} onClick={onToggle}>{picked ? 'Đã chọn: giống ý tôi' : 'Giống ý tôi'}</button></article>;
}

function ProductImage({ url, title }: { readonly url: string | null | undefined; readonly title: string }) {
  const safe = safeImageUrl(url); const [failed, setFailed] = useState(false);
  if (!safe || failed) return <div className="ra-thumb missing" role="img" aria-label={`${title}: ${safe ? 'không tải được ảnh nguồn' : 'nguồn không có ảnh'}`}><span aria-hidden="true">{safe ? 'Không tải được ảnh nguồn' : 'Nguồn không có ảnh'}</span></div>;
  return <div className="ra-thumb"><img src={safe} alt={`Ảnh từ nguồn: ${title}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /></div>;
}
