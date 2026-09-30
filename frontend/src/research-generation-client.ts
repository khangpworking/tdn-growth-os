import type { ResearchGenerationInputs, ResearchGenerationReceipt, ResearchGenerationRequest } from '../../contracts/api/research-generation-api.generated';
import { researchGenerationInputs, researchGenerationReceipt } from './generated/report-validators.generated.js';

export class ResearchGenerationClientError extends Error {
  constructor(readonly kind: 'authorization' | 'selection' | 'source' | 'integrity' | 'connection', message: string) { super(message); }
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
  if (response.status === 401 || response.status === 403) throw new ResearchGenerationClientError('authorization', 'Mở khóa OWNER hợp lệ để tiếp tục.');
  if (response.status === 409) throw new ResearchGenerationClientError('selection', 'Nguồn đã chọn hoặc yêu cầu không còn khớp. Tải lại danh sách nguồn trước khi tạo yêu cầu khác.');
  if (response.status === 400 || response.status === 422) throw new ResearchGenerationClientError('source', 'Nguồn chưa đáp ứng hồ sơ được hỗ trợ. Kiểm tra workbook, kỳ dữ liệu và độ phủ phân loại.');
  if (!response.ok) throw new ResearchGenerationClientError('integrity', 'Bằng chứng lưu trữ chưa vượt qua kiểm tra toàn vẹn.');
  try { return await response.json(); }
  catch { throw new ResearchGenerationClientError('integrity', 'Phản hồi báo cáo không phải dữ liệu hợp lệ.'); }
}
