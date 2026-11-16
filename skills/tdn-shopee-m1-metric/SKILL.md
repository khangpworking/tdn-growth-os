---
name: tdn-shopee-m1-metric
description: Bước 1 của luồng Shopee (yêu cầu của lượt → file Metric → cổng m1). Dùng khi cần biết bước 1 làm gì, code ở đâu, cổng m1 kiểm gì. Để chạy cả lượt, dùng skill tdn-shopee-4-buoc.
---

# Bước 1. Tra cứu Metric

Xem đầy đủ: `tdn-shopee-4-buoc`.

- Đầu vào: `request.json` của lượt (lượt mới tạo bằng `new-run`).
- Lệnh: `shopee-cli.py m1 --run <runId> --detach`, rồi `gate m1 --run <runId>`.
- Việc: mở Metric một lần: 1 kỳ (app dùng 30 ngày), 4 sàn, đúng ngành hàng và bộ lọc của lượt, sắp theo cột doanh thu. Lấy thêm 1 gói 100 sản phẩm cùng phạm vi. Gói này hỏng thì bước 1 dừng.
- Đầu ra: `m1/`.
- Cổng m1 kiểm: `capture_success`, `files_readable`, `has_shopee_rows`, `period_matches`, `saved_capture_source_verified`. `masked_ids` chỉ là cảnh báo.
- Code: `scripts/capture-metric-preset.ts`, `tools/opencli-metric/clis/metric/`.
- Không thử lại. Gặp đăng nhập hoặc xác minh thì dừng và báo chủ.
