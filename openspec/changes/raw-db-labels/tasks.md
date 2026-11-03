## 0. Trước khi làm

- [x] 0.1 Đọc bộ gán MCP (`tools/mcp-insight/insight_tools.py`: `select_block`, `build_request`, `_wire_body`, `parse_answer`, `label_rows`, `code_reviews`), tệp chủ đề, app Jev client, bộ nạp S05 và CODES, migration 0068
- [ ] 0.2 Chủ duyệt change này

## 1. Mã (một người viết mã)

- [x] 1.1 Migration `0069_raw_db_v1_review_code_app_jev.sql`: `origin` nhận `APP_JEV`, giữ dòng, khoá, chỉ mục, trigger
- [x] 1.2 `src/modules/raw-db/review-labeller.ts`: bản TypeScript của bộ gán MCP và `labelReviewsInDbV1`
- [x] 1.3 `typesafe-jev-client.ts`: `answerRaw`, `typesafeJevRequestBody`; `answer` không đổi
- [x] 1.4 `scripts/raw-db-load.ts`: gán sau khi nạp S05 thật, `--no-label`, `--source LABELS`
- [x] 1.5 Cập nhật db-v1 §3.3, TL;DR, §5, §6
- [x] 1.6 Cập nhật kiểm thử ghim số migration (68 → 69)
- [x] 1.7 So khớp với Python MCP ngoại tuyến trên 3 đánh giá tổng hợp và câu trả lời giả: thân yêu cầu và nhãn bằng nhau

## 2. Kiểm thử (lane Sol, phiên khác người viết mã) và hợp nhất

- [ ] 2.1 Kiểm thử theo R-RL01 đến R-RL06 với fetch giả (không gọi mạng), dữ liệu tổng hợp (lời tiếng Việt, emoji, `attributes`); mỗi ca có ca đối chứng âm
- [ ] 2.2 CI Linux xanh tại SHA cuối; rà soát độc lập
- [ ] 2.3 Merge khi chủ duyệt

## 3. Kết thúc

- [ ] 3.1 Ghi mã kiểm thật vào dòng «Mã kiểm» của R-RL01 đến R-RL06
- [ ] 3.2 `/opsx:archive` change `raw-db-labels`
