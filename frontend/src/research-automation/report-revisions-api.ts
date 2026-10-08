import type {
  AutomationReportRevisionRequest,
  ResearchAutomationReportAttemptList,
  ResearchAutomationReportPair,
  ResearchAutomationReportVersionList,
  ResearchAutomationRevisionCancelRequest,
  ResearchAutomationRevisionReceipt,
} from '../../../contracts/api/research-automation-revision-api.generated';
import type { AutomationClassifiedReportRevisionRequest } from '../../../contracts/analysis/automation-classified-report-revision.generated';
import type { AutomationInsightReportRevisionRequest } from '../../../contracts/analysis/automation-insight-report-revision.generated';
import type { AutomationBoundedReportRevisionRequest } from '../../../contracts/analysis/automation-bounded-report-revision.generated';
import type { AutomationQuoteReportRevisionRequest } from '../../../contracts/analysis/automation-quote-report-revision.generated';
import {
  boundedReportRevision,
  classifiedReportRevision,
  insightReportRevision,
  quoteReportRevision,
  researchAutomationRevision,
  researchAutomationRevisionAttemptList,
  researchAutomationRevisionCancel,
  researchAutomationRevisionReceipt,
  researchAutomationRevisionVersionList,
} from '../generated/report-validators.generated.js';
import { ResearchAutomationError, type ResearchAutomationReportKind } from './api';

