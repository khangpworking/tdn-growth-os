# Research batch 2: work packages and checklists

Updated: 2026-10-08 · Base: `origin/main` `d9bd883` · Plans: #124, #125, #127 · P10: Ultimate Method v1.5, E12
Process: `docs/runbooks/agent-pipeline.md`. Workers check every item below and report each ID in their handoff.

## Tóm tắt (cho chủ shop)

Phần việc còn lại của 3 kế hoạch được gom thành **10 gói**, chạy theo 3 đợt:
- **Đợt 1 (4 gói):** chạy song song ngay. Mỗi gói sửa một nhóm file riêng, nên các gói không đụng nhau.
- **Đợt 2 (5 gói):** bắt đầu khi điều kiện của từng gói đã xong. Gói P10 (số liệu Cục Thống kê) và P9 (đọc video, bình luận TikTok) thêm ngày 08/10/2026.
- **Đợt 3 (1 gói):** đưa tất cả nguồn mới lên báo cáo, làm sau khi các gói trước đã merge.

Agent làm theo checklist bên dưới: mỗi việc có mã riêng (ví dụ `P1-04`), và agent phải báo lại từng mã. Sau đó có model khác review, rồi chạy test. Đạt hết thì agent tự mở PR nháp. Merge và deploy vẫn chỉ do chủ shop quyết.

## Packages at a glance

| ID | Package | Plan | Wave | Gate | Exclusive ownership |
|---|---|---|---|---|---|
| P1 | Citations and clean visible text in the auto draft | #125 Ph1 + owner decision 2026-10-07 | 1 | none | research-automation report renderers |
| P2 | Reader report: Metric web facts, exhibits, lint, reconciliation, citations | #127 Ph2b 3–7 + #125 Ph1 (reader) | 1 | none | `reader-report/*`, `reader-report-input` contract |
| P3 | PageIndex: auto-upload, binding, balance, card, run-page states, verified quotes | #125 Ph2 | 1 | none (fakes only; live after deploy) | `migrations/`, PageIndex modules, source-status contract |
| P4 | Kalodata video and creator intake | #124 Ph2 | 1 | none (transcription stays off) | new intake module and its API route |
| P5 | Google Trends and expanded search inside runs | #124 Ph1b | 2 | Phase 0 spike says GO | SerpApi provider, collection step |
| P6 | Metric automation through OpenCLI, capture archive, R2 copy, numbers-used ledger | #127 PR A + Ph2b 8 | 2 | owner installed the OpenCLI extension on Fedora | Metric executor, intake sharing, archive |
| P7 | Social bundle intake, classification, evidence cards, personas | #124 Ph3 | 2 | server side: none; collection side: owner picks the social account | new social modules |
| P8 | Presentation of all new sources in both reports | #124 Ph4 + #125 Ph2 quotes in reports | 3 | P1–P5 and P7 merged | report renderers (after P1 and P2) |
| P9 | Video content reading and TikTok comments for every product category | Ultimate Method §6.2, E5, E11; source registry S07, S14 | 2 | P4 merged (done 08/10/2026); live collection needs an owner-approved charge cap | new TikTok comment collector and intake, video-reading intake, their contracts and API routes |
| P10 | Official statistics intake (Cục Thống kê, nso.gov.vn) for every product category | Ultimate Method v1.5, E12 and §6.4 | 2 | none; start after P4 has merged (contract registry line) | new official-statistics intake module, its contract, its API route and its fetch script |

**Ownership rule.**
- A package edits only its own paths.
- Shared files are edited by the named package only:
  - `src/modules/analysis/research-automation/service.ts`: P3 (ingest hook) and P5 (collection step). Each may touch only the named functions, and must merge `main` before pushing.
  - `migrations/`: P3 in wave 1. P6 and P7 in wave 2 take the next free numbers **after** P3 has merged.
  - `scripts/generate-foundation-contract.mjs` (contract registry): P4 in wave 1 (one line). Later packages add their line after merging `main`.
- Never edit `package.json` or the lockfile without an owner decision.

## Global definition of done (every package)

