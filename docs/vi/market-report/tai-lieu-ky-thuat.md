# Tài liệu kỹ thuật báo cáo Thị trường (Market) tự động

Mục đích: mô tả module, route, bảng dữ liệu, cờ cấu hình, nguồn, vòng kiểm định, đường PDF, kiểm thử, triển khai và cách xử lý sự cố của báo cáo Thị trường tự động.

Cập nhật: 20/10/2026 · Commit chính: `e9e0f444`

Quy ước: đường dẫn là tương đối so với gốc repo. Chỗ nào chưa xác nhận trong mã đã đọc thì ghi "(cần xác nhận)". Mục chưa làm ghi "Chưa làm" hoặc "Kế hoạch".

## Mục lục

- Phần 1. Tổng quan và module
- Phần 2. Route HTTP
- Phần 3. Bảng dữ liệu và migration
- Phần 4. Cờ cấu hình (chỉ tên)
- Phần 5. Nguồn, adapter và giới hạn
- Phần 6. Vòng cổng kiểm định, audit và bản sửa v2
- Phần 7. Đường PDF
- Phần 8. Kiểm thử và CI
- Phần 9. Triển khai (deploy)
- Phần 10. Xử lý sự cố

---

## Phần 1. Tổng quan và module

Hệ thống là một monolith TypeScript chia module, dùng SQLite qua `better-sqlite3`, giao diện React/Vite với hash route (`frontend/src/research-automation/routes.ts`). Ứng dụng vận hành (operator app) là tiến trình duy nhất phục vụ API và giao diện; nó chỉ lắng nghe trên địa chỉ nội bộ của máy, không mở ra mạng ngoài (cấu hình qua tên biến `TDN_OPERATOR_APP_HOST`, `TDN_OPERATOR_APP_PORT`; xem `src/api/operator-app.ts`).

Quyết định kiến trúc chính nằm ở `docs/adr/0006-research-automation-execution.md`: một dịch vụ `ResearchAutomationService` thuộc module Analysis, lưu trạng thái bền trong SQLite (migration 0038), cùng một `ResearchAutomationWorker` tối thiểu gắn vào executor của operator. Không dùng hàng đợi riêng. Khi tiến trình khởi động lại, dòng nào đang chạy nhà cung cấp chuyển sang `INTERRUPTED` và không bao giờ được tự thử lại; chỉ bước kết xuất cục bộ (không phát sinh phí) mới được xếp hàng lại.

Các thư mục chính:

| Thư mục / tệp | Vai trò |
| --- | --- |
| `src/api/operator-app.ts` | Dựng cấu hình từ môi trường, kiểm tra phiên bản DB, định tuyến HTTP |
| `src/api/research-generation-api.ts` | Hai route "tạo báo cáo từ đầu vào" (`inputs`, `reports`) |
| `src/api/research-automation-api.ts` | Toàn bộ route phiên nghiên cứu, nguồn, báo cáo đọc, PDF |
| `src/modules/analysis/research-automation/service.ts` | Dịch vụ lõi: trạng thái phiên, bước, chi phí, xác nhận phạm vi |
| `src/modules/analysis/research-automation/worker.ts` | Worker nhận bước đã xếp hàng |
| `src/modules/analysis/research-automation/autorun-derive.ts` | Hàm thuần suy ra mọi giá trị trước đây người vận hành phải gõ tay (phiên tự chạy) |
| `src/modules/analysis/research-automation/providers.ts`, `provider-*.ts` | Cấu hình và gọi nhà cung cấp trả phí |
| `src/modules/analysis/research-automation/*-lane.ts` | Từng "làn" nguồn: Comtrade, World Bank, quảng cáo, thống kê chính thức, video, PDF, v.v. |
| `src/modules/analysis/research-automation/metric-*.ts`, `opencli-*.ts` | Thu thập số liệu bán hàng qua trình duyệt tự động (OpenCLI) |
| `src/modules/analysis/research-automation/market-14-rules.ts` | Kiểm 14 quy tắc |
| `src/modules/analysis/research-automation/market-business-gate.ts` | Cổng kinh doanh |
| `src/modules/analysis/research-automation/reader-report-revisions.ts` | Phiên bản báo cáo đọc (reader) và quyết định chủ sở hữu |
| `src/modules/analysis/research-automation/pdf.ts` | Kết xuất PDF bằng Chromium cục bộ |
| `src/modules/analysis/reader-report/` | Dựng trang đọc: mẫu `market-template*.ts`, biểu đồ `market-charts.ts`, `macro-charts.ts`, `flint.ts`, `lint.ts`, `layout.ts` |
| `contracts/api/` | JSON schema và kiểu sinh ra cho các route |
| `migrations/` | Migration SQL (đến 0059) |
| `docs/research-automation/README.md` | Quyết định sản phẩm (Việt Nam, kỳ mặc định 365 ngày, tách Market/Insight) |

