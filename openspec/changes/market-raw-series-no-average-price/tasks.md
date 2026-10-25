## 0. Trước khi làm

- [x] 0.1 Chủ quyết ngày 23/10/2026 (F118, F119): «giá TB tính từ Doanh số/số lượt bán không có ý nghĩa, xóa»

## 1. Mã (một người viết mã)

- [x] 1.1 `reader-report/market-template.ts`: thêm cờ `withoutAveragePrice` vào `MarketReportOptions`
- [x] 1.2 `reader-report/market-template-v2.ts`: khi có cờ, bỏ cột và chú thích giá ở Bảng 3.1, nhóm giá ở Phần 11 và 12, cột giá ở PL.1
- [x] 1.3 `reader-report/market-findings.ts`: khi có cờ, bỏ nhận định giá
- [ ] 1.4 Bật cờ khi lượt chạy có số chuỗi thô (gói P4b)

## 2. Kiểm thử (phiên khác người viết mã)

- [ ] 2.1 Dòng B1 mở rộng sang bản đọc: có cờ thì không có «giá bán trung bình», «giá trung bình», «giá TB»; có một ca đối chứng âm
- [ ] 2.2 CI Linux xanh tại SHA cuối

## 3. Sau khi gộp

- [ ] 3.1 Archive change này để R-M34 mới vào `openspec/specs/market-report/spec.md`
