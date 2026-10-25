## ADDED Requirements

### Requirement: R-L20 Từ xếp hạng chỉ dùng khi câu ghi đủ thước đo, mẫu và kỳ
Báo cáo MAY dùng «dẫn đầu», «số 1» hoặc «nhiều nhất» chỉ khi câu, hoặc tiêu đề bảng hay biểu đồ, chứa từ đó ghi đủ ba điều: (1) đo bằng gì, ví dụ doanh thu, lượt bán, số lần nhắc; (2) trong mẫu nào: số sản phẩm hoặc số bản ghi, và sàn nào; (3) kỳ nào, kèm ngày. Báo cáo SHALL NOT dùng «số 1 thị trường», «tốt nhất» hoặc «dẫn đầu ngành», kể cả khi câu ghi đủ ba điều.

- Loại kiểm: Máy: cụm cấm và câu xếp hạng thiếu một trong ba điều kiểm bằng máy theo danh sách chữ; nghĩa của câu người đọc soát
- Mã kiểm: Cổng `L20_RANKING_WORD`: `lintVisibleReportText` trong `src/modules/analysis/report-visible-text-lint.ts`, chạy cho cả Market và Insight. Mỗi câu chữ của báo cáo (không tính chữ trích, chữ ẩn) và mỗi tiêu đề bảng hay biểu đồ được xét riêng. Cụm cấm `RANKING_BANNED`: «số 1 thị trường», «tốt nhất», «dẫn đầu ngành», luôn trượt. Từ xếp hạng `RANKING_WORD`: «dẫn đầu», «số 1» (không phải số 1x hay 1,5), «nhiều nhất». Câu có từ xếp hạng đạt khi `rankingComplete` thấy đủ: thước đo `RANKING_MEASURE` (doanh thu, doanh số, lượt bán, đơn vị bán, số đơn, đơn hàng, lượt xem, lượt thích, lượt đánh giá, số đánh giá, nhắc); mẫu `RANKING_SAMPLE` (một số kèm sản phẩm, bản ghi, bình luận, đánh giá, review hoặc dòng) và sàn `RANKING_PLATFORM` (Shopee, TikTok Shop, Lazada, Tiki); kỳ `RANKING_PERIOD` (ít nhất một ngày đủ dd/mm/yyyy). «nhiều nhất» trong câu đạt R-L20 không tính là so sánh nhất của U13_SUPERLATIVE. Tiêu đề bảng 7.4–7.6 của Market: `buildMarketReport` trong `src/modules/analysis/reader-report/market-template.ts`
- Vì sao: Chủ quyết định ngày 24/10/2026. Báo cáo chỉ thấy một mẫu trên một vài sàn trong một kỳ, nên câu xếp hạng phải nói rõ phạm vi để người đọc không hiểu là cả thị trường.

#### Scenario: Câu ghi đủ ba điều
- **WHEN** báo cáo viết "Thương hiệu A dẫn đầu về doanh thu trong 120 sản phẩm Shopee của mẫu, kỳ 20/09–19/10/2026"
- **THEN** quy tắc R-L20 đạt

#### Scenario: Thiếu kỳ
- **WHEN** báo cáo viết "Thương hiệu A dẫn đầu về doanh thu trong 120 sản phẩm Shopee của mẫu" và không ghi kỳ
- **THEN** quy tắc R-L20 bị vi phạm

#### Scenario: Insight nêu chủ đề nhắc nhiều nhất
- **WHEN** báo cáo Insight viết "Giao hàng chậm là chủ đề chê được nhắc nhiều nhất trong 300 bình luận TikTok Shop, kỳ 01/09–30/09/2026"
- **THEN** quy tắc R-L20 đạt

#### Scenario: Tiêu đề bảng ghi đủ
- **WHEN** tiêu đề bảng là "Sản phẩm dẫn đầu theo doanh thu, 200 sản phẩm trong mẫu, Shopee và TikTok Shop, kỳ 20/09–19/10/2026"
- **THEN** quy tắc R-L20 đạt

#### Scenario: Cụm luôn cấm
- **WHEN** báo cáo viết "số 1 thị trường", "tốt nhất" hoặc "dẫn đầu ngành", kể cả khi câu có thước đo, mẫu và kỳ
- **THEN** quy tắc R-L20 bị vi phạm