## Phần 2. Route HTTP

Hai không gian đường dẫn: `/api/...` (đọc) và `/owner-api/...` (ghi, cần xác thực chủ sở hữu). Phần ghi yêu cầu đồng thời: đúng `Origin`, token chủ sở hữu hợp lệ và cờ cho phép ghi (`TDN_OWNER_API_ENABLED`). Các GET đọc không nhận query string. Nguồn: `src/api/research-automation-api.ts`, `src/api/research-generation-api.ts`.

**Tạo báo cáo từ đầu vào (generation)**

- `GET /owner-api/research-generation/inputs?workspaceId=...` liệt kê đầu vào.
- `POST /owner-api/research-generation/reports` tạo báo cáo.

**Trạng thái nguồn**

- `GET /api/workspaces/<id>/research-automation/source-status`
- `POST /owner-api/workspaces/<id>/research-automation/source-status/pageindex/recheck`

**Phiên nghiên cứu** — mẫu `.../workspaces/<workspaceId>/research-automation/runs[/<runId>[/<hành động>]]`. Các hành động đã thấy trong mã:

- Vòng đời: `confirm-scope`, `cancel`, `auto-run/retry`.
- Nguồn: `sources/metric`, `sources/metric-capture`, `sources/supplemental`, `sources/kalodata-video`, `sources/world-bank` (và `/confirm`), `sources/meta-page` (và `/confirm`), `sources/tiktok-comments` (và `/selections`, `/collect`), `sources/video-reading`, `sources/tiktok-coding`, `sources/shopee-coding` (kèm `samples`, `context`, `proposals`, `consumption`), `source-pdfs`, `pageindex`.
- Quy tắc/thành viên: `metric-rule-adoptions`, `metric-membership-proposals`, `metric-membership-receipts`.
- Báo cáo đọc: `reader-reports`, `reader-reports/decisions`, `reader-reports/v2`, `reader-reports/decisions/v2`, `reader-reports/tiktok`, `reader-reports/shopee`, `reader-reports/insight`, `reader-reports/unit-spec-intakes`, `report-versions`, `report-attempts`, `report-revisions`.
- Phần Insight (hiện tạm dừng theo quyết định chủ sở hữu): `insight-crosscheck-preparations`, `insight-persona-model-proposals`, `insight-coding-model-proposals`, `insight-coding-default-model-proposals`.

Mỗi route có schema trong `contracts/api/` (ví dụ `research-automation-api.schema.json`, `research-automation-reader-report-api.schema.json`). Yêu cầu ghi dùng khóa yêu cầu (request key) idempotent: gửi lại cùng khóa và cùng nội dung chuẩn hóa trả về biên nhận cũ (`exactRetry`), khác nội dung thì báo xung đột (ADR 0006).

**Giao diện** dùng hash route `#/markets/<marketId>/research` và `#/markets/<marketId>/research/<runId>`; id phiên lưu trong URL nên tải lại trang vẫn tiếp tục đúng phiên, không dùng bộ nhớ trình duyệt.

## Phần 3. Bảng dữ liệu và migration

Migration nằm ở `migrations/`; 0038 đến 0059 liên quan trực tiếp đến research automation và reader report. Điểm đáng chú ý:

