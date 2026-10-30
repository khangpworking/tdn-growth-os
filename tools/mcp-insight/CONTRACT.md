# tdn-insight contract rows, PR 1 (R-IM01 to R-IM06)

Source of truth: `openspec/changes/insight-mcp-v1` (spec, design decisions 1 to 5), `openspec/changes/insight-method-v1`
(R-I31, R-I32, R-I33) and `openspec/specs/insight-report/spec.md` (R-I05, R-I06, R-I11). This table is what the tests
are written from. Each row names one behavior and one negative control: an input or a one-check-removed module copy
(a mutant) that must make the row's test fail or flip its result.

Revision 2 (30/10/2026) applies the 17 findings of the table review. The mapping is at the end of this file.

Out of scope for PR 1: R-IM07 to R-IM12 (`report_plan`, confidence ceilings, reason links, `read_reviews`,
`submit_section`, `submit_statement`, `render_report`).

## Conventions used by the rows

- Module `tools/mcp-insight/insight_tools.py`, FastMCP server name `tdn-insight`, stdio only.
- Environment:
  - `INSIGHT_MCP_APP_DB`: the app SQLite file. Required by `build_warehouse`. It has no default.
  - `INSIGHT_MCP_APP_ARTIFACTS`: the artifact root (`sha256/<2 chars>/<sha>`). Default: `artifacts/` next to the app DB.
  - `INSIGHT_MCP_DATA_DIR`: where the run warehouses live. Default: `tools/mcp-insight/out/` (gitignored).
  - `INSIGHT_MCP_ALLOW_PAID`: exactly `1` allows a real Jev call. Any other value refuses.
  - `INSIGHT_MCP_JEV_KEY_FILE`: key file holding a `TYPESAFE_API_KEY=` line. Default: the project secret file under
    `~/.config/tdn-growth-os/secrets/`.
- "App home" in the rows means the app DB file, its `-wal`/`-shm` siblings, the artifact root, and every other file in
  the app DB's directory (for example a synthetic config file or `.env` in a fixture).
- Warehouse: one SQLite file per run, `<data dir>/runs/<run_id>.sqlite`.
- Platforms: `shopee` and `tiktok_shop` for reviews, `google` for keywords and Trends.
- The Jev transport is one injectable function. Tests replace it with a fake that counts calls and records request
  bodies. There is no real network in any test. Fake-transport tests of the paid branch are offline checks, not Jev
  calls.
- Fixtures are synthetic. They contain no real review text, names or IDs. Every synthetic review text contains a
  unique nonce token (for example `zqv01`). Some reviews are short (the nonce plus one or two words), so a leak check
  can find a whole short review, not only long runs of words.
- The five tools and their only arguments:
  - `build_warehouse(run_id)`.
  - `code_reviews(run_id, dry_run=True, max_calls=None, block_override=None, category_label=None)`.
  - `theme_counts(run_id, question=None)`.
  - `keyword_counts(run_id)`.
  - `portrait_counts(run_id)`.
- Errors are returned as `{"error": "<CODE>", "message": "<text>"}`. An error result has no count fields.

## Contract rows

