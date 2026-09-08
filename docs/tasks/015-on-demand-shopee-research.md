# Task 015 — Thu thập review Shopee theo yêu cầu

Status: READY cho implementation/offline verification; live validation chưa được cấp ngân sách.
Lane: Standard cho code; Controlled chỉ cho login/provider calls thực tế.
Owner: một implementation agent trong worktree được giao. Chưa dispatch agent từ tài liệu này.

## Mục tiêu và phạm vi

Giao một lát cắt thu thập dữ liệu dùng được, không xây thêm framework orchestration:

Metric live → listing Shopee theo doanh số trong kỳ → 5 sản phẩm khác nhau → một listing đại diện/sản phẩm → Apify tối đa 500 comments/listing → raw + view lọc + tóm tắt độ phủ/thiếu dữ liệu.

Chỉ chạy theo yêu cầu. Không lịch tự động. Đây là đầu vào nghiên cứu, chưa phải báo cáo thị trường hoàn chỉnh hoặc insight được phê duyệt.

Task 014 từng gợi ý định nghĩa nghiệp vụ trước khi thêm task workflow. Cuộc phỏng vấn trong INTENT.md đã xác định lát cắt thu thập này; không dùng Task 014 AUTHORIZED_PLAN làm giấy phép gọi provider, không sửa semantics các Task 011–014.

## Đọc và tái sử dụng

- AGENTS.md, INTENT.md (D11–D21), ARCHITECTURE.md phần ownership và external actions.
- docs/STATUS.md, docs/foundation-data-dictionary.md; code artifact store, nguồn/ingestion/evidence và validation hiện tại.
- references/reuse/shopee_review_filter.v3.py: bản sao script do chủ dự án cung cấp, chỉ làm baseline tham chiếu; không import/chạy nguyên trạng vì có I/O top-level.
- https://apify.com/zen-studio/shopee-product-reviews-scraper và Input/API của Actor.
- https://github.com/CloakHQ/cloakbrowser chỉ cho đường collector browser nếu cần; không cài chỉ để chạy unit tests.

Không copy private data, cookies, tokens hoặc profile browser từ Windows vào Git. HTML Metric cũ chỉ minh họa layout, không phải nguồn dữ liệu mới hoặc nguồn URL đã hoạt động.

## Các quyết định đã chốt

1. Lọc Metric về Shopee trước, sắp xếp doanh số tiền bán hàng **trong cùng kỳ nghiên cứu** giảm dần. Không thay bằng lifetime revenue, units sold hoặc tổng doanh số cộng gộp shop.
2. Đi xuống danh sách tới khi có 5 sản phẩm khác nhau đã xác định. Listing đầu tiên của mỗi nhóm là đại diện; giữ các listing khác trong nguồn market data.
3. Tối đa 500 comments thu thập trước lọc cho mỗi listing, tối đa 2.500 cho cả run. Không scrape bù sau lọc. User-configurable limits và TikTok Shop để sau.
4. Thiếu nguồn hoặc lỗi một listing không hủy dữ liệu đã lấy hợp lệ của listing khác. Phân biệt unavailable/failed/empty/partial; không ghi dữ liệu thiếu thành 0 hoặc nâng evidence grade.
5. Preserve raw, provenance và lý do kept/removed. Review một shop không đại diện mọi shop hoặc toàn thị trường.

## Những chỗ chưa chốt — không được tự dựng nghiệp vụ

- Matching sản phẩm/variant chưa có policy đầy đủ. Không tự fuzzy-merge từ tên. V1 chấp nhận mapping nhóm sản phẩm đã được operator xác nhận; dòng chưa đủ cơ sở group phải được flag, không công bố đã có 5 sản phẩm duy nhất. Đây là cầu nối implementation tối thiểu, không xây product-master platform.
- Bằng doanh số: hiển thị để xác nhận representative thay vì âm thầm chọn theo tiêu chí kinh doanh mới. Thiếu doanh số cùng kỳ: flag và không thay bằng lifetime.
- All-star/latest written comments là cấu hình khởi điểm đề xuất cho connector (`starFilter: all`, `contentFilter: with comments`), phải hiện trong collection preview trước live run; không dùng mẫu đó để ước tính tỷ lệ hài lòng toàn bộ thị trường.
- E0–E5 là ngôn ngữ evidence đã đồng ý nhưng chưa có mapping tương đương enum hiện tại. Giữ grade+basis cũ tương thích; ghi rõ provider/provenance và phần E0–E5 chưa hiệu chuẩn. Không thêm migration đổi nhãn ngầm; nếu cần enum mới, dừng riêng phần đó và đề xuất mapping ngắn.

