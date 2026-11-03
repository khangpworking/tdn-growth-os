> Trạng thái: **đề xuất, chờ chủ duyệt**. Mã đã viết trên nhánh `wp/raw-db-s14`. Kiểm thử do lane Sol viết trên nhánh `wp/raw-db-s14-tests`. Chủ quyết ngày 03/11/2026: F356 phương án A, làn xem video chỉ xem video chủ chọn và video bán chạy, không xem video từ tìm kiếm; F354 và F356 cơ sở dữ liệu không lưu nhận định của AI (giọng, nguồn gốc, loại video, có nói về sản phẩm không); F349 chữ lưu đúng như đọc được.

## Why

Lần chạy f0f4799a xem 3 video, cả 3 lấy từ tìm kiếm Google `site:tiktok.com` (Kalodata video khi đó bị từ chối). Video tìm kiếm có thể không phải video bán hàng của sản phẩm. Chủ chọn chỉ xem video chủ chọn và video bán chạy. Ngoài ra db-v1 (`data/raw-sources/KHUON-CSDL.md` §4.1) mới có bản phác cho lời nói trong video (S14): một video một dòng và có cột nhận định của AI.

## What Changes

- **ADDED** vào capability `report-pipeline`: R-VR01. `videoWatchCandidates` (`video-watch-lane.ts`) chỉ lấy video chủ chọn rồi video bán chạy (bảng tải lên trước, tra tự động sau). Không thêm dòng tìm kiếm (`EXPANDED_SEARCH`); tham số `queries` giữ cho tương thích nhưng không thêm gì. Tối đa video bán chạy đổi 5 → 10; tổng vẫn 10. Không có video bán chạy thì không lấy video tìm kiếm thay. Tìm kiếm vẫn chạy và vẫn vào bảng kết quả web của Market. Lời báo cáo, cờ, nhãn nguồn, lời nhắc Gemini và bộ lọc «nói về sản phẩm» của app giữ nguyên.
- **ADDED** vào capability `raw-db`: R-VR02 đến R-VR07.
- Migration `0067_raw_db_v1_video_reading.sql`: bảng `video_reading` và `video_segment` (STRICT, trigger cấm sửa và xoá).
- Module `src/modules/raw-db/video-reading-loader.ts`: `loadVideoReadingsToDbV1`, đầu vào `{ runId }` hoặc `{ file, runId }`. Lượt chạy đọc lần đọc qua bộ đọc đã kiểm của app (`readStoredVideoWatchReadings` của service, cùng các bước kiểm như `verifyAutomatedVideoReading` nhưng trả cả lần đọc không nói về sản phẩm).
- Lệnh `scripts/raw-db-load.ts --source S14` với `--run`, `--file`, `--privacy-file`, `--dry-run`.
- Cập nhật db-v1: §4.1 thay bản phác bằng hai bảng mới, §4.1a (S14 điền `video`), thứ tự nạp S02b trước S14, §5 SQL.

## Impact

- Cơ sở dữ liệu: thêm 2 bảng. Bảng cũ không đổi. Kiểm thử ghim số migration đổi từ 66 sang 67; kiểm thử đếm bảng đổi từ 118 sang 120.
- Làn xem video: lần chạy chỉ có video tìm kiếm nay xem 0 video (bước báo như danh sách rỗng hiện nay). Ít lần gọi Gemini trả phí hơn khi không có video bán chạy; nhiều hơn tới 5 lần khi có trên 5 video bán chạy. Các kiểm thử cũ ghim thứ tự có video tìm kiếm hoặc trần 5 được sửa theo luật mới (danh sách trong PR).
- Không gọi nguồn khi làm change này, không triển khai. Lệnh nạp chạy tay và cần tệp khoá riêng (cùng khoá với S07).
- Báo cáo Market và Insight chưa đọc bảng mới.

## Ngoài phạm vi

- Đổi lời báo cáo, cờ, nhãn nguồn, lời nhắc Gemini hay bộ lọc «nói về sản phẩm» của app.
- Lưu nhận định của AI (giọng, loại video, có nói về sản phẩm không) vào cơ sở dữ liệu.
- Đoán sản phẩm của video. Video S14 mới luôn `UNKNOWN`; nối sản phẩm chỉ đến từ S02b.
- Nạp trên máy chủ (do chủ triển khai).
