## ADDED Requirements

### Requirement: R-VR02 Bảng video_reading và video_segment của db-v1
Migration 0067 SHALL tạo bảng `video_reading` và `video_segment` (STRICT, đúng db-v1 §4.1 và §5), SHALL NOT chạm bảng đã có. Hai bảng SHALL chỉ cho thêm dòng và SHALL NOT có cột giọng, nguồn gốc, loại video hay «có nói về sản phẩm».

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F354, F356: không lưu nhận định của AI.

#### Scenario: Khoá và giá trị cho phép
- **WHEN** đọc cấu trúc hai bảng
- **THEN** `video_reading` có khoá `capture_id` (→ `raw_capture`), `video_url` → `video`, `origin` chỉ nhận `SELECTION`, `TOP_SELLING`, `EXPANDED_SEARCH`, `caption_source` chỉ nhận `NATIVE_SUBTITLE`, `MODEL_TRANSCRIBED`; `video_segment` có khoá (`capture_id`, `segment_type`, `seq`) và `segment_type` chỉ nhận `speech`, `on_screen`

#### Scenario: Cơ sở dữ liệu mới
- **WHEN** app mở một cơ sở dữ liệu trống và chạy mọi migration
- **THEN** có bảng `video_reading` và `video_segment`, phiên bản migration là 67, và bảng của 0063 đến 0066 giữ nguyên

#### Scenario: Sửa một dòng đã lưu
- **WHEN** có lệnh UPDATE hoặc DELETE trên `video_reading` hoặc `video_segment`
- **THEN** lệnh bị chặn với lỗi `immutable_raw_db_v1_video_reading` hoặc `immutable_raw_db_v1_video_segment`

### Requirement: R-VR03 Ánh xạ một lần đọc
Mỗi lần đọc SHALL thành một dòng `video_reading` theo db-v1 §4.1. Mỗi phần tử `segments[]` SHALL thành một dòng `speech`, mỗi phần tử `onScreenText[]` một dòng `on_screen`, `seq` từ 0, `text` giữ nguyên. Mọi lần đọc SHALL được nạp, dù app đánh giá thế nào.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F349 (chữ đúng như đọc), F354, F356 (không lọc theo AI).

#### Scenario: Cột của một lần đọc
- **WHEN** một lần đọc được nạp
- **THEN** `origin` = `video.origin`, `duration_s` = `video.durationSeconds`, `caption_source` = `captionSource`, `model_id` = `model.modelId`, `media_sha256` = `media.sha256`, `media_bytes` = `media.byteSize`, `read_at` = `media.downloadedAt` như đã lưu

#### Scenario: Tệp kẽm 04
- **WHEN** nạp tệp `data/raw-sources/kem-2910/04-S14-video-ban-hang-loi-noi.json`
- **THEN** có 3 dòng `video_reading`, 82 dòng `speech` và 28 dòng `on_screen`

#### Scenario: Video không nói về sản phẩm
- **WHEN** một lần đọc có `video.aboutProduct` = false
- **THEN** lần đọc đó vẫn có dòng `video_reading` và các dòng `video_segment`

### Requirement: R-VR04 raw_capture của S14 và ghép lần đọc
Mỗi lần gọi Gemini `videowatch.generate` SHALL thành một dòng `raw_capture` `S14`. Một lần đọc SHALL thuộc lần gọi thành công có mã băm câu trả lời bằng `model.responseSha256` của nó; không ghép được thì cả lần nạp SHALL hỏng (`RAW_DB_S14_INVALID_ROW`).

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Mọi dòng trỏ về đúng một lần gọi nguồn (db-v1 §2.1).

#### Scenario: Cột của lần gọi
- **WHEN** một lần gọi được nạp
- **THEN** `provider` là `gemini`, `request_params_json` là `requestParameters` của lần gọi (mô hình, loại tệp, cỡ và mã băm), `billing` như đã lưu, `cost_unit` và `cost_amount` là `NULL`

#### Scenario: Mã capture
- **WHEN** nạp bản ghi lần gọi thứ 3 của một tệp, hoặc capture thứ tự 7 của lần chạy R
- **THEN** `capture_id` là `S14:<12 ký tự đầu sha256 của tệp>:3`, hoặc `S14:R:7`

