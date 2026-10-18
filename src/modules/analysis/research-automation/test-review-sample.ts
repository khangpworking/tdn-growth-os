import { escapeHtml } from './descriptive-report.js';
import type { ScopeSnapshot, StepResultDocument } from './model.js';

/** Supplied only after the owning service verifies the retained collection and its counts. */
export interface ExactTestReviewContext {
  readonly scope: Pick<ScopeSnapshot, 'testReviewCap'>;
  readonly collection: Pick<StepResultDocument, 'exactShopee' | 'exactShopeeOutcome'> | null;
}
type TestReviewSample = NonNullable<StepResultDocument['exactShopeeOutcome']> & { readonly testReviewCap: number };

/** No coding or population inference; the trial cap must match the confirmed scope. */
export function exactTestReviewSample(input: ExactTestReviewContext): TestReviewSample | null {
  const value = input.collection?.exactShopeeOutcome;
  return value && input.collection?.exactShopee && value.testReviewCap !== undefined && value.testReviewCap === input.scope.testReviewCap
    && Number.isInteger(value.testReviewCap) && value.testReviewCap >= 1 && value.testReviewCap <= 20 ? value as TestReviewSample : null;
}

export const TEST_REVIEW_SOURCE_TYPE = 'Dữ liệu đánh giá sản phẩm và dữ liệu bình luận trên Shopee: cùng mẫu thử nhỏ, chưa mã hóa nội dung';

export function exactTestReviewSourceRows(value: TestReviewSample): { native: string; comments: string } {
  return {
    native: value.listings.some(row => row.reviews > 0)
      ? `Đã thu mẫu thử Shopee, tối đa ${value.testReviewCap} đánh giá mỗi sản phẩm; chưa mã hóa nội dung.`
      : 'Đã thử thu trên Shopee nhưng chưa có đánh giá trả về; không suy ra sản phẩm không có đánh giá.',
    comments: 'Cùng mẫu đánh giá Shopee nêu trên; không phải một tập bình luận khác.',
  };
}

/** Both renderers share the exact prose; the reader adds its usual linked citations. */
export function exactTestReviewSection(value: TestReviewSample,
  link: (url: string, label: string) => string = (url, label) => `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${label}</a>`): string {
  const cap = value.testReviewCap;
  return '<div class="test-review-sample"><h3>Mẫu đánh giá Shopee thu thử</h3>'
    + `<p>Đây là mẫu thử nhỏ, tối đa ${cap} đánh giá mỗi sản phẩm, được thu cho báo cáo thử nghiệm. Mẫu này không đại diện cho toàn bộ đánh giá.</p>`
    + `<ul>${value.listings.map((row, index) => `<li>${link(row.listingUrl, `Sản phẩm #${index + 1}`)}: ${row.reviews === 0
      ? `Chưa thu được đánh giá; chưa đạt giới hạn thử ${cap} đánh giá.` : row.reviews < cap
        ? `Chỉ thu được ${row.reviews} đánh giá, ít hơn giới hạn thử ${cap} đánh giá.`
        : `Đã thu đủ giới hạn thử ${cap} đánh giá.`}</li>`).join('')}</ul>`
    + '<p>Đủ giới hạn thử không có nghĩa đã thu hết đánh giá của sản phẩm. Chưa mã hóa nội dung; không suy ra tỷ lệ ý kiến hay đặc điểm khách hàng. Ngày đánh giá có thể nằm ngoài kỳ báo cáo.</p>'
    + '<p>Đây chỉ là đánh giá Shopee; không cộng với TikTok Shop, số liệu bán hàng hoặc số liệu cả nước. Số đánh giá không phải số người.</p></div>';
}
