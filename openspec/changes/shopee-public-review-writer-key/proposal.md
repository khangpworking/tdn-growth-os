> Trạng thái: **đề xuất, chờ chủ duyệt**. Chủ chốt 3A ngày 31/10/2026 (F318): giữ mã người viết Shopee làm thành change riêng. Chưa viết mã. Chưa gọi nguồn trả phí.

## Why

Luật L2 của quy chuẩn dữ liệu đầu vào nói: đếm số người viết chỉ trong một nền tảng, qua mã người viết đã mã hoá. Ngưỡng R-I33 cần từ 5 người viết trên từ 3 sản phẩm.

Bộ thu đánh giá Shopee đang dùng (gói S, từ 20/10/2026) không giữ mã tác giả. Mỗi dòng đánh giá đã lưu chỉ có mã đánh giá, sản phẩm, số sao, lời viết và ngày. Vì vậy:
- MCP Insight đếm mỗi đánh giá Shopee là một người viết (`writer_known = 0`) và ghi «đếm theo đánh giá».
- Câu kiểm 2 của R-I32 (mẫu đủ lớn và đa dạng) luôn thiếu với Shopee. Mức tin của báo cáo bị giữ ở Yếu.
- Một người viết nhiều đánh giá được đếm nhiều lần.

Bộ thu riêng cũ đã có cách băm mã tác giả (`shopee-author-id-hmac-v1` trong `src/platform/collectors/shopee-private-intake.ts`). Change này đưa cùng cách đó vào bộ thu gói S.

## What Changes

- **ADDED** R-I40: mỗi đánh giá Shopee mới SHALL mang `writer_key` = HMAC-SHA256 của mã tác giả do nguồn trả về, theo cách băm `shopee-author-id-hmac-v1`, với khoá nằm ngoài cơ sở dữ liệu. Hệ thống SHALL NOT lưu mã tác giả gốc, tên hiển thị hay ảnh đại diện. Khi nguồn không trả mã tác giả, `writer_key` để trống và luật đếm theo đánh giá giữ nguyên.
- Bộ thu gói S và hợp đồng `contracts/foundation/shopee-public-rows` thêm một trường mã người viết đã băm.
- Kho MCP Insight đọc trường mới: `writer_known = 1` khi có mã.

## Impact

- Mã: `src/platform/collectors/shopee-public-reviews.ts`; `contracts/foundation/shopee-public-rows.schema.json` và bản sinh; chỗ MCP Insight dựng kho (`tools/mcp-insight/insight_tools.py`, `build_warehouse`).
- Dịch vụ bộ thu trên máy chủ: kiểm xem dịch vụ có trả mã tác giả không (task 1.1). Nếu không trả, phải sửa dịch vụ bộ thu trước; việc đó cần chủ duyệt lại.
- Khoá HMAC: một khoá mới trên máy chủ, không vào kho mã. Đặt khoá là việc triển khai, cần chủ viết «deploy <SHA>».
- Dữ liệu cũ: các đánh giá đã lưu không có mã tác giả và giữ nguyên. Chỉ lần thu mới có mã.
- Không đổi chi phí: cùng số lần gọi như hiện nay.

## Ngoài phạm vi

- Lưu tên người viết (`reviewer_name`). Báo cáo không cần tên; luật L2 chỉ cần mã.
- Thu lại đánh giá cũ để bù mã tác giả.
- Đánh giá TikTok Shop (S06) và bình luận TikTok (S07): hai nguồn này đã có trường người viết.
- Đổi ngưỡng R-I33 hay cách tính mức tin.
