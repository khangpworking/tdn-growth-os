## 0. Trước khi làm

- [x] 0.1 Chủ duyệt kế hoạch ngày 25/10/2026 (F201: «thêm cổng máy dò số»); chủ chọn phương án C cho gói P5

## 1. Mã (một người viết mã)

- [x] 1.1 Bản đồ số v2: đầu vào trỏ được tới số chuỗi thô, bảng kết quả đã lưu, hồ sơ lần chạy và bản ghi nguồn khác; có giá trị và công thức đã đăng ký
- [x] 1.2 Cổng dò số `market-number-trace.ts`: cắt số trên trang, so với bản đồ theo phần, tính lại từng dòng
- [x] 1.3 Gắn bản đồ số cho các phần bản v3 giữ: bìa, M01, M02, M03, M04, M07, M12
- [x] 1.4 Thêm bước vào `checkMarketReport`; mã dừng `MARKET_NUMBER_TRACE_BLOCKED`; lưu kết quả cổng
- [ ] 1.5 Gói sau, mỗi nguồn một gói: M05 (tìm kiếm, World Bank, thống kê), M06 (thương mại), M08 (giá), M09 (bằng chứng nguồn), M10 (dự báo), M11 (cơ hội); xong gói nào thì chuyển phần đó sang «đã phủ»

## 2. Kiểm thử (phiên khác người viết mã)

- [ ] 2.1 T1 báo cáo kẽm: 0 số không truy được ở phần đã phủ
- [ ] 2.2 T2 chèn «36,2 tỷ» vào một phần đã phủ: bị chặn và có trong danh sách
- [ ] 2.3 T3 phần trăm thay đổi với gốc sai: bị chặn
- [ ] 2.4 T4 số phần và ngày đúng: đạt
- [ ] 2.5 T5 số trong phụ lục truy nguồn: bỏ qua
- [ ] 2.6 T6 số không truy được ở phần chưa phủ: được đếm, không chặn
- [ ] 2.7 Đối chứng âm: cổng chỉ xem bản đồ, không quét HTML, phải trượt T2
- [ ] 2.8 CI Linux xanh tại SHA cuối

## 3. Sau khi gộp

- [ ] 3.1 Archive change này để R-P07 mới vào `openspec/specs/report-pipeline/spec.md`
