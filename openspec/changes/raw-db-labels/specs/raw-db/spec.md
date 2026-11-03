## ADDED Requirements

### Requirement: R-RL01 review_code nhận nhãn do app gán
Migration 0069 SHALL cho `review_code.origin` nhận `MCP_IMPORT` hoặc `APP_JEV`, SHALL giữ mọi dòng đã có, khoá chính, hai khoá ngoại, chỉ mục `review_code_by_theme`, các ràng buộc của 0068 và trigger cấm sửa, cấm xoá. Bảng khác SHALL NOT đổi.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F366: app gán nhãn và ghi vào cơ sở dữ liệu app.

#### Scenario: Nâng cấp cơ sở dữ liệu có nhãn MCP
- **WHEN** cơ sở dữ liệu ở bản 68 có dòng `review_code` `MCP_IMPORT` và chạy migration 0069
- **THEN** mọi dòng giữ nguyên, phiên bản migration là 69, số bảng không đổi, và `origin` nhận `APP_JEV` nhưng không nhận giá trị khác

#### Scenario: Vẫn cấm sửa, xoá
- **WHEN** có lệnh UPDATE hoặc DELETE trên `review_code` sau 0069
- **THEN** lệnh bị chặn với lỗi `immutable_raw_db_v1_review_code`

### Requirement: R-RL02 Cùng nhãn như MCP Insight
Với cùng đầu vào (lời, tên sản phẩm, từ khoá và danh mục đã áp dụng của lần chạy, tệp chủ đề) và cùng câu trả lời của Jev, app SHALL gửi đúng thân yêu cầu MCP gửi và SHALL ra đúng nhãn và mã lỗi MCP ra.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F366: nhãn của app và của MCP phải so được với nhau.

#### Scenario: Lời gửi Jev
- **WHEN** đánh giá có `text` và danh sách `attributes_json`
- **THEN** lời gửi Jev là `text` rồi mỗi mục thêm hai dấu cách đứng trước, và thân yêu cầu bằng `_wire_body` của MCP

#### Scenario: Chọn khối
- **WHEN** lần chạy có danh mục nằm trong `categoryLabels` của một khối, hoặc có từ khoá chứa một từ khoá của khối như một từ trọn vẹn
- **THEN** khối theo danh mục được chọn trước; nếu không, từ khoá khớp dài nhất thắng, bằng nhau thì khối đứng trước thắng; không khớp thì chỉ hỏi chủ đề lõi

#### Scenario: Nhãn từ một câu trả lời
- **WHEN** Jev trả xác suất cho mỗi chủ đề đã hỏi
- **THEN** `p_yes` = tổng `CO_KHEN`, `CO_CHE`, `CO_KE` làm tròn 9 chữ số; dưới ngưỡng `unclear` thì không có nhãn; từ ngưỡng `keep` là `kept`, còn lại `unclear`; hướng là lựa chọn lớn nhất nếu đạt ngưỡng `direction`, không thì `khong_ro_huong`

#### Scenario: Câu trả lời sai
- **WHEN** Jev trả mã HTTP khác 200, thân không phải JSON, mô hình khác, thiếu hoặc thừa chủ đề, xác suất lệch tổng quá dung sai, hoặc lựa chọn lạ
- **THEN** lần gọi lỗi với mã của MCP: `JEV_THEME_UNAVAILABLE` (lỗi đường truyền, mã HTTP, JSON) hoặc `JEV_THEME_INVALID` (nội dung)

### Requirement: R-RL03 Đánh giá đủ điều kiện và không trả tiền hai lần
Một đánh giá SHALL đủ điều kiện khi là đánh giá sản phẩm Shopee (`platform = 'shopee'`, `kind = 'product_review'`), lời gửi Jev không trống và chưa có dòng `review_code` nào của bản bộ chủ đề hiện tại, bất kể `origin`. App SHALL NOT gọi Jev cho đánh giá không đủ điều kiện.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F367: nhãn của cùng đánh giá và cùng bản bộ chủ đề không bao giờ trả tiền hai lần.

#### Scenario: Đã có nhãn MCP
- **WHEN** đánh giá đã có dòng `MCP_IMPORT` của bản hiện tại
- **THEN** không gọi Jev cho đánh giá đó

#### Scenario: Lời trống hoặc không phải Shopee
- **WHEN** đánh giá có lời trống (kể cả `attributes`), hoặc là bình luận TikTok
- **THEN** không gọi Jev cho đánh giá đó

### Requirement: R-RL04 Dòng được ghi
Mỗi nhãn SHALL thành một dòng `review_code` với `origin` = `APP_JEV` và `import_sha256` = SHA-256 nguyên văn phản hồi của Jev; nguyên văn đó SHALL được lưu trong kho tệp theo dấu của app. Đánh giá được trả lời mà không có chủ đề nào SHALL có một dòng `NO_THEME`. Bộ chủ đề chưa có SHALL được thêm vào `codebook` theo R-RC03.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F366; mỗi nhãn có bằng chứng tra lại được.

