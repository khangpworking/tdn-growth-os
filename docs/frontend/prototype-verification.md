# Kiểm tra prototype Overview + Detail

Ngày: 11/09/2026. Phạm vi: `workspace-prototype.html`, chưa có API/React production.

## Kết quả

### Mở rộng nhiều thị trường

- Ba thị trường hiển thị, tìm theo tên/từ khóa, mở đúng phạm vi sản phẩm: đạt.
- Đổi quyết định B8 tại canxi chỉ cập nhật số liệu canxi; collagen giữ nguyên: đạt.
- Thị trường giấc ngủ có rổ cơ hội nhưng chưa có sản phẩm; tạo mới ra workspace demo trống: đạt.
- Chuyển thị trường, browser back về thị trường gốc và reset: đạt.
- Không lỗi JavaScript hoặc overflow ngang ở desktop 1440px và mobile 390px; đã xem năm ảnh các cấp màn hình.

- Mở overview → đúng hồ sơ sản phẩm, quay về tổng quan: đạt.
- Tìm kiếm và trạng thái không có kết quả: đạt.
- Chọn lane, cập nhật quyết định, chặn nút trùng trạng thái: đạt.
- Bốn PASS mới cho tạo clearance; sửa lane sau đó vẫn giữ snapshot clearance: đạt.
- Lịch sử giữ các quyết định demo trước: đạt.
- Empty/loading/error preview và reset: đạt.
- Chromium headless: không lỗi JavaScript; không overflow ngang ở 1440, 640, 390px.
- Đã xem ảnh desktop overview/detail, mobile overview/detail và detail 640px.

Finish review độc lập: **ship** trong phạm vi prototype HTML. Không có lỗi material cần chặn chia sẻ. Điểm nhỏ để polish sau: khôi phục focus vào nút Xem B9 sau khi tạo clearance. Không phải chứng nhận accessibility hoặc kiểm thử frontend production.

Detector: font và shadow là đặc điểm kế thừa từ baseline đã chọn. Chú thích 10/11px bị cảnh báo đã được override lên 12px ở những nhóm liên quan; badge nhỏ trên mobile vẫn 11px. Không thay hệ thống thị giác theo các cảnh báo máy móc.

Ảnh và script kiểm tra nằm trong `.impeccable/review/` được Git ignore. Backend suite không chạy vì không đổi backend. Không gọi provider hoặc sử dụng dữ liệu riêng tư.
