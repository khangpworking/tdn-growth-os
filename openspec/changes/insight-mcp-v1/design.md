## Bối cảnh

Kiểm ngày 30/10/2026 trên main `3f85531a`:
- Đánh giá Shopee của lần chạy nằm trong `foundation_shopee_collections` (khóa `auto-<mã lần chạy>`). Gợi ý tìm kiếm, Trends và các nguồn khác nằm trong `analysis_research_automation_captures` và kho file theo sha256.
- Đánh giá do bộ thu miễn phí lưu không có tên người viết. Trường `attribution` chỉ ghi tên nguồn.
- `tools/mcp-market` là mẫu: FastMCP, Python, gọi owner API, ghi bị chặn nếu thiếu cờ, kiểm thử chạy không mạng.
- SLAYER 1.4.1 có `slayer mcp` cho hỏi tự do. Bản thử `mcp-proto` (26/10/2026) dùng cách này.
- Jev (TypeSafe System One) có bộ chủ đề v2 dạng dữ liệu: 16 chủ đề lõi và 5 khối theo ngành, 17 đến 20 câu hỏi cho mỗi đánh giá, trạng thái DRAFT.

## Quyết định kỹ thuật

1. **Ngôn ngữ và chỗ đặt.** Python, `tools/mcp-insight`, tên server `tdn-insight`, chạy stdio trên máy chủ. Cấu trúc giống `tools/mcp-market`: `insight_tools.py`, `README.md`, `.mcp.json.example`, `requirements.txt`, `tests/`.
2. **Kho của lần chạy.** Mỗi lần chạy có một file SQLite riêng trong thư mục dữ liệu của MCP (biến môi trường, không ghi đường dẫn vào spec). Bảng nhãn và bảng số không có chữ của khách. Chữ của khách nằm ở một bảng riêng, chỉ bước gán chủ đề và bước kiểm trích dẫn đọc.
3. **Người viết.** Nguồn có tên người viết thì `writer_key` là băm của tên. Nguồn không có tên thì `writer_key` là mã đánh giá, và cờ `writer_known = 0`. Giả định (chưa có quyết định của chủ): khi `writer_known = 0`, ngưỡng R-I33 tính trên số đánh giá, kết quả mang ghi chú «đếm theo đánh giá, nguồn không có tên người viết», và câu kiểm 2 của R-I32 tính là thiếu.
4. **Semantic layer.** Mô hình SLAYER là file YAML trong repo, sinh lại từ kho mỗi lần chạy. Số đo cố định, tên số đo khác tên cột. MCP không mở `slayer mcp` hỏi tự do. Mỗi công cụ đếm có một câu SQL đối chiếu trong kiểm thử.
5. **Jev.** Bộ chủ đề là file JSON có `version` và `status`. Mỗi đánh giá một lời gọi, nhiều câu hỏi. Kết quả lưu kèm phiên bản bộ chủ đề và xác suất. Ngưỡng nhận nhãn lấy từ file bộ chủ đề. Khóa đọc từ file, không in ra.
6. **Mức tin trần.** MCP tính mức tin cao nhất cho phép của từng ý theo 4 câu kiểm R-I32. Agent chỉ được ghi bằng hoặc thấp hơn. Sổ «cách đo đã ổn trên bao nhiêu sản phẩm» (câu kiểm 4) là một bảng trong kho chung của MCP, cập nhật khi chủ duyệt một bản báo cáo.
7. **Viết và kiểm.** Agent gửi từng phần kèm danh sách ý. Mỗi ý trỏ tới mã số đếm MCP đã trả. MCP kiểm rồi mới lưu. Câu insight lưu đúng 9 trường của R-C01 để bản 2 nhập vào app.
8. **Kiểm trích nguyên văn.** Một đoạn 8 từ liên tiếp trùng với chữ của bất kỳ đánh giá nào của lần chạy (sau khi bỏ dấu câu, chữ thường) thì bị coi là trích nguyên văn.
9. **Đầu ra.** Trang HTML tĩnh 18 phần, các file JSON số tổng (dạng `{"rows": [...]}`) cho dashboard, và một bản lưu trong SQLite lưu trữ (giống `8-luu-dashboard.py` đã thử ngày 30/10/2026: bỏ qua bản giống hệt).

## Rủi ro

- Bộ chủ đề v2 chưa được chủ chấm. Mọi kết luận dựa trên nhãn bị giới hạn ở mức Khá trở xuống cho đến khi chủ chấm.
- Chỉ có 2 sản phẩm (canxi, kẽm), cùng ngành thực phẩm. Câu kiểm 4 chưa đạt. Mức Chắc chưa thể có ở bản 1.
- Nguồn miễn phí không có tên người viết (quyết định 3). Câu kiểm 2 thiếu với mọi chủ đề từ đánh giá cho đến khi bộ thu lưu tên.
- Agent khác nhau viết câu khác nhau. Cổng kiểm giữ đúng số và mức tin, không giữ được giọng văn.
