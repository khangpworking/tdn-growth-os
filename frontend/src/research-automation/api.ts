// The only module that touches the backend-owned contract. Every type here is an alias of the generated
// API types, so reconciling with the published schema changes this file and nothing else.
import type {
  ResearchAutomationCancelRequest,
  ResearchAutomationConfirmRequest,
  ResearchAutomationMutationReceipt,
  ResearchAutomationRun,
  ResearchAutomationRunList,
  ResearchAutomationStartRequest,
} from '../../../contracts/api/research-automation-api.generated';
import { researchAutomationReceipt, researchAutomationRun, researchAutomationRunList } from '../generated/report-validators.generated.js';

export type { ResearchAutomationRun, ResearchAutomationRunList };
export type ResearchAutomationStartBody = ResearchAutomationStartRequest;
export type ResearchAutomationConfirmBody = ResearchAutomationConfirmRequest;
export type ResearchAutomationCancelBody = ResearchAutomationCancelRequest;
export type ResearchAutomationReceipt = ResearchAutomationMutationReceipt;
export type ResearchAutomationInterview = NonNullable<ResearchAutomationStartRequest['interview']>;
export type ResearchAutomationProductCard = ResearchAutomationRun['productCards'][number];
export type ResearchAutomationRunSummary = ResearchAutomationRunList['runs'][number];
export type ResearchAutomationReportKind = 'market' | 'insight';

export class ResearchAutomationError extends Error {
  constructor(readonly kind: 'authorization' | 'conflict' | 'rejected' | 'notFound' | 'integrity' | 'connection', message: string) { super(message); }
}

const base = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/research-automation/runs`;

export async function loadRuns(workspaceId: string, signal: AbortSignal): Promise<ResearchAutomationRunList> {
  const value = await request(`/api${base(workspaceId)}`, { headers: { Accept: 'application/json' }, signal });
  if (!researchAutomationRunList(value) || (value as ResearchAutomationRunList).workspaceId !== workspaceId) {
    throw new ResearchAutomationError('integrity', 'Lịch sử nghiên cứu không đúng workspace đang xem.');
  }
  return value as ResearchAutomationRunList;
}

export async function loadRun(workspaceId: string, runId: string, signal: AbortSignal): Promise<ResearchAutomationRun> {
  return verifiedRun(await request(`/api${base(workspaceId)}/${encodeURIComponent(runId)}`, { headers: { Accept: 'application/json' }, signal }), workspaceId, runId);
}

export async function startRun(workspaceId: string, body: ResearchAutomationStartBody, token: string): Promise<ResearchAutomationRun> {
  return verifiedReceipt(await request(`/owner-api${base(workspaceId)}`, ownerPost(body, token)), workspaceId, null).run;
}

export async function confirmScope(workspaceId: string, runId: string, body: ResearchAutomationConfirmBody, token: string): Promise<ResearchAutomationRun> {
  return verifiedReceipt(await request(`/owner-api${base(workspaceId)}/${encodeURIComponent(runId)}/confirm-scope`, ownerPost(body, token)), workspaceId, runId).run;
}

export async function cancelRun(workspaceId: string, runId: string, body: ResearchAutomationCancelBody, token: string): Promise<ResearchAutomationRun> {
  return verifiedReceipt(await request(`/owner-api${base(workspaceId)}/${encodeURIComponent(runId)}/cancel`, ownerPost(body, token)), workspaceId, runId).run;
}

/** Same-origin report of the frozen run version: the stored HTML, or the real PDF export. */
export function reportUrl(workspaceId: string, runId: string, kind: ResearchAutomationReportKind, format: 'web' | 'pdf'): string {
  return `/api${base(workspaceId)}/${encodeURIComponent(runId)}/reports/${kind}${format === 'pdf' ? '/pdf' : ''}`;
}

function ownerPost(body: unknown, token: string): RequestInit {
  return { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) };
}

function verifiedRun(value: unknown, workspaceId: string, runId: string | null): ResearchAutomationRun {
  if (!researchAutomationRun(value)) throw new ResearchAutomationError('integrity', 'Trạng thái nghiên cứu không vượt qua kiểm tra dữ liệu.');
  const run = value as ResearchAutomationRun;
  if (run.workspaceId !== workspaceId || (runId !== null && run.runId !== runId)) {
    throw new ResearchAutomationError('integrity', 'Trạng thái nghiên cứu không thuộc workspace đang xem.');
  }
  return run;
}

function verifiedReceipt(value: unknown, workspaceId: string, runId: string | null): ResearchAutomationReceipt {
  if (!researchAutomationReceipt(value)) throw new ResearchAutomationError('integrity', 'Phản hồi thao tác nghiên cứu không vượt qua kiểm tra dữ liệu.');
  const receipt = value as ResearchAutomationReceipt;
  verifiedRun(receipt.run, workspaceId, runId);
  return receipt;
}

async function request(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try { response = await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', redirect: 'error' }); }
  catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ResearchAutomationError('connection', 'Chưa kết nối được dịch vụ nghiên cứu.');
  }
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* the status still classifies this failure */ }
  if (response.status === 401 || response.status === 403) throw new ResearchAutomationError('authorization', errorMessage(payload, 'Mở khóa OWNER hợp lệ để tiếp tục.'));
  if (response.status === 404) throw new ResearchAutomationError('notFound', errorMessage(payload, 'Không tìm thấy phiên nghiên cứu này trong workspace.'));
  if (response.status === 409) throw new ResearchAutomationError('conflict', errorMessage(payload, 'Phiên nghiên cứu đã thay đổi trên máy chủ.'));
  if (response.status === 400 || response.status === 413 || response.status === 422) throw new ResearchAutomationError('rejected', errorMessage(payload, 'Máy chủ không nhận yêu cầu này. Kiểm tra lại thông tin rồi gửi lại.'));
  if (!response.ok) throw new ResearchAutomationError('connection', errorMessage(payload, 'Dịch vụ nghiên cứu chưa phản hồi được. Thử lại sau.'));
  if (payload === null) throw new ResearchAutomationError('integrity', 'Phản hồi nghiên cứu không phải dữ liệu hợp lệ.');
  return payload;
}

function errorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'object' && value !== null && 'error' in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message?: unknown }).message === 'string') return (error as { message: string }).message;
  }
  return fallback;
}
