import type {
  ShopeeCodingContextView, ShopeeCodingHistory, ShopeeCodingProposeRequest, ShopeeCodingReadView,
  ShopeeCodingReceipt, ShopeeConsumptionView,
} from '../../../contracts/analysis/shopee-review-coding-v1.generated';
import { ResearchAutomationError } from './api';

export type { ShopeeCodingContextView, ShopeeCodingHistory, ShopeeCodingProposeRequest, ShopeeCodingReadView, ShopeeCodingReceipt, ShopeeConsumptionView };

const base = (workspaceId: string, runId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/research-automation/runs/${encodeURIComponent(runId)}`;

async function request(url: string, init: RequestInit, statuses: readonly number[]): Promise<{ status: number; value: unknown }> {
  let response: Response;
  try { response = await fetch(url, { cache: 'no-store', ...init }); }
  catch { throw new ResearchAutomationError('connection', 'Chưa kết nối được máy chủ Shopee.'); }
  let value: unknown;
  try { value = await response.json(); } catch { throw new ResearchAutomationError('integrity', 'Dữ liệu Shopee không đúng định dạng.'); }
  if (!statuses.includes(response.status)) {
    throw new ResearchAutomationError(
      response.status === 401 || response.status === 403 ? 'authorization' : response.status === 409 ? 'conflict' : response.status === 400 ? 'rejected' : response.status === 404 ? 'notFound' : 'connection',
      'Máy chủ chưa chấp nhận yêu cầu Shopee; kiểm tra mẫu, đề xuất và quyền OWNER.',
    );
  }
  return { status: response.status, value };
}

export async function loadShopeeCodingContext(workspaceId: string, runId: string, sampleId: string, signal: AbortSignal): Promise<ShopeeCodingContextView> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/shopee-coding/context/${encodeURIComponent(sampleId)}`, { headers: { Accept: 'application/json' }, signal }, [200]);
  const view = value as ShopeeCodingContextView;
  if (view?.contractVersion !== 'shopee-coding-context-v1' || view.binding?.workspaceId !== workspaceId || view.binding?.runId !== runId || view.sample?.sampleId !== sampleId) {
    throw new ResearchAutomationError('integrity', 'Bối cảnh mẫu Shopee không khớp mẫu đã chọn.');
  }
  return view;
}

export async function loadShopeeCodingHistory(workspaceId: string, runId: string, signal: AbortSignal): Promise<ShopeeCodingHistory> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/shopee-coding`, { headers: { Accept: 'application/json' }, signal }, [200]);
  const history = value as ShopeeCodingHistory;
  if (history?.contractVersion !== 'shopee-coding-history-v1') throw new ResearchAutomationError('integrity', 'Lịch sử mã Shopee không đúng định dạng.');
  return history;
}

export async function loadShopeeCodingView(workspaceId: string, runId: string, packageId: string, signal: AbortSignal): Promise<ShopeeCodingReadView> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/shopee-coding/${encodeURIComponent(packageId)}`, { headers: { Accept: 'application/json' }, signal }, [200]);
  const view = value as ShopeeCodingReadView;
  if (view?.contractVersion !== 'shopee-coding-read-v1' || view.draft?.binding?.workspaceId !== workspaceId || view.draft?.binding?.runId !== runId) {
    throw new ResearchAutomationError('integrity', 'Báo cáo mã Shopee không khớp phạm vi đã chọn.');
  }
  if (view.draft.status !== 'PROPOSED_AWAITING_REVIEW' || view.report.status !== 'PROPOSED_AWAITING_REVIEW') {
    throw new ResearchAutomationError('integrity', 'Báo cáo mã Shopee không ở trạng thái chờ duyệt.');
  }
  return view;
}

export async function proposeShopeeCoding(workspaceId: string, runId: string, body: ShopeeCodingProposeRequest, token: string): Promise<ShopeeCodingReceipt> {
  if (!token) throw new ResearchAutomationError('authorization', 'Mở khóa OWNER để tạo đề xuất mã Shopee.');
  const { status, value } = await request(`/owner-api${base(workspaceId, runId)}/sources/shopee-coding/proposals`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }, [200, 201]);
  const receipt = value as ShopeeCodingReceipt;
  if (receipt?.contractVersion !== 'shopee-coding-receipt-v1' || receipt.requestKey !== body.requestKey || receipt.exactRetry !== (status === 200)) {
    throw new ResearchAutomationError('integrity', 'Biên nhận đề xuất Shopee không khớp yêu cầu.');
  }
  return receipt;
}

export async function loadShopeeConsumption(workspaceId: string, runId: string, signal: AbortSignal): Promise<ShopeeConsumptionView> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/shopee-coding/consumption`, { headers: { Accept: 'application/json' }, signal }, [200]);
  const view = value as ShopeeConsumptionView;
  if (view?.contractVersion !== 'shopee-consumption-view-v1') throw new ResearchAutomationError('integrity', 'Nhật ký dựng bản đọc Shopee không đúng định dạng.');
  return view;
}
