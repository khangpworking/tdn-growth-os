## 0. Trước khi làm

- [x] 0.1 Chủ trả lời 2 câu hỏi ở `proposal.md` (24/10/2026)
- [x] 0.1b Chủ duyệt toàn bộ đề xuất trước khi viết mã («làm luôn 2 thay đổi đó đi», 25/10/2026)
- [x] 0.2 Spec nằm ở `openspec/specs` qua archive (MIGRATION §2); các file `docs/business-spec/business-rules/*.md` là stub, không sửa

## 1. Cổng và 14 quy tắc (một người viết mã)

- [x] 1.1 `market-business-gate.ts`: đổi kiểm `U32_NO_CROSS_PLATFORM_TOTAL` từ "có cụm tổng là trượt" sang "tổng thiếu nhãn «Cộng 2 sàn» hoặc thiếu số từng sàn là trượt" (R-M16)
- [x] 1.2 `market-14-rules.ts` quy tắc 7: bỏ phụ thuộc vào kết quả U32 cũ (R-M07)
- [x] 1.3 `report-visible-text-lint.ts`: thêm kiểm mã chỉ số và chữ «giá thật» (R-M33, R-M34)

## 2. Bản đọc Market

- [x] 2.1 `reader-report/market-template-v2.ts` (bản đọc 1.4.0): thêm ô «Cộng 2 sàn» ở Phần 1 cạnh ô từng sàn (R-M16). Bản đọc cũ 1.0–1.3 (`market-template.ts`) giữ nguyên byte
- [x] 2.2 Bảng thương hiệu: một dòng mỗi thương hiệu, gộp khi tên trùng hẳn (R-M37)
- [x] 2.3 Đổi nhãn sang «giá bán trung bình» và thêm dòng «Chú thích:» cách tính (R-M34)
- [x] 2.4 Hàm phụ cho phép so: nhận chú thích chỉ số và kỳ, in ngoặc xám nhỏ (R-M35)
- [x] 2.5 `reader-report/market-charts.ts`: biểu đồ đường không vẽ đường tổng (R-M36); đã đúng sẵn, không đổi mã

## 2b. Bản đọc Insight

- [ ] 2b.1 Bảng chủ đề: mỗi sàn một cột; chủ đề có ở cả hai sàn ghi «có ở cả 2 sàn», không có số gộp (R-I06). Hiện mỗi sàn một bảng riêng, không có số gộp; nhãn «có ở cả 2 sàn» chờ chủ trả lời
- [x] 2b.2 Kiểm Insight không có tổng tiền, tổng lượt bán (R-I06): bản đọc Insight không in số nào như vậy; chưa có mã kiểm

## 3. Kiểm thử (phiên khác người viết mã)

- [ ] 3.1 Ca theo dòng hợp đồng cho R-M16, R-M33 đến R-M37, R-I06, mỗi ca có một ca đối chứng âm
- [ ] 3.2 Cập nhật băm fixture vàng của bản đọc Market; ghi lý do trong PR
- [ ] 3.3 CI Linux xanh tại SHA cuối

## 4. Sau khi gộp

- [ ] 4.1 Chủ viết «deploy <SHA>» rồi mới triển khai
- [ ] 4.2 Chạy canary 3 sản phẩm; mỗi báo cáo đạt 14/14 và các quy tắc mới
- [x] 4.3 `/opsx:archive` change này; spec gốc nhận R-M33 đến R-M37 và tên mới của R-M16, R-L04; R-I06 bản mới (archive trước khi gộp, cùng nhánh)