#### Scenario: Cột của một nhãn
- **WHEN** một nhãn được ghi
- **THEN** `coder` = mã mô hình Jev, `confidence` = `p_yes`, `journey_step` = `Sau mua`, `text_sha256` = SHA-256 của cả lời đã gửi, `coded_at` = lúc gọi, `block_key` = khối đã chọn

#### Scenario: Một đánh giá có hai chủ đề
- **WHEN** câu trả lời cho hai chủ đề đạt ngưỡng
- **THEN** có hai dòng `APP_JEV` cùng `import_sha256`, và kho tệp có tệp mang dấu đó

#### Scenario: Không có chủ đề
- **WHEN** mọi chủ đề dưới ngưỡng `unclear`
- **THEN** có đúng một dòng `NO_THEME` với `polarity`, `journey_step`, `confidence` là `NULL`

### Requirement: R-RL05 Một lần gọi cho một đánh giá, giới hạn và lỗi
Mỗi đánh giá SHALL được hỏi bằng một lần gọi Jev và các dòng của nó SHALL được ghi trong một giao dịch sau khi câu trả lời đã được kiểm. Một lượt gán SHALL gọi nhiều nhất `limits.maxCallsPerRun` lần, hoặc `--max-calls` nếu nhỏ hơn. Một lần gọi lỗi SHALL không ghi gì cho đánh giá đó và SHALL dừng lượt; đánh giá đã ghi SHALL được giữ.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F366, F367; giống cách dừng của MCP.

#### Scenario: Lần gọi thứ ba lỗi
- **WHEN** lượt có năm đánh giá đủ điều kiện và lần gọi thứ ba lỗi
- **THEN** hai đánh giá đầu có dòng, đánh giá thứ ba không có dòng nào, không gọi thêm, `failed.code` là mã lỗi, và lượt sau gán ba đánh giá còn lại

#### Scenario: Giới hạn
- **WHEN** `--max-calls 2` và có năm đánh giá đủ điều kiện
- **THEN** có đúng hai lần gọi và `skipped` = 3

#### Scenario: Kết quả
- **WHEN** một lượt gán kết thúc
- **THEN** kết quả có `eligible`, `called`, `labelled`, `noTheme`, `rowsInserted`, `failed` (`null` hoặc `{ code, reviewKey }`) và `skipped` (đủ điều kiện mà chưa gọi)

### Requirement: R-RL06 Khi nào gán
`raw-db-load --source S05` nạp thật SHALL gán các đánh giá đủ điều kiện của lần chạy đó sau khi giao dịch nạp đã ghi xong, trừ khi có `--no-label`. Jev tắt, thiếu khoá hay việc gán lỗi SHALL không làm hỏng việc nạp. `raw-db-load --source LABELS [--run <id>] [--max-calls N] [--dry-run]` SHALL gán các đánh giá đủ điều kiện của một lần chạy hoặc mọi lần chạy.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F366 phương án A: gán tự động ngay sau khi nạp.

#### Scenario: Jev tắt
- **WHEN** nạp S05 thật khi `TDN_RESEARCH_JEV_ENABLED` không bằng `true`
- **THEN** đánh giá được nạp, lệnh thành công và kết quả có `labelling: SKIPPED_JEV_DISABLED`

#### Scenario: Lập kế hoạch
- **WHEN** chạy `--source LABELS --dry-run`
- **THEN** kết quả có số đủ điều kiện và số sẽ gọi, không có lần gọi mạng nào, và dấu SHA-256 của tệp cơ sở dữ liệu không đổi

#### Scenario: Gán lỗi khi nạp
- **WHEN** nạp S05 thật và lần gọi Jev đầu tiên lỗi
- **THEN** đánh giá được nạp, lệnh thành công, và phần `labelling` của kết quả ghi `failed` và số đã gán

### Requirement: R-RL07 Nhập CODES theo cả đánh giá
Lệnh nhập `CODES` SHALL ghi mọi dòng của một đánh giá hoặc không ghi dòng nào. Một nhãn bị bỏ (R-RC05, R-RC06) thì mọi nhãn và dòng `NO_THEME` của đánh giá đó SHALL bị bỏ, và đánh giá SHALL được đếm một lần trong `reviewsSkipped` kèm lý do. Nhãn sai bằng chứng SHALL NOT biến đánh giá thành `NO_THEME`. Điều này thay phần bỏ từng nhãn của R-RC06, R-RC07.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F376 (rà soát Astra): không ghi một phần của một đánh giá.

