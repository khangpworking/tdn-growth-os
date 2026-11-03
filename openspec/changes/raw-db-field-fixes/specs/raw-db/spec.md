## ADDED Requirements

### Requirement: R-RF01 review.state chỉ là trạng thái của chính đánh giá
`review.state` SHALL chỉ nhận `VALID`, `HIDDEN`, `DELETED`. Migration 0071 SHALL chặn INSERT và dừng nâng cấp nếu có giá trị khác. S05 SHALL ghi `VALID`; sao thiếu hoặc sai thành `rating_star` `NULL`, đếm một lần cho mỗi đánh giá mới ở `ratingInvalid`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F381 (bản soát Astra, mục 1): lỗi sao không phải trạng thái của đánh giá.

#### Scenario: Sao thiếu
- **WHEN** bộ nạp S05 gặp đánh giá có `ratingState` `MISSING` hoặc `INVALID`
- **THEN** dòng `review` có `rating_star` `NULL`, `state` `VALID`, và `ratingInvalid` tăng 1

#### Scenario: Giá trị lạ
- **WHEN** có lệnh thêm dòng `review` với `state` `MISSING`
- **THEN** lệnh bị chặn với lỗi `raw_db_v1_review_state`

### Requirement: R-RF02 Bảng nguồn tên sản phẩm
Migration 0071 SHALL tạo bảng `product_name_source` (STRICT, cấm sửa, cấm xoá) với `source_kind` `METRIC_LIST` hoặc `APP_CAPTURE` (có `artifact_sha256`, không `capture_id`) hoặc `RAW_CAPTURE` (có `capture_id`, không `artifact_sha256`), và `json_path`, `recorded_at` bắt buộc.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F385 (bản soát Astra, mục 3): mọi tên sản phẩm phải truy được về bản ghi gốc.

#### Scenario: Cặp cột sai
- **WHEN** có lệnh thêm dòng `METRIC_LIST` hoặc `APP_CAPTURE` có `capture_id`, hoặc `RAW_CAPTURE` có `artifact_sha256`
- **THEN** lệnh bị chặn bởi CHECK

### Requirement: R-RF03 Bộ nạp ghi nguồn tên sản phẩm
S05 SHALL ghi `METRIC_LIST`, S02b từ tệp ghi `RAW_CAPTURE`, S02b từ lượt chạy và S06 ghi `APP_CAPTURE`, cùng giao dịch với `product`. Mỗi dòng SHALL trỏ đúng bản ghi đã cho tên. `APP_CAPTURE` SHALL trỏ tệp thu đã kiểm và đường dẫn trong phản hồi đã giải mã, không tạo dòng `raw_capture` cho lần thu tên.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F385.

#### Scenario: S05 lấy tên từ Metric
- **WHEN** bộ nạp S05 thêm một sản phẩm mới
- **THEN** có đúng một dòng `product_name_source` `METRIC_LIST` với dấu của tệp Metric đã dùng và `json_path` như `$[206].body.data.products[2]`

#### Scenario: Tên từ lượt thu app
- **WHEN** S02b từ lượt chạy app hoặc S06 thêm một sản phẩm từ tên trong lần gọi rank/detail đã lưu
- **THEN** có đúng một dòng `APP_CAPTURE` trỏ tệp và bản ghi đã cho tên, không thêm `raw_capture` cho lần gọi tên

#### Scenario: Không có tên
- **WHEN** không bản ghi nào cho tên sản phẩm
- **THEN** không có dòng `product` (như cũ)

### Requirement: R-RF04 Điền nguồn tên cho sản phẩm cũ
Khi nạp lại cùng lần chạy (lần thu đầu của sản phẩm thuộc lần chạy đó) và sản phẩm chưa có dòng `product_name_source`, bộ nạp SHALL chỉ thêm dòng đó; các số khác của kết quả SHALL bằng 0. Tên tìm được SHALL bằng `product_name` đã lưu; nếu khác, cả lần nạp SHALL hỏng với `RAW_DB_PRODUCT_NAME_MISMATCH` và không ghi gì.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F385: migration không đọc được tệp, nên dữ liệu cũ được điền bằng cách nạp lại.

