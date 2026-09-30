# Research A37 handoff: M03 section-artifact retention ledger

- Added only migration `0037_analysis_section_artifacts.sql`
  (sha256 `03e771270e2ca5c46060a3f50912b61c4e7fb52b9c873c4d0ee0e595d1a679c3`).
  Migrations 0001-0036 are byte-identical.
- Added a section-neutral `analysis_section_artifacts` +
  `analysis_section_artifact_members` ledger, constrained by `CHECK` to only
  section `M03` and renderer profile `m03-section-artifact-html-vi-v1` in
  this slice. Membership is a closed set of six roles (`metric_set`,
  `chart_bundle`, `envelope`, `narrative`, `receipt`, `html`) and is made
  immutable by `BEFORE UPDATE`/`BEFORE DELETE` triggers, matching the
  existing repository trigger pattern.
- Reused the existing content-addressed artifact store and
  `artifact_manifests` table; no second blob store was added. First-storage
  `acquired_at` semantics are preserved via `ON CONFLICT(sha256) DO NOTHING`
  plus a metadata read-back check.
- Added `SectionArtifactRetentionLedgerService` (`retain`/`read`) and
  `AnalysisSectionArtifactRetentionReader`. Before any durable write it
  parses/verifies every JSON contract, calls the existing A32-A35 verifiers
  and the A36 renderer with the exact declared dependencies to replay the
  full chain, and compares exact HTML SHA-256/byte size/bytes. Reads never
  select "latest": callers must supply the exact `sectionArtifactSha256`,
  and `read()` reopens registered bytes, verifies manifest metadata, replays
  the complete A32-A36 chain, and compares exact HTML before returning.
- Exact retries require every incoming member's exact byte SHA-256 and byte
  size (metric set, chart bundle, envelope, narrative, receipt, HTML) to
  match the already retained membership; any changed byte representation
  fails closed with a dedicated conflict error before any mutation.
  First-storage rows are inserted from purely in-memory digests/sizes, so
  the database transaction never performs a filesystem write and a failed
  transaction needs no artifact cleanup; canonical bytes are published only
  after a successful commit. A retry whose canonical bytes are genuinely
  missing (for example a crash between a prior commit and its publish step)
  narrowly republishes the exact, already byte-verified incoming bytes for
  that request before completing its full replay verification. No unrelated
  canonical artifact is ever scanned or deleted.
- Each six-member buffer is rejected above the 8 MiB bound before JSON
  parsing or any mutation, and every returned retention record is
  runtime-validated against its closed JSON Schema before being handed back.
- Added one offline CLI, `research:metric:m03:retain`, taking an explicit
  database path, artifact root, and the six exact A32-A36/HTML file paths
  plus their declared digests. It performs no AI/provider call, no
  calculation, no "latest" inference, and never writes inside Git. Its
  printed receipt (`sectionArtifactSha256`, dependency identities,
  `deduplicated`, `databaseMutations`, `aiCalls: 0`, `providerCalls: 0`)
  never includes local file paths.
- Added closed JSON Schema contracts
  (`section-artifact-retention-request`, `section-artifact-retention-record`)
  and registered them in the existing TypeScript generator; generated types
  committed.
- Updated `src/modules/analysis/index.ts` exports, `package.json`, `README.md`,
  `INTENT.md`, `docs/STATUS.md`, and added one A37 task brief.

This is layer-two retention only: no report version, interpretation, review
target, human approval, PDF, UI/API, or deployment is created here.

Production correction commit `8a0b7674981845965f081227135fa841f6a8b6f7` closed
three findings from independent review of implementation head
`82e417391064f520e27c0dff785b37893b95749a`: exact retries now compare every
member's exact byte SHA-256/size (not just canonical JSON/HTML), the DB
transaction stores only in-memory digests so a failed write never deletes a
canonical artifact (narrow republish-on-retry instead), and all six buffers
are rejected above the 8 MiB bound before parsing.

Tests were authored and owned by Codex under the test-audit gate, independent
of the above correction: `tests/integration/section-artifact-retention-ledger.test.ts`
(commit `5b614e32542fd78766c4490269f28ee0d793a4a2`) is the single
service/integration owner, covering fresh retention, mutation-free exact
retry, a byte-changed-representation conflict, the 8 MiB bound rejection,
missing-canonical-member recovery on retry, and row immutability;
`tests/integration/section-artifact-retention-cli.test.ts` (same commit) is
the distinct CLI/filesystem-boundary owner, covering a wrong-digest rejection
with zero partial writes, a fresh CLI run, an exact CLI retry, and (non-Windows)
file/database mode bits. Commit `30d51032229061fa3decf05897605666d910525c`
advanced unrelated pre-existing migration-count expectations in other
integration tests to account for migration 0037. Neither test commit touches
production code, contracts, or migrations, and neither performs any AI or
provider call.

The final implementation-and-test head
`30d51032229061fa3decf05897605666d910525c` passed Linux CI on both
required workflows: [Check](https://github.com/khangpworking/tdn-growth-os/actions/runs/36708237214)
(176/176 frontend tests, 615/615 repository tests, contract generation,
strict TypeScript, production build) and
[Research report preview](https://github.com/khangpworking/tdn-growth-os/actions/runs/36708237136)
(no page error). PR #99 is open/draft; it was temporarily retargeted to
`main` only to trigger these Linux checks and remains stacked logically on
A36 (draft PR #98). Windows tests, build and typecheck were not run by
policy.

Remaining scope limits: this slice still creates no report version,
interpretation, review target, human approval, PDF, UI/API, or deployment;
it retains section `M03` under renderer profile
`m03-section-artifact-html-vi-v1` only.