| Migration | Nội dung (theo tên tệp / chú thích đã đọc) |
| --- | --- |
| `0038_research_automation.sql` | Phiên nghiên cứu: ảnh chụp yêu cầu bất biến, từng bước, byte thô và chi phí thực của nguồn, đầu ra nháp |
| `0040`–`0045` | Tập nguồn đã xác nhận (`0040`), lượt bổ sung / kết xuất lại báo cáo và đầu ra của từng lượt (`0041`: bảng `analysis_research_automation_attempts`, `analysis_research_automation_attempt_outputs`), thực thi AI (`0042`), chấp nhận quy tắc Metric (`0043`), thành viên Metric (`0044`), mã hóa Insight (`0045`) |
| `0048_analysis_reader_report_revisions.sql` | Bảng `analysis_reader_report_revisions`: một trang đọc bất biến cho mỗi phiên bản; chỉ dựng từ phiên `DRAFT_READY`; số phiên bản liền mạch; tối đa một quyết định chủ sở hữu mỗi phiên bản |
| `0049_analysis_pageindex_documents.sql`, `0057`, `0058` | Tài liệu PDF lập chỉ mục, nguồn gốc PDF theo phiên, tiêu đề |
| `0050`–`0054` | Loại báo cáo đọc, tiêu thụ và mã hóa TikTok / Shopee |
| `0055_analysis_research_automation_autorun.sql` | Bảng `research_automation_autorun`: trạng thái bền của bộ tự chạy Market |
| `0056_analysis_research_automation_autorun_retries.sql` | Bảng `research_automation_autorun_retries`: mỗi lần chủ sở hữu bấm "Thử lại" một dòng, khóa theo khóa yêu cầu để gửi lại cùng yêu cầu thì trả cùng biên nhận |
| `0059_analysis_research_automation_review_stages.sql` | Bảng `analysis_research_automation_review_stages`: điểm kiểm (checkpoint) bất biến của phần không-đánh-giá, để phần đuôi đánh giá công khai được chốt sau (trigger chặn cập nhật) |

Bảng `research_automation_autorun` (đọc từ migration 0055):

- Chỉ có dòng cho phiên bắt đầu khi bộ tự chạy bật và có yêu cầu MARKET; phiên khi tắt cờ không có dòng.
- `phase` thuộc: `WAITING_SCOPE`, `CAPTURE`, `PREPARE`, `PICK`, `CONFIRM`, `WAIT_DRAFT`, `PRESENT`, `DONE`, `STOPPED`. `phase_state` thuộc `QUEUED`, `RUNNING`.
- `STOPPED` khi và chỉ khi có `stop_code` (chữ hoa/số/gạch dưới, tối đa 64 ký tự); `stop_detail` ngắn, không chứa đường dẫn.
- Khóa yêu cầu cố định theo từng bước (`prepare`, `confirm`, `revision`), sinh bởi `autorunRequestKey` trong `autorun-derive.ts`: cùng phiên và bước thì cùng khóa, nên bước khởi động lại phát lại đúng yêu cầu cũ.
- Thư mục thu thập suy ra từ id phiên, không lưu đường dẫn.

Mã dừng thuộc nhóm thu thập (chỉ nhóm này mới được "Thử lại" thủ công): `METRIC_LOGIN_REQUIRED`, `METRIC_CAPTCHA`, `METRIC_PERIOD_UNSUPPORTED`, `METRIC_UI_CHANGED`, `METRIC_FILTER_MISMATCH`, `METRIC_ROW_CAP`, `METRIC_SEARCH_NOT_APPLIED`, `BRIDGE_DISCONNECTED`, `EXECUTOR_DISABLED`, `TIMEOUT`, `MANIFEST_HASH_MISMATCH`, `EXECUTOR_NOT_CONFIGURED`, `PERIOD_OUTSIDE_RUN`, `CAPTURE_INTERRUPTED`, `CAPTURE_INPUT_INVALID`, `CAPTURE_IO_FAILED` (`src/modules/analysis/research-automation/autorun-derive.ts`). Dừng ở giai đoạn chọn, xác nhận, trình bày, kết thúc phiên hoặc do chủ sở hữu thì không thử lại được.

Quy tắc chọn liên kết Shopee của bộ tự chạy có phiên bản (`autorun-pick-v3`, còn `autorun-pick-v2` để tương thích), tối đa 5 liên kết; cửa sổ kết quả của Metric là 30 ngày gồm cả hai đầu.

## Phần 4. Cờ cấu hình (chỉ tên)

Cấu hình đọc một lần từ môi trường khi khởi động (`src/api/operator-app.ts`); giá trị boolean sai định dạng làm ứng dụng từ chối khởi động. Chỉ liệt kê tên, không ghi giá trị.

