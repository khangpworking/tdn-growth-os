import type {
  TikTokCodingContextView, TikTokCodingHistory, TikTokCodingProposeRequest, TikTokCodingReadView,
  TikTokCodingReceipt, TikTokCodedReport, TikTokDraftCoding,
} from '../../../contracts/analysis/tiktok-coding-proposal-v1.generated';
import type { TikTokCommentReadView, TikTokCommentSourceHistory, TikTokSourcePackageIdentity } from '../../../contracts/analysis/tiktok-comment-collection-v1.generated';
import type { ResearchAutomationTikTokReaderBuildRequest, ResearchAutomationReaderBuildReceiptV2 } from '../../../contracts/api/research-automation-reader-report-api.generated';
import {
  tiktokCodingContext, tiktokCodingHistory, tiktokCodingPropose, tiktokCodingReadView, tiktokCodingReceipt, tiktokCommentsHistory, tiktokCommentsReadView,
  tiktokReaderBuild, readerReportBuildReceiptV2,
} from '../generated/report-validators.generated.js';
import { ResearchAutomationError } from './api';
import { canonical } from './insight-coding-ui';

export type { TikTokCodingContextView, TikTokCodingHistory, TikTokCodingProposeRequest, TikTokCodingReadView, TikTokCodingReceipt, TikTokCodedReport, TikTokDraftCoding };
export type { TikTokCommentReadView, TikTokCommentSourceHistory, TikTokSourcePackageIdentity };
export type { ResearchAutomationTikTokReaderBuildRequest, ResearchAutomationReaderBuildReceiptV2 };

export const TIKTOK_REVISION_BUILDER = 'reader-report-insight-tiktok-v1';
const digestPattern = /^[0-9a-f]{64}$/;
const base = (workspaceId: string, runId: string) => `/workspaces/${encodeURIComponent(workspaceId)}/research-automation/runs/${encodeURIComponent(runId)}`;
const fail = () => new ResearchAutomationError('integrity', 'Dữ liệu TikTok không khớp contract hoặc nguồn đã chọn.');

async function request(url: string, init: RequestInit, statuses: readonly number[]): Promise<{ status: number; value: unknown }> {
  let response: Response;
  try { response = await fetch(url, { cache: 'no-store', ...init }); }
  catch { throw new ResearchAutomationError('connection', 'Chưa kết nối được máy chủ TikTok.'); }
  let value: unknown;
  try { value = await response.json(); } catch { throw fail(); }
  if (!statuses.includes(response.status)) {
    throw new ResearchAutomationError(
      response.status === 401 || response.status === 403 ? 'authorization' : response.status === 409 ? 'conflict' : response.status === 400 ? 'rejected' : response.status === 404 ? 'notFound' : 'connection',
      'Máy chủ chưa chấp nhận yêu cầu TikTok; kiểm tra nguồn, đề xuất và quyền OWNER.',
    );
  }
  return { status: response.status, value };
}

const sha256Hex = async (value: unknown): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

export async function loadTikTokCommentSources(workspaceId: string, runId: string, signal: AbortSignal): Promise<TikTokCommentSourceHistory> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/tiktok-comments`, { headers: { Accept: 'application/json' }, signal }, [200]);
  if (!tiktokCommentsHistory(value)) throw fail();
  const history = value as TikTokCommentSourceHistory;
  if (history.workspaceId !== workspaceId || history.runId !== runId) throw fail();
  return history;
}

export async function loadTikTokCommentSource(workspaceId: string, runId: string, packageId: string, signal: AbortSignal): Promise<TikTokCommentReadView> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/tiktok-comments/${encodeURIComponent(packageId)}`, { headers: { Accept: 'application/json' }, signal }, [200]);
  if (!tiktokCommentsReadView(value)) throw fail();
  return value as TikTokCommentReadView;
}

