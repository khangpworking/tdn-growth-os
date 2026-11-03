## ADDED Requirements

### Requirement: R-RC01 Bảng codebook, review_code và view review_star_sentiment của db-v1
Migration 0068 SHALL tạo bảng `codebook`, `review_code` (STRICT, đúng db-v1 §3.3 và §5) và view `review_star_sentiment`, SHALL NOT chạm bảng đã có. `review_code` SHALL chỉ cho thêm dòng. `codebook` SHALL NOT cho xoá và SHALL chỉ cho một thay đổi: `DRAFT` → `APPROVED` có `approved_by`, `approved_at`, các cột khác giữ nguyên.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F361, F362: nhãn chủ đề nằm trong cơ sở dữ liệu app; F349: giá trị giữ như người gán đã ghi.

#### Scenario: Cơ sở dữ liệu mới
- **WHEN** app mở một cơ sở dữ liệu trống và chạy mọi migration
- **THEN** có bảng `codebook`, `review_code` và view `review_star_sentiment`, phiên bản migration là 68, và bảng của 0063 đến 0067 giữ nguyên

#### Scenario: Giá trị cho phép
- **WHEN** ghi một dòng `review_code`
- **THEN** `polarity` chỉ nhận `khen`, `che`, `ke`, `khong_ro_huong`; `status` chỉ nhận `kept`, `unclear`; `confidence` là `NULL` hoặc từ 0 đến 1; `origin` chỉ nhận `MCP_IMPORT`; dòng `NO_THEME` có `polarity`, `journey_step`, `confidence` là `NULL` và `status` = `kept`; dòng có chủ đề có `polarity` và `journey_step`

#### Scenario: Sửa hoặc xoá
- **WHEN** có lệnh UPDATE hoặc DELETE trên `review_code`, DELETE trên `codebook`, hoặc UPDATE trên `codebook` không phải là duyệt
- **THEN** lệnh bị chặn với lỗi `immutable_raw_db_v1_review_code` hoặc `immutable_raw_db_v1_codebook`

#### Scenario: Duyệt bộ chủ đề
- **WHEN** một dòng `codebook` `DRAFT` được đổi thành `APPROVED` có người duyệt và lúc duyệt, các cột khác giữ nguyên
- **THEN** lệnh thành công

### Requirement: R-RC02 Cảm xúc theo sao là view
`review_star_sentiment` SHALL trả `review_key`, `source_code`, `platform`, `product_key`, `rating_star`, `star_sentiment` của mọi dòng `review`, với `star_sentiment` = `tieu_cuc` khi 1–3 sao, `tich_cuc` khi 4–5 sao, `NULL` khi khác hoặc không có sao. Cảm xúc theo sao SHALL NOT được chép ra bảng.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F363.

#### Scenario: Ba mức
- **WHEN** có đánh giá 3 sao, 4 sao và một bình luận không có sao
- **THEN** view trả `tieu_cuc`, `tich_cuc` và `NULL`

### Requirement: R-RC03 Nạp bộ chủ đề
`--source CODES` SHALL lưu nguyên văn tệp chủ đề và SHA-256 các byte vào `codebook`, cùng phiên bản, trạng thái và thông tin duyệt từ JSON. Bản tệp SHALL bằng bản mọi `label`. Chỉ `coding_state` `done` cùng bản SHALL được xét cho `NO_THEME`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F361: tệp JSON là nơi sửa danh sách; cơ sở dữ liệu giữ đúng bản đã dùng.

#### Scenario: Lưu nguyên vẹn
- **WHEN** nạp một tệp chủ đề chưa có
- **THEN** `codebook_version`, `contract_version`, `status`, `approved_by`, `approved_at` lần lượt lấy từ `version`, `contractVersion`, `status`, `approvedBy`, `approvedAt`; `definition_json` giữ nguyên văn tệp và `definition_sha256` là SHA-256 các byte

#### Scenario: Bản khác
- **WHEN** tệp chủ đề có `version` khác bản của nhãn trong kho MCP
- **THEN** lệnh dừng với `RAW_DB_CODES_CODEBOOK_MISMATCH` và không ghi dòng nào

#### Scenario: Tệp đã đổi
- **WHEN** bản đã có trong `codebook` với dấu tệp khác
- **THEN** lệnh dừng với `RAW_DB_CODES_CODEBOOK_CHANGED` và không ghi dòng nào

#### Scenario: Trạng thái của bản khác
- **WHEN** kho có `coding_state` `done` của một bản khác, không có nhãn của bản đó
- **THEN** trạng thái đó không tạo `NO_THEME` và không làm hỏng lần nạp bản đang chọn

