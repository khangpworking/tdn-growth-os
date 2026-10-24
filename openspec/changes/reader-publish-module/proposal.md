# Một mô-đun xuất bản bản đọc cho Insight, TikTok, Shopee (sau đó Market)

> Trạng thái: **đề xuất**, theo quyết định của chủ ngày 24/10/2026 (c3, nhận các câu trả lời khuyến nghị). PR2 không đổi hành vi. Không đổi luật nghiệp vụ.

## Why

Ba hàm `buildInsight`, `buildTikTok`, `buildShopee` trong RA `reader-report-revisions.ts` chép cùng một khối khoảng 65 dòng: thử lại theo mã yêu cầu, chặn khi bản mới nhất đã được duyệt, giới hạn cỡ HTML, gọi `publishReaderReport`, bản ghi dựng, một giao dịch DB. Market `#build` chép giao dịch đó bằng tay và đã lệch (thiếu kiểm duyệt trong giao dịch, thiếu giới hạn cỡ). Một mô-đun giữ phần chung để các họ báo cáo không lệch nữa.

## Quyết định 24/10/2026

- b1: mô-đun mới RA `reader-publish.ts`, một hàm nhận trang đã dựng và vài tham số của họ báo cáo. Tên và chữ ký các hàm công khai của `AutomationReaderReports` giữ nguyên; `service.ts` không đổi.
- b4: chưa ánh xạ lỗi UNIQUE `revision_number` (hoãn).
- b5: `decide`/`decideV2` giữ nguyên.
- b6: `createdAt` do bên gọi đưa vào (Market tính trước khi dựng trang; họ Insight tính sau cổng).

## What Changes

- PR2 (không đổi hành vi): thêm RA `reader-publish.ts` (`publishInsightFamilyRevision`). `buildInsight`, `buildTikTok`, `buildShopee` gọi mô-đun này. Kiểm riêng của từng họ (phiên bản, persona, mã tiêu thụ đã đóng băng) và dòng sổ tiêu thụ TikTok/Shopee vẫn ở hàm của họ đó. Lỗi, mã lỗi, câu tiếng Việt, JSON bản ghi dựng, số bản sửa, dòng sổ tiêu thụ giữ y hệt.
- PR3 (đổi hành vi, cần kiểm thử mới): chuyển Market `#build` sang mô-đun; thêm kiểm duyệt trong giao dịch, giới hạn cỡ cho Market; kiểm phạm vi trang cho TikTok/Shopee (D3); kiểm họ báo cáo khi thử lại (D6).

## Spec

- PR2 không đổi luật nào. Chỉ dòng «Mã» của R-P10 (`report-pipeline`) đổi, vì R-P10 nêu chuỗi gọi dựng bản đọc: `publishReaderReport` của họ Insight nay được gọi từ RA `reader-publish.ts`. Câu luật và kịch bản của R-P10 giữ nguyên.

## Impact

- Mã: RA `reader-report-revisions.ts`, RA `reader-publish.ts` (mới).
- Kiểm thử: `tests/integration/c3-reader-publish-characterization.test.ts` (PR1) phải xanh không đổi; kiểm thử hợp đồng của mô-đun do phiên khác viết.
- Không di trú DB, không đổi HTML, không gọi nguồn trả phí, không đổi cờ.

## Ngoài phạm vi

- `decide`/`decideV2`, `list*`, `html`.
- Ánh xạ lỗi UNIQUE `revision_number` (b4).
