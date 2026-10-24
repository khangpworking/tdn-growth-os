## 0. Trước khi làm

- [x] 0.1 Chủ quyết định luật (24/10/2026, c4 Q1 đến Q5)
- [x] 0.2 Chủ duyệt hướng làm (c4 PR1 và PR2)

## 1. Danh sách tên (một người viết mã)

- [x] 1.1 Module `src/modules/analysis/report-language/hidden-names.ts`: một bảng tên, cách so khớp theo loại chữ (chữ người đọc thấy, trích dẫn, chữ chép từ nguồn, dấu vết kỹ thuật)
- [x] 1.2 Chuyển mọi nơi kiểm tên sang module: lint F1 và W6, cổng G08, trích dẫn, chữ web, chữ thường, đoạn PDF, mẫu Market, nguồn Comtrade và số liệu chính thức
- [x] 1.3 Bỏ các bản vá tay `Google|Gemini`
- [x] 1.4 Insight chạy F1 và W6 với danh sách đầy đủ

## 2. Kiểm thử (phiên khác người viết mã)

- [x] 2.1 Ca theo dòng hợp đồng cho module, mỗi ca có ca đối chứng âm
- [x] 2.2 Ghim hành vi của bộ lọc nguồn trả phí trước khi đổi
- [x] 2.3 Đổi các kiểm thử cũ theo luật mới; ghi lý do trong PR

## 3. Sau khi gộp

- [ ] 3.1 Chủ viết «deploy <SHA>» rồi mới triển khai
- [ ] 3.2 `/opsx:archive` change này; spec nhận R-L01, R-M15 mới và R-I29
