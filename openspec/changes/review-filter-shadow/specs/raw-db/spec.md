## ADDED Requirements

### Requirement: R-RF01 Bảng kết quả lọc chỉ thêm
Migration 0072 SHALL tạo bảng STRICT `review_filter_assessment`, khoá chính `(review_key, policy_version)`, khoá ngoại tới `review`, trigger cấm sửa và cấm xoá với lỗi `immutable_raw_db_v1_review_filter`. Migration SHALL thêm cột `filtering` nhận NULL vào `raw_db_autoload`. Migration SHALL NOT đổi dòng nào của bảng cũ.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F429: kết quả lưu trong database, bảng riêng, không đổi dữ liệu gốc.

#### Scenario: Nâng cấp
- **WHEN** cơ sở dữ liệu ở bản 71 có dữ liệu và chạy migration 0072
- **THEN** dòng cũ giữ nguyên, phiên bản migration là 72, và `raw_db_autoload.filtering` của dòng cũ là NULL

#### Scenario: Cấm sửa, xoá
- **WHEN** có lệnh UPDATE hoặc DELETE trên `review_filter_assessment`
- **THEN** lệnh bị chặn với lỗi `immutable_raw_db_v1_review_filter`

### Requirement: R-RF02 Dòng được lọc
Một lượt lọc SHALL xét đánh giá Shopee và TikTok Shop có `kind = 'product_review'`, thuộc lần chạy được chọn, chưa có dòng kết quả cho phiên bản luật hiện tại. Đánh giá thuộc nhiều lần chạy SHALL được xét một lần.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Giống phạm vi gán nhãn của R-RL03.

#### Scenario: Chạy lại
- **WHEN** lượt lọc chạy lại với cùng phiên bản luật
- **THEN** không có lượt gọi Jev mới và không có dòng mới

#### Scenario: Phiên bản luật mới
- **WHEN** phiên bản luật đổi
- **THEN** đánh giá được xét lại, dòng cũ giữ nguyên, dòng mới được thêm

### Requirement: R-RF03 Dòng trống không gọi Jev
Đánh giá SHALL chỉ có kết quả `NO_CONTENT`, lý do `EMPTY`, không gọi Jev, khi lời viết trống và không mục nào trong phần khách điền có ký tự nhìn thấy ngoài dấu hai chấm (`:` hoặc `：`). Ký tự trắng và ký tự ẩn SHALL được coi là trống. Mục có ký tự nhìn thấy khác dấu hai chấm SHALL được coi là có nội dung, kể cả khi nội dung nằm trước dấu hai chấm.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: F427: chỉ bỏ dòng thật sự trống; không dùng danh sách từ, độ dài hay dòng trùng lời. Code không phân biệt được `Công dụng:` với `Dùng bị ngứa:` bằng luật ký tự, nên gửi cả hai cho Jev để giữ phản hồi. Trong 2.025 đánh giá hiện có, 562 có danh sách mục và không mục nào kết thúc bằng dấu hai chấm mà không có phần sau; quyết định này chưa tăng lượt gọi trên dữ liệu hiện có.

#### Scenario: Mục chỉ có ký tự trống hoặc dấu hai chấm
- **WHEN** lời viết trống và phần khách điền là `["", " ", ":"]`
- **THEN** kết quả là `NO_CONTENT` và không có lượt gọi Jev

#### Scenario: Nội dung trước dấu hai chấm
- **WHEN** lời viết trống và phần khách điền là `["Công dụng:"]` hoặc `["Dùng bị ngứa:"]`
- **THEN** đánh giá được gửi cho Jev

#### Scenario: Lời ngắn không phải dòng trống
- **WHEN** lời viết là `Đẹp`, `10/10` hoặc `👍`, hoặc phần khách điền là `["nắp bị xước"]`
- **THEN** đánh giá được gửi cho Jev

### Requirement: R-RF04 Điều Jev được xem
Mỗi đánh giá có nội dung SHALL tốn đúng một lượt gọi Jev, với 2 câu hỏi `LOC` và `CHE`. Trạng thái gửi Jev SHALL có tên sản phẩm, lời viết và phần khách điền tách riêng. Trạng thái SHALL NOT có số sao.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: F429 và kiến nghị của Astra: số sao chỉ dùng để bảo vệ và kiểm tra, không dùng để xét liên quan.

#### Scenario: Không có số sao
- **WHEN** app gửi yêu cầu cho một đánh giá 1 sao
- **THEN** thân yêu cầu không chứa số sao, và có đúng câu hỏi `LOC` với lựa chọn `GIU`, `LOAI`, `RIENG` và câu hỏi `CHE` với lựa chọn `CO`, `KHONG`

### Requirement: R-RF05 Cách quyết định
Code SHALL quyết định từ câu trả lời của Jev và số sao. Khi `LOAI` từ 0,70 trở lên: không có số sao thì `UNRESOLVED` lý do `GUARD_NO_STAR`; từ 3 sao trở xuống thì `UNRESOLVED` lý do `GUARD_LOW_STAR`; `CO` từ 0,50 trở lên thì `UNRESOLVED` lý do `GUARD_COMPLAINT`; còn lại `EXCLUDE` lý do `JEV_EXCLUDE`. Khi `LOAI` dưới 0,70: `GIU` lớn nhất hoặc bằng lớn nhất thì `KEEP` lý do `JEV_KEEP`; còn lại `UNRESOLVED` lý do `JEV_UNRESOLVED`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: F429: lớp bảo vệ bằng code thay cho AI thứ hai khi chạy thật; lời chê không bao giờ bị tự loại.

