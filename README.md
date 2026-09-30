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

## Offline normalized Metric calculation (research A1)

`npm run research:metric:calculate -- <normalized-input.json> <outside-git-bundle-directory>` calculates versioned exact-integer metrics and a Vietnamese draft without AI or database access. Existing identical bundles are verified and reused; changed or corrupt content is never overwritten. This validates normalized input only, not original XLSX cells or business conclusions. See [A1 scope and method](docs/tasks/research-a1-deterministic-metric.md).

## Offline Metric source profile (research A2)

`npm run research:metric:normalize -- <export.xlsx> <manifest.json> <labels.json|-> <outside-git-bundle-directory>`.

`npm run research:metric:prepare -- <database.sqlite> <artifact-root> <request.json>` verifies an exact finalized source package and ACTIVE discovery workspace, normalizes the selected Metric workbook/manifest/optional labels, and freezes the canonical input plus its queryable SQLite projection before calculation. It performs no market calculation, report generation, AI or provider call.

`npm run research:metric:readiness -- <database.sqlite> <artifact-root> <preparation-sha256> <catalog.json> <catalog-sha256> <outside-output.json>` replays that exact preparation and classifies every catalog input and section as ready, blocked or invalid before calculation. It writes one deterministic JSON result outside Git and performs no calculation, AI or provider call.
Only the exact `metric-shopee-product-list-sheet1-v1` profile is supported. An explicit period/acquisition manifest is mandatory; no source dates, identities or labels are guessed. Python 3 standard library is required. See [A2 boundary and mapping](docs/tasks/research-a2-source-profile.md). No real-source acceptance or complete report automation is implied.

## Offline versioned report packet (research A3a)

`npm run research:report:packet -- <result.json> <exact-result-byte-sha256> <catalog.json> <exact-catalog-byte-sha256> <outside-git-bundle-directory>`.

Use an exact A1/A2 `result.json` and the explicitly selected [planning catalog](docs/research/report-section-catalog-v1.json). The packet recomputes/compares the normalized result, binds its exact bytes and catalog, and creates a deterministic Vietnamese DRAFT with partial observed metrics and explicit section blockers. It does not authenticate raw sources, generate Insight, grant approval, or connect to the live workspace/database. The same bundle is verified/reused; conflicting content is never overwritten. See [A3a scope](docs/tasks/research-a3-versioned-report-packet.md).

## Source-backed research report export (A4, under review)

`npm run research:report:export -- <database.sqlite> <artifact-root> <request.json> <catalog.json> <outside-git-bundle-directory>`

The request selects an existing discovery workspace, an existing source package
by ID and exact manifest digest, and exact workbook/manifest/optional-label
logical paths. See [the request schema](contracts/analysis/source-backed-report-request.schema.json).
The CLI opens SQLite read-only/query-only without migration, replays the verified
workspace and retained package bytes, and reparses the supported Metric workbook.
It exports a deterministic internal HTML report with charts, numeric/source
drill-down, readiness for all catalog sections and the selected original files.
Every file is bound by an export manifest. Exact retries reuse identical output;
changed or partial bundles are rejected, never overwritten.

The export also emits `semantic-content.json`, a deterministic identity for the
exact source/calculation/section content, and a separate `review-state.json` that
remains `UNREVIEWED`. HTML/PDF rendering does not create a new semantic version;
changing evidence or calculations does. This identity is not yet persisted in a
report-run database registry.

This export contains private source data. Keep it outside Git; do not publish it
externally. Mapping validation is not provider authentication. It creates no AI
interpretation, approval, report-run DB record or official report. SQLite run
persistence and operator-dashboard integration remain unfinished parts of the
larger automation objective. See [A4 scope and pending integration](docs/tasks/research-a4-evidence-workspace.md).

