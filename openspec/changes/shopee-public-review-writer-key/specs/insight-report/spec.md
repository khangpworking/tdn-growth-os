## ADDED Requirements

### Requirement: R-I40 Đánh giá Shopee mang mã người viết đã băm
Mỗi đánh giá Shopee mà bộ thu gói S lưu từ khi change này lên máy chủ SHALL mang `writer_key`: HMAC-SHA256 của mã tác giả do nguồn trả về, theo cách băm `shopee-author-id-hmac-v1`. Khoá HMAC SHALL nằm ngoài cơ sở dữ liệu và ngoài kho mã. Hệ thống SHALL NOT lưu mã tác giả gốc, tên hiển thị hay ảnh đại diện của người viết. SHALL NOT tính `writer_key` từ tên hiển thị.

Khi nguồn không trả mã tác giả cho một đánh giá, `writer_key` của đánh giá đó SHALL để trống. Đánh giá đó SHALL được đếm là một người viết, và báo cáo SHALL ghi «đếm theo đánh giá» (luật L2 của quy chuẩn dữ liệu đầu vào). Đánh giá đã lưu trước change này SHALL giữ nguyên.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 31/10/2026 chủ chốt 3A (F318): giữ mã người viết Shopee làm thành change riêng. Luật L2 (quy chuẩn dữ liệu đầu vào bản 1.48) và ngưỡng R-I33 cần đếm người viết; bộ thu gói S hiện không giữ mã tác giả.

#### Scenario: Một người viết hai đánh giá
- **WHEN** nguồn trả hai đánh giá Shopee có cùng mã tác giả
- **THEN** hai đánh giá có cùng `writer_key`, và số người viết của sản phẩm tăng 1

#### Scenario: Nguồn không trả mã tác giả
- **WHEN** nguồn trả một đánh giá Shopee không có mã tác giả
- **THEN** `writer_key` của đánh giá đó trống, đánh giá được đếm là một người viết, và báo cáo ghi «đếm theo đánh giá»

#### Scenario: Không lưu danh tính gốc
- **WHEN** nguồn trả mã tác giả, tên hiển thị và ảnh đại diện
- **THEN** dòng đã lưu chỉ có `writer_key`; mã tác giả gốc, tên và ảnh không có trong cơ sở dữ liệu, nhật ký hay báo cáo