### R-IM01: local, read-only app, paid flag, key from file

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q1 | The server is named `tdn-insight` and runs over stdio. The registered tools are exactly the five tools above. The MCP input schema of each tool has exactly the argument names listed above, with these types: `run_id` string, `dry_run` boolean, `max_calls` integer or null, `block_override`, `category_label` and `question` string or null. No argument takes SQL, a SLAYER query, a measure or a formula. | Two mutants, two separate assertions. A mutant that adds a tool `query` fails the tool-name-set test. A mutant that adds a `sql` argument to `theme_counts` (tool names unchanged) fails the per-tool input-schema test. |
| IM-Q2 | The app DB is opened only as `file:<path>?mode=ro` (URI). An `INSERT` through the module's app connection raises `sqlite3.OperationalError` (read-only). After `build_warehouse`, the app DB file's sha256 is unchanged and no `-wal` or `-journal` file was created by the module. | A mutant that opens with `mode=rw`: the `INSERT` succeeds, and the test must fail. |
| IM-Q3 | `build_warehouse`, `code_reviews(dry_run=True)`, `theme_counts`, `keyword_counts` and `portrait_counts` open no socket and resolve no host (audit hook). The module never binds or listens on a port. | A mutant that does a DNS lookup inside `code_reviews(dry_run=True)`: the audit hook trips. |
| IM-Q4 | `code_reviews(run_id, dry_run=False, max_calls=N)` without `INSIGHT_MCP_ALLOW_PAID` set to exactly `1` (unset, `true`, ` 1`, `0`) returns `refused: true`, `reason: "PAID_FLAG_MISSING"`, `eligible_reviews` (an integer count) and `planned_calls` (an integer). The Jev transport is called 0 times and the key file is not opened. | With the flag set to `1`, a key file present and a fake transport, the same call reaches the transport. This proves that the flag is what blocks. |
| IM-Q5 | The key is read in-process from `INSIGHT_MCP_JEV_KEY_FILE`. The key value never appears in a tool result, an error message, stdout, stderr, a log line or a warehouse file. A missing key or file gives `JEV_KEY_MISSING` without echoing the file contents. | A synthetic key and a fake transport that raises an error containing the `Authorization` header. The tool output must still not contain the key. A mutant that passes the raw exception text through fails the test. |
| IM-Q6 | No machine path is written in code. An unset `INSIGHT_MCP_APP_DB` gives `APP_DB_NOT_SET`. A path that does not exist gives `APP_DB_NOT_FOUND`, and no file is created at that path. The DB named by `INSIGHT_MCP_APP_DB` is the one read: with two synthetic app DBs A (run `aaaaaaaa-…`) and B (run `bbbbbbbb-…`), setting the variable to B makes `build_warehouse("bbbbbbbb")` succeed and `build_warehouse("aaaaaaaa")` give `RUN_NOT_FOUND`. | (a) A mutant that drops the existence check and opens with `sqlite3.connect(path)` (which creates a missing file): the test asserts the missing path still does not exist, so the mutant fails. (b) A mutant that ignores the variable and reads DB A fails the A/B selection test. |
| IM-Q38 | The app artifact store is read-only. Artifact files are opened for reading only. After every in-scope tool call, the artifact root has the same file names, sizes and sha256 bytes as before. This includes the failure paths `RUN_NOT_FOUND`, `RUN_AMBIGUOUS`, a missing artifact (`ARTIFACT_MISSING`) and `SLAYER_SQL_MISMATCH`. | A mutant that truncates one source artifact after reading it, and a mutant that writes a cache file into the artifact root. Both fail the before/after check. |
| IM-Q39 | No app write path and no flag change. (1) The module writes files only under `INSIGHT_MCP_DATA_DIR` and its own per-call temporary directories (audit hook on `open` with a write mode, `os.rename`, `os.remove`, `shutil` moves). (2) It never calls the app's write API: it opens no socket (IM-Q3), imports nothing from the app's `src/`, and starts no subprocess (audit hook on `subprocess.Popen`, `os.system`, `os.exec*`, `os.posix_spawn`). (3) Module import sets `DO_NOT_TRACK=1` and `SLAYER_USAGE_REPORTING=off` for its own process before SLAYER is imported. After import, no tool call changes `os.environ`, and no `TDN_*` variable is ever written. (4) The app home (DB, siblings, artifacts, a synthetic config file and `.env`) is byte-identical before and after every tool call, on success and on every failure path in IM-Q38. | A mutant that sets `os.environ["TDN_RESEARCH_JEV_ENABLED"]` in `code_reviews`, a mutant that appends a line to the synthetic `.env`, and a mutant that starts `subprocess.run(["true"])` in `build_warehouse`. Each fails its check. |
| IM-Q40 | No customer review text leaves `review_text`. For the five tools, on success and on every error path, none of these contains any fixture review nonce, any whole short review, any 8-word run of a long review, or any fixture writer name: the JSON result, the error `message`, captured stdout, captured stderr, and captured `logging` records. The dry-run and refusal fields (`eligible_reviews`, `planned_calls`, `already_coded`) are integer counts, never lists of reviews. | A mutant that logs the comment of the first eligible review at INFO, and a mutant that puts a short review's text into a label row's `note` field. Both fail the scan. |

