> Trạng thái: **đề xuất, chờ chủ duyệt**. Mã đã viết trên nhánh `wp/raw-db-labels`. Kiểm thử do lane Sol viết trên nhánh `wp/raw-db-labels-tests`. Chủ quyết ngày 03/11/2026: F366, F367 app (nơi giữ dữ liệu gốc) gán chủ đề cho đánh giá bằng Jev và ghi vào cơ sở dữ liệu app; phương án A: việc gán chạy tự động ngay sau khi nạp đánh giá vào db-v1; MCP Insight chỉ đọc; nhãn của cùng đánh giá và cùng bản bộ chủ đề không bao giờ trả tiền hai lần.

## Why

Sau change `raw-db-review-code`, nhãn chủ đề chỉ vào db-v1 khi được nhập từ kho của một lần chạy MCP Insight. Đánh giá mới nạp (S05) không có nhãn cho tới khi ai đó chạy MCP rồi nhập lại. Chủ muốn app tự gán ngay sau khi nạp, cho ra đúng nhãn MCP sẽ cho, và không gọi Jev lần thứ hai cho đánh giá đã có nhãn.

## What Changes

- **ADDED** vào capability `raw-db`: R-RL01 đến R-RL12. R-RL07 đến R-RL12 theo chủ quyết F376 (rà soát Astra): nhập `CODES` theo cả đánh giá (thay phần bỏ từng nhãn của R-RC06, R-RC07), khoá mỗi lúc một lượt, bản chụp cơ sở dữ liệu app cho MCP Insight.
- Module `src/modules/raw-db/labels-lock.ts` (khoá) và `src/modules/raw-db/app-db-snapshot.ts` (`publishAppDbSnapshot`); `--source SNAPSHOT`.
- Migration `0069_raw_db_v1_review_code_app_jev.sql`: dựng lại `review_code` để `origin` nhận thêm `APP_JEV`; giữ mọi dòng, khoá chính, khoá ngoại, chỉ mục và trigger cấm sửa, cấm xoá. Số bảng không đổi. R-RC01 (change `raw-db-review-code`) nói `origin` chỉ nhận `MCP_IMPORT`; R-RL01 mở rộng điều đó từ migration 0069.
- Module `src/modules/raw-db/review-labeller.ts`: bản TypeScript của bộ gán MCP (`select_block`, `build_request`, `_wire_body`, `parse_answer`, `label_rows`, giới hạn của `code_reviews`) và `labelReviewsInDbV1`.
- `src/platform/ai/typesafe-jev-client.ts`: thêm `answerRaw` (cùng yêu cầu như `answer`, trả mã HTTP và nguyên văn phản hồi) và `typesafeJevRequestBody`. `answer` giữ nguyên hành vi.
- Lệnh `scripts/raw-db-load.ts`: `--source S05` nạp thật rồi gán (`--no-label` để bỏ); `--source LABELS [--run] [--max-calls] [--codebook] [--captures] [--dry-run]`.
- Cập nhật db-v1 §3.3, TL;DR, §5, §6.

## Impact

- Cơ sở dữ liệu: `review_code` được dựng lại, dòng cũ giữ nguyên. Kiểm thử ghim số migration đổi từ 68 sang 69; số bảng giữ 122.
- Gọi Jev có trả tiền khi `TDN_RESEARCH_JEV_ENABLED=true` và có `TYPESAFE_API_KEY`. Không có cờ hoặc khoá thì việc nạp S05 vẫn chạy, không gọi Jev.
- MCP Insight (`tools/mcp-insight`) không đổi. Việc MCP đọc nhãn từ db-v1 là một PR riêng.
- Báo cáo Market và Insight chưa đọc bảng `review_code`.

## Ngoài phạm vi

- Gán chủ đề cho đánh giá TikTok Shop và bình luận TikTok.
- Gán lại khi lời đổi hay khi bộ chủ đề có bản mới (bản mới thì đánh giá lại đủ điều kiện theo R-RL03).
- Đổi lời báo cáo, cờ, nhãn nguồn; triển khai.
