# Thêm cổng máy dò số vào chỗ kiểm báo cáo Market

> Trạng thái: **chủ đã duyệt kế hoạch ngày 25/10/2026** (kế hoạch chủ F201: «thêm cổng máy dò số»; chủ chọn phương án C cho gói P5). Mã nằm trong PR của gói P5. Chủ duyệt bản văn R-P07 mới khi gộp.

## Why

Mỗi báo cáo Market làm tay (bản v3 kẽm) phải soát từng con số bằng tay. Ngày 25/10/2026 chủ duyệt kế hoạch thêm một cổng máy: mọi con số in trên trang phải truy được về số liệu đã lưu, nếu không thì báo cáo bị chặn (F201).

R-P07 hiện ghi đúng các bước kiểm của bản nháp Market và thứ tự của chúng. Cổng mới là một bước kiểm mới, nên R-P07 phải đổi.

## What Changes

- **MODIFIED** R-P07: bản nháp Market có bản đồ số (báo cáo có số chuỗi thô) SHALL chạy thêm bước dò số sau các bước hiện có. Bước này:
  - cắt mọi con số trên trang đọc (bỏ CSS, thuộc tính, chữ ẩn, phụ lục truy nguồn); không bỏ qua số theo thẻ, lớp hay tiền tố: số trong trích dẫn nguyên văn, trong `<details>` và trong danh sách nguồn vẫn được đọc;
  - mỗi số SHALL có một dòng trong bản đồ số cùng phần, mỗi lần in một dòng;
  - mỗi dòng của bản đồ SHALL tính lại được bằng công thức đã đăng ký, ra đúng số in;
  - số mẫu cố định (số phần, số hình và bảng, số trích dẫn…) nằm trong một danh sách cho phép, mỗi mục có lý do; danh sách chỉ giữ chuỗi mẫu cố định chứa trọn con số, không cho phép theo loại thẻ; vạch chia trục được truy về cột lớn nhất của biểu đồ;
  - phần «chưa phủ» (M05, M06, M08, M09, M10, M11) chỉ được đếm và liệt kê, chưa chặn;
  - có số không truy được ở phần đã phủ, hoặc dòng không tính lại được: lần dựng lỗi với mã `MARKET_NUMBER_TRACE_FAILED:<N01_UNTRACED_NUMBER,N02_TRACE_REPLAY>`; bước REPORTS của lần chạy ghi mã `MARKET_NUMBER_TRACE_BLOCKED`; kết quả cổng (số, phần, ngữ cảnh) được lưu thành tệp JSON, và kết quả bước REPORTS ghi sha256 cùng đường dẫn của tệp đó.
- Báo cáo không có số chuỗi thô không chạy bước này; byte không đổi.

## Impact

- Mã: `src/modules/analysis/research-automation/market-number-trace.ts` (cổng, bảng công thức, danh sách cho phép, danh sách phần chưa phủ), `market-trace-map.ts` (bản đồ số v2), `market-report-check.ts` (bước mới trong `checkMarketReport`), `reports.ts` và các khối in số, `service.ts` (mã dừng và lưu kết quả cổng), `model.ts` (câu báo cho mã dừng), `market-check-reasons.ts` (lý do bằng lời cho N01, N02).
- Bản đồ số đổi phiên bản `market-number-trace-v1` → `market-number-trace-v2`; bản v1 cũ vẫn đọc được.
- Không đổi nguồn, không gọi nguồn trả phí, không đổi cờ môi trường.

## Ngoài phạm vi

- Gắn bản đồ số cho các phần chưa phủ: mỗi nguồn một gói sau (xem `tasks.md`).
- Bản đọc Reader và lần lưu (`READER`, `STORED`) chưa chạy bước này: bản đọc dựng lại số từ dữ liệu, không có bản đồ số.
