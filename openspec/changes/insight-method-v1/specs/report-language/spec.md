## MODIFIED Requirements

### Requirement: R-L12 Insight không bịa insight sáng tạo hay cảm xúc về quảng cáo
Insight SHALL NOT bịa insight sáng tạo hay cảm xúc về quảng cáo (ví dụ chiến dịch KFC, trà Tết). Động cơ và rào cản của khách SHALL chỉ lấy từ lời khách (đánh giá, bình luận) và video. Các sự thật khác (khách hỏi gì khi tìm, loại nào bán chạy, vùng nào tìm nhiều, cơ cấu dân số) MAY dùng nguồn theo bảng vai trò nguồn ở R-I34. (Chủ 20/10; chủ sửa ngày 25/10/2026)

- Loại kiểm: Chưa ghi trong business-spec
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết định ngày 20/10/2026 (F8): Insight không làm insight cảm xúc hay sáng tạo về quảng cáo, vì hệ thống không làm được. Ngày 25/10/2026 chủ chọn phương án A (F165): giữ lệnh cấm đó; động cơ và rào cản chỉ lấy từ lời khách và video; các sự thật khác dùng nguồn theo R-I34, để khớp phương pháp Insight bản 9 (R-I30 đến R-I39).

#### Scenario: Chỉ đọc bình luận và video
- **WHEN** Insight rút kết luận từ bình luận và video
- **THEN** quy tắc R-L12 đạt

#### Scenario: Insight cảm xúc về chiến dịch
- **WHEN** Insight viết một insight cảm xúc về chiến dịch quảng cáo mà không có trong bình luận hay video
- **THEN** quy tắc R-L12 bị vi phạm

#### Scenario: Động cơ lấy từ lời người bán
- **WHEN** Insight viết «khách mua vì muốn con cao lớn» chỉ dựa trên tên sản phẩm của người bán
- **THEN** quy tắc R-L12 bị vi phạm

#### Scenario: Câu hỏi của người tìm từ từ khóa Google
- **WHEN** Insight nêu «người tìm hỏi nhiều về tác dụng phụ» dựa trên gợi ý tìm kiếm Google, và chỉ dùng điều đó như câu hỏi của người tìm
- **THEN** quy tắc R-L12 đạt
