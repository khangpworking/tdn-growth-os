> Trạng thái: **đề xuất, chờ chủ duyệt**. Mã đã viết trên nhánh `wp/raw-db-v1-s05`. Kiểm thử do lane Sol viết song song. Ánh xạ cột S05 là bản chủ duyệt ngày 03/11/2026.

## Why

`data/raw-sources/KHUON-CSDL.md` (db-v1) định khuôn cơ sở dữ liệu cho từng nguồn gốc. App đã thu đánh giá Shopee công khai (S05) trong mỗi lượt chạy, nhưng đánh giá chỉ nằm trong tệp gốc ở kho tệp. Chưa có bảng nào để truy vấn đánh giá theo sản phẩm, theo lượt chạy hay đếm người viết (view `writer_count`, luật L2).

Change này là lát đầu của db-v1: tạo 4 bảng cho lời khách và nạp đánh giá S05 của một lượt chạy vào đó. Tệp gốc giữ nguyên. Mỗi dòng mới trỏ về tệp gốc.

## What Changes

- **ADDED** capability `raw-db`, yêu cầu R-DB01 đến R-DB06.
- Migration `0063_raw_db_v1_reviews.sql`: bảng `raw_capture`, `product`, `review`, `run_review` (đúng cột, CHECK, UNIQUE, chỉ mục của db-v1 §5, dạng STRICT), view `writer_count`, trigger cấm sửa và xoá. Không chạm bảng cũ.
- Module `src/modules/raw-db/shopee-reviews-loader.ts`: `loadShopeeReviewsToDbV1(db, artifacts, { runId })`. Chỉ đọc lượt thu qua bộ đọc đã kiểm `ShopeeCollectionService.readPublicExact`.
- Lệnh `scripts/raw-db-load.ts --source S05 --run <runId> [--db <path>] [--artifacts <dir>] [--dry-run]` (npm `raw-db:load`). Nguồn khác: thoát mã 2, «source not supported yet».

## Impact

- Cơ sở dữ liệu: thêm 4 bảng và 1 view. Bảng cũ không đổi. Các kiểm thử ghim số migration mới nhất đổi từ 62 sang 63.
- Không gọi nguồn, không tốn tiền, không triển khai. Lệnh nạp chạy tay trên một lượt đã thu.
- `review_coverage` (cần `product_snapshot`) và các nguồn khác (S01, S02, S06, S07…) để lần sau.

## Ngoài phạm vi

- Mã người viết Shopee (`reviewer_key`): chờ change `shopee-public-review-writer-key`. Bản này ghi `NULL` và `reviewer_name_state = 'not_provided'`.
- Bảng `product_snapshot`, `review_code`, `codebook`, `video` và các bảng nguồn khác của db-v1.
- Đổi báo cáo Market hay Insight để đọc các bảng mới.
