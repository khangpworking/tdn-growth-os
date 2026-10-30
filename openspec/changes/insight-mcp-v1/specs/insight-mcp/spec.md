## ADDED Requirements

### Requirement: R-IM01 Chạy cục bộ, chỉ đọc app
MCP `tdn-insight` SHALL chạy cục bộ qua stdio trên máy chủ. MCP SHALL mở CSDL và kho file của app ở chế độ chỉ đọc. MCP SHALL NOT gọi API ghi của app, SHALL NOT đổi cờ môi trường, SHALL NOT mở cổng mạng. MCP SHALL đọc khóa Jev từ file, SHALL NOT in khóa ra nhật ký hay câu trả lời. Mọi công cụ gọi nguồn trả phí SHALL bị từ chối khi thiếu cờ `INSIGHT_MCP_ALLOW_PAID=1`.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 25/10/2026 kế hoạch MCP dữ liệu giữ MCP cục bộ, không ra internet. Ngày 30/10/2026 chủ chọn bản 1 nằm ngoài app (F306).

#### Scenario: Ghi vào CSDL app
- **WHEN** một công cụ của MCP cố ghi một dòng vào CSDL của app
- **THEN** lệnh ghi thất bại vì CSDL mở chỉ đọc

#### Scenario: Gọi Jev khi thiếu cờ
- **WHEN** agent gọi gán chủ đề thật mà không có `INSIGHT_MCP_ALLOW_PAID=1`
- **THEN** MCP từ chối, không gọi Jev lần nào, và trả số lượt gọi dự tính

### Requirement: R-IM02 Kho SQLite của lần chạy
Công cụ `build_warehouse(run_id)` SHALL dựng một file SQLite cho lần chạy từ dữ liệu đã lưu: đánh giá Shopee, đánh giá TikTok Shop nếu có, gợi ý tìm kiếm, Trends theo tỉnh, và tên sản phẩm. Mỗi đánh giá SHALL có `writer_key` và `writer_known`. Nguồn có tên người viết thì `writer_key` là băm của tên và `writer_known = 1`. Nguồn không có tên thì `writer_key` là mã đánh giá và `writer_known = 0`. Bảng nhãn và bảng số SHALL NOT chứa chữ của khách. Chữ của khách SHALL nằm ở một bảng riêng. Mỗi đánh giá SHALL giữ sàn riêng (R-I06). Gọi lại trên cùng dữ liệu SHALL cho cùng kho.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 25/10/2026 chủ đề xuất «thu thập dữ liệu + semantic layer» (F195). Ngày 30/10/2026 kiểm thấy bộ thu miễn phí không lưu tên người viết.

#### Scenario: Nguồn không có tên người viết
- **WHEN** đánh giá Shopee của lần chạy không có tên người viết
- **THEN** mỗi đánh giá có `writer_known = 0` và `writer_key` bằng mã đánh giá

#### Scenario: Chữ khách trong bảng nhãn
- **WHEN** bảng nhãn có một cột chứa chữ của đánh giá
- **THEN** quy tắc R-IM02 bị vi phạm

### Requirement: R-IM03 Gán chủ đề bằng Jev và bộ chủ đề v2
Công cụ `code_reviews(run_id, dry_run)` SHALL gán chủ đề cho đánh giá bằng Jev, theo bộ chủ đề là file dữ liệu có `version` và `status`. Bộ chủ đề SHALL chọn khối theo ngành theo thứ tự: chủ chọn, nhãn ngành của lần chạy, từ khóa, rồi chỉ chủ đề lõi. Với `dry_run`, MCP SHALL trả số đánh giá và số lượt gọi dự tính, SHALL NOT gọi Jev. Khi gọi thật, MCP SHALL dừng ở trần lượt gọi do agent truyền vào và SHALL dừng ở lỗi đầu tiên. Mỗi nhãn SHALL lưu phiên bản bộ chủ đề, xác suất, cực (khen, chê, trung tính) và bước mua (R-I31). Nhãn dưới ngưỡng xác suất của bộ chủ đề SHALL ghi «chưa rõ», SHALL NOT bị đếm vào chủ đề. Khi bộ chủ đề có `status` khác APPROVED, câu kiểm 3 của R-I32 SHALL tính là thiếu với mọi kết luận dựa trên nhãn. Bộ chủ đề SHALL NOT có chủ đề Giao hàng, Đóng gói, Dịch vụ shop và tư vấn. MCP SHALL NOT hỏi Jev, gán, đếm, tổng hợp hay hiện các chủ đề này ở bất kỳ công cụ nào. Đánh giá chỉ nói về các chủ đề này vẫn được thu và lưu, và không mang chủ đề nào.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 30/10/2026 chủ chọn «Jev + bộ chủ đề v2» (F306). Ngày 26/10/2026 chủ yêu cầu bộ chủ đề «tính tới universal» (F256). Ngày 26/10/2026 Jev gán 1.233/1.248 đánh giá canxi; AI của app gán 8/100. Ngày 30/10/2026 chủ viết: «bỏ tag, vì nó liên quan đến logistic và thương mại điện tử, không phục vụ insight. Vẫn lấy comment, nhưng không hiện và tổng hợp, phân loại hay xử lý cho các loại tag này» (F310).

