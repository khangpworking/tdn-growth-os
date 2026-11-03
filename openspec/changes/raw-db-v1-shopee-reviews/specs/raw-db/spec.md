## ADDED Requirements

### Requirement: R-DB01 Bốn bảng db-v1 cho lời khách
Migration 0063 SHALL tạo bảng `raw_capture`, `product`, `review`, `run_review` (dạng STRICT, đúng cột, CHECK, UNIQUE, chỉ mục của db-v1 §5) và view `writer_count`. Migration SHALL NOT tạo `review_coverage` và SHALL NOT chạm bảng đã có.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 03/11/2026 chủ duyệt lát đầu của db-v1 (`data/raw-sources/KHUON-CSDL.md`).

#### Scenario: Cơ sở dữ liệu mới
- **WHEN** app mở một cơ sở dữ liệu trống và chạy mọi migration
- **THEN** có 4 bảng và view `writer_count`, phiên bản migration là 63, và không có `review_coverage`

#### Scenario: Cơ sở dữ liệu đang có dữ liệu
- **WHEN** migration 0063 chạy trên cơ sở dữ liệu phiên bản 62 đã có dữ liệu
- **THEN** mọi bảng cũ giữ nguyên dòng và cấu trúc

### Requirement: R-DB02 Dòng db-v1 không sửa, không xoá
Bốn bảng db-v1 SHALL chỉ cho thêm dòng. UPDATE hoặc DELETE SHALL bị chặn với lỗi `immutable_raw_db_v1_<tên bảng>`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Quy tắc 6 của db-v1: bản đầu tiên của một đánh giá được giữ.

#### Scenario: Sửa một đánh giá đã lưu
- **WHEN** có lệnh UPDATE trên bảng `review`
- **THEN** lệnh bị chặn với lỗi `immutable_raw_db_v1_review` và dòng giữ nguyên

#### Scenario: Xoá một lần thu
- **WHEN** có lệnh DELETE trên bảng `raw_capture`
- **THEN** lệnh bị chặn với lỗi `immutable_raw_db_v1_raw_capture`

### Requirement: R-DB03 Chỉ nạp từ lượt thu đã kiểm
Hàm `loadShopeeReviewsToDbV1` SHALL đọc lượt thu của lượt chạy (`run_key = 'auto-' + runId`) chỉ qua bộ đọc đã kiểm của `ShopeeCollectionService`, và SHALL NOT đọc byte gốc chưa kiểm. Lỗi của bộ đọc SHALL được trả nguyên.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Bộ đọc đã kiểm là ranh giới tin cậy của Foundation.

#### Scenario: Lượt chạy không có lượt thu Shopee
- **WHEN** gọi hàm nạp với một `runId` không có lượt thu
- **THEN** hàm báo lỗi bắt đầu bằng `RAW_DB_RUN_NOT_FOUND` và không thêm dòng nào

#### Scenario: Tệp gốc bị sửa
- **WHEN** một tệp của lượt thu không còn khớp dấu đã lưu
- **THEN** hàm trả nguyên lỗi của bộ đọc và không thêm dòng nào

### Requirement: R-DB04 Ánh xạ đánh giá S05 sang db-v1
Mỗi lần gọi một sản phẩm SHALL thành một dòng `raw_capture`; mỗi đánh giá SHALL thành một dòng `review` theo ánh xạ chủ duyệt ngày 03/11/2026. Cột nguồn không thu SHALL để `NULL`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Mọi dòng phải trỏ về đúng một lần gọi nguồn.

#### Scenario: Năm sản phẩm trong một lượt thu
- **WHEN** lượt thu có 5 lần gọi sản phẩm
- **THEN** có 5 dòng `raw_capture` với `capture_id = S05:<collectionId>:<thứ tự>`, `outcome` là `OK`, `EMPTY` hoặc `FAILED`, `raw_path = artifact:<dấu lượt thu>#listing=<thứ tự>`, và mỗi đánh giá trỏ về lần gọi của sản phẩm của nó

#### Scenario: Cột của một đánh giá
- **WHEN** nạp một đánh giá có `reviewId`, `itemId`, `ratingStar`, `comment`, `ratingState`, `sourcePage`, `sourceRow`
- **THEN** dòng có `review_key = S05:<reviewId>`, `product_key = shopee:<itemId>`, sao, lời viết giữ nguyên, `state`, `source_position = page=<sourcePage>,row=<sourceRow>`, `reviewer_key` và `reviewer_name` `NULL`, `reviewer_name_state = 'not_provided'`

#### Scenario: Đánh giá chỉ có sao
- **WHEN** một đánh giá có số sao nhưng lời viết rỗng
- **THEN** `text` giữ nguyên chuỗi rỗng, không bịa lời viết

#### Scenario: Giờ viết theo múi khác
- **WHEN** `createdAt` của đánh giá có đuôi `Z`
- **THEN** `posted_at` là cùng thời điểm, viết theo giờ Asia/Ho_Chi_Minh với đuôi `+07:00`

### Requirement: R-DB05 Tên sản phẩm không bịa
Mỗi sản phẩm đã chọn SHALL thành một dòng `product`. `product_name` SHALL lấy từ dòng đã chọn của lượt thu, hoặc từ dòng Metric của lượt chạy mà sản phẩm được chọn ra. Sản phẩm đã lưu SHALL giữ nguyên.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: `product_name` là cột bắt buộc; tên phải đến từ nguồn.

#### Scenario: Tên lấy từ dòng Metric
- **WHEN** dòng đã chọn không có tên và dòng Metric của lượt chạy có `product_name`
- **THEN** dòng `product` mang đúng tên đó, và `first_capture_id` là lần gọi của sản phẩm

#### Scenario: Không tìm được tên
- **WHEN** không có tên cho một sản phẩm chưa lưu
- **THEN** hàm báo lỗi bắt đầu bằng `RAW_DB_PRODUCT_NAME_MISSING` và không thêm dòng nào

### Requirement: R-DB06 Nạp lại không nhân đôi
Mỗi lần nạp SHALL chạy trong một giao dịch. Đánh giá đã lưu SHALL NOT bị thêm lại hay sửa; lượt chạy mới SHALL chỉ thêm dòng `run_review` của nó. Hàm và lệnh `scripts/raw-db-load.ts` SHALL trả số dòng đã thêm.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Quy tắc 6 của db-v1.

#### Scenario: Nạp cùng lượt chạy hai lần
- **WHEN** nạp một lượt chạy, rồi nạp lại đúng lượt đó
- **THEN** lần hai trả `captures`, `products`, `reviewsInserted`, `runReviewsInserted` bằng 0 và mọi bảng không đổi

#### Scenario: Lượt chạy sau thu lại cùng đánh giá
- **WHEN** lượt chạy B thu lại một đánh giá mà lượt chạy A đã lưu
- **THEN** dòng `review` vẫn là bản của A, và có thêm một dòng `run_review` cho B với lần gọi của B

#### Scenario: Chạy thử
- **WHEN** chạy `scripts/raw-db-load.ts --source S05 --run <runId> --dry-run`
- **THEN** lệnh in một dòng JSON số dòng sẽ thêm và cơ sở dữ liệu không đổi
