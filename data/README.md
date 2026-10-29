# Data

Chỉ commit vocabulary/config/dataset đã làm sạch. Raw artifacts, DB và dữ liệu private nằm ngoài Git. Fixture tổng hợp ở tests/fixtures.


Ngoại lệ (chủ duyệt 29/10/2026, F291): `data/raw-sources/` chứa bộ dữ liệu gốc đã ẩn danh để chạy test (mỗi nguồn một tệp, định dạng kem-raw-v1). Không có lời khách định danh được, khoá API, mã phiên hay đường dẫn máy. Tệp PDF của bên thứ ba không đưa vào.
