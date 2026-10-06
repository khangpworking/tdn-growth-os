import type {
  ResearchAutomationReaderDecisionReceipt,
  ResearchAutomationReaderDecisionRequest,
  ResearchAutomationReaderRevision,
  ResearchAutomationReaderRevisionList,
} from '../../../contracts/api/research-automation-reader-report-api.generated';
import { readerReportDecision, readerReportDecisionReceipt, readerReportList } from '../generated/report-validators.generated.js';
import { ResearchAutomationError } from './api';

export type { ResearchAutomationReaderDecisionRequest, ResearchAutomationReaderRevision, ResearchAutomationReaderRevisionList };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const base = (workspaceId: string, runId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/research-automation/runs/${encodeURIComponent(runId)}`;

/** OWNER reader pages of one run, oldest first. The automated draft is not part of this list. */
export async function loadReaderReports(workspaceId: string, runId: string, signal: AbortSignal): Promise<ResearchAutomationReaderRevisionList> {
  assertUuid(workspaceId); assertUuid(runId);
  const value = (await requestWithStatus(`/api${base(workspaceId, runId)}/reader-reports`, { headers: { Accept: 'application/json' }, signal }, [200])).value;
  if (!readerReportList(value)) throw integrity('Danh sách bản đọc không vượt qua kiểm tra contract.');
  const list = value as ResearchAutomationReaderRevisionList;
  if (list.workspaceId !== workspaceId || list.runId !== runId) throw integrity('Danh sách bản đọc không thuộc đúng phiên nghiên cứu.');
  list.revisions.forEach((revision, index) => {
    if (revision.revisionNumber !== index + 1 || revision.workspaceId !== workspaceId || revision.runId !== runId) throw integrity('Chuỗi bản đọc bị lặp hoặc đứt thứ tự.');
  });
  return list;
}

/** Same-origin reader page; served with its own CSP and no draft content. */
export function readerReportUrl(workspaceId: string, runId: string, revisionId: string): string {
  return `/api${base(workspaceId, runId)}/reader-reports/${encodeURIComponent(revisionId)}/html`;
}

/** Retry with the same request key returns the stored decision (200) instead of a second one. */
export async function decideReaderReport(workspaceId: string, runId: string, body: ResearchAutomationReaderDecisionRequest, token: string): Promise<ResearchAutomationReaderDecisionReceipt> {
  assertUuid(workspaceId); assertUuid(runId);
  if (!readerReportDecision(body)) throw new ResearchAutomationError('rejected', 'Quyết định bản đọc chưa hợp lệ.');
  if (!token) throw new ResearchAutomationError('authorization', 'Mở khóa OWNER để duyệt bản đọc.');
  const result = await requestWithStatus(`/owner-api${base(workspaceId, runId)}/reader-reports/decisions`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }, [200, 201]);
  if (!readerReportDecisionReceipt(result.value)) throw integrity('Biên nhận duyệt bản đọc không vượt qua kiểm tra contract.');
  const receipt = result.value as ResearchAutomationReaderDecisionReceipt;
  if (receipt.exactRetry !== (result.status === 200) || receipt.revision.revisionId !== body.revisionId || receipt.revision.decision?.decision !== body.decision) {
    throw integrity('Biên nhận duyệt bản đọc không khớp yêu cầu.');
  }
  return receipt;
}

async function requestWithStatus(url: string, init: RequestInit, expectedStatuses: readonly number[]): Promise<{ readonly value: unknown; readonly status: number }> {
  let response: Response;
  try { response = await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', redirect: 'error' }); }
  catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ResearchAutomationError('connection', 'Chưa kết nối được dịch vụ bản đọc.');
  }
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* status still classifies this failure */ }
  if (response.status === 401 || response.status === 403) throw new ResearchAutomationError('authorization', errorMessage(payload, 'Mở khóa OWNER hợp lệ để tiếp tục.'));
  if (response.status === 404) throw new ResearchAutomationError('notFound', errorMessage(payload, 'Không tìm thấy bản đọc này.'));
  if (response.status === 409) throw new ResearchAutomationError('conflict', errorMessage(payload, 'Bản đọc đã thay đổi trên máy chủ.'));
  if (response.status === 400 || response.status === 413 || response.status === 422) throw new ResearchAutomationError('rejected', errorMessage(payload, 'Máy chủ không nhận yêu cầu này.'));
  if (response.status === 500) throw new ResearchAutomationError('integrity', 'Không xác minh được bản đọc đã lưu.');
  if (!response.ok) throw new ResearchAutomationError('connection', 'Dịch vụ bản đọc chưa phản hồi được.');
  if (!expectedStatuses.includes(response.status)) throw integrity('Mã phản hồi bản đọc không đúng contract.');
  if (payload === null) throw integrity('Phản hồi bản đọc không phải JSON hợp lệ.');
  return { value: payload, status: response.status };
}

function errorMessage(value: unknown, fallback: string): string {
  const message = (value as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === 'string' && message.length <= 400 ? message : fallback;
}
function assertUuid(value: string): void { if (!UUID.test(value)) throw new ResearchAutomationError('rejected', 'Định danh phiên nghiên cứu không hợp lệ.'); }
function integrity(message: string): ResearchAutomationError { return new ResearchAutomationError('integrity', message); }
