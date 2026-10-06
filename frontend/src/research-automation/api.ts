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
import type { ResearchAutomationSourceConfirmRequest } from '../../../contracts/api/research-automation-source-api.generated';
import type { ResearchAutomationMetricPrepareRequest, ResearchAutomationMetricPrepareReceipt, ResearchAutomationPreparedMetricEntry, ResearchAutomationPreparedMetricList } from '../../../contracts/api/research-automation-metric-intake-api.generated';
import type { ResearchAutomationSupplementalPrepareRequest, ResearchAutomationSupplementalPrepareReceipt, ResearchAutomationSupplementalPreparedList } from '../../../contracts/api/research-automation-supplemental-intake-api.generated';
import { supplementalSourcePrepare, supplementalSourcePrepared, supplementalSourcePreparedList } from '../generated/report-validators.generated.js';
import { researchAutomationReceipt, researchAutomationRun, researchAutomationRunList, researchAutomationMetricPrepared, researchAutomationMetricPreparedList } from '../generated/report-validators.generated.js';

export type { ResearchAutomationRun, ResearchAutomationRunList };
export type ResearchAutomationStartBody = ResearchAutomationStartRequest;
export type ResearchAutomationConfirmBody = ResearchAutomationConfirmRequest | ResearchAutomationSourceConfirmRequest;
export type { ResearchAutomationSourceConfirmRequest, ResearchAutomationMetricPrepareRequest, ResearchAutomationMetricPrepareReceipt, ResearchAutomationPreparedMetricEntry };
export type { ResearchAutomationSupplementalPrepareRequest, ResearchAutomationSupplementalPrepareReceipt };
export type { ResearchAutomationSupplementalPreparedList };
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

export async function loadPreparedMetricSources(workspaceId: string, runId: string, signal: AbortSignal): Promise<ResearchAutomationPreparedMetricList> {
  const value = await request(`/api${base(workspaceId)}/${encodeURIComponent(runId)}/sources/metric`, { headers: { Accept: 'application/json' }, signal });
  if (!researchAutomationMetricPreparedList(value)) throw new ResearchAutomationError('integrity', 'Danh sách nguồn đã lưu không vượt qua kiểm tra dữ liệu.');
  const list = value as ResearchAutomationPreparedMetricList;
  if (list.workspaceId !== workspaceId || list.runId !== runId || new Set(list.sources.map(source => source.packageId)).size !== list.sources.length)
    throw new ResearchAutomationError('integrity', 'Danh sách nguồn không thuộc phiên nghiên cứu đang xem.');
  return list;
}

/** Storage only. Aborting stops waiting for the receipt; it does not undo server storage. */
export async function prepareMetricSource(workspaceId: string, runId: string, body: ResearchAutomationMetricPrepareRequest,
  workbook: File, token: string, signal?: AbortSignal): Promise<ResearchAutomationMetricPrepareReceipt> {
  const form = new FormData();
  form.append('metadata', JSON.stringify(body));
  form.append('workbook', workbook, workbook.name);
  const value = await request(`/owner-api${base(workspaceId)}/${encodeURIComponent(runId)}/sources/metric`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: form,
    ...(signal ? { signal } : {}),
  });
  if (!researchAutomationMetricPrepared(value)) throw new ResearchAutomationError('integrity', 'Phản hồi tải nguồn không vượt qua kiểm tra dữ liệu.');
  const receipt = value as ResearchAutomationMetricPrepareReceipt;
  if (receipt.requestKey !== body.requestKey || receipt.sourceLabel !== body.sourceLabel || receipt.acquiredAt !== body.acquiredAt ||
      receipt.measurementPeriod.startDate !== body.measurementPeriod.startDate || receipt.measurementPeriod.endDate !== body.measurementPeriod.endDate ||
      receipt.measurementPeriod.basis !== body.measurementPeriod.basis)
    throw new ResearchAutomationError('integrity', 'Phản hồi tải nguồn không khớp yêu cầu vừa gửi.');
  return receipt;
}

