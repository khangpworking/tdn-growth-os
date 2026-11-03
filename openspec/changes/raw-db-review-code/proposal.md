> Trạng thái: **đề xuất, chờ chủ duyệt**. Mã đã viết trên nhánh `wp/raw-db-codes`. Kiểm thử do lane Sol viết trên nhánh `wp/raw-db-codes-tests`. Chủ quyết ngày 03/11/2026: F361, F362 nhãn chủ đề nằm trong cơ sở dữ liệu app (db-v1), tệp JSON vẫn là nơi sửa danh sách chủ đề, MCP Insight chỉ đọc; nhãn kẽm Jev gán ngày 30/10 được nhập, không gọi AI, chỉ khi dấu của đoạn lời khớp; F363 cảm xúc theo sao là một view; F349 giá trị giữ đúng như người gán đã ghi.

## Why

Nhãn chủ đề của bộ kẽm chỉ nằm trong kho của một lần chạy MCP Insight (`runs/<runId>.sqlite`). db-v1 (`data/raw-sources/KHUON-CSDL.md` §3.3) mới có bản phác cho `codebook` và `review_code`, với giá trị tiếng Anh (`positive`, `after_purchase`) khác giá trị người gán đã ghi (`khen`, `Sau mua`). Báo cáo cần đếm chủ đề và cảm xúc theo sao từ cơ sở dữ liệu app, có bằng chứng nhãn thuộc đúng lời khách đã lưu.

## What Changes

- **ADDED** vào capability `raw-db`: R-RC01 đến R-RC07.
- Migration `0068_raw_db_v1_review_code.sql`: bảng `codebook`, `review_code` (STRICT) và view `review_star_sentiment`. `review_code` cấm sửa và xoá; `codebook` cấm xoá và chỉ cho đổi `DRAFT` → `APPROVED`.
- Module `src/modules/raw-db/review-code-loader.ts`: `loadReviewCodesToDbV1(db, { mcpRunFile, codebookFile, coder })`.
- Lệnh `scripts/raw-db-load.ts --source CODES --mcp-run <file> --codebook <json> --coder <name> [--db] [--dry-run]`. Không cần tệp khoá riêng.
- Cập nhật db-v1: §3.3 thay bản phác bằng hai bảng mới và view, §3.4 bảng đối chiếu, §5 SQL và hai câu ví dụ, §6.

## Impact

- Cơ sở dữ liệu: thêm 2 bảng và 1 view. Bảng cũ không đổi. Kiểm thử ghim số migration đổi từ 67 sang 68; kiểm thử đếm bảng (`source-package-read-query`, chỉ đếm `type='table'`, không đếm view) đổi từ 120 sang 122.
- MCP Insight (`tools/mcp-insight`) không đổi và không ghi vào cơ sở dữ liệu app. Tệp kho MCP chỉ được đọc.
- Không gọi nguồn, không gọi AI, không triển khai. Lệnh nạp chạy tay.
- Báo cáo Market và Insight chưa đọc bảng mới.

## Ngoài phạm vi

- Lệnh duyệt bộ chủ đề (`DRAFT` → `APPROVED`).
- Gán nhãn mới bằng AI, hay ghi nhãn từ MCP thẳng vào cơ sở dữ liệu app.
- Đổi lời báo cáo, cờ, nhãn nguồn.
- Nạp trên máy chủ (do chủ triển khai).
