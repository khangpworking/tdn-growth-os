import type { InsightCrosscheckRequest } from '../../../contracts/analysis/automation-insight-crosscheck.generated';
import type { ResearchInsightCrosscheckResponse, ResearchInsightCrosscheckAvailability } from '../../../contracts/api/research-automation-insight-crosscheck-api.generated';
import { insightCrosscheckRequest, insightCrosscheckResponse, insightCrosscheckAvailability } from '../generated/report-validators.generated.js';
import { canonical } from './insight-coding-ui';
import { ResearchAutomationError } from './api';
export type { InsightCrosscheckRequest, ResearchInsightCrosscheckResponse, ResearchInsightCrosscheckAvailability };
const base = (workspaceId: string, runId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/research-automation/runs/${encodeURIComponent(runId)}`;
const fail = () => new ResearchAutomationError('integrity', 'Bằng chứng lượt thứ hai không khớp yêu cầu, nguồn hoặc đề xuất đã chọn.');
async function request(url: string, init: RequestInit) {
  let response: Response;
  try { response = await fetch(url, { cache: 'no-store', ...init }); }
  catch { throw new ResearchAutomationError('connection', 'Chưa xác minh được kết quả lượt thứ hai.'); }
  let value: unknown; try { value = await response.json(); } catch { throw fail(); }
  if (!response.ok) throw new ResearchAutomationError(response.status === 401 || response.status === 403 ? 'authorization' : response.status === 409 ? 'conflict' : response.status === 400 ? 'rejected' : response.status === 404 ? 'notFound' : 'connection',
    'Máy chủ chưa chấp nhận yêu cầu lượt thứ hai; kiểm tra nguồn, đề xuất và cấu hình.');
  return value;
}
export async function loadCrosscheckAvailability(workspaceId: string, runId: string, pairId: string, signal: AbortSignal): Promise<ResearchInsightCrosscheckAvailability> {
  const value = await request(`/api${base(workspaceId, runId)}/insight-crosscheck-availability/${encodeURIComponent(pairId)}`, { signal });
  if (!insightCrosscheckAvailability(value)) throw fail();
  const result = value as ResearchInsightCrosscheckAvailability;
  if (result.binding.workspaceId !== workspaceId || result.binding.runId !== runId || result.binding.pairId !== pairId ||
    (result.secondConfiguration === null) !== (result.secondConfigurationSha256 === null)) throw fail();
  return result;
}
async function verify(value: unknown, body: InsightCrosscheckRequest): Promise<ResearchInsightCrosscheckResponse> {
  if (!insightCrosscheckResponse(value)) throw fail();
  const result = value as ResearchInsightCrosscheckResponse;
  if (result.requestKey !== body.requestKey) throw fail();
  if (result.status === 'VALID') {
    if (canonical(result.snapshot.request) !== canonical(body)) throw fail();
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(result.snapshot)));
    const digest = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
    if (digest !== result.snapshotSha256) throw fail();
  }
  return result;
}
export async function prepareCrosscheck(workspaceId: string, runId: string, body: InsightCrosscheckRequest, token: string, signal: AbortSignal) {
  if (!insightCrosscheckRequest(body) || body.binding.workspaceId !== workspaceId || body.binding.runId !== runId) throw fail();
  return verify(await request(`/owner-api${base(workspaceId, runId)}/insight-crosscheck-preparations`, { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }), body);
}
/** Exact retained read only; no retry or selection of a latest preparation. */
export async function readCrosscheck(workspaceId: string, runId: string, body: InsightCrosscheckRequest, signal: AbortSignal) {
  return verify(await request(`/api${base(workspaceId, runId)}/insight-crosscheck-preparations/${encodeURIComponent(body.requestKey)}`, { signal }), body);
}

/** A user names the retained request explicitly. Reading never creates a preparation or uses current model config. */
export async function loadRetainedCrosscheck(workspaceId: string, runId: string, pairId: string, requestKey: string, signal: AbortSignal) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey)) throw fail();
  const value = await request(`/api${base(workspaceId, runId)}/insight-crosscheck-preparations/${encodeURIComponent(requestKey)}`, { signal });
  if (!insightCrosscheckResponse(value)) throw fail();
  const response = value as ResearchInsightCrosscheckResponse;
  if (response.requestKey !== requestKey) throw fail();
  if (response.status !== 'VALID') return response;
  const binding = response.snapshot.request.binding;
  if (binding.workspaceId !== workspaceId || binding.runId !== runId || binding.pairId !== pairId) throw fail();
  return verify(response, response.snapshot.request);
}