- **Ứng dụng:** `TDN_WORKSPACE_DB`, `TDN_ARTIFACT_ROOT`, `TDN_OPERATOR_APP_HOST`, `TDN_OPERATOR_APP_PORT`, `TDN_OWNER_API_ENABLED`, `TDN_OWNER_API_LOCAL_TEST`, `TDN_OWNER_API_TOKEN`, `TDN_OWNER_API_ACTOR_ID`.
- **Bộ tự chạy / Metric:** `TDN_METRIC_OPENCLI_ENABLED` (đúng "1" mới bật; giá trị khác thì không có bộ tự chạy và không có dòng), `TDN_METRIC_OPENCLI_ADAPTER_MANIFEST`, `TDN_METRIC_OPENCLI_ADAPTER_SHA256`, `TDN_METRIC_CAPTURE_DIR`, `TDN_RESEARCH_KALODATA_REPLAY_SOURCE_RUN_ID` (chế độ phát lại, không tốn điểm).
- **Làn nguồn:** `TDN_RESEARCH_SEARCH_TRENDS_ENABLED`, `TDN_RESEARCH_SEARCH_TRENDS_GEO_ENABLED`, `TDN_RESEARCH_EXPANDED_SEARCH_ENABLED`, `TDN_RESEARCH_WORLD_BANK_ENABLED`, `TDN_RESEARCH_COMTRADE_ENABLED`, `TDN_RESEARCH_GOOGLE_ADS_ENABLED`, `TDN_RESEARCH_OFFICIAL_STATS_ENABLED`, `TDN_RESEARCH_OFFICIAL_STATS_PROVINCE_ENABLED`, `TDN_RESEARCH_META_AUTO_ENABLED`, `TDN_RESEARCH_TIKTOK_TOPADS_ENABLED`, `TDN_RESEARCH_VIDEO_WATCH_ENABLED`, `TDN_RESEARCH_PDF_DISCOVERY_ENABLED`, `TDN_RESEARCH_PDF_DISCOVERY_MAX_PAGES`.
- **Nhà cung cấp trả phí:** `TDN_KALODATA_SECRET_KEY`, `TDN_SERPAPI_API_KEY`, `TDN_APIFY_TOKEN`, `TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED`, `TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN`, `TDN_RESEARCH_SHOPEE_PUBLIC_BASE_URL`, `TDN_RESEARCH_SHOPEE_PUBLIC_MAX_COMMENTS_PER_PRODUCT`; trần: `TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD`, `TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT`, `TDN_RESEARCH_TIKTOK_COMMENTS_MAX_CHARGE_USD`; kiểm thử: `TDN_RESEARCH_AUTORUN_TEST_REVIEWS`.
- **AI (đều qua cổng AI nội bộ, tên biến `TDN_CLIPROXY_BASE_URL`, `TDN_CLIPROXY_API_KEY`):** `TDN_RESEARCH_CAPTURE_RELEVANCE_AI_MODEL` (giai đoạn đánh giá độ liên quan; khi trống thì dùng luật v2), `TDN_RESEARCH_KEYWORD_DRAFT_AI_ENABLED` / `_MODEL`, `TDN_RESEARCH_I14_AI_ENABLED` / `_MODEL`, `TDN_RESEARCH_M11_AI_ENABLED` / `_MODEL`, `TDN_RESEARCH_M12_AI_ENABLED` / `_MODEL`, `TDN_RESEARCH_I15_AI_ENABLED` / `_MODEL` (ghép tên trong `src/api/operator-app.ts`), `TDN_RESEARCH_INSIGHT_CODING_AI_ENABLED` / `_MODEL`, `TDN_RESEARCH_TIKTOK_CODING_AI_ENABLED` / `_MODEL`, `TDN_RESEARCH_SHOPEE_CODING_AI_ENABLED` / `_MODEL`, `TDN_RESEARCH_COVER_AI_ENABLED` / `_MODEL`. Mỗi cờ `_ENABLED` phải đúng `true` hoặc `false`; bật thì bắt buộc khai tên mô hình tường minh.
- **Video:** `TDN_RESEARCH_VIDEO_MEDIA_DIR`, `TDN_RESEARCH_VIDEO_WATCH_MODEL`, `TDN_RESEARCH_YTDLP_BIN`, `TDN_RESEARCH_FFPROBE_BIN`.
- **PDF và lập chỉ mục:** `TDN_RESEARCH_PDF_CHROMIUM` (đường dẫn trình in; thiếu thì không xuất PDF), `TDN_PAGEINDEX_CLOUD_ENABLED`, `TDN_PAGEINDEX_MAX_QUESTIONS_PER_RUN`, `TDN_PAGEINDEX_STARTING_CREDIT_MICRO_DOLLARS`.
- **Lưu trữ đối tượng:** `TDN_R2_ENABLED` và nhóm khóa `TDN_R2_*`.

