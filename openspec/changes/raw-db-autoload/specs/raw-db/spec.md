## ADDED Requirements

### Requirement: R-RA01 Đánh giá TikTok Shop (S06) vào db-v1
`raw-db-load --source S06 --run <id>` SHALL nạp các lần gọi `kalodata.product.comment.insight` đã lưu của lần chạy qua bộ đọc có kiểm dấu (không có `--file`): một `raw_capture` mỗi lần gọi, một dòng `review` mỗi đánh giá theo cột S06 của KHUON §3, một dòng `run_review` mỗi lần chạy. Cả lần nạp SHALL là một giao dịch.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F368: đánh giá TikTok Shop vào db-v1 để được gán chủ đề.

#### Scenario: Nạp một lần chạy có S06
- **WHEN** lần chạy có lần gọi comment insight thành công với các đánh giá có mã số
- **THEN** `raw_capture` giữ nhà cung cấp, thao tác, kết quả, `billing` như đã lưu và dấu phản hồi
- **AND** mỗi đánh giá có đúng một dòng `review`: `review_key` = `S06:` + `review.review_id`, `platform` `tiktok_shop`, `kind` `product_review`, `text` = `review.display_text` giữ nguyên, `attributes_json` `NULL`, `posted_at` từ `review_timestamp` mili giây sang ISO +07:00, `variation` = `sku_specification`, `like_count` = `digg_count`, `state` `VALID`, `source_position` = `product=<id>,index=<n>`, `product_key` = `tiktok_shop:<product_id>`
- **AND** có một dòng `run_review` của lần chạy

#### Scenario: Nạp lại
- **WHEN** chạy lại cùng lệnh cho cùng lần chạy
- **THEN** mọi số đếm là 0 và không có dòng mới

#### Scenario: Một lần gọi sai
- **WHEN** một lần gọi có artifact không khớp dấu hoặc trả về sản phẩm khác
- **THEN** cả lần nạp dừng và không ghi dòng nào

### Requirement: R-RA02 S06 không lưu người viết
Loader S06 SHALL NOT lưu tên người viết và SHALL NOT tính khoá từ tên hiển thị: `reviewer_name` và `reviewer_key` SHALL là `NULL`; `reviewer_name_state` SHALL là `masked_by_source` khi `is_anonymous` đúng, còn lại `not_provided`. Người viết S06 SHALL được đếm theo đánh giá (view `writer_count`).

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Luật L2 và rà soát Astra: tên hiển thị không phải một người.

#### Scenario: Đánh giá có tên hiển thị
- **WHEN** dòng nguồn có `review_user` (tên hoặc mã ẩn danh)
- **THEN** không cột nào của db-v1 chứa giá trị đó hay giá trị suy ra từ nó

### Requirement: R-RA03 Số sao S06
`rating_star` SHALL là `review.rating` khi đó là số nguyên 1–5 (số hoặc chuỗi chữ số); giá trị khác SHALL thành `NULL` và SHALL được đếm trong `ratingInvalid` của kết quả nạp.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F368, quy tắc sao.

#### Scenario: Sao hợp lệ và không hợp lệ
- **WHEN** các đánh giá có `rating` là `"5"`, `4`, `"4.5"`, `0`, `null`
- **THEN** `rating_star` lần lượt là 5, 4, `NULL`, `NULL`, `NULL` và `ratingInvalid` là 3

### Requirement: R-RA04 Sản phẩm S06 không đoán
Khi `tiktok_shop:<product_id>` chưa có trong `product`, loader SHALL thêm dòng sản phẩm chỉ với tên mà chính lần chạy đã lưu (`kalodata.product.detail` hoặc `kalodata.product.rank`); không có tên thì cả lần nạp SHALL dừng với `RAW_DB_PRODUCT_NAME_MISSING`. Dòng sản phẩm đã có SHALL được dùng lại, không sửa.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F368: không đoán dữ liệu.

#### Scenario: Thiếu tên
- **WHEN** lần chạy không lưu tên của sản phẩm có đánh giá và `product` chưa có sản phẩm đó
- **THEN** lệnh dừng với `RAW_DB_PRODUCT_NAME_MISSING` và không ghi gì

### Requirement: R-RA05 Gán chủ đề cho đánh giá cả hai sàn
Bộ gán SHALL coi đánh giá sản phẩm của `shopee` và `tiktok_shop` là đủ điều kiện (cùng các điều kiện khác của R-RL03) và SHALL gửi Jev nền tảng của chính đánh giá.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F368: đánh giá TikTok Shop cũng có nhãn.

#### Scenario: Đánh giá TikTok Shop chưa có nhãn
- **WHEN** lần chạy có đánh giá S06 có lời và chưa có `review_code` của bản bộ chủ đề
- **THEN** đánh giá được gọi Jev với `Nền tảng: tiktok_shop` và có dòng `review_code` `APP_JEV`

