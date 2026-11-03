## ADDED Requirements

### Requirement: R-G01 Làn gợi ý tìm kiếm chỉ chạy khi bật và có Insight
Làn S19b SHALL chỉ có khi `TDN_RESEARCH_SEARCH_SUGGEST_ENABLED` đúng bằng `1`; vắng hoặc giá trị khác SHALL không có làn. Làn SHALL chỉ gọi khi lượt chạy có báo cáo Insight. Lượt chỉ có Market SHALL không gọi, không lưu lần thu và không ghi dòng sử dụng.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 03/11/2026 chủ duyệt S19b cho Insight (F332).

#### Scenario: Cờ khác 1
- **WHEN** cờ là `true` hoặc vắng
- **THEN** không có làn S19b và không có lần gọi nào

#### Scenario: Lượt chỉ Market
- **WHEN** cờ bật và lượt chạy chỉ có Market
- **THEN** không có lần gọi, lần thu hay dòng sử dụng nào của S19b

### Requirement: R-G02 Tiền tố và trần gọi của S19b
Từ gốc SHALL là từ khóa 1 và từ khóa 2 đã xác nhận của lượt chạy (khi có). Mỗi từ gốc SHALL có tiền tố là chính nó, rồi từ gốc + dấu cách + từng chữ `a b c d đ e g h i k l m n o p q r s t u v x y`, theo đúng thứ tự đó. Làn SHALL gọi tối đa 24 lần mỗi từ gốc và 48 lần mỗi lượt chạy, tới `https://suggestqueries.google.com/complete/search?client=firefox&hl=vi&gl=vn&q=<tiền tố>`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Trần chủ duyệt; nguồn miễn phí, không cần khoá.

#### Scenario: Hai từ khóa
- **WHEN** lượt chạy có từ khóa 1 và từ khóa 2 đã xác nhận
- **THEN** có đúng 48 lần gọi: 24 của từ khóa 1 rồi 24 của từ khóa 2

#### Scenario: Chỉ từ khóa 1
- **WHEN** lượt chạy không có từ khóa 2 đã xác nhận
- **THEN** có đúng 24 lần gọi, tiền tố đầu là chính từ khóa 1

### Requirement: R-G03 Nhịp gọi và điều kiện dừng của S19b
Hai lần gọi SHALL cách nhau ít nhất 1 giây; mỗi lần gọi SHALL chờ tối đa 10 giây. Làn SHALL dừng (giữ những gì đã lưu) khi gặp HTTP 429 hoặc 403, thân trả về không phải JSON, hoặc 3 lần lỗi liền nhau. Làn SHALL NOT gọi lại một tiền tố và SHALL NOT tìm cách vượt chặn.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Nguồn công khai, miễn phí; bị chặn thì dừng.

#### Scenario: Bị chặn giữa chừng
- **WHEN** lần gọi thứ 5 trả HTTP 429
- **THEN** không có lần gọi thứ 6, và 4 lần thu trước vẫn được lưu

#### Scenario: Ba lần lỗi liền nhau
- **WHEN** ba lần gọi liền nhau hết giờ hoặc trả lỗi khác 429/403
- **THEN** làn dừng sau lần lỗi thứ ba, không gọi lại tiền tố nào

### Requirement: R-G04 Lần thu S19b là byte gốc
Mỗi câu trả lời hợp lệ SHALL thành một lần thu của bước `COLLECTION` với `provider = 'google-suggest'`, `operation = 'google.suggest'`, `media_type = 'application/json'`, `truncated = 0`; tệp SHALL là đúng byte trả về. Lần gọi lỗi SHALL NOT lưu lần thu. Gợi ý chỉ là ý định tìm kiếm, không bao giờ là số đếm.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Bộ nạp db-v1 đọc đúng byte gốc này (ánh xạ S19b của RAWDB-G).

#### Scenario: Câu trả lời hợp lệ
- **WHEN** nguồn trả `["kẽm a",["kẽm acid","kẽm amin"]]` cho tiền tố `kẽm a`
- **THEN** tệp của lần thu có cùng mã băm sha256 với byte trả về, tiền tố là phần tử 0, danh sách gợi ý là phần tử 1, và dòng lần thu mang đúng các giá trị trên

#### Scenario: Lần gọi lỗi
- **WHEN** một lần gọi trả HTTP 500
- **THEN** không có dòng lần thu cho tiền tố đó

### Requirement: R-G05 Gọi tiếp tóm tắt AI (S29) ngay trong lượt chạy
Khi `TDN_RESEARCH_AI_OVERVIEW_ENABLED` đúng bằng `1`, mỗi câu trả lời S19 có `ai_overview.page_token` mà không có `text_blocks` SHALL được gọi tiếp SerpApi `engine=google_ai_overview` ngay sau các lượt tìm S19, bằng khoá SerpApi sẵn có, tối đa 2 lần mỗi lượt chạy. Câu trả lời hợp lệ SHALL được lưu nguyên byte.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Mã trang hết hạn trong vài phút; mỗi lần gọi là một lượt tìm trả phí. Mỗi dòng S29 là giả thuyết mức Yếu, không bao giờ là bằng chứng.

#### Scenario: Ba mã trang
- **WHEN** ba câu trả lời S19 có mã trang và không có `text_blocks`
- **THEN** có đúng 2 lần gọi theo thứ tự tìm, và một dòng sử dụng `serpapi` với 2 yêu cầu

#### Scenario: Tóm tắt có sẵn
- **WHEN** câu trả lời S19 có `ai_overview.text_blocks`
- **THEN** không có lần gọi S29 cho câu trả lời đó

#### Scenario: Lần thu S29
- **WHEN** lần gọi tiếp trả HTTP 200 với `search_parameters.page_token` bằng mã đã hỏi
- **THEN** có lần thu `provider = 'serpapi'`, `operation = 'serpapi.google_ai_overview'`, `media_type = 'application/json'`, tệp là đúng byte trả về; câu trả lời lỗi không lưu lần thu

### Requirement: R-G06 Lỗi của hai làn không làm hỏng lượt chạy
Lỗi của làn S19b hay S29 (kể cả lỗi ghi lần thu) SHALL NOT làm lượt chạy thất bại và SHALL NOT đổi kết quả, độ phủ hay điểm chặn của bước thu. Dòng sử dụng SHALL được ghi như các làn SerpApi khác (S19b: chi phí biết là 0; S29: chi phí chưa biết). Văn bản báo cáo SHALL NOT nêu tên nhà cung cấp của hai nguồn; báo cáo chưa đọc hai nguồn này.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Cùng cách cô lập của các làn tùy chọn khác.

#### Scenario: Làn ném lỗi
- **WHEN** làn S19b ném lỗi giữa chừng
- **THEN** lượt chạy đi tiếp, tài liệu bước thu giống hệt khi tắt làn, và có một dòng sử dụng chi phí chưa rõ của `google-suggest`

#### Scenario: Báo cáo không đổi
- **WHEN** bật hai cờ và lượt chạy thu được dữ liệu của cả hai nguồn
- **THEN** HTML báo cáo Market và Insight giống hệt khi tắt hai cờ
