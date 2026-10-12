# Bảng theo dõi 30 section: quy tắc nào đã được kiểm

Cập nhật: 2026-10-12 · Gốc: `origin/main` 0b514408 · Nguồn quy tắc: `../ultimate-method-30-sections.md`

Đây là bảng theo dõi, không phải quy tắc mới. Khi bảng và file Ultimate khác nhau, file Ultimate đúng.

| File | Nội dung |
|---|---|
| [market.md](market.md) | 13 section Market: mỗi quy tắc được code kiểm, kiểm một phần, hay mới chỉ có trên giấy |
| [insight.md](insight.md) | Kết luận chính và 17 section Insight: cùng cách đánh giá |
| [doc-consistency.md](doc-consistency.md) | Các chỗ tài liệu mâu thuẫn nhau (use case UC-1 trong `docs/runbooks/ontology-use-cases-and-maintenance.md`) |
| [../source-status.md](../source-status.md) | Trạng thái hiện tại của từng nguồn S01–S27 và nhật ký đổi trạng thái (lập theo phát hiện 7; chỉ để đọc, không code nào đọc) |

## Tóm tắt

| Báo cáo | Số quy tắc | Đã kiểm tự động | Kiểm một phần | Chỉ có trên giấy | Không áp dụng / tạm khoá |
|---|---|---|---|---|---|
| Market | 35 | 5 | 24 | 3 | 3 |
| Insight | 54 | 16 | 32 | 3 | 3 |

Tài liệu mâu thuẫn nhau: 40 chỗ, gồm 3 mức cao, 19 mức vừa, 18 mức thấp. Ngày 12/10/2026 đã sửa 35 chỗ (cả 3 mức cao: S03, S16 và S08 nay được đánh dấu chưa dùng được trong bảng "section nào dùng nguồn nào"; 6 chỗ sửa theo quyết định của chủ cùng ngày, gồm bộ nhãn trạng thái nguồn nay ở `../source-status.md`); 0 chỗ cần chủ quyết; 5 chỗ để sau.

## Cách cập nhật

- Khi một PR thêm hoặc bỏ một bước kiểm quy tắc, sửa dòng tương ứng trong `market.md` hoặc `insight.md` ngay trong PR đó.
- Khi file Ultimate đổi quy tắc (có dòng CHANGELOG `business-rule:`), kiểm lại các dòng có mã quy tắc đó.
- Các mục trong `doc-consistency.md` có cột "Trạng thái": đã sửa, cần chủ quyết, hoặc để sau. Chỗ cần chủ quyết chỉ sửa sau khi chủ quyết.
- "Kiểm bằng ontology" chỉ tính các shape trong `ontology/shapes/`. Các shape này hiện vẫn ở trạng thái đề xuất, chạy trên dữ liệu giả và chưa nối vào app.