### R-IM02: run warehouse

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q7 | `build_warehouse(run_id)` accepts a full run UUID or an 8-hex prefix that matches exactly one run. If no run or more than one run matches, it gives `RUN_NOT_FOUND` or `RUN_AMBIGUOUS` and no warehouse file is created. | A prefix shared by two fixture runs gives `RUN_AMBIGUOUS` and no file. |
| IM-Q8 | Sources read, all stored data only:<br>- Shopee reviews: `foundation_shopee_collections` with `run_key = 'auto-<run_id>'`, then the collection artifact, then the `pages[]` row artifacts.<br>- TikTok Shop reviews: captures with operation `kalodata.product.comment.insight`, `original_comments[]` in the base64 response.<br>- Search suggestions: captures `serpapi.google.search`, `related_searches[].query` and `related_questions[].question`.<br>- Trends by province: captures `serpapi.google.trends` with `data_type = GEO_MAP*`, `interest_by_region[]`.<br>- Product names: `kalodata.product.detail` `product_name` (TikTok Shop), and the Shopee name from stored Metric rows (`product_base_id = 1__<item>__<shop>`) when one is stored, otherwise NULL.<br>- Run facts: `analysis_research_automation_runs.keyword` and `created_at`.<br>The result returns counts per platform and per source. A source with no stored capture is reported as `"Chưa có dữ liệu"`, not 0. | A capture belonging to a second fixture run must not appear in the first run's warehouse. A run with no TikTok capture reports `tiktok_shop` as `"Chưa có dữ liệu"`, not `0`. |
| IM-Q9 | Writer rules:<br>- A Shopee review (no writer name stored) gets `writer_known = 0` and `writer_key = review_id`.<br>- A TikTok Shop review with a usable name gets `writer_known = 1` and `writer_key = "w:" +` the first 16 hex characters of sha256 of the NFC-normalized, case-folded, trimmed name.<br>- An anonymous TikTok Shop review (`is_anonymous` true, or a name containing `*`) gets `writer_known = 0` and `writer_key = review_id`.<br>The raw name is never stored. | Two TikTok reviews by the same name share one `writer_key`, and a third name differs. A masked name such as `a*****b` must not get `writer_known = 1`. |
| IM-Q41 | A missing writer name is unknown, on every platform. If the name field is absent, `null`, empty or only whitespace (on TikTok Shop as well as Shopee), the review gets `writer_known = 0` and `writer_key = review_id`, and no gender or year guess is made for it. | A TikTok Shop fixture with two reviews, one with `review_user.name = null` and one with `""`, gives two different `writer_key` values (both review IDs) and `writer_known = 0`. `portrait_counts` gives `"Chưa có dữ liệu"` for TikTok Shop gender and age (IM-Q35). A mutant that hashes the empty name gives one shared key and fails. |
| IM-Q10 | Customer text (the review comment plus the Shopee attribute lines) is stored only in the table `review_text(review_id, text)`. No other table has a column named `text`, `comment`, `name`, `user` or `attributes`. Scan every TEXT cell of every table and view except `review_text`, including the label, coding-state and `count_registry` tables. No cell contains any fixture review nonce, any whole short review, any 8-word run of a long review, or any fixture writer name. Google keyword text, product names and the coded group labels are not customer review text and may be stored. | A mutant that also writes the comment into `review`, and a mutant that writes a short review (`zqv07 ok`) into a label `note` column. Both fail the scan (spec scenario «Chữ khách trong bảng nhãn»). |
| IM-Q11 | Each review keeps its own platform. `review_id = "<platform>:<source review id>"`, and `platform` is never NULL. The same source review ID on two platforms gives two rows. | A fixture with the same source ID on Shopee and TikTok Shop must give 2 rows, not 1. |
| IM-Q12 | Shopee rows are read from the collection's `pages[]` only. Rows repeated across pages collapse to one by `reviewId`. Reviews in a listing's `excluded[]` are not stored. | A fixture with one review on two pages stores 1 row. |
| IM-Q13 | Determinism: two builds on the same app DB give the same `content_sha256`. The hash is taken over an ordered dump of the source tables (`review`, `review_text`, keywords, Trends, products, run facts), and the build time is excluded. Changing one stored rating changes the hash. On rebuild, coding state and labels are kept only under the IM-Q43 rule, and `count_registry` is kept unchanged. | Change one fixture review's rating: `content_sha256` must differ. |

