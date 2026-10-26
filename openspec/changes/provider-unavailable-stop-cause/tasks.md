## 0. Trước khi làm

- [x] 0.1 Chủ báo lỗi ngày 26/10/2026: lần chạy `b4c0540b` nhận HTTP 554 nhưng luồng tự động báo `NO_PRINCIPAL_PRODUCTS`

## 1. Mã (một người viết mã)

- [x] 1.1 Giữ header phản hồi cho phép trong bản ghi nguồn; cắt ngắn, bỏ giá trị chứa khóa
- [x] 1.2 Gán mã bước `PROVIDER_UNAVAILABLE` cho HTTP từ 500 trở lên; câu báo có mã HTTP thật
- [x] 1.3 Giữ thứ tự ưu tiên: lỗi dữ liệu nguồn, hết điểm, lỗi máy chủ, thiếu dữ liệu chạy thử, lỗi chung
- [x] 1.4 Luồng tự động dừng theo mã của bước tìm sản phẩm ở pha thu, chuẩn bị và chọn link
- [x] 1.5 Nhãn giao diện cho mã dừng mới và các mã của bước tìm sản phẩm

## 2. Kiểm thử (phiên khác người viết mã)

- [ ] 2.1 T1 HTTP 554 thân rỗng: bước tìm sản phẩm có mã `PROVIDER_UNAVAILABLE`, câu bước có «554», khác `NO_PRINCIPAL_PRODUCTS`
- [ ] 2.2 T2 luồng tự động dừng ở pha thu với `PROVIDER_UNAVAILABLE`, chưa gọi nguồn trả phí lần nữa
- [ ] 2.3 T3 HTTP 500 lúc thu: bước thu có mã `PROVIDER_UNAVAILABLE`
- [ ] 2.4 T4 header cho phép được lưu; header lạ và giá trị chứa khóa bị bỏ
- [ ] 2.5 T5 bản ghi cũ không có `responseHeaders` vẫn đọc được
- [ ] 2.6 Đối chứng âm: HTTP 401, 403, 429 và hết điểm giữ nguyên mã cũ
- [ ] 2.7 CI Linux xanh tại SHA cuối

## 3. Sau khi gộp

- [ ] 3.1 Archive change này để R-P03 mới và R-P16 vào `openspec/specs/report-pipeline/spec.md`
