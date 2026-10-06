import type {
  AutomationMetricRuleAdoptionList,
  AutomationMetricRuleAdoptionReceipt,
  AutomationMetricRuleAdoptionRequest,
} from '../../../contracts/analysis/automation-metric-rule-adoption.generated';
import type {
  MetricMembershipAcceptRequest,
  MetricMembershipProposeRequest,
} from '../../../contracts/analysis/automation-metric-membership.generated';
import type {
  ResearchMetricMembershipMutation,
  ResearchMetricMembershipProposal,
  ResearchMetricMembershipReceipt,
  ResearchMetricMembershipReview,
} from '../../../contracts/api/research-automation-metric-membership-api.generated';
import {
  metricMembershipAccept,
  metricMembershipMutation,
  metricMembershipProposal,
  metricMembershipPropose,
  metricMembershipReceipt,
  metricMembershipReview,
  metricRuleAdopt,
  metricRuleList,
  metricRuleReceipt,
} from '../generated/report-validators.generated.js';
import { ResearchAutomationError } from './api';

export type {
  AutomationMetricRuleAdoptionList,
  AutomationMetricRuleAdoptionReceipt,
  AutomationMetricRuleAdoptionRequest,
  MetricMembershipAcceptRequest,
  MetricMembershipProposeRequest,
  ResearchMetricMembershipMutation,
  ResearchMetricMembershipProposal,
  ResearchMetricMembershipReceipt,
  ResearchMetricMembershipReview,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{64}$/;

const base = (workspaceId: string, runId: string) =>
  `/workspaces/${encodeURIComponent(workspaceId)}/research-automation/runs/${encodeURIComponent(runId)}`;

/** Read all retained metric rule adoptions for a run in server order. */
export async function loadMetricRuleAdoptions(workspaceId: string, runId: string, signal: AbortSignal): Promise<AutomationMetricRuleAdoptionList> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  const value = await request(`/api${base(workspaceId, runId)}/metric-rule-adoptions`, { headers: { Accept: 'application/json' }, signal });
  if (!metricRuleList(value)) throw integrity('Danh sách công bố quy tắc chỉ số không vượt qua kiểm tra contract.');
  const list = value as AutomationMetricRuleAdoptionList;
  if (list.workspaceId !== workspaceId || list.runId !== runId) throw integrity('Danh sách công bố quy tắc không thuộc đúng workspace và run.');
  const seen = new Set<string>();
  for (const receipt of list.adoptions) {
    verifyRuleReceipt(receipt, workspaceId, runId);
    if (seen.has(receipt.adoptionId)) throw integrity('Danh sách công bố quy tắc bị lặp định danh.');
    seen.add(receipt.adoptionId);
  }
  return list;
}

/** Read one exact metric rule adoption receipt; this never resolves an adoption by shortcut. */
export async function loadMetricRuleAdoption(workspaceId: string, runId: string, adoptionId: string, signal: AbortSignal): Promise<AutomationMetricRuleAdoptionReceipt> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  assertUuid(adoptionId, 'Adoption ID');
  const value = await request(`/api${base(workspaceId, runId)}/metric-rule-adoptions/${encodeURIComponent(adoptionId)}`, { headers: { Accept: 'application/json' }, signal });
  return verifyRuleReceipt(value, workspaceId, runId, adoptionId);
}

/** Adopt a metric classification rulebook once. A transport failure is surfaced; it is never retried here. */
export async function adoptMetricRule(workspaceId: string, runId: string, body: AutomationMetricRuleAdoptionRequest, token: string): Promise<AutomationMetricRuleAdoptionReceipt> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  if (!REQUEST_KEY.test(body.requestKey)) throw new ResearchAutomationError('rejected', 'Khóa thử lại công bố quy tắc không hợp lệ.');
  if (!metricRuleAdopt(body)) throw new ResearchAutomationError('rejected', 'Yêu cầu công bố quy tắc chỉ số không đúng contract.');
  const result = await requestWithStatus(`/owner-api${base(workspaceId, runId)}/metric-rule-adoptions`, ownerPost(body, token), [200, 201]);
  return verifyRuleReceipt(result.value, workspaceId, runId, undefined, result.status === 201);
}

