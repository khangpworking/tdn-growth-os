import type {
  ResearchAutomationReaderBuildRequest, ResearchAutomationReaderBuildReceipt, ResearchAutomationUnitSpecIntakeReceipt,
  ResearchAutomationReaderDecisionReceipt,
  ResearchAutomationReaderDecisionRequest,
  ResearchAutomationReaderRevision,
  ResearchAutomationReaderRevisionList,
} from '../../../contracts/api/research-automation-reader-report-api.generated';
import { readerReportBuild, readerReportBuildReceipt, readerUnitSpecIntakeReceipt, readerReportDecision, readerReportDecisionReceipt, readerReportList } from '../generated/report-validators.generated.js';
import { ResearchAutomationError } from './api';

export type { ResearchAutomationReaderBuildRequest, ResearchAutomationReaderDecisionRequest, ResearchAutomationReaderRevision, ResearchAutomationReaderRevisionList };

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

export const MAX_UNIT_SPEC_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_UNIT_SPEC_TOTAL_BYTES = 8 * 1024 * 1024;
export const MAX_READER_REQUEST_BYTES = 4 * 1024 * 1024 + 512 * 1024;
export type UnitSpecUpload = { readonly role: 'LISTING_SPEC' | 'OWNER_DECLARATION'; readonly file: File };

/** Explicit owner action: retain original JSON bytes, then build with its bound receipt.
 * Repeating the same files/request key is safe; no automatic retry or collection. */
export async function buildReaderWithUnitSpecs(workspaceId: string, runId: string, request: ResearchAutomationReaderBuildRequest,
  uploads: readonly UnitSpecUpload[], token: string, onRetained?: () => void): Promise<ResearchAutomationReaderBuildReceipt> {
  assertUuid(workspaceId); assertUuid(runId);
  if (!token) throw new ResearchAutomationError('authorization', 'Mở khóa OWNER để lưu quy cách và dựng bản đọc.');
  if (!readerReportBuild(request) || request.contractVersion !== 'reader-report-build-v1.2' || !request.unitPrices || !request.unitPrices.records.length)
    throw new ResearchAutomationError('rejected', 'Tệp yêu cầu cần có bộ quan sát quy cách và đúng phiên bản dựng bản đọc.');
  if (!uploads.length || uploads.length > 16 || uploads.reduce((n, upload) => n + upload.file.size, 0) > MAX_UNIT_SPEC_TOTAL_BYTES)
    throw new ResearchAutomationError('rejected', 'Chọn từ một đến 16 tệp, tổng không quá 8 MiB.');
  const form = new FormData();
  const metadata = { contractVersion: 'reader-unit-spec-intake-v1', metricPackageId: request.metricPackageId, platforms: request.platforms, unitPrices: request.unitPrices };
  form.set('metadata', JSON.stringify(metadata));
  const digests = new Set<string>();
  for (const { file, role } of uploads) {
    if (!file.size || file.size > MAX_UNIT_SPEC_FILE_BYTES) throw new ResearchAutomationError('rejected', 'Mỗi tệp quy cách cần có nội dung và không quá 2 MiB.');
    const bytes = await file.arrayBuffer();
    try { JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new ResearchAutomationError('rejected', 'Tệp quy cách phải là JSON UTF-8 hợp lệ.'); }
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (digests.has(digest) || !request.unitPrices.sources.some(source => source.sha256 === digest && source.role === role))
      throw new ResearchAutomationError('rejected', 'Tệp không khớp nguồn và vai trò trong yêu cầu, hoặc đã chọn lặp.');
    digests.add(digest); form.set(`file:${digest}`, file);
  }
  if (digests.size !== request.unitPrices.sources.length) throw new ResearchAutomationError('rejected', 'Chưa chọn đủ tệp nguồn trong yêu cầu.');
  const intakeResult = await requestWithStatus(`/owner-api${base(workspaceId, runId)}/reader-reports/unit-spec-intakes`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: form }, [200, 201]);
  if (!readerUnitSpecIntakeReceipt(intakeResult.value)) throw integrity('Biên nhận quy cách không đúng contract.');
  const receipt = intakeResult.value as ResearchAutomationUnitSpecIntakeReceipt;
  if (receipt.workspaceId !== workspaceId || receipt.runId !== runId || receipt.exactRetry !== (intakeResult.status === 200) || stable(receipt.request) !== stable(metadata))
    throw integrity('Biên nhận quy cách không khớp phiên và dữ liệu đã gửi.');
  onRetained?.();
  const result = await requestWithStatus(`/owner-api${base(workspaceId, runId)}/reader-reports`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ contractVersion: 'reader-report-unit-spec-build-v1', intakeSha256: receipt.intakeSha256, request }) }, [200, 201]);
  if (!readerReportBuildReceipt(result.value)) throw integrity('Biên nhận dựng bản đọc không đúng contract.');
  const built = result.value as ResearchAutomationReaderBuildReceipt;
  if (built.exactRetry !== (result.status === 200) || built.revision.workspaceId !== workspaceId || built.revision.runId !== runId ||
    built.revision.profileStatus !== request.profile.status || stable([...built.revision.platforms].sort()) !== stable([...request.platforms].sort()))
    throw integrity('Biên nhận dựng bản đọc không khớp yêu cầu.');
  return built;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object' && value !== null) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
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