- [ ] G-01 Every checklist ID of the package is reported in the handoff as DONE (with evidence), ESCALATED (with the reason) or N/A (with the reason).
- [ ] G-02 `npm run typecheck` passes. `npm test` shows only the known baseline failures: 3 `Task045` smoke tests that need `frontend/dist`, plus "Cloud CLI persists private unreviewed results…" on Fedora.
- [ ] G-03 If `frontend/` changed: `npm run frontend:typecheck` and `npm run frontend:test` pass.
- [ ] G-04 If `contracts/` changed: `npm run contracts:generate && git diff --exit-code contracts/` is clean.
- [ ] G-05 `git diff --check origin/main...HEAD` is clean. Every changed path is inside the package's owned paths.
- [ ] G-06 No secrets, tokens, cookies, machine paths, home directories, IPs or real commercial data in the code, tests, fixtures, commits or handoff.
- [ ] G-07 No real provider or AI call in tests. Fakes and synthetic fixtures only.
- [ ] G-08 Owner-facing text: plain Vietnamese, no provider names (Metric, Kalodata, TradeInt, Dami, SerpApi, Apify, PageIndex, Agent-Reach, OpenCLI, zen-studio), no raw codes. "Shopee", "TikTok Shop", "Google", "Facebook", "Instagram" and "X" are allowed. "Cục Thống kê (nso.gov.vn)" is required as the citation of official statistics (Ultimate E12). The internal source-status board may name providers.
- [ ] G-09 Missing stays missing (never 0). No invented sources, competitors or numbers.
- [ ] G-10 Stored report versions read back byte-identical. Old inputs and old runs keep working.
- [ ] G-11 No existing test is deleted, skipped or weakened. An assertion that pins copy the package was told to change may be updated; list each one in the handoff.
- [ ] G-12 A handoff `docs/handoffs/<package-id>.md` uses the `templates/handoff.md` fields plus the "Checklist evidence" table (runbook §4).

---

## P1. Citations and clean visible text in the auto draft (wave 1)

**Owned paths:**
- `src/modules/analysis/research-automation/reports.ts`;
- the section renderers it imports (`descriptive-report.ts`, `metric-method-report.ts`, `market-inventory-report.ts`, `review-corpus-report.ts`, `synthesis-evidence-report.ts`, and any other `*-report.ts` / `*-pages.ts` it imports);
- `citation-registry.ts` / `citation-register-html.ts`, additive only;
- `service.ts`, only a validator for the stored semantic report, if one exists;
- new tests;
- `docs/handoffs/P1.md`.

**Anchors (d9bd883):**
- `reports.ts`:
  - `observationTable` L314 prints the provider and the capture sha;
  - `sourceTable` ~L540;
  - `appendix` / `baseAppendix` ~L565;
  - `body` ~L618.
- `metric-method-report.ts` L26 prints "Metric" and "Kalodata" in visible copy.
- `market-inventory-report.ts` L5 prints `sourceSha256`.
- `review-corpus-report.ts` L13 prints `pageSha256`.
- `synthesis-evidence-report.ts` L84 shows the claims.

Checklist:
- [ ] P1-01 One `CitationRegistry` per `buildResearchAutomationReport` call. Numbers follow the first appearance on the page.
- [ ] P1-02 Capture rows (`observationTable`, `sourceTable`) cite `CAPTURE` with identity = the capture sha, a neutral Vietnamese label, and the provider and operation in `technical` only.
- [ ] P1-03 Metric method rows cite `METRIC_ROW`, with an `xlsx` sheet/cell locator when it is known.
- [ ] P1-04 Market inventory rows cite `CAPTURE` with identity `sourceSha256`. A pointer containing a digest becomes a neutral `source-locator`, with the raw pointer in `technical`.
- [ ] P1-05 Review rows cite `REVIEW` ("Đánh giá khách hàng trên Shopee").
- [ ] P1-06 Web results cite `WEB_RESULT` with the canonical https URL.
- [ ] P1-07 M11, M12, I14 and decision packets cite only the upstream claim IDs they consumed (`UPSTREAM_CLAIM`).
- [ ] P1-08 A value without lineage has no number and shows "Chưa có nguồn".
- [ ] P1-09 The "Nguồn tham khảo" register appears once at the end of both reports, and the marks match it exactly. The PDF variant prints the URLs as text: check how the PDF is produced and record the choice.
- [ ] P1-10 The semantic object gets `citations` (the technical trace) and `citationEntries`. `rendererVersion` becomes `automation-report-kit-v12`.
- [ ] P1-11 Test helper `reportVisibleText(html)`: drops `<style>`, `<script>` and `<details>…</details>`, then strips tags.
- [ ] P1-12 The visible text has no provider name, no hex run of 32+ characters, and no code matching `/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/`.
- [ ] P1-13 The whole HTML, `<details>` included, has no provider name. Technical digests and codes may stay inside the "Hồ sơ đối chiếu" `<details>` blocks.
- [ ] P1-14 Tests:
  - the same source reuses its number;
  - first-appearance order;
  - no lineage gives no number;
  - the register has no gaps;
  - two renders give byte-identical HTML.
- [ ] P1-15 Integration tests over the existing fixture builders (`research-automation-exact-reviews`, `-bounded-methods`, `-case-contract`): market with Metric methods, insight with reviews, web results, decision packets. All pass P1-12 and P1-13.

**Functional when:** a fixture run produces Market and Insight drafts with `[n]` marks, a matching register, and visible text that passes P1-12 and P1-13.

---

## P2. Reader report: Metric web facts, exhibits, lint, reconciliation, citations (wave 1)

