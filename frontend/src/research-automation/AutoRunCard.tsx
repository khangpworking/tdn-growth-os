import { useEffect, useRef, useState } from 'react';
import { ResearchAutomationError, retryAutoRun } from './api';
import type { ResearchAutomationAutoRun, ResearchAutomationRun } from './api';
import { AUTORUN_RETRY_LABEL, autoRunLinksText, autoRunText } from './autorun-text';

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
  const requestKey = useRef<{ readonly revision: number; readonly key: string } | null>(null);
  // A retry does not change the run revision: once the stop is cleared, a later stop needs a fresh key,
  // otherwise the server would answer the next "Thử lại" as an exact repeat of the accepted one.
  const retryable = autoRun?.canRetry === true;
  useEffect(() => { if (!retryable) requestKey.current = null; }, [retryable]);
  if (!autoRun) return null;
  const showLinks = autoRun.linksFound !== undefined && autoRun.linksFound < 5 && AFTER_PICK.has(autoRun.phase);
  const canWrite = writesAvailable && ownerToken !== null;
  const retry = async () => {
    if (!autoRun.canRetry || !canWrite || !ownerToken || pending) return;
    if (requestKey.current?.revision !== run.revision) requestKey.current = { revision: run.revision, key: crypto.randomUUID() };
    const key = requestKey.current.key;
    setPending(true); setError('');
    try {
      await retryAutoRun(workspaceId, run.runId, { contractVersion: 'research-automation-autorun-retry-v1', requestKey: key }, ownerToken);
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
    {autoRun.canRetry && <div className="ra-actions">
      <button type="button" className="button" disabled={!canWrite || pending} onClick={() => void retry()}>{pending ? 'Đang gửi yêu cầu…' : AUTORUN_RETRY_LABEL}</button>
      {!canWrite && <p className="ra-muted">Mở khóa OWNER để thử lại.</p>}
    </div>}
    {error && <p className="ra-message error" role="alert">{error}</p>}
  </section>;
}
