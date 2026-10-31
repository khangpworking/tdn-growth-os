## 0. Trước khi làm

- [x] 0.1 Viết change này: proposal, spec R-I40, tasks (chủ chốt 3A ngày 31/10/2026, F318)
- [x] 0.2 Lấy số R trống kế tiếp: R-I40 (R-I30 đến R-I39 thuộc `insight-method-v1`)
- [ ] 0.3 Chủ duyệt change này. Chưa duyệt thì không làm phần 1 trở đi

## 1. Kiểm nguồn (không tốn tiền)

- [ ] 1.1 Đọc một trang kết quả đã lưu của dịch vụ bộ thu gói S trên máy chủ: dịch vụ có trả mã tác giả không. Không gọi nguồn mới
- [ ] 1.2 Nếu dịch vụ không trả mã tác giả: dừng, báo chủ. Sửa dịch vụ bộ thu là change khác

## 2. Mã (một người viết mã)

- [ ] 2.1 Bộ thu gói S băm mã tác giả theo `shopee-author-id-hmac-v1`; bỏ mã gốc, tên, ảnh trước khi lưu
- [ ] 2.2 Hợp đồng `shopee-public-rows` thêm trường mã người viết đã băm; sinh lại kiểu
- [ ] 2.3 Khoá HMAC đọc từ tệp trên máy chủ; thiếu khoá thì lần thu ghi lỗi cấu hình, không lưu mã gốc
- [ ] 2.4 MCP Insight `build_warehouse`: `writer_known = 1` khi có mã

## 3. Kiểm thử (phiên khác người viết mã) và hợp nhất

- [ ] 3.1 Theo dòng hợp đồng của R-I40; mỗi ca có một ca đối chứng âm (ví dụ: mã gốc lọt vào dòng đã lưu thì kiểm thử phải đỏ)
- [ ] 3.2 Một phiên Sol 6.1 xhigh mới rà soát; CI Linux xanh tại SHA cuối
- [ ] 3.3 Merge khi Sol đạt và CI xanh; triển khai và đặt khoá chỉ khi chủ viết «deploy <SHA>»

## 4. Kết thúc

- [ ] 4.1 Ghi mã kiểm thật vào dòng «Mã kiểm» của R-I40
- [ ] 4.2 Cập nhật quy chuẩn dữ liệu đầu vào (L2, Phần 6.2) và `data/raw-sources/KHUON-CSDL.md` (cột `reviewer_key` của S05)
- [ ] 4.3 `/opsx:archive` change `shopee-public-review-writer-key`