## Luồng xây dựng

### A. Selection và collector boundaries

- Một command/operator entry point, không frontend/API server mới.
- Request rõ chủ đề, kỳ nghiên cứu và nguồn snapshot/mapping; internal constants 5/500. Không nhận arbitrary shell/code.
- Định nghĩa typed boundary hẹp cho Metric listing capture và Apify; không generic plugin/provider registry. Source data là untrusted, validate trước tính toán/lưu authoritative.
- Dùng số VND chính xác; nếu browser chỉ cho số làm tròn như “51,7 tỷ”, giữ precision/estimate marker, không giả vờ đó là exact VND. Nếu làm tròn khiến thứ hạng không xác định, flag và cần xác nhận.
- Ghi source snapshot/hash, period, platform/shop/item identity, grouping basis và representative-selection reason.

### B. Metric live adapter

- Tìm cách reuse flow hiện có từ chủ dự án; đường code browser Windows chưa được giao thì ghi rõ, không khẳng định đã reuse.
- Bản HTML tải xuống không chứa link không phải lý do thêm search Actor. Trên web có thể click product; xác minh đích click/trang chi tiết rồi thu đúng URL Shopee.
- Không đoán URL từ tên; verify shop/item và platform. Không gửi TikTok vào Actor Shopee.
- Có thể implement/test boundary bằng synthetic capture trước. Adapter live chưa chạy được trên Fedora phải báo `LIVE_UNVERIFIED`/blocked, không thay bằng file nhập tay rồi gọi toàn task DONE.
- Không cần xây tự động đăng nhập tổng quát. Dùng phiên đã được chủ tài khoản cho phép; nếu cần tương tác Google/MFA thì báo người dùng. Session/credential không đưa vào prompt, logs, Git.

### C. Apify adapter và run receipt

- Actor cố định `zen-studio/shopee-product-reviews-scraper`. Dùng JSON trực tiếp, không vòng qua Markdown.
- Validate tối đa 5 URL Shopee đã chọn; `maxReviewsPerProduct=500`, không 0. Không tự đổi Actor, nguồn hay filter khi lỗi.
- Ưu tiên Node fetch sẵn có, không thêm SDK khi không cần. Bounded waits và dataset pagination, không tải media files. Giữ run ID, dataset ID, cấu hình filter, thời điểm lấy và lý do dừng/truncate.
- Timeout sau khi gửi start không được tự POST run mới vì có thể phát sinh phí hai lần. Ghi outcome unknown/run ID nếu có và yêu cầu đối chiếu. Không xây retry scheduler hoặc worker system mới trong Box 1.
- Checkpoint run ID ra local ignored receipt để operator tiếp tục đọc đúng dataset; reuse/resume không khởi tạo run trả phí mới. Receipt này không phải durable jobs platform hoặc quyền tự chạy lại.
- Validation chỉ offline/mocked mặc định. Live cần explicit run enable, credentials qua môi trường và trần chi phí được duyệt; kiểm tra cơ chế cost cap theo API hiện tại trước khi dùng. Không token trong URL/log.

### D. Raw, filter và persistence

- Box 1 sở hữu raw/source/ingestion/evidence; Box 2 sở hữu kết quả lọc. Dùng declared service/reader, không ghi trực tiếp bảng Box khác.
- Reuse content-addressed artifacts và SQLite hiện có. Không ép JSON reviews vào manual text import vốn không có cùng semantics.
- Chỉ thêm migration `0011_shopee_review_collection.sql` nếu persistence thực sự cần; giữ migrations 0001–0010 byte-identical. Không tạo bảng cho mọi token/keyword hoặc duplicate document bodies.
- Giữ raw response bytes theo page với hash và lineage; filter output riêng có version/digest. Không để raw/author data trong Git hoặc handoff. Bản tóm tắt không cần username/avatar.
- Refactor logic filter hiện có thành hàm nhận review chuẩn hóa; chọn cách reuse Python stdlib hoặc port nhỏ sang TypeScript dựa trên dependency thực tế. Nếu gọi Python: argv cố định, shell=false, timeout và cleanup; không thêm pip dependencies.
- Giữ baseline phân tách guided fields/metadata, xử lý tiếng Việt và noise masking. Không tự viết lại business keyword lists hoặc scoring.
- Sửa integration gaps có bằng chứng: empty input, invalid stars, UTF-8 output, import side effects, dedup không làm mất product lineage. Duplicate text khác product không bị loại khỏi số liệu nguồn.
- Filter score là priority heuristic, không confidence/trust score. Raw counts, collected counts, filtered counts và provider totals phải tách biệt; không trộn mẫu filtered với population.
- Output là collection summary có selected/missing/failed listings, counts, provenance, limitations; không dashboard layout, AI synthesis hoặc market recommendations.

