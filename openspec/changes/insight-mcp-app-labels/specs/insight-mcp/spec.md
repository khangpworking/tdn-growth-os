## MODIFIED Requirements

### Requirement: R-IM01 Chạy cục bộ, chỉ đọc app
MCP `tdn-insight` SHALL chạy cục bộ qua stdio trên máy chủ. MCP SHALL mở CSDL và kho file của app ở chế độ chỉ đọc. MCP SHALL đọc CSDL app chỉ qua bản sao sạch app đã xuất bản (`INSIGHT_MCP_APP_DB_SNAPSHOT`): mở tệp đó một lần, chép byte sang thư mục tạm riêng, kiểm phần đầu SQLite và `PRAGMA quick_check` trên bản chép, rồi chỉ dùng bản chép. MCP SHALL NOT mở hay chép CSDL app đang chạy cùng `-wal`, `-shm` của nó; `INSIGHT_MCP_APP_DB` chỉ để tìm thư mục app. Thiếu bản sao sạch SHALL trả `APP_DB_SNAPSHOT_MISSING` («app chưa xuất bản sao sạch»). Kết quả SHALL ghi thời điểm app xuất bản bản sao (`publishedAt`) để người đọc biết số liệu mới đến đâu. MCP SHALL NOT gọi API ghi của app, SHALL NOT đổi cờ môi trường, SHALL NOT mở cổng mạng. MCP SHALL đọc khóa Jev từ file, SHALL NOT in khóa ra nhật ký hay câu trả lời. Mọi công cụ gọi nguồn trả phí SHALL bị từ chối khi thiếu cờ `INSIGHT_MCP_ALLOW_PAID=1`. Từ F361–F367, công cụ trả phí duy nhất là gán ý con (`code_claims`); `code_reviews` SHALL NOT gọi Jev dù cờ có hay không.

- Loại kiểm: Mã
- Mã kiểm: `tools/mcp-insight/tests/test_boundaries.py`::test_im_q2_app_connection_is_uri_readonly; `tools/mcp-insight/tests/test_boundaries.py`::test_im_q3_every_offline_tool_is_socket_and_dns_free; `tools/mcp-insight/tests/test_boundaries.py`::test_im_q4_code_reviews_never_codes_or_reads_a_key; `tools/mcp-insight/tests/part4/test_coding_p4.py`::test_im_q5_key_is_file_only_and_redacted_on_transport_error
- Vì sao: Ngày 25/10/2026 kế hoạch MCP dữ liệu giữ MCP cục bộ, không ra internet. Ngày 30/10/2026 chủ chọn bản 1 nằm ngoài app (F306). Ngày 03/11/2026 chủ quyết nhãn chủ đề do app gán, MCP chỉ đọc (F361–F367).

#### Scenario: Ghi vào CSDL app
- **WHEN** một công cụ của MCP cố ghi một dòng vào CSDL của app
- **THEN** lệnh ghi thất bại vì CSDL mở chỉ đọc

#### Scenario: App chưa xuất bản bản sao sạch
- **WHEN** tệp `INSIGHT_MCP_APP_DB_SNAPSHOT` không có
- **THEN** `build_warehouse` trả `APP_DB_SNAPSHOT_MISSING` và không mở CSDL app đang chạy

#### Scenario: Gọi Jev khi thiếu cờ
- **WHEN** agent gọi gán ý con thật mà không có `INSIGHT_MCP_ALLOW_PAID=1`
- **THEN** MCP từ chối, không gọi Jev lần nào, và trả số lượt gọi dự tính

#### Scenario: Gọi gán chủ đề khi có cờ
- **WHEN** agent gọi `code_reviews` thật với `INSIGHT_MCP_ALLOW_PAID=1`
- **THEN** MCP trả lỗi `LABELS_FROM_APP`, không đọc khóa và không gọi Jev

