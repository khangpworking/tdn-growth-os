# ADR 0003 — Content Studio trở thành phần Nội dung (B11–B13) của TDN Growth OS

Trạng thái: **Accepted — chủ dự án duyệt thiết kế ngày 2026-09-25**.
Chi tiết thiết kế: [Task 047](../tasks/047-content-studio-design.md) và [blueprint giao diện](../frontend/content-studio-blueprint.html).

## Bối cảnh

Content Studio hiện chạy như một ứng dụng Express/SQLite độc lập trên Windows (`tdn-research-pipeline`). Chủ dự án muốn Content Studio trở thành một phần của codebase và giao diện TDN Growth OS trên Fedora, với dữ liệu mới. Luồng hiện tại (Insight → Big Idea → Angle → Draft → Caption + Poster) được thiết kế lại cùng chủ dự án.

## Quyết định

1. **Port, không mount.** Content Studio được viết lại bằng TypeScript bên trong modular monolith, tái sử dụng có chọn lọc logic đã kiểm chứng (prompt template, bộ kiểm tra thông tin thương hiệu, lắp ráp prompt Poster, kiểm tra PNG). Không mount router Express, không mang theo database riêng, cơ chế schema-fingerprint, root rotation hay file job store của ứng dụng cũ.
2. **Vị trí.** Trạng thái vòng đời B11–B13 thuộc Box 4 — Flow Engine, trong khu vực `src/modules/flow/content/`. Giao diện React nằm ở một khu vực frontend riêng. Nội dung là mục điều hướng cấp cao (“Nội dung”), bên cạnh “Thương hiệu” và “Thư viện prompt”.
3. **Dữ liệu.** Dùng database SQLite authoritative chung, migration có thứ tự từ `0021`. Dữ liệu mới; không migration hay backfill từ Content Studio cũ. Mọi thứ quan trọng đều có phiên bản bất biến: hồ sơ thương hiệu, sản phẩm/dịch vụ, Big Idea, Angle, Caption, Poster, prompt. Xóa là xóa mềm, khôi phục được trong 30 ngày.
4. **Chiến dịch độc lập với nghiên cứu.** Chiến dịch có thể liên kết (tùy chọn) với một sản phẩm nghiên cứu. **D26 chỉ áp dụng cho chiến dịch đã liên kết**: khi B11 của chiến dịch đó bắt đầu, hệ thống đóng băng đúng quyết định B10 `APPROVE` đang hiệu lực. Chiến dịch tự nhập không cần B10.
5. **AI.** Mọi lời gọi AI đi qua `AiGateway` (mở rộng cho văn bản sáng tạo và tạo ảnh) tới CLIProxy. Mỗi lời gọi được ghi thành một attempt (`running` → `succeeded`/`failed`/`interrupted`); khởi động lại chuyển attempt treo thành `interrupted`; **không tự chạy lại**. Không có giới hạn AI theo ngày; mỗi thao tác hiển thị trước số lượt AI sẽ dùng. Lời gọi AI thật đầu tiên trên Fedora cần chủ dự án cho phép riêng.
6. **Prompt hai lớp.** Người dùng chỉ viết hoặc chọn phần sáng tạo; hệ thống luôn thêm dữ liệu khóa, quy tắc an toàn/sự thật và định dạng đầu ra. Prompt có thể lấy từ Thư viện prompt hoặc tự viết (lưu được vào thư viện).
7. **AI đề xuất, con người quyết định.** Sửa bằng AI tạo đề xuất; chỉ người dùng áp dụng hoặc bỏ. Khối liên hệ của Caption do hệ thống thêm từ hồ sơ, không do AI viết.
8. **Ngoài phạm vi.** Không đăng lên Facebook hay mạng xã hội; không video; chỉ OWNER dùng (qua cơ chế OWNER hiện có); không dùng Codex CLI làm dịch vụ tạo ảnh.

## Hệ quả

- Content Studio cũ trên Windows tiếp tục chạy nguyên trạng cho tới khi bản mới được chủ dự án kiểm tra, sau đó ngừng dùng. Không chuyển dữ liệu.
- `AiGateway` hiện chỉ phục vụ diễn giải phân tích; cần mở rộng có kiểm soát cho nội dung và ảnh.
- Kho artifact nội dung-địa-chỉ cần thêm loại “media” (logo, ảnh sản phẩm, Poster) với kiểm tra định dạng và kích thước.
- Các bài học từ Content Studio cũ được giữ: mỗi trạng thái attempt/crash phải có test khôi phục; giá trị thương hiệu phải được đóng băng theo gói.
