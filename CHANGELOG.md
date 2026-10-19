# Changelog

> Updated 20/10/2026. Previous version: [copy before this update](docs/outdated/2026-10-20/CHANGELOG.md).

## Deployed 19/10/2026 (`f026acd9`)

Production runs `f026acd9` (PR #344), an app-only deploy on 19/10/2026 with migration 58. Everything merged between 15/10 and 19/10 is in this build:

- #248–#259: Metric adapter fixes, cover, Market autorun core, wiring and presentation, runbook.
- #260–#272: partial totals, sources P1–P7, Kalodata stop rule, video watch, credit message.
- #273–#285: Comtrade, Meta report, Google ads, NSO stats, TikTok top ads, Flint macro charts, NSO province, PDF auto and cap, trends geo.
- #286–#344: report shape, reader-only, PDF cite and title, replay, OpenCLI notice, UX M01–M14, CI hang, web title quote, Metric trend, shop unknown, World Bank display, test reviews, PDF status, Comtrade verify, search-ads domain, reader inventory, copy, proofread and dedup, proposals, phan12, Metric identity, price reader, context proofread, headline findings, section badges, reader footer, sample relevance (#339), period table (#344).

## Merged, not deployed

- #345 (R-business): business readings, price bands, options and method wording in the Market reader.
- #346 (Package S): public Shopee review source for Market reports, through the separate Shopee API service. It turns on at the next deploy.
- #347 (G-evidence): current-reader evidence tables, macro charts and source names.

In flight, not merged: #348 (G-references) and Package F+ (branch `wp/f-plus-209`, no PR yet).

## Unreleased

- Market M09 video watch (V1, behind `TDN_RESEARCH_VIDEO_WATCH_ENABLED=1`, off by default): the collection step takes up to 10 exact public TikTok video links already stored for the run (selection first, then stored TikTok search rows in position order, deduped, spread round-robin across accounts before the cap, order pinned), downloads each once (mp4/webm, at most 14 MB and 180 s), sends it inline through the existing CLIProxy settings and stores a strict S14 v3 automated reading (`AUTOMATED_MODEL_UNVERIFIED`, `MODEL_TRANSCRIBED`). M09 shows a separate block `Lời nói trong video bán hàng` (at most 5 videos, 3 segments, 30 words, `ghi lại tự động từ video, chưa xác minh`); off-product readings are stored but not drawn; operator readings are unchanged. Captures hold digests only, never the video or the key. Replay and revision make no download or model call. Media is swept after 45 days. Flag off renders byte-identically.
- Market M09 (P7): when the run has stored owner/operator uploads, the report shows the first video table (at most 10 rows, values as stored, every number labelled `ước tính`, no creator, link, ad spend, total or ratio) and seller video speech (at most 5 videos, 3 verbatim segments of at most 30 words each, labelled `chưa xác minh`), with one plain note. The drawn packages are pinned at the first build; revision, replay and verify re-read exactly those, with no provider call. S02/S14 register only when drawn; new gate `SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL`. Runs without uploads render byte-identically.
- Exact Shopee review outcome: per-listing review counts admit only rows carrying a review identity, so the provider's per-listing "not collected" status rows no longer count as reviews. A run that returns status rows only is now classified `PROVIDER_BLOCKED` with `0/N sản phẩm có đánh giá` instead of reporting one review per listing as `PARTIAL_LISTINGS`. Coverage uses the same admitted counts, including on reuse; status-only pages cannot make failed collection coverage partial or mark review coverage collected. Actor input, spend caps and the no-automatic-retry rules are unchanged.
- Market presentation: a results-page Metric capture now re-reads and pins its retained snapshot, manifest, source-context and descriptor digests and passes the same machine rules as the workbook path; a unit-spec receipt on a capture is refused in plain words without blocking the revision. A capture page whose filters differ from the confirmed scope returns 400 `metric_source_run_mismatch` at the OWNER write boundary, and every 500 `integrity_error` response logs its cause server-side. Merged to `main`.

- Insight drafts: explicit retained-proposal selection without acceptance receipts, labelled I02 summaries and I10/I13 corpus counts, and suppression of unsupported totals and raw completion/ratio claims. Required adoption lineage and historical bytes remain intact. PR #166 merged after independent review and full exact-head CI; U-03 remains partial and U-11 cross-check policy unresolved.

- Default peers: reader and draft M07 select a deterministic peer set covering at least 50% of compatible in-sample revenue, with source-title labels, shop fallback and separate owner additions. The rule is frozen before discovery or sales reads; exact retained inputs/results and historical replay are verified. PR #167 merged after independent review and full exact-head CI; automatic collection and admission policy remain unresolved.

- Draft/Insight: retained scope-based working-question proposals, source-backed I11 descriptive-rate gates, versioned coding prompts, and at most three task/owner/deadline proposals awaiting approval. New authored purchase suggestions are rejected and retained as invalid responses. PR #164 merged after independent review and full exact-head CI; classified-rate eligibility remains dependent on SYNC-4.

- L9: deterministic keyword-meaning core with canonical input validation, accent-sensitive decisions and exact frozen input/reason accounting. PR #163 merged after independent review and full exact-head CI; model drafting and report/collector integration remain pending.

- Market reader: versioned nullable sales/source metrics, per-platform output and labels, neutral findings, three dependency-ordered proposals, and corrected M05 demand wording in both lanes. Legacy replay preserved; PR #162 merged after exact-head full CI. Positive cross-platform totals remain unresolved.

- Source board: eleven cards with registry metadata, actual configured caps, stored workspace history and explicit future-collector placeholders. PageIndex account totals and its separate owner action are labelled distinctly. Merged in PR #161 after independent review and exact-head full CI; no collectors or deployment activated.

- P4: nhận file video/creator (CSV hoặc XLSX) qua route `sources/kalodata-video`; lưu bảng đã kiểm tra kèm trích dẫn dòng, giá trị thiếu hiển thị “không có dữ liệu”, không phiên âm, chuẩn bị trơ không tự xác nhận.

## 0.1.0 — 2026-09-05

- Khởi tạo cấu trúc repository và kế hoạch tiếng Việt.
- Lưu brief kiến trúc của chủ dự án.
- Chuẩn bị task SQLite; chưa triển khai runtime hoặc database.
