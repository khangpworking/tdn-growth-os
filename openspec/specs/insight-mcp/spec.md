# insight-mcp Specification

## Purpose
Spec này giữ quy tắc của MCP `tdn-insight` (R-IM01 đến R-IM12): chạy cục bộ và chỉ đọc app, kho SQLite của lần chạy, gán chủ đề bằng Jev, semantic layer cố định, số đếm có ngưỡng, khung 18 phần, mức tin trần, bằng chứng cho chuỗi «Tại sao», cổng kiểm khi agent viết, và đầu ra lưu trữ. Nội dung lấy từ change insight-mcp-v1, đóng ngày 30/10/2026 theo F315. Phương pháp báo cáo nằm ở spec insight-report.

## Requirements

### Requirement: R-IM01 Chạy cục bộ, chỉ đọc app
MCP `tdn-insight` SHALL chạy cục bộ qua stdio trên máy chủ. MCP SHALL mở CSDL và kho file của app ở chế độ chỉ đọc. MCP SHALL NOT gọi API ghi của app, SHALL NOT đổi cờ môi trường, SHALL NOT mở cổng mạng. MCP SHALL đọc khóa Jev từ file, SHALL NOT in khóa ra nhật ký hay câu trả lời. Mọi công cụ gọi nguồn trả phí SHALL bị từ chối khi thiếu cờ `INSIGHT_MCP_ALLOW_PAID=1`.

- Loại kiểm: Mã
- Mã kiểm: `tools/mcp-insight/tests/test_boundaries.py::test_im_q2_app_connection_is_uri_readonly`; `tools/mcp-insight/tests/test_boundaries.py::test_im_q3_every_offline_tool_is_socket_and_dns_free`; `tools/mcp-insight/tests/test_boundaries.py::test_im_q4_paid_flag_refuses_before_key_read`; `tools/mcp-insight/tests/test_boundaries.py::test_im_q5_key_is_file_only_and_redacted_on_transport_error`
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
- Mã kiểm: `tools/mcp-insight/tests/test_warehouse.py::test_im_q9_writer_keys_are_normalized_hashed_and_unknown_when_masked`; `tools/mcp-insight/tests/test_warehouse.py::test_im_q10_review_text_is_confined_including_label_state_and_registry`; `tools/mcp-insight/tests/test_warehouse.py::test_im_q11_same_source_id_on_two_platforms_remains_two_reviews`; `tools/mcp-insight/tests/test_warehouse.py::test_im_q13_build_hash_is_deterministic_but_rating_sensitive`
- Vì sao: Ngày 25/10/2026 chủ đề xuất «thu thập dữ liệu + semantic layer» (F195). Ngày 30/10/2026 kiểm thấy bộ thu miễn phí không lưu tên người viết.

#### Scenario: Nguồn không có tên người viết
- **WHEN** đánh giá Shopee của lần chạy không có tên người viết
- **THEN** mỗi đánh giá có `writer_known = 0` và `writer_key` bằng mã đánh giá

#### Scenario: Chữ khách trong bảng nhãn
- **WHEN** bảng nhãn có một cột chứa chữ của đánh giá
- **THEN** quy tắc R-IM02 bị vi phạm

