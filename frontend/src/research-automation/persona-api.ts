import type { PersonaBinding, PersonaModelRequest } from '../../../contracts/analysis/automation-insight-persona.generated';
import type { ResearchPersonaEntry, ResearchPersonaView, ResearchPersonaModelResponse } from '../../../contracts/api/research-automation-insight-persona-api.generated';
import type { AutomationInsightPersonaReportRevisionRequest } from '../../../contracts/analysis/automation-insight-persona-report.generated';
import type { ResearchAutomationRevisionReceipt } from '../../../contracts/api/research-automation-revision-api.generated';
import { insightPersonaRequest, insightPersonaResponse, insightPersonaEntry, insightPersonaView, insightPersonaReportRevision, researchAutomationRevisionReceipt } from '../generated/report-validators.generated.js';
import { canonical } from './insight-coding-ui';
import { ResearchAutomationError } from './api';
export type { PersonaModelRequest, ResearchPersonaEntry, ResearchPersonaView, ResearchPersonaModelResponse, AutomationInsightPersonaReportRevisionRequest };
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const integrity = () => new ResearchAutomationError('integrity', 'Nguồn, yêu cầu hoặc đề xuất chân dung đọc lại không khớp bản đã chọn.');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const digest = /^[0-9a-f]{64}$/;
const base = (workspace: string, run: string) => {
  if (!uuid.test(workspace) || !uuid.test(run)) throw new ResearchAutomationError('rejected', 'Workspace hoặc phiên nghiên cứu không hợp lệ.');
  return `/workspaces/${encodeURIComponent(workspace)}/research-automation/runs/${encodeURIComponent(run)}`;
};
async function sha(value: unknown) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function entry(value: unknown, binding: PersonaBinding): Promise<ResearchPersonaEntry> {
  if (!insightPersonaEntry(value)) throw integrity();
  const item = value as ResearchPersonaEntry;
  if (!same(item.evidence.binding, binding) || !same(item.evidence.request.binding, binding) || await sha(item.evidence) !== item.sha256) throw integrity();
  if (item.evidence.contractVersion === 'insight-persona-proposal-evidence-v1' && !same(item.evidence.snapshot.binding, binding)) throw integrity();
  return item;
}
export async function loadPersonas(workspace: string, run: string, pair: string, signal: AbortSignal): Promise<ResearchPersonaView> {
  const path = base(workspace, run); if (!digest.test(pair)) throw integrity();
  const response = await transport(`/api${path}/insight-personas/${pair}`, { signal }, [200]);
  if (!insightPersonaView(response.value)) throw integrity();
  const view = response.value as ResearchPersonaView;
  if (view.binding.workspaceId !== workspace || view.binding.runId !== run || view.binding.pairId !== pair ||
    await sha(view.source) !== view.binding.sourceSha256 || !same(view.source.binding, Object.fromEntries(
      Object.keys(view.source.binding).map(key => [key, view.binding[key as keyof PersonaBinding]])))) throw integrity();
  const ids = new Set<string>();
  for (const item of view.evidence) {
    await entry(item, view.binding); if (ids.has(item.evidence.evidenceId)) throw integrity(); ids.add(item.evidence.evidenceId);
  }
  return view;
}
export async function loadPersonaEvidence(workspace: string, run: string, id: string, binding: PersonaBinding, signal: AbortSignal) {
  const path = base(workspace, run); if (!uuid.test(id) || binding.workspaceId !== workspace || binding.runId !== run) throw integrity();
  const response = await transport(`/api${path}/insight-persona-evidence/${id}`, { signal }, [200]);
  const item = await entry(response.value, binding); if (item.evidence.evidenceId !== id) throw integrity(); return item;
}
/** One explicit stage attempt; no implicit continuation or transport retry. */
export async function proposePersona(workspace: string, run: string, body: PersonaModelRequest, token: string, signal: AbortSignal): Promise<ResearchPersonaModelResponse> {
  const path = base(workspace, run);
  if (!insightPersonaRequest(body) || body.binding.workspaceId !== workspace || body.binding.runId !== run) throw new ResearchAutomationError('rejected', 'Yêu cầu chân dung không khớp nguồn đã chọn.');
  const response = await transport(`/owner-api${path}/insight-persona-model-proposals`, { ...post(body, token), signal }, [200, 201]);
  if (!insightPersonaResponse(response.value)) throw integrity();
  const result = response.value as ResearchPersonaModelResponse;
  if (result.status === 'PROPOSED') {
    const verified = await entry(result.proposal, body.binding);
    if (verified.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1' || !same(verified.evidence.request, body) ||
      verified.evidence.executionId !== result.executionId) throw integrity();
  } else if (response.status !== 200) throw integrity();
  return result;
}
export async function createPersonaReport(workspace: string, run: string, body: AutomationInsightPersonaReportRevisionRequest, token: string, signal: AbortSignal): Promise<ResearchAutomationRevisionReceipt> {
  const path = base(workspace, run);
  if (!insightPersonaReportRevision(body) || body.personaInsight.binding.workspaceId !== workspace || body.personaInsight.binding.runId !== run) throw new ResearchAutomationError('rejected', 'Yêu cầu báo cáo chân dung không khớp nguồn đã chọn.');
  const response = await transport(`/owner-api${path}/report-revisions`, { ...post(body, token), signal }, [200, 202]);
  if (!researchAutomationRevisionReceipt(response.value)) throw integrity();
  const receipt = response.value as ResearchAutomationRevisionReceipt;
  if ((receipt.state === 'COMMITTED') !== (receipt.pairId !== null) || receipt.exactRetry !== (response.status === 200)) throw integrity();
  return receipt;
}
function post(body: unknown, token: string): RequestInit {
  if (!token) throw new ResearchAutomationError('authorization', 'Mở khóa OWNER trước khi tiếp tục.');
  return { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
async function transport(url: string, init: RequestInit, expected: readonly number[]) {
  let response: Response;
  try { response = await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json', ...init.headers } }); }
  catch (error) { if (init.signal?.aborted) throw error; throw new ResearchAutomationError('connection', 'Chưa xác minh được phản hồi chân dung. Giữ nguyên yêu cầu đã gửi.'); }
  let value: unknown; try { value = await response.json(); } catch { throw integrity(); }
  if (response.status === 401 || response.status === 403) throw new ResearchAutomationError('authorization', 'Cần quyền OWNER hợp lệ.');
  if (response.status === 409) throw new ResearchAutomationError('conflict', 'Nguồn hoặc đề xuất đã thay đổi; tải lại lịch sử.');
  if (response.status === 404) throw new ResearchAutomationError('notFound', 'Phiên bản này chưa có nguồn hoặc đề xuất chân dung được hỗ trợ.');
  if ([400, 413, 422].includes(response.status)) throw new ResearchAutomationError('rejected', 'Yêu cầu chân dung chưa vượt qua kiểm tra nguồn hoặc contract.');
  if (!expected.includes(response.status)) throw integrity();
  return { value, status: response.status };
}
