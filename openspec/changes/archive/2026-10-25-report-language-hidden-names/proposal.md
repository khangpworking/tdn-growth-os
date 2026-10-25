# Một danh sách tên bị cấm cho cả hai báo cáo

> Trạng thái: **đã duyệt**, theo quyết định của chủ ngày 24/10/2026 (c4 Q1 đến Q5). Mã đổi trong PR #372 (c4 PR2).

## Why

Trước đây, danh sách tên bị cấm nằm ở nhiều nơi trong mã, mỗi nơi một kiểu. Market kiểm đủ tên ở cổng `G08_PROVIDER_NAME`. Insight chỉ kiểm 4 tên dữ liệu. Một câu trong Insight nêu "Google" hay "OpenAI" vẫn lọt.

Quyết định của chủ (24/10/2026):
- Q1: Insight cấm đủ tên như Market.
- Q2: chữ thường "metric" được phép; "Metric" và "METRIC" vẫn bị cấm.
- Q3: chữ chép từ nguồn (trích review, tiêu đề web, đoạn PDF, chữ quảng cáo) có tên bị cấm thì chỉ ẩn mục đó. Báo cáo chỉ dừng khi chữ do hệ thống tự viết có tên bị cấm.
- Q4: tên công cụ thu review công khai bị cấm ở mọi báo cáo, không cần cờ.
- Q5: tên nằm trong chữ ẩn cũng là lộ tên: thuộc tính hidden, display:none, aria-hidden, alt/title/aria-label, `<title>`, chữ trong SVG. Địa chỉ liên kết (href) không tính.

## What Changes

- **MODIFIED** R-L01: một danh sách tên đầy đủ, áp dụng cho cả Market và Insight; ghi rõ Q2 đến Q5. Mã kiểm trỏ về `src/modules/analysis/report-language/hidden-names.ts`.
- **MODIFIED** R-M15: danh sách tên của cổng `G08_PROVIDER_NAME` lấy từ module trên. Cổng đọc cả chữ ẩn.
- **ADDED** R-I29: Insight tuân đầy đủ R-L01. Lint F1 và W6 chạy trên bản đọc Insight cuối cùng.
- Phụ lục kiểm chéo của Insight không còn nêu tên mô hình và nhà cung cấp của hai lượt. Câu mới: «Lượt đầu và lượt kiểm chéo dùng hai mô hình khác nhau.»

## Impact

- Mã: `src/modules/analysis/report-language/` (danh sách và cách so khớp), `reader-report/lint.ts` (F1, W6), `research-automation/market-business-gate.ts` (G08), `citation-registry.ts`, `web-page-type.ts`, `reader-plain-text.ts`, `pdf-excerpt.ts`, `reader-report/market-template.ts`, `comtrade-lane.ts`, `official-statistics-lane.ts`, `research-automation/reports.ts`.
- Kiểm thử: `tests/unit/report-language-hidden-names.test.ts`, `tests/unit/c4-report-language-callers.test.ts`, `tests/unit/c4-paid-lane-name-pins.test.ts`.
- Nguồn trả phí: không gọi thêm, không đổi số lần thử lại. Bộ lọc của các nguồn trả phí chỉ đổi kết quả với chữ có tên mới thêm vào danh sách.
- Tài liệu: `docs/business-spec/business-rules/*.md` nay là stub; không sửa.

## Ngoài phạm vi

- Bảng giải thích thuật ngữ (PR c4 PR3).
- Tổng hai sàn (R-M16) và lint U13 giữ nguyên.
- Triển khai lên máy chạy thật: cần câu «deploy <SHA>» riêng của chủ.
