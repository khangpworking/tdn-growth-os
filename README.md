# TDN Growth Operating System

Hệ thống nghiên cứu và vận hành kinh doanh canxi, phát triển bởi một người với AI coding.

Ưu tiên: giao hàng nhanh; giải pháp đơn giản nhất đáp ứng tiêu chí nghiệm thu; bằng chứng và quyền phê duyệt rõ ràng.

Trạng thái: khởi tạo repository, cấu trúc và kế hoạch. Chưa có ứng dụng chạy, database hoặc dependency đã cài.

## Bắt đầu

Bối cảnh thiết kế đang thảo luận: [INTENT.md](INTENT.md) — quyết định đã thống nhất, phần để sau và câu hỏi tiếp tục phỏng vấn.

1. Đọc `AGENTS.md` và `ARCHITECTURE.md`.
2. Đọc [kế hoạch](docs/PLAN_VI.md), [trạng thái](docs/STATUS.md), [bản đồ repository](docs/REPOSITORY_MAP.md).
3. Làm [task SQLite đầu tiên](docs/tasks/001-sqlite-foundation.md).

Một repository, một application package, năm module, một SQLite authoritative store. Web và worker chạy riêng từ cùng build artifact. Database mới độc lập với hệ thống Content Studio đang vận hành.

`ARCHITECTURE.md` là bản sao nguyên văn brief do chủ dự án cung cấp ngày 05/09/2026. Các số liệu trong tài liệu lịch sử không phải bằng chứng tiến độ của repository này.