/** Read-only inventory; discovering a source never selects it or changes a report. */
export async function loadPreparedSupplementalSources(workspaceId: string, runId: string, signal: AbortSignal): Promise<ResearchAutomationSupplementalPreparedList> {
  const value = await request(`/api${base(workspaceId)}/${encodeURIComponent(runId)}/sources/supplemental`, {
    headers: { Accept: 'application/json' }, signal,
  }, [200]);
  if (!supplementalSourcePreparedList(value)) throw new ResearchAutomationError('integrity', 'Không xác minh được danh sách nguồn bổ sung.');
  const list = value as ResearchAutomationSupplementalPreparedList;
  if (list.workspaceId !== workspaceId || list.runId !== runId || new Set(list.packages.map(item => item.packageId)).size !== list.packages.length ||
      list.packages.some(item => new Set(item.files.map(file => file.path)).size !== item.files.length || !item.files.some(file => file.path === item.descriptorPath)))
    throw new ResearchAutomationError('integrity', 'Danh sách nguồn không khớp phiên nghiên cứu đang xem.');
  return list;
}

/** Stores exact files only. An uncertain response never triggers a retry or a report revision. */
export async function prepareSupplementalSource(workspaceId: string, runId: string,
  body: ResearchAutomationSupplementalPrepareRequest, supplied: ReadonlyMap<string, Blob>, token: string,
  signal?: AbortSignal): Promise<ResearchAutomationSupplementalPrepareReceipt> {
  if (!token) throw new ResearchAutomationError('authorization', 'Mở khóa OWNER để lưu nguồn bổ sung.');
  if (!supplementalSourcePrepare(body)) throw new ResearchAutomationError('rejected', 'Thông tin nguồn bổ sung chưa đúng định dạng.');
  const input = JSON.parse(JSON.stringify(body)) as ResearchAutomationSupplementalPrepareRequest;
  const files = new Map(supplied);
  if (files.size !== input.files.length || new Set(input.files.map(file => file.path)).size !== input.files.length ||
      input.files.some(file => !(files.get(file.path) instanceof Blob)))
    throw new ResearchAutomationError('rejected', 'Các tệp được chọn chưa khớp danh sách nguồn.');
  if ([...files.values()].some(file => file.size === 0 || file.size > 8 * 1024 * 1024) ||
      [...files.values()].reduce((sum, file) => sum + file.size, 0) > 32 * 1024 * 1024)
    throw new ResearchAutomationError('rejected', 'Mỗi tệp tối đa 8 MiB; tổng các tệp tối đa 32 MiB.');
  const form = new FormData(); form.append('metadata', JSON.stringify(input));
  const expected = new Map<string, { sha256: string; byteSize: number; mediaType: string }>();
  for (const file of input.files) {
    const blob = files.get(file.path)!;
    const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    expected.set(file.path, { sha256: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join(''),
      byteSize: blob.size, mediaType: file.mediaType });
    form.append(`file:${file.path}`, blob, 'source');
  }
  const value = await request(`/owner-api${base(workspaceId)}/${encodeURIComponent(runId)}/sources/supplemental`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: form,
    ...(signal ? { signal } : {}),
  }, [200, 201]);
  if (!supplementalSourcePrepared(value)) throw new ResearchAutomationError('integrity', 'Không xác minh được biên nhận nguồn bổ sung.');
  const receipt = value as ResearchAutomationSupplementalPrepareReceipt;
  if (receipt.requestKey !== input.requestKey || receipt.family !== input.family || receipt.descriptorPath !== input.descriptorPath ||
      receipt.sourceLabel !== input.sourceLabel || receipt.acquiredAt !== input.acquiredAt || receipt.files.length !== expected.size ||
      new Set(receipt.files.map(file => file.path)).size !== expected.size || receipt.files.some(file => {
        const original = expected.get(file.path);
        return !original || original.sha256 !== file.sha256 || original.byteSize !== file.byteSize || original.mediaType !== file.mediaType;
      })) throw new ResearchAutomationError('integrity', 'Biên nhận không khớp những tệp vừa gửi. Chưa dùng nguồn này để tạo báo cáo.');
  return receipt;
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

async function request(url: string, init: RequestInit, expectedStatuses?: readonly number[]): Promise<unknown> {
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
  if (response.status === 500) throw new ResearchAutomationError('integrity', errorMessage(payload, 'Không xác minh được dữ liệu đã lưu. Chưa thực hiện bước tiếp theo.'));
  if (!response.ok) throw new ResearchAutomationError('connection', errorMessage(payload, 'Dịch vụ nghiên cứu chưa phản hồi được. Thử lại sau.'));
  if (expectedStatuses && !expectedStatuses.includes(response.status)) throw new ResearchAutomationError('integrity', 'Mã phản hồi không đúng thao tác vừa gửi.');
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