### R-IM03: Jev coding with codebook v2

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q14 | The codebook is the repo data file `tools/mcp-insight/data/insight-theme-codebook.json`, copied unchanged from the v2 draft (`version 2026-10-26.2`, `status DRAFT`, `approvedBy` and `approvedAt` null). The loader rejects a codebook that is missing `version` or `status`, and returns `CODEBOOK_INVALID`. | A codebook copy without `status` is rejected. |
| IM-Q15 | Block selection. Inputs: the `block_override` argument, the `category_label` argument (the app run table stores no category), and the run keyword (`analysis_research_automation_runs.keyword`). Precedence, first that applies wins:<br>1. `block_override`: `matchBasis = OVERRIDE`. An unknown key gives `BLOCK_UNKNOWN`.<br>2. `category_label` exactly equal to one of a block's `match.categoryLabels`: `matchBasis = CATEGORY_LABEL`.<br>3. Keyword: a block term matches when it occurs as whole words in the NFC-normalized, lowercased run keyword (no letter or digit right before or after it). The longest matched term wins. On equal length, the earlier block in file order wins. `matchBasis = KEYWORD`, `matchedTerm` is that term.<br>4. Otherwise core only: `blockKey = null`, `matchBasis = NO_MATCH`.<br>The result carries `codebookVersion`, `blockKey`, `matchBasis`, `matchedTerm` and `questions_per_call` (core themes plus the block's themes, at most `limits.maxQuestionsPerCall`). | With the real v2 codebook, these must hold:<br>- Override `thoi_trang`, category `Sức Khoẻ`, keyword `canxi`: `thoi_trang`/`OVERRIDE`.<br>- Category `Điện Máy`, keyword `canxi`: `dien_may`/`CATEGORY_LABEL`.<br>- Keyword `canxi`: `thuc_pham`/`KEYWORD`, `questions_per_call = 18`.<br>- Keyword `sữa rửa mặt cho da dầu`: `my_pham` (`sữa rửa mặt` is longer than `sữa`).<br>- Keyword `giày quạt`: `dien_may` (both terms have 4 letters; `dien_may` comes first in the file).<br>- Keyword `cháo yến`: `NO_MATCH` with 16 questions (`áo` is inside a word).<br>- Override `khong_co`: `BLOCK_UNKNOWN`.<br>A mutant that checks the keyword before the category fails the second case. |
| IM-Q16 | `dry_run` defaults to `True`. A dry run returns `eligible_reviews` (an integer: reviews with non-empty text that are not coded under IM-Q43), `already_coded` (an integer), `planned_calls` (an integer: one per eligible review, capped by `max_calls` when given, and by `limits.maxCallsPerRun`) and the block selection. It works without the paid flag and without a key file. Jev calls = 0. | A transport that raises if called: the dry run must not raise. A mutant that returns the list of eligible review IDs instead of the count fails the type check. |
| IM-Q17 | A real run (paid flag set) requires `max_calls`, an integer from 1 to `limits.maxCallsPerRun`; otherwise `MAX_CALLS_INVALID` and no call. The run stops when `max_calls` calls have been made, and returns `stopped: "CAP_REACHED"` and `calls_made`. | Cap 3 on 5 eligible reviews: exactly 3 transport calls. |
| IM-Q18 | The run stops at the first failed call, with no retry. A failed call is: an exception or timeout, HTTP other than 200, bad JSON, wrong `model`, a missing answer, an answer that is not `choice`, choices that do not match the 4 options, a probability outside 0 to 1, a probability sum off 1 by more than `thresholds.probabilitySumTolerance`, or a confidence outside 0 to 1. It returns `stopped: "JEV_THEME_UNAVAILABLE"` (transport, HTTP, JSON) or `"JEV_THEME_INVALID"` (answers), with no partial labels and no coding-state row for that review. Reviews coded before the error keep their labels and state. | An error on call 2 of 5: exactly 2 transport calls, and exactly 1 review has a coding-state row. |
| IM-Q19 | Labels:<br>- P(yes) is the sum of `CO_KHEN + CO_CHE + CO_KE`.<br>- P(yes) ≥ `thresholds.keep` gives a stored label with status `kept`.<br>- `thresholds.unclear` ≤ P(yes) < `keep` gives status `unclear` («chưa rõ»), stored but never counted.<br>- Below `unclear`, no label row.<br>- Polarity is the highest of `CO_KHEN`, `CO_CHE`, `CO_KE` if it is ≥ `thresholds.direction` (`khen`, `che`, `ke`), otherwise `khong_ro_huong`.<br>Each label stores `codebook_version`, `block_key`, P(yes), polarity, and the purchase step `Sau mua` (R-I31: platform reviews are after purchase). The thresholds come from the codebook file, not from code. | P(yes) 0.69 gives `unclear`, which does not count; 0.70 gives `kept`. A codebook copy with `keep = 0.6` makes 0.69 `kept`. |
| IM-Q42 | Label provenance (R-I05). Each label row has NOT NULL `review_id` (a key of `review`) and a text locator: `text_ref` (the `review_text.review_id` it was coded from), `text_start = 0`, `text_end` = the length of that text (Jev codes the whole review), and `text_sha256` = sha256 of that text at coding time. The locator holds offsets and a hash, never text. For every label, `review_text[text_ref]` exists, `text_ref = review_id`, and the sha256 of its text equals `text_sha256`. | Two synthetic reviews R1 and R2, both coded. A mutant that stores R2's locator on R1's label fails the resolve check. A label inserted without a locator is rejected (NOT NULL). |
| IM-Q43 | Coding state and validity. A table `coding_state(review_id, codebook_version, block_key, text_sha256, status)` gets one `done` row per successfully coded review, whether or not any label passes `unclear`. A review counts as coded only when it has a `done` row whose `codebook_version`, `block_key` and `text_sha256` all equal the current ones. On rebuild, a review whose text changed (same `review_id`, different `text_sha256`) loses its labels and its `done` row and becomes eligible again. A review with unchanged text keeps them. | (a) 5 reviews whose fake answers are all `KHONG_NHAC`: after the paid run, a second dry run has `planned_calls = 0`, and `theme_counts` is not `NOT_CODED`. (b) Same ID, changed text, rebuild: `planned_calls` goes from 0 to 1, and the old labels are gone. A mutant that keeps labels by `review_id` alone fails (b). |
| IM-Q20 | The request body for one review holds only: the review text, platform, product name, block label, codebook version, and questions built from the codebook (code, name, include, exclude, the 4 options). It holds no `writer_key`, `review_id`, writer name or product URL. Each call has at most 20 questions. | The fake transport records the body. A fixture writer name and the `writer_key` must not be in it. |
| IM-Q21 | Idempotent: a review that is coded (IM-Q43) is not called again, and `planned_calls` excludes it. A second real run on a fully coded run makes 0 calls. | Code 2 of 5 reviews, then dry run: `planned_calls = 3`. |

