# Đưa quyết định của chủ ngày 22/10/2026 vào báo cáo Market tự động

> Trạng thái: **đề xuất, chờ chủ duyệt**. Chưa đổi mã. Chưa đổi business-spec.

## Why

Ngày 22/10/2026, khi xem báo cáo kẽm đặt cạnh trang gốc, chủ ra năm quyết định cho báo cáo Market. Các quyết định đã áp vào báo cáo kẽm làm tay và vào quy chuẩn dữ liệu đầu vào (bản 1.42, 1.43). Mã app và business-spec (bản 21/10) vẫn theo luật cũ. Vì vậy báo cáo tự động hiện nay **chặn** đúng điều chủ đã cho phép: cổng `U32_NO_CROSS_PLATFORM_TOTAL` làm lần dựng lỗi khi có tổng hai sàn.

Câu của chủ:
- «giờ tôi cho phép cộng như metric» (F100). Thay U-32 ngày 11/10/2026.
- «không cần mã chỉ số đâu». Bỏ mã DT-1, LB-1, GIA-2, SS-1 khỏi báo cáo gửi đọc.
- Duyệt đổi «giá thật» thành «giá bán trung bình» (F106, F107).
- Mỗi phép so, tỷ lệ, tăng giảm có chú thích: so chỉ số nào, với kỳ nào, kèm ngày.
- «chart thì không cần làm line của cộng 2 sàn đâu» (F116).
- Bảng thương hiệu: một dòng mỗi thương hiệu, cột «Cộng 2 sàn» cạnh cột từng sàn. Chỉ gộp khi tên thương hiệu trùng hẳn ("Now" và "Now Food" là hai thương hiệu).

## What Changes

- **MODIFIED** R-M07: bỏ vế "không cộng giữa hai sàn". Giữ "số trong mẫu, có n, không nêu quy mô thị trường".
- **MODIFIED** R-M16: tổng hai sàn được phép, với điều kiện có nhãn «Cộng 2 sàn», số từng sàn đứng cạnh, và không là tổng thiếu thành viên (R-M18 giữ nguyên).
- **MODIFIED** R-L04: Market theo R-M16 mới. Insight vẫn đếm riêng từng sàn (R-I06 không đổi).
- **ADDED** R-M33: không hiện mã chỉ số trong báo cáo gửi đọc.
- **ADDED** R-M34: tên chỉ số giá là «giá bán trung bình», có ghi chú cách tính.
- **ADDED** R-M35: mỗi phép so có chú thích chỉ số và kỳ so, kèm ngày.
- **ADDED** R-M36: biểu đồ đường chỉ có đường Shopee và đường TikTok Shop, không có đường tổng.
- **ADDED** R-M37: bảng thương hiệu một dòng mỗi thương hiệu, gộp khi tên trùng hẳn.

## Impact

- Mã: `src/modules/analysis/research-automation/market-business-gate.ts` (`CROSS_PLATFORM_TOTAL_PHRASES`, kết quả `U32_NO_CROSS_PLATFORM_TOTAL`), `market-14-rules.ts` (quy tắc 7), bộ dựng bản đọc `src/modules/analysis/reader-report/market-template.ts` và `market-template-v2.ts`, biểu đồ `reader-report/market-charts.ts`.
- Kiểm thử: `tests/unit/gate-209-market-business.test.ts`, `tests/unit/rules14-209-market-14.test.ts`, fixture vàng của bản đọc Market (băm sẽ đổi).
- Tài liệu: khi chủ duyệt, `docs/business-spec/business-rules/market.md` và `report-language.md` phải đổi cùng PR (luật giai đoạn chuyển, xem `openspec/MIGRATION.md`).
- Không đổi nguồn, không gọi nguồn trả phí, không đổi cờ môi trường.

## Ngoài phạm vi

- Báo cáo Insight: R-I06 vẫn cấm cộng hai sàn. Chủ chưa nói gì cho Insight.
- Biểu đồ khác ngoài biểu đồ đường.
- Triển khai lên máy chạy thật: cần câu «deploy <SHA>» riêng của chủ.

## Câu hỏi cho chủ

1. Insight có được cộng hai sàn như Market không? Đề xuất: không, vì đơn vị của Insight là bản ghi bình luận, không phải tiền.
2. Đề xuất này có giải quyết điểm mở số 2 trong `market-report` (R-M17 cấm "xếp hạng", R-M27 giữ xếp theo doanh thu) không? Đề xuất: chưa; để thành một change riêng.