**Owned paths:**
- `src/modules/analysis/reader-report/*`;
- `contracts/analysis/reader-report-input.schema.json` and its generated file;
- `src/modules/analysis/research-automation/reader-report-revisions.ts`;
- new `src/modules/analysis/reader-report/web-facts.ts`;
- new tests and fixtures;
- `docs/handoffs/P2.md`.

**Anchors:**
- `build.ts`:
  - `verifyReaderReportInput` L47;
  - `computeReaderReportData` L81;
  - `B.set` L98–116.
- `reader-report-revisions.ts` L105: the period check.
- Merged in #137:
  - `metric-web-snapshot.ts` (`validateMetricWebSnapshot`, `checkSnapshotScope`, `METRIC_WEB_TABLE_COLUMNS`, provisional);
  - `metric-web-facts.ts` (`normaliseMetricWebSnapshot`).
- Citations: `citation-registry.ts` (#134).

Checklist (input and auto-fill):
- [ ] P2-01 The contract accepts `contractVersion` `1.0.0` or `1.1.0`. `webSnapshot` (opaque object) and `webSnapshotSha256` are allowed only in 1.1.0. `source` becomes optional in 1.1.0 when `webSnapshot` is present.
- [ ] P2-02 `verifyReaderReportInput` runs `validateMetricWebSnapshot`, and checks that sha256(`canonicalJson(webSnapshot)`) equals `webSnapshotSha256`.
- [ ] P2-03 `deriveReaderSource(facts, rowCap)` builds the period from the scope, the 4 headlines from the W2 current values, and `platformBreakdown` from W3. A `null` value raises `READER_SOURCE_UNDERIVABLE` naming the field, never 0.
- [ ] P2-04 A request `source` that differs from the derived source → `READER_SOURCE_MISMATCH`. The period check in `reader-report-revisions.ts` uses the derived period.
- [ ] P2-05 1.0.0 inputs without a snapshot compute and render byte-identically to before.

Checklist (bundle keys and exhibits, #127 Phase 2b step 4–5):
- [ ] P2-06 Bundle keys:
  - `web.kpi.{rev,units,listings,shops}` and `web.kpi.*.chg`;
  - `web.<P>.rev`, `web.<P>.share`;
  - `web.<P>.m.<yyyy-mm>`;
  - `web.<P>.peak`, `web.<P>.low`, `web.<P>.last3vsPrev3`, with the method stated in M02;
  - `web.top10.brand`, `web.top10.shop`;
  - `web.shopType.mall`, `web.loc.<n>`, `web.cat.<n>.*`, `web.price.<n>.*`, `web.top.{product,shop,brand}.<n>.*`.

  All go through the `{{key}}` number gate. Platforms are never summed.
- [ ] P2-07 M01: a key line with full-result revenue and its change. "chưa có số theo tháng" is replaced only when W4 is present.
- [ ] P2-08 M02: the scope table from W1, and a coverage line (sample rows against listings found, sample revenue against full-result revenue per platform). This is the only allowed cross-family ratio.
- [ ] P2-09 M03: a KPI table (W2/W3) and a monthly revenue chart per platform (Flint, one line per platform, no summed line unless the page shows a total), plus a peak/low and last-3-vs-prior-3 note.
- [ ] P2-10 M04: tables for category (W5), shop type (W10) and location (W11), beside the in-sample segments.
- [ ] P2-11 M06: the W8 top-10 shop share beside the in-sample concentration.
- [ ] P2-12 M07: the W7 brand share, W9 brand × shop type, and W12–W14 leader tables with rank change and growth.
- [ ] P2-13 M08: the W6 page price levels as a separate table, never merged with `MARKET_PRICE_BANDS`.
- [ ] P2-14 M09: seasonality and momentum rows from W4. Rows that need per-entity history stay "Thấp" unless W16 is present.
- [ ] P2-15 M10: trend and seasonality only, **no forecast numbers**.
- [ ] P2-16 Each exhibit appears only when its group is present. Otherwise the current gap sentence stays unchanged.

Checklist (labelling, lint, reconciliation, #127 step 6–7):
- [ ] P2-17 Every web fact carries the family label "toàn kết quả tìm kiếm". In-sample numbers carry "trong mẫu N sản phẩm". `display_rounded` values add "số làm tròn như trên trang".
- [ ] P2-18 `lint.ts` rejects:
  - a web number without its family label;
  - a sum or difference across the two families (except the M02 coverage ratio);
  - a summed platform total the page did not show;
  - "thị phần" wording;
  - a forecast number in M10;
  - a provider name inside a captured label.
- [ ] P2-19 Reconciliation R1–R4 (#127 step 7) are warnings `METRIC_WEB_XLSX_MISMATCH` carrying the numbers. Each one fires on a crafted breach and stays quiet on consistent data.

Checklist (citations in the reader report, #125 Ph1):
- [ ] P2-20 The reader report uses the same `CitationRegistry` rules as the auto draft: `[n]` on every number, table row and chart from lineage, and on every web result and quote.
- [ ] P2-21 Flint chart captions carry `[n]`. The "Nguồn tham khảo" register appears at the end, and the PDF prints links as text.
- [ ] P2-22 For the same facts, the reader report and the auto draft give the same labels. Numbers are per report and deterministic.

**Functional when:** a 1.1.0 fixture input with `tests/fixtures/metric-web-snapshot/full.json` renders a reader report with:
- the web exhibits;
- the monthly chart per platform;
- the citations and register;
- the lint passing;
- R1–R4 reported.

A 1.0.0 input renders byte-identically.

---

## P3. PageIndex: auto-upload, binding, balance, card, run-page states, verified quotes (wave 1)

**Owned paths:**
- `src/modules/analysis/pageindex-cloud.ts` (additive);
- new `pageindex-documents.ts`, `pageindex-balance.ts`, `pageindex-questions.ts`;
- one migration `migrations/0049_*.sql`;
- `contracts/api/research-automation-source-status-api.schema.json` and its generated file;
- `src/modules/analysis/research-automation/source-status.ts`;
- `frontend/src/research-automation/SourceStatusBoard.tsx` and the run-page notice component;
- `service.ts`: only the shared source-ingest hook for PDFs and the run step that waits for indexing;
- new tests;
- `docs/handoffs/P3.md`.

**Anchors:**
- `pageindex-cloud.ts`:
  - `#request` L61 (non-2xx → `PAGEINDEX_HTTP_<status>`; the body is dropped);
  - `query` L92 (`GET /doc/<id>/metadata`, `POST /chat/completions`).
- Tests: `tests/integration/pageindex-cloud-cli.test.ts`, which uses a fake fetch.
- Source status: `source-status.ts` L19–38. The contract enum is at L11.

Checklist (core):
- [ ] P3-01 Client additions: `uploadDocument`, `documentStatus`, `listDocuments`. The upload and list paths are named constants marked UNVERIFIED in the handoff. There is no delete method anywhere.
- [ ] P3-02 On a 403, a bounded read of the error body maps `USAGE_LIMIT_REACHED` → `PAGEINDEX_USAGE_LIMIT_REACHED`. Every other error keeps today's codes. No retries.
- [ ] P3-03 Migration `analysis_pageindex_documents`:
  - columns: `source_sha256` PK, `cloud_doc_id`, `cloud_file_name`, `page_count`, `uploaded_at`, `status`, `failure_code`, `updated_at`;
  - deletes are blocked;
  - a usage-limit flag row.
- [ ] P3-04 `ensureIndexed`:
  - kill switch (`TDN_PAGEINDEX_CLOUD_ENABLED`);
  - the same sha is never uploaded twice, across runs too;
  - `LOW_BALANCE` and `USAGE_LIMIT_REACHED` make zero upload calls;
  - bounded indexing wait;
  - checks for `%PDF-` and 1–1000 pages;
  - never throws to the run.
- [ ] P3-05 `estimateBalance` (pure, micro-dollars):
  - starting credit − $0.01 per indexed page − $0.001 per active page per month (prorated, first 1000 free);
  - WARNING at ≤ max(20%, $2), BLOCKED at ≤ $0.50;
  - all rates and thresholds configurable.

Checklist (wiring and UI):
- [ ] P3-06 The shared source-ingest layer calls `ensureIndexed` for **every** PDF a run uses: attached sources, uploaded inputs, PDFs fetched during research. Implement it once.
- [ ] P3-07 The run page lists each PDF with its state: "Đang lập chỉ mục" / "Sẵn sàng" / "Lỗi — báo cáo không có trích dẫn từ tài liệu này" / "Bỏ qua vì số dư thấp".
- [ ] P3-08 Source status gets `PAGEINDEX`. The card shows:
  - connected state, key installed, last call, documents sent;
  - "Số dư (ước tính)" with the check time and a Billing link;
  - active pages and the estimated monthly cost;
  - the automatic state ("Đang tự dùng cho PDF" / "Tạm dừng vì số dư thấp" / "Đã tắt");
  - "Kiểm tra lại", which runs only the free list call.
- [ ] P3-09 The warning banner shows on both the card and the run page. The blocked state reads "Đã tạm dừng gửi PDF mới" / "PageIndex báo đã hết số dư".

Checklist (questions and verification; no report rendering here, that is P8):
- [ ] P3-10 One fixed question per eligible section from `section-methods-v1`. Caps: ≤1 per section per PDF, ≤N per run (default 10, configurable). No retry.
- [ ] P3-11 Every `{page, quote}` candidate goes through the local `pypdf` verifier. A quote not on that page, or a page outside the page count, is dropped and logged.
- [ ] P3-12 Verified quotes are stored as run artifacts with `EXTERNAL_VERIFIER_ATTESTED`, ready for `CitationRegistry` (`PDF_PAGE`, locator `pdf` page). The PageIndex answer text is never stored as report content.
- [ ] P3-13 Tests cover every #125 Phase 2 test bullet, with fake fetch and fake verifier.

**Functional when:** with fakes, a fixture run with one attached PDF:
- uploads once and reaches `READY`;
- stores verified quotes;
- shows the PDF state on the run page and the PageIndex card with an estimated balance.

A second run with the same PDF uploads nothing.

---

## P4. Kalodata video and creator intake (wave 1)

**Owned paths:**
- new `src/modules/analysis/research-automation/kalodata-video-intake.ts`;
- a new contract `contracts/analysis/kalodata-video-intake-v1.schema.json` with its generated file and one registry line;
- the upload route in `src/api/research-automation-api.ts` (only the new route);
- new tests and fixtures;
- `docs/handoffs/P4.md`.

No migration: reuse the existing source-package storage, the same way as the supplemental intake (`supplemental-source-intake.ts`).

Checklist:
- [ ] P4-01 The intake accepts the operator-exported CSV or XLSX for videos and creators. It is modelled on `metric-source-intake.ts`: validation, size caps, inert preparation, no automatic confirm.
- [ ] P4-02 Video fields: video, creator, revenue, views, units, ad spend, publish date, product link. Creator fields: creator, followers, revenue, video count. Headers are mapped exactly. Unknown or missing required headers are rejected with a typed error.
- [ ] P4-03 Derived values: units per 1,000 views and ad share. A missing value stays "không có dữ liệu", never 0. Never divide by zero.
- [ ] P4-04 Rows keep row-level lineage (`xlsx` sheet/row or CSV row) for later citations.
- [ ] P4-05 Transcription is **off** and has no code path in this package.
- [ ] P4-06 Tests:
  - a synthetic CSV with missing cells;
  - an XLSX;
  - a wrong header;
  - an oversize file;
  - the derived metrics;
  - no provider name in any owner-facing message.

**Functional when:** uploading a synthetic export to a fixture run stores a validated, cited video and creator table that later report blocks (P8) can read.

---

## P5. Google Trends and expanded search inside runs (wave 2; gate: spike GO)

**Owned paths:**
- `provider-serpapi.ts`, `providers.ts` (a new operation `serpapi.google_trends`);
- `search-trends.ts` and `expanded-search-queries.ts` (merged in #136), including fixes from the spike note;
- `service.ts`: only the collection step;
- new tests;
- `docs/handoffs/P5.md`.

Checklist:
- [ ] P5-01 Apply the parser fixes from the Phase 0 spike note, e.g. the `search_parameters.q` requirement.
- [ ] P5-02 The collection step runs the Trends plan (≤4 calls) and the expanded queries (≤10 calls) through `SearchCallBudget`, using only confirmed products and brands.
- [ ] P5-03 Results are cached by `(engine, q, params, date)`, so a re-render costs nothing.
- [ ] P5-04 Results are stored as evidence records with `retrieved_at` and the source URL, on the same side path as the existing web results. The frozen collection packet is unchanged.
- [ ] P5-05 Usage rows record each paid call. No retries. No call without a key.
- [ ] P5-06 Tests with a fake transport: the caps, the cache hit, no key → no call, and old runs unchanged.

**Functional when:** a fixture run with confirmed keywords stores Trends facts and expanded-search results with lineage, within the caps.

---

## P6. Metric automation through OpenCLI, archive, R2 copy, ledger (wave 2; gate: extension installed)

Runs on Fedora only, because it needs the owner's Chrome. Follow #127 Phase 0–2 and step 8. A live Metric search or export needs the owner's yes for each run.

Checklist:
- [ ] P6-01 Phase 0 setup:
  - pinned OpenCLI, with the version and integrity recorded;
  - extension permissions recorded;
  - `opencli doctor`;
  - the daemon listens on localhost only (`ss -ltnp`).
- [ ] P6-02 Recon, read-only:
  - map the form controls;
  - map W1–W16 to the data responses;
  - **confirm the provisional columns** W5, W6, W9, W11, W12 and W16, and update `METRIC_WEB_TABLE_COLUMNS`;
  - record the quota cost per search.
- [ ] P6-03 Adapter commands `whoami`, `search`, `capture`, with fail-closed codes:
  - `METRIC_LOGIN_REQUIRED`, `METRIC_CAPTCHA`, `METRIC_UI_CHANGED`, `METRIC_FILTER_MISMATCH`, `METRIC_ROW_CAP`;
  - a domain allowlist;
  - it touches only tabs it opened itself.
- [ ] P6-04 The executor sits behind `TDN_METRIC_OPENCLI_ENABLED`: fixed argv, no shell, a timeout, manifest hash checks.
- [ ] P6-05 The xlsx goes through the **same** `prepareMetricSource()` function as the upload. The PDF goes through the supplemental attach path. The snapshot goes through a new intake with `checkSnapshotScope`.
- [ ] P6-06 Capture archive (immutable): xlsx, snapshot, PDF, section screenshots, raw responses (headers, cookies and tokens stripped), manifest.
- [ ] P6-07 R2 copy through `R2ResearchArchive` (#135):
  - a mirror-status table;
  - "Chưa sao lưu lên mạng" until the copy is done;
  - retry at the next start;
  - a restore script.
- [ ] P6-08 Numbers-used ledger:
  - `numbers-used.json` for every shown number;
  - an xlsx download "Tải bảng số liệu đã dùng";
  - `REPORT_NUMBER_UNLOGGED` and `REPORT_NUMBER_SOURCE_MISSING` block rendering.
- [ ] P6-09 The Metric source card gets the states `READY` / `LOGIN_REQUIRED` / `BRIDGE_DISCONNECTED` / `EXECUTOR_DISABLED`, with manual upload as the fallback.
- [ ] P6-10 Every #127 test bullet for the adapter, executor, archive, ledger and R2 copy. No live Metric in CI.

**Functional when:** after one owner-approved live capture, a reader report builds from it with no hand-typed `source`, and its numbers match the owner's manual reading.

---

## P7. Social bundle intake, classification, evidence cards, personas (wave 2)

Server side with synthetic bundles only. Collection with Agent-Reach waits for the owner's account decision.

Checklist:
- [ ] P7-01 `social-bundle-intake.ts` validates the bundle row schema and the manifest (#124 Phase 3).
- [ ] P7-02 It strips phones, emails and @handles from the text, and hashes author IDs.
- [ ] P7-03 Dedupe works on the id hash, then the normalised text sha, then a fuzzy match. Storage is append-only, tagged by watermark.
- [ ] P7-04 Commercial accounts are marked, not deleted, and excluded from insights.
- [ ] P7-05 Stop gateways: a ≥90% duplicate batch is aborted, a saturation flag, and the manifest caps are enforced again.
- [ ] P7-06 Taxonomy on a 300-post sample (one owner review), then classification of topic, journey stage, sentiment and confidence. Low-confidence posts go to "unclassified".
- [ ] P7-07 Every insight cites ≥2 verbatim quotes from different authors.
- [ ] P7-08 Evidence cards per "nhóm hoàn cảnh". 3–6 personas, each with ≥3 cards and ≥5 authors. Every attribute cites quotes; an unsourced attribute is dropped. No inferred demographics. The label "Chân dung do AI tổng hợp từ bài viết thật — không phải khách hàng có thật".
- [ ] P7-09 A κ check on 100 human labels: κ < 0.6 shows "độ tin cậy thấp".
- [ ] P7-10 Every #124 Phase 3 test bullet, with fake model calls.

**Functional when:** a synthetic bundle produces cards, personas and journey counts ("x/y bài trong mẫu") that pass every rule above.

Owner decision 2026-10-08: Facebook group posts are **not** collected (joining dozens of groups per category is not feasible). Collection covers public posts only, and Facebook is a secondary source (registry S08).

---

## P8. Presentation of all new sources (wave 3; after P1–P5 and P7)

Checklist:
- [ ] P8-01 Trends blocks (M05, M09, M10, I10): a line chart "mức quan tâm tìm kiếm (0–100)" and a related-queries table.
- [ ] P8-02 Expanded search blocks (I05, I07, I08, I12, I13).
- [ ] P8-03 Video blocks (I12, I13, M07, M09, M12): a video table and 1–2 seller-side lessons.
- [ ] P8-04 Social blocks:
  - journey cards (Biết đến / Cân nhắc / Mua / Sau mua), each with 2–3 quotes;
  - personas in I02 with their cards;
  - the κ notice.
- [ ] P8-05 PDF quotes from P3 shown with `[n]` ("Tài liệu …, trang N"). The PageIndex answer text is never used.
- [ ] P8-06 Every block follows "Thấy gì → Dùng để → Đừng hiểu là", with dates and links, cited through `CitationRegistry`.
- [ ] P8-07 A coverage notice when a source is missing, e.g. "Không có dữ liệu Instagram cho lần chạy này".
- [ ] P8-08 The M13/I17 appendix lists sources, caps, sample sizes, κ, and what was not collected.
- [ ] P8-09 Both renderers (auto draft and reader report) pass the P1-12/P1-13 visible-text rules and the P2 lint.
- [ ] P8-10 Once P10 has merged: official-statistics blocks in M05, M08, M09, I02 and I12 follow Ultimate E12. Each block names the statistics group and says it is wider than the product category, shows the value status (ước tính / sơ bộ / chính thức) and publication date, sits beside the sample numbers without arithmetic between them, and cites "Cục Thống kê (nso.gov.vn)" with file, sheet and row.

**Functional when:** a fixture run with every new source renders both reports with all blocks cited, and both lints pass.

---

## P9. Video content reading and TikTok comments (wave 2; after P4)

Business rules: Ultimate Method §6.2 (reading seller videos), E5 (seller-targeted persona), E11 (default rules, codebook cross-check), L1, L2, L7. Source registry: **S07** (TikTok comments) and **S14** (video content). Test evidence: `docs/research/ultimate-method/input-data-sources-test-log.md`, ST-20261008-17 to -19. Works for **every product category**.

**Owned paths:**
- new `src/platform/collectors/apify-tiktok-comments.ts` (modelled on `apify-shopee.ts`);
- new `src/modules/analysis/research-automation/tiktok-comment-intake.ts`;
- new `src/modules/analysis/research-automation/video-reading-intake.ts`;
- new contracts `contracts/analysis/tiktok-comment-collection-v1.schema.json` and `contracts/analysis/video-reading-v1.schema.json`, with their generated files and registry lines (after merging `main`);
- the new upload and collect routes in `src/api/research-automation-api.ts` (only the new routes);
- new tests and synthetic fixtures;
- `docs/handoffs/P9.md`.

No migration: reuse the source-package storage. Comments enter the same located-record review corpus as Shopee reviews (`review-corpus.ts`), with their own source family.

Checklist:
- [ ] P9-01 **Video selection** from a P4 video table, by a rule fixed before reading any comment:
  - option A: the top 20% of videos by revenue in the sample;
  - option C: the videos that together make 80% of revenue;
  - plus operator-added review-video URLs, marked `REVIEW_VIDEO` (người xem) instead of `SELLER_VIDEO`.

  A cap of 30 videos per run by default. The selection rule, the option used and the list are stored with the run.
- [ ] P9-02 **Comment collector** behind the existing provider configuration:
  - default actor `datadoping/tiktok-comment-reply-scraper`, fallback `clockworks/tiktok-comments-scraper`;
  - a run is refused without an owner-approved `maxTotalChargeUsd` cap;
  - ≤200 top-level comments per video by default; no replies;
  - fake transport in tests, never the network.
- [ ] P9-03 **Dedupe** on `(video_id, comment_id)`. Keep the raw returned pages privately for audit, and record how many duplicate rows were dropped. The ST-20261008-19 run had 9.8% duplicates.
- [ ] P9-04 **Personal data:**
  - hash author IDs with a private salt;
  - strip phone numbers, emails and @handles from the text;
  - never store author names or profile links.
- [ ] P9-05 **One located record per comment:**
  - text, creation time, like count;
  - locator = video URL + comment ID (the actors return no per-comment link);
  - default voice `VIEWER` ("lời người xem");
  - comments by the video owner or a brand account are marked `SELLER_OR_CREATOR`, not deleted;
  - an empty comment is excluded with a reason, never counted.
- [ ] P9-06 **Insight path:** records feed the existing coding path for I02, I04–I10 and I13 as source S07. No new coding method. The E11 codebook cross-check applies. Counts say "bình luận thu được", never "toàn bộ bình luận".
- [ ] P9-07 **Video-reading intake:** accepts an operator-produced JSON per video, made with the `/watch` tool on the operator machine (local engine, no cloud upload unless the owner approves). Fields:
  - video URL and kind;
  - duration;
  - transcript segments with start and end seconds, and caption source (native or speech-to-text);
  - on-screen text;
  - frame references with hashes.

  It is validated and stored as an S14 source package. It is read as seller voice (L7); a `REVIEW_VIDEO` reading is read as creator voice.
- [ ] P9-08 **No model calls in this package.** Coding the §6.2 fields (hook, format, CTA, positioning) is a later step under the E11 codebook cross-check.
- [ ] P9-09 **Citations** through `CitationRegistry`: "bình luận công khai dưới video TikTok, <link video>, mã bình luận <id>, ngày <date>" and "nội dung video, <link video>, giây <start>–<end>". No provider names in owner-facing text (G-08).
- [ ] P9-10 **Tests:**
  - the selection rule under options A and C;
  - a refused run without a cap;
  - dedupe with injected duplicates;
  - PII stripping;
  - empty comments;
  - the seller or creator mark;
  - a corpus round trip with citations;
  - video-reading validation (good file, missing segments, bad timestamps).

**Functional when:** a fixture run with a synthetic P4 video table selects videos, collects fake comments through the fake transport, dedupes them, and shows cited S07 records in the Insight corpus. A synthetic video-reading JSON is stored as a cited S14 package.

---

## P10. Official statistics intake: Cục Thống kê (wave 2; start after P4 has merged)

Business rules: Ultimate Method v1.5, exception **E12** and section **6.4** (`docs/research/ultimate-method/ultimate-method-30-sections.md`). The intake works for **every product category**; nothing in it is specific to one category.

**Owned paths:**
- new `src/modules/analysis/research-automation/official-statistics-intake.ts`;
- new `src/modules/analysis/research-automation/official-statistics-category-map.json` (Ultimate §6.4 as data, versioned);
- a new contract `contracts/analysis/official-statistics-intake-v1.schema.json` with its generated file and one registry line in `scripts/generate-foundation-contract.mjs` (after P4 has merged);
- the upload route in `src/api/research-automation-api.ts` (only the new route);
- new operator script `scripts/fetch-official-statistics.ts`;
- new tests and synthetic fixtures (workbooks built inside the tests; no real downloaded files in Git);
- `docs/handoffs/P10.md`.

No migration: reuse the existing source-package storage, the same way as the supplemental intake (`supplemental-source-intake.ts`). The yearbook and the living-standards survey are PDF and go through P3, not this package.

Checklist:
- [ ] P10-01 The intake accepts operator-supplied XLSX files of two kinds: the monthly statistical tables ("Biểu") and the monthly CPI workbook. It is modelled on `metric-source-intake.ts`: validation, a size cap (≤20 MB), inert preparation, no automatic confirm.
- [ ] P10-02 Fixed sheet profiles, one per table used:
  - monthly tables: retail sales (Tổng mức bán lẻ), CPI, industrial production index, main industrial products, exports, imports;
  - CPI workbook: whole country, regions, provinces.

  Each profile pins the sheet title text and a hash of the header rows. An unknown layout raises a typed error `OFFICIAL_STATS_LAYOUT_UNKNOWN` naming the sheet. No guessing of columns.
- [ ] P10-03 Each value becomes one row with:
  - file sha256, source URL, publication date;
  - sheet, row and column;
  - the label path (group → subgroup) exactly as written in the file;
  - period, unit, and comparison base (for example "cùng kỳ năm trước = 100");
  - the status written in the column header: `UOC_TINH` (ước tính), `SO_BO` (sơ bộ) or `CHINH_THUC` (chính thức).

  The value is kept as the exact decimal string; nothing is rounded in storage.
- [ ] P10-04 Index values stay indexes. A "+x%" form is computed only at display time, with the base stated next to it.
- [ ] P10-05 Blank cells and "-" stay missing, never 0.
- [ ] P10-06 A newer file for the same period supersedes the older one. Both are kept, and readers get the newest with a "đã cập nhật" flag.
- [ ] P10-07 `official-statistics-category-map.json` encodes Ultimate §6.4: product-category group → statistics group names, exactly as written in the source files. A category not in the map returns "chưa ánh xạ". No fuzzy matching.
- [ ] P10-08 The fetch script lists files through the site's public WordPress API (`/wp-json/wp/v2/media`, filtered by spreadsheet MIME type and date):
  - at least 2 s between requests and at most 20 files per run;
  - it saves each file privately with its sha256 and source URL, outside Git;
  - it is run by the operator only. Tests use a fake transport, never the network.
- [ ] P10-09 Every value is cited through `CitationRegistry` as "Cục Thống kê (nso.gov.vn), <file>, bảng <sheet>, dòng <n>, công bố <date>". The provider-name lint allows "Cục Thống kê" and "nso.gov.vn" for this source only.
- [ ] P10-10 E12 guard: the module exposes no helper that adds, subtracts or divides a sample value with an official value. Values are returned for side-by-side display only. A test shows that an attempted ratio raises a typed error.
- [ ] P10-11 Tests:
  - one synthetic workbook per profile;
  - an unknown layout;
  - blank and "-" cells;
  - the three value statuses;
  - a revision superseding an older file;
  - a category missing from the map;
  - the fetch script with a fake transport, including the rate limit and the file cap;
  - the citation text;
  - the provider-name lint exception.

**Functional when:** uploading a synthetic monthly-tables file and a synthetic CPI file to a fixture run stores validated, cited official-statistics rows. For any category in the map, the rows can be read back for side-by-side display beside sample numbers, ready for P8-10.

---

## Owner gates (not agent work)

- P9 live comment collection: an owner-approved charge cap per run.

- Phase 0 spike (#124): ≤6 paid calls. **Approved 2026-10-07.** Run it with `docs/runbooks/agent-pipeline.md` §7.
- Install the OpenCLI extension in Chrome on Fedora (unblocks P6).
- Choose the social collection account (unblocks P7 collection).
- Live Metric search or export: a yes per run (P6).
- Deploys: #125 Phase 3 (PageIndex key and `pypdf` venv on Fedora), P6 keepalive. Each deploy needs approval plus the exact merge SHA.
- Every merge.