/** Read the membership review of one exact report pair under one exact rule adoption. */
export async function loadMetricMembershipReview(workspaceId: string, runId: string, pairId: string, adoptionId: string, signal: AbortSignal): Promise<ResearchMetricMembershipReview> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  assertDigest(pairId, 'Pair ID');
  assertUuid(adoptionId, 'Adoption ID');
  const value = await request(`/api${base(workspaceId, runId)}/metric-membership/${encodeURIComponent(pairId)}/${encodeURIComponent(adoptionId)}`, { headers: { Accept: 'application/json' }, signal });
  if (!metricMembershipReview(value)) throw integrity('Xem xét thành viên chỉ số không vượt qua kiểm tra contract.');
  const review = value as ResearchMetricMembershipReview;
  if (review.workspaceId !== workspaceId || review.runId !== runId || review.pairId !== pairId || review.adoptionId !== adoptionId) {
    throw integrity('Xem xét thành viên không thuộc đúng cặp báo cáo và công bố quy tắc đang xem.');
  }
  let accepted = 0;
  let pending = 0;
  const seenKeys = new Set<string>();
  for (const record of review.records) {
    if (seenKeys.has(record.recordKey)) throw integrity('Xem xét thành viên bị lặp khóa bản ghi.');
    seenKeys.add(record.recordKey);
    if (record.state === 'ACCEPTED') {
      if (record.classification === null || record.group === null || record.proposalId === null)
        throw integrity('Dòng đã duyệt thiếu phân loại hoặc định danh đề xuất.');
      accepted++;
    } else {
      if (record.classification !== null || record.group !== null || record.proposalId !== null)
        throw integrity('Dòng chờ duyệt không được hiển thị như phân loại đã duyệt.');
      pending++;
    }
  }
  if (review.recordCount !== review.records.length || review.acceptedCount !== accepted || review.pendingCount !== pending) {
    throw integrity('Xem xét thành viên không nhất quán giữa số đếm và danh sách bản ghi.');
  }
  if (review.complete !== (review.recordCount > 0 && pending === 0)) throw integrity('Trạng thái hoàn tất xem xét thành viên mâu thuẫn với danh sách bản ghi.');
  if ((accepted === 0) !== (review.acceptedReceiptIds.length === 0) || review.acceptedReceiptIds.length > accepted)
    throw integrity('Danh sách biên nhận không khớp số dòng đã duyệt.');
  return review;
}

/** Read one exact membership proposal view. */
export async function loadMetricMembershipProposal(workspaceId: string, runId: string, proposalId: string, signal: AbortSignal): Promise<ResearchMetricMembershipProposal> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  assertUuid(proposalId, 'Proposal ID');
  const value = await request(`/api${base(workspaceId, runId)}/metric-membership-proposals/${encodeURIComponent(proposalId)}`, { headers: { Accept: 'application/json' }, signal });
  if (!metricMembershipProposal(value)) throw integrity('Đề xuất thành viên chỉ số không vượt qua kiểm tra contract.');
  const proposal = value as ResearchMetricMembershipProposal;
  if (proposal.workspaceId !== workspaceId || proposal.runId !== runId || proposal.proposalId !== proposalId) throw integrity('Đề xuất không khớp định danh đã yêu cầu.');
  if (!verifyUnique('recordKey', proposal.assignments)) throw integrity('Đề xuất thành viên bị lặp khóa bản ghi.');
  return proposal;
}

/** Read one exact membership acceptance receipt view. */
export async function loadMetricMembershipReceipt(workspaceId: string, runId: string, receiptId: string, signal: AbortSignal): Promise<ResearchMetricMembershipReceipt> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  assertUuid(receiptId, 'Receipt ID');
  const value = await request(`/api${base(workspaceId, runId)}/metric-membership-receipts/${encodeURIComponent(receiptId)}`, { headers: { Accept: 'application/json' }, signal });
  if (!metricMembershipReceipt(value)) throw integrity('Biên nhận thành viên chỉ số không vượt qua kiểm tra contract.');
  const receipt = value as ResearchMetricMembershipReceipt;
  if (receipt.workspaceId !== workspaceId || receipt.runId !== runId || receipt.receiptId !== receiptId) throw integrity('Biên nhận không khớp định danh đã yêu cầu.');
  if (!verifyUnique('key', receipt.selectedRecordKeys)) throw integrity('Biên nhận thành viên bị lặp khóa bản ghi đã chọn.');
  return receipt;
}

/** Propose metric membership assignments once. A transport failure is surfaced; it is never retried here. */
export async function proposeMetricMembership(workspaceId: string, runId: string, body: MetricMembershipProposeRequest, token: string): Promise<ResearchMetricMembershipMutation> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  assertDigest(body.pairId, 'Pair ID');
  if (!REQUEST_KEY.test(body.requestKey)) throw new ResearchAutomationError('rejected', 'Khóa thử lại đề xuất thành viên không hợp lệ.');
  if (!metricMembershipPropose(body)) throw new ResearchAutomationError('rejected', 'Yêu cầu đề xuất thành viên chỉ số không đúng contract.');
  const result = await requestWithStatus(`/owner-api${base(workspaceId, runId)}/metric-membership-proposals`, ownerPost(body, token), [200, 201]);
  return verifyMutation(result.value, 'PROPOSAL', result.status === 201);
}

