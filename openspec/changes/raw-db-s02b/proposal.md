> Trạng thái: **đề xuất, chờ chủ duyệt**. Mã đã viết trên nhánh `wp/raw-db-s02b`. Kiểm thử do lane Sol viết trên nhánh `wp/raw-db-s02b-tests`. Chủ quyết ngày 03/11/2026: F347 số theo từng video của Kalodata có mã nguồn riêng S02b «Kalodata video», S02 đổi tên «Kalodata sản phẩm»; F349 tên video lưu đúng như nguồn trả.

## Why

Lần chạy f0f4799a có 3 lần gọi `kalodata.video.rank`, cả 3 bị Kalodata từ chối (mã 501: «region and language and currency and date_range are required»), nên 0 video. Yêu cầu của app thiếu `region`, `language`, `currency`, `date_range` và dùng `rank_field`/`asc` thay cho `sort_field`. Ngoài ra db-v1 (`data/raw-sources/KHUON-CSDL.md`) chưa có chỗ lưu số theo từng video (doanh thu, lượt xem, quảng cáo).

## What Changes

- Sửa yêu cầu `kalodata.video.rank` trong `provider-kalodata.ts`: thêm `region` VN, `language` vi-VN, `currency` VND, `date_range` = kỳ 30 ngày của lần xếp hạng sản phẩm cùng lần chạy, `sort_field {field:'revenue', type:'DESC'}`; capture ghi `queryWindow`. Lượt chạy không có kỳ đó thì không gọi. Cờ `TDN_RESEARCH_TOP_SELLING_VIDEOS_ENABLED`, tối đa 3 sản phẩm, 10 video mỗi trang, bộ đọc kết quả và nhãn S14 trong báo cáo giữ nguyên.
- **ADDED** vào capability `raw-db`: yêu cầu R-KV01 đến R-KV07.
- Migration `0066_raw_db_v1_video_snapshot.sql`: bảng `video_snapshot` (STRICT, trigger cấm sửa và xoá).
- Module `src/modules/raw-db/kalodata-video-loader.ts`: `loadKalodataVideosToDbV1`, đầu vào `{ runId }` hoặc `{ file, runId }`.
- Lệnh `scripts/raw-db-load.ts --source S02b` với `--run`, `--file`, `--privacy-file`, `--dry-run`.
- Cập nhật db-v1: §1 mã nguồn S02b, §4.1a (S02b điền `video`), §4.1b mới (`video_snapshot`), §5 SQL.

## Impact

- Cơ sở dữ liệu: thêm 1 bảng. Bảng cũ không đổi. Kiểm thử ghim số migration đổi từ 65 sang 66; kiểm thử đếm bảng đổi từ 117 sang 118.
- Yêu cầu trả phí `kalodata.video.rank` đổi thân yêu cầu; số lần gọi và giới hạn giữ nguyên. Hai kiểm thử cũ ghim thân yêu cầu sai được sửa theo thân mới.
- Không gọi nguồn khi làm change này, không triển khai. Lệnh nạp chạy tay và cần tệp khoá riêng (cùng khoá với S07).
- Báo cáo Market và Insight chưa đọc bảng mới; báo cáo không in tên nhà cung cấp.

## Ngoài phạm vi

- Đổi cờ, nhãn nguồn trong báo cáo (vẫn S14) hay bộ đọc kết quả của app.
- Đơn vị của `revenue_growth_rate` (chưa kiểm) và ý nghĩa của các dòng `ad_revenue_ratio` = 80.0 (có lẽ là trần của nguồn).
- Nạp trên máy chủ (do chủ triển khai).
