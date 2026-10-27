import type { PublicReviewSource } from './public-shopee-bridge.js';
export const PUBLIC_REVIEW_SOURCE_NAME = 'review công khai trên Shopee';
export const PUBLIC_REVIEW_FORBIDDEN_NAMES = ['CloakBrowser','Cloak Browser','cloak-browser','cloak_browser','ShopeePublicReviewCollector','shopee-public-review'] as const;
export function publicReviewReportLines(source: PublicReviewSource): string[] {
  const c = source.acquisition.maxReviewsPerProduct;
  return ['Nguồn: review công khai trên Shopee.',
    `Lượt đọc này lấy tối đa ${c} đánh giá dạng chữ cho mỗi sản phẩm, trong phần trang sản phẩm hiển thị khi bật bộ lọc “có bình luận”. Phạm vi này không phải toàn bộ lịch sử đánh giá.`,
    'Một số đánh giá chỉ có thuộc tính dạng chữ, không có bình luận tự do. Số bình luận đọc được được ghi riêng với số bản ghi đánh giá.',
    'Thời gian đánh giá được giữ theo cách trang sản phẩm hiển thị, theo giờ Việt Nam. Kỳ báo cáo không giới hạn ngày của các đánh giá này.',
    'Số đánh giá không phải số người. Nội dung chưa được mã hóa; chưa có kết luận về tỷ lệ ý kiến hay đặc điểm khách hàng.',
    ...(source.acquisition.sampleMode === 'TRIAL' ? [`Đây là mẫu thử nhỏ, tối đa ${c} đánh giá mỗi sản phẩm, được thu cho báo cáo thử nghiệm. Mẫu này không đại diện cho toàn bộ đánh giá.`] : []),
    ...source.products.map(r => r.records > 0 ? r.readableComments > 0 ? `Đã giữ ${r.records} bản ghi đánh giá, trong đó có ${r.readableComments} bình luận đọc được.` : `Đã giữ ${r.records} bản ghi đánh giá. Chưa có bình luận tự do để đọc.` : 'Chưa thu được đánh giá trong lượt này; không suy ra sản phẩm không có đánh giá.'),
    ...(source.outcome.listings.some(r => r.reviews < c) ? [`Số bản ghi giữ được ít hơn giới hạn ${c} đánh giá của lượt đọc.`] : ['Đã đạt giới hạn của lượt đọc; điều này không có nghĩa đã đọc hết đánh giá.']),
    ...(source.outcome.outcome === 'SHOPEE_LOGIN_REQUIRED' ? ['Lượt đọc không lấy được đánh giá vì bộ thu đánh giá Shopee mất đăng nhập Shopee. Phần dữ liệu đã đọc được giữ lại; lượt này đã dừng.']
      : source.outcome.outcome === 'SHOPEE_VERIFICATION_REQUIRED' ? ['Lượt đọc không lấy được đánh giá vì Shopee yêu cầu xác minh phiên đăng nhập của bộ thu đánh giá Shopee. Phần dữ liệu đã đọc được giữ lại; lượt này đã dừng.']
        : source.outcome.outcome === 'SHOPEE_COLLECTOR_DOWN' ? ['Lượt đọc không lấy được đánh giá vì bộ thu đánh giá Shopee không phản hồi. Phần dữ liệu đã đọc được giữ lại; lượt này đã dừng.']
          : source.humanBlocked ? ['Lượt đọc cần người vận hành xử lý đăng nhập hoặc xác minh. Phần dữ liệu đã đọc được giữ lại; lượt này đã dừng.'] : []),
    ...(source.corpusInlineUnavailableReason ? ['Bộ bản ghi được lưu riêng do giới hạn kích thước; phần này chỉ trình bày số bản ghi và giới hạn của nguồn.'] : []),
    ...(source.corpusUnavailableReason === 'PUBLIC_REVIEW_CORPUS_TOO_LARGE' ? ['Bộ bản ghi vượt giới hạn kích thước của hồ sơ tổng hợp. Bản thu nguồn đã được giữ; phần này chỉ trình bày số bản ghi và giới hạn của nguồn.'] : []),
    'Không cộng gộp giữa các nền tảng hoặc suy rộng thành doanh số toàn quốc.'];
}
export function publicReviewReportHtml(source: PublicReviewSource): string {
  return '<div class="public-review-source"><h3>review công khai trên Shopee</h3>' + publicReviewReportLines(source).map(line => `<p>${line.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}</p>`).join('') + '</div>';
}