#### Scenario: Chủ đề hậu cần bị loại
- **WHEN** bộ chủ đề dùng cho một lần chạy có chủ đề Giao hàng
- **THEN** MCP từ chối bộ chủ đề đó và không gọi Jev

#### Scenario: Đánh giá chỉ nói về giao hàng
- **WHEN** một đánh giá chỉ khen giao nhanh
- **THEN** đánh giá vẫn có trong kho nhưng không có nhãn chủ đề nào, và không công cụ đếm nào trả số về giao hàng

#### Scenario: Chạy thử không tốn lượt
- **WHEN** agent gọi `code_reviews` với `dry_run` cho lần chạy canxi
- **THEN** MCP trả số đánh giá và số lượt gọi dự tính, số lượt gọi Jev thật bằng 0

#### Scenario: Bộ chủ đề còn nháp
- **WHEN** bộ chủ đề có `status` DRAFT và một chủ đề đạt ngưỡng R-I33
- **THEN** câu kiểm 3 của kết luận đó tính là thiếu

### Requirement: R-IM04 Semantic layer cố định
MCP SHALL đếm qua một mô hình SLAYER khai báo sẵn trong repo, với số đo cố định: số đánh giá, số người viết khác nhau, số sản phẩm, số từ khóa khác nhau, chia theo sàn, chủ đề, cực và bước mua. Tên số đo SHALL khác tên cột. MCP SHALL NOT cho agent viết câu hỏi SLAYER hay SQL tự do. Mỗi số đo SHALL có một câu SQL đối chiếu, và kiểm thử SHALL chứng minh SLAYER và SQL cho cùng kết quả.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 25/10/2026 và 30/10/2026 SLAYER đếm khớp SQL (4/4 và 5/5). Ngày 30/10/2026 hỏi tự do qua `slayer mcp` bị loại vì agent có thể đếm sai cách hoặc lấy cột không được phép.

#### Scenario: SLAYER lệch SQL
- **WHEN** số đánh giá theo chủ đề của SLAYER khác câu SQL đối chiếu
- **THEN** công cụ trả lỗi, không trả số nào

### Requirement: R-IM05 Ngưỡng kết luận tính sẵn
Công cụ `theme_counts(run_id, question)` và `keyword_counts(run_id)` SHALL trả cho mỗi chủ đề: số đánh giá, số người viết, số sản phẩm, sàn, và cờ đạt ngưỡng R-I33. Ngưỡng đánh giá SHALL là từ 5 người viết trên từ 3 sản phẩm. Ngưỡng từ khóa SHALL là từ 5 từ khóa khác nhau. Khi `writer_known = 0`, MCP SHALL tính ngưỡng trên số đánh giá, SHALL ghi «đếm theo đánh giá, nguồn không có tên người viết», và câu kiểm 2 SHALL tính là thiếu. Số SHALL ghi riêng từng sàn (R-I06). Mỗi dòng SHALL có một mã số đếm để agent trỏ tới.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: R-I33 (chủ duyệt trang bản 9 ngày 22/10/2026, F117). Giả định về nguồn không có tên người viết ghi ở design.md, quyết định 3.

#### Scenario: Dưới ngưỡng
- **WHEN** một chủ đề có 4 người viết trên 3 sản phẩm
- **THEN** cờ đạt ngưỡng là sai và dòng ghi «dưới ngưỡng»

#### Scenario: Gộp hai sàn
- **WHEN** công cụ trả một số cộng đánh giá Shopee và TikTok Shop cho cùng chủ đề
- **THEN** quy tắc R-IM05 bị vi phạm

