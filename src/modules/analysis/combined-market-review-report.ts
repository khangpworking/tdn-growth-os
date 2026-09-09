import type Database from 'better-sqlite3';
import type { MarketSnapshotResult } from '../../../contracts/analysis/market-snapshot-result.generated.js';
import type { MarketSnapshotResultReader } from './result-reader.js';
import type { ShopeeReviewResultReader, VerifiedShopeeReviewResult } from './shopee-review-result-reader.js';
import { renderVietnameseShopeeEvidenceReport } from './shopee-evidence-report.js';

const MARKET_CALCULATION_KEY = 'market_snapshot_v1';
const MARKET_CALCULATION_VERSION = 1n;

interface MarketResultRow {
  readonly resultId: string;
  readonly calculationKey: string;
  readonly calculationVersion: bigint;
}

export interface CombinedMarketReviewReportInput {
  readonly marketResult: MarketSnapshotResult;
  readonly marketResultSha256: string;
  readonly reviewResult: VerifiedShopeeReviewResult;
}

export class CombinedMarketReviewReportReader {
  constructor(readonly options: {
    readonly db: Database.Database;
    readonly marketResultReader: MarketSnapshotResultReader;
    readonly reviewResultReader: ShopeeReviewResultReader;
  }) {}

  async read(marketResultSha256: string, reviewResultSha256: string): Promise<CombinedMarketReviewReportInput> {
    assertDigest(marketResultSha256, 'Market Result');
    const rows = this.options.db.prepare(
      `SELECT result_id AS resultId, calculation_key AS calculationKey,
              calculation_version AS calculationVersion
         FROM analysis_results WHERE result_artifact_sha256 = ?`,
    ).all(marketResultSha256) as MarketResultRow[];
    if (rows.length === 0) throw new Error(`Market snapshot Result not found for digest: ${marketResultSha256}`);
    if (rows.length !== 1) throw new Error(`Market snapshot Result digest is ambiguous: ${marketResultSha256}`);
    const row = rows[0]!;
    if (row.calculationKey !== MARKET_CALCULATION_KEY || row.calculationVersion !== MARKET_CALCULATION_VERSION) {
      throw new Error(`Unsupported market analysis Result: ${row.calculationKey}@${row.calculationVersion}`);
    }

    const market = await this.options.marketResultReader.readVerifiedResult(row.resultId);
    if (market.resultArtifactSha256 !== marketResultSha256) {
      throw new Error('Verified market Result digest does not match the selected digest');
    }
    return {
      marketResult: market.result,
      marketResultSha256,
      reviewResult: await this.options.reviewResultReader.readByDigest(reviewResultSha256),
    };
  }
}

export function renderCombinedMarketReviewReport(input: CombinedMarketReviewReportInput): string {
  const market = input.marketResult;
  const review = input.reviewResult;
  const reviewReport = renderVietnameseShopeeEvidenceReport(review);
  const missingRevenueProducts = market.coverage.uniqueProductCount - market.coverage.periodRevenueObservedProductCount;
  const missingUnitsProducts = market.coverage.uniqueProductCount - market.coverage.periodUnitsSoldObservedProductCount;
  const collectionIsPartial = review.result.summary.listings.some(({ status }) =>
    status === 'partial' || status === 'failed' || status === 'unavailable' || status === 'below_limit' || status === 'empty');

  return `# Báo cáo bằng chứng thị trường và review Shopee\n\n` +
    `> Báo cáo offline này ghép hai Result đã tồn tại, không chạy lại phân tích, collection hay filter. Hai phần được giữ riêng vì không có shared identity đã xác minh giữa sản phẩm thị trường và listing review. Không suy diễn kết luận chung về thị trường.\n\n` +
    `## 1. Tổng quan nguồn\n\n` +
    `- **Market Result SHA-256:** \`${input.marketResultSha256}\`\n` +
    `- **Review Result SHA-256:** \`${review.resultSha256}\`\n` +
    `- **Market Data Pack:** ${code(market.dataPack.packKey)} phiên bản ${market.dataPack.version}; manifest ${code(market.dataPack.manifestArtifactSha256)}.\n` +
    `- **Phạm vi market:** ${code(market.period.scope)}; ${code(market.period.start)} đến ${code(market.period.end)} (${code(market.period.grain)}).\n` +
    `- **Phạm vi review:** ${review.result.summary.selectedProducts} listing được chọn, mode ${code(review.result.summary.mode)}.\n` +
    `- **Kỳ yêu cầu collection review:** ${code(review.collection.request.period.start)} đến ${code(review.collection.request.period.end)}; nguồn được lấy lúc ${code(review.collection.request.source.acquiredAt)}.\n` +
    `- **Giới hạn quan trọng:** Kỳ market không giới hạn ngày đăng review. Review không được coi là bao phủ toàn bộ tập số liệu thị trường.\n\n` +
    `## 2. Market snapshot\n\n` +
    `- Tổng doanh thu kỳ (VND): **${metric(market.totals.periodRevenueVndTotal)}**\n` +
    `- Tổng đơn vị bán kỳ: **${metric(market.totals.periodUnitsSoldTotal)}**\n` +
    `- Coverage: ${market.coverage.selectedObservationCount} observation, ${market.coverage.uniqueProductCount} sản phẩm duy nhất.\n` +
    `- Thiếu metric theo sản phẩm: doanh thu ${missingRevenueProducts}; đơn vị bán ${missingUnitsProducts}. “không có dữ liệu” khác với giá trị 0.\n` +
    `- Result market chỉ lưu aggregate và coverage; báo cáo không dựng lại dòng metric theo sản phẩm.\n\n` +
    `## 3. Bằng chứng review\n\n${sectionAfterOverview(reviewReport)}\n\n` +
    `## 4. Khoảng trống dữ liệu và khác biệt phạm vi\n\n` +
    `- Bộ sưu tập review ${collectionIsPartial ? 'có listing không đạt sample limit hoặc có trạng thái thiếu/không khả dụng' : 'đạt sample limit cho mọi listing được chọn'}; số review giữ lại không mặc nhiên đại diện cho toàn bộ review của listing.\n` +
    `- Phạm vi market và review khác nhau và chưa được xác minh là cùng sản phẩm; không nối theo tên tương tự.\n` +
    `- Không tổng hợp filter score thành sentiment, confidence, nhu cầu hay cơ hội thị trường.\n` +
    `- Báo cáo không tạo ra kết luận tổng thể về thị trường.\n`;
}

function assertDigest(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid ${label} SHA-256 digest`);
}
function sectionAfterOverview(report: string): string {
  const marker = '## Phạm vi được yêu cầu và thực tế';
  const index = report.indexOf(marker);
  return index === -1 ? report : report.slice(index);
}
function metric(value: string | null): string { return value === null ? 'không có dữ liệu' : value; }
function code(value: string): string {
  const escaped = escapeHtmlAndLines(value);
  const longest = Math.max(0, ...([...escaped.matchAll(/`+/g)].map(match => match[0].length)));
  const fence = '`'.repeat(longest + 1);
  const padding = escaped.startsWith('`') || escaped.endsWith('`') || escaped.startsWith(' ') || escaped.endsWith(' ') ? ' ' : '';
  return `${fence}${padding}${escaped}${padding}${fence}`;
}

function escapeHtmlAndLines(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('\r', '&#13;').replaceAll('\n', '&#10;');
}
