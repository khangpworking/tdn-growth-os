---
name: TDN Growth OS
description: Hệ thống thị giác trích từ prototype tổng quan và hồ sơ sản phẩm.
colors:
  ink: "#172e43"
  muted: "#536a7c"
  line: "#dfe7ed"
  canvas: "#dfe8ed"
  white: "#fff"
  teal: "#087e8b"
  blue: "#2457c5"
  blue-hover: "#1d469f"
  pass-bg: "#e1f4ed"
  pass-text: "#186655"
  hold-bg: "#fff4d5"
  hold-text: "#79520e"
  reject-bg: "#fde9eb"
  reject-text: "#943643"
  none-bg: "#edf2f5"
  nav-active-bg: "#e1ebff"
  nav-active-text: "#1f4ea8"
typography:
  headline:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  title:
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.02em"
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontSize: "12px"
  button:
    fontSize: "13px"
    fontWeight: 700
rounded:
  field: "8px"
  button: "9px"
  lane: "10px"
  evidence: "12px"
  card: "13px"
  surface: "14px"
  dossier: "17px"
  badge: "99px"
spacing:
  tight: "8px"
  small: "12px"
  medium: "16px"
  section: "20px"
  panel: "24px"
  content: "28px"
  page: "32px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  input-search:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    width: "min(260px,100%)"
  nav-active:
    backgroundColor: "{colors.nav-active-bg}"
    textColor: "{colors.nav-active-text}"
    rounded: "{rounded.field}"
    padding: "12px"
  badge-pass:
    backgroundColor: "{colors.pass-bg}"
    textColor: "{colors.pass-text}"
    rounded: "{rounded.badge}"
    padding: "5px 10px"
  card-stat:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px 22px"
---

# Design System: TDN Growth OS

## Overview

Hệ thị giác hiện có dùng thanh navy, nền xanh xám, bề mặt trắng, blue cho điều hướng và teal cho bước đang xem. Mật độ vừa phải, nhãn rõ và các đường phân cách mảnh giúp đọc trạng thái cùng bằng chứng.

Nguồn chuẩn là [workspace-prototype.html](docs/frontend/workspace-prototype.html), kế thừa [prototype ba hướng gốc](docs/frontend/direction-options.html). Chủ dự án đã duyệt bản nhiều thị trường theo INTENT D31: tổng quan thị trường → workspace thị trường → hồ sơ sản phẩm. Dùng bản này làm chuẩn khi triển khai React trong Task 033. Đây là thiết kế đã duyệt, chưa phải frontend production đã tồn tại.

**Key Characteristics:**

- Nền xanh xám, thanh navy và bề mặt trắng.
- Blue điều hướng; teal biểu thị bước hiện tại và focus.
- Trạng thái có cả chữ và màu.
- Không dùng ảnh thương hiệu hoặc font tải ngoài.

## Colors

Các token YAML phía trên là giá trị chuẩn; tên mô tả vai trò, không tạo bảng màu thương hiệu mới.

Primary: `blue` dùng cho thao tác chính, liên kết, lane được chọn; `blue-hover` là trạng thái hover của nút chính.

Secondary: `teal` dùng cho bước hiện tại và vòng focus. Trạng thái Đạt, Tạm giữ, Không đạt, Chưa đánh giá dùng các cặp nền/chữ riêng; không đồng nhất teal với mọi trạng thái thành công.

Neutral: `ink` cho chữ chính và header; `muted` cho mô tả; `canvas` cho nền ngoài; `white` cho nội dung; `line` cho đường chia. Cặp `nav-active-*` định vị phần hồ sơ đang mở. Giá trị dùng một lần và biến chưa được dùng không được nâng thành token toàn cục.

## Typography

Stack hiện có bắt đầu bằng Inter nhưng không tải font này; Inter chỉ có tác dụng nếu đã cài trên máy. Khi không có, dùng ui-sans-serif/system-ui và Segoe UI theo nền tảng. Không có font display hay mono riêng.

Tiêu đề trang dùng headline; tiêu đề vùng dùng title; tiêu đề nhỏ là 16px. Nội dung nền là body, phần hồ sơ/bảng/nút thường 13px, nhãn phụ 12px. Số thống kê dùng 32px, weight 750 và tabular-nums. Đoạn văn giới hạn 70ch. Dưới 650px, headline và số thống kê còn 26px, body 14px. Quy tắc cuối stylesheet giữ nhãn header, demo, thống kê, stepper và lane ở 12px, kể cả mobile.

## Layout

