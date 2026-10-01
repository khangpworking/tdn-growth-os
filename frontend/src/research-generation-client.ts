import type {
  ResearchGenerationInputs,
  ResearchGenerationMethodInputError,
  ResearchGenerationReceipt,
  ResearchGenerationRequest,
} from '../../contracts/api/research-generation-api.generated';
import {
  researchGenerationInputs,
  researchGenerationMethodInputError,
  researchGenerationReceipt,
} from './generated/report-validators.generated.js';

export class ResearchGenerationClientError extends Error {
  constructor(readonly kind: 'authorization' | 'selection' | 'source' | 'method' | 'integrity' | 'connection', message: string) { super(message); }
}

export async function loadResearchGenerationInputs(workspaceId: string, token: string, signal: AbortSignal): Promise<ResearchGenerationInputs> {
  const value = await request(`/owner-api/research-generation/inputs?workspaceId=${encodeURIComponent(workspaceId)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal,
  });
  if (!researchGenerationInputs(value) || (value as ResearchGenerationInputs).workspaceId !== workspaceId) {
    throw new ResearchGenerationClientError('integrity', 'Danh sách nguồn không đúng không gian đang xem.');
  }
  const inventory = value as ResearchGenerationInputs;
  if (new Set(inventory.choices.map(choice => choice.selectionId)).size !== inventory.choices.length) {
    throw new ResearchGenerationClientError('integrity', 'Danh sách nguồn có định danh bị trùng.');
  }
  for (const choice of inventory.choices) {
    if (choice.methodInputs === undefined) continue;
    const methodSelectionIds = [
      ...choice.methodInputs.descriptiveMethods,
      ...choice.methodInputs.locatedInsightMethods,
      ...choice.methodInputs.methodPackets,
    ].map(candidate => candidate.methodSelectionId);
    if (new Set(methodSelectionIds).size !== methodSelectionIds.length) {
      throw new ResearchGenerationClientError('integrity', 'Danh sách hồ sơ phương pháp có định danh bị trùng.');
    }
  }
  return inventory;
}

export async function createResearchReport(body: ResearchGenerationRequest, token: string): Promise<ResearchGenerationReceipt> {
  const value = await request('/owner-api/research-generation/reports', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!researchGenerationReceipt(value) || (value as ResearchGenerationReceipt).workspaceId !== body.workspaceId ||
      (value as ResearchGenerationReceipt).requestKey !== body.requestKey) {
    throw new ResearchGenerationClientError('integrity', 'Chưa xác minh được kết quả của yêu cầu vừa gửi.');
  }
  return value as ResearchGenerationReceipt;
}

async function request(url: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try { response = await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', redirect: 'error' }); }
  catch { throw new ResearchGenerationClientError('connection', 'Chưa kết nối được dịch vụ báo cáo.'); }
  let value: unknown;
  try { value = await response.json(); }
  catch {
    if (response.ok) throw new ResearchGenerationClientError('integrity', 'Phản hồi báo cáo không phải dữ liệu hợp lệ.');
    value = null;
  }
  if (response.status === 401 || response.status === 403) throw new ResearchGenerationClientError('authorization', 'Mở khóa OWNER hợp lệ để tiếp tục.');
  if (response.status === 409) throw new ResearchGenerationClientError('selection', 'Nguồn đã chọn hoặc yêu cầu không còn khớp. Tải lại danh sách nguồn trước khi tạo yêu cầu khác.');
  if (response.status === 422 && hasErrorCode(value, 'method_input_rejected')) {
    if (!researchGenerationMethodInputError(value)) throw new ResearchGenerationClientError('integrity', 'Phản hồi báo cáo không phải dữ liệu hợp lệ.');
    const error = value as ResearchGenerationMethodInputError;
    const family = error.error.family === 'descriptiveMethods' ? 'Phương pháp mô tả thị trường'
      : error.error.family === 'locatedInsightMethods' ? 'Phương pháp Insight gắn vị trí bằng chứng'
        : 'Gói kiểm tra điều kiện và tổng hợp';
    throw new ResearchGenerationClientError('method', `Hồ sơ phương pháp không khớp với nguồn. Hệ thống đã dừng và chưa tạo báo cáo. Đặt ${family} về Không dùng hoặc chọn hồ sơ khác trong package, rồi tạo yêu cầu mới.`);
  }
  if (response.status === 400 || response.status === 422) throw new ResearchGenerationClientError('source', 'Nguồn chưa đáp ứng hồ sơ được hỗ trợ. Kiểm tra workbook, kỳ dữ liệu và độ phủ phân loại.');
  if (!response.ok) throw new ResearchGenerationClientError('integrity', 'Bằng chứng lưu trữ chưa vượt qua kiểm tra toàn vẹn.');
  return value;
}

function hasErrorCode(value: unknown, code: string): boolean {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error?: unknown }).error;
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}