Trạng thái bật/tắt trên môi trường chạy thật không nằm trong repo; xem bảng trạng thái trong `docs/STATUS.md` và quy chuẩn dữ liệu đầu vào (cần xác nhận phiên bản mới nhất).

## Phần 5. Nguồn, adapter và giới hạn

Quy chuẩn dữ liệu đầu vào liệt kê các nguồn S01–S28 (tài liệu quản lý ngoài repo, bản v1.36; không sao chép bảng đầy đủ ở đây — cần đối chiếu tài liệu đó khi sửa). Tóm tắt các nhóm nguồn và giới hạn đã xác nhận:

| Nhóm | Nhà cung cấp / công cụ | Ghi chú giới hạn |
| --- | --- | --- |
| Số liệu bán hàng Shopee/TikTok | Metric, đọc qua trang kết quả bằng OpenCLI (`metric-*.ts`, `opencli-*.ts`, runbook `docs/runbooks/metric-opencli.md`) | Không có tính năng tải báo cáo; cửa sổ kết quả 30 ngày; có cổng kiểm adapter qua manifest và mã băm |
| Video và quảng cáo TikTok | Kalodata (`provider-kalodata.ts`) | Tính theo điểm (theo rà soát ngân sách gọi 16/10: mỗi lệnh gọi trả phí khoảng 0,1 điểm; mức này không nằm trong mã, cần xác nhận lại); có chế độ phát lại 0 điểm (`kalodata-replay.ts`); hết điểm thì dừng (tùy chọn A đã gộp: dừng khi nhà cung cấp trả mã 2016, `provider-kalodata.ts`, và chặn các cửa sổ còn thiếu) |
| Đánh giá và bình luận | Apify; dịch vụ Shopee API riêng (nhóm cờ `TDN_RESEARCH_SHOPEE_PUBLIC_` ở Phần 4) | Trần Apify tối đa 15 USD mỗi lần chạy thử; Shopee: tối đa 300 đánh giá mỗi sản phẩm cho nguồn đếm công khai |
| Tìm kiếm | SerpApi (`provider-serpapi.ts`, `search-interest.ts`, `search-geo.ts`, `expanded-search*.ts`) | Mức quan tâm không phải số đếm; SerpApi chỉ chạy sau khi đã xác nhận sản phẩm |
| Quảng cáo | OpenCLI cho Meta (tối đa 5 trang) và TikTok; Google ads qua làn riêng | Cờ riêng từng làn |
| Thống kê chính thức | Cục Thống kê (NSO), Ngân hàng Thế giới, UN Comtrade | World Bank cần tham số nguồn đúng (`source=2`, `world-bank-intake.ts`); Comtrade tối đa 4 lệnh gọi dữ liệu mỗi phiên, cách nhau ít nhất 6 giây, chờ 65 giây và thử lại một lần khi gặp 429 (`comtrade-lane.ts`); không cộng các đối tác |
| Tài liệu PDF | PageIndex (`pdf-discovery-lane.ts`, `pdf-excerpt.ts`) | Tối đa 32 MiB mỗi tệp đính kèm; ngưỡng số dư trong `src/modules/analysis/pageindex-balance.ts`: cảnh báo khi còn tối đa 2 USD, chặn khi còn tối đa 0,5 USD, tính 0,01 USD mỗi trang lập chỉ mục; trích dẫn phải được kiểm chứng |
| Video người bán | Làn xem video (`video-watch-lane.ts`, `video-watch-media.ts`) | Tải TikTok chỉ chạy được ở máy chủ triển khai; giữ 45 ngày rồi tự xóa trong ứng dụng (`VIDEO_WATCH_RETENTION_DAYS` trong `video-watch-media.ts`) |
| Bộ persona tổng hợp (S28) | Kế hoạch, chưa nối vào báo cáo Market | Không bao giờ nêu tên bộ dữ liệu trong báo cáo |

Mọi nhà cung cấp đứng sau cổng `AutomationSourcePort` (ADR 0006): thông tin xác thực và giao thức nằm ở adapter, không nằm ở dịch vụ lõi. Chi phí và số lượt gọi được ghi theo từng bước; chi phí chưa biết hiển thị là "chưa có số liệu", không hiển thị 0.

## Phần 6. Vòng cổng kiểm định, audit và bản sửa v2

Luồng của một phiên tự chạy (pha trong `research_automation_autorun`):