Điều hướng hiện có ba cấp: danh sách thị trường → workspace thị trường → hồ sơ sản phẩm. Trang đầu dùng ba số đếm và bảng thị trường; trang thị trường dùng bố cục overview bên dưới kèm rổ cơ hội. Chuyển thị trường và đường dẫn về nguồn luôn có ở hai cấp trong. Trên mobile, select thị trường chiếm một hàng để tên không bị cắt.

Khung tối đa 1400px, padding ngang 28px. Tổng quan có ba ô số liệu và vùng nội dung hai cột 300px / phần còn lại, gap 20px. Hồ sơ hiện có ba cột 210px / linh hoạt / 264px; vùng nội dung padding 28px. Đây là bố cục của surface này, không phải bắt buộc cho mọi màn hình; xem [surface brief](docs/frontend/overview-detail-direction.md).

Từ 1500px, hai cột cạnh hồ sơ thành 230px và 280px, padding nội dung 32px. Đến 1100px, tổng quan xếp một cột; panel quyết định chuyển xuống dưới nội dung, sidebar còn 180px. Đến 650px, hồ sơ xếp dọc, điều hướng cuộn ngang, thẻ ứng viên trong sidebar ẩn, bảng chuyển thành các hàng khối; ba ô số liệu và bốn bước vẫn nằm ngang. Không suy diễn rằng mobile tự chuyển mọi grid thành một cột.

## Elevation & Depth

Phân tầng chủ yếu bằng nền và đường viền. Chỉ khung hồ sơ và toast dùng shadow hiện có: `0 12px 28px rgba(25,48,64,.09)`. Card thống kê, evidence và lane không có bóng riêng. Không thêm blur hoặc gradient làm vật liệu mới.

Chuyển view dùng translateY từ 6px về 0 trong .22s, easing cubic-bezier(.16,1,.3,1). Nút đổi nền trong .16s. Tắt animation và transition khi prefers-reduced-motion yêu cầu giảm chuyển động.

## Shapes

Các bán kính trong YAML ứng với trường nhập, nút, lane, evidence, card, surface và khung hồ sơ. Badge dạng viên có chấm tròn 6px; badge luôn kèm chữ. Viền thông thường 1px. Lane được chọn dùng viền blue 2px và giảm padding từ 14px xuống 13px để giữ kích thước.

## Components

- **Nút:** bản chính blue/trắng; nút thường trắng/chữ navy; nút quiet trong suốt/chữ blue. Chiều cao tối thiểu 42px. Disabled có opacity .55 và cursor not-allowed. Hover nút thường dùng nền xanh xám nhạt; hover nút quyết định dùng brightness(.96).
- **Trường nhập:** search nền trắng, viền xanh xám 1px, bo field; select cùng ngôn ngữ hình thức. Focus dùng outline teal 3px, offset 4px cho nút, link, input, select và summary.
- **Điều hướng:** item bo field, nhãn 13px weight 650; active dùng cặp nav-active. Hover nền nhạt. aria-current chỉ phần đang xem.
- **Badge:** nhãn 12px weight 650, chấm tròn kế thừa màu chữ. Badge không phải nút và không cần hover/focus giả.
- **Card và evidence:** card thống kê trắng, viền line; evidence nền nhạt, padding 18px và bo evidence. Nội dung luôn có tiêu đề cụ thể.
- **Lane:** hàng chọn có tên tiếng Việt, mã và badge; aria-pressed phản ánh lựa chọn. Quyết định B8 nằm riêng trong panel bên cạnh. Số liệu, lịch sử, clearance và trạng thái loading/error chỉ mô phỏng trong demo.

Sidecar chứa năm mẫu tự đủ HTML/CSS: nút chính, search, navigation, badge và card thống kê. Các mẫu phục vụ xem style; không thay thế component React hoặc logic nghiệp vụ.

## Do's and Don'ts

- **Do** Giữ navy, xanh xám, trắng, blue và teal của prototype gốc.
- **Do** Hiển thị chữ cùng màu trạng thái, nhãn dữ liệu minh họa và focus bàn phím rõ.
- **Do** Giữ số đếm có ý nghĩa và phân biệt chưa đánh giá với dữ liệu bằng không.
- **Don't** Coi số liệu synthetic hoặc thao tác trong demo là kết quả nghiệp vụ thật.
- **Don't** Thay font, thêm ảnh thương hiệu hoặc chọn lại nhận diện chỉ vì chưa có UI production.
- **Don't** Thay bố cục prototype đã duyệt bằng một template hoặc reference thương hiệu khác.
