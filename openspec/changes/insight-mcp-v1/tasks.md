## 1. Tài liệu

- [x] 1.1 Viết change này: proposal với sơ đồ, design, spec R-IM01 đến R-IM12, tasks.md (chủ chọn 4 phương án ngày 30/10/2026, F306)
- [x] 1.2 `openspec validate insight-mcp-v1` qua

Cách chia việc: Opus 5.5 medium viết mã (Sol 6.1 medium nếu máy chủ hết lượt Claude). Sol 6.1 xhigh viết kiểm thử ở phiên riêng. Một phiên Sol 6.1 xhigh mới khác rà soát. Trước khi viết mã, phiên viết mã soạn bảng dòng hợp đồng đánh số (IM-Q1…). Mỗi dòng ghi quy tắc R-IM, hành vi và một ca đối chứng âm. Một phiên Sol rà bảng trước khi viết mã.

Chia thành 3 PR nối tiếp. PR sau bắt đầu khi PR trước đã merge.

## 2. PR 1: kho, gán chủ đề, semantic layer

- [x] 2.1 Khung `tools/mcp-insight` giống `tools/mcp-market`; chỉ đọc app; cờ trả phí; khóa từ file (R-IM01)
- [x] 2.2 `build_warehouse`: đánh giá, gợi ý tìm kiếm, Trends, tên sản phẩm; `writer_key`, `writer_known`; chữ khách ở bảng riêng (R-IM02)
- [x] 2.3 Bộ chủ đề v2 là file dữ liệu trong repo; `code_reviews` có `dry_run`, trần lượt gọi, dừng ở lỗi đầu tiên (R-IM03)
- [x] 2.4 Mô hình SLAYER khai báo sẵn; câu SQL đối chiếu cho mỗi số đo (R-IM04)
- [x] 2.5 `theme_counts`, `keyword_counts` với ngưỡng R-I33 và mã số đếm (R-IM05)
- [x] 2.6 `portrait_counts` (R-IM06)
- [x] 2.7 Bộ chủ đề bản `2026-10-30.3` không có Giao hàng, Đóng gói, Dịch vụ shop; vẻ ngoài bao bì thuộc Kiểu dáng, màu sắc, thiết kế; MCP từ chối bộ chủ đề còn 3 chủ đề này (R-IM03, F310, F311)
- [x] 2.8 Sửa R-I39 trong `openspec/changes/insight-method-v1/specs/insight-report/spec.md`: bỏ «giao hàng» khỏi danh sách động cơ và rào cản; thêm câu của chủ ngày 30/10/2026 vào dòng «Vì sao» (F310)

PR 1 merge ngày 30/10/2026: #428 → `c8fc5cda` (Sol 6.1 xhigh PASS tại `f68ac76f`, CI xanh).

## 3. PR 2: khung báo cáo và mức tin

- [x] 3.1 Bảng vai trò nguồn R-I34 là file dữ liệu; `report_plan` 18 phần (R-IM07)
- [x] 3.2 Mức tin trần theo 4 câu kiểm; sổ «cách đo ổn trên bao nhiêu sản phẩm» (R-IM08)
- [x] 3.3 `find_reason_links`, `read_reviews` (R-IM09)

## 4. PR 3: viết, kiểm và đầu ra

- [ ] 4.1 `submit_section` với 8 lý do từ chối; lưu theo phiên bản (R-IM10)
- [ ] 4.2 `submit_statement` 9 trường theo R-I39 (R-IM11)
- [ ] 4.3 `render_report`: HTML, JSON số tổng, lưu SQLite, bỏ bản trùng (R-IM12)
- [ ] 4.4 README: cách đăng ký MCP cho Claude, Codex, OpenCode; một skill ngắn mô tả các bước gọi

## 5. Kiểm thử và hợp nhất (mỗi PR)

- [ ] 5.1 Kiểm thử chạy không mạng, dùng dữ liệu giả; mỗi ca có một ca đối chứng âm
- [ ] 5.2 Kiểm thử theo dòng hợp đồng; CI Linux xanh tại SHA cuối là cổng cuối; không chạy cả bộ trên máy
- [ ] 5.3 Merge khi Sol 6.1 xhigh PASS tại đúng SHA đầu và CI xanh; không dùng merge tự động
- [ ] 5.4 Không cần triển khai: mã chỉ nằm trong `tools/`

## 6. Chạy thật (cần chủ đồng ý)

- [x] 6.1 Chủ chấm 30 mẫu của bộ chủ đề v2. Lần 1 xong 30/10/2026 (F312): 49 nhãn, 42 đúng (86%); 24/30 lời đúng hoàn toàn (80%, đúng ngưỡng §11). Sửa 4 định nghĩa → bản `2026-10-30.3`, vẫn DRAFT. Kết quả: `outputs/insight-mcp-3010/ket-qua-cham-30.md`. Chủ chọn giữ nháp, không chạy lại (F313)
- [x] 6.2 Chủ đồng ý gọi Jev cho canxi và kẽm, đủ khoảng 2.400 lượt, không chấm mẫu: «chốt 2400 mẫu luôn» (30/10/2026, F308). Ước tính 0,5–1 USD.
- [ ] 6.3 Một agent dựng báo cáo canxi và kẽm qua MCP; ghi mức tin từng phần và lỗi cổng kiểm đã gặp

## 7. Kết thúc

- [ ] 7.1 Ghi mã kiểm thật (file, hàm) vào dòng «Mã kiểm» của R-IM01 đến R-IM12
- [ ] 7.2 `/opsx:archive` change insight-mcp-v1
