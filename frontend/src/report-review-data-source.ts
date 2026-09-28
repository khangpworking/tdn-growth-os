import type { ReportReviewTarget } from '../../contracts/api/report-api.generated';
import type {
  OwnerReportReviewTargetReceipt,
  ReportReviewTargetCreateRequest,
} from '../../contracts/api/owner-report-review-target-api.generated';
import {
  isOwnerReportReviewTargetReceipt,
  isReportReviewTarget,
} from './report-contract-validation';

export type ReportReviewTargetFailure = 'connection' | 'unauthorized' | 'forbidden' | 'not_found' | 'invalid' | 'integrity';

export class ReportReviewTargetDataError extends Error {
  constructor(readonly kind: ReportReviewTargetFailure, message: string) { super(message); }
}

const DIGEST = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createReportReviewTarget(
  input: Omit<ReportReviewTargetCreateRequest, 'contractVersion'> & { readonly token: string },
  fetcher: typeof fetch = fetch,
): Promise<OwnerReportReviewTargetReceipt> {
  assertCreateInput(input);
  let response: Response;
  const body: ReportReviewTargetCreateRequest = {
    contractVersion: '1.0.0',
    reportId: input.reportId,
    reportVersion: input.reportVersion,
    interpretationId: input.interpretationId,
    intendedUse: input.intendedUse,
  };
  try {
    response = await fetcher('/owner-api/report-review-targets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ReportReviewTargetDataError('connection', 'Không thể kết nối OWNER API cục bộ.');
  }
  if (!response.ok) throw responseError(response.status, 'Không thể chuẩn bị gói review.');
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new ReportReviewTargetDataError('integrity', 'Biên nhận gói review không phải JSON hợp lệ.'); }
  if (!isOwnerReportReviewTargetReceipt(value) || value.reportId !== input.reportId || value.reportVersion !== input.reportVersion || value.interpretationId !== input.interpretationId || value.intendedUse !== input.intendedUse) {
    throw new ReportReviewTargetDataError('integrity', 'Biên nhận gói review không khớp lựa chọn đã gửi.');
  }
  return value;
}

export async function loadReportReviewTarget(reviewTargetId: string, fetcher: typeof fetch = fetch): Promise<ReportReviewTarget> {
  if (!DIGEST.test(reviewTargetId)) throw new ReportReviewTargetDataError('invalid', 'Review target ID không hợp lệ.');
  let response: Response;
  try { response = await fetcher(`/api/report-review-targets/${reviewTargetId}`, { headers: { Accept: 'application/json' } }); }
  catch { throw new ReportReviewTargetDataError('connection', 'Không thể kết nối API gói review.'); }
  if (!response.ok) throw responseError(response.status, 'Không thể đọc gói review.');
  let value: unknown;
  try { value = await response.json(); }
  catch { throw new ReportReviewTargetDataError('integrity', 'Gói review không phải JSON hợp lệ.'); }
  if (!isReportReviewTarget(value) || value.reviewTargetId !== reviewTargetId) {
    throw new ReportReviewTargetDataError('integrity', 'Gói review không vượt qua kiểm tra contract hoặc sai định danh.');
  }
  return value;
}

function assertCreateInput(input: Omit<ReportReviewTargetCreateRequest, 'contractVersion'> & { readonly token: string }): void {
  if (!UUID.test(input.reportId) || !Number.isSafeInteger(input.reportVersion) || input.reportVersion < 1 || input.reportVersion > 10_000 || !UUID.test(input.interpretationId) || input.intendedUse.length < 1 || input.intendedUse.length > 300 || input.intendedUse.trim() !== input.intendedUse || input.token.length < 32) {
    throw new ReportReviewTargetDataError('invalid', 'Thông tin chuẩn bị gói review chưa hợp lệ.');
  }
}

function responseError(status: number, fallback: string): ReportReviewTargetDataError {
  if (status === 401) return new ReportReviewTargetDataError('unauthorized', 'Token OWNER không hợp lệ hoặc đã hết hiệu lực.');
  if (status === 403) return new ReportReviewTargetDataError('forbidden', 'Runtime không cho phép thao tác OWNER từ origin này.');
  if (status === 404) return new ReportReviewTargetDataError('not_found', 'Không tìm thấy đúng report, interpretation hoặc gói review đã chọn.');
  if (status >= 500) return new ReportReviewTargetDataError('integrity', 'Dữ liệu lưu không vượt qua kiểm tra toàn vẹn.');
  return new ReportReviewTargetDataError('invalid', fallback);
}
