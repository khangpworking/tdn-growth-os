> Trạng thái: **đề xuất, chờ chủ duyệt**. Mã đã viết trên nhánh `wp/raw-db-s07`. Kiểm thử do lane Sol viết trên nhánh `wp/raw-db-s07-tests`. Chủ quyết ngày 03/11/2026: F335 (a) chỉ lưu mã băm người viết, không lưu tên; F336 làm bảng và bộ nạp ngay, bộ thu giữ nguyên (cờ tắt).

## Why

Bình luận dưới video TikTok (S07) là lời khách cho Insight. Bảng `review` (migration 0063) đã nhận S07 nhưng chưa có bộ nạp, và db-v1 (`data/raw-sources/KHUON-CSDL.md` §4.1a) mới chỉ ghi cột của bảng `video`. Bộ kẽm có tệp 17 (`data/raw-sources/kem-2910/17-S07-tiktok-binh-luan.json`); app lưu bình luận đã che trong gói nguồn P9.

## What Changes

- **ADDED** vào capability `raw-db`: yêu cầu R-TC01 đến R-TC06.
- Migration `0065_raw_db_v1_video.sql`: bảng `video` đúng db-v1 §5 (STRICT, trigger cấm sửa và xoá).
- Hàm băm người viết `tikTokPrivacyKey` tách ra từ bộ thu app; bộ thu và bộ nạp dùng chung. Đầu ra của bộ thu giữ nguyên từng byte.
- Module `src/modules/raw-db/tiktok-comments-loader.ts`: `loadTikTokCommentsToDbV1`, đầu vào `{ runId }` hoặc `{ file, runId }`.
- Lệnh `scripts/raw-db-load.ts --source S07` với `--file`, `--privacy-file`, `--dry-run`.
- Cập nhật db-v1 §3 (cột S07) và §4.1a (`author_key`, bản đầu tiên thắng).

## Impact

- Cơ sở dữ liệu: thêm 1 bảng. Bảng cũ không đổi. Kiểm thử ghim số migration đổi từ 64 sang 65; kiểm thử đếm bảng đổi từ 116 sang 117.
- Không gọi nguồn, không tốn tiền, không triển khai. Lệnh nạp chạy tay và cần tệp khoá riêng.
- Báo cáo Market và Insight chưa đọc bảng mới.

## Ngoài phạm vi

- Thay đổi bộ thu S07 hay cờ của nó.
- Nối video với sản phẩm: lựa chọn video của app chưa ghi sản phẩm, nên mọi video hiện là `UNKNOWN`.
- Nạp kẽm trên máy chủ (do chủ triển khai).
