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

Bước 1 có thêm đường nhập từ app: `m1-import --stdin` nhận gói 100 sản phẩm app đã lấy từ trang Metric, tạo lượt `request-v2` với `metricSource` dạng `user-page-v1`, ghi `m1/` phẳng (một cửa sổ `selected`, `metric-user-page-window-v1`) rồi tự ghi cổng `entry` và `m1`. Cùng `importId` và cùng hash gói thì dùng lại lượt (`reused: true`); cùng `importId` nhưng gói khác thì `IMPORT_ID_CONFLICT`. Hợp đồng dữ liệu: `chuan/request-v2.schema.json` và `chuan/metric-user-page-window-v1.schema.json`.

Sau `m1-import`, app gọi `run --run <id> --detach` để đi tiếp M2 → M3 → bước 4 như luồng cũ. Trên lượt user-page, `run` không chạy lại M1: nó bắt đầu ở M3 khi cổng M2 đã PASS đúng như barrier của M3 đòi (cổng PASS và khớp `m2/selection.json`), ngược lại ở M2, và từ chối bằng lỗi barrier nếu cổng M1 không PASS; M3 đã thu rồi thì chính bước nhận M3 từ chối bằng `AUTOMATIC_COLLECTION_EXISTS` và người dùng đi tiếp bước 4 bằng lệnh bước 4.

App web cũ (cổng 8787) và các lệnh `start`, `watch`, `status`, `recover` không còn dùng.