### Requirement: R-IM03 Gán chủ đề bằng Jev và bộ chủ đề v2
Công cụ `code_reviews(run_id, dry_run)` SHALL gán chủ đề cho đánh giá bằng Jev, theo bộ chủ đề là file dữ liệu có `version` và `status`. Bộ chủ đề SHALL chọn khối theo ngành theo thứ tự: chủ chọn, nhãn ngành của lần chạy, từ khóa, rồi chỉ chủ đề lõi. Với `dry_run`, MCP SHALL trả số đánh giá và số lượt gọi dự tính, SHALL NOT gọi Jev. Khi gọi thật, MCP SHALL dừng ở trần lượt gọi do agent truyền vào và SHALL dừng ở lỗi đầu tiên. Mỗi nhãn SHALL lưu phiên bản bộ chủ đề, xác suất, cực (khen, chê, trung tính) và bước mua (R-I31). Nhãn dưới ngưỡng xác suất của bộ chủ đề SHALL ghi «chưa rõ», SHALL NOT bị đếm vào chủ đề. Khi bộ chủ đề có `status` khác APPROVED, câu kiểm 3 của R-I32 SHALL tính là thiếu với mọi kết luận dựa trên nhãn. Bộ chủ đề SHALL NOT có chủ đề Giao hàng, Đóng gói, Dịch vụ shop và tư vấn. MCP SHALL NOT hỏi Jev, gán, đếm, tổng hợp hay hiện các chủ đề này ở bất kỳ công cụ nào. Đánh giá chỉ nói về các chủ đề này vẫn được thu và lưu, và không mang chủ đề nào. Riêng vẻ ngoài của bao bì (đẹp, xấu, bắt mắt) SHALL thuộc chủ đề Kiểu dáng, màu sắc, thiết kế.

- Loại kiểm: Mã
- Mã kiểm: `tools/mcp-insight/tests/test_coding.py::test_im_q16_default_dry_run_counts_without_key_or_transport`; `tools/mcp-insight/tests/test_coding.py::test_im_q46_fixed_excluded_list_rejects_before_calls_or_writes`; `tools/mcp-insight/tests/test_coding.py::test_im_q48_logistics_review_is_retained_and_excluded_labels_never_count`; `tools/mcp-insight/tests/test_coding.py::test_im_q51_packaging_appearance_guidance_label_and_exact_count`
- Vì sao: Ngày 30/10/2026 chủ chọn «Jev + bộ chủ đề v2» (F306). Ngày 26/10/2026 chủ yêu cầu bộ chủ đề «tính tới universal» (F256). Ngày 26/10/2026 Jev gán 1.233/1.248 đánh giá canxi; AI của app gán 8/100. Ngày 30/10/2026 chủ viết: «bỏ tag, vì nó liên quan đến logistic và thương mại điện tử, không phục vụ insight. Vẫn lấy comment, nhưng không hiện và tổng hợp, phân loại hay xử lý cho các loại tag này» (F310). Cùng ngày, khi được hỏi «bao bì bắt mắt» thuộc chủ đề nào, chủ chọn gộp vào chủ đề «Kiểu dáng, màu sắc, thiết kế» (F311).

#### Scenario: Chủ đề hậu cần bị loại
- **WHEN** bộ chủ đề dùng cho một lần chạy có chủ đề Giao hàng
- **THEN** MCP từ chối bộ chủ đề đó và không gọi Jev

#### Scenario: Đánh giá chỉ nói về giao hàng
- **WHEN** một đánh giá chỉ khen giao nhanh
- **THEN** đánh giá vẫn có trong kho nhưng không có nhãn chủ đề nào, và không công cụ đếm nào trả số về giao hàng

#### Scenario: Bao bì bắt mắt
- **WHEN** một đánh giá khen hộp sản phẩm đẹp, bắt mắt
- **THEN** đánh giá mang chủ đề Kiểu dáng, màu sắc, thiết kế

#### Scenario: Chạy thử không tốn lượt
- **WHEN** agent gọi `code_reviews` với `dry_run` cho lần chạy canxi
- **THEN** MCP trả số đánh giá và số lượt gọi dự tính, số lượt gọi Jev thật bằng 0

#### Scenario: Bộ chủ đề còn nháp
- **WHEN** bộ chủ đề có `status` DRAFT và một chủ đề đạt ngưỡng R-I33
- **THEN** câu kiểm 3 của kết luận đó tính là thiếu

