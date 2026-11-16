---
name: tdn-shopee-flow
description: Thư mục mã của luồng Shopee 4 bước (lệnh shopee_flow.py, modules.json). Dùng khi cần tìm lệnh hoặc cấu hình của luồng trong code. Để chạy một lượt, dùng skill tdn-shopee-4-buoc.
---

# Luồng Shopee: mã và cấu hình

Xem đầy đủ: `tdn-shopee-4-buoc`.

Thư mục này chứa phần mã của luồng. Skill này chỉ nói cái gì nằm ở đâu.

- `scripts/shopee_flow.py`: lệnh của luồng. Trên lane live, app gọi lệnh này qua `shopee-cli.py` (đường dẫn là `remoteScript` trong cấu hình app).
- `modules.json`: tham số, danh sách phép kiểm của từng cổng, cài đặt bước 4. Tab «Tài liệu kỹ thuật» của app đọc file này qua lệnh `library`.
- `tests/`: kiểm thử của lệnh (chạy trên Linux).

Luồng có 4 bước: 1 Metric, 2 chọn 5 link Shopee, 3 lấy bình luận, 4 lưu + Jev lọc + Jev gắn nhãn. App desktop (`tools/shopee-desktop`) gọi đúng các lệnh này.

App web cũ (cổng 8787) và các lệnh `start`, `watch`, `status`, `recover` không còn dùng.