### R-IM04: fixed semantic layer

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q22 | SLAYER models are YAML files in the repo (`tools/mcp-insight/semantic/`). Fixed measures: review count, distinct writers, distinct products, distinct keywords. Fixed dimensions: platform, theme, polarity, purchase step, and the portrait dimension and group. No measure name equals a column name of its model, and the loader checks this. Success tests run the real local SLAYER on a synthetic warehouse for every defined measure. | A model copy with a measure named like a column is rejected at load. |
| IM-Q23 | Every count a tool returns is computed twice: once by SLAYER, and once by a fixed reference SQL kept beside the measure. If they match, the numbers are returned. If any value differs, the tool returns `SLAYER_SQL_MISMATCH` and no numbers. | A SLAYER result monkeypatched off by one gives the error, with no rows in the output. |
| IM-Q24 | Agents cannot pass free queries. Tool arguments are typed and validated: `run_id` is a UUID or 8-hex prefix, and a theme filter must be a codebook theme code. Anything else is `INVALID_ARGUMENT`. | Theme `T-GIA' OR 1=1` is rejected. |
| IM-Q25 | The SLAYER storage and datasource are created for each call in a new temporary directory named `insight-slayer-*` under `tempfile.gettempdir()`. They point at the run warehouse and are removed when the call ends, on success and on error. Telemetry is off (IM-Q39, item 3). The repo YAML files are unchanged after a call. | With `TMPDIR` set to an empty test directory: after a successful `theme_counts`, and after one that ends in `SLAYER_SQL_MISMATCH` or a SLAYER exception, the directory holds no `insight-slayer-*` entry. A mutant that skips the cleanup fails. The sha256 of every file in `semantic/` is the same before and after (baseline check). The IM-Q3 network guard stays active during these calls. |

### R-IM05: R-I33 thresholds, ready to use

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q26 | `theme_counts(run_id, question=None)` returns `coded_reviews` (an integer) and one row per (platform, theme code, polarity) that has at least one `kept` label. Polarity is `all`, `khen`, `che`, `ke` or `khong_ro_huong`. Row fields: `platform`, `theme_code`, `theme_name`, `polarity`, `step`, `reviews`, `writers`, `products`, `writer_basis`, `threshold_count`, `threshold_met`, `threshold_note`, `check2_missing`, `check3_missing`, `count_id`. Only `kept` labels count. `question` is an optional theme code filter. A run with no coded review (IM-Q43) returns `NOT_CODED`. A run whose reviews are all coded with no `kept` label returns `coded_reviews` > 0 and an empty row list, not `NOT_CODED`. | An `unclear` label does not change `reviews`. An uncoded run returns `NOT_CODED`. The all-`KHONG_NHAC` run of IM-Q43 returns rows `[]`. |
| IM-Q44 | A kept label with polarity `khong_ro_huong` counts in the `all` row and in a `khong_ro_huong` row of its theme. It does not count in `khen`, `che` or `ke`. | A fake answer `CO_KHEN 0.40, CO_CHE 0.35, CO_KE 0.00, KHONG_NHAC 0.25`: P(yes) 0.75 is kept, and no option reaches 0.5. The theme's `all` and `khong_ro_huong` rows have `reviews = 1`, and there is no `khen` row. A mutant that takes the highest option without the direction threshold makes a `khen` row and fails. |
| IM-Q27 | Review threshold (R-I33): `threshold_met` is true only when `threshold_count` ≥ 5 and `products` ≥ 3, where `threshold_count` is `writers` when `writer_basis = "writer"` and `reviews` when `writer_basis = "review"` (IM-Q28). Otherwise `threshold_note` contains «dưới ngưỡng». | All named writers: 4 writers on 3 products gives false with «dưới ngưỡng»; 5 on 2 gives false; 5 on 3 gives true. |
| IM-Q28 | `writers` is always the honest count of distinct `writer_key`. If any review in a row has `writer_known = 0`:<br>- `writer_basis = "review"` and `threshold_count = reviews`.<br>- The note includes «đếm theo đánh giá, nguồn không có tên người viết».<br>- `check2_missing = true`.<br>If every review in the row has a known writer: `writer_basis = "writer"`, `threshold_count = writers`, `check2_missing = false`. | Three fixtures, each on 3 products:<br>- Named only: TikTok Shop, 5 reviews by 2 named writers. Expect `writers = 2`, basis `writer`, false.<br>- Mixed: TikTok Shop, 4 reviews by one named writer plus 1 review with no name. Expect `reviews = 5`, `writers = 2`, basis `review`, `threshold_count = 5`, true, the note, `check2_missing = true`.<br>- Unknown only: Shopee, 5 reviews. Expect `writers = 5`, basis `review`, true.<br>A mutant that always compares `writers` fails the mixed case. |
| IM-Q29 | There is no cross-platform total (R-I06). Every row has exactly one platform, `shopee` or `tiktok_shop`. No row has another platform value or a null platform. No row or result has a field that combines platforms (such as `total`, `all_platforms` or `combined`). A theme present on both platforms gives separate rows. | (a) Theme T on Shopee in 6 reviews and on TikTok Shop in 3: exactly `(shopee, T, all).reviews = 6` and `(tiktok_shop, T, all).reviews = 3`, and no other `(T, all)` row. (b) Theme U on Shopee only (5 reviews): one row `(shopee, U, all).reviews = 5` and no TikTok Shop row. A valid module passes (b). (c) A mutant that adds a row with platform `all` or a `total` field fails. |
| IM-Q30 | `count_id` is `IMC-` + 12 hex of sha256 over the canonical JSON of: the run ID, the tool, the row key (platform, theme or group key, polarity), the rules version (codebook version for themes, keyword-group version for keywords, portrait rules version for portraits), the row's numbers (`reviews`, `writers`, `products`, `keywords`, `threshold_count`, `threshold_met`, `check2_missing`, `check3_missing` where present), and `state_sha256`. `state_sha256` is the sha256 of `content_sha256` plus an ordered dump of the label and coding-state rows. Each ID is stored with its row key and numbers in the warehouse table `count_registry` (insert if new). If an existing ID has different stored numbers, the tool returns `COUNT_ID_CONFLICT` and no numbers. Old IDs stay in the registry with their old numbers after the data changes, so a stale reference still resolves to what it said. The same call twice on the same state gives the same IDs. IDs are unique within a response. | Move one fixture label to an existing (platform, theme, polarity) row, with the source data unchanged (same `content_sha256`). That row's `reviews` and its `count_id` change. The old ID is still in `count_registry` with its old numbers. A mutant that hashes only the source hash and the row key keeps the same ID and fails. |
| IM-Q31 | `keyword_counts(run_id)` takes the run's search-suggestion texts (IM-Q8), normalizes each (NFC, lower case, trimmed, runs of whitespace collapsed to one space), deduplicates, and assigns each distinct keyword to exactly one group from `tools/mcp-insight/data/keyword-groups.json` (frozen below). Groups are tried in file order, and the first matching regex wins. A keyword that matches no group goes to `khac`. It returns `keyword_groups_version`, `keyword_groups_status`, one row per group with at least one keyword, and `step_totals`. Row fields: `platform` (`google`), `group_key`, `group_name`, `step`, `keywords`, `threshold_met` (`keywords` ≥ 5), `threshold_note` («dưới ngưỡng» when false), `count_id`. `step_totals["Quan tâm"]` is the number of distinct keywords in groups whose step is `Quan tâm`. Keywords in `cach_dung` and `khac` (step `Chưa rõ bước`) are never added to any step total. | Use the membership examples in the frozen definitions.<br>- 4 distinct `co_nen` keywords: false with «dưới ngưỡng». 5: true.<br>- `Canxi  CHO BÉ` and `canxi cho bé` count once.<br>- A run whose only keywords are `cách uống kẽm` and `uống canxi lúc nào tốt nhất` gives one `cach_dung` row with 2, and `step_totals["Quan tâm"] = 0`.<br>A mutant that tries `loai_nao` before `cach_dung` puts `uống canxi lúc nào tốt nhất` in `loai_nao` and fails. |
| IM-Q32 | `check3_missing` is one-way in PR 1. When the codebook `status` is not `APPROVED`, every `theme_counts` row has `check3_missing = true`. PR 1 has no source of evidence that a human reviewed a sample (R-I32 check 3), so `check3_missing` is also `true` when `status` is `APPROVED`. The non-missing branch is left to the later confidence work (R-IM08). | (a) The real DRAFT codebook: every row has `check3_missing = true`. (b) A copy changed only to `status: APPROVED` (`approvedBy` and `approvedAt` still null): every row still has `check3_missing = true`. A mutant that reads only `status` fails (b). |

