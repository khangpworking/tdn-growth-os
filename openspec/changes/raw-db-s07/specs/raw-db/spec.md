## ADDED Requirements

### Requirement: R-TC01 Bảng video của db-v1
Migration 0065 SHALL tạo bảng `video` (STRICT, đúng db-v1 §5): khoá `video_url`, `link_basis` chỉ nhận `PROVIDER_LINK`, `SELECTED_FROM_PRODUCT`, `UNKNOWN`, và `product_key` SHALL có khi `link_basis` khác `UNKNOWN`. Migration SHALL NOT chạm bảng đã có. Bảng SHALL chỉ cho thêm dòng.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F336 ngày 03/11/2026: làm bảng và bộ nạp S07 ngay.

#### Scenario: Cơ sở dữ liệu mới
- **WHEN** app mở một cơ sở dữ liệu trống và chạy mọi migration
- **THEN** có bảng `video`, phiên bản migration là 65, và bảng của 0063, 0064 giữ nguyên

#### Scenario: Nối sản phẩm không có sản phẩm
- **WHEN** có lệnh INSERT vào `video` với `link_basis = 'PROVIDER_LINK'` và `product_key` là `NULL`
- **THEN** lệnh bị chặn bởi CHECK

#### Scenario: Sửa một video đã lưu
- **WHEN** có lệnh UPDATE trên bảng `video`
- **THEN** lệnh bị chặn với lỗi `immutable_raw_db_v1_video`

### Requirement: R-TC02 Mã người viết chỉ là mã băm
`reviewer_key` SHALL là HMAC-SHA256(khoá, `"tdn:tiktok.com:author:v1\0"` + `uid`) dạng hex, trùng từng byte với mã băm của bộ thu app cho cùng khoá và `uid`; `NULL` khi `uid` thiếu hoặc không phải số. `reviewer_name` SHALL là `NULL`, `reviewer_name_state` SHALL là `not_provided`. Không lưu tên người dùng ở đâu cả.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ chọn F335 (a). Cùng một người viết dưới nhiều video có cùng mã, không cần tên.

#### Scenario: Cùng khoá, cùng uid
- **WHEN** bộ thu app và bộ nạp băm cùng một `uid` số với cùng khoá
- **THEN** hai mã băm giống nhau

#### Scenario: uid không phải số
- **WHEN** một bình luận có `uid` là `anon-…`
- **THEN** `reviewer_key` của dòng đó là `NULL`

### Requirement: R-TC03 Thiếu khoá thì không nạp
Bộ nạp S07 SHALL đọc khoá từ tệp khoá riêng (`--privacy-file`, nếu không có thì biến `TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE`; tệp JSON mode 600). Không có khoá SHALL báo lỗi `RAW_DB_PRIVACY_KEY_MISSING` trước khi đọc đầu vào và không ghi gì, kể cả khi `--dry-run`. Khoá, `uid` gốc và tên người dùng SHALL NOT được in ra.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Mã băm không có khoá thì không dùng được và không được tự sinh khoá.

#### Scenario: Không có tệp khoá
- **WHEN** chạy `raw-db-load --source S07` không có `--privacy-file` và không có biến môi trường
- **THEN** lệnh báo `RAW_DB_PRIVACY_KEY_MISSING` và cơ sở dữ liệu không đổi

### Requirement: R-TC04 Ánh xạ bình luận vào review
Mỗi bình luận SHALL thành một dòng `review` (`S07:<cid>`, `tiktok`, `video_comment`, `product_key` `NULL`, `state` `VALID`) với `text` đã che bằng `sanitizeTikTokCommentText`, `posted_at` theo +07:00, `source_position` = `video=<id>,index=<n>`. Bình luận có `cid` sai hoặc nằm dưới video không được chọn SHALL làm hỏng cả lần nạp (`RAW_DB_S07_INVALID_ROW`).

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: db-v1 §3. Lời khách đã che liên hệ trước khi vào cơ sở dữ liệu.

#### Scenario: Tệp kẽm 17
- **WHEN** nạp tệp `17-S07-tiktok-binh-luan.json` với nhãn `kem-2910`
- **THEN** có 1 dòng `raw_capture`, 5 dòng `video` và 262 dòng `review`

#### Scenario: Bình luận dưới video lạ
- **WHEN** một bình luận có `videoWebUrl` không nằm trong danh sách video được chọn
- **THEN** hàm báo lỗi bắt đầu bằng `RAW_DB_S07_INVALID_ROW` và không thêm dòng nào

### Requirement: R-TC05 Video không đoán sản phẩm
Mỗi link video của đầu vào SHALL thành một dòng `video` (`video_id` là số cuối link, `author_key` = HMAC của handle trong link với miền `video-author-handle`). `link_basis` SHALL là `UNKNOWN` và `product_key` `NULL`, trừ khi lựa chọn đã lưu ghi rõ sản phẩm và sản phẩm đó đã có trong `product`. Dòng `video` đã có SHALL giữ nguyên.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: db-v1 §4.1a: khi `UNKNOWN` thì không đếm bình luận theo sản phẩm hay thương hiệu.

#### Scenario: Video của bộ kẽm
- **WHEN** nạp tệp kẽm 17
- **THEN** cả 5 dòng `video` có `link_basis` `UNKNOWN` và `product_key` `NULL`

### Requirement: R-TC06 Chỉ đọc đầu vào đã kiểm, nạp lại không nhân đôi
Với `{ runId }`, bộ nạp SHALL đọc gói bình luận P9 của lượt chạy qua bộ đọc đã kiểm của app; lượt chạy không có S07 SHALL báo `RAW_DB_RUN_NOT_FOUND`. Với `{ file, runId }`, tệp SHALL là `kem-raw-v1` hoặc `raw-v1` S07. Mọi dòng SHALL ghi trong một giao dịch. Bình luận đã lưu SHALL NOT bị ghi lại; lần nạp thứ hai cùng đầu vào SHALL đếm 0.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Mọi dòng db-v1 phải đến từ byte gốc đã kiểm; bản đầu tiên thắng.

#### Scenario: Lượt chạy không có S07
- **WHEN** gọi hàm nạp với một `runId` không có gói bình luận S07
- **THEN** hàm báo lỗi bắt đầu bằng `RAW_DB_RUN_NOT_FOUND` và không thêm dòng nào

#### Scenario: Nạp lại
- **WHEN** nạp cùng tệp kẽm 17 hai lần
- **THEN** lần thứ hai trả về 0 ở mọi số đếm
