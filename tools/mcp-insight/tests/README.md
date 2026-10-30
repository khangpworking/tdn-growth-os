# Offline Insight MCP contract tests

These tests are independently authored from CONTRACT.md revision 6 (IM-Q1–IM-Q51),
the revisions 4/5 and 6 review notes, and Firstmate's F312 steering message 001.
F312 updates the default codebook version to **2026-10-30.3** (PR 2: **2026-10-30.4**), still DRAFT; the
five revised theme definitions are read as data, not copied into assertions.
The reference JSON is a normalized-LF snapshot of the supplied codebook. No
assertion interprets the `overlaps` list or decides owner question 15.

All reviews, writer names, identifiers, keywords, configuration and provider
responses are synthetic. Each review has a unique nonce. App SQLite files,
artifacts, scope records, Metric response entries, warehouse files, temporary
SLAYER storage and synthetic key files live under pytest's temporary directory.
There is no production database, real key, network transport or paid call.
The audit guard denies network/DNS/bind attempts, external SQLite connections
and real secret/config reads, including attempts the subject catches. Synthetic
credentials are redacted from pytest failure reports.

## Running

Collection does not import the absent/in-progress implementation, FastMCP or
SLAYER. Missing implementation files fail at fixture setup, rather than skipping
tests or breaking collection. Run from the repository root using an environment
with pytest:

```sh
PYTHONDONTWRITEBYTECODE=1 python -m pytest tools/mcp-insight/tests --collect-only -q -p no:cacheprovider
```

For behavioral execution after implementation lands, use its pinned FastMCP,
SLAYER and YAML dependencies and run **only this directory**. Successful semantic
count cases call the real local SLAYER. Mismatch controls wrap its real results
and change one numeric cell; they do not return canned successful counts.
Neither collection nor these tests requires network access. No npm sweep,
provider smoke call, deployment or merge is part of this test task.

## Coverage and negative controls

| Test module | Contract rows |
|---|---|
| `test_boundaries.py` | Q1–Q6, Q38–Q40 |
| `test_warehouse.py` | Q7–Q13, Q41 |
| `test_coding.py` | Q14–Q21, Q42–Q43, Q46–Q48, Q51 |
| `test_counts.py` | Q22–Q32, Q44–Q45, Q50 |
| `test_portraits_and_spec.py` | Q33–Q37, Q49 |

Each test name includes its row ID; each docstring identifies its negative
control. Controls use discriminating inputs (for example 5 writers on only
2 products), changed temporary codebooks, invalid fake answers, real numeric
SLAYER perturbations, or deliberately changed output/spec/warehouse copies.
This is not a general source-mutation framework. The implementation was not
available when the suite was authored, so baseline behavioral/mutant execution
is not claimed by collect-only success.

The explicit owner cases have independent expected results:

- Q46/Q47: fixed excluded logistics codes and normalized names reject in core
  and blocks, including dry run and a codebook without `excluded`. Every block
  and core-only request has its exact ordered active question inventory.
- Q50: 1 named + 4 unnamed on 3 products gives 5 writers, passes the threshold,
  carries the exact unnamed-writer note and keeps check 2 missing with
  `WRITER_UNKNOWN`. Theme and portrait groups use the same fixture. The
  complementary named-only case has no such note.
- Q51: exactly one packaging-appearance contributor; the packing-mechanics
  review and the other three reviews return all-negative answers. Every answer
  contains all four probabilities, a valid choice and confidence. Expected
  `T-THIETKE` all/khen counts are each 1. Recorded questions retain the F311
  include and F310 exclude guidance. These fake responses test mechanics and
  instructions sent; they do not certify a real model's judgement.
- Q8/Q15: pending, awaiting-keyword and category-not-selectable capture 2 never
  activates proposed keywords/category or category evidence. Only OK does.
- Q26: all-negative completion reports `{shopee: 2, tiktok_shop: 3}`, not 5.
  Q34 includes `binh88` and the reviewed fixed demographic totals.

## Contract gaps

The contract defines the five public tool signatures. It does **not** name the
following internal interfaces, storage fields or response envelopes. These are
the narrow assumptions used by the test harness, not new product requirements.
If the author's production conventions differ, adapt the harness at these
points without adding test-only production exports or changing business oracles.

1. The module exposes its FastMCP instance as `mcp`; tools are directly callable
   Python functions. `sync()` also accepts awaitable tool results. The entry
   point explicitly passes `transport="stdio"`.
2. `CODEBOOK_PATH` is a `Path` consulted when a tool loads the codebook. The
   fixture patches it to a temporary copy for invalid/version/threshold cases.
