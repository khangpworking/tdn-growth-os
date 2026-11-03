## ADDED Requirements

### Requirement: R-KV01 Yêu cầu video.rank đủ trường bắt buộc
Mỗi yêu cầu `kalodata.video.rank` cho một sản phẩm SHALL có `region` VN, `language` vi-VN, `currency` VND, `product_id`, `date_range` là kỳ xếp hạng sản phẩm của cùng lần chạy, và `sort_field` doanh thu giảm dần. Capture SHALL ghi `queryWindow` là kỳ đó. Không có kỳ thì SHALL NOT gọi. Cờ, giới hạn và nhãn S14 giữ nguyên.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Lần chạy f0f4799a bị từ chối cả 3 lần (mã 501) vì thiếu các trường này, nên 0 video.

#### Scenario: Yêu cầu cho một sản phẩm
- **WHEN** app tìm video bán chạy cho một sản phẩm của lần chạy có kỳ xếp hạng 2026-09-26~2026-10-25
- **THEN** thân yêu cầu là `{region:'VN', language:'vi-VN', currency:'VND', product_id, date_range:'2026-09-26~2026-10-25', sort_field:{field:'revenue', type:'DESC'}, page_size:10, page_number:1}` và capture có `queryWindow` cùng kỳ

#### Scenario: Không có kỳ xếp hạng
- **WHEN** lần chạy không có thẻ sản phẩm Kalodata mang kỳ xếp hạng
- **THEN** không có yêu cầu `kalodata.video.rank` nào được gửi

### Requirement: R-KV02 Bảng video_snapshot của db-v1
Migration 0066 SHALL tạo bảng `video_snapshot` (STRICT, đúng db-v1 §4.1b và §5): khoá (`capture_id`, `video_url`), `source_code` chỉ nhận `S02b`, `precision` chỉ nhận `provider_estimate`, `is_ad` và `is_ai_video` chỉ nhận 0, 1 hoặc `NULL`. Migration SHALL NOT chạm bảng đã có. Bảng SHALL chỉ cho thêm dòng.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F347: số theo từng video có mã nguồn S02b và chỗ lưu riêng.

#### Scenario: Cơ sở dữ liệu mới
- **WHEN** app mở một cơ sở dữ liệu trống và chạy mọi migration
- **THEN** có bảng `video_snapshot`, phiên bản migration là 66, và bảng của 0063 đến 0065 giữ nguyên

#### Scenario: Sửa một dòng đã lưu
- **WHEN** có lệnh UPDATE hoặc DELETE trên bảng `video_snapshot`
- **THEN** lệnh bị chặn với lỗi `immutable_raw_db_v1_video_snapshot`

### Requirement: R-KV03 Ánh xạ một dòng xếp hạng
Mỗi dòng trong `data[]` SHALL thành đúng một dòng `video_snapshot` theo db-v1 §4.1b: `rank` từ 1, kỳ lấy từ `date_range` của yêu cầu, `title` giữ nguyên từng ký tự. Số SHALL hữu hạn và ≥ 0 (`revenue_growth_rate` có thể âm); giá trị không phải số SHALL thành `NULL`, không bao giờ thành 0.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F349: tên video lưu đúng như nguồn. `NULL` không có nghĩa là 0 (db-v1 §1).

#### Scenario: Doanh thu không phải số
- **WHEN** một dòng có `revenue` là chuỗi `"n/a"`
- **THEN** `revenue_vnd` của dòng đó là `NULL`

#### Scenario: Ngày đăng đúng dạng
- **WHEN** một dòng có `publish_date` = `2025/12/11 16:13:56`
- **THEN** `published_at` là `2025-12-11T16:13:56+07:00`

#### Scenario: Ngày đăng sai dạng
- **WHEN** một dòng có `publish_date` không theo `YYYY/MM/DD HH:MM:SS`
- **THEN** `published_at` là `NULL` và các cột khác vẫn được lưu

### Requirement: R-KV04 Người làm video chỉ là mã băm
`video_url` SHALL là `https://www.tiktok.com/@<handle>/video/<video_id>` và `author_key` SHALL là HMAC video-author-handle của S07 (cùng hàm, cùng khoá). Mã người làm video, handle và `creator_debut` SHALL NOT nằm trong cột nào. Dòng thiếu `video_id` số hoặc handle thường SHALL làm cả lần nạp hỏng (`RAW_DB_S02B_INVALID_ROW`).

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Cùng quy tắc riêng tư với S07; handle chỉ nằm trong link công khai của video.

#### Scenario: Cùng handle với S07
- **WHEN** S02b và S07 băm cùng một handle với cùng khoá
- **THEN** hai `author_key` giống nhau

#### Scenario: Thiếu khoá
- **WHEN** không có `--privacy-file` và không có biến `TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE`
- **THEN** lần nạp báo `RAW_DB_PRIVACY_KEY_MISSING` trước khi đọc đầu vào

