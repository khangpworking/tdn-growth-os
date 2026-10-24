## 0. Trước khi làm

- [x] 0.1 Chủ quyết định luật (24/10/2026)
- [ ] 0.2 Chủ duyệt đề xuất này trước khi viết mã
- [ ] 0.3 Chụp `docs/business-spec/business-rules/report-language.md` vào `docs/outdated/<ngày>/`, rồi sửa file đó theo spec mới trong cùng PR

## 1. Kiểm chữ (một người viết mã)

- [ ] 1.1 `report-visible-text-lint.ts`: cấm «số 1 thị trường», «tốt nhất», «dẫn đầu ngành» trong chữ nhìn thấy của cả hai báo cáo
- [ ] 1.2 Kiểm câu hoặc tiêu đề có «dẫn đầu», «số 1», «nhiều nhất» mà thiếu thước đo, mẫu (số sản phẩm hoặc bản ghi, sàn) hoặc kỳ

## 2. Bản đọc

- [ ] 2.1 Rà mọi câu và tiêu đề bảng có sẵn trong `reader-report/market-template.ts` và `market-template-v2.ts`; thêm thước đo, mẫu, kỳ còn thiếu
- [ ] 2.2 Rà bản đọc Insight nơi nêu chủ đề nhắc nhiều nhất

## 3. Kiểm thử (phiên khác người viết mã)

- [ ] 3.1 Ca theo dòng hợp đồng cho R-L20, mỗi ca có một ca đối chứng âm (ca đó phải trượt trên mã hiện nay)
- [ ] 3.2 Đổi các kiểm thử đang cấm chữ «nhất» hoặc «hàng đầu» theo luật mới; ghi lý do trong PR
- [ ] 3.3 CI Linux xanh tại SHA cuối

## 4. Sau khi gộp

- [ ] 4.1 Chủ viết «deploy <SHA>» rồi mới triển khai
- [ ] 4.2 Chạy canary; mỗi báo cáo đạt 14/14 và R-L20
- [ ] 4.3 `/opsx:archive` change này; spec `report-language` nhận R-L20