### Requirement: R-IM06 Chân dung khách chỉ bằng số tổng
Công cụ `portrait_counts(run_id)` SHALL trả số tổng cho Phần 4: nhóm «Ai dùng» từ ô «Đối tượng sử dụng», nhóm «Mua cho ai» từ lời tự kể, giới và năm sinh đoán từ tên tài khoản khi nguồn có tên. Quy tắc xếp nhóm SHALL giống cách làm đã ghi ngày 25/10/2026 (phương pháp chân dung khách). MCP SHALL NOT trả kết quả đoán của từng người. Mọi ý từ tên tài khoản SHALL mang nhãn Giả thuyết, mức tin cao nhất là Yếu. Nguồn không có tên thì giới và tuổi SHALL là «Chưa có dữ liệu».

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 25/10/2026 chủ yêu cầu chân dung khách cho Phần 4 (F222 đến F229). Ngày 30/10/2026 flow «sqlite → SLAYER → dashboard» chạy được trên canxi (F296).

#### Scenario: Đoán từng người
- **WHEN** công cụ trả danh sách tên tài khoản kèm giới đoán
- **THEN** quy tắc R-IM06 bị vi phạm

### Requirement: R-IM07 Khung 18 phần
Công cụ `report_plan(run_id)` SHALL trả 18 phần theo thứ tự R-I30. Mỗi phần SHALL có: câu hỏi, bước mua (R-I31), vai trò từng nguồn theo bảng R-I34, các mã số đếm dùng được, mức tin trần (R-IM08), và nhãn Khung hoặc Chưa có dữ liệu khi thiếu nguồn. Bảng vai trò nguồn SHALL là file dữ liệu, không viết cứng trong mã. Khung SHALL có mục «Những gì báo cáo chưa trả lời được» (R-I37), tự điền mỗi phần chưa có dữ liệu.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: R-I30, R-I31, R-I34, R-I37 (trang bản 9, chủ duyệt 22/10/2026, F117).

#### Scenario: Nguồn chưa thu
- **WHEN** lần chạy không có đánh giá TikTok Shop
- **THEN** mọi ô cần nguồn đó ghi «Chưa có dữ liệu», và mục «Những gì báo cáo chưa trả lời được» có một dòng cho ô đó

### Requirement: R-IM08 Mức tin trần theo 4 câu kiểm
Với mỗi ý, MCP SHALL tính 4 câu kiểm của R-I32 từ dữ liệu: câu 1 từ vai trò nguồn (Nguồn chính là đạt), câu 2 từ ngưỡng R-I33 và số thương hiệu, câu 3 từ trạng thái bộ chủ đề và lần rà mẫu của chủ, câu 4 từ sổ «cách đo đã ổn trên bao nhiêu sản phẩm». MCP SHALL trả mức tin trần: Chắc khi đạt cả 4, Khá khi thiếu đúng 1, Yếu khi thiếu từ 2, Không khi không có nguồn. Giả thuyết SHALL có trần Yếu. Phần tổng hợp SHALL có trần bằng mức thấp nhất của các ý nó dựa vào.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: R-I32 (chủ duyệt 22/10/2026, F112, F117). Ngày 30/10/2026 phiên Insight chỉ ra lỗi chấm Khá cho «Ai dùng» khi thiếu 2 câu kiểm; chủ duyệt sửa thành Yếu (F232).

#### Scenario: Thiếu câu kiểm 3 và 4
- **WHEN** một chủ đề đạt ngưỡng, bộ chủ đề còn nháp, và cách đo mới chạy trên 2 sản phẩm
- **THEN** mức tin trần là Yếu

### Requirement: R-IM09 Bằng chứng cho chuỗi «Tại sao»
Công cụ `find_reason_links(run_id, theme_a, theme_b)` SHALL đếm đánh giá mà chính khách nối hai chủ đề bằng từ chỉ lý do («vì», «nên», «do», «để»), riêng từng sàn, và SHALL trả mã đánh giá. Hai chủ đề chỉ cùng xuất hiện SHALL NOT được đếm. Công cụ `read_reviews(run_id, ids)` SHALL trả chữ đánh giá chỉ để agent đọc trên máy chủ, tối đa 20 đánh giá mỗi lần gọi. Chữ đó SHALL NOT vào báo cáo (R-I11).

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: R-I39 G5: mỗi tầng «Tại sao» cần một đánh giá khách tự nối hai ý bằng lý do (trang bản 9, F117).

#### Scenario: Cùng xuất hiện, không có lý do
- **WHEN** một đánh giá nhắc «giao nhanh» và «vị ngon» nhưng không nối hai ý bằng từ chỉ lý do
- **THEN** đánh giá đó không được đếm cho cặp chủ đề này

