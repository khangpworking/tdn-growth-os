# Từ xếp hạng chỉ dùng khi câu ghi đủ thước đo, mẫu và kỳ

> Trạng thái: **đề xuất**, theo quyết định của chủ ngày 24/10/2026. Chưa đổi mã. Chưa đổi business-spec.

## Why

Báo cáo cần nói "ai đứng đầu" để người đọc hành động. Nhưng câu như «số 1 thị trường» làm người đọc hiểu sai: báo cáo chỉ thấy một mẫu, trên một vài sàn, trong một kỳ. Mã hiện nay không có luật chung: bản đọc Market đã dùng «dẫn đầu», «cao nhất» ở nhiều chỗ, còn một số kiểm thử lại cấm chữ «nhất».

Câu của chủ (24/10/2026): «Cho dùng «dẫn đầu», «số 1», «nhiều nhất» khi câu ghi đủ: đo bằng gì, trong mẫu nào (số sản phẩm hoặc bản ghi, sàn nào), kỳ nào. Cấm «số 1 thị trường», «tốt nhất», «dẫn đầu ngành». Làm thành một thay đổi riêng.»

## What Changes

- **ADDED** R-L20 (cả Market và Insight): «dẫn đầu», «số 1», «nhiều nhất» được dùng khi câu hoặc tiêu đề bảng chứa từ đó ghi đủ ba điều: đo bằng gì; trong mẫu nào (số sản phẩm hoặc số bản ghi, sàn nào); kỳ nào, kèm ngày. «số 1 thị trường», «tốt nhất», «dẫn đầu ngành» luôn bị cấm.

## Impact

- Mã: kiểm chữ nhìn thấy `src/modules/analysis/report-visible-text-lint.ts` (thêm cụm cấm, thêm kiểm câu xếp hạng thiếu thước đo, mẫu hoặc kỳ); câu và tiêu đề bảng có sẵn trong `src/modules/analysis/reader-report/market-template.ts` (ví dụ «bảng sản phẩm dẫn đầu», «Thương hiệu dẫn đầu trên trang», «nhóm lớn nhất»); bản đọc Insight nơi nêu chủ đề được nhắc nhiều nhất.
- Kiểm thử: các kiểm thử đang cấm chữ «nhất» hoặc «hàng đầu» (ví dụ `tests/unit/market-actions.test.ts`, `tests/unit/market-capture-reader.test.ts`) phải đổi theo luật mới; fixture vàng của bản đọc có thể đổi băm.
- Tài liệu: khi chủ duyệt, `docs/business-spec/business-rules/report-language.md` đổi cùng PR (xem `openspec/MIGRATION.md`).
- Không đổi nguồn, không gọi nguồn trả phí, không đổi cờ môi trường.

## Ngoài phạm vi

- R-M17 (cổng `E2_NO_REVENUE_ORDER`: «Thứ tự theo doanh thu», «top 3», «xếp hạng», «thị phần») giữ nguyên. Chủ chưa nói về các chữ này.
- Các chữ so sánh khác như «cao nhất», «lớn nhất»: chưa thuộc luật này. Nếu cần, chủ quyết định sau.
- Triển khai lên máy chạy thật: cần câu «deploy <SHA>» riêng của chủ.