#### Scenario: Bảo vệ lời chê
- **WHEN** Jev trả `LOAI` 0,90 và `CO` 0,60 cho đánh giá 5 sao
- **THEN** kết quả là `UNRESOLVED`, lý do `GUARD_COMPLAINT`

#### Scenario: Đánh giá thấp
- **WHEN** Jev trả `LOAI` 0,90 và `CO` 0,10 cho đánh giá 3 sao
- **THEN** kết quả là `UNRESOLVED`, lý do `GUARD_LOW_STAR`

#### Scenario: Đúng ngưỡng
- **WHEN** Jev trả `LOAI` 0,70 và `CO` 0,49 cho đánh giá 4 sao
- **THEN** kết quả là `EXCLUDE`

### Requirement: R-RF06 Lưu đủ để truy lại
Mỗi dòng kết quả SHALL có phiên bản luật, sha256 của luật, lần chạy, kết quả, lý do, 4 xác suất, số sao, mô hình, sha256 của nội dung đã gửi, sha256 của phản hồi gốc và thời điểm. Phản hồi gốc của Jev SHALL nằm trong kho tệp. Dòng `NO_CONTENT` SHALL không có xác suất, mô hình và sha256 của phản hồi.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ cần biết vì sao một dòng bị loại và theo luật nào.

#### Scenario: Truy lại một dòng
- **WHEN** một đánh giá có kết quả `EXCLUDE`
- **THEN** sha256 của phản hồi trỏ tới đúng phản hồi gốc trong kho tệp

### Requirement: R-RF07 Lỗi không phải là sạch
Một lượt gọi lỗi hoặc câu trả lời sai dạng SHALL dừng lượt lọc, SHALL NOT ghi dòng cho đánh giá đó, và SHALL báo mã lỗi cùng số dòng chưa lọc. Không có dòng kết quả SHALL có nghĩa là chưa lọc. Xác suất SHALL phải là số từ 0 đến 1, đủ đúng các lựa chọn, tổng lệch 1 không quá 0,02.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Astra: thiếu đánh giá hoặc lỗi không được hiểu là dữ liệu sạch.

#### Scenario: Jev lỗi giữa chừng
- **WHEN** lượt gọi thứ 2 trong 3 lượt trả lỗi
- **THEN** có 1 dòng kết quả, kết quả lượt báo mã lỗi và 2 dòng chưa lọc

### Requirement: R-RF08 Thứ tự và cô lập trong lượt nạp tự động
Khi cờ `TDN_RAW_DB_REVIEW_FILTER_ENABLED` đúng bằng `true`, lượt nạp tự động SHALL chạy lượt lọc sau khi nạp nguồn và trước khi gán nhãn, SHALL ghi tóm tắt vào `raw_db_autoload.filtering`. Lượt lọc lỗi hoặc đang bận SHALL NOT dừng việc gán nhãn. Cờ khác `true` SHALL không gọi Jev cho lượt lọc và SHALL ghi `SKIPPED_FLAG_OFF`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết: Jev đọc database sau khi lượt thu đã nạp xong; lỗi lọc không làm hỏng việc thu và gán nhãn.

#### Scenario: Cờ tắt
- **WHEN** cờ không đặt và lượt nạp tự động chạy
- **THEN** không có dòng trong `review_filter_assessment`, không có câu hỏi `LOC`, và kết quả gán nhãn giống khi chưa có tính năng này

#### Scenario: Lọc lỗi
- **WHEN** cờ bật và lượt lọc lỗi
- **THEN** `filtering` có trạng thái `FAILED` và gán nhãn vẫn chạy

### Requirement: R-RF09 Không ảnh hưởng số đếm
Không module nào ngoài lượt lọc và lệnh `FILTER` SHALL đọc `review_filter_assessment`. Gán nhãn, `review_star_sentiment`, loader, báo cáo và MCP SHALL cho cùng kết quả dù đánh giá có kết quả `EXCLUDE`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt chế độ chạy song song: chỉ ghi kết quả, chưa loại thật.

#### Scenario: Dòng bị đánh dấu loại vẫn được gán nhãn
- **WHEN** đánh giá có kết quả `EXCLUDE` và lượt gán nhãn chạy
- **THEN** đánh giá vẫn được gán nhãn và vẫn có trong `review_star_sentiment`

### Requirement: R-RF10 Lệnh chạy tay
Lệnh `raw-db-load --source FILTER [--run <id>] [--max-calls <n>] [--dry-run] [--db] [--artifacts]` SHALL chạy một lượt lọc. `--dry-run` SHALL báo số dự kiến, không gọi Jev và không ghi dòng. Một lượt SHALL gọi Jev không quá 1.500 lần. Lượt thật SHALL giữ khoá `raw-db-labels.lock.sqlite`; khoá bận thì báo `LABELS_BUSY`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Cần lọc dữ liệu đã có trong database mà không thu lại; F379 giới hạn theo một lượt, không thêm giới hạn khác.

#### Scenario: Chạy thử
- **WHEN** chạy `--source FILTER --run <id> --dry-run`
- **THEN** lệnh in số đánh giá có nội dung, số dòng trống, số lượt gọi dự kiến và không ghi gì