#### Scenario: Lần đọc không có lần gọi
- **WHEN** `model.responseSha256` của một lần đọc không bằng mã băm câu trả lời của lần gọi nào
- **THEN** lần nạp báo `RAW_DB_S14_INVALID_ROW` và không ghi gì

### Requirement: R-VR05 Dòng video của S14 không đoán sản phẩm
Video đã có (cùng `video_id`) SHALL được dùng lại, không sửa. Video chưa có SHALL được thêm với `link_basis` `UNKNOWN`, `product_key` `NULL` và `author_key` của S07. Từ lượt chạy, video `TOP_SELLING` chưa có dòng `video` SHALL làm cả lần nạp hỏng (`RAW_DB_S14_LOAD_S02B_FIRST`).

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Dòng `video` không sửa được; nạp S14 trước S02b làm mất nối sản phẩm.

#### Scenario: Video mới
- **WHEN** nạp tệp kẽm 04 vào cơ sở dữ liệu chưa có video nào
- **THEN** có 3 dòng `video` `UNKNOWN`, `product_key` `NULL`, `author_key` = HMAC video-author-handle của S07 (cùng hàm, cùng khoá)

#### Scenario: Video đã có từ S02b
- **WHEN** một video bán chạy đã có dòng `video` từ S02b (`PROVIDER_LINK`)
- **THEN** `video_reading` dùng link đó và bảng `video` không thêm dòng

#### Scenario: Video bán chạy chưa nạp S02b
- **WHEN** nạp lượt chạy R có lần đọc `TOP_SELLING` mà video chưa có dòng `video`
- **THEN** lần nạp báo `RAW_DB_S14_LOAD_S02B_FIRST` với lời nhắc nạp S02b trước, và không ghi gì

#### Scenario: Thiếu khoá
- **WHEN** không có `--privacy-file` và không có biến `TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE`
- **THEN** lần nạp báo `RAW_DB_PRIVACY_KEY_MISSING` trước khi đọc đầu vào

### Requirement: R-VR06 Chỉ đọc đầu vào đã kiểm, nạp lại không nhân đôi
Với lần chạy, bộ nạp SHALL chỉ đọc gói đọc video và capture qua bộ đọc đã kiểm của app. Một lần nạp SHALL là một giao dịch. Nạp lại cùng đầu vào SHALL cho mọi số đếm bằng 0. Cùng video đọc ở lần chạy khác SHALL là dòng `video_reading` mới.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Cùng cách với bộ nạp S07, S02b và Google.

#### Scenario: Đọc lại ở lần chạy khác
- **WHEN** cùng một video được đọc ở lần chạy R1 và R2 và cả hai lần chạy được nạp
- **THEN** có hai dòng `video_reading` (hai lần gọi khác nhau) và một dòng `video`

#### Scenario: Nạp lại
- **WHEN** cùng một tệp được nạp hai lần
- **THEN** lần thứ hai trả `captures`, `readings`, `readingsAlreadyPresent`, `videosInserted`, `segments` đều bằng 0

#### Scenario: Lần chạy không có lần đọc
- **WHEN** lần chạy không có gói đọc video nào
- **THEN** lần nạp báo `RAW_DB_RUN_NOT_FOUND`

#### Scenario: Gói đọc bị sửa
- **WHEN** gói đọc video của lần chạy không khớp mã băm đã ghi
- **THEN** lần nạp báo `RAW_DB_ARTIFACT_MISMATCH` và không ghi gì

### Requirement: R-VR07 Lệnh nạp S14
`scripts/raw-db-load.ts` SHALL nhận `--source S14` với `--run`, `--file`, `--privacy-file`, `--dry-run`. `--dry-run` SHALL in số đếm và giữ nguyên byte của tệp cơ sở dữ liệu. Lệnh SHALL NOT in khoá hay muối.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Cùng lệnh với các nguồn đã có; chủ chạy tay.

#### Scenario: Chạy thử tệp kẽm
- **WHEN** lệnh chạy `--source S14 --run kem-2910 --file <tệp kẽm 04> --privacy-file <tệp khoá> --dry-run` trên cơ sở dữ liệu đã migrate
- **THEN** lệnh in `{"captures":3,"readings":3,"readingsAlreadyPresent":0,"videosInserted":3,"segments":110,...}` và byte của tệp cơ sở dữ liệu không đổi