export async function loadTikTokCodingContext(workspaceId: string, runId: string, packageId: string, signal: AbortSignal): Promise<TikTokCodingContextView> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/tiktok-coding/context/${encodeURIComponent(packageId)}`, { headers: { Accept: 'application/json' }, signal }, [200]);
  if (!tiktokCodingContext(value)) throw fail();
  const context = value as TikTokCodingContextView;
  if (context.binding.workspaceId !== workspaceId || context.binding.runId !== runId || context.corpus.packageId !== packageId) throw fail();
  if (!digestPattern.test(context.keywordDigest)) throw fail();
  return context;
}

export async function loadTikTokCodingHistory(workspaceId: string, runId: string, signal: AbortSignal): Promise<TikTokCodingHistory> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/tiktok-coding`, { headers: { Accept: 'application/json' }, signal }, [200]);
  if (!tiktokCodingHistory(value)) throw fail();
  return value as TikTokCodingHistory;
}

async function verifyTikTokCodingReadView(view: TikTokCodingReadView, workspaceId: string, runId: string): Promise<void> {
  const { draft, report } = view;
  if (draft.binding.workspaceId !== workspaceId || draft.binding.runId !== runId) throw fail();
  if (report.proposalId !== draft.proposalId || report.draftSha256 !== await sha256Hex(draft)) throw fail();
  if (draft.status !== 'PROPOSED_AWAITING_REVIEW' || report.status !== 'PROPOSED_AWAITING_REVIEW') throw fail();
  if (!sameTikTokIdentity(report.corpus, draft.corpus) || report.keywordDigest !== draft.keywordDigest || !sameTikTokIdentity(report.counts, draft.counts)) throw fail();
}

export async function loadTikTokCodingView(workspaceId: string, runId: string, packageId: string, signal: AbortSignal): Promise<TikTokCodingReadView> {
  const { value } = await request(`/api${base(workspaceId, runId)}/sources/tiktok-coding/${encodeURIComponent(packageId)}`, { headers: { Accept: 'application/json' }, signal }, [200]);
  if (!tiktokCodingReadView(value)) throw fail();
  const view = value as TikTokCodingReadView;
  await verifyTikTokCodingReadView(view, workspaceId, runId);
  return view;
}

export async function proposeTikTokCoding(workspaceId: string, runId: string, body: TikTokCodingProposeRequest, token: string): Promise<TikTokCodingReceipt> {
  if (!tiktokCodingPropose(body)) throw new ResearchAutomationError('rejected', 'Yêu cầu đề xuất mã TikTok không đúng contract.');
  if (!token) throw new ResearchAutomationError('authorization', 'Mở khóa OWNER để tạo đề xuất mã TikTok.');
  const { status, value } = await request(`/owner-api${base(workspaceId, runId)}/sources/tiktok-coding/proposals`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }, [200, 201]);
  if (!tiktokCodingReceipt(value)) throw fail();
  const receipt = value as TikTokCodingReceipt;
  if (receipt.requestKey !== body.requestKey || receipt.exactRetry !== (status === 200)) throw fail();
  return receipt;
}

export async function buildTikTokReader(workspaceId: string, runId: string, body: ResearchAutomationTikTokReaderBuildRequest, token: string): Promise<ResearchAutomationReaderBuildReceiptV2> {
  if (!tiktokReaderBuild(body)) throw new ResearchAutomationError('rejected', 'Yêu cầu dựng bản đọc TikTok không đúng contract.');
  if (!token) throw new ResearchAutomationError('authorization', 'Mở khóa OWNER để dựng bản đọc TikTok.');
  const { status, value } = await request(`/owner-api${base(workspaceId, runId)}/reader-reports/tiktok`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }, [200, 201]);
  if (!readerReportBuildReceiptV2(value)) throw fail();
  const receipt = value as ResearchAutomationReaderBuildReceiptV2;
  const revision = receipt.revision;
  if (receipt.exactRetry !== (status === 200) || revision.reportKind !== 'INSIGHT' || revision.builderVersion !== TIKTOK_REVISION_BUILDER ||
      revision.workspaceId !== workspaceId || revision.runId !== runId || revision.draftPairId !== body.draftPairId ||
      revision.semanticSha256 !== body.semanticSha256 || revision.sourceReportSha256 !== body.semanticSha256) throw fail();
  return receipt;
}

export async function digestTikTokDraft(draft: TikTokDraftCoding): Promise<string> {
  return sha256Hex(draft);
}

export async function digestTikTokReport(report: TikTokCodedReport): Promise<string> {
  return sha256Hex(report);
}

export function sameTikTokIdentity(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}
