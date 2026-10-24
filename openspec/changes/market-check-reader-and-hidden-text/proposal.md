# Bản đọc dùng chung chỗ kiểm Market; chữ ẩn không tính cho luật câu chữ; một danh sách tổng hai sàn; nhãn đề xuất đầy đủ; lý do bằng lời

> Trạng thái: **đề xuất**, theo quyết định của chủ ngày 24/10/2026 (Q2 đến Q5, đánh giá kiến trúc c2) và quyết định bàn giao về tổng hai sàn cùng ngày. Có đổi kết quả kiểm; danh sách đổi trên báo cáo thật nằm trong PR.

## Why

Bản đọc (Reader) tự gọi cổng Market và 14 quy tắc, tự chọn bản nào chạy gì. Năm bộ đọc HTML hiểu "chữ ẩn" khác nhau: cùng một trang, chữ ẩn bị tính cho U13 trong cổng nhưng không bị tính cho E2. Bản nháp và bản đọc dùng hai danh sách khác nhau cho tổng hai sàn ("tổng cả hai sàn" chỉ bị chặn ở bản đọc, "Shopee + TikTok" chỉ bị chặn ở bản nháp). Cổng nháp nhận nhãn "đề xuất" ngắn, trong khi R-L14 đòi nhãn đầy đủ. Khi bản đọc trượt kiểm, chủ thấy mã quy tắc ở lỗi này và câu chung chung ở lỗi kia.

Câu của chủ (24/10/2026):
- Q2: khi bản đọc trượt kiểm, màn hình chủ ghi lý do bằng tiếng Việt dễ hiểu, không ghi mã.
- Q3: chữ ẩn không bị tính cho luật câu chữ (U13, E2, U32, M12, luật câu của các khối nguồn). Tên nhà cung cấp vẫn tính cả chữ ẩn (R-L01, đã làm ở c4).
- Q4: nhãn đề xuất ở M12 là "đề xuất, chờ chủ duyệt" ở mọi nơi (R-L14).
- Q5: được làm một số báo cáo đang đạt thành trượt, sau khi chạy trên báo cáo thật đã lưu và chủ xem danh sách.
- Bàn giao (24/10/2026): bản nháp và bản đọc dùng **một** danh sách cụm tổng hai sàn, là hợp của danh sách U32 và mẫu W3 hôm nay. Tổng hai sàn vẫn bị cấm (thay đổi "cho phép tổng" ngày 22/10 là thay đổi riêng, chưa duyệt).

## What Changes

- Chỗ kiểm `market-report-check.ts` có thêm ngữ cảnh `READER` theo phiên bản hợp đồng. v1 và v1.1 giữ đúng bộ kiểm hôm nay (cổng có U13; không 14 quy tắc; lint Reader cũ). v1.2: cổng, rồi 14 quy tắc; lint Reader dùng lại kết quả U13 của cổng, nên U13 chạy một lần thay vì ba.
- Một bộ đọc chữ nhìn thấy chung `src/modules/analysis/report-visible-text.ts` (ẩn: thuộc tính `hidden`, `aria-hidden` true/1/hidden, `display:none`, `visibility:hidden`, trong script/style/noscript/template; trích dẫn: q, blockquote, data-quote khi có thẻ đóng). Cổng (U13 và luật câu), lint U13 (Market, Insight, báo cáo tự động) và luật câu của các khối nguồn đọc qua đó. Insight cũng đổi: chữ ẩn không còn bị U13 tính (chỉ nới).
- Một danh sách cụm tổng hai sàn trong `report-language` (`crossPlatformTotalMatches`), dùng cho `U32_NO_CROSS_PLATFORM_TOTAL` và W3. Giữ mã và chi tiết của hai quy tắc.
- Cổng `M12_PROPOSAL_LABEL` đòi nhãn đầy đủ "đề xuất, chờ chủ duyệt".
- Lỗi bản đọc: chủ thấy danh sách lý do ngắn bằng tiếng Việt (`market-check-reasons.ts`, mỗi mã một câu); mã quy tắc vẫn nằm trong `cause` của lỗi cho vận hành. Giữ kiểu lỗi `ResearchAutomationValidationError` và mã HTTP.
- Giữ nguyên: lint Reader cũ F2–F8, W1, W2, W4, W5 (chỉ W3 đổi danh sách); tiền tố lỗi; mảng lint trong claims của bản đọc; luồng Insight khác.

## Impact

- Rà soát PR3: U13 của bản đọc v1.2 kiểm hai cách đọc thẻ nội dòng cũ trong một lần gọi, giữ riêng kết quả cổng và kết quả lint thô để không đổi kết luận hoặc nơi báo lỗi. Xóa cả cây chữ ẩn trước khi nối từ; theo dõi thẻ template lồng nhau. W3 của Insight và mảng lint lưu trong claims của bản đọc v1/v1.1 giữ nguyên; danh sách tổng hợp chỉ thay W3 của Market mới.

- Mã: RA `market-report-check.ts`, `market-check-reasons.ts` (mới), `market-business-gate.ts`, `reader-report-revisions.ts`, `official-statistics-lane.ts`; RR `build.ts`, `lint.ts` (W3); ANA `report-visible-text.ts` (mới), `report-visible-text-lint.ts`; `report-language/cross-platform-total.ts` (mới).
- Kết quả trên 49 báo cáo thật đã lưu (1378 dòng): 19 bản nháp Market đổi `M12_PROPOSAL_LABEL` từ đạt sang trượt (Q4); cả 19 đã trượt quy tắc 14 số 9 hôm nay. Không dòng nào khác đổi.
- Kiểm thử: các dòng `TODAY:` của `tests/unit/c2-market-check-characterization.test.ts` và hai chỗ ghim thông báo lỗi bản đọc đổi theo quyết định trên.
- Không đổi nguồn, không gọi nguồn trả phí, không đổi cờ môi trường.

## Ngoài phạm vi

- Cho phép tổng hai sàn (thay đổi 22/10): chưa duyệt.
- Kiểm Narrator trong `publishReaderReport` (c3), bộ đọc `visible()` của 14 quy tắc, chữ "Metric" của F1.