## Owned paths

- contracts/foundation/, contracts/analysis/ chỉ cho boundary của lát cắt này.
- src/modules/foundation/, src/modules/analysis/ và collector-edge hẹp dưới src/platform/collectors/ nếu cần.
- scripts/ command và filter callable nếu dùng Python; package scripts/typecheck/contract generator thay đổi tối thiểu.
- migration 0011 nếu có lý do; synthetic fixtures và focused tests.
- docs/STATUS.md, docs/foundation-data-dictionary.md, docs/handoffs/015-on-demand-shopee-research.md.

Không đổi dependency versions/CI, Task 006–014 semantics, governance/flow, Pi hoặc baseline architecture để né blocker. Chỉ đề xuất dependency browser riêng nếu live adapter thực sự cần.

## Kiểm thử đúng phạm vi

- Selection: Shopee-only, period-revenue order, duplicate seller listings, variant ambiguity, ít hơn 5, missing/tied revenue.
- Adapter fake responses: 500/listing cap, input validation, multiple dataset pages, malformed/empty output, partial failure; timeout start không double-create.
- Filter synthetic tiếng Việt: có/không dấu, noise-only, negative signal, metadata, duplicate khác sản phẩm, empty input/invalid star. So sánh baseline trên cases đại diện, không coverage target tùy ý.
- Persistence: raw hash/round-trip, lineage, replay/reimport không tạo bản ghi trùng, SQLite upgrade nếu có và permissions Linux như hiện tại.
- Chạy tests liên quan khi sửa; `npm run check` và `git diff --check` một lần ở final candidate. Không load/stress/browser E2E trong test thường ngày. Một live smoke nhỏ khi được phép là kiểm tra connector thật, không thay toàn bộ suite.

## Live checkpoint và định nghĩa hoàn thành

Phân biệt rõ trong handoff:

- `IMPLEMENTATION/OFFLINE PASS`: code và synthetic/mocked checks qua; **không** chứng minh collection thật hoạt động.
- `LIVE PASS`: trên Fedora, Metric đã lấy được link thật, Actor trả dataset thật trong scope/cost được duyệt, filter và persistence thành công; lưu bằng chứng đã loại thông tin riêng tư.
- `PARTIAL/BLOCKED`: nêu connector thiếu và điều kiện tiếp tục; không đánh dấu toàn pipeline hoàn thành.

Trước live, xin chủ dự án đúng ba thông tin vận hành khi cần: topic/period để test, phiên Metric trên Fedora, trần tiền cho một bounded smoke run. Giới hạn 5×500 không tự là phê duyệt chi tiền hoặc tự chuyển số dư tài khoản.

## Không xây ở Task 015

TikTok collection, SerpApi, KaloData connector, AI report/chat, 60-question engine, dashboard/layout, B0/B14, config UI, scheduling, workers/queues, autonomous approval, deployment, migration dữ liệu cũ. Đây là bước đầu trong kế hoạch research rộng hơn, không hủy các nguồn đã dự kiến.

## Handoff

Dùng templates/handoff.md: starting/final SHA, changed paths, checks thực chạy, migration hashes nếu có, offline/live tách biệt, exact Actor settings/version đã quan sát, unresolved matching/budget/browser items, residue và worktree status. Không đưa raw provider output/credentials vào handoff.

Task brief này chỉ được tạo và commit local. Chưa push, tạo PR hoặc gửi Fedora. Sau khi được giao qua GitHub, giữ PR draft, push thường, không force; cuối cùng ghi marker `HANDOFF_TO_CODEX commit=<FULL_SHA> result=<PASS|PARTIAL|BLOCKED> live=<PASS|NOT_RUN|BLOCKED>` đúng bằng chứng. PASS offline không đồng nghĩa Task 015 live-complete.