### R-IM06: customer portrait, totals only

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q33 | `portrait_counts(run_id)` returns, per platform, group rows for two dimensions. The text read is `nz(comment + "  " + "  ".join(attributes))`, where `nz` is NFC then lower case and the joiner is two spaces. Groups use script 6's labels (`6-tao-sqlite-nhan.py`, 25/10/2026). Script 1 has the same regexes with two longer display labels.<br>- «Ai dùng»: only for reviews whose text contains `đối tượng sử dụng`. The value is the first match of the field regex (it ends at `công dụng`, `màu sắc`, `chất liệu`, `đúng với mô tả`, `hương vị`, two spaces, or the end). The review gets **every** G group whose regex matches the value. If none matches, it gets «Khác / không rõ».<br>- «Mua cho ai»: the review gets **every** W group whose regex matches the whole text. If none matches, it gets no row in this dimension.<br>Each group row has `dimension`, `group`, `reviews`, `writers` (distinct `writer_key`), `products`, `writer_basis`, `threshold_count`, `threshold_met`, `threshold_note` and `count_id`, with the IM-Q27 and IM-Q28 rules. | Synthetic single-review cases, with the expected groups:<br>- `zq1 ok  Đối tượng sử dụng: Bà bầu, trẻ em`: Ai dùng {Bà bầu, sau sinh, cho con bú; Trẻ em, học sinh}.<br>- `ĐỐI TƯỢNG SỬ DỤNG: người lớn  Công dụng: cho trẻ em`: Ai dùng {Người lớn, trưởng thành} only.<br>- `đối tượng sử dụng: xyz`: {Khác / không rõ}.<br>- `zq2 mua cho mẹ và cho con dùng`: no Ai dùng row; Mua cho ai {Mua cho bố mẹ, ông bà; Mua cho con, bé}.<br>- `zq4 mình uống thấy ổn`: Mua cho ai {Tự dùng}.<br>- `zq3 không có gì`: no row in either dimension.<br>A first-match mutant drops «Trẻ em, học sinh» from case 1 and fails. A test that compares the module's constants with the reference regex tables is an extra check, not the oracle. |
| IM-Q34 | Gender and birth year are guessed once per distinct known writer (`writer_known = 1`), at build time from the raw name in memory, and stored only as `writer_guess(writer_key, gender, age_band, year_basis)`. The rules are exactly those of `6-tao-sqlite-nhan.py`:<br>- Gender: `s = re.sub('[^a-z]', '', name.lower())`. Lists F and M, with the ambiguous set = (F ∩ M) ∪ {anh, thanh, hai, ha, tien, dung, khanh, binh, van}. Only names of at least 4 letters outside the ambiguous set are kept. The result is `Nữ` if s contains a kept F name and no kept M name, `Nam` in the opposite case, otherwise `Không đoán được`.<br>- Birth year: first `(19[5-9]\d\|200[0-8])(?!\d)` on the raw name. Otherwise `(?<!\d)([6-9]\d\|0[0-8])$`, read as 1900+v when v ≥ 60, else 2000+v. Otherwise none.<br>- Age band: age = run year − birth year, where the run year is the UTC year of `analysis_research_automation_runs.created_at`. Bands: `Dưới 20`, `20–29`, `30–39`, `40–49`, `50 trở lên`, and `Không đoán được` when there is no year.<br>Output per platform: rows `{dimension: "Giới"\|"Nhóm tuổi", group, writers}` for groups with at least 1 writer. Each dimension's `writers` add up to the platform's distinct known writers. Every gender and age row has `label = "Giả thuyết"` and `max_confidence = "Yếu"`. | TikTok Shop fixture, run created in 2026, with synthetic names: `huyentran1992` (3 reviews), `minhquan05`, `abc2010`, `xyz19501`, `anhthu88`, `trangtuan`, `thanhha1949`, `ngocmai2008x`, `kim07`, plus one masked `a*****b` and one null name. Expected: 9 known writers.<br>- Giới: Nữ 3, Nam 1, Không đoán được 5.<br>- Nhóm tuổi: Dưới 20 2, 20–29 1, 30–39 2, Không đoán được 4.<br>Mutants that each fail: no per-writer dedup (Nữ 5); an unbounded `\d{4}` year (`abc2010` in Dưới 20); a 4-digit match without `(?!\d)` (`xyz19501` in 50 trở lên); a missing ambiguous set (`anhthu88` in Nữ); a removed `Giả thuyết` label. |
| IM-Q35 | A platform with no known writer (Shopee, or TikTok Shop where every name is missing or masked) gets `"Chưa có dữ liệu"` for gender and age, with no numbers. | A Shopee-only fixture, and the IM-Q41 TikTok Shop fixture, have no numeric gender or age rows. |
| IM-Q36 | No per-person result: the output has no `writer_key`, review ID, name or list keyed by person. The warehouse stores guesses only per `writer_key` (never the name). | Scan the output for every fixture name, `writer_key` and review ID. A mutant that returns a per-writer list fails the scan. |
| IM-Q37 | The portrait counts go through the same SLAYER and SQL comparison as IM-Q23. | A mismatch monkeypatch on a portrait measure returns `SLAYER_SQL_MISMATCH`. |

