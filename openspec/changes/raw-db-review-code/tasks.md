## 0. Trước khi làm

- [x] 0.1 Đọc db-v1 (`data/raw-sources/KHUON-CSDL.md` §3, §3.3, §3.4, §5), tệp chủ đề `tools/mcp-insight/data/insight-theme-codebook.json`, bộ nạp S05 (cách lưu `text` và `attributes_json`), kho MCP kẽm (bản sao chỉ đọc)
- [ ] 0.2 Chủ duyệt change này

## 1. Mã (một người viết mã)

- [x] 1.1 Migration `0068_raw_db_v1_review_code.sql`: `codebook`, `review_code` STRICT, trigger, view `review_star_sentiment`
- [x] 1.2 `src/modules/raw-db/review-code-loader.ts`: khớp đánh giá, kiểm dấu đoạn lời, dòng `NO_THEME`, một giao dịch, nạp lại không thêm dòng
- [x] 1.3 Lệnh `scripts/raw-db-load.ts --source CODES --mcp-run --codebook --coder [--db] [--dry-run]`
- [x] 1.4 Cập nhật db-v1 §3.3, §3.4, §5, §6
- [x] 1.5 Cập nhật các kiểm thử ghim số migration (67 → 68) và số bảng (120 → 122)

## 2. Kiểm thử (lane Sol, phiên khác người viết mã) và hợp nhất

- [ ] 2.1 Kiểm thử theo R-RC01 đến R-RC07 trên dữ liệu tổng hợp (mã, lời tiếng Việt, emoji, danh sách `attributes`); mỗi ca có ca đối chứng âm
- [ ] 2.2 CI Linux xanh tại SHA cuối; rà soát độc lập
- [ ] 2.3 Merge khi chủ duyệt

## 3. Kết thúc

- [ ] 3.1 Ghi mã kiểm thật vào dòng «Mã kiểm» của R-RC01 đến R-RC07
- [ ] 3.2 `/opsx:archive` change `raw-db-review-code`