1. `WAITING_SCOPE`: tìm nhanh xong, chờ chủ sở hữu duyệt phạm vi.
2. `CAPTURE`: thu thập số liệu bán hàng (OpenCLI) vào thư mục theo id phiên.
3. `PREPARE`: chuẩn bị gói đầu vào; dòng thu thập được đánh giá chất lượng (`capture-row-quality.ts`) và độ liên quan (`capture-relevance.ts`; luật v2, hoặc v3 khi cờ mô hình độ liên quan được đặt).
4. `PICK`: chọn liên kết sản phẩm theo luật `autorun-pick-v3`.
5. `CONFIRM`: xác nhận nguồn với phiên bản kỳ vọng.
6. `WAIT_DRAFT`: chờ bản nháp tự động.
7. `PRESENT`: khi phiên ở trạng thái `DRAFT_READY`, bộ tự chạy luôn yêu cầu đúng một lượt trình bày lại (revision attempt, hợp đồng `automation-market-presentation-revision-v1`, `service.ts` hàm `#autorunPresent`) từ cặp bản nháp mới nhất; lượt này dựng trang đọc v2 và chạy kiểm định. Lượt `COMMITTED` thì sang `DONE`; lượt hỏng thì dừng với mã `PRESENTATION_FAILED`; nếu đã có lượt sửa tay của chủ sở hữu thì dừng với `OWNER_REVISION_EXISTS`.
8. `DONE` hoặc `STOPPED`.

**Kiểm định khi dựng trang đọc** (gọi từ `reader-report-revisions.ts` và mẫu Market):

- `auditMarket14` (trong `market-14-rules.ts`) trả về từng quy tắc 1–14 kèm loại `machine` hay `evidence`. Quy tắc 1–5, 7, 9–13 do máy kiểm; quy tắc 6, 8, 14 là loại chứng cứ (người rà soát); quy tắc 10 là máy kiểm cho ảnh bìa nhúng sẵn do AI tạo có chú thích, còn bìa có bản quyền hoặc do chủ sở hữu cung cấp cần người xem. `assertMarket14MachineRules` ném `TypeError` với mã `MARKET_14_RULES_FAILED:<danh sách quy tắc>`.
- `auditMarketReportHtml` (cổng kinh doanh, `market-business-gate.ts`) kiểm các mã: `G08_PROVIDER_NAME`, `U32_NO_CROSS_PLATFORM_TOTAL`, `E2_NO_REVENUE_ORDER`, `SECTIONS_PRESENT`, `M12_PROPOSAL_LABEL`, `PARTIAL_TOTAL_FORBIDDEN`, `NO_LEAK`, `SEARCH_INTEREST_NOT_COUNT`, `WORLD_BANK_NOT_ARITHMETIC`, `PDF_EXCERPT_NOT_MARKET_NUMBER`, `SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL`; lỗi ném `MARKET_BUSINESS_GATE_FAILED:<mã>`. Thêm bộ lint văn bản hiển thị (`src/modules/analysis/report-visible-text-lint.ts`, U13).
- `reader-report-revisions.ts` (dòng 371) bắt hai loại lỗi trên và chuyển thành `ResearchAutomationValidationError` để API trả lỗi xác thực rõ ràng.

**Lượt trình bày lại (bản v2).** Ở pha `PRESENT`, bộ tự chạy gọi `requestReportRevision` với `buildRevisionValue` (`autorun-derive.ts`): giữ nguyên nguồn Metric và đánh giá gốc (`KEEP`), khóa yêu cầu riêng `autorunRequestKey(runId, 'revision')`, nên khởi động lại thì phát lại đúng yêu cầu. Lượt này lưu vào bảng `analysis_research_automation_attempts` và đầu ra ở `analysis_research_automation_attempt_outputs` (migration 0041; route `report-attempts`, `report-revisions`). Kiểm định 14 quy tắc và cổng kinh doanh chạy khi dựng trang đọc; vi phạm làm lượt dựng bị từ chối (`MARKET_14_RULES_FAILED`, `MARKET_BUSINESS_GATE_FAILED`). Vì vậy bản đạt là bản v2 (đầu ra của lượt), không phải bản nháp đầu. Quy tắc vận hành khi chấm: chấm 14/14 trên đầu ra v2 tự động, không chấm bản nháp canary đầu (bản này thường trượt các quy tắc 1, 3, 7, 9, 11; theo ghi chú vận hành, không tự động hóa trong mã). Việc bản nháp đầu có qua cổng riêng hay không, và số lượt sửa tối đa, cần đọc thêm `service.ts` (cần xác nhận).

