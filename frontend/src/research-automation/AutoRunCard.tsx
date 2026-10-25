import { useEffect, useRef, useState } from 'react';
import { ResearchAutomationError, retryAutoRun } from './api';
import type { ResearchAutomationAutoRun, ResearchAutomationRun } from './api';
import { AUTORUN_RETRY_LABEL, autoRunKeyword2Text, autoRunLinksText, autoRunText } from './autorun-text';

export interface AutoRunCardProps {
  readonly workspaceId: string;
  readonly run: ResearchAutomationRun;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly onRetried: () => void;
  readonly onConflict: () => void;
}

const AFTER_PICK = new Set<ResearchAutomationAutoRun['phase']>(['CONFIRM', 'WAIT_DRAFT', 'PRESENT', 'DONE', 'STOPPED']);

/** True while the auto-run is still moving, so the run page keeps polling even outside the usual running statuses. */
export function autoRunActive(autoRun: ResearchAutomationAutoRun | undefined): boolean {
  return autoRun !== undefined && autoRun.phase !== 'DONE' && autoRun.phase !== 'STOPPED';
}

/**
 * Owner status card for the automatic Market steps. Rendered only when the server sends `autoRun`
 * (the flag is on). No percentage and no progress bar; the manual controls below stay as they were.
 */
export default function AutoRunCard({ workspaceId, run, ownerToken, writesAvailable, onRetried, onConflict }: AutoRunCardProps) {
  const autoRun = run.autoRun;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const suggestion = run.autoRun?.keyword2Suggestion;
  const [keyword2, setKeyword2] = useState(suggestion?.term ?? '');
  useEffect(() => { setKeyword2(suggestion?.term ?? ''); }, [suggestion?.term]);
  const requestKey = useRef<{ readonly revision: number; readonly key: string } | null>(null);
  // A retry does not change the run revision: once the stop is cleared, a later stop needs a fresh key,
  // otherwise the server would answer the next "Thử lại" as an exact repeat of the accepted one.
  const retryable = autoRun?.canRetry === true || autoRun?.keyword2Suggestion !== undefined;
  useEffect(() => { if (!retryable) requestKey.current = null; }, [retryable]);
  if (!autoRun) return null;
  const showLinks = autoRun.linksFound !== undefined && autoRun.linksFound < 5 && AFTER_PICK.has(autoRun.phase);
  const canWrite = writesAvailable && ownerToken !== null;
  // Accept or Edit sends the term in the field; Remove sends null. Both use the owner retry route.
  const send = async (answer?: string | null) => {
    if (!canWrite || !ownerToken || pending) return;
    if (answer === undefined ? !autoRun.canRetry : !suggestion) return;
    if (requestKey.current?.revision !== run.revision) requestKey.current = { revision: run.revision, key: crypto.randomUUID() };
    const key = requestKey.current.key;
    setPending(true); setError('');
    try {
      await retryAutoRun(workspaceId, run.runId, answer === undefined
        ? { contractVersion: 'research-automation-autorun-retry-v1', requestKey: key }
        : { contractVersion: 'research-automation-autorun-keyword-v1', requestKey: key, keyword2: answer }, ownerToken);
      requestKey.current = null;
      onRetried();
    } catch (failure) {
      if (failure instanceof ResearchAutomationError && failure.kind === 'conflict') { requestKey.current = null; onConflict(); }
      else setError(failure instanceof ResearchAutomationError ? failure.message : 'Chưa gửi được yêu cầu thử lại. Bấm lại sẽ dùng cùng mã yêu cầu.');
    } finally { setPending(false); }
  };
  return <section className="ra-block" aria-labelledby="ra-autorun-title" data-autorun-phase={autoRun.phase}>
    <h3 id="ra-autorun-title">Phần tự động</h3>
    <p role="status">{autoRunText(autoRun, run.reports)}</p>
    {showLinks && <p className="ra-muted">{autoRunLinksText(autoRun.linksFound ?? 0)}</p>}
    {suggestion && <div className="ra-actions">
      <p>{autoRunKeyword2Text(suggestion)}</p>
      <label>Từ khóa 2 <input value={keyword2} maxLength={80} disabled={!canWrite || pending} onChange={event => setKeyword2(event.target.value)} /></label>
      <button type="button" className="button" disabled={!canWrite || pending || !keyword2.trim()} onClick={() => void send(keyword2.trim())}>{pending ? 'Đang gửi yêu cầu…' : 'Dùng từ khóa 2'}</button>
      <button type="button" className="button" disabled={!canWrite || pending} onClick={() => void send(null)}>Bỏ từ khóa 2</button>
      {!canWrite && <p className="ra-muted">Mở khóa OWNER để duyệt từ khóa 2.</p>}
    </div>}
    {autoRun.canRetry && <div className="ra-actions">
      <button type="button" className="button" disabled={!canWrite || pending} onClick={() => void send()}>{pending ? 'Đang gửi yêu cầu…' : AUTORUN_RETRY_LABEL}</button>
      {!canWrite && <p className="ra-muted">Mở khóa OWNER để thử lại.</p>}
    </div>}
    {error && <p className="ra-message error" role="alert">{error}</p>}
  </section>;
}