### Requirement: R-IM04 Semantic layer cố định
MCP SHALL đếm qua một mô hình SLAYER khai báo sẵn trong repo, với số đo cố định: số đánh giá, số người viết khác nhau, số sản phẩm, số từ khóa khác nhau, chia theo sàn, chủ đề, cực và bước mua. Tên số đo SHALL khác tên cột. MCP SHALL NOT cho agent viết câu hỏi SLAYER hay SQL tự do. Mỗi số đo SHALL có một câu SQL đối chiếu, và kiểm thử SHALL chứng minh SLAYER và SQL cho cùng kết quả.

- Loại kiểm: Mã
- Mã kiểm: `tools/mcp-insight/tests/test_counts.py::test_im_q22_real_local_slayer_executes_all_fixed_measure_families`; `tools/mcp-insight/tests/test_counts.py::test_im_q23_one_numeric_slayer_difference_refuses_all_numbers`; `tools/mcp-insight/tests/test_counts.py::test_im_q24_run_ids_are_validated_before_query`
- Vì sao: Ngày 25/10/2026 và 30/10/2026 SLAYER đếm khớp SQL (4/4 và 5/5). Ngày 30/10/2026 hỏi tự do qua `slayer mcp` bị loại vì agent có thể đếm sai cách hoặc lấy cột không được phép.

#### Scenario: SLAYER lệch SQL
- **WHEN** số đánh giá theo chủ đề của SLAYER khác câu SQL đối chiếu
- **THEN** công cụ trả lỗi, không trả số nào

### Requirement: R-IM05 Ngưỡng kết luận tính sẵn
Công cụ `theme_counts(run_id, question)` và `keyword_counts(run_id)` SHALL trả cho mỗi chủ đề: số đánh giá, số người viết, số sản phẩm, sàn, và cờ đạt ngưỡng R-I33. Ngưỡng đánh giá SHALL là từ 5 người viết trên từ 3 sản phẩm. Ngưỡng từ khóa SHALL là từ 5 từ khóa khác nhau. Khi `writer_known = 0`, MCP SHALL tính ngưỡng trên số đánh giá, SHALL ghi «đếm theo đánh giá, nguồn không có tên người viết», và câu kiểm 2 SHALL tính là thiếu. Số SHALL ghi riêng từng sàn (R-I06). Mỗi dòng SHALL có một mã số đếm để agent trỏ tới.

- Loại kiểm: Mã
- Mã kiểm: `tools/mcp-insight/tests/test_counts.py::test_im_q27_five_writers_and_three_products_are_both_inclusive`; `tools/mcp-insight/tests/test_counts.py::test_im_q28_named_unknown_and_mixed_writer_rules`; `tools/mcp-insight/tests/test_counts.py::test_im_q29_shared_and_one_platform_only_themes_never_combine`; `tools/mcp-insight/tests/test_counts.py::test_im_q31_distinct_normalized_keywords_and_threshold`
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
- Mã kiểm: `tools/mcp-insight/tests/test_portraits_and_spec.py::test_im_q33_reference_multimatch_field_boundary_and_self_report`; `tools/mcp-insight/tests/test_portraits_and_spec.py::test_im_q34_name_rules_distinct_writers_bounded_years_and_hypothesis`; `tools/mcp-insight/tests/test_portraits_and_spec.py::test_im_q35_platform_without_names_has_no_numeric_demographics`; `tools/mcp-insight/tests/test_portraits_and_spec.py::test_im_q36_no_individual_names_ids_or_guesses_in_results`
- Vì sao: Ngày 25/10/2026 chủ yêu cầu chân dung khách cho Phần 4 (F222 đến F229). Ngày 30/10/2026 flow «sqlite → SLAYER → dashboard» chạy được trên canxi (F296).

#### Scenario: Đoán từng người
- **WHEN** công cụ trả danh sách tên tài khoản kèm giới đoán
- **THEN** quy tắc R-IM06 bị vi phạm