**Bốn lớp chứng cứ** (ADR `0005-report-evidence-and-decision-ledger.md`): chứng cứ nguồn (byte gốc), tính toán xác định (đầu vào đã chuẩn hóa, phiên bản phương pháp), diễn giải AI (bất biến, chưa duyệt, chỉ được trích dẫn khẳng định đã có), quyết định con người (chỉ nối thêm, tách khỏi nội dung báo cáo).

**Nguyên tắc sửa lỗi:** sửa phải áp dụng toàn hệ thống và được kiểm trên ít nhất 3 sản phẩm; sửa tay chỉ để học rồi đưa vào mã.

## Phần 7. Đường PDF

1. Báo cáo đọc (HTML) được dựng từ khung ngữ nghĩa đã đóng băng và lưu bất biến, kèm hash (`html_sha256`, `metrics_sha256`, `claims_sha256`, `cover_sha256` trong bảng revisions).
2. `src/modules/analysis/research-automation/pdf.ts` tạo bộ kết xuất `createChromiumPdfRenderer({ executablePath })`: Chromium cục bộ in HTML đã lưu (không script, không gọi ra ngoài), dùng `Page.printToPDF` với nền in và kích thước trang theo CSS, nhận kết quả dạng stream. Có giới hạn kích thước (`MAX_HTML_BYTES`, `MAX_PDF_BYTES` trong `model.ts`); vượt thì lỗi.
3. Chỉ khi cấu hình `TDN_RESEARCH_PDF_CHROMIUM` có và Chromium thật chạy thành công mới lưu PDF; nếu không, giao diện hiển thị lý do "PDF chưa xuất được" (ADR 0006). Xuất PDF không chạy AI và không tốn phí nhà cung cấp.
4. Ảnh bìa: nhúng dạng JPEG (`cover-image-codec.ts`, `market-cover.ts`), bắt buộc có chú thích mô tả; bìa ngoài hoặc sai định dạng bị quy tắc 10 từ chối.
5. Biểu đồ: `src/modules/analysis/reader-report/flint.ts`, `market-charts.ts`, `macro-charts.ts`, `svg-charts.ts`; phiên bản bộ dựng ghi trong `builder_version`. Báo cáo Market dùng các hằng số trong `reader-report-revisions.ts`: `reader-report-market-v3` (mặc định), `reader-report-market-v4` (bộ dựng kế tiếp) và `reader-report-market-v5` (khi có nguồn đánh giá công khai Shopee). Ý nghĩa chi tiết của v4 cần xác nhận.
6. Tải xuống: giao diện dùng `reportUrl(workspaceId, runId, 'market', 'web'|'pdf')`; mỗi liên kết tương ứng đúng một phiên bản đã lưu.

Tài liệu PDF do người dùng đính kèm là một việc khác: `source-pdfs` và `pageindex` (lập chỉ mục), có tạm dừng khi hết số dư.

## Phần 8. Kiểm thử và CI

Lệnh trong `package.json`: `npm run check` chạy tuần tự sinh hợp đồng (`contracts:generate`), `typecheck`, `frontend:typecheck`, `frontend:build`, `frontend:test`, rồi `test` (đơn vị và tích hợp: `tests/unit/*.test.ts`, `tests/integration/*.test.ts`). Node phải đúng phiên bản trong `engines` (24.15.0).

CI nằm ở `.github/workflows/check.yml`: chạy trên PR và khi đẩy vào `main`; Node 24.15.0; `npm ci`; giới hạn 45 phút; có chế độ "research" rút gọn cho PR nháp vào nhánh `feature/research-*` chỉ khi mọi tệp đổi thuộc danh sách cho phép, còn lại chạy "full"; chế độ full cài bộ xác minh PDF cục bộ phiên bản cố định (Python). Các workflow khác: `local-owner-test-web.yml`, `research-generation-web.yml`, `research-report-preview.yml`.

Quy ước dự án:

- Tác giả mã: một phiên mã hóa riêng; người viết kiểm thử (có kiểm chứng đối chứng âm) và người rà soát là các phiên mới tách biệt.
- Chỉ viết kiểm thử theo dòng hợp đồng có tên; không chạy toàn bộ bộ kiểm thử cục bộ, CI là cổng quyết định.
- Quy tắc 3 lần: một việc trượt kiểm thử 3 lần thì dừng và xem lại phương pháp.
- Máy Windows có giới hạn dòng lệnh dài và công cụ typecheck; Linux CI là bên quyết định.
- Mỗi PR một gói; chỉ gộp khi người rà soát đạt đúng head và CI xanh.