### Requirement: R-IM03 Gán chủ đề bằng Jev và bộ chủ đề v2
App SHALL gán chủ đề cho đánh giá bằng Jev và lưu nhãn trong CSDL app (`review_code`, `codebook`, migration 0068). MCP SHALL chỉ đọc các nhãn đó: `build_warehouse` SHALL chép vào kho nhãn của các đánh giá trong lần chạy, và `code_reviews` SHALL trả lỗi `LABELS_FROM_APP` («nhãn do app gán; MCP chỉ đọc»). Một đánh giá trong kho SHALL khớp đúng một đánh giá sản phẩm db-v1 cùng sàn và cùng mã nguồn. Bộ chủ đề là file dữ liệu có `version` và `status`; MCP SHALL chỉ dùng nhãn của bản trong file, và dòng `codebook` của app cho bản đó SHALL có SHA-256 bằng SHA-256 các byte của file, nếu không MCP SHALL trả `APP_CODEBOOK_MISMATCH`. Nhãn SHALL chỉ được dùng khi dấu SHA-256 của lời khách trong nhãn bằng dấu của lời trong kho (lời bình luận cộng các dòng thuộc tính); nhãn không khớp SHALL NOT được đếm và SHALL được đếm vào `labelTextMismatch`. Mỗi nhãn SHALL lưu phiên bản bộ chủ đề, khối, xác suất, cực (khen, chê, kể, không rõ hướng) và bước mua (R-I31) như app đã ghi. Nhãn «chưa rõ» SHALL NOT bị đếm vào chủ đề. Đánh giá có dòng `NO_THEME` là đã gán, không có chủ đề. Dòng `NO_THEME` có nguồn `MCP_IMPORT` nghĩa là «đã gán theo bản này, không có chủ đề»: dấu của nó là dấu đầu vào MCP, nên MCP SHALL nhận nó không cần kiểm dấu lời. Mọi dòng khác (chủ đề của mọi nguồn, `NO_THEME` nguồn `APP_JEV`) SHALL qua kiểm dấu toàn lời như trên. Đánh giá có dòng không qua kiểm dấu SHALL là chưa gán (không dòng nào được dùng), SHALL NOT bị coi là `NO_THEME`. Đánh giá app chưa gán SHALL là chưa gán. Khi bộ chủ đề có `status` khác APPROVED, câu kiểm 3 của R-I32 SHALL tính là thiếu với mọi kết luận dựa trên nhãn. Bộ chủ đề SHALL NOT có chủ đề Giao hàng, Đóng gói, Dịch vụ shop và tư vấn. MCP SHALL NOT gán, đếm, tổng hợp hay hiện các chủ đề này ở bất kỳ công cụ nào. Đánh giá chỉ nói về các chủ đề này vẫn được thu và lưu, và không mang chủ đề nào. Riêng vẻ ngoài của bao bì (đẹp, xấu, bắt mắt) SHALL thuộc chủ đề Kiểu dáng, màu sắc, thiết kế.

- Loại kiểm: Mã
- Mã kiểm: `tools/mcp-insight/tests/test_coding.py`::test_im_q46_fixed_excluded_list_rejects_before_calls_or_writes; `tools/mcp-insight/tests/test_coding.py`::test_im_q48_logistics_review_is_retained_and_excluded_labels_never_count; `tools/mcp-insight/tests/test_coding.py`::test_im_q51_packaging_appearance_guidance_label_and_exact_count; `tools/mcp-insight/tests/test_coding.py`::test_im_q43_changed_text_invalidates_one_review
- Vì sao: Ngày 30/10/2026 chủ chọn «Jev + bộ chủ đề v2» (F306). Ngày 26/10/2026 chủ yêu cầu bộ chủ đề «tính tới universal» (F256). Ngày 26/10/2026 Jev gán 1.233/1.248 đánh giá canxi; AI của app gán 8/100. Ngày 30/10/2026 chủ viết: «bỏ tag, vì nó liên quan đến logistic và thương mại điện tử, không phục vụ insight. Vẫn lấy comment, nhưng không hiện và tổng hợp, phân loại hay xử lý cho các loại tag này» (F310). Cùng ngày, khi được hỏi «bao bì bắt mắt» thuộc chủ đề nào, chủ chọn gộp vào chủ đề «Kiểu dáng, màu sắc, thiết kế» (F311). Ngày 03/11/2026 chủ quyết nhãn nằm trong CSDL app, app gán, MCP chỉ đọc (F361–F367).

#### Scenario: Chủ đề hậu cần bị loại
- **WHEN** bộ chủ đề dùng cho một lần chạy có chủ đề Giao hàng
- **THEN** MCP từ chối bộ chủ đề đó và không dựng kho, không đếm

