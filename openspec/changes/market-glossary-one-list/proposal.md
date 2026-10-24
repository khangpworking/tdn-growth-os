# Một danh sách thuật ngữ Market, một cách nhận ra thuật ngữ

> Trạng thái: **đã làm trong PR #373** (c4 PR3), theo duyệt của chủ ngày 24/10/2026. Chờ gộp rồi archive.

## Why

Rà kiến trúc c4, lỗi D7: cùng 17 thuật ngữ Market nằm ở hai danh sách (`GLOSSARY` trong `market-14-rules.ts` và `MARKET_READER_TERMS` trong `market-reader-glossary.ts`), và hai nơi nhận ra thuật ngữ theo hai cách khác nhau. Bộ kiểm quy tắc 1 coi "P250" là "P25" và đòi giải thích; bảng thuật ngữ của bản đọc lại bỏ dòng "peer set" khi bài viết "peerset". Kết quả: một báo cáo có thể trượt R-M01 vì chính bảng thuật ngữ của nó. Chủ duyệt sửa ngày 24/10/2026.

## What Changes

- **MODIFIED** R-M01: danh sách thuật ngữ và cách nhận ra một thuật ngữ nằm ở một chỗ (`src/modules/analysis/report-language/glossary.ts`), dùng chung cho bộ kiểm quy tắc 1 và bảng thuật ngữ của bản đọc. Thuật ngữ được nhận ra theo cả từ (không tính khi dính chữ hoặc số), không phân biệt hoa thường, khoảng trắng bên trong có thể thiếu: "peerset" tính là "peer set"; "P250" không tính là "P25".

## Impact

- Mã: `src/modules/analysis/report-language/glossary.ts` (mới: `MARKET_GLOSSARY`, `glossaryTermPattern`); `research-automation/market-14-rules.ts` (`GLOSSARY` lấy từ danh sách chung); `research-automation/market-reader-glossary.ts` (`MARKET_READER_TERMS`, `CURRENT_MARKET_READER_TERMS` lấy từ danh sách chung, giữ nguyên từng byte và thứ tự; `filterReaderGlossary` dùng `glossaryTermPattern`).
- Kiểm thử: `tests/unit/report-language-glossary.test.ts`. Băm bản đọc cũ không đổi.
- Không đổi nguồn, không gọi nguồn trả phí, không đổi cờ môi trường.

## Ngoài phạm vi

- Bảng thuật ngữ tiếng Việt của mẫu v1 (`reader-report/market-template.ts`) giữ nguyên.
- "AI" vẫn không phân biệt hoa thường; đổi điều này cần quyết định riêng của chủ.