### Requirement: R-IM07 Khung 18 phần
Công cụ `report_plan(run_id)` SHALL trả 18 phần theo thứ tự R-I30. Mỗi phần SHALL có: câu hỏi, bước mua (R-I31), vai trò từng nguồn theo bảng R-I34, các mã số đếm dùng được, mức tin trần (R-IM08), và nhãn Khung hoặc Chưa có dữ liệu khi thiếu nguồn. Bảng vai trò nguồn SHALL là file dữ liệu, không viết cứng trong mã. Khung SHALL có mục «Những gì báo cáo chưa trả lời được» (R-I37), tự điền mỗi phần chưa có dữ liệu.

- Loại kiểm: Mã
- Mã kiểm: `tools/mcp-insight/tests/part2/test_report_plan.py::test_im_q55_roles_are_loaded_from_the_selected_data_file`; `tools/mcp-insight/tests/part2/test_report_plan.py::test_im_q56_exact_18_parts_and_question_five_syntheses`; `tools/mcp-insight/tests/part2/test_report_plan.py::test_im_q57_source_roles_missing_and_empty_capture`; `tools/mcp-insight/tests/part2/test_report_plan.py::test_im_q59_limitations_are_per_cell_and_revenue_aware`
- Vì sao: R-I30, R-I31, R-I34, R-I37 (trang bản 9, chủ duyệt 22/10/2026, F117).

#### Scenario: Nguồn chưa thu
- **WHEN** lần chạy không có đánh giá TikTok Shop
- **THEN** mọi ô cần nguồn đó ghi «Chưa có dữ liệu», và mục «Những gì báo cáo chưa trả lời được» có một dòng cho ô đó

### Requirement: R-IM08 Mức tin trần theo 4 câu kiểm
Với mỗi ý, MCP SHALL tính 4 câu kiểm của R-I32 từ dữ liệu: câu 1 từ vai trò nguồn (Nguồn chính là đạt), câu 2 từ ngưỡng R-I33 và số thương hiệu, câu 3 từ trạng thái bộ chủ đề và lần rà mẫu của chủ, câu 4 từ sổ «cách đo đã ổn trên bao nhiêu sản phẩm». MCP SHALL trả mức tin trần: Chắc khi đạt cả 4, Khá khi thiếu đúng 1, Yếu khi thiếu từ 2, Không khi không có nguồn. Giả thuyết SHALL có trần Yếu. Phần tổng hợp SHALL có trần bằng mức thấp nhất của các ý nó dựa vào.

- Loại kiểm: Mã
- Mã kiểm: `tools/mcp-insight/tests/part2/test_confidence.py::test_im_q66_stability_counts_distinct_subjects_for_exact_method`; `tools/mcp-insight/tests/part2/test_confidence.py::test_im_q68_each_missing_check_lowers_the_full_keyword_setup`; `tools/mcp-insight/tests/part2/test_confidence.py::test_im_q67_synthesis_uses_the_lowest_actual_support`; `tools/mcp-insight/tests/part2/test_confidence.py::test_im_q67_explicit_hypothesis_caps_zero_missing_at_weak`
- Vì sao: R-I32 (chủ duyệt 22/10/2026, F112, F117). Ngày 30/10/2026 phiên Insight chỉ ra lỗi chấm Khá cho «Ai dùng» khi thiếu 2 câu kiểm; chủ duyệt sửa thành Yếu (F232).

#### Scenario: Thiếu câu kiểm 3 và 4
- **WHEN** một chủ đề đạt ngưỡng, bộ chủ đề còn nháp, và cách đo mới chạy trên 2 sản phẩm
- **THEN** mức tin trần là Yếu

### Requirement: R-IM09 Bằng chứng cho chuỗi «Tại sao»
Công cụ `find_reason_links(run_id, theme_a, theme_b)` SHALL đếm đánh giá mà chính khách nối hai chủ đề bằng từ chỉ lý do («vì», «nên», «do», «để»), riêng từng sàn, và SHALL trả mã đánh giá. Hai chủ đề chỉ cùng xuất hiện SHALL NOT được đếm. Công cụ `read_reviews(run_id, ids)` SHALL trả chữ đánh giá chỉ để agent đọc trên máy chủ, tối đa 20 đánh giá mỗi lần gọi. Chữ đó SHALL NOT vào báo cáo (R-I11).