#### Scenario: Đánh giá chỉ nói về giao hàng
- **WHEN** một đánh giá chỉ khen giao nhanh
- **THEN** đánh giá vẫn có trong kho nhưng không có nhãn chủ đề nào, và không công cụ đếm nào trả số về giao hàng

#### Scenario: Bao bì bắt mắt
- **WHEN** app gán cho một đánh giá khen hộp sản phẩm đẹp, bắt mắt
- **THEN** đánh giá mang chủ đề Kiểu dáng, màu sắc, thiết kế

#### Scenario: Chạy thử không tốn lượt
- **WHEN** agent gọi `code_reviews` với `dry_run` cho lần chạy canxi
- **THEN** MCP trả `LABELS_FROM_APP`, số lượt gọi Jev thật bằng 0

#### Scenario: Bộ chủ đề của app khác file
- **WHEN** dòng `codebook` của app cho bản trong file có SHA-256 khác file
- **THEN** `build_warehouse` trả `APP_CODEBOOK_MISMATCH` và không dùng nhãn nào

#### Scenario: Lời khách đã đổi
- **WHEN** dấu lời khách trong nhãn app khác dấu lời của đánh giá trong kho
- **THEN** nhãn đó không được đếm và `labelTextMismatch` tăng 1

#### Scenario: NO_THEME nhập từ MCP
- **WHEN** một đánh giá chỉ có dòng `NO_THEME` nguồn `MCP_IMPORT` với dấu khác dấu lời trong kho
- **THEN** đánh giá đó là đã gán, không có chủ đề, và không tăng `labelTextMismatch`

#### Scenario: Chủ đề sai dấu cạnh NO_THEME
- **WHEN** một đánh giá có dòng chủ đề sai dấu lời
- **THEN** đánh giá đó là chưa gán, không dòng nào được dùng, và `labelTextMismatch` tăng 1

#### Scenario: Bộ chủ đề còn nháp
- **WHEN** bộ chủ đề có `status` DRAFT và một chủ đề đạt ngưỡng R-I33
- **THEN** câu kiểm 3 của kết luận đó tính là thiếu

## ADDED Requirements

### Requirement: R-IM19 Số đếm chủ đề theo nhãn app
`theme_counts` SHALL ghi `labelSource: "app_db"` và số đánh giá đã gán, chưa gán theo từng sàn (`codedReviews`, `uncodedReviews`). Khi chưa đánh giá nào của lần chạy được gán, kết quả SHALL có danh sách chủ đề rỗng và ghi chú «chưa gán nhãn»; số chủ đề SHALL NOT lấy từ nguồn khác. Mỗi lần dựng kho SHALL thay nhãn trong kho bằng nhãn app hiện có.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 03/11/2026 chủ quyết nhãn nằm trong CSDL app, MCP chỉ đọc (F361–F367).

#### Scenario: Chưa có nhãn app
- **WHEN** agent gọi `theme_counts` cho lần chạy mà app chưa gán đánh giá nào
- **THEN** kết quả có danh sách chủ đề rỗng và ghi chú «chưa gán nhãn»

#### Scenario: Nhãn app mới
- **WHEN** app gán thêm nhãn cho một đánh giá rồi kho được dựng lại
- **THEN** `theme_counts` đếm nhãn mới

### Requirement: R-IM20 Cảm xúc theo sao từ app
Công cụ `star_counts(run_id)` SHALL đếm các đánh giá của lần chạy khớp với app theo `star_sentiment` của view `review_star_sentiment` (`tich_cuc`, `tieu_cuc`, không có sao), theo sàn và theo sản phẩm, có ngưỡng R-I33 và mã số đếm trong `count_registry`. `star_counts` SHALL NOT xếp hạng thương hiệu theo sao (IM-Q89) và SHALL NOT trả lời khách.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 03/11/2026 chủ quyết cảm xúc theo sao là một view của CSDL app và MCP chỉ đọc (F363, F361–F367).

#### Scenario: Ba mức sao
- **WHEN** lần chạy có đánh giá 2 sao, 5 sao và một đánh giá không có sao, cả ba khớp với app
- **THEN** `star_counts` trả một đánh giá `tieu_cuc`, một `tich_cuc` và một không có sao, mỗi dòng có mã số đếm