## Frozen keyword groups (IM-Q31 oracle)

The file `tools/mcp-insight/data/keyword-groups.json` holds exactly this data. It has `version: "kwg-2026-10-30.1"`,
`status: "UNREVIEWED"`, `approvedBy: null` and `approvedAt: null`. These groups were written for this MCP. **They are
not reviewed and not owner-approved.** `keyword_counts` returns `keyword_groups_status` so that agents see this.

Groups are listed in match order. Regexes are Python `re` syntax, matched with `re.search` on the normalized keyword.

| Order | `group_key` | `group_name` | `step` | Regex |
|---|---|---|---|---|
| 1 | `tac_dung_phu` | Tác dụng phụ, an toàn | Quan tâm | `tác dụng phụ\|có hại\|có độc\|nóng trong\|táo bón\|sỏi thận\|an toàn không\|nguy hiểm` |
| 2 | `so_sanh` | So sánh | Quan tâm | `so sánh\|\bvs\b\|khác gì\|khác nhau\|hay hơn\|tốt hơn` |
| 3 | `cach_dung` | Cách dùng, khi nào dùng | Chưa rõ bước | `cách uống\|cách dùng\|cách sử dụng\|uống lúc nào\|uống khi nào\|khi nào\|lúc nào\|liều\|bao nhiêu viên\|mấy viên\|uống bao lâu\|trước hay sau\|hướng dẫn` |
| 4 | `cho_ai` | Cho ai dùng | Quan tâm | `cho bà bầu\|bà bầu\|mẹ bầu\|sau sinh\|cho bé\|trẻ em\|trẻ sơ sinh\|cho trẻ\|người già\|người cao tuổi\|người lớn tuổi\|cho mẹ\|cho con\|tuổi dậy thì` |
| 5 | `co_nen` | Có nên dùng | Quan tâm | `có nên\|có tốt không\|có tác dụng không\|có hiệu quả\|có thật không\|review\|đánh giá` |
| 6 | `loai_nao` | Loại nào, hãng nào | Quan tâm | `loại nào\|loại gì\|hãng nào\|nào tốt\|tốt nhất\|thương hiệu\|của nhật\|của mỹ\|của úc\|của đức\|dạng nước\|dạng viên\|dạng sữa\|nano\|hữu cơ` |
| none | `khac` | Khác | Chưa rõ bước | (no group matched) |

