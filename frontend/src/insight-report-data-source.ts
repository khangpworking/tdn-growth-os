import type { ContentInsightReport, ContentInsightReportsResponse, ContentInsightReportStatementsResponse } from '../../contracts/api/content-insight-reports-api.generated';
import type { ContentInsightFromReportRequest } from '../../contracts/flow/content-insight-from-report-request.generated';
import type { ContentCampaignContent } from '../../contracts/flow/content-campaign-create-request.generated';
import type { OwnerContentCampaignReceipt } from '../../contracts/api/owner-content-campaign-api.generated';
import type { OwnerContentInsightRevisionReceipt } from '../../contracts/api/owner-content-insight-api.generated';
import { insightReportList, insightReportStatements } from './generated/report-validators.generated.js';
import { readJson, invalid, record, exactKeys, dateTime, uuid } from './content-data-source';
import { ownerJson } from './insight-data-source';
export type ReportSelection = { readonly revisionId: string; readonly statementId: string };
export const EMPTY_REPORTS = 'Chưa có báo cáo nào có câu insight';
export function reportLabel(report: ContentInsightReport): string {
  const period = report.period;
  const date = (value: string, year: boolean) => `${value.slice(8, 10)}/${value.slice(5, 7)}${year ? `/${value.slice(2, 4)}` : ''}`;
  return `${report.keyword} · ${period ? `${date(period.startDate, period.startDate.slice(0, 4) !== period.endDate.slice(0, 4))}–${date(period.endDate, true)}` : 'Chưa có kỳ dữ liệu'} · bản ${report.revisionNumber}`;
}
export async function loadInsightReports(fetcher: typeof fetch = fetch): Promise<ContentInsightReportsResponse> {
  const value = await readJson('/api/content/insight-reports', fetcher);
  if (!insightReportList(value)) invalid();
  return value as ContentInsightReportsResponse;
}
export async function loadReportStatements(revisionId: string, fetcher: typeof fetch = fetch): Promise<ContentInsightReportStatementsResponse> {
  const value = await readJson(`/api/content/insight-reports/${encodeURIComponent(revisionId)}/statements`, fetcher);
  if (!insightReportStatements(value) || (value as ContentInsightReportStatementsResponse).report.revisionId !== revisionId) invalid();
  return value as ContentInsightReportStatementsResponse;
}
function receipt(value: unknown, campaignId: string, version: number): OwnerContentInsightRevisionReceipt {
  if (!record(value) || !exactKeys(value, ['contractVersion', 'campaignId', 'version', 'createdAt', 'exactRetry']) || value.contractVersion !== '1.0.0' || value.campaignId !== campaignId || value.version !== version || !dateTime(value.createdAt) || typeof value.exactRetry !== 'boolean') invalid();
  return value as unknown as OwnerContentInsightRevisionReceipt;
}
export async function sendReport(campaignId: string, input: ContentInsightFromReportRequest, token: string, fetcher: typeof fetch = fetch) {
  return receipt(await ownerJson(`/owner-api/content/campaigns/${encodeURIComponent(campaignId)}/insight/from-report`, token, input, fetcher, 'Insight đã thay đổi, đã chốt hoặc chiến dịch đã bị xóa. Hãy tải lại.'), campaignId, input.expectedVersion + 1);
}
export async function createCampaignFromReport(input: { campaignKey: string; brandId: string; campaign: ContentCampaignContent; token: string; selection: ReportSelection }, fetcher: typeof fetch = fetch): Promise<OwnerContentCampaignReceipt> {
  const value = await ownerJson('/owner-api/content/campaigns/from-insight-report', input.token,
    { contractVersion: '1.0.0', campaignKey: input.campaignKey, brandId: input.brandId, campaign: input.campaign, ...input.selection }, fetcher, 'Yêu cầu tạo chiến dịch đã thay đổi. Hãy kiểm tra và thử lại.');
  if (!record(value) || !exactKeys(value, ['contractVersion', 'campaignId', 'campaignKey', 'brandId', 'version', 'name', 'createdAt', 'exactRetry', 'insight']) || value.contractVersion !== '1.0.0' || !uuid(value.campaignId) || value.campaignKey !== input.campaignKey || value.brandId !== input.brandId || value.version !== 1 || value.name !== input.campaign.name || !dateTime(value.createdAt) || typeof value.exactRetry !== 'boolean') invalid();
  receipt(value.insight, value.campaignId as string, 1);
  return value as unknown as OwnerContentCampaignReceipt;
}