#### Scenario: Nạp lại sau migration
- **WHEN** sản phẩm đã lưu trước 0071 và nạp lại cùng lần chạy
- **THEN** `productNameSources` là 1 cho sản phẩm đó, mọi số khác là 0

#### Scenario: Tên khác
- **WHEN** tên tìm được khác `product_name` đã lưu
- **THEN** lỗi `RAW_DB_PRODUCT_NAME_MISMATCH`, không bảng nào đổi

### Requirement: R-RF05 Cột cơ sở của dấu phản hồi
Migration 0071 SHALL thêm `raw_capture.response_sha256_basis` (4 giá trị ở KHUON §2.1), điền mọi dòng cũ có dấu theo bảng đó, giữ `NULL` khi không có dấu, dựng lại `raw_capture_no_update` như cũ, và dừng nếu còn dấu chưa có cơ sở. S02b từ tệp kẽm đã nạp SHALL nhận `SUPPLIED_FILE` (không khai báo canonical-json).

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F381 (bản soát Astra, mục 4): cùng một cột không được mang bốn nghĩa mà không nói nghĩa nào.

#### Scenario: Dòng cũ
- **WHEN** cơ sở dữ liệu ở bản 70 có dòng S05 và S07 nạp từ lượt chạy app, và chạy migration 0071
- **THEN** S05 và S07 có `RETAINED_ENVELOPE`; dòng không có dấu vẫn `NULL`; UPDATE trên `raw_capture` vẫn bị chặn

### Requirement: R-RF06 Bộ nạp ghi cơ sở của dấu
Mỗi bộ nạp (S05, S06, S07, S19b, S29, S02b, S14) SHALL ghi `response_sha256_basis` theo bảng của KHUON §2.1 khi có `response_sha256`. Thêm dòng có `response_sha256` mà không có `response_sha256_basis` SHALL bị chặn.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F381 (bản soát Astra, mục 4).

#### Scenario: Tệp S02b khai báo JSON chuẩn
- **WHEN** tệp S02b có `declare.responseSha256Basis` `canonical-json`
- **THEN** các dòng `raw_capture` của tệp có `CANONICAL_JSON`; không khai báo thì `SUPPLIED_FILE`

#### Scenario: Thiếu cơ sở
- **WHEN** có lệnh thêm dòng `raw_capture` có `response_sha256` và `response_sha256_basis` `NULL`
- **THEN** lệnh bị chặn với lỗi `raw_db_v1_raw_capture_basis_missing`

### Requirement: R-RF07 attributes_json theo dạng của từng nguồn
`src/modules/raw-db/attributes-shape.ts` SHALL khai báo một dạng `review.attributes_json` cho mỗi nguồn, như KHUON §3. Mọi đường thêm dòng `review` SHALL kiểm dạng; sai dạng hoặc nguồn chưa khai báo SHALL làm cả lần nạp hỏng với `RAW_DB_ATTRIBUTES_SHAPE` và không ghi gì.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F381 (bản soát Astra, mục 5): cột giữ dạng riêng từng nguồn nhưng phải kiểm được.

#### Scenario: Dạng của từng nguồn
- **WHEN** kiểm `attributes_json`
- **THEN** S05 nhận `NULL` hoặc mảng không rỗng các chuỗi không rỗng; S06 chỉ nhận `NULL`; S07 nhận đối tượng có `textForm` `SANITIZED` và chỉ các khoá `byVideoAuthor` (true), `likedByAuthor`, `pinnedByAuthor` (true/false), `exclusionReason` (`REPLY`, `EMPTY`, `TAG_ONLY`, `EMOJI_ONLY`)

#### Scenario: Sai dạng
- **WHEN** một đánh giá S05 có `attributes` chứa chuỗi rỗng
- **THEN** lần nạp hỏng với `RAW_DB_ATTRIBUTES_SHAPE`, không bảng nào đổi

### Requirement: R-RF08 Bộ kiểm tệp gốc nhận S02b
`data/raw-sources/tools/validate_raw.py` SHALL nhận `S02b` làm `sourceCode` và trong `alsoCovers`, và lời báo SHALL kể S02b. Luật khác SHALL NOT đổi.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F382.

#### Scenario: Tệp S02b
- **WHEN** tệp `raw-v1` có `declare.sourceCode` `S02b`
- **THEN** bộ kiểm không báo lỗi `sourceCode`