(In the table, `\|` is a regex `|`.)

Membership examples (synthetic keywords and the group each must get):

| Keyword | Group | Why |
|---|---|---|
| `canxi có tác dụng phụ không` | `tac_dung_phu` | |
| `canxi nano vs canxi hữu cơ` | `so_sanh` | `so_sanh` comes before `loai_nao` (`nano`) |
| `uống canxi lúc nào tốt nhất` | `cach_dung` | `cach_dung` comes before `loai_nao` (`tốt nhất`) |
| `canxi cho bà bầu uống khi nào` | `cach_dung` | `cach_dung` comes before `cho_ai` |
| `canxi cho bà bầu loại nào tốt` | `cho_ai` | `cho_ai` comes before `loai_nao` |
| `kẽm cho bé loại nào tốt` | `cho_ai` | |
| `có nên uống canxi` | `co_nen` | |
| `review canxi nano` | `co_nen` | `co_nen` comes before `loai_nao` |
| `canxi loại nào tốt` | `loai_nao` | |
| `canxi của nhật` | `loai_nao` | |
| `cách uống kẽm` | `cach_dung` | |
| `canxi giá bao nhiêu` | `khac` | no group matches |

## Open questions (assumptions in this table)

1. `theme_counts(run_id, question)`: the spec does not define `question`. This table reads it as an optional theme
   code filter.
2. «Gợi ý tìm kiếm» is read from the Google search captures (`related_searches`, `related_questions`). The keyword
   groups above are new data written for this MCP, marked `UNREVIEWED`. They are not owner-approved.
3. Stored Shopee runs have no product name in the artifact store. The name comes from stored Metric rows when present,
   otherwise it stays NULL and the product is keyed by item ID.
4. Purchase step for every review label is `Sau mua` (R-I31). The Jev v2 codebook asks no step question.
5. The design assumption for `writer_known = 0` (design decision 3) is applied per row: one unnamed review in a row
   switches that row to the review basis, and the threshold then uses the review count (IM-Q28 mixed case). This is
   the more lenient reading. The other reading (count only the named writers) is the owner's to choose.
6. Stopping at the first Jev error (R-IM03) replaces the one-retry rule of the Jev v2 spec (section 8).
7. The app run table stores no category label, so the category input of block selection is the `category_label`
   argument (IM-Q15). The v2 `blockSelection.inputs` also lists `keyword2` and `interviewProductType`. PR 1 reads
   only the run's one stored keyword.
8. `check3_missing` is always `true` in PR 1 (IM-Q32). An `APPROVED` status alone is not proof that a human reviewed
   a sample. The evidence needed for the non-missing branch is to be defined with R-IM08.
9. Label locators cover the whole review (`text_start = 0`, `text_end` = text length), because Jev codes the whole
   review and returns no span (IM-Q42).

## Review findings applied (revision 2)

| Finding | Severity | Rows |
|---|---|---|
| 1 Read-only artifact store, app write API, flags and config | must-fix | IM-Q38, IM-Q39 (new) |
| 2 No review text in results, errors and logs; counts not lists | must-fix | IM-Q40 (new), IM-Q4, IM-Q10, IM-Q16 |
| 3 Mixed writer rows and the review fallback | must-fix | IM-Q27, IM-Q28, open question 5 |
| 4 `count_id` bound to the coded state and the row numbers | must-fix | IM-Q30 |
| 5 Label source locator (R-I05) | must-fix | IM-Q42 (new) |
| 6 One-way check 3 | must-fix | IM-Q32, open question 8 |
| 7 Portrait grouping matches all groups, exact labels and fixtures | must-fix | IM-Q33 |
| 8 Exact demographic rules, run year, writer dedup | must-fix | IM-Q34 |
| 9 Frozen keyword groups | must-fix | IM-Q31, frozen keyword groups section |
| 10 Missing names on any platform | must-fix | IM-Q41 (new), IM-Q35 |
| 11 Input-schema check | should-fix | IM-Q1 |
| 12 Real creating-open mutant and env selection | should-fix | IM-Q6 |
| 13 SLAYER temp cleanup on success and error | should-fix | IM-Q25 |
| 14 Block selection precedence fixtures | should-fix | IM-Q15 |
| 15 Labels invalid when source text changes | should-fix | IM-Q43 (new), IM-Q13 |
| 16 Completion without labels, unclear polarity | should-fix | IM-Q43, IM-Q44 (new), IM-Q26 |
| 17 Platform rows checked structurally | should-fix | IM-Q29 |
