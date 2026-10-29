## 1. Tài liệu

- [x] 1.1 Viết change này: proposal với sơ đồ, design, spec R-C01 đến R-C07 và R-C09, tasks.md (chủ chốt thiết kế ngày 29/10/2026, F292)
- [x] 1.2 `openspec validate content-insight-handoff` qua
- [ ] 1.3 Chủ duyệt PR này và change này

Cách chia việc: Opus 5.5 medium viết mã. Sol 6.1 xhigh viết kiểm thử ở phiên riêng. Một phiên Sol 6.1 xhigh mới khác rà soát. Trước khi viết mã, phiên viết mã soạn bảng dòng hợp đồng đánh số (CIH-Q1…). Mỗi dòng ghi quy tắc R-C, hành vi và một ca đối chứng âm. Một phiên Sol rà bảng trước khi viết mã.

## 2. Chỗ lưu câu insight (Box 2)

- [x] 2.1 Hợp đồng JSON Schema đóng cho câu insight 9 trường; sinh type (R-C01)
- [x] 2.2 Migration số kế tiếp: bảng câu insight, nối với bản báo cáo loại INSIGHT (R-C01)
- [x] 2.3 Từ chối câu thiếu trường bắt buộc hoặc chứa nguyên văn bình luận (R-C01)
- [x] 2.4 Giao diện truy vấn cho Box 4: danh sách bản đã duyệt có câu insight, câu của một bản (R-C02; bỏ truy vấn bản mới hơn theo F294)

## 3. Insight chiến dịch (Box 4)

- [x] 3.1 Nguồn mới cho Insight: mã bản báo cáo, mã câu, bản sao 9 trường; mở rộng CHECK nếu có (R-C05)
- [x] 3.2 Điền ba ô: Khách hàng, Nỗi đau từ Xung đột, Insight từ Câu insight (R-C05)
- [x] 3.3 Nháp thì thay sau khi xác nhận; đã chốt thì từ chối; D26 không đổi (R-C06)
- [x] 3.4 Sửa ô thì giữ bản gốc và đánh dấu «Đã sửa so với báo cáo» (R-C07)
- [x] 3.5 Các trường thêm đi vào lớp khóa của prompt Big Idea và Angle (R-C05)

## 4. Giao diện và API

- [x] 4.1 Kéo: dropdown ở bước Insight, nhãn báo cáo, thẻ câu, ẩn mức Không, giữ nhãn Yếu và Giả thuyết (R-C03)
- [x] 4.2 Đẩy: nút «Gửi sang Content» ở trang danh sách báo cáo của lần chạy; chọn câu; chọn chiến dịch hoặc «Tạo chiến dịch mới» (R-C04)
- [x] 4.3 Khung chỉ đọc «Từ báo cáo» (R-C05)
- [x] 4.4 Bỏ theo F294 (29/10/2026): không làm thông báo «Có bản Insight mới»
- [x] 4.5 Trạng thái trống «Chưa có báo cáo nào có câu insight» (R-C09)

## 5. Kiểm thử và hợp nhất

- [ ] 5.1 Opus 5.5 medium viết mã
- [ ] 5.2 Sol 6.1 xhigh viết kiểm thử ở phiên riêng, với câu insight giả; mỗi ca có một ca đối chứng âm
- [ ] 5.3 Một phiên Sol 6.1 xhigh mới khác rà soát
- [ ] 5.4 Kiểm thử theo dòng hợp đồng; CI Linux xanh tại SHA cuối là cổng cuối; không chạy cả bộ trên máy
- [ ] 5.5 Merge chỉ khi chủ đồng ý; triển khai chỉ khi chủ viết «deploy <SHA>»

## 6. Kết thúc

- [ ] 6.1 Viết mã kiểm thật (file, hàm) vào dòng «Mã kiểm» của R-C01 đến R-C07 và R-C09
- [ ] 6.2 `/opsx:archive` change content-insight-handoff
