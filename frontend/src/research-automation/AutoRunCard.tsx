import MetricV3PresetForm from './MetricV3PresetForm';
import type { MetricV3PresetSpec } from '../../../src/shared/metric-v3-preset';
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
  const suggestion = run.autoRun?.keyword2Suggestion;
  const requestKey = useRef<{ readonly revision: number; readonly key: string } | null>(null);
  // A retry does not change the run revision: once the stop is cleared, a later stop needs a fresh key,
  // otherwise the server would answer the next "Thử lại" as an exact repeat of the accepted one.
  const retryable = autoRun?.canRetry === true || autoRun?.keyword2Suggestion !== undefined;
  useEffect(() => { if (!retryable) requestKey.current = null; }, [retryable]);
  if (!autoRun) return null;
  const showLinks = autoRun.linksFound !== undefined && autoRun.linksFound < 5 && AFTER_PICK.has(autoRun.phase);
  const canWrite = writesAvailable && ownerToken !== null;
  // Confirmation sends the complete owner-reviewed preset through the existing keyword answer route.
  const send = async (preset?: MetricV3PresetSpec) => {
    if (!canWrite || !ownerToken || pending) return;
    if (preset === undefined ? !autoRun.canRetry : !suggestion) return;
    if (requestKey.current?.revision !== run.revision) requestKey.current = { revision: run.revision, key: crypto.randomUUID() };
    const key = requestKey.current.key;
    const [, presetKeyword2] = preset?.preset.keywords ?? [];
    setPending(true); setError('');
    try {
      await retryAutoRun(workspaceId, run.runId, preset === undefined
        ? { contractVersion: 'research-automation-autorun-retry-v1', requestKey: key }
        : { contractVersion: 'research-automation-autorun-keyword-v2', requestKey: key, keyword2: presetKeyword2 ?? null, metricV3Preset: { ...preset } }, ownerToken);
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
    {suggestion && <MetricV3PresetForm key={`${run.runId}:${suggestion.term}`}
      seed={{ keyword1: suggestion.keyword1, keyword2: suggestion.term, categoryId: suggestion.categoryId ?? null, suggested: true }}
      endDate={run.requestedPeriod.endDate} disabled={!canWrite} pending={pending} onConfirm={preset => void send(preset)} />}
    {autoRun.canRetry && <div className="ra-actions">
      <button type="button" className="button" disabled={!canWrite || pending} onClick={() => void send()}>{pending ? 'Đang gửi yêu cầu…' : AUTORUN_RETRY_LABEL}</button>
      {!canWrite && <p className="ra-muted">Mở khóa OWNER để thử lại.</p>}
    </div>}
    {error && <p className="ra-message error" role="alert">{error}</p>}
  </section>;
}
