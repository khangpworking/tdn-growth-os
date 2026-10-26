# S17 truy nguồn từng số và chọn link theo lá danh mục phổ biến

> Trạng thái: **đề xuất**, làm trong nhánh `wp/cd-trace-pick-2610` theo phiếu CD ngày 26/10/2026. Mã đã viết trong nhánh; chưa gộp, chưa archive. Delta R-P07 gồm cả phần đang chờ của change `market-number-trace-gate`; archive change đó trước.

## Why

Ngày 26/10/2026 hai lần chạy thật (quạt điện, son môi) dừng ở bước REPORTS với mã `MARKET_NUMBER_TRACE_BLOCKED`. Số bị chặn đến từ bảng S17 (thư viện quảng cáo tìm kiếm, Phần 7): nhãn «Bảng 7.3» viết cứng, còn tên thương hiệu, số mẫu quảng cáo, số Chữ/Hình/Video và ngày in ra không có dòng nào trong bản đồ số. Cùng ngày, bước chọn link (PICK) chọn sản phẩm ngoài nhóm của sản phẩm chính: pin dự phòng và mô tơ cho quạt, bộ trang điểm cho son. Phiếu CD 26/10/2026 yêu cầu vá hai chỗ này.

## What Changes

- **MODIFIED** R-P07: bảng S17 in nhãn bảng bằng đúng công thức `exhibit-number`, đếm từ vị trí thật trong Phần 7, ở cả nhánh trình bày và nhánh không trình bày; mọi số trong bảng (số mẫu, Chữ/Hình/Video, số ngày) và mọi nhãn lấy từ dữ liệu (tên thương hiệu, miền) có dòng trong bản đồ số trỏ về bản ghi COLLECTION. Không thêm mục nào vào danh sách miễn trừ; cổng giữ nguyên độ chặt.
- **MODIFIED** R-P03: `pickShopeeLinks` đọc lá danh mục từ `final_categories` (thiếu thì `categories`), ưu tiên lá phổ biến nhất trong các dòng đủ điều kiện, chỉ lấy lá khác khi còn thiếu chỗ; dòng lá khác bị hạ bậc chứ không bị loại khỏi mẫu. Bản ghi pick thêm hai trường tùy chọn `demotedRows` và `aiExcludedRows`. Hàm vẫn nhận bản ghi relevance đã lưu để loại dòng `NOT_MAIN`, nhưng bước PICK chưa truyền bản ghi đó (xem «Ngoài phạm vi»).

## Impact

- Mã: RA `reports.ts` (`searchAdsTable`: truy số mẫu, số Chữ/Hình/Video, ngày, tên thương hiệu, miền; bỏ nhãn «Bảng 7.3» viết cứng), RA `market-reader-delivery.ts` (`numberSearchAdsExhibit` cho nhánh không trình bày), RA `autorun-derive.ts` (`pickShopeeLinks`, `categoryLeaf`, `relevanceTitle`, `PickResult`).
- Bản ghi pick `autorun-pick-record-v3` thêm trường tùy chọn; không có lược đồ JSON riêng nên không đổi lược đồ. Bản ghi cũ vẫn đọc được vì trường mới chỉ ghi khi có.
- Không đổi nguồn, không gọi mô hình, không đổi cờ môi trường, không đổi cơ sở dữ liệu.

## Ngoài phạm vi

- **D2 — truyền relevance vào PICK.** Bản ghi `capture-relevance-record-v1` hiện chỉ được tạo ở pha phương pháp Market, sau PICK, và giữ trong checkpoint gói theo `methodKey`. Truyền nó vào PICK cần đổi máy trạng thái của lần chạy (phân loại ở PREPARE, giữ bản ghi, dùng lại ở phương pháp Market) hoặc đường đọc checkpoint xuyên gói, vượt khoảng 150 dòng. Phiếu CD cho phép dừng sau D1 + D3; hàm thuần đã nhận và áp dụng bản ghi khi có, chỉ thiếu chỗ nối.
- Không loại bộ/combo theo chữ trong tiêu đề («Combo 2 Son Môi» là combo cùng sản phẩm, hợp lệ).
- Không đổi các phần chưa phủ của bản đồ số (M05, M06, M08, M09, M10, M11).
- Không chạy lại báo cáo lịch sử, không triển khai.
