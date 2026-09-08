# Handoff — Task 015 file-input Shopee research

Status: IMPLEMENTED LOCALLY, NEEDS FEDORA REVIEW/VALIDATION. Không phải PASS toàn task.
Branch: `feature/015-file-shopee-research`.
Base trên main: `f845c5abab6b37f3c71f4225c6831a5c04a3c24e` (sau Task 014).
Bundle tip SHA được cung cấp riêng trong prompt giao việc để tránh self-referential commit.

## Scope đã được chủ dự án duyệt

Fedora là môi trường chạy và lưu dữ liệu chính. Không backport hoặc thêm Windows compatibility work. Không cần Metric login: nhận file listing do operator cung cấp. Metric browser connector, TikTok, UI/chat, scheduling và manual settings để sau.

Trong file: Shopee-only → doanh số trong cùng kỳ giảm dần → 5 sản phẩm khác nhau theo grouping đã xác nhận → 1 listing đại diện mỗi sản phẩm → tối đa 500 comments/listing. Giữ raw, filter riêng và cảnh báo dữ liệu thiếu. Không tự scrape bù sau filter.

## Đã implement, cần review

- Canonical schemas/generated types cho listing input, collection manifest, provider review rows và analysis result.
- Selection bằng BigInt; không đoán grouping, precision hay tie; URL khớp Shopee shop/item. Chưa tự matching từ tên.
- Apify adapter fixed Actor, token header, max charge, limits/pagination, local start/run receipts và resume. Unknown POST không tự start lại; runKey conflict không tạo paid run mới.
- Foundation collection service: raw request/pages + canonical manifest, source/ingestion/evidence, immutable collection và verified reader.
- Callable Python stdlib filter từ script của chủ dự án; giữ keywords/scoring, dedup theo product. Box 2 đọc qua reader, lưu result riêng và kiểm tra lineage/replay.
- CLI preview/fixture/live; fixture không cần token, live cần explicit flags + budget. Summary không in review body/author.
- Migration duy nhất mới: `0011_shopee_review_collection.sql`. Migrations 0001–0010 không thay đổi nội dung Git.
- `.gitattributes` chỉ giữ LF cho migration và filter có checksum. Không đổi checksum baseline. Thay launcher typecheck cho Windows đã được bỏ; dùng lại bản Linux gốc.

## Bằng chứng local, không thay thế Fedora

- Node 24.15.0, npm 11.12.1, Python 3.13 trên Windows.
- `npm ci`: PASS, lockfile/dependency versions không đổi.
- 11 Task 015 tests: PASS. Lần cuối chạy cùng 9 foundation tests: 20/20 PASS.
- Typecheck đã PASS với launcher Windows tạm thời; launcher này sau đó được trả về bản Linux gốc theo yêu cầu chủ dự án.
- Full suite phát hiện CRLF checkout làm sai migration hash: đã trả file working copy về đúng LF/bytes trong Git, không sửa hash kỳ vọng.
- Full suite kế tiếp còn một failure ở fresh-DB expectation 10 thay vì 11; đã sửa tất cả expected version/list sang 11 và targeted foundation tests PASS. Chưa rerun full suite sau sửa cuối.
- Chưa Fedora permission/ELF validation, GitHub Check, live Apify, Metric login, production deploy hoặc remote push/PR.
- Tests dùng thư mục tạm riêng và cleanup; không giữ DB/raw provider output hoặc credential trong Git.

## Việc Fedora cần làm

1. Verify bundle và exact tip/base theo prompt; inspect remote branch/PR trước khi tạo để tránh ghi đè công việc khác. Dùng worktree riêng; không force/reset.
2. Đọc AGENTS.md, INTENT.md, task spec và handoff này. Scope override file-input đứng đầu task spec thay thế yêu cầu Metric live ban đầu.
3. Dùng Node 24.15.0/npm 11.12.1 + Python 3 có sẵn; cài dependencies từ lockfile, không cần pip package/browser.
4. Review code tập trung vào selection/grouping, per-listing cap, receipt/idempotency/no duplicate spend, raw provenance, filter bias, cross-Box boundaries, partial/empty states và replay. Sửa lỗi thực, không thêm general agent/worker framework.
5. Chạy focused tests, typecheck và `npm run check`; xác minh v10→v11/idempotency, migrations cũ nguyên vẹn, DB/WAL/SHM/artifacts 0600. CLI fixture smoke không cần credentials.
6. Cập nhật docs với kết quả thật và limitations. Nếu được phép publish trong prompt: commit/push thường lên nhánh feature, mở/giữ PR draft, đợi CI đúng final SHA rồi post handoff. Không merge.

## Không được tự suy ra

Không mở profile/credentials, đăng nhập, đọc dữ liệu riêng, chạy Actor/SerpApi hay gọi provider trả phí. Có code live adapter không đồng nghĩa có quyền dùng số dư. Không đòi setup Metric trước khi làm file-input validation. Không đánh dấu data collection live-ready từ fake tests.

E0–E5 mapping chưa hiệu chuẩn; evidence hiện giữ nhãn synthetic/unverified với basis rõ ràng. Không tự đổi enum hoặc gọi dữ liệu đã verified. Rule grouping/tie vẫn có flag cần operator confirmation.
