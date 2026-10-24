## 0. Trước khi làm

- [x] 0.1 Chủ quyết định b1 đến b8 (24/10/2026)
- [x] 0.2 PR0: kiểm thử chụp hành vi (sổ chi phí, ordinal, thứ tự capture, số lần gọi), xanh trên mã cũ

## 1. PR1: module và bốn làn cùng dạng

- [x] 1.1 RA `collection-lanes.ts`: hợp đồng làn, cổng, try/catch, lưu capture qua `putCaptures`, tài liệu lỗi riêng, dòng chi phí
- [x] 1.2 Bảng ordinal và nhà cung cấp, kiểm trùng khi nạp; truy vấn hoạt động quảng cáo tìm kiếm đọc bảng
- [x] 1.3 Chuyển World Bank, UN Comtrade, quảng cáo tìm kiếm, Cục Thống kê; byte đã lưu không đổi
- [ ] 1.4 Kiểm thử ở giao diện module (phiên khác người viết mã)

## 2. PR2: làn phụ thuộc làn trước

- [x] 2.1 Web, xu hướng, bản đồ tỉnh, tìm kiếm mở rộng; đầu vào "làn trước đã cho gì" thay biến cục bộ (bản đồ tỉnh đọc kỳ của xu hướng, quảng cáo tìm kiếm đọc dòng web và tìm kiếm mở rộng); byte đã lưu không đổi, chưa sửa lỗi 1 và 2
- [x] 2.2 Meta và TikTok top-ads; việc đăng bằng chứng giữ đúng chỗ hiện nay (M2): sau video, trước dòng chi phí, cùng điều kiện trạng thái lượt chạy
- [x] 2.3 Kiểm thử ở giao diện module (phiên khác người viết mã)

## 3. PR3: làn sau L9

- [x] 3.1 Video đọc bước đang dựng sau khi các làn trước đã gộp (M5); không có cổng dừng như hiện nay; việc đăng bài đọc giữ đúng chỗ (M2); RA `collection-lanes-save-step.ts`
- [x] 3.2 PDF: giới hạn capture, giữ tệp PDF, lỗi ghi tệp chỉ làm hỏng làn PDF như hiện nay; bước nhận L9 ở lại service, dòng đã nhận là đầu vào rõ ràng; tải lỗi vẫn không ghi dòng `UNKNOWN` (M3); byte đã lưu không đổi
- [x] 3.3 Kiểm thử ở giao diện module (phiên khác người viết mã)

## 4. PR4: sửa lỗi (đổi hành vi)

- [ ] 4.1 Tìm kiếm mở rộng ném lỗi ghi dòng `UNKNOWN` (lỗi 1); đổi cả phép kiểm, không chỉ tên ca
- [ ] 4.2 Chuỗi xu hướng/bản đồ tỉnh lỗi giữ khoảng thời gian đã hỏi (lỗi 2); ghi lại băm bước đổi
- [ ] 4.3 Mục 9 và 13 chỉ khi chủ duyệt
- [ ] 4.4 `/opsx:archive` change này
