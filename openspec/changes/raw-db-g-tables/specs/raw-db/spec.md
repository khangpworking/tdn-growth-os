## ADDED Requirements

### Requirement: R-GL01 Ba bảng db-v1 cho nguồn Google
Migration 0064 SHALL tạo bảng `search_suggestion`, `ai_overview_block`, `ai_overview_reference` (STRICT, đúng db-v1 §5) với hai thay đổi chủ duyệt: `block_type` chỉ nhận `heading`, `paragraph`, `list_item`; `ai_overview_reference` có cột `snippet`. Migration SHALL NOT chạm bảng đã có. Ba bảng SHALL chỉ cho thêm dòng.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 03/11/2026 chủ duyệt khai báo S19b, S29 và hai thay đổi khuôn (F332).

#### Scenario: Cơ sở dữ liệu mới
- **WHEN** app mở một cơ sở dữ liệu trống và chạy mọi migration
- **THEN** có 3 bảng mới, phiên bản migration là 64, và bảng của 0063 giữ nguyên

#### Scenario: Loại khối lạ
- **WHEN** có lệnh INSERT vào `ai_overview_block` với `block_type = 'list'`
- **THEN** lệnh bị chặn bởi CHECK

#### Scenario: Thêm cột snippet
- **WHEN** đọc cột của `ai_overview_reference`
- **THEN** có cột `snippet` sau `site`

#### Scenario: Sửa một gợi ý đã lưu
- **WHEN** có lệnh UPDATE trên bảng `search_suggestion`
- **THEN** lệnh bị chặn với lỗi `immutable_raw_db_v1_search_suggestion`

### Requirement: R-GL02 Chỉ nạp từ lần thu đã kiểm hoặc từ tệp raw-v1
Với `{ runId }`, bộ nạp SHALL chỉ đọc lần thu của lượt chạy trong `analysis_research_automation_captures` và kho tệp, sau khi kiểm cỡ và dấu SHA-256 của tệp (và dấu phản hồi trong bao thu). Với `{ file, runId }`, tệp SHALL là `raw-v1` hoặc `kem-raw-v1` của đúng nguồn.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Mọi dòng db-v1 phải đến từ byte gốc đã kiểm.

#### Scenario: Lượt chạy không tồn tại
- **WHEN** gọi hàm nạp với một `runId` không có lượt chạy
- **THEN** hàm báo lỗi bắt đầu bằng `RAW_DB_RUN_NOT_FOUND` và không thêm dòng nào

#### Scenario: Tệp lần thu bị sửa
- **WHEN** tệp của một lần thu không còn khớp cỡ hoặc dấu
- **THEN** hàm báo lỗi và không thêm dòng nào

#### Scenario: Tệp sai nguồn
- **WHEN** nạp S29 với tệp S19b
- **THEN** hàm báo lỗi bắt đầu bằng `RAW_DB_FILE_WRONG_SOURCE` và không thêm dòng nào

### Requirement: R-GL03 Ánh xạ gợi ý tìm kiếm S19b
Mỗi lần gọi một tiền tố SHALL thành một dòng `raw_capture` S19b (0 USD). Mỗi gợi ý SHALL thành một dòng `search_suggestion` (`prefix` = phản hồi `[0]`, `suggestion` = `[1][i]`, `rank` = i+1). Danh sách rỗng SHALL cho `EMPTY`, `httpStatus` khác 200 SHALL cho `FAILED`; cả hai không có dòng.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Khai báo S19b chủ duyệt. Gợi ý là ý định tìm: chỉ đọc chủ đề, không đếm.

#### Scenario: Lần thu của lượt chạy
- **WHEN** lượt chạy có lần thu `google.suggest` thứ tự 3 với phản hồi `["kẽm a", ["kẽm amagain", "kẽm ada"]]`
- **THEN** có dòng `raw_capture` `S19b:<runId>:3` (`provider` `google-suggest`, `operation` `google.suggest`), `outcome` `OK`, `http_status` 200, `raw_path = artifact:<dấu>`, `keyword` = từ gốc `kẽm`, và 2 dòng `search_suggestion` hạng 1 và 2

#### Scenario: Tệp kẽm 13
- **WHEN** nạp tệp `13-S19b-goi-y-tim-kiem-google.json` với nhãn `kem-2910`
- **THEN** có 79 dòng `raw_capture` `S19b:<12 ký tự đầu dấu tệp>:<chỉ số>`, 4 dòng `EMPTY`, và 665 dòng `search_suggestion`

