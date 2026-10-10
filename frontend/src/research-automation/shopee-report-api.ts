import type {
  ShopeeCodingContextView, ShopeeCodingHistory, ShopeeCodingProposeRequest, ShopeeCodingReadView,
  ShopeeCodingReceipt, ShopeeConsumptionView, ShopeeSampleSelection,
} from '../../../contracts/analysis/shopee-review-coding-v1.generated';
import {
  shopeeCodingContext, shopeeCodingHistory, shopeeCodingPropose, shopeeCodingReadView, shopeeCodingReceipt, shopeeSampleSelection,
} from '../generated/report-validators.generated.js';
import { ResearchAutomationError } from './api';

export type { ShopeeCodingContextView, ShopeeCodingHistory, ShopeeCodingProposeRequest, ShopeeCodingReadView, ShopeeCodingReceipt, ShopeeConsumptionView, ShopeeSampleSelection };

const base = (workspaceId: string, runId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/research-automation/runs/${encodeURIComponent(runId)}`;
const fail = (message = 'Dữ liệu Shopee không khớp contract hoặc nguồn đã chọn.') => new ResearchAutomationError('integrity', message);

async function request(url: string, init: RequestInit, statuses: readonly number[]): Promise<{ status: number; value: unknown }> {
  let response: Response;
  try { response = await fetch(url, { cache: 'no-store', ...init }); }
  catch { throw new ResearchAutomationError('connection', 'Chưa kết nối được máy chủ Shopee.'); }
  let value: unknown;
  try { value = await response.json(); } catch { throw fail(); }
  if (!statuses.includes(response.status)) {
    throw new ResearchAutomationError(
      response.status === 401 || response.status === 403 ? 'authorization' : response.status === 409 ? 'conflict' : response.status === 400 ? 'rejected' : response.status === 404 ? 'notFound' : 'connection',
      'Máy chủ chưa chấp nhận yêu cầu Shopee; kiểm tra mẫu, đề xuất và quyền OWNER.',
    );
  }
  return { status: response.status, value };
}

export async function loadShopeeSampleSelection(workspaceId: string, runId: string, signal: AbortSignal): Promise<ShopeeSampleSelection> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/shopee-coding/samples`, { headers: { Accept: 'application/json' }, signal }, [200]);
  if (!shopeeSampleSelection(value)) throw fail();
  const selection = value as ShopeeSampleSelection;
  if (selection.binding.workspaceId !== workspaceId || selection.binding.runId !== runId) throw fail();
  return selection;
}

export async function loadShopeeCodingContext(workspaceId: string, runId: string, signal: AbortSignal): Promise<ShopeeCodingContextView> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/shopee-coding/context`, { headers: { Accept: 'application/json' }, signal }, [200]);
  if (!shopeeCodingContext(value)) throw fail();
  const context = value as ShopeeCodingContextView;
  if (context.binding.workspaceId !== workspaceId || context.binding.runId !== runId) throw fail();
  return context;
}

export async function loadShopeeCodingHistory(workspaceId: string, runId: string, signal: AbortSignal): Promise<ShopeeCodingHistory> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/shopee-coding`, { headers: { Accept: 'application/json' }, signal }, [200]);
  if (!shopeeCodingHistory(value)) throw fail();
  return value as ShopeeCodingHistory;
}

export async function loadShopeeCodingView(workspaceId: string, runId: string, packageId: string, signal: AbortSignal): Promise<ShopeeCodingReadView> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/shopee-coding/${encodeURIComponent(packageId)}`, { headers: { Accept: 'application/json' }, signal }, [200]);
  if (!shopeeCodingReadView(value)) throw fail();
  const view = value as ShopeeCodingReadView;
  if (view.draft.binding.workspaceId !== workspaceId || view.draft.binding.runId !== runId) throw fail();
  if (view.draft.status !== 'PROPOSED_AWAITING_REVIEW' || view.report.status !== 'PROPOSED_AWAITING_REVIEW') throw fail();
  return view;
}

export async function proposeShopeeCoding(workspaceId: string, runId: string, body: ShopeeCodingProposeRequest, token: string): Promise<ShopeeCodingReceipt> {
  if (!shopeeCodingPropose(body)) throw new ResearchAutomationError('rejected', 'Yêu cầu đề xuất mã Shopee không đúng contract.');
  if (!token) throw new ResearchAutomationError('authorization', 'Mở khóa OWNER để tạo bản tổng hợp Shopee.');
  const { status, value } = await request(`/owner-api${base(workspaceId, runId)}/sources/shopee-coding/proposals`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }, [200, 201]);
  if (!shopeeCodingReceipt(value)) throw fail();
  const receipt = value as ShopeeCodingReceipt;
  if (receipt.requestKey !== body.requestKey || receipt.exactRetry !== (status === 200)) throw fail('Biên nhận đề xuất Shopee không khớp yêu cầu.');
  return receipt;
}
