---
name: tdn-shopee-m3-binh-luan
description: Bước 3 của luồng Shopee (5 link → bình luận công khai → cổng của nguồn). Dùng khi cần biết bước 3 lấy bình luận thế nào, code ở đâu, kết luận bước 3 đọc ở đâu. Để chạy cả lượt, dùng skill tdn-shopee-4-buoc.
---

# Bước 3. Lấy bình luận Shopee

Xem đầy đủ: `tdn-shopee-4-buoc`.

- Đầu vào: `m2/selection.json` đã qua cổng m2.
- Lệnh: `shopee-cli.py m3 --run <runId> --detach`.
- Việc: lấy bình luận của 5 link qua dịch vụ lấy bình luận, theo cách lấy đã chốt khi tạo lượt (số bình luận/link hoặc số trang/link, theo số sao hay chỉ bình luận có chữ). Mặc định: bình luận có chữ, 300/link.
- Đầu ra (lượt mới `request-v2`): `m3-custom/attempts/<attemptId>/`.
- Kết luận: `review-data --run <runId>` → `sources[].gateVerdict`. Chỉ đi tiếp khi `PASS`.
- Cấm chạy `gate m3` cho lượt `request-v2`: lệnh đó chỉ đọc `m3/` và ghi đè `gates/m3.json` thành FAIL.
- Sau khi bước 3 đạt, bước 4 tự chạy (tốn phí Jev).
- Code: `scripts/module-review-sampling.ts`, `tools/shopee-review-service/`.
- Lượt cũ (`request-v1`) ghi vào `m3/` qua `scripts/module-collect-public.ts`; chỉ lượt đó dùng `gate m3`.