- Loại kiểm: Mã
- Mã kiểm: `tools/mcp-insight/tests/part2/test_reason_evidence.py::test_im_q69_baseline_r1_r13_counts_checked_pairs_per_platform`; `tools/mcp-insight/tests/part2/test_reason_evidence.py::test_im_q69_connectors_normalize_nfc_case_and_require_word_edges`; `tools/mcp-insight/tests/part2/test_reason_evidence.py::test_im_q72_local_read_is_exact_ordered_deduplicated_and_private`; `tools/mcp-insight/tests/part2/test_reason_evidence.py::test_im_q72_invalid_read_request_never_truncates_or_returns_text`
- Vì sao: R-I39 G5: mỗi tầng «Tại sao» cần một đánh giá khách tự nối hai ý bằng lý do (trang bản 9, F117).

#### Scenario: Cùng xuất hiện, không có lý do
- **WHEN** một đánh giá nhắc «giao nhanh» và «vị ngon» nhưng không nối hai ý bằng từ chỉ lý do
- **THEN** đánh giá đó không được đếm cho cặp chủ đề này

### Requirement: R-IM10 Agent viết, MCP kiểm từng phần
Công cụ `submit_section(run_id, part, text, claims)` SHALL nhận chữ của một phần do agent viết. Mỗi ý trong `claims` SHALL có mã số đếm, mức tin, bước mua và cờ Giả thuyết. MCP SHALL từ chối và trả lý do khi:
- một con số trong chữ không khớp mã số đếm nó trỏ tới;
- mức tin cao hơn mức tin trần (R-IM08);
- ý dưới ngưỡng được viết thành kết luận (R-I33);
- có đoạn trích nguyên văn chữ của khách: 8 từ liên tiếp trùng một đánh giá, hoặc trùng trọn một đánh giá ngắn từ 1 đến 7 từ;
- có tỷ lệ chuyển đổi giữa các bước mua (R-I31);
- có số doanh thu hoặc thị phần của báo cáo Market (R-I36), hoặc xếp hạng thương hiệu theo số sao;
- có tên nhà cung cấp dữ liệu bị cấm (R-L01, R-I29);
- gọi một con số là «người mua» (R-I35).
Phần đạt SHALL được lưu với phiên bản. Gửi lại một phần SHALL tạo phiên bản mới, không ghi đè.

Cổng kiểm được phép sai trong các mức sau. Mỗi lần chạy thật SHALL đo và ghi các mức này:
- Lọt câu sai (câu sai vẫn vào báo cáo): tối đa 2% số ý.
- Lọt câu vi phạm luật cứng: 0. Luật cứng gồm: chép lời khách, tên nhà cung cấp dữ liệu, số doanh thu hoặc thị phần của báo cáo Market, tỷ lệ chuyển đổi, và gọi số đếm là «người mua».
- Chặn nhầm câu đúng (agent phải viết lại): tối đa 15% số lượt gửi.
- Phần bị bỏ trống vì chặn nhầm sau 3 lần thử: 0.
Khi một lần chạy vượt một mức, cổng kiểm SHALL được sửa trước lần chạy sau. Khi mọi mức đạt, lỗi cổng kiểm đã thấy SHALL NOT bắt buộc sửa.

- Loại kiểm: Mã
- Mã kiểm: `tools/mcp-insight/tests/part3/test_sections.py::test_im_q85_draft_theme_caps_at_weak`; `tools/mcp-insight/tests/part3/test_sections.py::test_im_q87_exact_eight_words_normalization`; `tools/mcp-insight/tests/part3/test_scope_and_quotes.py::test_im_q111_every_short_review_length_rejects_before_storage`; `tools/mcp-insight/tests/part3/test_sections.py::test_im_q93_append_only_versions_are_per_part`
- Vì sao: Ngày 30/10/2026 chủ chọn «Agent gọi MCP viết, MCP kiểm» (F306). Gốc chung của 29 lỗi Astra tìm ra là báo cáo nói mạnh hơn bằng chứng (F111). Ngày 30/10/2026 chủ chấp nhận cổng kiểm có sai số và duyệt các mức trên, không sửa code (F314, F315). Lần chạy thật 30/10/2026 đạt mọi mức: lọt câu sai 2/149 ý (1,3%), luật cứng 0, chặn nhầm 5/45 lượt gửi (11%), 0 phần bỏ trống. Luật đánh giá ngắn đã có trong code (IM-Q87, IM-Q111) và được ghi vào spec theo F315.

