## 0. Trước khi làm

- [x] 0.1 Thử bộ nhãn và câu lọc bằng Jev trên dữ liệu có sẵn (F440, F441)
- [x] 0.2 Chủ chốt 10 nhãn và câu lọc mới (F442)

## 1. Mã (một người viết mã)

- [ ] 1.1 `tools/mcp-insight/data/insight-theme-codebook.json` đúng tệp đã ghim
- [ ] 1.2 Migration `0073_raw_db_v1_review_code_choice.sql`
- [ ] 1.3 `src/modules/raw-db/review-labeller.ts`
- [ ] 1.4 `src/modules/raw-db/review-filter.ts`
- [ ] 1.5 `tools/mcp-insight/insight_tools.py`
- [ ] 1.6 Cập nhật `tools/mcp-insight/CONTRACT.md`, `data/raw-sources/KHUON-CSDL.md`
- [ ] 1.7 Cập nhật kiểm thử ghim số migration, số cột, bản bộ nhãn và bản policy

## 2. Kiểm thử (một người khác)

- [ ] 2.1 Kiểm thử theo từng R-RV, có đối chứng âm

## 3. Rà soát và phát hành

- [ ] 3.1 Một phiên Sol mới rà soát, `VERDICT: PASS` ở đúng đầu nhánh
- [ ] 3.2 CI xanh, merge
- [ ] 3.3 Deploy (chờ chủ nói «deploy <SHA>»)
- [ ] 3.4 Gán lại nhãn cho dữ liệu cũ (chờ chủ quyết, có phí Jev)