## Phần 9. Triển khai (deploy)

- Chỉ triển khai khi chủ sở hữu viết đúng câu «deploy <SHA>». Gộp vào `main` không đồng nghĩa với triển khai.
- Triển khai ứng dụng gồm: lấy đúng SHA, chạy migration tiếp theo còn thiếu (kiểm DB đạt phiên bản đầu `0059` ở thời điểm tài liệu này; ứng dụng từ chối khởi động nếu phiên bản DB lệch — xem phần kiểm DB trong `src/api/operator-app.ts`), dựng giao diện, khởi động lại dịch vụ.
- Cờ cấu hình được mang theo từ lần triển khai trước; các thay đổi cờ (ví dụ bật mô hình độ liên quan, bật nguồn đánh giá công khai Shopee với trần 300) là một phần của câu lệnh triển khai và cần chủ sở hữu đồng ý.
- Runbook: `docs/runbooks/fedora-local-operator-runtime.md` (vận hành trên máy chủ), `docs/runbooks/metric-opencli.md` (thu thập Metric), `docs/runbooks/agent-pipeline.md`.
- Ngay sau triển khai: chạy canary ít nhất 3 sản phẩm và chấm bản v2 tự động theo 14 quy tắc.
- Trạng thái hiện tại (cần xác nhận lúc đọc): bản đang chạy thật là `f026acd9`; `main` là `e9e0f444` và các PR #348 (G-references) và gói F+ chưa vào bản chạy thật.

## Phần 10. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| Ứng dụng không khởi động, báo cờ phải đúng `true`/`false` | Giá trị cờ boolean sai | Sửa giá trị về đúng định dạng |
| Ứng dụng từ chối vì phiên bản DB | Migration chưa chạy hoặc lệch | Chạy `npm run db:migrate` trên môi trường đúng, kiểm tra phiên bản đầu |
| Phiên dừng `METRIC_LOGIN_REQUIRED` / `METRIC_CAPTCHA` | Trình duyệt tự động bị yêu cầu đăng nhập hoặc xác minh | Người vận hành xử lý trên máy chạy trình duyệt, rồi chủ sở hữu bấm "Thử lại" |
| `METRIC_UI_CHANGED` / `METRIC_FILTER_MISMATCH` | Giao diện nguồn đổi hoặc bộ lọc không áp dụng | Xem `docs/runbooks/metric-opencli.md`, cập nhật adapter, khớp mã băm manifest |
| `MANIFEST_HASH_MISMATCH` | Manifest adapter khác mã băm khai báo | Cập nhật `TDN_METRIC_OPENCLI_ADAPTER_SHA256` cho đúng tệp |
| `MARKET_14_RULES_FAILED:<id>` | Bản dựng vi phạm quy tắc | Xem quy tắc tương ứng ở Phần 6; sửa trong mã mẫu hoặc bộ dựng, không sửa tay |
| `MARKET_BUSINESS_GATE_FAILED:<mã>` | Vi phạm cổng kinh doanh | Như trên; tra mã trong `market-business-gate.ts` |
| Kalodata ngừng vì hết điểm | Hết số dư | Chủ sở hữu nạp thêm; dùng chế độ phát lại để kiểm thử không tốn điểm |
| Nhiều bước chậm / treo CI | Khoảng 1/3 lần CI treo (đã giảm một phần) | Chạy lại job; ghi nhận nếu lặp lại |
| PDF không xuất | Thiếu `TDN_RESEARCH_PDF_CHROMIUM` hoặc Chromium lỗi | Kiểm tra cấu hình; xem lý do trong thẻ báo cáo |
| Ổ tạm của máy chủ đầy | Nhiều làn kiểm thử | Lưu trữ bớt các làn đã xong |
| Phiên `INTERRUPTED` | Tiến trình khởi động lại khi nguồn đang chạy | Không tự thử lại yêu cầu trả phí; xem mục "Việc cần làm" và tạo phiên mới nếu cần |

Bảo mật: không ghi giá trị khóa hoặc token vào tài liệu, nhật ký hay báo cáo; token chủ sở hữu chỉ nằm ở biến môi trường và ở ô mở khóa của giao diện.
