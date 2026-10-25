## MODIFIED Requirements

### Requirement: R-M34 Chỉ số giá tên là giá bán trung bình
Báo cáo Market có số chuỗi thô từ bản lưu SHALL NOT in giá suy từ doanh số chia lượt bán, ở mọi chỗ: cột bảng, chú thích, nhận định, nhóm giá ở phần cơ hội và phương án, danh sách sản phẩm. Báo cáo Market không có số chuỗi thô, khi in số doanh số chia lượt bán trong kỳ, SHALL gọi số đó là «giá bán trung bình» và SHALL kèm chú thích: tính theo lượt bán từng ngày, không phải giá người mua trả sau voucher. Báo cáo Market SHALL NOT dùng chữ «giá thật».

- Loại kiểm: Máy (một phần)
- Mã kiểm: `lintVisibleReportText` (`src/modules/analysis/report-visible-text-lint.ts`), luật U13_REAL_PRICE cho chữ «giá thật». Cờ `withoutAveragePrice` của `buildMarketReportV2` (`src/modules/analysis/reader-report/market-template-v2.ts`) bỏ số này ở bản đọc; chưa có mã kiểm máy cho việc bỏ, chỉ có dòng hợp đồng B1. Nhãn «giá bán trung bình» và dòng «Chú thích:» của báo cáo cũ do `buildMarketReportV2` in; chưa có mã kiểm cho nhãn và chú thích.
- Vì sao: chủ 22/10/2026 hỏi «giá thật» lấy từ đâu (F106), rồi duyệt đổi tên (F107). Chủ 23/10/2026: «giá TB tính từ Doanh số/số lượt bán không có ý nghĩa, xóa» (F118, F119). Quy chuẩn dữ liệu đầu vào 1.43, L5a.

#### Scenario: Dùng chữ giá thật
- **WHEN** báo cáo có chữ «giá thật»
- **THEN** kiểm chữ nhìn thấy trượt

#### Scenario: Báo cáo có số chuỗi thô in giá trung bình
- **WHEN** báo cáo có số chuỗi thô và một bảng có cột «Giá bán trung bình»
- **THEN** quy tắc R-M34 bị vi phạm

#### Scenario: Báo cáo có số chuỗi thô không in giá trung bình
- **WHEN** báo cáo có số chuỗi thô và không chỗ nào in doanh số chia lượt bán
- **THEN** quy tắc R-M34 đạt

#### Scenario: Báo cáo cũ có tên mới và chú thích
- **WHEN** báo cáo không có số chuỗi thô, ô giá ghi «giá bán trung bình» và dòng «Chú thích:» nêu cách tính
- **THEN** quy tắc R-M34 đạt