export type {
  AutomationBoundedReportRevisionRequest,
  AutomationClassifiedReportRevisionRequest,
  AutomationInsightReportRevisionRequest,
  AutomationQuoteReportRevisionRequest,
  AutomationReportRevisionRequest,
  ResearchAutomationReportAttemptList,
  ResearchAutomationReportPair,
  ResearchAutomationReportVersionList,
  ResearchAutomationRevisionCancelRequest,
  ResearchAutomationRevisionReceipt,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{64}$/;

const base = (workspaceId: string, runId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/research-automation/runs/${encodeURIComponent(runId)}`;

/** Read the immutable original pair and committed supplemental pairs in server order. */
export async function loadReportVersions(workspaceId: string, runId: string, signal: AbortSignal): Promise<ResearchAutomationReportVersionList> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  const value = await request(`/api${base(workspaceId, runId)}/report-versions`, { headers: { Accept: 'application/json' }, signal });
  if (!researchAutomationRevisionVersionList(value)) throw integrity('Danh sách phiên bản báo cáo không vượt qua kiểm tra contract.');
  const list = value as ResearchAutomationReportVersionList;
  if (list.workspaceId !== workspaceId || list.runId !== runId) throw integrity('Danh sách phiên bản báo cáo không thuộc đúng workspace và run.');
  verifyVersionSequence(list.versions);
  return list;
}

/** Read all retained attempts for a run so a reload can resume bounded polling. */
export async function loadReportAttempts(workspaceId: string, runId: string, signal: AbortSignal): Promise<ResearchAutomationReportAttemptList> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  const value = await request(`/api${base(workspaceId, runId)}/report-attempts`, { headers: { Accept: 'application/json' }, signal });
  if (!researchAutomationRevisionAttemptList(value)) throw integrity('Danh sách attempt báo cáo không vượt qua kiểm tra contract.');
  const list = value as ResearchAutomationReportAttemptList;
  if (list.workspaceId !== workspaceId || list.runId !== runId) throw integrity('Danh sách attempt báo cáo không thuộc đúng workspace và run.');
  const seen = new Set<string>();
  let previousNumber = 0;
  let active = 0;
  for (const receipt of list.attempts) {
    verifyReceipt(receipt, receipt.attemptId, false);
    if (seen.has(receipt.attemptId) || receipt.attemptNumber !== previousNumber + 1) throw integrity('Danh sách attempt báo cáo bị lặp hoặc sai thứ tự.');
    seen.add(receipt.attemptId);
    previousNumber = receipt.attemptNumber;
    if (receipt.state === 'QUEUED' || receipt.state === 'RUNNING') active++;
  }
  if (active > 1) throw integrity('Danh sách attempt báo cáo có nhiều lượt đang chạy.');
  return list;
}

/** Read one exact attempt; this never resolves an attempt from a latest-version shortcut. */
export async function loadReportAttempt(workspaceId: string, runId: string, attemptId: string, signal: AbortSignal): Promise<ResearchAutomationRevisionReceipt> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  assertUuid(attemptId, 'Attempt ID');
  const value = await request(`/api${base(workspaceId, runId)}/report-attempts/${encodeURIComponent(attemptId)}`, { headers: { Accept: 'application/json' }, signal });
  return verifyReceipt(value, attemptId, false);
}

/** Submit the exact owner snapshot once. A transport failure is surfaced; it is never retried here. */
export async function createReportRevision(workspaceId: string, runId: string, body: AutomationReportRevisionRequest | AutomationClassifiedReportRevisionRequest | AutomationInsightReportRevisionRequest | AutomationBoundedReportRevisionRequest | AutomationQuoteReportRevisionRequest, token: string): Promise<ResearchAutomationRevisionReceipt> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  const valid = body.contractVersion === 'automation-classified-report-revision-v1' ? classifiedReportRevision(body)
    : body.contractVersion === 'automation-insight-report-revision-v1' || body.contractVersion === 'automation-insight-default-report-revision-v1' || body.contractVersion === 'automation-insight-crosscheck-report-revision-v1' ? insightReportRevision(body)
    : body.contractVersion === 'automation-bounded-report-revision-v1' ? boundedReportRevision(body)
    : body.contractVersion === 'automation-quote-report-revision-v1' ? quoteReportRevision(body) : researchAutomationRevision(body);
  if (!valid) throw new ResearchAutomationError('rejected', 'Yêu cầu tạo phiên bản báo cáo không đúng contract.');
  const result = await requestWithStatus(`/owner-api${base(workspaceId, runId)}/report-revisions`, ownerPost(body, token), [200, 202]);
  return verifyReceipt(result.value, undefined, result.status === 200);
}

/** Cancel one exact queued/running attempt with the caller-supplied idempotency key. */
export async function cancelReportAttempt(workspaceId: string, runId: string, attemptId: string, body: ResearchAutomationRevisionCancelRequest, token: string): Promise<ResearchAutomationRevisionReceipt> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  assertUuid(attemptId, 'Attempt ID');
  if (!REQUEST_KEY.test(body.requestKey)) throw new ResearchAutomationError('rejected', 'Khóa thử lại phiên bản báo cáo không hợp lệ.');
  if (!researchAutomationRevisionCancel(body)) throw new ResearchAutomationError('integrity', 'Yêu cầu hủy phiên bản báo cáo không vượt qua contract.');
  const result = await requestWithStatus(`/owner-api${base(workspaceId, runId)}/report-attempts/${encodeURIComponent(attemptId)}/cancel`, ownerPost(body, token), [200]);
  const receipt = verifyReceipt(result.value, attemptId, undefined);
  if (receipt.state !== 'CANCELLED') throw integrity('Biên nhận hủy chưa xác nhận lượt bổ sung đã hủy.');
  return receipt;
}

/** Build a URL for a named immutable report pair; no implicit latest report is addressable here. */
export function exactReportUrl(workspaceId: string, runId: string, pairId: string, kind: ResearchAutomationReportKind, format: 'web' | 'pdf'): string {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  if (!DIGEST.test(pairId)) throw new TypeError('Pair ID is not a SHA-256 digest');
  if (kind !== 'market' && kind !== 'insight') throw new TypeError('Report kind is not supported');
  if (format !== 'web' && format !== 'pdf') throw new TypeError('Report format is not supported');
  return `/api${base(workspaceId, runId)}/report-versions/${pairId}/reports/${kind}${format === 'pdf' ? '/pdf' : ''}`;
}

function verifyVersionSequence(versions: readonly ResearchAutomationReportPair[]): void {
  const pairIds = new Set<string>();
  const attemptIds = new Set<string>();
  let outputKinds: readonly ('MARKET' | 'INSIGHT')[] | undefined;
  for (const [index, pair] of versions.entries()) {
    if (pair.versionNumber !== index + 1 || pairIds.has(pair.pairId)) throw integrity('Chuỗi phiên bản báo cáo bị lặp hoặc đứt thứ tự.');
    pairIds.add(pair.pairId);
    if ((index === 0) !== (pair.attemptId === null)) throw integrity('Phiên bản gốc và phiên bản bổ sung có định danh attempt mâu thuẫn.');
    if (pair.attemptId !== null && attemptIds.has(pair.attemptId)) throw integrity('Attempt báo cáo bị lặp trong chuỗi phiên bản.');
    if (pair.attemptId !== null) attemptIds.add(pair.attemptId);
    const kinds = pair.outputs.map(output => output.kind);
    if (kinds.join(',') !== (kinds.length === 1 ? kinds[0] : 'MARKET,INSIGHT') || (new Set(kinds).size !== kinds.length)) {
      throw integrity('Các output của phiên bản báo cáo không có thứ tự hoặc loại hợp lệ.');
    }
    if (outputKinds && kinds.join(',') !== outputKinds.join(',')) throw integrity('Các phiên bản báo cáo không giữ cùng tập output.');
    outputKinds = kinds;
  }
}

function verifyReceipt(value: unknown, expectedAttemptId: string | undefined, expectedExactRetry: boolean | undefined): ResearchAutomationRevisionReceipt {
  if (!researchAutomationRevisionReceipt(value)) throw integrity('Biên nhận phiên bản báo cáo không vượt qua kiểm tra contract.');
  const receipt = value as ResearchAutomationRevisionReceipt;
  if ((expectedAttemptId !== undefined && receipt.attemptId !== expectedAttemptId) || (expectedExactRetry !== undefined && receipt.exactRetry !== expectedExactRetry)) {
    throw integrity('Biên nhận phiên bản báo cáo không khớp yêu cầu chính xác.');
  }
  const hasPair = receipt.pairId !== null;
  if ((receipt.state === 'COMMITTED') !== hasPair) throw integrity('Trạng thái phiên bản báo cáo mâu thuẫn với pair đã lưu.');
  return receipt;
}

function ownerPost(body: unknown, token: string): RequestInit {
  if (!token || token.length < 1) throw new ResearchAutomationError('authorization', 'Thiếu quyền OWNER để thao tác phiên bản báo cáo.');
  return { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) };
}

async function request(url: string, init: RequestInit): Promise<unknown> {
  return (await requestWithStatus(url, init, [200])).value;
}

async function requestWithStatus(url: string, init: RequestInit, expectedStatuses: readonly number[]): Promise<{ readonly value: unknown; readonly status: number }> {
  let response: Response;
  try { response = await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', redirect: 'error' }); }
  catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ResearchAutomationError('connection', 'Chưa kết nối được dịch vụ phiên bản báo cáo.');
  }
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* status still classifies this failure */ }
  if (response.status === 401 || response.status === 403) throw new ResearchAutomationError('authorization', errorMessage(payload, 'Mở khóa OWNER hợp lệ để tiếp tục.'));
  if (response.status === 404) throw new ResearchAutomationError('notFound', errorMessage(payload, 'Không tìm thấy phiên bản báo cáo này.'));
  if (response.status === 409) throw new ResearchAutomationError('conflict', errorMessage(payload, 'Phiên bản báo cáo đã thay đổi trên máy chủ.'));
  if (response.status === 400 || response.status === 413 || response.status === 422) throw new ResearchAutomationError('rejected', errorMessage(payload, 'Máy chủ không nhận yêu cầu phiên bản báo cáo này.'));
  if (response.status === 500) throw new ResearchAutomationError('integrity', errorMessage(payload, 'Không xác minh được dữ liệu phiên bản đã lưu.'));
  if (!response.ok) throw new ResearchAutomationError('connection', errorMessage(payload, 'Dịch vụ phiên bản báo cáo chưa phản hồi được.'));
  if (!expectedStatuses.includes(response.status)) throw integrity('Mã phản hồi phiên bản báo cáo không đúng contract.');
  if (payload === null) throw integrity('Phản hồi phiên bản báo cáo không phải JSON hợp lệ.');
  return { value: payload, status: response.status };
}

function errorMessage(value: unknown, fallback: string): string {
  if (typeof value === 'object' && value !== null && 'error' in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message?: unknown }).message === 'string') return (error as { message: string }).message;
  }
  return fallback;
}

function assertUuid(value: string, label: string): void {
  if (!UUID.test(value)) throw new ResearchAutomationError('rejected', `${label} không hợp lệ.`);
}

function integrity(message: string): ResearchAutomationError {
  return new ResearchAutomationError('integrity', message);
}
