# TDN Growth Operating System

Hệ thống nghiên cứu và vận hành kinh doanh canxi, phát triển bởi một người với AI coding.

Ưu tiên: giao hàng nhanh; giải pháp đơn giản nhất đáp ứng tiêu chí nghiệm thu; bằng chứng và quyền phê duyệt rõ ràng.

Trạng thái: modular monolith TypeScript/SQLite đã có các lát cắt foundation, analysis, governance/flow và Shopee research được kiểm thử; xem `docs/STATUS.md` để biết năng lực và giới hạn đã xác minh.

## Bắt đầu

Bối cảnh thiết kế đang thảo luận: [INTENT.md](INTENT.md) — quyết định đã thống nhất, phần để sau và câu hỏi tiếp tục phỏng vấn.

1. Đọc `AGENTS.md` và `ARCHITECTURE.md`.
2. Đọc [kế hoạch](docs/PLAN_VI.md), [trạng thái](docs/STATUS.md), [bản đồ repository](docs/REPOSITORY_MAP.md).
3. Làm [task SQLite đầu tiên](docs/tasks/001-sqlite-foundation.md).

Một repository, một application package, năm module, một SQLite authoritative store. Web và worker chạy riêng từ cùng build artifact. Database mới độc lập với hệ thống Content Studio đang vận hành.

`ARCHITECTURE.md` là bản sao nguyên văn brief do chủ dự án cung cấp ngày 05/09/2026. Các số liệu trong tài liệu lịch sử không phải bằng chứng tiến độ của repository này.


## Xuất báo cáo bằng chứng Shopee đã lưu

Chỉ định **đúng Result SHA-256**; command không chọn “latest”, không chạy filter/analyze, không gọi provider và mở SQLite read-only:

```bash
npm run research:shopee:export -- \
  /path/to/tdn.sqlite \
  /path/to/artifacts \
  <result-sha256> \
  /path/outside/repository/bao-cao.md
```

V1 chỉ hỗ trợ Result `shopee-calcium-v3-adapter3`. Output phải ở ngoài Git, được tạo mới với quyền owner-only `0600`, và command từ chối ghi đè. Báo cáo giữ nguyên review được retain dưới dạng quoted inert text, không xuất author identifier; điều này không đảm bảo free text tự thân không chứa thông tin cá nhân.
