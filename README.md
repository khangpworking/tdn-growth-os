# TDN Growth Operating System

Hệ thống nghiên cứu và vận hành kinh doanh canxi, phát triển bởi một người với AI coding.

Ưu tiên: giao hàng nhanh; giải pháp đơn giản nhất đáp ứng tiêu chí nghiệm thu; bằng chứng và quyền phê duyệt rõ ràng.

Trạng thái: modular monolith TypeScript/SQLite đã có các lát cắt foundation, analysis, governance/flow và Shopee research được kiểm thử; xem `docs/STATUS.md` để biết năng lực và giới hạn đã xác minh.

## Bắt đầu

Bối cảnh thiết kế đang thảo luận: [INTENT.md](INTENT.md) — quyết định đã thống nhất, phần để sau và câu hỏi tiếp tục phỏng vấn.

Frontend mới đã chốt **React + Vite + TypeScript**, thay thế lựa chọn frontend cũ trong brief kiến trúc: xem [ADR 0002](docs/adr/0002-react-vite-typescript-frontend.md), [Product context](PRODUCT.md) và [brief UX B7–B10](docs/frontend/product-workspace-brief.vi.md). Các tài liệu này chưa phải frontend/API đã triển khai.

1. Đọc `AGENTS.md` và `ARCHITECTURE.md`.
2. Đọc [kế hoạch](docs/PLAN_VI.md), [trạng thái](docs/STATUS.md), [bản đồ repository](docs/REPOSITORY_MAP.md).
3. Làm [task SQLite đầu tiên](docs/tasks/001-sqlite-foundation.md).

Một repository, một application package, năm module, một SQLite authoritative store. Web và worker chạy riêng từ cùng build artifact. Database mới độc lập với hệ thống Content Studio đang vận hành.

`ARCHITECTURE.md` giữ nội dung brief gốc do chủ dự án cung cấp ngày 05/09/2026, với chú thích cập nhật frontend ở đầu tài liệu và ADR 0002 làm quyết định thay thế. Các số liệu lịch sử không phải bằng chứng tiến độ của repository này.


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

## Combined Vietnamese market and review report

Export an offline report from exact existing Result digests without recomputing analysis or filters:

```bash
npm run report:combined:export -- \
  /absolute/path/to/tdn-growth-os.sqlite \
  /absolute/path/to/artifacts \
  <market_snapshot_result_sha256> \
  <adapter3_review_result_sha256> \
  /absolute/outside-git/combined-report.md
```

The exporter opens the database read-only, verifies both Results and their frozen sources, preserves missing values separately from zero and keeps integer strings lossless. Market and review scopes remain separate unless existing verified shared identity is available. Output must be outside the repository, is created with owner-only permissions, and is never overwritten.

## Offline source-package intake

Run `npm run source-package:intake -- <database> <artifact-root> <package-directory> <intake.json> <audit.json> <output.md>` to verify and persist an exact-byte source package and immutable field audit without provider calls. The package directory must exactly match descriptor membership; the report path must be outside this repository and must not already exist. See `docs/tasks/023-source-package-intake.md`.
