> Trạng thái: **đề xuất, chờ chủ duyệt**. Mã trên nhánh `wp/mcp-app-labels`. Kiểm thử do lane Sol viết trên nhánh `wp/mcp-app-labels-tests`. Chủ quyết ngày 03/11/2026 (F361–F367): nhãn chủ đề nằm trong cơ sở dữ liệu app (`review_code`, `codebook`, view `review_star_sentiment`, migration 0068); app gán nhãn bằng Jev (PR riêng); MCP Insight chỉ đọc, không ghi cơ sở dữ liệu app và không gọi Jev để gán chủ đề nữa.

## Why

MCP Insight đang tự gán chủ đề bằng Jev (`code_reviews`) và giữ nhãn trong kho của lần chạy. Chủ đã quyết nhãn thuộc cơ sở dữ liệu app, nên hai nơi gán nhãn sẽ cho hai bộ số khác nhau. MCP cần đếm đúng nhãn app đã gán, có bằng chứng nhãn thuộc đúng lời khách trong kho, và đếm thêm cảm xúc theo sao từ view của app.

## What Changes

- **MODIFIED** R-IM01: cờ `INSIGHT_MCP_ALLOW_PAID` chỉ còn cho gán ý con (`code_claims`); `code_reviews` không gọi Jev.
- **MODIFIED** R-IM03: nhãn chủ đề do app gán; `build_warehouse` đọc nhãn từ cơ sở dữ liệu app (khớp đánh giá, đúng bản bộ chủ đề và dấu SHA-256 của tệp, dấu lời khách); `code_reviews` trả `LABELS_FROM_APP`.
- **ADDED** R-IM19: `theme_counts` ghi nguồn nhãn `app_db`, số đánh giá đã gán và chưa gán theo sàn, ghi «chưa gán nhãn» khi chưa có nhãn.
- **ADDED** R-IM20: công cụ mới `star_counts` đếm cảm xúc theo sao từ view của app.
- `tools/mcp-insight/insight_tools.py`, `CONTRACT.md` (bản 24, IM-Q166 đến IM-Q171), `README.md`, skill `tdn-insight-report`, model SLAYER `semantic/star_review.yaml`; kiểm thử cũ của MCP gán nhãn qua cơ sở dữ liệu app tổng hợp.

## Impact

- MCP Insight: đọc thêm `review`, `codebook`, `review_code`, `review_star_sentiment` từ bản chụp chỉ đọc của cơ sở dữ liệu app. Không ghi app. Kho dựng trước thay đổi này phải dựng lại (`WAREHOUSE_REBUILD_NEEDED`).
- App (`src/`) và migration không đổi.
- Lớp ý con (`code_claims`) không đổi, vẫn gọi Jev khi có cờ.
- Không gọi nguồn, không gọi AI, không triển khai.

## Ngoài phạm vi

- Bộ gán nhãn bằng Jev trong app (PR riêng).
- Đưa `star_counts` vào khung 18 phần (`data/report-frame.json`) hay đổi lời báo cáo về sao.
- Lớp ý con.