#### Scenario: Dòng thiếu handle
- **WHEN** một dòng không có `belonged_creator_handle`
- **THEN** lần nạp báo `RAW_DB_S02B_INVALID_ROW` và không có dòng nào được ghi

### Requirement: R-KV05 Nối video với sản phẩm không đoán
Lần gọi có `product_id` SHALL nối video với `tiktok_shop:<product_id>` bằng `PROVIDER_LINK`. Thiếu dòng `product` thì bộ nạp SHALL thêm dòng tối thiểu chỉ khi cùng đầu vào có tên sản phẩm; không có tên thì video SHALL là `UNKNOWN`. Lần gọi theo từ khoá SHALL cho `UNKNOWN`. Video đã có (cùng `video_id`) SHALL được dùng lại, không sửa.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: db-v1 §4.1a: chỉ nối khi nguồn ghi rõ sản phẩm; bản đầu tiên thắng.

#### Scenario: Sản phẩm chưa có, có tên
- **WHEN** bản ghi tệp có `productName` hoặc lần chạy có `kalodata.product.rank` / `kalodata.product.detail` thành công nêu tên sản phẩm đó
- **THEN** bảng `product` có thêm `tiktok_shop:<product_id>` với tên đó và video là `PROVIDER_LINK`

#### Scenario: Sản phẩm chưa có, không có tên
- **WHEN** cùng đầu vào không nêu tên sản phẩm
- **THEN** không thêm dòng `product` và video là `UNKNOWN`

#### Scenario: Lần gọi theo từ khoá
- **WHEN** yêu cầu không có `product_id`
- **THEN** video của lần gọi đó có `link_basis` = `UNKNOWN` và `product_key` là `NULL`

#### Scenario: Video đã có từ S07
- **WHEN** một `video_id` đã có trong `video` dưới link khác
- **THEN** `video_snapshot` dùng link đã có và bảng `video` không thêm dòng

### Requirement: R-KV06 raw_capture của S02b
Mỗi lần gọi `kalodata.video.rank` (bản ghi tệp hoặc capture của lần chạy) SHALL thành một dòng `raw_capture` `S02b`, `provider` `kalodata`, `outcome` `OK`, `EMPTY` (0 dòng) hoặc `FAILED` (nguồn từ chối), `cost_unit` `kalodata_points`, `cost_amount` `NULL`. Thao tác khác SHALL bị bỏ qua.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Mọi dòng trỏ về đúng một lần gọi nguồn (db-v1 §2.1).

#### Scenario: Mã capture
- **WHEN** nạp bản ghi thứ 3 của một tệp, hoặc capture thứ tự 7 của lần chạy R
- **THEN** `capture_id` là `S02b:<12 ký tự đầu sha256 của tệp>:3`, hoặc `S02b:R:7`

#### Scenario: Bản ghi số dư
- **WHEN** tệp có bản ghi `kalodata.credit.balance`
- **THEN** bản ghi đó không thành dòng nào

#### Scenario: Lần gọi bị từ chối
- **WHEN** đầu vào có một lần gọi trả `success: false` mã 501
- **THEN** có một dòng `raw_capture` `FAILED` và không có dòng `video` hay `video_snapshot` nào từ lần gọi đó

### Requirement: R-KV07 Chỉ đọc đầu vào đã kiểm, nạp lại không nhân đôi
Với lần chạy, bộ nạp SHALL chỉ đọc capture qua bộ đọc đã kiểm (kích thước, mã băm, envelope khớp dòng capture). Một lần nạp SHALL là một giao dịch. Nạp lại cùng đầu vào SHALL cho mọi số đếm bằng 0. `--dry-run` SHALL giữ nguyên byte của cơ sở dữ liệu. `run_review` SHALL NOT được dùng.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Cùng cách với bộ nạp S07 và Google; không đọc artifact chưa kiểm.

#### Scenario: Nạp lại
- **WHEN** cùng một tệp được nạp hai lần
- **THEN** lần thứ hai trả `captures`, `videos`, `videosAlreadyPresent`, `snapshots`, `productsInserted` đều bằng 0

#### Scenario: Lần chạy không có video.rank
- **WHEN** lần chạy không có capture `kalodata.video.rank`
- **THEN** lần nạp báo `RAW_DB_RUN_NOT_FOUND`

#### Scenario: Chạy thử
- **WHEN** lệnh chạy với `--dry-run`
- **THEN** số đếm được in ra và byte của tệp cơ sở dữ liệu không đổi

#### Scenario: Artifact bị sửa
- **WHEN** artifact của một capture không khớp kích thước hoặc mã băm đã ghi
- **THEN** lần nạp báo `RAW_DB_ARTIFACT_MISMATCH` và không ghi gì