#### Scenario: Mức tin cao hơn trần
- **WHEN** agent gửi một ý mức Khá cho chủ đề có mức tin trần Yếu
- **THEN** MCP từ chối phần đó và ghi lý do «mức tin cao hơn bằng chứng»

#### Scenario: Trích nguyên văn
- **WHEN** chữ của phần chứa 8 từ liên tiếp trùng một đánh giá
- **THEN** MCP từ chối phần đó

#### Scenario: Trùng trọn một đánh giá ngắn
- **WHEN** chữ của phần chứa trọn một đánh giá chỉ có 3 từ
- **THEN** MCP từ chối phần đó

#### Scenario: Phần đạt
- **WHEN** mọi số khớp, mức tin không vượt trần và không có lỗi nào trong danh sách
- **THEN** MCP lưu phần đó và trả số phiên bản

### Requirement: R-IM11 Câu insight 9 trường
Công cụ `submit_statement(run_id, statement)` SHALL nhận một câu insight đúng 9 trường của R-C01. MCP SHALL kiểm theo R-I39: có vế Xung đột; mỗi tầng «Tại sao» có mã bằng chứng từ R-IM09 hoặc dừng ở tầng cuối có bằng chứng và ghi «chưa đủ bằng chứng»; ngôi thứ ba; mỗi bước mua một câu; bằng chứng riêng từng sàn; vế thiếu bằng chứng thì cờ Giả thuyết bật; chỉ động cơ và rào cản có trong lời khách (R-I22, R-L12). Câu đạt SHALL được lưu theo đúng dạng để bản 2 nhập vào bảng câu insight của app.

- Loại kiểm: Mã
- Mã kiểm: `tools/mcp-insight/tests/part3/test_statements.py::test_im_q94_exact_nine_fields_and_nested_line_rules`; `tools/mcp-insight/tests/part3/test_statements.py::test_im_q95_every_missing_side_requires_weak_hypothesis`; `tools/mcp-insight/tests/part3/test_statements.py::test_im_q97_first_person_checks_fields_and_notes`; `tools/mcp-insight/tests/part3/test_statements.py::test_im_q101_uuid_append_only_storage_and_app_schema`
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
- Mã kiểm: `tools/mcp-insight/tests/part3/test_render.py::test_im_q102_eighteen_ordered_parts_missing_body_and_escaping`; `tools/mcp-insight/tests/part3/test_render.py::test_im_q104_totals_exact_envelopes_current_rows_and_missing_hash`; `tools/mcp-insight/tests/part3/test_render.py::test_im_q105_archive_dedupe_ignores_deterministically_distinct_clock`; `tools/mcp-insight/tests/part3/test_boundaries_p3.py::test_im_q81_full_flow_has_no_private_results_logs_store_or_files`
- Vì sao: Ngày 30/10/2026 chủ chọn bản 1 ngoài app: trang HTML, dashboard và SQLite (F306); chủ chọn lưu bản dựng lại vào SQLite (F303).

#### Scenario: Lưu hai lần cùng nội dung
- **WHEN** `render_report` chạy hai lần trên cùng các phần đã đạt
- **THEN** SQLite lưu trữ chỉ có một bản

#### Scenario: Phần chưa viết
- **WHEN** Phần 15 chưa được gửi
- **THEN** trang vẫn có Phần 15 với chữ «Chưa viết»
