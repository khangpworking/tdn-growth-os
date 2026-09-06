# Task 005 — Deterministic market snapshot Result

Status: READY. Lane: Standard. Owner: một implementation agent trong worktree do Orca chỉ định.

## Mục tiêu

Tạo đường đầu tiên của Box 2:

```text
finalized Data Pack
 -> verified Box 1 read interface
 -> deterministic market snapshot calculation
 -> canonical Result artifact
 -> immutable Result row
 -> verified replay
```

Task này chưa dùng AI, scoring, threshold, recommendation hoặc business approval.

## Công thức cố định v1

Calculation key: `market_snapshot_v1`. Calculation version: `1`.

- `periodRevenueVndTotal`: tổng BigInt của các observation `period_revenue_vnd`.
- `periodUnitsSoldTotal`: tổng BigInt của các observation `units_sold`.
- Metric hoàn toàn vắng mặt có total `null`, không phải zero.
- Observed zero có total `"0"` và observed-product count lớn hơn zero.
- Ghi `selectedObservationCount`, số unique `(platform, platformProductId)`, và observed-product count cho mỗi supported metric.
- Các metric không dùng phải xuất hiện trong `ignoredMetricCodes`, unique và sorted.

Không tính average, growth aggregation, ROI, score hoặc ranking.

## Đọc và ownership

Đọc `AGENTS.md`, `ARCHITECTURE.md`, `docs/STATUS.md`, data dictionary và Task 004 code/tests.

Owned paths: `contracts/analysis/`, `migrations/0003_analysis_results.sql`, `src/modules/analysis/`, read-only query-interface addition tối thiểu trong `src/modules/foundation/`, `scripts/`, focused integration tests, status, data dictionary nếu cần, và handoff Task 005.

Không sửa migrations 0001/0002, CI, dependency, ingestion behavior hoặc Data Pack semantics.

## Cross-Box boundary

Box 2 không query trực tiếp bảng Box 1 để tính toán.. Dùng declared read-only Data Pack interface trả verified frozen manifest, Data Pack ID và manifest artifact SHA-256. Box 2 chỉ ghi bảng Box 2. Foreign key trong migration được phép; business reads phải qua interface.

## Contracts

Input JSON Schema canonical:

- `contractVersion: "1.0.0"`
- `dataPackId`: UUID
- `calculationKey: "market_snapshot_v1"`
- `calculationVersion: 1`

Không nhận formula, SQL, arbitrary metric list hoặc prompt.

Canonical Result gồm Result UUID, calculation key/version/time, Data Pack ID/key/version/manifest digest, exact scope và supplied period strings, coverage counts, totals dạng decimal string hoặc null, observed-product counts và sorted ignored metrics. Không dùng floating point.

## Persistence và behavior

Migration 0003 thêm immutable Box 2 Result row, unique `(data_pack_id, calculation_key, calculation_version)`, canonical request hash, Result artifact digest, completion timestamp, foreign keys/index cần thiết. Không thêm generic workflow state.

1. Validate request trước mọi write.
2. Replay/verify finalized Data Pack qua Box 1 interface.
3. Reject pack không có supported metric trước Result/artifact write.
4. Chỉ tính từ frozen manifest, không đọc current observation/product rows.
5. Parse decimal strings bằng BigInt và serialize total về canonical decimal strings.
6. Same Data Pack + calculation key/version phải idempotent.
7. Persist one canonical artifact và immutable Result row.
8. Replay Result phải verify digest, JSON/schema/canonical bytes và database metadata.
9. Giữ artifact-before-database orphan caveat; chưa build reconciliation.

## Nghiệm thu

- Migration 0003 upgrade DB version 2 và rerun idempotently; 0001/0002 byte-identical.
- Synthetic finalized Data Pack tạo đúng exact totals, coverage và sorted ignored metrics.
- Observed zero khác metric missing.
- Nhiều evidence không nhân đôi totals.
- Calculation dùng frozen manifest, không dùng mutable display metadata hiện tại.
- Same request idempotent; không duplicate Result/artifact rows.
- Missing/non-finalized pack và pack không supported metrics reject trước write.
- Result row reject direct update/delete.
- Replay phát hiện missing/corrupt/noncanonical hoặc metadata mismatch khi test hợp lý.
- Focused tests, `npm run check`, `git diff --check` và GitHub Check pass.
- Fedora DB/WAL/SHM/artifact permissions giữ `0600`; không còn runtime/private residue.

Không thêm race/load/browser tests.

## Không thuộc scope

AI interpretation, business thresholds, averages, growth aggregation, ROI, scoring, ranking, recommendation, automatic Data Pack selection, UI, worker, scheduling, approval, provider calls, backup/restore và artifact reconciliation.

## Business review để lại

Finance/Marketing sẽ quyết định metric nào additive, denominator, comparison window, rounding, KPI threshold và decision meaning. Task 005 chỉ có exact sums và coverage counts trung lập.

