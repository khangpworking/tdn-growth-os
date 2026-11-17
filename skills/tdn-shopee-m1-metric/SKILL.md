---
name: tdn-shopee-m1-metric
description: Bước 1 của luồng Shopee (yêu cầu của lượt → file Metric → cổng m1). Dùng khi cần biết bước 1 làm gì, code ở đâu, cổng m1 kiểm gì. Để chạy cả lượt, dùng skill tdn-shopee-4-buoc.
---

# Bước 1. Tra cứu Metric

Xem đầy đủ: `tdn-shopee-4-buoc`.

- Đầu vào: `request.json` của lượt (lượt mới tạo bằng `new-run`), hoặc gói app gửi qua `m1-import --stdin`.
- Lệnh: `shopee-cli.py m1 --run <runId> --detach`, rồi `gate m1 --run <runId>`.
- Đường app gửi gói: `echo '<gói JSON>' | shopee-cli.py m1-import --stdin` tạo lượt `request-v2` với `metricSource.format = user-page-v1`, ghi `m1/` phẳng (một cửa sổ `selected`, `metric-user-page-window-v1`) và tự ghi cổng `entry` + `m1`; không chạy `m1`, không gọi Metric. Cùng `importId` cùng hash gói thì `reused: true`; cùng `importId` khác gói thì `IMPORT_ID_CONFLICT`; gói quá 8 MB thì `IMPORT_TOO_LARGE`. Trần `stdin` được kiểm trước khi parse.
- Input của `new-run` chọn đường:
  - Có cả `startDate` và `metricOptions` (đường 1 kỳ, app dùng): mở Metric một lần: 1 kỳ, 4 sàn, đúng ngành hàng và bộ lọc đã chọn, sắp theo cột doanh thu. Lấy thêm 1 gói 100 sản phẩm cùng phạm vi. Gói này hỏng thì bước 1 dừng.
  - Không có cả hai (đường cũ): lấy 2 kỳ `30d` và `12m` theo spec của preset. Không có gói 100 sản phẩm.
- Đầu ra: `m1/`.
- Cổng m1 kiểm: `capture_success`, `files_readable`, `has_shopee_rows`, `period_matches`. Đường 1 kỳ kiểm thêm `saved_capture_source_verified`. `masked_ids` chỉ là cảnh báo.
- Code: `scripts/capture-metric-preset.ts`, `tools/opencli-metric/clis/metric/`.
- Không thử lại. Gặp đăng nhập hoặc xác minh thì dừng và báo chủ.