3. The one injectable production transport is named
   `_jev_transport(body, api_key)` and returns `(HTTP status, JSON bytes)`.
   Body keys are `text`, `platform`, `product_name`, `block_label`,
   `codebook_version`, `questions`; each question has `code`, `name`, `include`,
   `exclude`, `options` (the codebook's four option objects). Fake replies use
   the existing Jev protocol `{model: "jev-1.13.0", answers: {code: answer}}`;
   answers have `type`, `choice`, `probabilities`, `confidence`.
4. `_slayer_query(*args, **kwargs)` is the synchronous production execution
   boundary, returning JSON-shaped mappings/lists with numeric cells.
   `_load_semantic_models(directory)` is the production YAML loader; a naming
   collision raises `ValueError` mentioning measure/column/collision. Q22 mutates
   a real copied YAML model's `measures` mapping/list, not an invented model.
5. In addition to the explicitly named `review`, `review_text`, `coding_state`,
   `coding_target`, `count_registry`, `writer_guess`, source/label tables are
   assumed named `label`, `keyword`, `trend`, `product`, `run_facts`. Keywords
   have a `keyword` column, products a `product_name` column, and labels have
   `p_yes`, `step` and the provenance/state fields in the contract. There is no
   assumed label surrogate ID; the hostile-label fixture copies a valid row.
6. `run_facts` has `keyword`, `created_at`, `applied_category`,
   `applied_keywords` (JSON array), `category_evidence_label`,
   `category_evidence_reason`, `content_sha256`. The scope file uses the app's
   documented `capture2` and category-evidence shape. Minimal synthetic app
   tables contain only the stored projection needed here, not app migrations.
7. Build responses expose `reviews_by_platform` and `sources`, where source
   counts include `keywords` and `trends`. Portrait responses expose aggregate
   `rows`; missing demographic cells are
   `demographics[platform] = {"Giới": "Chưa có dữ liệu", "Nhóm tuổi": "Chưa có dữ liệu"}`.
8. The stored Metric-row carrier/path is not specified. The source fixture
   puts app-shaped response entries in
   `<capture root>/<run_id>/capture1/responses.json`, using
   `body.data.products[].product_base_id` and `product_name`. It is never a live
   browser/provider call. Product-name invalidation changes the one product
   used by exactly one source review.
9. `input_sha256` uses canonical JSON with the keys `text`, `platform`,
   `product_name`, `block_key`, `codebook_version`, UTF-8, sorted keys, no
   separator whitespace and literal Unicode. The contract specifies the values
   but not the key spellings/JSON encoding convention.
10. `count_registry.numbers_json` stores the row numbers as a JSON object. Q30
    checks format, same-state stability, uniqueness, label-state sensitivity,
    retention of old numbers and conflict refusal. Exact canonical key names
    and the ordered-dump byte serialization for the count/state digest are
    unspecified, so it does not invent an independent byte-for-byte ID recipe.
11. The wrong-model failure in Q18 is read as `JEV_THEME_INVALID`; transport,
    HTTP and malformed JSON are `JEV_THEME_UNAVAILABLE`. A SLAYER execution
    exception is required to return an error but its code is unspecified.

The codebook copy assertion excludes the disputed `overlaps` metadata. All
other JSON data is compared to the F312 snapshot, including DRAFT/null approval
metadata. This avoids deciding the owner-pending overlap wording while still
checking the versioned data that the implementation actually uses.

### Reconciled with the implementation (code author, 30/10/2026)

Production took the harness names for points 1–7, 9–11 (`_jev_transport(request, api_key)` with the structured
IM-Q20 request, `_slayer_query`, `_load_semantic_models` raising `ValueError`, tables `run_facts`, `keyword`,
`trend`, `count_registry.numbers_json`, `writer_guess(writer_key, gender, age_band, year_basis)`, no label
surrogate ID, `reviews_by_platform`, `sources.keywords`/`trends`, portrait `rows` and `demographics`). The
harness moved to the real stored source shapes, checked on stored runs (keys only): Shopee page rows carry
`ratingStar`; TikTok Shop comments carry the text in `review.display_text` and `is_anonymous` on the comment
item; Trends GEO_MAP rows carry `location` and `extracted_value`; stored Metric rows are in
`<capture root>/<run_id>/run<N>/raw-responses.json` (point 8). The leak scanner skips whitespace-only fixture
names (IM-Q41), which identify no one and would match every space. No assertion or negative control changed.

### Review of PR 428 and the IM-Q39 snapshot (owner update IMCP-P1E, 30/10/2026)

The reviewer's regressions are kept as written: count tools through FastMCP (IM-Q1), failed captures are
missing, not zero (IM-Q8), a fractional SLAYER difference (IM-Q23), artifact bytes against their digest (IM-Q13).
`test_im_q39_wal_app_siblings_are_byte_identical` holds a writer open on a WAL fixture, with rows committed only
in the WAL. `build_warehouse` must read those rows, and `app.sqlite`, `-wal` and `-shm` must be byte-identical
afterwards. Its `live_open` case is the negative control: the old `mode=ro` open of the live DB changes the app home.
`test_im_q39_torn_snapshot_is_retried_then_refused` covers one torn copy (retried) and four (`SOURCE_SNAPSHOT_FAILED`).
IM-Q2 now checks the module's app connection, which is the per-call snapshot. It also fails if any connection
opens the live DB path. The `mode=rw` negative control is unchanged and still fails.

## Part 2: revision 10, IM-Q52–IM-Q78

`part2/` is independently authored from CONTRACT.md at `59d0fb99` and all three
rounds of the independent review. It covers tasks 3.1–3.3 only. All existing
part 1 Python files and the reference-codebook fixture remain unchanged.

| New module | Contract rows |
|---|---|
| `part2/test_boundaries_p2.py` | Q52–Q54 |
| `part2/test_report_plan.py` | Q55–Q61, Q74 |
| `part2/test_confidence.py` | Q62–Q68, Q75–Q76, Q78 |
| `part2/test_reason_evidence.py` | Q69–Q72 |
| `part2/test_shared_evidence.py` | Q73, Q77 |

Negative controls include unrelated-reason/recommendation/duration candidates,
wrong-target and stale-input labels, equal-count contributor replacement,
unknown/49.9/exactly-50 revenue share, one-brand and wrong-ID diversity evidence,
invalid direct-SQL records, missing checks, minimum synthesis support, and
unchanged part 1 flags/notes/IDs after new checks pass. Schema, leak and frozen
data checks also exercise deliberately corrupted copies. Successful count
paths use real local SLAYER; mismatch controls perturb its actual result.

The Q69 fixtures are deliberately separated (review nit R3-1):

- `reason_baseline_r1_r13` covers R1–R11 and R13, plus the distinct TikTok
  contributor. Its expected Shopee contributors are exactly `["shopee:1"]`.
  R12 has a separate real interrupted-block-change test.
- `reason_lifecycle_r14` contains only R14. It asserts current kept labels
  after changed text, rebuilding **and successful fake recoding**, then tests
  candidate → fresh negative → fresh positive readings.
- `reason_lifecycle_r15` contains only R15. Identical-text rebuilding preserves
  the reading and its one contributor. It never inflates the baseline count.

New fake-coding cases replace the existing in-process `_read_key` reader and
`_jev_transport` before execution; they neither create nor read a key file.
Only synthetic review text is returned by `read_reviews`. The local adapter
passes every other result field through the original confidentiality scanner,
and scans warehouse/shared-store tables while exempting **only** `review_text`.
It also checks unchanged app bytes/environment and enables the existing audit
guard on every tool success/error. No production or live-store input is used.

## contract gaps (part 2)

These are narrow harness assumptions where revision 10 leaves representation
unspecified. Reconcile these adapters with the author without adding production
exports solely for tests or weakening the contract assertions.

1. A report-frame source uses `key` and a `roles` object keyed by the question
   number as a JSON string (`"1"` through `"5"`). Frozen values and question
   mappings come from the contract; those container/key spellings are not
   explicitly prescribed. The tests copy the real file and mutate that shape.
2. `KEYWORD_GROUPS_PATH` is the existing production constant used for temporary
   approved/unapproved keyword-group copies. `REPORT_FRAME_PATH` is explicitly
   named by the contract. As in part 1, tools and the five explicitly named
   shared-store writers are module-level callables; `sync` accepts awaitables.
   No return value is prescribed for the writers, so tests inspect stored rows.
3. The existing `_read_key()` is replaced only to supply a synthetic in-memory
   credential to the fake transport, respecting the task's no-key-file rule.
   There is no new injection hook or production edit.
4. Q70 does not prescribe the semantic query's Python signature. Tests reuse
   the reconciled part 1 `_slayer_query` boundary and perturb a real result;
   they do not fabricate successful semantic counts or assume query strings.
5. Shared tables use the exact columns named by the contract; extra internal
   columns are allowed except for the expressly forbidden global `run_id`
   columns and review-text copies. Historical registry snapshots continue to
   use part 1's reconciled `numbers_json` representation.
6. Part 1's Q1 schema test still asserts exactly five tools. It is deliberately
   unchanged here, as requested. It passes on this part 1 implementation; once
   the new nine-tool implementation lands it needs the explicitly authorized
   IM-Q52 amendment during integration. The new Q52 test already owns that
   nine-tool schema. This is a test-compatibility conflict, not a rule change.

Q73 separately checks the now-accepted `.4` overlap wording; the original
part 1 tests that left that wording pending remain unchanged.

Validation used Python 3.14 and the pinned `requirements-test.txt` versions.
The historical `.evr2-review/venv` collects tests but lacks SLAYER and YAML, so
the behavioral environment was built outside Git from cached wheels only
(`pip --no-index --no-cache-dir`; no network). See `HANDOFF-P2.md` for commands
and results. Collection does not establish that the concurrent part 2
implementation passes; absent interfaces are expected baseline failures.
