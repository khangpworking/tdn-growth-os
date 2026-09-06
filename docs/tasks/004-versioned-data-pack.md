# Task 004 — Versioned finalized Data Pack

Status: READY. Lane: Standard. Owner: một implementation agent trong worktree do Orca chỉ định.

## Mục tiêu

Tạo đường Box 1 tiếp theo:

```text
explicit observation IDs
 -> validate existence and compatible scope/period
 -> freeze deterministic snapshot manifest
 -> store manifest as SHA-256 artifact
 -> finalize versioned Data Pack
 -> retrieve and replay the frozen manifest
```

Data Pack là input bất biến cho calculation ở Task 005. Task này chưa tính toán, chưa tự chọn dữ liệu và chưa dùng AI.

## Đọc

- `AGENTS.md`
- `ARCHITECTURE.md` phần Data/Artifacts/Migrations, replay và Testing
- `docs/STATUS.md`
- `docs/foundation-data-dictionary.md`
- Task 001 và Task 003 service, artifact, migration và tests

Không cần đọc toàn bộ reference warehouse; field mapping đã được thu hẹp ở Task 003.

## Owned paths

- `contracts/foundation/`
- `migrations/0002_data_packs.sql`
- `src/modules/foundation/`
- `scripts/`
- `tests/fixtures/`
- `tests/integration/`
- `docs/foundation-data-dictionary.md`
- `docs/STATUS.md`
- `docs/handoffs/004-versioned-data-pack.md`

Không sửa migration `0001`, CI, dependency, collector, worker hoặc module Box khác.

## Input contract tối thiểu

Tạo JSON Schema canonical và generated TypeScript type:

- `contractVersion: "1.0.0"`
- `packKey`: stable namespaced key
- `version`: integer dương
- `purpose`: mô tả ngắn, bắt buộc
- `observationIds`: danh sách unique positive decimal strings
- optional `supersedesPackId`

Không nhận SQL/filter expression từ caller. Caller chọn observation IDs rõ ràng.

## Schema tối thiểu

Migration `0002_data_packs.sql` chỉ thêm:

1. Data Pack Pack record:
   - UUID pack ID
   - `pack_key` + `version` unique
   - canonical request hash để idempotency
   - finalized manifest artifact digest
   - optional superseded-pack reference
   - finalized timestamp
2. Data Pack item links:
   - pack ID + observation ID
   - immutable membership

Tên bảng theo ownership của Box 1. Dùng foreign keys, STRICT tables và index cần thiết; không thêm generic workflow/status engine.

Data Pack được tạo finalized trong một operation. Không cần draft state trong task này.

## Frozen manifest

Manifest artifact phải là canonical deterministic JSON và chứa đủ snapshot để calculation/replay không phụ thuộc vào mutable display metadata:

- pack key, version, purpose và finalized timestamp
- scope và exact supplied period start/end/grain
- mỗi selected observation:
  - observation ID + identity key
  - platform + platform product ID
  - product name snapshot
  - metric code
  - integer value encoded losslessly
  - unit + scale
  - evidence references needed for audit:
    - evidence ID and grade/basis
    - source ID
    - ingestion ID
    - raw artifact SHA-256

Sort observations and evidence deterministically before serialization. The Data Pack digest is the SHA-256 of these canonical bytes.

## Behavior

1. Validate input before artifact/database writes.
2. Load every requested observation and its evidence lineage.
3. Reject missing observation IDs.
4. For this first calculation-ready pack, require every observation to share the same scope and exact period start/end/grain. Do not silently coerce or normalize periods.
5. Snapshot values and evidence references; do not store only mutable row IDs as the replay source.
6. Store one canonical manifest artifact and link its digest from the finalized Data Pack.
7. Repeating the same `(packKey, version)` with the same semantic request returns the existing pack. Different input for the same key/version raises identity conflict.
8. A superseding pack must reference an existing finalized pack with the same `packKey` and a lower version. Never mutate the old pack.
9. Finalized pack rows and item membership must reject update/delete through database constraints/triggers.
10. Retrieval/replay reads bytes through the artifact store, verifies SHA-256, validates the manifest contract and returns the frozen snapshot.
11. Keep the existing documented artifact-before-database orphan caveat; do not build reconciliation yet.

## Nghiệm thu

Focused tests using existing synthetic imports must prove:

- Migration 0002 applies and reruns idempotently; migration 0001 remains unchanged.
- A valid explicit selection creates one finalized Data Pack, membership rows and one manifest artifact.
- Manifest bytes/hash round-trip and contain lossless values plus evidence/raw-artifact lineage.
- Ordering of input observation IDs does not change the semantic request or manifest ordering.
- Missing IDs and mixed scope/period selections reject before Data Pack/artifact writes.
- Same key/version + same semantic request is idempotent; changed request conflicts.
- A higher version can supersede an older same-key pack while the old bytes and rows remain unchanged.
- Invalid cross-key/non-lower supersession rejects.
- Direct update/delete of finalized pack or membership is rejected.
- Replay detects missing/corrupt manifest bytes.
- `npm run check`, `git diff --check` and GitHub Check pass.
- No runtime database, WAL/SHM, temporary artifact, environment or credential file remains.

Use the smallest test set that proves these behaviors. Do not add race/load/browser tests.

## Không thuộc scope

Calculation/Result, automatic observation selection, Data Pack UI, real provider, worker/scheduling, approval, AI, backup/restore, retention executor, legacy migration và artifact reconciliation.

## Business decisions để lại

Rules choosing which products, sources, evidence grades and periods enter a business Data Pack remain a Data Owner/Finance/Marketing decision. Task 004 accepts only explicit IDs and proves the technical freeze/replay mechanism.