### Requirement: R-IM10 Agent viết, MCP kiểm từng phần
Công cụ `submit_section(run_id, part, text, claims)` SHALL nhận chữ của một phần do agent viết. Mỗi ý trong `claims` SHALL có mã số đếm, mức tin, bước mua và cờ Giả thuyết. MCP SHALL từ chối và trả lý do khi:
- một con số trong chữ không khớp mã số đếm nó trỏ tới;
- mức tin cao hơn mức tin trần (R-IM08);
- ý dưới ngưỡng được viết thành kết luận (R-I33);
- có đoạn trích nguyên văn chữ của khách (8 từ liên tiếp trùng một đánh giá);
- có tỷ lệ chuyển đổi giữa các bước mua (R-I31);
- có số doanh thu hoặc thị phần của báo cáo Market (R-I36), hoặc xếp hạng thương hiệu theo số sao;
- có tên nhà cung cấp dữ liệu bị cấm (R-L01, R-I29);
- gọi một con số là «người mua» (R-I35).
Phần đạt SHALL được lưu với phiên bản. Gửi lại một phần SHALL tạo phiên bản mới, không ghi đè.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 30/10/2026 chủ chọn «Agent gọi MCP viết, MCP kiểm» (F306). Gốc chung của 29 lỗi Astra tìm ra là báo cáo nói mạnh hơn bằng chứng (F111).

#### Scenario: Mức tin cao hơn trần
- **WHEN** agent gửi một ý mức Khá cho chủ đề có mức tin trần Yếu
- **THEN** MCP từ chối phần đó và ghi lý do «mức tin cao hơn bằng chứng»

#### Scenario: Trích nguyên văn
- **WHEN** chữ của phần chứa 8 từ liên tiếp trùng một đánh giá
- **THEN** MCP từ chối phần đó

#### Scenario: Phần đạt
- **WHEN** mọi số khớp, mức tin không vượt trần và không có lỗi nào trong danh sách
- **THEN** MCP lưu phần đó và trả số phiên bản

### Requirement: R-IM11 Câu insight 9 trường
Công cụ `submit_statement(run_id, statement)` SHALL nhận một câu insight đúng 9 trường của R-C01. MCP SHALL kiểm theo R-I39: có vế Xung đột; mỗi tầng «Tại sao» có mã bằng chứng từ R-IM09 hoặc dừng ở tầng cuối có bằng chứng và ghi «chưa đủ bằng chứng»; ngôi thứ ba; mỗi bước mua một câu; bằng chứng riêng từng sàn; vế thiếu bằng chứng thì cờ Giả thuyết bật; chỉ động cơ và rào cản có trong lời khách (R-I22, R-L12). Câu đạt SHALL được lưu theo đúng dạng để bản 2 nhập vào bảng câu insight của app.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: R-I39 (F117, F111). Ngày 29/10/2026 chủ duyệt 9 trường của câu insight (F292).

#### Scenario: Câu ngôi thứ nhất
- **WHEN** câu insight viết «Tôi muốn uống canxi mà không bị táo bón»
- **THEN** MCP từ chối câu đó

#### Scenario: Vế nhưng không có bằng chứng
- **WHEN** vế Xung đột không có mã bằng chứng nào
- **THEN** MCP chỉ lưu câu khi cờ Giả thuyết bật và mức tin không quá Yếu

### Requirement: R-IM12 Đầu ra và lưu trữ
Công cụ `render_report(run_id)` SHALL dựng một trang HTML tĩnh từ các phần đã đạt: 18 phần theo R-I30, Phụ lục nguồn của từng con số, mục «Những gì báo cáo chưa trả lời được». Phần chưa gửi SHALL hiện «Chưa viết», SHALL NOT bị bỏ đi. MCP SHALL ghi các file JSON số tổng dạng `{"rows": [...]}` cho dashboard. MCP SHALL lưu một bản (trang, số tổng, câu insight, phiên bản bộ chủ đề) vào SQLite lưu trữ, và SHALL bỏ qua bản giống hệt bản đã lưu. Đầu ra SHALL NOT chứa chữ của khách hay kết quả đoán của từng người.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 30/10/2026 chủ chọn bản 1 ngoài app: trang HTML, dashboard và SQLite (F306); chủ chọn lưu bản dựng lại vào SQLite (F303).

#### Scenario: Lưu hai lần cùng nội dung
- **WHEN** `render_report` chạy hai lần trên cùng các phần đã đạt
- **THEN** SQLite lưu trữ chỉ có một bản

#### Scenario: Phần chưa viết
- **WHEN** Phần 15 chưa được gửi
- **THEN** trang vẫn có Phần 15 với chữ «Chưa viết»
