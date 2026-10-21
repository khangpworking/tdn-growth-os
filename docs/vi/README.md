# Tài liệu tiếng Việt

Cập nhật: 21/10/2026 · Commit chính: `e9e0f444`

> Bản cập nhật 21/10/2026. Bản trước: [bản 21/10/2026 trước khi sửa](../outdated/2026-10-21/docs/vi/README.md).

Mục lục các tài liệu tiếng Việt cho ba phần của hệ thống. Mỗi phần có ba loại tài liệu:

- **Hướng dẫn sử dụng:** cho chủ sở hữu, viết bằng lời đơn giản, làm theo từng bước.
- **Tài liệu kỹ thuật:** cho người bảo trì: mô-đun, API, bảng dữ liệu, cờ cấu hình, kiểm thử.
- **Thiết kế hệ thống:** kiến trúc, luồng dữ liệu (có sơ đồ), các quyết định đã chốt, việc còn mở.

Chỗ nào chưa chắc chắn được ghi "(cần xác nhận)".

Hai báo cáo có 30 section: Market có 13, Insight có 17. Sơ đồ phân rã chức năng dưới đây chia mỗi báo cáo thành 5 nhóm. Danh sách section của từng nhóm nằm trong tài liệu "Thiết kế hệ thống" của mỗi báo cáo.

```mermaid
flowchart TD
  S["Hệ thống báo cáo: 30 section"]
  S --> M["Báo cáo Thị trường: 13 section"]
  S --> I["Báo cáo Insight: 17 section"]
  M --> M1["Khung báo cáo"]
  M --> M2["Đo thị trường"]
  M --> M3["Cạnh tranh và giá"]
  M --> M4["Nhìn trước"]
  M --> M5["Kết luận"]
  I --> I1["Khung nghiên cứu"]
  I --> I2["Hiểu khách hàng"]
  I --> I3["Lý do và rào cản"]
  I --> I4["Bối cảnh"]
  I --> I5["Định hướng"]
```

## Phần 1. Báo cáo Thị trường (Market)

- [Hướng dẫn sử dụng](market-report/huong-dan-su-dung.md)
- [Tài liệu kỹ thuật](market-report/tai-lieu-ky-thuat.md)
- [Thiết kế hệ thống](market-report/thiet-ke-he-thong.md)

## Phần 2. Báo cáo Insight (khách hàng)

Báo cáo Insight đang tạm dừng từ 19/10/2026 để ưu tiên Market.

- [Hướng dẫn sử dụng](insight-report/huong-dan-su-dung.md)
- [Tài liệu kỹ thuật](insight-report/tai-lieu-ky-thuat.md)
- [Thiết kế hệ thống](insight-report/thiet-ke-he-thong.md)

## Phần 3. Content Studio

- [Hướng dẫn sử dụng](content-studio/huong-dan-su-dung.md)
- [Tài liệu kỹ thuật](content-studio/tai-lieu-ky-thuat.md)
- [Thiết kế hệ thống](content-studio/thiet-ke-he-thong.md)

## Phần 4. Báo cáo tiến độ

- [Báo cáo tiến độ đến 20/10/2026](bao-cao-tien-do-2026-10-20.md): việc đã làm, khó khăn, việc đang chờ, ước tính thời gian, quyết định cần chủ sở hữu.

## Phần 5. Tài liệu tham khảo

Các tài liệu dưới đây là tài liệu nghiên cứu gốc. Chúng chưa được viết lại theo cách viết mới và dùng nhiều thuật ngữ tiếng Anh.

- [Ultimate Method cho 30 section](../research/ultimate-method/ultimate-method-30-sections.md): phương pháp và trạng thái của từng section.
- [Nguồn dữ liệu cho 30 section](../research/ultimate-method/input-data-sources-30-sections.md): section nào dùng nguồn nào.
- [Trạng thái nguồn dữ liệu](../research/ultimate-method/source-status.md): nguồn nào đã chạy, nguồn nào còn chờ (cập nhật lần cuối 21/10/2026, có kết quả kiểm tra nguồn trên 3 lượt chạy thật).
