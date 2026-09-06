# Box 1 foundation data dictionary

Updated: 07/09/2026. Scope: Task 001 foundation, Task 003 ingestion, Task 004 Data Packs, and Task 005 market snapshot Results.

## Inventory and reuse decision

- New repository before Task 001: ESM package, Node 24.15.0 available, no dependencies, no lockfile, no SQLite or migration implementation.
- `C:/Users/Admin/Documents/tdn-pipeline` was inspected selectively. Its checked-out branch reported many local changes, root `package.json` targeted Node 22, included AJV, and did not include a SQLite driver. Its `docs/migration/phase-2-sqlite.md` proposed `better-sqlite3`, WAL, foreign keys, busy timeout, migrations, and filesystem artifacts, but was a plan rather than running SQLite code.
- The clearly relevant Content Studio phase-4 worktree was inspected only for package, lockfile, migration runner, migration test, and first schema evidence. Its Windows absolute `.git` pointer was resolved explicitly from WSL: branch `omos/content-studio-phase-4`, revision `87b6a23863ecdaf3a85335c0cf1c7b8967763b8a`, with a heavily modified working tree. No claim was made that this branch/revision is the running source. Its lockfile records `better-sqlite3` 12.11.1 with Node 24 in the package engine range and AJV 8.20.0. Its migration runner demonstrated checksum-ledger and transaction patterns.
- Decision: **adapt the proven driver/migration patterns, rewrite the schema and Box 1 service for this repository**. Pin `better-sqlite3` 12.11.1 and AJV 8.20.0. Do not copy Content Studio domain tables, runtime data, backups, logs, generated content, or its production migration/backup policy.
- Local compatibility check: `better-sqlite3` loaded under Node 24.15.0 and reported SQLite 3.53.2.

## Dictionary and identity/grain rules

| Concept | Authoritative identity / grain | Meaning and rules |
|---|---|---|
| Source | `source_id`, required namespaced form such as `manual:synthetic-calcium-001` | Origin registration. The name does not determine evidence grade. |
| Ingestion run | `(source_id, idempotency_key)` | One accepted delivery attempt from a source. It retains that ingestion's own acquisition time, canonical request hash, contract version, status, and artifact digest. Reusing a key with different input is rejected. |
| Artifact manifest | SHA-256 of stored bytes | Content address, byte size, media type, relative POSIX path, acquisition time, contract version, and retention status. Manual Task 001 input stores canonical raw-payload JSON; Task 003 export input stores exact source-file bytes including whitespace. `artifact_manifests.acquired_at` is the acquisition time from the first ingestion that stored the content digest; later ingestions of the same digest retain their own acquisition times on their ingestion rows. Bytes live at `sha256/<2-char-prefix>/<digest>` under the configured artifact root. User filenames never define identity. |
| Evidence | `evidence_id`, one per ingestion in this narrow path | Links ingestion to artifact and stores an explicit grade plus its supplied basis. Grades are not inferred from provider/source names. |
| Product | `(platform, platform_product_id)` | Stable platform identity. `product_name` is mutable display metadata and never part of identity. Reports from different providers for the same platform identity resolve to one product. |
| Observation | SHA-256 identity over `(platform, platform_product_id, scope, exact period start/end/grain, metric_code)` | One metric at the declared period grain. Provider/source is deliberately excluded, so equivalent cross-provider evidence links to one observation instead of creating additive duplicates. A conflicting value for the same identity is rejected rather than silently summed or overwritten. |
| Observation evidence | `(observation_id, evidence_id)` | Many-to-many lineage from a stable observation to the evidence deliveries supporting it. |
| Finalized Data Pack | `(pack_key, version)` | Immutable, calculation-ready snapshot created from explicit observation IDs. The row stores semantic request hash, canonical manifest artifact digest, optional lower-version same-key predecessor, and finalization time. Same semantic request is idempotent; corrections use a higher version. |
| Data Pack item | `(pack_id, observation_id)` | Immutable membership linking the explicit selection to its finalized pack. Replay truth comes from the frozen manifest snapshot, not mutable product display rows. |
| Analysis Result | `(data_pack_id, calculation_key, calculation_version)` | Immutable Box 2 output row linking one verified finalized Data Pack to one canonical Result artifact. Task 005 supports only `market_snapshot_v1` version 1. |

## Metric semantics

- `period_revenue_vnd` and `lifetime_revenue_vnd` are separate metric codes. Both are SQLite INTEGER VND, limited at the JSON boundary to JavaScript's exact safe-integer range.
- Period start, end, and `grain` are retained as supplied. `calendar_month`, `day`, `rolling_30d`, or a bounded custom label are valid; no weekly coercion occurs.
- A missing metric creates no observation row. An observed zero creates an integer-zero row.
- Percentage metrics store integer `value`, explicit unit `percent`, and explicit integer `scale`; percentage points equal `value / scale`.
- Google Trends-like values use unit `relative_interest_index_0_100`. They are not search volume.
- Evidence grade and basis are required input fields. `synthetic`, `unverified`, `provider_reported`, `corroborated`, and `verified` are labels supplied at the boundary; the service does not calibrate or infer them.
- A Task 003 export has one common period/scope and at least one product row. Only product identity/display name, period/lifetime integer VND revenue, period units sold, and scaled revenue growth are consumed from the provider-shaped file.
- One accepted export file creates one ingestion, one evidence row, and one exact-byte artifact shared by every imported observation. Equal duplicate identities within the file are deduplicated; conflicting values reject the whole import before artifact or authoritative database writes.
- The existing artifact-before-database caveat remains: a database transaction failure after a newly written content-addressed artifact can leave an unreferenced artifact file for later operational cleanup.
- A Task 004 request supplies unique positive decimal observation IDs. IDs are sorted before semantic hashing, and all selected observations must share exact scope and supplied period start/end/grain strings.
- The canonical Data Pack manifest snapshots product identity/name, metric code, lossless decimal-string integer value and scale, plus sorted evidence ID/grade/basis, source, ingestion, and raw-artifact digest references. Replay verifies content SHA-256, canonical JSON, manifest schema, and finalized database metadata.
- Finalized pack rows and memberships are database-trigger immutable. A superseding pack must use the same stable key, a higher version, and retain the old pack and manifest unchanged.
- Box 2 reads only the verified frozen manifest, pack ID, and manifest digest through the declared read-only Box 1 `FinalizedDataPackReader`; it does not calculate from current observation/product tables.
- `market_snapshot_v1` sums `period_revenue_vnd` and `units_sold` independently with `BigInt`, serializes totals as decimal strings, emits `null` when a supported metric is absent, and preserves observed zero as `"0"` with a positive observed-product count.
- Coverage records selected observation count, unique platform-product identity count, and per-supported-metric observed-product counts. Unsupported metric codes are unique and sorted; they are not aggregated.
- Result replay verifies artifact digest, schema, canonical bytes, immutable row metadata, and the referenced verified Data Pack metadata.

## Deliberately not included

Collectors/providers, automatic Data Pack selection, averages, growth aggregation, ROI, scoring, ranking, recommendations, additional calculations, AI interpretation, legacy import/backfill, API/UI, business matching beyond stable platform product IDs, retention execution, artifact reconciliation, backup/restore, and production deployment are later work.