### Requirement: R-RA06 Điểm móc: bước thu xong
Khi `TDN_RAW_DB_AUTOLOAD_ENABLED=true` và app có quyền ghi OWNER, app SHALL chạy chuỗi tự nạp đúng một lần khi bước `COLLECTION` xong với `SUCCEEDED` hoặc `PARTIAL`, sau khi giao dịch đó đã ghi. Kết quả khác của bước thu, hoặc cờ khác `true`, SHALL NOT kích hoạt.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F368, F389; quy tắc điều phối 04/11 (lần chạy thật kết thúc `PARTIAL` rồi `FAILED`).

#### Scenario: Bước thu PARTIAL, báo cáo hỏng
- **WHEN** bước thu xong với `PARTIAL` rồi bước `REPORTS` hỏng với `MARKET_NUMBER_TRACE_BLOCKED`
- **THEN** chuỗi tự nạp chạy một lần, dữ liệu đã nạp giữ nguyên, và bước `REPORTS` không bị chuỗi nạp đổi

#### Scenario: Cờ tắt
- **WHEN** cờ không đặt và bước thu xong
- **THEN** không có dòng `raw_db_autoload` và db-v1 không đổi

#### Scenario: Bước thu hỏng
- **WHEN** bước thu xong với `FAILED`, `UNAVAILABLE`, `CANCELLED` hoặc bị bỏ
- **THEN** chuỗi tự nạp không chạy

### Requirement: R-RA07 Chuỗi tự nạp
Chuỗi tự nạp SHALL chạy theo thứ tự S05, S06, S07, S02b, S14, S19b, S29, mỗi nguồn chỉ khi lần chạy có dữ liệu của nguồn đó, bằng bộ nạp `--run` sẵn có, rồi gán chủ đề cho đánh giá sản phẩm của lần chạy (nhiều nhất `limits.maxCallsPerRun` lần gọi Jev). Một nguồn lỗi SHALL NOT dừng nguồn sau.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F389: cả 7 nguồn db-v1 tự nạp; KHUON §5.0.

#### Scenario: Một nguồn lỗi
- **WHEN** S02b lỗi
- **THEN** S14, S19b, S29 và việc gán vẫn chạy, và kết quả S02b ghi `FAILED` kèm mã lỗi

#### Scenario: Thiếu khoá riêng tư
- **WHEN** không có tệp khoá
- **THEN** S07, S02b, S14 (đọc khoá như CLI) là `SKIPPED_NO_PRIVACY_KEY` và các nguồn khác vẫn nạp

#### Scenario: Jev tắt hoặc lượt gán bận
- **WHEN** Jev tắt, hoặc một lượt gán khác giữ khoá
- **THEN** các nguồn vẫn nạp và `labelling` là `SKIPPED_JEV_DISABLED`, hoặc `LABELS_BUSY`

### Requirement: R-RA08 Không đổi lần chạy
Chuỗi tự nạp SHALL NOT đổi trạng thái, kết quả, báo cáo hay giờ chạy của lần chạy và của bước báo cáo: nó chạy sau khi lần chạy đã chuyển sang dựng báo cáo, trên kết nối riêng, và mọi lỗi SHALL được bắt và ghi lại.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F368.

#### Scenario: Chuỗi nạp ném lỗi
- **WHEN** mọi bộ nạp đều lỗi
- **THEN** lần chạy vẫn dựng báo cáo và kết thúc như khi không có cờ

### Requirement: R-RA09 Bảng raw_db_autoload
Migration 0070 SHALL thêm bảng `raw_db_autoload` (STRICT, chỉ thêm, trigger cấm sửa, cấm xoá) và mỗi lần thử SHALL ghi một dòng: `run_id`, `origin` (`APP` hoặc `CLI`), `started_at`, `finished_at`, một JSON cho mỗi nguồn (`s05`, `s06`, `s07`, `s02b`, `s14`, `s19b`, `s29`) và `labelling`. Bảng khác SHALL NOT đổi.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F368: kết quả từng nguồn ghi riêng.

#### Scenario: Sửa dòng
- **WHEN** có lệnh UPDATE hoặc DELETE trên `raw_db_autoload`
- **THEN** lệnh bị chặn với lỗi `immutable_raw_db_autoload`

### Requirement: R-RA10 Lệnh AUTOLOAD và bản chụp
`raw-db-load --source AUTOLOAD --run <id> [--dry-run]` SHALL chạy cùng chuỗi bằng tay; `--dry-run` SHALL không ghi gì và không gọi Jev. Sau mỗi lần thử thật, app SHALL chép bản chụp `app-db.snapshot.sqlite`; app đang chạy (có quyền ghi, khi bật cờ) SHALL chép bản chụp mỗi 10 phút, bỏ lượt khi đang chép, và không bao giờ ném lỗi.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F368: lần chạy cũ và thử lại; MCP Insight thấy dữ liệu mới.

#### Scenario: Thử lại bằng tay
- **WHEN** lần tự nạp trước ghi `LABELS_BUSY` và chạy `--source AUTOLOAD --run <id>`
- **THEN** các nguồn đã nạp ra số 0, các đánh giá chưa có nhãn được gán, và có thêm một dòng `raw_db_autoload` `origin` `CLI`
