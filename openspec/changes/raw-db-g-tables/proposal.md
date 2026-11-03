> Trạng thái: **đề xuất, chờ chủ duyệt**. Mã đã viết trên nhánh `wp/raw-db-g-tables`. Kiểm thử do lane Sol viết song song. Khai báo S19b, S29 và hai thay đổi khuôn là bản chủ duyệt ngày 03/11/2026 (F332).

## Why

App sắp thu hai nguồn Google mới cho Insight: gợi ý tìm kiếm (S19b) và câu trả lời AI Overview (S29). Bộ kẽm đã có hai nguồn này trong tệp gốc (`data/raw-sources/kem-2910/` tệp 12 và 13). db-v1 (`data/raw-sources/KHUON-CSDL.md` §4.4, §4.5) mới chỉ ghi tên cột; chưa có bảng, chưa có bộ nạp.

Change này tạo 3 bảng và bộ nạp cho S19b và S29, đọc từ lần thu của một lượt chạy hoặc từ tệp `raw-v1`. Tệp gốc giữ nguyên. Mỗi dòng mới trỏ về lần thu gốc. Bộ thu (lane, cờ bật) nằm ở change khác.

## What Changes

- **ADDED** vào capability `raw-db`: yêu cầu R-GL01 đến R-GL06.
- Migration `0064_raw_db_v1_google.sql`: bảng `search_suggestion`, `ai_overview_block`, `ai_overview_reference` (đúng db-v1 §5, dạng STRICT, trigger cấm sửa và xoá). Hai thay đổi chủ duyệt: `block_type` chỉ nhận `heading`, `paragraph`, `list_item` (mỗi gạch đầu dòng là một dòng); `ai_overview_reference` có thêm cột `snippet`.
- Cập nhật db-v1 §4.4, §4.5, §5 cho khớp.
- Module `src/modules/raw-db/google-search-loader.ts`: `loadSearchSuggestionsToDbV1` và `loadAiOverviewToDbV1`, đầu vào `{ runId }` hoặc `{ file, runId }`.
- Lệnh `scripts/raw-db-load.ts` nhận thêm `--source S19b|S29` và `--file <path>`. S05 giữ nguyên.

## Impact

- Cơ sở dữ liệu: thêm 3 bảng. Bảng cũ không đổi. Các kiểm thử ghim số migration mới nhất đổi từ 63 sang 64; kiểm thử đếm bảng đổi từ 113 sang 116.
- Không gọi nguồn, không tốn tiền, không triển khai. Lệnh nạp chạy tay.
- Báo cáo Market và Insight chưa đọc các bảng mới.

## Ngoài phạm vi

- Bộ thu S19b và lần gọi `google_ai_overview` theo `page_token` (change của nhánh `wp/raw-db-g-collectors`).
- Nạp kẽm trên máy chủ: S29 từ lượt chạy `f0f4799a`, S19b từ tệp 13; không nạp cùng một nguồn từ cả hai đường. Việc này do chủ triển khai.