Research A8 adds an offline evidence-bound interpretation contract for the same
report. Untrusted model-shaped output may select only existing deterministic
claim IDs from eligible sections; application code resolves the exact values,
pointers and limitations. The artifact stores a concise user-visible evidence
logic summary, not hidden chain-of-thought, and remains unapproved. A8 does not
call a provider or persist a report run. See [A8 scope](docs/tasks/research-a8-evidence-bound-interpretation.md)
and [ADR 0005](docs/adr/0005-report-evidence-and-decision-ledger.md).

Research A13 adds durable SQLite history for those validated interpretation
artifacts. Each run names one exact report ID/version, retains exact prompt
bytes and generation metadata, and replays citations against the same verified
evidence without calling AI again. Multiple runs remain separate and
unapproved; no interpretation becomes source evidence or a human decision. See
[A13 scope](docs/tasks/research-a13-interpretation-ledger.md).

Research A14 exposes those saved overlays through the read-only report API:
`GET /api/reports/:reportId/versions/:version/interpretations` and
`GET /api/reports/:reportId/versions/:version/interpretations/:interpretationId`.
Both routes require an explicit report version and replay the exact A13 artifact
before returning safe user-visible conclusions, evidence logic, application-
resolved citations, assumptions and limitations. They do not return prompt
material, provider request data, usage telemetry or artifact paths, and they
create no approval or human decision. See
[A14 scope](docs/tasks/research-a14-interpretation-read-api.md).

Research A18 adds `GET /api/report-review-targets/:reviewTargetId` for one
explicit lowercase A17 target digest. It returns the canonical, replay-verified
A16 target; no list/latest route or human-decision action is included. See
[A18 scope](docs/tasks/research-a18-review-target-read-api.md).

Research A19 adds authenticated local `POST /owner-api/report-review-targets`
for retaining a target from one exact report version, interpretation and
intended use. It prepares an immutable review packet only; it does not record a
reviewer or decision. See
[A19 scope](docs/tasks/research-a19-review-target-owner-api.md).

Research A20 adds the local preparation and exact-digest inspection UI. The
operator confirms one explicit report version, interpretation and intended use;
the resulting page separates four evidence/decision layers and remains visibly
unapproved. See [A20 scope](docs/tasks/research-a20-review-target-ui.md).

Research A21 adds
`GET /api/reports/:reportId/versions/:version/sections` and a matching operator
matrix for one explicitly selected report version. It replays the exact packet
and shows catalog prerequisites, current delivery states, blockers, claim IDs,
evidence pointers and content identities for every section. It does not execute
missing methods or create interpretations and decisions. See
[A21 scope](docs/tasks/research-a21-section-readiness-ui.md).

Research A9 deepens the same deterministic report without adding a section
method. It renders M03 filter-membership sensitivity and M04 group composition
and top-shop-removal sensitivity directly from the verified A1 Result. Every
diagnostic links to exact pointers and row membership; the UI states that these
are not growth, additive market segments, forecasts or recommendations. See
[A9 scope](docs/tasks/research-a9-diagnostic-charts.md).

## Offline source-package intake

Run `npm run source-package:intake -- <database> <artifact-root> <package-directory> <intake.json> <audit.json> <output.md>` to verify and persist an exact-byte source package and immutable field audit without provider calls. The package directory must exactly match descriptor membership; the report path must be outside this repository and must not already exist. See `docs/tasks/023-source-package-intake.md`.
The pre-report path now has an explicit first calculation gate:
`research:metric:prepare` → `research:metric:readiness` →
`research:metric:m03`. The M03 command emits one content-identified verified
metric set outside Git; later charts and AI narratives must consume that same
identity rather than recalculate values independently.

`research:metric:m03:charts` verifies that metric-set identity and emits three
fixed M03 chart-data specs without reopening sources, recalculating or calling
AI. Rendering is intentionally separate.

`research:metric:m03:evidence` binds the exact metric and chart identities into
a citation-only fact envelope for a later narrative. It makes no AI call and
contains no free-form business conclusion.
