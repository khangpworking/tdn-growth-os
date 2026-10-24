# Một mô-đun xuất bản bản đọc cho Insight, TikTok, Shopee (sau đó Market)

> Trạng thái: **đề xuất**, theo quyết định của chủ ngày 24/10/2026 (c3, nhận các câu trả lời khuyến nghị). PR2 không đổi hành vi. PR3 thêm ba sửa nhỏ chủ đã duyệt. Không đổi luật nghiệp vụ.

## Why

Ba hàm `buildInsight`, `buildTikTok`, `buildShopee` trong RA `reader-report-revisions.ts` chép cùng một khối khoảng 65 dòng: thử lại theo mã yêu cầu, chặn khi bản mới nhất đã được duyệt, giới hạn cỡ HTML, gọi `publishReaderReport`, bản ghi dựng, một giao dịch DB. Market `#build` chép giao dịch đó bằng tay và đã lệch (thiếu kiểm duyệt trong giao dịch, thiếu giới hạn cỡ). Một mô-đun giữ phần chung để các họ báo cáo không lệch nữa.

## Quyết định 24/10/2026

- b1: mô-đun mới RA `reader-publish.ts`, một hàm nhận trang đã dựng và vài tham số của họ báo cáo. Tên và chữ ký các hàm công khai của `AutomationReaderReports` giữ nguyên; `service.ts` không đổi.
- b4: chưa ánh xạ lỗi UNIQUE `revision_number` (hoãn).
- b5: `decide`/`decideV2` giữ nguyên.
- b6: `createdAt` do bên gọi đưa vào (Market tính trước khi dựng trang; họ Insight tính sau cổng).
- Q1: mọi loại báo cáo bị chặn như nhau sau khi chủ duyệt: Market kiểm lại «bản mới nhất đã duyệt» trong giao dịch (D8); vẫn giữ kiểm sớm trước kiểm đầu vào, để thứ tự lỗi không đổi.
- Q2: trang Market lớn hơn `MAX_READER_HTML_BYTES` (32 MiB) bị từ chối khi dựng (D9), như Insight. Lời từ chối đến sau khi ảnh bìa, sidecar có thể đã được lưu, giống khi cổng chặn.
- Q3: không đổi màn hình, chữ báo cáo, cơ sở dữ liệu.
- b2 (thử lại chặt nhất cho mọi loại): **hoãn** cho Market. Cần bộ kiểm bản ghi Market riêng, và dòng Market cũ có thể bắt đầu báo lỗi. Thử lại Market giữ y như nay.
- b3: kiểm phạm vi trang (D3) cho TikTok và Shopee trong bước chung của họ Insight. Hôm nay không thể kích hoạt, không đổi kết quả nào.

## What Changes

- PR2 (không đổi hành vi): thêm RA `reader-publish.ts` (`publishInsightFamilyRevision`). `buildInsight`, `buildTikTok`, `buildShopee` gọi mô-đun này. Kiểm riêng của từng họ (phiên bản, persona, mã tiêu thụ đã đóng băng) và dòng sổ tiêu thụ TikTok/Shopee vẫn ở hàm của họ đó. Lỗi, mã lỗi, câu tiếng Việt, JSON bản ghi dựng, số bản sửa, dòng sổ tiêu thụ giữ y hệt.
- PR3: Market `#build` gọi `publishMarketRevision` (RA `reader-publish.ts`): giới hạn cỡ, `checkMarketReport` (READER) rồi `publishReaderReport` với tùy chọn như nay, lưu hồ sơ phân loại và bản ghi dựng, cùng một giao dịch với họ Insight (INSERT 19 cột, đăng ký ảnh bìa và sidecar). Ở lại trong `#build`: thử lại theo mã yêu cầu và kiểm duyệt sớm, kiểm dòng, nhóm so sánh, giá đơn vị, ảnh bìa, `verifyPublicReviewSource` trước khi dựng trang, dựng trang, Flint; `html()` vẫn kiểm lại nguồn review công khai. Sửa: D8, D9 cho Market; D3 cho TikTok/Shopee. JSON bản ghi, mã lỗi, câu lỗi (câu duyệt Market giữ nguyên), số bản sửa, thứ tự cổng, byte html/metrics/claims giữ y hệt.
- Hoãn: thử lại chặt nhất cho Market (b2), kiểm họ báo cáo khi thử lại (D6), ánh xạ lỗi UNIQUE (b4).

## Spec

- PR2 không đổi luật nào. Chỉ dòng «Mã» của R-P10 (`report-pipeline`) đổi, vì R-P10 nêu chuỗi gọi dựng bản đọc: `publishReaderReport` của họ Insight nay được gọi từ RA `reader-publish.ts`. Câu luật và kịch bản của R-P10 giữ nguyên.
- PR3: dòng «Mã» của R-P10 nêu thêm `publishMarketRevision`. Không luật nào đã duyệt nói về chặn sau khi duyệt hay giới hạn cỡ bản đọc, nên PR3 không thêm hay sửa câu luật nào.

## Impact

- Mã: RA `reader-report-revisions.ts`, RA `reader-publish.ts` (mới).
- Kiểm thử: `tests/integration/c3-reader-publish-characterization.test.ts` (PR1) phải xanh không đổi ở PR2; ở PR3 chỉ dòng «row 4 Market» đổi (nay từ chối trang quá cỡ). Kiểm thử hợp đồng của mô-đun do phiên khác viết.
- Không di trú DB, không đổi HTML, không gọi nguồn trả phí, không đổi cờ.

## Ngoài phạm vi

- `decide`/`decideV2`, `list*`, `html`.
- Ánh xạ lỗi UNIQUE `revision_number` (b4).
- Thử lại chặt nhất cho Market (b2) và kiểm họ báo cáo khi thử lại (D6).
