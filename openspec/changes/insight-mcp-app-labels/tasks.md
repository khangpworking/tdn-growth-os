## 0. Trước khi làm

- [x] 0.1 Đọc migration 0068, bộ nạp `src/modules/raw-db/review-code-loader.ts` (quy tắc dấu lời), `tools/mcp-insight/insight_tools.py`, `CONTRACT.md`, kiểm thử MCP
- [ ] 0.2 Chủ duyệt change này

## 1. Mã (một người viết mã)

- [x] 1.1 `build_warehouse` đọc nhãn và cảm xúc theo sao từ bản chụp cơ sở dữ liệu app; `APP_CODEBOOK_MISMATCH`; `labelTextMismatch`
- [x] 1.2 `code_reviews` trả `LABELS_FROM_APP`; bỏ đường gọi Jev, đọc khoá và cờ cho gán chủ đề
- [x] 1.3 `theme_counts`: `labelSource`, `codedReviews`, `uncodedReviews`, ghi chú «chưa gán nhãn»
- [x] 1.4 Công cụ `star_counts`, model SLAYER `star_review`, ghi `count_registry`
- [x] 1.5 `CONTRACT.md` bản 24, `README.md`, skill; kiểm thử cũ gán nhãn qua cơ sở dữ liệu app tổng hợp
- [x] 1.6 Sửa F376: `NO_THEME` nguồn `MCP_IMPORT` không kiểm dấu lời; đọc bản sao sạch app xuất bản (`APP_DB_SNAPSHOT_MISSING`, `publishedAt`), bỏ chép CSDL đang chạy; `CONTRACT.md` bản 25

## 2. Kiểm thử (lane Sol, phiên khác người viết mã) và hợp nhất

- [ ] 2.1 Kiểm thử theo R-IM19, R-IM20 và IM-Q166 đến IM-Q171 trên dữ liệu tổng hợp; mỗi ca có ca đối chứng âm
- [ ] 2.2 CI Linux xanh tại SHA cuối; rà soát độc lập
- [ ] 2.3 Merge khi chủ duyệt