### Requirement: R-GL04 Ánh xạ Google AI Overview S29
Mỗi phản hồi `serpapi.google.search` có khoá `ai_overview` (hoặc mỗi bản ghi tệp S29) SHALL thành một dòng `raw_capture` S29. Câu trả lời SHALL lấy từ `text_blocks` của phản hồi đó, hoặc từ phản hồi `serpapi.google_ai_overview` cùng `page_token`; không có thì `outcome` SHALL là `NOT_COLLECTED`. Mỗi ý của khối `list` SHALL là một dòng `list_item`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Khai báo S29 chủ duyệt. Mọi dòng S29 là giả thuyết, mức Yếu, không bao giờ là bằng chứng.

#### Scenario: Câu trả lời có sẵn trong S19
- **WHEN** phản hồi S19 có `ai_overview.text_blocks` gồm một đoạn và một danh sách 3 ý
- **THEN** `raw_capture.operation` là `serpapi.google.search`, `request_params_json.sharedWithS19` là true, và có 4 dòng `ai_overview_block` (`paragraph`, rồi 3 dòng `list_item`) với `block_seq` 0 đến 3

#### Scenario: Câu trả lời lấy theo page_token
- **WHEN** phản hồi S19 chỉ có `page_token` và lượt chạy có phản hồi `google_ai_overview` cùng token
- **THEN** `raw_capture.operation` là `serpapi.google_ai_overview`, `sharedWithS19` là false, `billing` là `PAID_SEARCH_UNLESS_CACHED`, `cost_amount` là NULL, và các dòng lấy từ phản hồi đó

#### Scenario: Loại khối lạ
- **WHEN** câu trả lời có khối loại `table`
- **THEN** hàm báo lỗi `RAW_DB_AIO_UNKNOWN_BLOCK` và không thêm dòng nào

#### Scenario: Token hết hạn
- **WHEN** bản ghi tệp có `aiOverviewState = page_token_expired`
- **THEN** `outcome` là `NOT_COLLECTED` và không có dòng khối hay nguồn

#### Scenario: Nguồn tham khảo
- **WHEN** câu trả lời có `references[]`
- **THEN** mỗi phần tử thành một dòng `ai_overview_reference` với `ref_index` = `.index`, `site` = `.source`, `snippet` = `.snippet`

### Requirement: R-GL05 Nạp trong một giao dịch, nạp lại không nhân đôi
Mỗi lần nạp SHALL chạy trong một giao dịch: lỗi SHALL không để lại dòng nào. Nạp lại cùng đầu vào SHALL trả mọi số đếm bằng 0. Một lần quan sát đã lưu dưới mã khác (cùng nguồn, cùng dấu phản hồi, cùng lúc gọi) SHALL NOT được lưu lại và SHALL được đếm vào `alreadyPresent`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Quy tắc 6 của db-v1: bản đầu tiên được giữ.

#### Scenario: Nạp cùng tệp hai lần
- **WHEN** nạp tệp S29, rồi nạp lại đúng tệp đó với cùng nhãn
- **THEN** lần hai trả `captures`, `rows`, `references`, `notCollected`, `alreadyPresent` bằng 0 và mọi bảng không đổi

#### Scenario: Khối lạ ở bản ghi cuối
- **WHEN** bản ghi cuối của tệp có khối loại `table`
- **THEN** hàm báo lỗi `RAW_DB_AIO_UNKNOWN_BLOCK` và không có dòng nào của các bản ghi trước được lưu

### Requirement: R-GL06 Lệnh nạp S19b và S29
`scripts/raw-db-load.ts` SHALL nhận `--source S19b|S29` với `--run <runId>` (đọc lần thu của lượt chạy, cần `--artifacts`) hoặc `--file <path> --run <nhãn>` (đọc tệp). Lệnh SHALL in một dòng JSON kết quả. `--dry-run` SHALL không đổi cơ sở dữ liệu. `--file` với S05 SHALL thoát mã 2. Hành vi S05 SHALL giữ nguyên.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Nạp chạy tay, kiểm trước bằng chạy thử.

#### Scenario: Chạy thử với tệp
- **WHEN** chạy `scripts/raw-db-load.ts --source S19b --file <tệp 13> --run kem-2910 --dry-run`
- **THEN** lệnh in số dòng sẽ thêm và cơ sở dữ liệu không đổi

#### Scenario: S05 với tệp
- **WHEN** chạy `scripts/raw-db-load.ts --source S05 --run <runId> --file <tệp>`
- **THEN** lệnh thoát mã 2 và không mở cơ sở dữ liệu
