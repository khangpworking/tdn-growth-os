## Bối cảnh

Kiểm trên main ngày 29/10/2026:
- Báo cáo Insight chỉ ra HTML và PDF. Chưa có câu insight có cấu trúc.
- Duyệt có cho từng bản báo cáo (`analysis_reader_report_decisions`, migration 0048), không có cho từng câu.
- Insight của chiến dịch gồm `customer`, `painPoint`, `insight` và `source` (TYPED hoặc STP). Mỗi lần sửa là một bản mới không đổi được; mỗi chiến dịch có một khóa chốt (migration 0026, `content-insight-service.ts`).
- Lần chạy không nối thẳng với sản phẩm. Lần chạy chỉ nối với workspace khám phá.
- MCP chỉ khởi động và đọc lần chạy. Autorun của app dựng báo cáo.

## Quyết định kỹ thuật

1. **Chỗ lưu câu insight.** Một bảng mới trong Box 2. Mỗi dòng là một câu, nối với một bản báo cáo (`analysis_reader_report_revisions`, loại INSIGHT). Hợp đồng là một JSON Schema đóng trong `contracts/`, sinh type như các hợp đồng khác.
2. **Đọc chéo Box.** Box 4 đọc câu insight qua một giao diện truy vấn mà Box 2 khai báo (ARCHITECTURE, luật 4). Box 4 không đọc thẳng bảng của Box 2.
3. **Ghi Insight chiến dịch.** Chỉ dịch vụ Box 4 ghi (ARCHITECTURE, luật 3). Nguồn có giá trị mới, ví dụ `INSIGHT_REPORT`. Insight lưu mã bản báo cáo, mã câu và bản sao đóng băng của 9 trường. Migration mới lấy số kế tiếp. Nếu cột nguồn có CHECK thì migration mở rộng CHECK.
4. **Trạng thái duyệt.** Đọc quyết định mới nhất của bản báo cáo. Không thêm bảng duyệt mới.
6. **Đầu vào AI.** Các trường thêm đi vào lớp khóa của prompt Big Idea và Angle. Phần chủ viết không đổi (prompt hai lớp).
7. **Dữ liệu giả.** Câu insight giả chỉ có trong kiểm thử. Không ghi câu giả vào DB thật.

## Rủi ro

- Bản thật chưa có dòng mã hóa bình luận nào (25/10/2026). Vì vậy tính năng sẽ trống cho tới khi có bộ viết câu insight. Chủ chấp nhận (Q19, Q23).
- Change `insight-method-v1` chưa archive. Change này không sửa spec `insight-report`, nên hai change không đè nhau khi archive.
