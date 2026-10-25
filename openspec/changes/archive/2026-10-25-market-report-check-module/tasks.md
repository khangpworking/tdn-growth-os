## 0. Trước khi làm

- [x] 0.1 Chủ duyệt đánh giá kiến trúc c2 (24/10/2026)
- [x] 0.2 Kiểm thử chụp kết quả hôm nay (c2 PR1)

## 1. Mã (một người viết mã)

- [x] 1.1 Thêm `market-report-check.ts`: `checkMarketReport`, `assertMarketReport`, `marketSnippetPasses`
- [x] 1.2 `auditMarket14` nhận kết quả cổng đã tính; không có thì tự tính như cũ
- [x] 1.3 `reports.ts` và `service.ts` gọi chỗ kiểm mới; `meta-ad-report.ts` gọi `marketSnippetPasses`

## 2. Kiểm thử (phiên khác người viết mã)

- [x] 2.1 Ca theo dòng hợp đồng cho chỗ kiểm mới, mỗi ca có một ca đối chứng âm
- [x] 2.2 Kiểm thử c2 PR1 và kiểm thử cổng, 14 quy tắc chạy qua, không sửa
- [x] 2.3 Kết quả trên báo cáo thật đã giữ không đổi (khác biệt 0 dòng)
- [x] 2.4 CI Linux xanh tại SHA cuối

## 3. Sau khi gộp

- [x] 3.1 `/opsx:archive` change này; spec `report-pipeline` nhận dòng mã mới của R-P07, R-P08
