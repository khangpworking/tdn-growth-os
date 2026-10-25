## 0. Trước khi làm

- [x] 0.1 Chủ duyệt sửa D7 (rà kiến trúc c4, 24/10/2026)

## 1. Mã (PR #373)

- [x] 1.1 `report-language/glossary.ts`: một danh sách `MARKET_GLOSSARY` (17 thuật ngữ quy tắc 1, rồi 18 thuật ngữ chỉ của bản đọc) và một bộ nhận `glossaryTermPattern`
- [x] 1.2 `market-14-rules.ts`: `GLOSSARY` lấy từ danh sách chung
- [x] 1.3 `market-reader-glossary.ts`: hai danh sách bản đọc lấy từ danh sách chung, giữ nguyên byte và thứ tự; bộ lọc dùng `glossaryTermPattern`

## 2. Kiểm thử (PR #373)

- [x] 2.1 `tests/unit/report-language-glossary.test.ts`: ca theo dòng hợp đồng ("peerset" tính, "P250" không tính, danh sách giữ nguyên byte)
- [x] 2.2 Typecheck và các kiểm thử đơn vị liên quan xanh

## 3. Sau khi gộp

- [x] 3.1 `/opsx:archive` change này; spec `market-report` nhận R-M01 mới
