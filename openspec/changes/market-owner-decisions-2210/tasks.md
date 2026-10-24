## 0. Trước khi làm

- [x] 0.1 Chủ trả lời 2 câu hỏi ở `proposal.md` (24/10/2026)
- [ ] 0.1b Chủ duyệt toàn bộ đề xuất trước khi viết mã
- [ ] 0.2 Chụp `docs/business-spec/business-rules/market.md`, `insight.md` và `report-language.md` vào `docs/outdated/<ngày>/`, rồi sửa hai file đó theo spec mới trong cùng PR

## 1. Cổng và 14 quy tắc (một người viết mã)

- [ ] 1.1 `market-business-gate.ts`: đổi kiểm `U32_NO_CROSS_PLATFORM_TOTAL` từ "có cụm tổng là trượt" sang "tổng thiếu nhãn «Cộng 2 sàn» hoặc thiếu số từng sàn là trượt" (R-M16)
- [ ] 1.2 `market-14-rules.ts` quy tắc 7: bỏ phụ thuộc vào kết quả U32 cũ (R-M07)
- [ ] 1.3 `report-visible-text-lint.ts`: thêm kiểm mã chỉ số và chữ «giá thật» (R-M33, R-M34)

## 2. Bản đọc Market

- [ ] 2.1 `reader-report/market-template.ts` và `market-template-v2.ts`: thêm ô «Cộng 2 sàn» ở Phần 1 cạnh ô từng sàn (R-M16)
- [ ] 2.2 Bảng thương hiệu: một dòng mỗi thương hiệu, gộp khi tên trùng hẳn (R-M37)
- [ ] 2.3 Đổi nhãn sang «giá bán trung bình» và thêm dòng «Chú thích:» cách tính (R-M34)
- [ ] 2.4 Hàm phụ cho phép so: nhận chú thích chỉ số và kỳ, in ngoặc xám nhỏ (R-M35)
- [ ] 2.5 `reader-report/market-charts.ts`: biểu đồ đường không vẽ đường tổng (R-M36)

## 2b. Bản đọc Insight

- [ ] 2b.1 Bảng chủ đề: mỗi sàn một cột; chủ đề có ở cả hai sàn ghi «có ở cả 2 sàn», không có số gộp (R-I06)
- [ ] 2b.2 Kiểm Insight không có tổng tiền, tổng lượt bán (R-I06)

## 3. Kiểm thử (phiên khác người viết mã)

- [ ] 3.1 Ca theo dòng hợp đồng cho R-M16, R-M33 đến R-M37, R-I06, mỗi ca có một ca đối chứng âm
- [ ] 3.2 Cập nhật băm fixture vàng của bản đọc Market; ghi lý do trong PR
- [ ] 3.3 CI Linux xanh tại SHA cuối

## 4. Sau khi gộp

- [ ] 4.1 Chủ viết «deploy <SHA>» rồi mới triển khai
- [ ] 4.2 Chạy canary 3 sản phẩm; mỗi báo cáo đạt 14/14 và các quy tắc mới
- [ ] 4.3 `/opsx:archive` change này; spec gốc nhận R-M33 đến R-M37 và tên mới của R-M16, R-L04; R-I06 bản mới
