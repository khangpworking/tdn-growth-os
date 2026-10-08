// Transport for exact-source Insight coding. Every type is an alias of a generated contract; this module
// only sends requests and verifies that responses bind exactly to the workspace, run and pair being viewed.
import type {
  InsightCodingAcceptRequest,
  InsightCodingAdoptRequest,
  InsightCodingProposeRequest,
  InsightSourceBinding,
} from '../../../contracts/analysis/automation-insight-coding.generated';
import type { ResearchInsightCodingMutation, ResearchInsightCodingView as LegacyInsightCodingView, ResearchInsightCodingDefaultView } from '../../../contracts/api/research-automation-insight-coding-api.generated';
import type { InsightDefaultModelRequest, InsightModelRequest } from '../../../contracts/analysis/automation-insight-model.generated';
import type { ResearchInsightModelResponse } from '../../../contracts/api/research-automation-insight-model-api.generated';
import { insightCodingAccept, insightCodingAdopt, insightCodingMutation, insightCodingPropose, insightCodingDefaultRule, insightCodingDefaultPropose, insightCodingAnyView, insightDefaultModelRequest, insightModelRequest, insightModelResponse } from '../generated/report-validators.generated.js';
import { ResearchAutomationError } from './api';

export type ResearchInsightCodingView = LegacyInsightCodingView | ResearchInsightCodingDefaultView;
export type {
  InsightCodingAcceptRequest,
  InsightCodingAdoptRequest,
  InsightCodingProposeRequest,
  InsightSourceBinding,
  ResearchInsightCodingMutation,
  InsightModelRequest,
  ResearchInsightModelResponse,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{64}$/;

const base = (workspaceId: string, runId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/research-automation/runs/${encodeURIComponent(runId)}`;

/** Read the exact source context and the full bounded coding history of one report pair, in server order. */
export async function loadInsightCoding(workspaceId: string, runId: string, pairId: string, signal: AbortSignal): Promise<ResearchInsightCodingView> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  assertDigest(pairId, 'Pair ID');
  const value = await request(`/api${base(workspaceId, runId)}/insight-coding/${encodeURIComponent(pairId)}`, { headers: { Accept: 'application/json' }, signal });
  if (!insightCodingAnyView(value)) throw integrity('Xem xét gán mã Insight không vượt qua kiểm tra contract.');
  const view = value as ResearchInsightCodingView;
  if (!bindingMatches(view.context.binding, workspaceId, runId, pairId)) {
    throw integrity('Bối cảnh gán mã không thuộc đúng cặp báo cáo đang xem.');
  }
  const seen = new Set<string>();
  for (const item of view.evidence) {
    if (!sameBinding(item.binding, view.context.binding)) throw integrity('Bằng chứng gán mã không khớp ràng buộc nguồn của cặp báo cáo.');
    if (seen.has(item.evidenceId)) throw integrity('Lịch sử gán mã bị lặp định danh bằng chứng.');
    seen.add(item.evidenceId);
    if (!evidenceRequestValidator(item.kind, item.request.contractVersion)(item.request)) throw integrity('Yêu cầu trong bằng chứng gán mã không đúng contract.');
    if ((item.request.contractVersion === 'insight-coding-adopt-v1' || item.request.contractVersion === 'insight-coding-default-rule-v1') && !sameBinding(item.request.binding, view.context.binding)) {
      throw integrity('Yêu cầu công bố trong bằng chứng không khớp ràng buộc nguồn.');
    }
  }
  return view;
}

/** Adopt an Insight coding rulebook once. A transport failure is surfaced; it is never retried here. */
export async function adoptInsightCoding(workspaceId: string, runId: string, body: InsightCodingAdoptRequest, token: string): Promise<ResearchInsightCodingMutation> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  assertDigest(body.binding.pairId, 'Pair ID');
  if (!REQUEST_KEY.test(body.requestKey)) throw new ResearchAutomationError('rejected', 'Khóa thử lại công bố gán mã không hợp lệ.');
  if (body.binding.workspaceId !== workspaceId || body.binding.runId !== runId) {
    throw new ResearchAutomationError('rejected', 'Yêu cầu công bố gán mã không thuộc workspace và phiên đang thao tác.');
  }
  if (!insightCodingAdopt(body)) throw new ResearchAutomationError('rejected', 'Yêu cầu công bố gán mã Insight không đúng contract.');
  const result = await requestWithStatus(`/owner-api${base(workspaceId, runId)}/insight-coding-adoptions`, ownerPost(body, token), [200, 201]);
  return verifyMutation(result.value, 'ADOPTION', result.status === 201);
}

/** Propose Insight annotations for one adopted rulebook once. A transport failure is surfaced; it is never retried here. */
export async function proposeInsightCoding(workspaceId: string, runId: string, body: InsightCodingProposeRequest, token: string): Promise<ResearchInsightCodingMutation> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  if (!REQUEST_KEY.test(body.requestKey)) throw new ResearchAutomationError('rejected', 'Khóa thử lại đề xuất gán mã không hợp lệ.');
  if (!insightCodingPropose(body)) throw new ResearchAutomationError('rejected', 'Yêu cầu đề xuất gán mã Insight không đúng contract.');
  const result = await requestWithStatus(`/owner-api${base(workspaceId, runId)}/insight-coding-proposals`, ownerPost(body, token), [200, 201]);
  return verifyMutation(result.value, 'PROPOSAL', result.status === 201);
}

/** Accept one exact proposal by digest and caller-selected indexes once. A transport failure is surfaced; it is never retried here. */
export async function acceptInsightCoding(workspaceId: string, runId: string, body: InsightCodingAcceptRequest, token: string): Promise<ResearchInsightCodingMutation> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  if (!REQUEST_KEY.test(body.requestKey)) throw new ResearchAutomationError('rejected', 'Khóa thử lại duyệt gán mã không hợp lệ.');
  if (!DIGEST.test(body.proposalSha256)) throw new ResearchAutomationError('rejected', 'Mã rút gọn đề xuất gán mã không hợp lệ.');
  if (!insightCodingAccept(body)) throw new ResearchAutomationError('rejected', 'Yêu cầu duyệt gán mã Insight không đúng contract.');
  const result = await requestWithStatus(`/owner-api${base(workspaceId, runId)}/insight-coding-receipts`, ownerPost(body, token), [200, 201]);
  return verifyMutation(result.value, 'RECEIPT', result.status === 201);
}

/** One explicit model attempt. The caller retains the request identity after an ambiguous outcome. */
export async function proposeInsightCodingModel(
  workspaceId: string, runId: string, body: InsightModelRequest, token: string, signal: AbortSignal,
): Promise<ResearchInsightModelResponse> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  if (!insightModelRequest(body)) throw new ResearchAutomationError('rejected', 'Yêu cầu tạo đề xuất AI không đúng contract.');
  const result = await requestWithStatus(
    `/owner-api${base(workspaceId, runId)}/insight-coding-model-proposals`,
    { ...ownerPost(body, token), signal }, [200, 201],
  );
  if (!insightModelResponse(result.value)) throw integrity('Phản hồi tạo đề xuất AI không đúng contract.');
  const response = result.value as ResearchInsightModelResponse;
  if (response.status === 'PROPOSED') verifyMutation(response.proposal, 'PROPOSAL', result.status === 201);
  else if (result.status !== 200) throw integrity('Trạng thái chưa có đề xuất không thể là tạo mới thành công.');
  return response;
}

/** One explicit default attempt, with the same owner and runtime model gates as the adopted path. */
export async function proposeDefaultInsightCodingModel(workspaceId: string, runId: string, body: InsightDefaultModelRequest, token: string, signal: AbortSignal): Promise<ResearchInsightModelResponse> {
  assertUuid(workspaceId, 'Workspace ID'); assertUuid(runId, 'Run ID');
  if (!insightDefaultModelRequest(body) || !bindingMatches(body.binding, workspaceId, runId, body.binding.pairId)) throw new ResearchAutomationError('rejected', 'Yêu cầu mã hóa mặc định không khớp nguồn đã chọn.');
  const result = await requestWithStatus(`/owner-api${base(workspaceId, runId)}/insight-coding-default-model-proposals`, { ...ownerPost(body, token), signal }, [200, 201]);
  if (!insightModelResponse(result.value)) throw integrity('Phản hồi đề xuất mặc định không đúng contract.');
  const response = result.value as ResearchInsightModelResponse;
  if (response.status === 'PROPOSED') verifyMutation(response.proposal, 'PROPOSAL', result.status === 201);
  else if (result.status !== 200) throw integrity('Trạng thái chưa có đề xuất không thể là tạo mới thành công.');
  return response;
}

function evidenceRequestValidator(kind: 'ADOPTION' | 'PROPOSAL' | 'RECEIPT' | 'DEFAULT_RULE', version: string): (data: unknown) => boolean {
  if (kind === 'DEFAULT_RULE') return insightCodingDefaultRule;
  if (kind === 'PROPOSAL' && version === 'insight-coding-default-propose-v1') return insightCodingDefaultPropose;
  return kind === 'ADOPTION' ? insightCodingAdopt : kind === 'PROPOSAL' ? insightCodingPropose : insightCodingAccept;
}

function verifyMutation(value: unknown, kind: 'ADOPTION' | 'PROPOSAL' | 'RECEIPT', expectedNew: boolean): ResearchInsightCodingMutation {
  if (!insightCodingMutation(value)) throw integrity('Phản hồi thao tác gán mã Insight không vượt qua kiểm tra contract.');
  const mutation = value as ResearchInsightCodingMutation;
  if (mutation.kind !== kind || mutation.exactRetry !== !expectedNew) {
    throw integrity('Phản hồi thao tác gán mã không khớp loại và trạng thái gửi lần đầu.');
  }
  return mutation;
}

function bindingMatches(binding: InsightSourceBinding, workspaceId: string, runId: string, pairId: string): boolean {
  return binding.workspaceId === workspaceId && binding.runId === runId && binding.pairId === pairId;
}

function sameBinding(a: InsightSourceBinding, b: InsightSourceBinding): boolean {
  return bindingMatches(a, b.workspaceId, b.runId, b.pairId) &&
    a.scopeSha256 === b.scopeSha256 && a.reportSha256 === b.reportSha256 && a.sourceKind === b.sourceKind &&
    a.sourcePackageSha256 === b.sourcePackageSha256 && a.inputSha256 === b.inputSha256;
}

function ownerPost(body: unknown, token: string): RequestInit {
  if (!token || token.length < 1) throw new ResearchAutomationError('authorization', 'Thiếu quyền OWNER để thao tác gán mã Insight.');
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
    throw new ResearchAutomationError('connection', 'Chưa kết nối được dịch vụ gán mã Insight.');
  }
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* status still classifies this failure */ }
  if (response.status === 401 || response.status === 403) throw new ResearchAutomationError('authorization', errorMessage(payload, 'Mở khóa OWNER hợp lệ để tiếp tục.'));
  if (response.status === 404) throw new ResearchAutomationError('notFound', errorMessage(payload, 'Không tìm thấy thành phần gán mã Insight này.'));
  if (response.status === 409) throw new ResearchAutomationError('conflict', errorMessage(payload, 'Gán mã Insight đã thay đổi trên máy chủ.'));
  if (response.status === 400 || response.status === 413 || response.status === 422) throw new ResearchAutomationError('rejected', errorMessage(payload, 'Máy chủ không nhận yêu cầu gán mã Insight này.'));
  if (response.status === 500) throw new ResearchAutomationError('integrity', errorMessage(payload, 'Không xác minh được dữ liệu gán mã Insight đã lưu.'));
  if (!response.ok) throw new ResearchAutomationError('connection', errorMessage(payload, 'Dịch vụ gán mã Insight chưa phản hồi được.'));
  if (!expectedStatuses.includes(response.status)) throw integrity('Mã phản hồi gán mã Insight không đúng contract.');
  if (payload === null) throw integrity('Phản hồi gán mã Insight không phải JSON hợp lệ.');
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

function assertDigest(value: string, label: string): void {
  if (!DIGEST.test(value)) throw new ResearchAutomationError('rejected', `${label} không hợp lệ.`);
}

function integrity(message: string): ResearchAutomationError {
  return new ResearchAutomationError('integrity', message);
}
