# Task 002 — Minimal GitHub PR gate

Status: READY. Lane: Lean. Owner: Codex/GitHub automation.

## Mục tiêu

Tự động chạy đúng gate hiện có cho mọi pull request vào `main`, để lỗi cài dependency, contract, TypeScript hoặc integration test được phát hiện trước khi merge.

## Owned paths

- `.github/workflows/check.yml`
- `docs/tasks/002-ci-gate.md`
- `docs/STATUS.md` chỉ để cập nhật trạng thái

## Implement

1. Chạy trên pull request vào `main` và push lên `main`.
2. Dùng một Ubuntu runner, Node `24.15.0`, lockfile và npm đã pin trong repository.
3. Chạy tuần tự:
   - `npm ci`
   - `npm run check`
4. Quyền GitHub token chỉ `contents: read`.
5. Có timeout ngắn và hủy run cũ khi cùng ref có run mới.

## Nghiệm thu

- Workflow xuất hiện trên PR của chính task này.
- Install từ lockfile thành công.
- Contract generation, strict TypeScript và toàn bộ 9 integration tests hiện tại pass.
- Không dùng secret, provider, database thật hoặc deployment.
- Không thêm matrix, coverage gate, browser E2E, cache tự chế hoặc security scanner trong task này.

## Sau Task 002

Task 003 sẽ thêm một đường nhập multi-row JSON export cho Box 1 bằng fixture tổng hợp dựa trên field inventory. Task đó giữ nguyên raw file bytes, validate contract, map các metric tối thiểu và truy vấn lineage; chưa kết nối provider thật hoặc Data Pack.
