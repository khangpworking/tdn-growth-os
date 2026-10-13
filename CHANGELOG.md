# Changelog

## Unreleased

- Exact Shopee review outcome: per-listing review counts admit only rows carrying a review identity, so the provider's per-listing "not collected" status rows no longer count as reviews. A run that returns status rows only is now classified `PROVIDER_BLOCKED` with `0/N sản phẩm có đánh giá` instead of reporting one review per listing as `PARTIAL_LISTINGS`. Coverage uses the same admitted counts, including on reuse; status-only pages cannot make failed collection coverage partial or mark review coverage collected. Actor input, spend caps and the no-automatic-retry rules are unchanged.
- Market presentation: a results-page Metric capture now re-reads and pins its retained snapshot, manifest, source-context and descriptor digests and passes the same machine rules as the workbook path; a unit-spec receipt on a capture is refused in plain words without blocking the revision. A capture page whose filters differ from the confirmed scope returns 400 `metric_source_run_mismatch` at the OWNER write boundary, and every 500 `integrity_error` response logs its cause server-side. Awaiting independent review and merge; not yet in a PR.

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
