---
name: tdn-shopee-m2-chon
description: Bước 2 của luồng Shopee (file Metric → 5 link Shopee → cổng m2). Dùng khi cần biết bước 2 chọn link thế nào, code ở đâu, cổng m2 kiểm gì. Để chạy cả lượt, dùng skill tdn-shopee-4-buoc.
---

# Bước 2. Chọn 5 link Shopee

Xem đầy đủ: `tdn-shopee-4-buoc`.

- Đầu vào: `m1/` đã qua cổng m1.
- Lệnh: `shopee-cli.py m2 --run <runId> --detach`, rồi `gate m2 --run <runId>`.
- Luật theo `selectionPolicy` của lượt:
  - `metric-products-unique-v2` (lượt `new-run` có `startDate` và `metricOptions`): đi theo thứ tự doanh thu trong gói 100 sản phẩm, bỏ dòng không phải Shopee. Jev xét từng sản phẩm: đúng loại hàng không, có trùng sản phẩm đã chọn không. Đầu ra đúng 5 link khác nhau. Cổng m2 kiểm: `links_match_source_order`, `five_distinct_products`.
  - Không có `selectionPolicy` (đường cũ): luật `autorun-pick-v3`, không Jev, kỳ `30d`. Đầu ra 1–5 link. Cổng m2 kiểm: `links_1_to_5`, `ids_numeric`, `no_duplicate_shop`, `no_masked_above_lowest_pick`, `links_in_m1`, `pick_rule_version`, `pick_reason_present`.
- Đầu ra: `m2/selection.json`.
- Đường 1 kỳ: đã đạt thì không chạy lại (`M2_ALREADY_PASSED`); không đủ 5 link (`FEWER_THAN_FIVE_DISTINCT_PRODUCTS`, `PICK_PRODUCT_UNRESOLVED`): dừng, báo chủ.
- Code: `scripts/module-product-pick.ts`, `scripts/module-product-pick-jev.ts`.
- `ruleVersion` `autorun-pick-v3` trong `modules.json` là luật của đường cũ.
