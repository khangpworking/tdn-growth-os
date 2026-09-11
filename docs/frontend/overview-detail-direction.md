# Các thị trường → Thị trường → Hồ sơ sản phẩm

Ngày: 11/09/2026. Mode: Operate. Artifact: `workspace-prototype.html`.

Chủ dự án yêu cầu tiếp tục prototype gốc sau khi loại bốn reference thương hiệu. D28 đã chọn Option 3 + Option 2 làm hai tầng của cùng frontend. Không hỏi chọn lại giữa hai màn hình này. Lượt này nối HTML và ghi nhận hệ thống thị giác từ giao diện đang có; chưa xây React/API.

## Direction contract

THESIS: OWNER chọn thị trường đang nghiên cứu, nhìn rổ cơ hội và hồ sơ thuộc đúng thị trường, mở sản phẩm để quyết định một lane B8.

OWN-WORLD: kế thừa thanh navy, nền xanh xám, giấy trắng, blue điều hướng, teal bước hiện tại, màu trạng thái có nhãn; card và nút bo nhẹ từ prototype ba option.

STORY: trang đầu có danh sách thị trường, tìm kiếm và tạo nghiên cứu demo. Trang thị trường có rổ ứng viên, bảng sản phẩm và số đếm B8 trong đúng phạm vi. Mở sản phẩm giữ ngữ cảnh thị trường; back và chuyển thị trường không trộn quyết định.

FIRST VIEWPORT: header gọn, nhãn demo, tiêu đề, nút Tạo nghiên cứu mới, ba số đếm và bảng thị trường. Trang thị trường kế thừa biểu đồ B8 + bảng sản phẩm, thêm rổ cơ hội. Product detail giữ bố cục ba cột. Mobile xếp dọc và select thị trường chiếm hàng riêng.

FORM: Option 3 + Option 2 do chủ dự án chọn; không có seed mới vì kế thừa prototype. Signature interaction: chọn lane làm rõ trạng thái và các nút hợp lệ; cập nhật một lane phản ánh vào lịch sử và tổng quan. Chuyển màn hình có chuyển động nhẹ, tôn trọng reduced motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Scope và giới hạn

- Có ba thị trường synthetic: canxi, collagen, giấc ngủ; ba hồ sơ sản phẩm và năm ứng viên. Có thị trường chưa có sản phẩm; tạo mới cho ra workspace trống. Không lấy dữ liệu canxi thật.
- B8 quyết định và clearance chỉ mô phỏng trong bộ nhớ trình duyệt, reset khi reload. Không dùng logic demo làm authorization/backend contract.
- B9 và B10 chỉ có view nêu điều kiện còn thiếu; form thao tác là lượt UI tiếp theo. B7 discovery chỉ có ngữ cảnh thu gọn.
- Chưa có report thật gắn hồ sơ. Không tạo số liệu thị trường, E0–E5 hoặc kết luận để lấp layout.
- Lọc danh sách, empty/loading/error preview, reset, lịch sử và back navigation có thể thao tác.
- Không dùng badge HOLD làm trạng thái tổng hợp của cả workspace; chỉ đếm lane và mô tả đang thẩm định.
- Mẫu dùng HTML theo yêu cầu visual trước đó. Không thay đổi default comp preference cho các yêu cầu thiết kế tương lai.