### Requirement: R-RC04 Ánh xạ nhãn MCP
Mỗi dòng `label` của kho MCP SHALL thành một dòng `review_code` theo db-v1 §3.3, giá trị giữ như MCP đã lưu. Mỗi đánh giá có `coding_state` `done` của bản đó mà không có `label` SHALL thành một dòng `NO_THEME`. Lời khách SHALL NOT được lưu trong `review_code`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F362: nhập nhãn đã gán, không gọi AI; F349: không dịch giá trị.

#### Scenario: Cột của một nhãn
- **WHEN** một nhãn được nạp
- **THEN** `theme_code`, `block_key`, `polarity`, `status`, `text_sha256` như `label`; `journey_step` = `step`; `confidence` = `p_yes`; `coded_at` = `coding_target.started_at` sớm nhất cùng bản và `block_norm`; `coder` = `--coder`; `origin` = `MCP_IMPORT`; `import_sha256` = SHA-256 của tệp kho MCP

#### Scenario: Đánh giá không có chủ đề
- **WHEN** một đánh giá có `coding_state` `done` mà không có `label`
- **THEN** có một dòng `NO_THEME` với `text_sha256` = `coding_state.input_sha256`, `block_key` của `coding_state`, `status` = `kept`

#### Scenario: Mã chủ đề lạ
- **WHEN** một nhãn có mã không thuộc lõi, khối của nhãn hay `otherCode` của tệp chủ đề
- **THEN** lệnh dừng với `RAW_DB_CODES_INVALID_ROW` và không ghi dòng nào

#### Scenario: Kho kẽm
- **WHEN** nạp kho MCP kẽm ngày 30/10 vào cơ sở dữ liệu có các đánh giá S05 cùng mã
- **THEN** có 1 dòng `codebook`, 2.287 dòng có chủ đề và 114 dòng `NO_THEME`

### Requirement: R-RC05 Khớp đánh giá
Đánh giá MCP SHALL khớp dòng `review` cùng `platform`, `external_id` = `source_review_id` và `kind = 'product_review'`. Không khớp thì các nhãn của đánh giá đó SHALL bị bỏ và được đếm `reviewsMissing`. Khớp hơn một dòng thì lệnh SHALL dừng.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Nhãn chỉ có nghĩa khi gắn đúng một đánh giá đã lưu.

#### Scenario: Đánh giá chưa nạp
- **WHEN** một đánh giá MCP không có dòng `review`
- **THEN** nhãn của nó không được ghi, `reviewsMissing` tăng 1 và kết quả liệt kê các nhãn bị bỏ

#### Scenario: Hai dòng khớp
- **WHEN** hai dòng `review` cùng `platform` và `external_id`
- **THEN** lệnh dừng với `RAW_DB_CODES_AMBIGUOUS_REVIEW`

### Requirement: R-RC06 Bằng chứng lời
Với mỗi nhãn, lời SHALL được dựng lại từ `review`: `text` rồi mỗi mục của `attributes_json` thêm hai dấu cách đứng trước. Đoạn `[text_start, text_end)` SHALL tính theo điểm mã Unicode (chỉ số chuỗi Python của MCP). Nhãn chỉ được ghi khi SHA-256 (UTF-8) của đoạn bằng `label.text_sha256`; nếu không, nhãn SHALL bị bỏ và được đếm `textMismatch`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F362: nhãn chỉ được nhập khi chứng được nó thuộc đúng lời đã lưu.

#### Scenario: Lời có emoji và nhãn sàn
- **WHEN** lời có emoji và `attributes_json` có hai mục, nhãn phủ cả lời
- **THEN** dấu khớp và nhãn được ghi

#### Scenario: Lời đã đổi
- **WHEN** `review.text` khác lời MCP đã gán
- **THEN** nhãn không được ghi và `textMismatch` tăng 1

### Requirement: R-RC07 Nạp lại và chạy thử
Cả lần nạp SHALL là một giao dịch, trừ các nhãn bị bỏ ở R-RC05 và R-RC06. Nạp lại cùng đầu vào SHALL trả `codebookInserted`, `labelsInserted`, `noThemeInserted`, `alreadyPresent` bằng 0. `--dry-run` SHALL giữ nguyên các byte của cơ sở dữ liệu. Tệp kho MCP SHALL chỉ được đọc.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Cùng luật nạp lại của các bộ nạp db-v1 khác.

#### Scenario: Nạp hai lần
- **WHEN** chạy cùng lệnh hai lần
- **THEN** lần hai không thêm dòng nào và số dòng giữ nguyên

#### Scenario: Chạy thử
- **WHEN** chạy với `--dry-run`
- **THEN** kết quả có số dòng sẽ ghi, còn tệp cơ sở dữ liệu giữ nguyên từng byte
