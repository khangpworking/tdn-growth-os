# Bỏ giá bán trung bình khỏi báo cáo Market có số chuỗi thô

> Trạng thái: **chủ đã quyết ngày 23/10/2026** (nhật ký chủ F118, F119). Mã của bản đọc đã có cờ trong PR này. Chưa bật cờ ở lượt chạy thật (gói P4b).

## Why

Giá bán trung bình là doanh số chia lượt bán trong kỳ. Ngày 23/10/2026, khi so báo cáo kẽm tự động với bản làm tay, chủ quyết:

- «giá TB tính từ Doanh số/số lượt bán không có ý nghĩa, xóa» (F118, F119).

R-M34 hiện vẫn bắt báo cáo gọi số này là «giá bán trung bình» và kèm chú thích. Như vậy R-M34 giả định báo cáo luôn in số này. Báo cáo mới (có số chuỗi thô từ bản lưu) không in số này nữa, nên R-M34 phải đổi.

## What Changes

- **MODIFIED** R-M34: báo cáo Market có số chuỗi thô SHALL NOT in giá suy từ doanh số chia lượt bán, ở mọi chỗ: cột bảng, dòng chú thích, nhận định, nhóm giá ở phần cơ hội và phương án, cột ở danh sách sản phẩm. Báo cáo cũ (không có số chuỗi thô) giữ luật cũ: nếu in số này thì gọi là «giá bán trung bình» và kèm chú thích. Chữ «giá thật» vẫn cấm ở mọi báo cáo.

## Impact

- Mã: `src/modules/analysis/reader-report/market-template.ts` (cờ `withoutAveragePrice` trong `MarketReportOptions`), `market-template-v2.ts` (`buildMarketReportV2` bỏ cột, chú thích, nhóm giá, cột phụ lục khi có cờ), `market-findings.ts` (`marketFindings` bỏ nhận định giá khi có cờ). Bộ dựng `src/modules/analysis/research-automation/reports.ts` đã bỏ số này qua cờ cùng tên khi có số chuỗi thô.
- Báo cáo cũ và fixture vàng không đổi byte: cờ chỉ bật khi có số chuỗi thô.
- Kiểm thử: dòng B1 của gói P4 mở rộng sang bản đọc (phiên viết kiểm thử riêng, có ca đối chứng âm).
- Không đổi nguồn, không gọi nguồn trả phí, không đổi cờ môi trường.

## Ngoài phạm vi

- Bật cờ ở lượt chạy thật (lưu số chuỗi thô lúc PREPARE và truyền vào bản đọc): gói P4b.
- Giá niêm yết, giá thanh toán, giá theo đơn vị chuẩn từ quy cách đã lưu: giữ nguyên, không phải doanh số chia lượt bán.
- Chưa có mã kiểm máy cho luật mới; kiểm bằng dòng hợp đồng B1.
