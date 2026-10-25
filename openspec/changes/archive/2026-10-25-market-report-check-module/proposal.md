# Một chỗ kiểm báo cáo Market cho bản nháp

> Trạng thái: **đề xuất**, theo đánh giá kiến trúc c2, chủ duyệt ngày 24/10/2026. Không đổi kết quả kiểm.

## Why

Hôm nay mỗi nơi dựng bản nháp Market tự chọn kiểm nào chạy và theo thứ tự nào: kiểm chữ nhìn thấy, cổng Market, 14 quy tắc, kiểm tên khi có review công khai. Cổng Market chạy tới ba lần trên cùng một trang. Người sửa một nơi dễ quên nơi kia.

Câu của chủ (24/10/2026): duyệt đánh giá kiến trúc c2; PR này không đổi kết quả kiểm nào.

## What Changes

- Thêm một chỗ kiểm: `src/modules/analysis/research-automation/market-report-check.ts`, hàm `checkMarketReport` (trả danh sách kết quả và lỗi đầu tiên) và `assertMarketReport` (ném đúng thông báo lỗi như hôm nay).
- Bản nháp (`reports.ts`) và lần lưu (`service.ts`) gọi chỗ kiểm này. Cổng Market chạy một lần trong bản nháp trình bày; 14 quy tắc đọc lại kết quả đó.
- Giữ nguyên: mã quy tắc, thứ tự, tiền tố lỗi (`MARKET_VISIBLE_TEXT_LINT_FAILED`, `MARKET_BUSINESS_GATE_FAILED`, `MARKET_14_RULES_FAILED`, `PUBLIC_REVIEW_READER_NAME_REFUSED`), HTML. Cổng ở `service.ts` vẫn chạy cho mọi lần chạy Market.
- Không đổi quy tắc nào (R-M15 đến R-M26, R-M01 đến R-M14 giữ nguyên). Chỉ đổi dòng mã của R-P07 và R-P08.

## Impact

- Mã: RA `market-report-check.ts` (mới), `reports.ts`, `service.ts`, `market-14-rules.ts` (`auditMarket14` nhận kết quả cổng đã tính; không có thì tự tính như cũ), `meta-ad-report.ts` (`marketSnippetPasses`).
- Kiểm thử: các kiểm thử hiện có không đổi; bảng chụp kết quả trên báo cáo thật đã giữ không đổi.
- Không đổi nguồn, không gọi nguồn trả phí, không đổi cờ môi trường.

## Ngoài phạm vi

- Luồng Reader (`reader-report-revisions.ts`, `build.ts`): PR sau.
- Đổi cách đọc chữ ẩn, một bộ đọc chữ nhìn thấy chung, U32: PR sau, cần chủ quyết định.
- Insight: giữ lời gọi kiểm chữ nhìn thấy riêng (tiền tố `INSIGHT_`).