#### Scenario: Một nhãn sai bằng chứng
- **WHEN** một đánh giá có hai nhãn, một nhãn khớp lời và một nhãn không khớp
- **THEN** đánh giá đó không có dòng nào, `reviewsSkipped` có một mục với lý do `TEXT_MISMATCH`, và không có dòng `NO_THEME`

### Requirement: R-RL08 Không thêm chủ đề vào nhóm nhãn đã có
Đánh giá đã có bất kỳ dòng `review_code` nào của bản bộ chủ đề (bất kể `origin`) SHALL bị bỏ cả đánh giá khi nhập `CODES` và được đếm `alreadyCoded`. Nạp lại đúng tệp cũ SHALL vẫn trả toàn số 0. Muốn gán lại SHALL dùng bản bộ chủ đề mới. `alreadyCoded` thay `alreadyPresent` của R-RC07.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F376 (rà soát Astra): không trộn nhãn của hai lần gán trong một nhóm nhãn.

#### Scenario: Tệp khác có chủ đề khác
- **WHEN** đánh giá đã có dòng `review_code` của bản hiện tại và một tệp MCP khác có chủ đề khác cho nó
- **THEN** không thêm dòng nào cho đánh giá đó và `alreadyCoded` tăng 1

### Requirement: R-RL09 Khoá mỗi lúc một lượt
Lượt `LABELS`, lượt gán sau khi nạp S05 và lượt nhập `CODES` SHALL giữ khoá `<thư mục cơ sở dữ liệu>/raw-db-labels.lock.sqlite` (tệp SQLite riêng, giữ `BEGIN EXCLUSIVE`) từ trước khi chọn đánh giá tới hết lượt. Tệp khoá SHALL NOT bị xoá. App SHALL NOT giữ giao dịch ghi trên cơ sở dữ liệu app khi chờ Jev.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F376 (rà soát Astra): hai lượt cùng lúc không gọi Jev hai lần; tiến trình chết thì khoá của hệ điều hành tự nhả.

#### Scenario: Tiến trình giữ khoá chết
- **WHEN** tiến trình giữ khoá bị giết
- **THEN** lượt sau lấy được khoá ngay

### Requirement: R-RL10 Lượt thứ hai chờ rồi dừng
Khi khoá R-RL09 đang bị giữ, lượt thứ hai SHALL chờ tối đa 10 giây rồi dừng với `LABELS_BUSY` mà không gọi Jev. Khi nạp S05 thì việc nạp SHALL vẫn thành công và `labelling` là `SKIPPED_BUSY`. `--dry-run` SHALL NOT lấy khoá và SHALL NOT gọi mạng.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F376 (rà soát Astra): chờ có giới hạn, không treo lệnh.

#### Scenario: Lượt LABELS thứ hai
- **WHEN** một lượt đang giữ khoá và lượt `LABELS` thứ hai bắt đầu
- **THEN** lượt thứ hai không gọi Jev và dừng với `LABELS_BUSY` sau khoảng 10 giây

### Requirement: R-RL11 Bản chụp cơ sở dữ liệu app
`publishAppDbSnapshot` SHALL sao lưu trực tuyến cơ sở dữ liệu (SQLite backup) vào tệp `.tmp-…` trong thư mục bản chụp, đặt `journal_mode=DELETE`, fsync, đổi tên nguyên tử thành `app-db.snapshot.sqlite`, fsync thư mục, và trả `{ path, bytes, publishedAt }`. App SHALL chỉ xoá tệp tạm của chính nó.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F376 (rà soát Astra):  (Astra FIX3) MCP Insight đọc một bản chụp nhất quán thay vì chép tệp DB và WAL đang ghi.

#### Scenario: Bản chụp mở được
- **WHEN** bản chụp được chép xong
- **THEN** `<thư mục cơ sở dữ liệu>/app-db-snapshot/app-db.snapshot.sqlite` mở được, `journal_mode` là `delete`, có các dòng đã ghi, thư mục có quyền 0700, tệp 0600, và không còn tệp `.tmp-` của lần chép đó

### Requirement: R-RL12 Khi nào chép bản chụp
App SHALL chép bản chụp R-RL11 sau một lần nạp S05 thật (sau khi gán), một lượt `LABELS` hoặc một lần nhập `CODES` không phải `--dry-run`, và khi chạy `raw-db-load --source SNAPSHOT`. Kết quả SHALL có trường `snapshot`. Chép lỗi SHALL NOT làm hỏng việc nạp và SHALL được ghi là `snapshot.error`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F376 (rà soát Astra): bản chụp luôn mới sau mỗi lần ghi nhãn.

#### Scenario: Chép lỗi
- **WHEN** không ghi được thư mục bản chụp khi nạp S05 thật
- **THEN** lệnh vẫn thành công và kết quả có `snapshot.error`