/** Accept one exact proposal with the caller-selected record keys once. A transport failure is surfaced; it is never retried here. */
export async function acceptMetricMembership(workspaceId: string, runId: string, body: MetricMembershipAcceptRequest, token: string): Promise<ResearchMetricMembershipMutation> {
  assertUuid(workspaceId, 'Workspace ID');
  assertUuid(runId, 'Run ID');
  if (!REQUEST_KEY.test(body.requestKey)) throw new ResearchAutomationError('rejected', 'Khóa thử lại chọn thành viên không hợp lệ.');
  if (!verifyUnique('key', body.selectedRecordKeys)) throw new ResearchAutomationError('rejected', 'Danh sách bản ghi chọn bị lặp khóa.');
  if (!metricMembershipAccept(body)) throw new ResearchAutomationError('rejected', 'Yêu cầu chọn thành viên chỉ số không đúng contract.');
  const result = await requestWithStatus(`/owner-api${base(workspaceId, runId)}/metric-membership-receipts`, ownerPost(body, token), [200, 201]);
  return verifyMutation(result.value, 'ACCEPTANCE', result.status === 201);
}

function verifyRuleReceipt(value: unknown, workspaceId: string, runId: string, expectedAdoptionId?: string, expectedNew?: boolean): AutomationMetricRuleAdoptionReceipt {
  if (!metricRuleReceipt(value)) throw integrity('Biên nhận công bố quy tắc không vượt qua kiểm tra contract.');
  const receipt = value as AutomationMetricRuleAdoptionReceipt;
  if (receipt.workspaceId !== workspaceId || receipt.runId !== runId ||
      (expectedAdoptionId !== undefined && receipt.adoptionId !== expectedAdoptionId) || (expectedNew !== undefined && receipt.exactRetry !== !expectedNew)) {
    throw integrity('Biên nhận công bố quy tắc không khớp yêu cầu chính xác.');
  }
  return receipt;
}

function verifyMutation(value: unknown, kind: 'PROPOSAL' | 'ACCEPTANCE', expectedNew: boolean): ResearchMetricMembershipMutation {
  if (!metricMembershipMutation(value)) throw integrity('Phản hồi thao tác thành viên chỉ số không vượt qua kiểm tra contract.');
  const mutation = value as ResearchMetricMembershipMutation;
  if (mutation.kind !== kind || mutation.exactRetry !== !expectedNew) {
    throw integrity('Phản hồi thao tác thành viên chỉ số không khớp loại và trạng thái gửi lần đầu.');
  }
  return mutation;
}

function verifyUnique(field: 'recordKey' | 'key', values: readonly (string | { recordKey: string })[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const key = field === 'recordKey' ? (value as { recordKey: string }).recordKey : (value as string);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

function ownerPost(body: unknown, token: string): RequestInit {
  if (!token || token.length < 1) throw new ResearchAutomationError('authorization', 'Thiếu quyền OWNER để thao tác thành viên chỉ số.');
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
    throw new ResearchAutomationError('connection', 'Chưa kết nối được dịch vụ thành viên chỉ số.');
  }
  let payload: unknown = null;
  try { payload = await response.json(); } catch { /* status still classifies this failure */ }
  if (response.status === 401 || response.status === 403) throw new ResearchAutomationError('authorization', errorMessage(payload, 'Mở khóa OWNER hợp lệ để tiếp tục.'));
  if (response.status === 404) throw new ResearchAutomationError('notFound', errorMessage(payload, 'Không tìm thấy thành phần thành viên chỉ số này.'));
  if (response.status === 409) throw new ResearchAutomationError('conflict', errorMessage(payload, 'Thành viên chỉ số đã thay đổi trên máy chủ.'));
  if (response.status === 400 || response.status === 413 || response.status === 422) throw new ResearchAutomationError('rejected', errorMessage(payload, 'Máy chủ không nhận yêu cầu thành viên chỉ số này.'));
  if (response.status === 500) throw new ResearchAutomationError('integrity', errorMessage(payload, 'Không xác minh được dữ liệu thành viên chỉ số đã lưu.'));
  if (!response.ok) throw new ResearchAutomationError('connection', errorMessage(payload, 'Dịch vụ thành viên chỉ số chưa phản hồi được.'));
  if (!expectedStatuses.includes(response.status)) throw integrity('Mã phản hồi thành viên chỉ số không đúng contract.');
  if (payload === null) throw integrity('Phản hồi thành viên chỉ số không phải JSON hợp lệ.');
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
