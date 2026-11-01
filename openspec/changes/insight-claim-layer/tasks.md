## 1. Tài liệu và chạy thử

- [x] 1.1 Chạy thử ngoài app trên canxi `a2419abf` (chủ đề Công dụng và Vị): AI gom danh mục, Jev gán, đo 5 số, Astra và Opus 5.5 chấm chéo 2 vòng (F322, chọn 3A)
- [x] 1.2 Viết change này: proposal, spec R-IM13 đến R-IM18, tasks.md
- [x] 1.3 `openspec validate insight-claim-layer` qua (OpenSpec 1.15.0 trên main `8e780c5c`; chỉ có cảnh báo >500 ký tự như thường lệ)
- [x] 1.4 Quy chuẩn dữ liệu đầu vào lên bản 1.49: ngoại lệ L1 cho bằng chứng ý con (R-IM15)

Cách chia việc giống insight-mcp-v1: Opus 5.5 medium viết mã. Sol 6.1 xhigh viết kiểm thử ở phiên riêng. Một phiên Sol 6.1 xhigh mới khác rà soát. Một PR.

## 2. PR: lớp ý con trong MCP Insight

- [x] 2.1 Danh mục ý con là dữ liệu có số bản. MCP không gọi AI: `claim_catalogue_packet` ghi lời khách của chủ đề ra thư mục ngoài repo; một tác nhân ngoài (Claude Sonnet 5.5, chỉ đọc; `claims/prompt-draft.md`, `claims/draft_catalogue.sh`) gom danh mục; danh mục chỉ vào kho qua `submit_claim_catalogue` (R-IM13)
- [x] 2.2 Chấm chéo: `claim_grading_packet` ghi mẫu chấm; `claims/cross_grade.sh` chạy Astra và Opus 5.5 chấm 2 vòng ngoài MCP; `record_claim_grades` kiểm, lưu cả hai bản chấm, quyết định đạt hay nháp (R-IM13)
- [x] 2.3 `code_claims` có `dry_run`, trần lượt gọi, cờ trả phí; bỏ dòng thuộc tính; câu hỏi lời cụ thể và văn rác (R-IM14)
- [x] 2.4 Nhóm gần trùng trên cả lần chạy; hai số đánh giá và bằng chứng (R-IM15)
- [x] 2.5 `claim_counts`: 5 số đo, cờ, ngưỡng R-I33, bão hoà, phần «Khác» (R-IM16, R-IM17)
- [x] 2.6 `submit_section` từ chối câu xếp ý con thiếu thước đo, mẫu hoặc kỳ (R-IM18)

## 3. Kiểm thử và hợp nhất

- [ ] 3.1 Sol 6.1 xhigh viết kiểm thử theo bảng dòng hợp đồng, mỗi dòng có ca đối chứng âm
- [ ] 3.2 CI xanh; Sol 6.1 xhigh PASS tại đúng head; merge (không dùng `--auto`)
- [ ] 3.3 Chạy lại trên canxi và kẽm đã lưu; trả phí Jev cần chủ đồng ý lại nếu vượt 1 USD
