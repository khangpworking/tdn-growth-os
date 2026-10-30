# tdn-insight contract rows, PR 1 (R-IM01 to R-IM06) and PR 2 (R-IM07 to R-IM09)

Source of truth: `openspec/changes/insight-mcp-v1` (spec, design decisions 1 to 5), `openspec/changes/insight-method-v1`
(R-I30 to R-I34, R-I37, R-I39) and `openspec/specs/insight-report/spec.md` (R-I05, R-I06, R-I11). This table is what the tests
are written from. Each row names one behavior and one negative control: an input or a one-check-removed module copy
(a mutant) that must make the row's test fail or flip its result.

Revision 2 (30/10/2026) applies the 17 findings of the table review. Revision 3 (30/10/2026) applies the re-review
findings R2-1 to R2-5 and R2-7. R2-6 was an owner decision (open question 5), settled as IMCP-O1 in revision 5. Revision 4 (30/10/2026) applies the
owner scope update F310 (tasks 2.7 and 2.8): the three logistics themes Giao hàng, Đóng gói and Dịch vụ shop are
dropped. It also applies the re-review finding R3-1. Revision 5 (30/10/2026) applies the owner's answer IMCP-O1 (IM-Q27,
IM-Q28, IM-Q50). Revision 6 (30/10/2026) applies the owner update F311: the looks of packaging belong to
`T-THIETKE` (codebook `2026-10-30.2`, IM-Q51). Revision 7 (30/10/2026) moves the codebook to `2026-10-30.3` (owner
update F312, theme definitions only); no row's behavior changes. Revision 8 (30/10/2026, PR 2) adds rows IM-Q52 to
IM-Q72 for R-IM07 to R-IM09 and moves the codebook to `2026-10-30.4` (owner update F311, one overlap line; closes open
question 15). Old rows are not renumbered. All mappings are at the end of this file.

Out of scope for PR 1: R-IM07 to R-IM12. PR 2 adds R-IM07 to R-IM09 (`report_plan`, `confidence_ceiling`,
`find_reason_links`, `read_reviews`). Out of scope for PR 2: R-IM10 to R-IM12 (`submit_section`, `submit_statement`,
`render_report`).

## Conventions used by the rows

- Module `tools/mcp-insight/insight_tools.py`, FastMCP server name `tdn-insight`, stdio only.
- Environment:
  - `INSIGHT_MCP_APP_DB`: the app SQLite file. Required by `build_warehouse`. It has no default.
  - `INSIGHT_MCP_APP_ARTIFACTS`: the artifact root (`sha256/<2 chars>/<sha>`). Default: `artifacts/` next to the app DB.
  - `INSIGHT_MCP_APP_CAPTURES`: the app's metric capture root, which holds the run scope record
    `<capture root>/<run_id>/scope.json`. Default: `metric-captures/` next to the app DB (the app's own default when
    `TDN_METRIC_CAPTURE_DIR` is unset). Read only.
  - `INSIGHT_MCP_DATA_DIR`: where the run warehouses live. Default: `tools/mcp-insight/out/` (gitignored).
  - `INSIGHT_MCP_ALLOW_PAID`: exactly `1` allows a real Jev call. Any other value refuses.
  - `INSIGHT_MCP_JEV_KEY_FILE`: key file holding a `TYPESAFE_API_KEY=` line. Default: the project secret file under
    `~/.config/tdn-growth-os/secrets/`.
- "App home" in the rows means the app DB file, its `-wal`/`-shm` siblings, the artifact root, the capture root with
  its scope records, and every other file in the app DB's directory (for example a synthetic config file or `.env` in a
  fixture).
- Warehouse: one SQLite file per run, `<data dir>/runs/<run_id>.sqlite`.
- Platforms: `shopee` and `tiktok_shop` for reviews, `google` for keywords and Trends.
- The Jev transport is one injectable function. Tests replace it with a fake that counts calls and records request
  bodies. There is no real network in any test. Fake-transport tests of the paid branch are offline checks, not Jev
  calls.
- Fixtures are synthetic. They contain no real review text, names or IDs. Every synthetic review text contains a
  unique nonce token (for example `zqv01`). Some reviews are short (the nonce plus one or two words), so a leak check
  can find a whole short review, not only long runs of words.
- The five PR 1 tools and their only arguments (PR 2 adds four tools, IM-Q52):
  - `build_warehouse(run_id)`.
  - `code_reviews(run_id, dry_run=True, max_calls=None, block_override=None)`.
  - `theme_counts(run_id, question=None)`.
  - `keyword_counts(run_id)`.
  - `portrait_counts(run_id)`.
- Errors are returned as `{"error": "<CODE>", "message": "<text>"}`. An error result has no count fields.

## Contract rows

### R-IM01: local, read-only app, paid flag, key from file

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q1 | The server is named `tdn-insight` and runs over stdio. The registered tools are exactly the five tools above (PR 2: plus the four tools of IM-Q52). The MCP input schema of each tool has exactly the argument names listed above, with these types: `run_id` string, `dry_run` boolean, `max_calls` integer or null, `block_override` and `question` string or null. No argument takes SQL, a SLAYER query, a measure or a formula. | Two mutants, two separate assertions. A mutant that adds a tool `query` fails the tool-name-set test. A mutant that adds a `sql` argument to `theme_counts` (tool names unchanged) fails the per-tool input-schema test. |
| IM-Q2 | The app DB is opened only as `file:<path>?mode=ro` (URI). An `INSERT` through the module's app connection raises `sqlite3.OperationalError` (read-only). After `build_warehouse`, the app DB file's sha256 is unchanged and no `-wal` or `-journal` file was created by the module. | A mutant that opens with `mode=rw`: the `INSERT` succeeds, and the test must fail. |
| IM-Q3 | `build_warehouse`, `code_reviews(dry_run=True)`, `theme_counts`, `keyword_counts` and `portrait_counts` open no socket and resolve no host (audit hook). The module never binds or listens on a port. | A mutant that does a DNS lookup inside `code_reviews(dry_run=True)`: the audit hook trips. |
| IM-Q4 | `code_reviews(run_id, dry_run=False, max_calls=N)` without `INSIGHT_MCP_ALLOW_PAID` set to exactly `1` (unset, `true`, ` 1`, `0`) returns `refused: true`, `reason: "PAID_FLAG_MISSING"`, `eligible_reviews` (an integer count) and `planned_calls` (an integer). The Jev transport is called 0 times and the key file is not opened. | With the flag set to `1`, a key file present and a fake transport, the same call reaches the transport. This proves that the flag is what blocks. |
| IM-Q5 | The key is read in-process from `INSIGHT_MCP_JEV_KEY_FILE`. The key value never appears in a tool result, an error message, stdout, stderr, a log line or a warehouse file. A missing key or file gives `JEV_KEY_MISSING` without echoing the file contents. | A synthetic key and a fake transport that raises an error containing the `Authorization` header. The tool output must still not contain the key. A mutant that passes the raw exception text through fails the test. |
| IM-Q6 | No machine path is written in code. An unset `INSIGHT_MCP_APP_DB` gives `APP_DB_NOT_SET`. A path that does not exist gives `APP_DB_NOT_FOUND`, and no file is created at that path. The DB named by `INSIGHT_MCP_APP_DB` is the one read: with two synthetic app DBs A (run `aaaaaaaa-…`) and B (run `bbbbbbbb-…`), setting the variable to B makes `build_warehouse("bbbbbbbb")` succeed and `build_warehouse("aaaaaaaa")` give `RUN_NOT_FOUND`. | (a) A mutant that drops the existence check and opens with `sqlite3.connect(path)` (which creates a missing file): the test asserts the missing path still does not exist, so the mutant fails. (b) A mutant that ignores the variable and reads DB A fails the A/B selection test. |
| IM-Q38 | The app artifact store is read-only. Artifact files are opened for reading only. After every in-scope tool call, the artifact root has the same file names, sizes and sha256 bytes as before. This includes the failure paths `RUN_NOT_FOUND`, `RUN_AMBIGUOUS`, a missing artifact (`ARTIFACT_MISSING`) and `SLAYER_SQL_MISMATCH`. | A mutant that truncates one source artifact after reading it, and a mutant that writes a cache file into the artifact root. Both fail the before/after check. |
| IM-Q39 | No app write path and no flag change. (1) The module writes files only under `INSIGHT_MCP_DATA_DIR` and its own per-call temporary directories (audit hook on `open` with a write mode, `os.rename`, `os.remove`, `shutil` moves). (2) It never calls the app's write API: it opens no socket (IM-Q3), imports nothing from the app's `src/`, and starts no subprocess (audit hook on `subprocess.Popen`, `os.system`, `os.exec*`, `os.posix_spawn`). (3) Module import sets `DO_NOT_TRACK=1` and `SLAYER_USAGE_REPORTING=off` for its own process before SLAYER is imported. After import, no tool call changes `os.environ`, and no `TDN_*` variable is ever written. (4) The app home (DB, siblings, artifacts, a synthetic config file and `.env`) is byte-identical before and after every tool call, on success and on every failure path in IM-Q38. | A mutant that sets `os.environ["TDN_RESEARCH_JEV_ENABLED"]` in `code_reviews`, a mutant that appends a line to the synthetic `.env`, and a mutant that starts `subprocess.run(["true"])` in `build_warehouse`. Each fails its check. |
| IM-Q40 | No customer review text leaves `review_text`. For the five tools, on success and on every error path, none of these contains any fixture review nonce, any whole short review, any 8-word run of a long review, or any fixture writer name: the JSON result, the error `message`, captured stdout, captured stderr, and captured `logging` records. The dry-run and refusal fields (`eligible_reviews`, `planned_calls`, `already_coded`) are integer counts, never lists of reviews. | A mutant that logs the comment of the first eligible review at INFO, and a mutant that puts a short review's text into a label row's `note` field. Both fail the scan. |

Note to IM-Q39, item 4 (owner update IMCP-P1E, 30/10/2026): the app runs its DB in WAL mode, and even a `mode=ro` reader changes `app.sqlite-shm`. So no tool opens the live app DB with SQLite. Each call copies `app.sqlite` and, when present, `app.sqlite-wal` with plain byte reads into its own `insight-app-*` temporary directory, opens the copy as `file:<copy>?mode=ro` (the IM-Q2 connection), and requires `PRAGMA quick_check` to return `ok`. A failed check is retried with a fresh copy up to 3 times, then the call returns `SOURCE_SNAPSHOT_FAILED`. The copy is removed when the call ends. Test: on a WAL fixture with an open writer and rows committed only in the WAL, `build_warehouse` reads those rows, and `app.sqlite`, `-wal` and `-shm` are byte-identical afterwards. NC: the old `mode=ro` open of the live DB fails that test.

### R-IM02: run warehouse

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q7 | `build_warehouse(run_id)` accepts a full run UUID or an 8-hex prefix that matches exactly one run. If no run or more than one run matches, it gives `RUN_NOT_FOUND` or `RUN_AMBIGUOUS` and no warehouse file is created. | A prefix shared by two fixture runs gives `RUN_AMBIGUOUS` and no file. |
| IM-Q8 | Sources read, all stored data only:<br>- Shopee reviews: `foundation_shopee_collections` with `run_key = 'auto-<run_id>'`, then the collection artifact, then the `pages[]` row artifacts.<br>- TikTok Shop reviews: captures with operation `kalodata.product.comment.insight`, `original_comments[]` in the base64 response.<br>- Search suggestions: captures `serpapi.google.search`, `related_searches[].query` and `related_questions[].question`.<br>- Trends by province: captures `serpapi.google.trends` with `data_type = GEO_MAP*`, `interest_by_region[]`.<br>- Product names: `kalodata.product.detail` `product_name` (TikTok Shop), and the Shopee name from stored Metric rows (`product_base_id = 1__<item>__<shop>`) when one is stored, otherwise NULL.<br>- Run facts: `analysis_research_automation_runs.keyword` and `created_at`.<br>- Run scope record (read only, when present): `<capture root>/<run_id>/scope.json` with `contractVersion` `autorun-scope-record-v1` or `-v2` and a matching `runId`. From it, the applied scope, by the app's `usedScope` rule (`src/modules/analysis/research-automation/autorun-scope.ts`, `usedScope`): when `capture2.outcome` is `OK`, the applied keywords are `capture2.keywords` and the applied category is `capture2.category` (none when it is null), from capture 2. In every other case (`capture2` null, or outcome `AWAITING_KEYWORD2`, `PENDING` or `CATEGORY_NOT_SELECTABLE`), the applied keywords are `[keyword1]` and there is no applied category, from capture 1. A proposed keyword 2 or category that was not applied is never used as a coding input. The warehouse also stores the category evidence `category.category.label` and its `reason`, kept apart from the applied category and never used for block selection. A run without the file has no applied category, and its keyword is the run table's `keyword`. A file that exists but does not parse or does not match the run gives `SCOPE_RECORD_INVALID` and no warehouse.<br>The result returns counts per platform and per source. A source with no stored capture is reported as `"Chưa có dữ liệu"`, not 0. | A capture belonging to a second fixture run must not appear in the first run's warehouse. A run with no TikTok capture reports `tiktok_shop` as `"Chưa có dữ liệu"`, not `0`. |
| IM-Q9 | Writer rules:<br>- A Shopee review (no writer name stored) gets `writer_known = 0` and `writer_key = review_id`.<br>- A TikTok Shop review with a usable name gets `writer_known = 1` and `writer_key = "w:" +` the first 16 hex characters of sha256 of the NFC-normalized, case-folded, trimmed name.<br>- An anonymous TikTok Shop review (`is_anonymous` true, or a name containing `*`) gets `writer_known = 0` and `writer_key = review_id`.<br>The raw name is never stored. | Two TikTok reviews by the same name share one `writer_key`, and a third name differs. A masked name such as `a*****b` must not get `writer_known = 1`. |
| IM-Q41 | A missing writer name is unknown, on every platform. If the name field is absent, `null`, empty or only whitespace (on TikTok Shop as well as Shopee), the review gets `writer_known = 0` and `writer_key = review_id`, and no gender or year guess is made for it. | A TikTok Shop fixture with two reviews, one with `review_user.name = null` and one with `""`, gives two different `writer_key` values (both review IDs) and `writer_known = 0`. `portrait_counts` gives `"Chưa có dữ liệu"` for TikTok Shop gender and age (IM-Q35). A mutant that hashes the empty name gives one shared key and fails. |
| IM-Q10 | Customer text (the review comment plus the Shopee attribute lines) is stored only in the table `review_text(review_id, text)`. No other table has a column named `text`, `comment`, `name`, `user` or `attributes`. Scan every TEXT cell of every table and view except `review_text`, including the label, coding-state and `count_registry` tables. No cell contains any fixture review nonce, any whole short review, any 8-word run of a long review, or any fixture writer name. Google keyword text, product names and the coded group labels are not customer review text and may be stored. | A mutant that also writes the comment into `review`, and a mutant that writes a short review (`zqv07 ok`) into a label `note` column. Both fail the scan (spec scenario «Chữ khách trong bảng nhãn»). |
| IM-Q11 | Each review keeps its own platform. `review_id = "<platform>:<source review id>"`, and `platform` is never NULL. The same source review ID on two platforms gives two rows. | A fixture with the same source ID on Shopee and TikTok Shop must give 2 rows, not 1. |
| IM-Q12 | Shopee rows are read from the collection's `pages[]` only. Rows repeated across pages collapse to one by `reviewId`. Reviews in a listing's `excluded[]` are not stored. | A fixture with one review on two pages stores 1 row. |
| IM-Q13 | Determinism: two builds on the same app DB give the same `content_sha256`. The hash is taken over an ordered dump of the source tables (`review`, `review_text`, keywords, Trends, products, run facts), and the build time is excluded. Changing one stored rating changes the hash. On rebuild, coding state and labels are kept only under the IM-Q43 rule, and `count_registry` is kept unchanged. | Change one fixture review's rating: `content_sha256` must differ. |

### R-IM03: Jev coding with codebook v2

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q14 | The codebook is the repo data file `tools/mcp-insight/data/insight-theme-codebook.json`, copied from the v2 draft `version 2026-10-30.4` (`status DRAFT`, `approvedBy` and `approvedAt` null). The JSON content is unchanged; the file is stored with LF line endings (the draft has CRLF). It has 13 core themes, 5 blocks (`thuc_pham` 2 themes, `dien_may` 3, `thoi_trang` 1, `my_pham` 4, `gia_dung` 2) and an `excluded` list with `T-GIAOHANG`, `T-DONGGOI` and `T-DICHVU`. Under F311, `T-THIETKE` includes the looks of packaging, and the `T-DONGGOI` entry keeps only the packing itself (IM-Q51). The loader rejects a codebook that is missing `version` or `status`, and returns `CODEBOOK_INVALID`. The excluded themes are handled by IM-Q46 to IM-Q48. | A codebook copy without `status` is rejected. The repo file has `version = 2026-10-30.4` and 13 core theme codes, none of them in the `excluded` list. |
| IM-Q15 | Block selection (R-IM03 order). Inputs: the owner's `block_override` argument, the run's applied category (IM-Q8) and the run's applied keywords (IM-Q8). There is no caller category argument. The category evidence and a proposed keyword 2 or category that was not applied are not inputs. Precedence, first that applies wins:<br>1. `block_override`: `matchBasis = OVERRIDE`. An unknown key gives `BLOCK_UNKNOWN`.<br>2. The applied category exactly equal to one of a block's `match.categoryLabels`: `matchBasis = CATEGORY_LABEL`. An applied category that matches no block falls through to step 3.<br>3. Keywords: a block term matches when it occurs as whole words in an NFC-normalized, lowercased applied keyword (no letter or digit right before or after it). The longest matched term over all applied keywords wins. On equal length, the earlier block in file order wins. `matchBasis = KEYWORD`, `matchedTerm` is that term.<br>4. Otherwise core only: `blockKey = null`, `matchBasis = NO_MATCH`.<br>The result carries `codebookVersion`, `blockKey`, `matchBasis`, `matchedTerm` and `questions_per_call` (core themes plus the block's themes, at most `limits.maxQuestionsPerCall`). | With the real v2 codebook and synthetic runs, these must hold:<br>- Override `thoi_trang`, applied category `Sức Khoẻ` (outcome `OK`), keyword `canxi`: `thoi_trang`/`OVERRIDE`.<br>- Applied category `Điện Máy` (outcome `OK`), keywords `[canxi]`, no override: `dien_may`/`CATEGORY_LABEL`.<br>- No scope file, run keyword `canxi`: `thuc_pham`/`KEYWORD`, `questions_per_call = 15`.<br>- Applied category `Đồ Chơi` (outcome `OK`, no block has it), keywords `[canxi]`: `thuc_pham`/`KEYWORD`.<br>- Outcome fixtures (R3-1). Each has `keyword1 = canxi`, `capture2.keywords = [canxi, sữa rửa mặt]`, `capture2.category = Làm Đẹp` and category evidence `Làm Đẹp`:<br>&nbsp;&nbsp;- `AWAITING_KEYWORD2`, `PENDING` and `CATEGORY_NOT_SELECTABLE` each give `thuc_pham`/`KEYWORD`, `matchedTerm = canxi`.<br>&nbsp;&nbsp;- `OK` gives `my_pham`/`CATEGORY_LABEL`.<br>&nbsp;&nbsp;- `OK` with `capture2.category = null` gives `my_pham`/`KEYWORD`, `matchedTerm = sữa rửa mặt`.<br>- Run keyword `sữa rửa mặt cho da dầu`: `my_pham` (`sữa rửa mặt` is longer than `sữa`).<br>- Run keyword `giày quạt`: `dien_may` (both terms have 4 letters; `dien_may` comes first in the file).<br>- Run keyword `cháo yến`: `NO_MATCH` with 13 questions (`áo` is inside a word).<br>- Override `khong_co`: `BLOCK_UNKNOWN`.<br>A mutant that checks the keywords before the applied category fails the second case. A mutant that ignores the scope record also fails the second case. A mutant that uses every non-null `capture2` (keywords or category) gives `my_pham` for the three non-`OK` outcomes and fails. A mutant that uses the category evidence as the applied category gives `my_pham`/`CATEGORY_LABEL` for them and fails. |
| IM-Q16 | `dry_run` defaults to `True`. A dry run returns `eligible_reviews` (an integer: reviews with non-empty text that are not coded under IM-Q43), `eligible_by_platform` (an object `{platform: integer}`), `already_coded` (an integer), `planned_calls` (an integer: one per eligible review, capped by `max_calls` when given, and by `limits.maxCallsPerRun`) and the block selection. It works without the paid flag and without a key file. Jev calls = 0. | A transport that raises if called: the dry run must not raise. A mutant that returns the list of eligible review IDs instead of the count fails the type check. |
| IM-Q17 | A real run (paid flag set) requires `max_calls`, an integer from 1 to `limits.maxCallsPerRun`; otherwise `MAX_CALLS_INVALID` and no call. The run stops when `max_calls` calls have been made, and returns `stopped: "CAP_REACHED"` and `calls_made`. | Cap 3 on 5 eligible reviews: exactly 3 transport calls. |
| IM-Q18 | The run stops at the first failed call, with no retry. A failed call is: an exception or timeout, HTTP other than 200, bad JSON, wrong `model`, a missing answer, an answer for a theme code that was not asked (IM-Q47), an answer that is not `choice`, choices that do not match the 4 options, a probability outside 0 to 1, a probability sum off 1 by more than `thresholds.probabilitySumTolerance`, or a confidence outside 0 to 1. It returns `stopped: "JEV_THEME_UNAVAILABLE"` (transport, HTTP, JSON) or `"JEV_THEME_INVALID"` (answers), with no partial labels and no coding-state row for that review. Reviews coded before the error keep their labels and state. | An error on call 2 of 5: exactly 2 transport calls, and exactly 1 review has a coding-state row. |
| IM-Q19 | Labels:<br>- P(yes) is the sum of `CO_KHEN + CO_CHE + CO_KE`.<br>- P(yes) ≥ `thresholds.keep` gives a stored label with status `kept`.<br>- `thresholds.unclear` ≤ P(yes) < `keep` gives status `unclear` («chưa rõ»), stored but never counted.<br>- Below `unclear`, no label row.<br>- Polarity is the highest of `CO_KHEN`, `CO_CHE`, `CO_KE` if it is ≥ `thresholds.direction` (`khen`, `che`, `ke`), otherwise `khong_ro_huong`.<br>Each label stores `codebook_version`, `block_key`, P(yes), polarity, and the purchase step `Sau mua` (R-I31: platform reviews are after purchase). The thresholds come from the codebook file, not from code. | P(yes) 0.69 gives `unclear`, which does not count; 0.70 gives `kept`. A codebook copy with `keep = 0.6` makes 0.69 `kept`. |
| IM-Q42 | Label provenance (R-I05). Each label row has NOT NULL `review_id` (a key of `review`) and a text locator: `text_ref` (the `review_text.review_id` it was coded from), `text_start = 0`, `text_end` = the length of that text (Jev codes the whole review), and `text_sha256` = sha256 of that text at coding time. The locator holds offsets and a hash, never text. For every label, `review_text[text_ref]` exists, `text_ref = review_id`, and the sha256 of its text equals `text_sha256`. | Two synthetic reviews R1 and R2, both coded. A mutant that stores R2's locator on R1's label fails the resolve check. A label inserted without a locator is rejected (NOT NULL). |
| IM-Q43 | Coding state and validity. A table `coding_state(review_id, codebook_version, block_key, input_sha256, status)` gets one `done` row per successfully coded review, whether or not any label passes `unclear`. `input_sha256` is the sha256 of the canonical JSON of the exact Jev inputs of IM-Q20 that come from the data: review text, platform, product name (or null), block key and codebook version. A review counts as coded only when it has a `done` row whose `codebook_version`, `block_key` and `input_sha256` all equal the current ones. On rebuild, a review whose inputs changed (same `review_id`, different `input_sha256`, for example new text or a product name that was NULL and is now stored) loses its labels and its `done` row and becomes eligible again. A review with unchanged inputs keeps them. | (a) 5 reviews whose fake answers are all `KHONG_NHAC`: after the paid run, a second dry run has `planned_calls = 0`, and `theme_counts` is not `NOT_CODED`. (b) Same ID, changed text, rebuild: `planned_calls` goes from 0 to 1, and the old labels are gone. (c) Same ID, same text, product name NULL before and `Sản phẩm thử A` after the rebuild: `planned_calls` goes from 0 to 1. A mutant that keeps labels by `review_id` alone fails (b). A mutant that fingerprints the text only fails (c). |
| IM-Q20 | The request body for one review holds only: the review text, platform, product name, block label, codebook version, and questions built from the codebook (code, name, include, exclude, the 4 options). It holds no `writer_key`, `review_id`, writer name or product URL. Each call has at most 20 questions. | The fake transport records the body. A fixture writer name and the `writer_key` must not be in it. |
| IM-Q21 | Idempotent: a review that is coded (IM-Q43) is not called again, and `planned_calls` excludes it. A second real run on a fully coded run makes 0 calls. | Code 2 of 5 reviews, then dry run: `planned_calls = 3`. |
| IM-Q46 | (Task 2.7, F310.) The codebook has no logistics theme. The module holds the fixed F310 list in code: codes `T-GIAOHANG`, `T-DONGGOI`, `T-DICHVU` and names `Giao hàng`, `Đóng gói`, `Dịch vụ shop, tư vấn` (compared after NFC, case-fold and trim). It does not take this list from the codebook's own `excluded` field. A codebook with a core or block theme whose code or name is on the list gives `CODEBOOK_EXCLUDED_THEME`. This happens at load, before block selection and before any Jev call, in `code_reviews` (dry run and paid) and in `theme_counts`. The error has no count fields. No `coding_target` row is written and no warehouse table changes. A codebook without an `excluded` field that has no listed theme is valid. | Codebook copies, each used by `code_reviews(dry_run=True)`, by a paid call (flag `1`, synthetic key, fake transport) and by `theme_counts`:<br>- (a) `T-GIAOHANG` added back to `core`: `CODEBOOK_EXCLUDED_THEME`, 0 transport calls.<br>- (b) `T-DICHVU` added to block `my_pham`: the same error.<br>- (c) A block theme with code `T-SHIP` and name `Giao hàng`: the same error.<br>- (d) `T-DONGGOI` in `core` and the `excluded` field removed: the same error.<br>- (e) The repo codebook with only the `excluded` field removed: it loads.<br>A mutant that reads the list from the file's `excluded` field fails (d). A mutant that checks codes only fails (c). A mutant that checks only in the paid branch fails the dry-run case of (a). |
| IM-Q47 | (Task 2.7, F310.) Jev is never asked an excluded theme. With the repo codebook, the question codes in each request body are exactly the core codes plus the selected block's codes, in file order. None is an F310 code or name. `questions_per_call` is 15 for `thuc_pham`, 16 for `dien_may`, 14 for `thoi_trang`, 17 for `my_pham`, 15 for `gia_dung` and 13 for `NO_MATCH`. The `exclude` guidance text of a core theme is sent as copied, even where it mentions giao hàng, so the check is on question codes and names, not on substrings of the body. A Jev answer for a code that was not asked (for example `T-GIAOHANG`) is `JEV_THEME_INVALID` (IM-Q18). It stops the run, and no label is stored for that review. | The fake transport records each body for one run per block and one `NO_MATCH` run. A mutant that adds the `excluded` codes to the questions sends `T-GIAOHANG` (and gives 18 for `thuc_pham`), and fails. A fake answer that adds `T-GIAOHANG: CO_KHEN 0.9` to an otherwise valid answer must give `JEV_THEME_INVALID` and no label rows. A mutant that ignores answers that were not asked, and one that stores them as labels, both fail. |
| IM-Q48 | (Task 2.7, F310; spec scenario «Đánh giá chỉ nói về giao hàng».) Reviews that only talk about logistics are still stored, but nothing counts or shows an excluded theme. A logistics-only review is in `review` and `review_text`, and is counted in `build_warehouse` and in `eligible_reviews`. When Jev answers `KHONG_NHAC` for every question, it gets a `done` `coding_state` row and no label, so it carries no theme. Only labels whose `theme_code` is a core or block code of the current codebook count, in both the SLAYER model and the reference SQL (IM-Q23, IM-Q45). The JSON result of each of the five tools contains no F310 code. No row has an F310 name as `theme_name`, `group` or `group_name`. `theme_counts(question="T-GIAOHANG")` is `INVALID_ARGUMENT`. | Fixture: 5 Shopee reviews on 3 products, where R5 is the synthetic logistics-only review `zqv50 giao nhanh`, and the fake transport gives R5 `KHONG_NHAC` everywhere.<br>- Expect: `review` has 5 rows, `eligible_reviews = 5` before the paid run, and R5 has a `done` row and 0 labels.<br>- A label row `T-GIAOHANG` (kept, valid locator, current coding state) inserted directly into the warehouse does not appear in `theme_counts`, and does not change any other row.<br>A mutant without the theme-code restriction shows a `T-GIAOHANG` row and fails. A mutant that drops reviews the codebook cannot place gives `eligible_reviews = 4` and fails. |
| IM-Q51 | (F311; spec scenario «Bao bì bắt mắt».) Packaging looks go to `T-THIETKE`, and packing itself gets no theme. The MCP does not judge review text; Jev does. So PR 1 fixes what Jev is told and how its answers are stored:<br>- The `T-THIETKE` question in every request body carries the repo codebook's `include` and `exclude` text unchanged. `include` has «vẻ ngoài của bao bì, hộp, nhãn: đẹp, xấu, bắt mắt, sang (F311)». `exclude` has «cách gói, chèn, seal, mở hộp (không gán chủ đề, F310)».<br>- No question in the body is about packing (`T-DONGGOI` stays excluded, IM-Q46, IM-Q47).<br>- A review that Jev places in `T-THIETKE` is labelled and counted like any other theme.<br>The `overlaps` list is not part of the request body (IM-Q20), so no row depends on it (open question 15). | Fixture: 5 Shopee reviews on 3 products. Review A is the synthetic `zqv60 hộp đẹp bắt mắt`, with the fake answer `T-THIETKE: CO_KHEN 0.90, KHONG_NHAC 0.10` and `KHONG_NHAC` elsewhere. Review B is the synthetic `zqv61 gói kỹ chèn nhiều`, with `KHONG_NHAC` everywhere.<br>- Expect: A has one kept `T-THIETKE` label with polarity `khen`, and B has a `done` row and no label.<br>- `theme_counts` has `(shopee, T-THIETKE, all).reviews = 1` and `(shopee, T-THIETKE, khen).reviews = 1`, and no row for B.<br>- The recorded `T-THIETKE` question holds both quoted phrases.<br>Mutants that each fail: one that reads a stale codebook copy whose `T-THIETKE` `include` lacks the F311 packaging phrase; one that sends questions without `exclude`; one that adds `T-DONGGOI` back to the questions (fails IM-Q47 as well). |

### Task 2.8: R-I39 text (F310)

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q49 | (R-I39 in `openspec/changes/insight-method-v1/specs/insight-report/spec.md`, task 2.8.) In the R-I39 section (from `### Requirement: R-I39` up to the next `### Requirement:`), the kept list reads exactly `Câu insight SHALL chỉ giữ động cơ và rào cản có trong lời khách: công dụng, giá, quy cách, chất lượng;`, and the section has no `giao hàng` (case-insensitive). Its `- Vì sao:` line ends with the owner's 30/10/2026 sentence. That sentence is byte-equal to the one in the R-IM03 `- Vì sao:` line of `openspec/changes/insight-mcp-v1/specs/insight-mcp/spec.md`: `Ngày 30/10/2026 chủ viết: «bỏ tag, vì nó liên quan đến logistic và thương mại điện tử, không phục vụ insight. Vẫn lấy comment, nhưng không hiện và tổng hợp, phân loại hay xử lý cho các loại tag này» (F310).` | The check runs as a function on spec text. The repo text passes. A copy with `, giao hàng` put back in the kept list fails. A copy whose sentence has one word changed, or no `(F310)`, fails. A copy that has the sentence only in the R-IM03 spec fails. |

### R-IM04: fixed semantic layer

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q22 | SLAYER models are YAML files in the repo (`tools/mcp-insight/semantic/`). Fixed measures: review count, distinct writers, distinct products, distinct keywords. Fixed dimensions: platform, theme, polarity, purchase step, and the portrait dimension and group. No measure name equals a column name of its model, and the loader checks this. Success tests run the real local SLAYER on a synthetic warehouse for every defined measure. | A model copy with a measure named like a column is rejected at load. |
| IM-Q23 | Every count a tool returns is computed twice: once by SLAYER, and once by a fixed reference SQL kept beside the measure. If they match, the numbers are returned. If any value differs, the tool returns `SLAYER_SQL_MISMATCH` and no numbers. | A SLAYER result monkeypatched off by one gives the error, with no rows in the output. |
| IM-Q24 | Agents cannot pass free queries. Tool arguments are typed and validated: `run_id` is a UUID or 8-hex prefix, and a theme filter must be a core or block theme code of the codebook (an excluded code is not one, IM-Q48). Anything else is `INVALID_ARGUMENT`. | Theme `T-GIA' OR 1=1` is rejected. |
| IM-Q25 | The SLAYER storage and datasource are created for each call in a new temporary directory named `insight-slayer-*` under `tempfile.gettempdir()`. They point at the run warehouse and are removed when the call ends, on success and on error. Telemetry is off (IM-Q39, item 3). The repo YAML files are unchanged after a call. | With `TMPDIR` set to an empty test directory: after a successful `theme_counts`, and after one that ends in `SLAYER_SQL_MISMATCH` or a SLAYER exception, the directory holds no `insight-slayer-*` entry. A mutant that skips the cleanup fails. The sha256 of every file in `semantic/` is the same before and after (baseline check). The IM-Q3 network guard stays active during these calls. |

### R-IM05: R-I33 thresholds, ready to use

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q26 | `theme_counts(run_id, question=None)` returns `coded_reviews` (an object `{platform: integer}`, one entry per review platform present in the warehouse, never a cross-platform sum) and one row per (platform, theme code, polarity) that has at least one counted label (IM-Q45). It also returns `coding_target` (`codebook_version`, `block_key`; IM-Q45). Polarity is `all`, `khen`, `che`, `ke` or `khong_ro_huong`. Row fields: `platform`, `theme_code`, `theme_name`, `polarity`, `step`, `reviews`, `writers`, `products`, `writer_basis`, `threshold_count`, `threshold_met`, `threshold_note`, `check2_missing`, `check2_reason`, `check3_missing`, `check3_reason`, `count_id`. `question` is an optional theme code filter. A run with no coded review (IM-Q43) on any platform returns `NOT_CODED`. A run whose reviews are all coded with no counted label returns non-zero `coded_reviews` and an empty row list, not `NOT_CODED`. | An `unclear` label does not change `reviews`. An uncoded run returns `NOT_CODED`. The all-`KHONG_NHAC` run of IM-Q43 returns rows `[]`. A run with 2 coded Shopee and 3 coded TikTok Shop reviews, all `KHONG_NHAC`, returns `coded_reviews = {"shopee": 2, "tiktok_shop": 3}`; a mutant that returns the scalar 5 (or any field equal to 5) fails. |
| IM-Q45 | Only labels of the current coding state count. The current coding target is the repo codebook version and the block of the latest paid `code_reviews` call on the run, stored in the warehouse table `coding_target` when that call starts. A label counts in `theme_counts` only when all of these hold: its status is `kept`; its review has a `done` `coding_state` row equal to the current target (`codebook_version`, `block_key`) and to the review's current `input_sha256` (IM-Q43); and the label's own `codebook_version` and `block_key` equal that row's. The SLAYER model and the reference SQL both apply this join. Older labels may stay in the warehouse as history but never count. | Fixture: reviews R1 to R5 (5 named writers, 3 products) coded under the keyword block `thuc_pham`, each with a kept `T-GIA` label. Then a paid call with `block_override = my_pham` whose fake transport fails on call 2, so only R1 is coded under `my_pham` (kept `T-GIA`). Expected: the `T-GIA` `all` row has `reviews = 1`, `threshold_met = false`, and the result's `coding_target` is (`2026-10-30.4`, `my_pham`). A mutant without the current-state join counts 5 reviews (threshold met) and fails. |
| IM-Q44 | A kept label with polarity `khong_ro_huong` counts in the `all` row and in a `khong_ro_huong` row of its theme. It does not count in `khen`, `che` or `ke`. | A fake answer `CO_KHEN 0.40, CO_CHE 0.35, CO_KE 0.00, KHONG_NHAC 0.25`: P(yes) 0.75 is kept, and no option reaches 0.5. The theme's `all` and `khong_ro_huong` rows have `reviews = 1`, and there is no `khen` row. A mutant that takes the highest option without the direction threshold makes a `khen` row and fails. |
| IM-Q27 | Review threshold (R-I33): `threshold_met` is true only when `threshold_count` ≥ 5 and `products` ≥ 3, where `threshold_count` is always `writers` (IM-Q28, IMCP-O1). Otherwise `threshold_note` contains «dưới ngưỡng». | All named writers: 4 writers on 3 products gives false with «dưới ngưỡng»; 5 on 2 gives false; 5 on 3 gives true. A mutant that uses `>` for either comparison fails the 5-on-3 case, and a mutant that drops the products check fails the 5-on-2 case. |
| IM-Q28 | Owner rule IMCP-O1 (design decision 3, R-IM05). `writers` = the distinct `writer_key` values of the named reviews (`writer_known = 1`) plus one per review with `writer_known = 0`. Because an unnamed review's `writer_key` is its review ID (IM-Q9, IM-Q41), this equals the count of distinct `writer_key` in the row. `threshold_count = writers` for every row. Rows with no name and mixed rows follow the same rule:<br>- A row with only named reviews: `writer_basis = "writer"`, and the note never contains «đếm theo đánh giá, nguồn không có tên người viết».<br>- A row with at least one `writer_known = 0` review (all unnamed, or mixed): `writer_basis = "review"`, and `threshold_note` contains «đếm theo đánh giá, nguồn không có tên người viết».<br>Check 2 of R-I32 (sample large and diverse) is never claimed as passed in PR 1: every row has `check2_missing = true`. `check2_reason` is `WRITER_UNKNOWN` when any review in the row has `writer_known = 0`, otherwise `BELOW_THRESHOLD` when `threshold_met` is false, otherwise `DIVERSITY_NOT_ASSESSED` (the diversity part of check 2 belongs to R-IM08). | Fixtures, each on 3 products:<br>- Named only, below: TikTok Shop, 5 reviews by 2 named writers. Expect `writers = 2`, basis `writer`, `threshold_met = false`, `check2_missing = true`, `check2_reason = BELOW_THRESHOLD`.<br>- Named only, met: 5 named writers. Expect true, `check2_missing = true`, `DIVERSITY_NOT_ASSESSED`.<br>- Unknown only: Shopee, 5 reviews. Expect `writers = 5`, basis `review`, `threshold_count = 5`, true, the note, `check2_missing = true`, `WRITER_UNKNOWN`.<br>- Mixed, below: TikTok Shop, 4 reviews by one named writer plus 1 review with no name. Expect `reviews = 5`, `writers = 2`, basis `review`, `threshold_count = 2`, `threshold_met = false` with «dưới ngưỡng», the note, `check2_missing = true`, `WRITER_UNKNOWN`.<br>- The named-only cases have no «đếm theo đánh giá…» note.<br>A mutant that sets `check2_missing = false` for all-named rows fails the first two cases. A mutant that always uses `reviews` as the threshold count fails the first case and the mixed case (5, met). A mutant that adds the note to all-named rows fails the first two cases. |
| IM-Q50 | (IMCP-O1, owner's case.) A mixed row with few named writers can meet the threshold through its unnamed reviews, but it always carries the note and check 2 missing. The rule is the same in `theme_counts` and in the `portrait_counts` group rows (IM-Q33). | TikTok Shop, one theme row on 3 products: 1 review by a named writer plus 4 reviews with `writer_known = 0`. Expect `reviews = 5`, `writers = 5`, `threshold_count = 5`, `threshold_met = true`, basis `review`, the note «đếm theo đánh giá, nguồn không có tên người viết», `check2_missing = true`, `check2_reason = WRITER_UNKNOWN`. The same 5 reviews in one portrait group give the same fields. Mutants that each fail:<br>- Counting only named writers (`writers = 1`, not met).<br>- Collapsing all unnamed reviews into one unknown writer (`writers = 2`, not met).<br>- Leaving the note off mixed rows.<br>- Setting `check2_reason = DIVERSITY_NOT_ASSESSED` because the threshold is met. |
| IM-Q29 | There is no cross-platform total (R-I06). Every row has exactly one platform, `shopee` or `tiktok_shop`. No row has another platform value or a null platform. No row or result has a field that combines platforms (such as `total`, `all_platforms` or `combined`). A theme present on both platforms gives separate rows. | (a) Theme T on Shopee in 6 reviews and on TikTok Shop in 3: exactly `(shopee, T, all).reviews = 6` and `(tiktok_shop, T, all).reviews = 3`, and no other `(T, all)` row. (b) Theme U on Shopee only (5 reviews): one row `(shopee, U, all).reviews = 5` and no TikTok Shop row. A valid module passes (b). (c) A mutant that adds a row with platform `all` or a `total` field fails. |
| IM-Q30 | `count_id` is `IMC-` + 12 hex of sha256 over the canonical JSON of: the run ID, the tool, the row key (platform, theme or group key, polarity), the rules version (codebook version for themes, keyword-group version for keywords, portrait rules version for portraits), the row's numbers (`reviews`, `writers`, `products`, `keywords`, `threshold_count`, `threshold_met`, `check2_missing`, `check3_missing` where present), and `state_sha256`. `state_sha256` is the sha256 of `content_sha256` plus an ordered dump of the label and coding-state rows. Each ID is stored with its row key and numbers in the warehouse table `count_registry` (insert if new). If an existing ID has different stored numbers, the tool returns `COUNT_ID_CONFLICT` and no numbers. Old IDs stay in the registry with their old numbers after the data changes, so a stale reference still resolves to what it said. The same call twice on the same state gives the same IDs. IDs are unique within a response. | Move one fixture label to an existing (platform, theme, polarity) row, with the source data unchanged (same `content_sha256`). That row's `reviews` and its `count_id` change. The old ID is still in `count_registry` with its old numbers. A mutant that hashes only the source hash and the row key keeps the same ID and fails. |
| IM-Q31 | `keyword_counts(run_id)` takes the run's search-suggestion texts (IM-Q8), normalizes each (NFC, lower case, trimmed, runs of whitespace collapsed to one space), deduplicates, and assigns each distinct keyword to exactly one group from `tools/mcp-insight/data/keyword-groups.json` (frozen below). Groups are tried in file order, and the first matching regex wins. A keyword that matches no group goes to `khac`. It returns `keyword_groups_version`, `keyword_groups_status`, one row per group with at least one keyword, and `step_totals`. Row fields: `platform` (`google`), `group_key`, `group_name`, `step`, `keywords`, `threshold_met` (`keywords` ≥ 5), `threshold_note` («dưới ngưỡng» when false), `count_id`. `step_totals["Quan tâm"]` is the number of distinct keywords in groups whose step is `Quan tâm`. Keywords in `cach_dung` and `khac` (step `Chưa rõ bước`) are never added to any step total. | Use the membership examples in the frozen definitions.<br>- 4 distinct `co_nen` keywords: false with «dưới ngưỡng». 5: true.<br>- `Canxi  CHO BÉ` and `canxi cho bé` count once.<br>- A run whose only keywords are `cách uống kẽm` and `uống canxi lúc nào tốt nhất` gives one `cach_dung` row with 2, and `step_totals["Quan tâm"] = 0`.<br>A mutant that tries `loai_nao` before `cach_dung` puts `uống canxi lúc nào tốt nhất` in `loai_nao` and fails. |
| IM-Q32 | `check3_missing` is one-way in PR 1. When the codebook `status` is not `APPROVED`, every `theme_counts` row has `check3_missing = true`. PR 1 has no source of evidence that a human reviewed a sample (R-I32 check 3), so `check3_missing` is also `true` when `status` is `APPROVED`. The non-missing branch is left to the later confidence work (R-IM08). | (a) The real DRAFT codebook: every row has `check3_missing = true`. (b) A copy changed only to `status: APPROVED` (`approvedBy` and `approvedAt` still null): every row still has `check3_missing = true`. A mutant that reads only `status` fails (b). |

### R-IM06: customer portrait, totals only

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q33 | `portrait_counts(run_id)` returns, per platform, group rows for two dimensions. The text read is `nz(comment + "  " + "  ".join(attributes))`, where `nz` is NFC then lower case and the joiner is two spaces. Groups use script 6's labels (`6-tao-sqlite-nhan.py`, 25/10/2026). Script 1 has the same regexes with two longer display labels.<br>- «Ai dùng»: only for reviews whose text contains `đối tượng sử dụng`. The value is the first match of the field regex (it ends at `công dụng`, `màu sắc`, `chất liệu`, `đúng với mô tả`, `hương vị`, two spaces, or the end). The review gets **every** G group whose regex matches the value. If none matches, it gets «Khác / không rõ».<br>- «Mua cho ai»: the review gets **every** W group whose regex matches the whole text. If none matches, it gets no row in this dimension.<br>Each group row has `dimension`, `group`, `reviews`, `writers` (distinct `writer_key`), `products`, `writer_basis`, `threshold_count`, `threshold_met`, `threshold_note` and `count_id`, with the IM-Q27 and IM-Q28 rules. | Synthetic single-review cases, with the expected groups:<br>- `zq1 ok  Đối tượng sử dụng: Bà bầu, trẻ em`: Ai dùng {Bà bầu, sau sinh, cho con bú; Trẻ em, học sinh}.<br>- `ĐỐI TƯỢNG SỬ DỤNG: người lớn  Công dụng: cho trẻ em`: Ai dùng {Người lớn, trưởng thành} only.<br>- `đối tượng sử dụng: xyz`: {Khác / không rõ}.<br>- `zq2 mua cho mẹ và cho con dùng`: no Ai dùng row; Mua cho ai {Mua cho bố mẹ, ông bà; Mua cho con, bé}.<br>- `zq4 mình uống thấy ổn`: Mua cho ai {Tự dùng}.<br>- `zq3 không có gì`: no row in either dimension.<br>A first-match mutant drops «Trẻ em, học sinh» from case 1 and fails. A test that compares the module's constants with the reference regex tables is an extra check, not the oracle. |
| IM-Q34 | Gender and birth year are guessed once per distinct known writer (`writer_known = 1`), at build time from the raw name in memory, and stored only as `writer_guess(writer_key, gender, age_band, year_basis)`. The rules are exactly those of `6-tao-sqlite-nhan.py`:<br>- Gender: `s = re.sub('[^a-z]', '', name.lower())`. Lists F and M, with the ambiguous set = (F ∩ M) ∪ {anh, thanh, hai, ha, tien, dung, khanh, binh, van}. Only names of at least 4 letters outside the ambiguous set are kept. The result is `Nữ` if s contains a kept F name and no kept M name, `Nam` in the opposite case, otherwise `Không đoán được`.<br>- Birth year: first `(19[5-9]\d\|200[0-8])(?!\d)` on the raw name. Otherwise `(?<!\d)([6-9]\d\|0[0-8])$`, read as 1900+v when v ≥ 60, else 2000+v. Otherwise none.<br>- Age band: age = run year − birth year, where the run year is the UTC year of `analysis_research_automation_runs.created_at`. Bands: `Dưới 20`, `20–29`, `30–39`, `40–49`, `50 trở lên`, and `Không đoán được` when there is no year.<br>Output per platform: rows `{dimension: "Giới"\|"Nhóm tuổi", group, writers}` for groups with at least 1 writer. Each dimension's `writers` add up to the platform's distinct known writers. Every gender and age row has `label = "Giả thuyết"` and `max_confidence = "Yếu"`. | TikTok Shop fixture, run created in 2026, with synthetic names: `huyentran1992` (3 reviews), `minhquan05`, `abc2010`, `xyz19501`, `binh88`, `trangtuan`, `thanhha1949`, `ngocmai2008x`, `kim07`, plus one masked `a*****b` and one null name. Expected: 9 known writers.<br>- Giới: Nữ 3, Nam 1, Không đoán được 5.<br>- Nhóm tuổi: Dưới 20 2, 20–29 1, 30–39 2, Không đoán được 4.<br>Mutants that each fail: no per-writer dedup (Nữ 5); an unbounded `\d{4}` year (`abc2010` in Dưới 20); a 4-digit match without `(?!\d)` (`xyz19501` in 50 trở lên); a missing ambiguous set (`binh88` becomes Nam, so Nam 2); a removed `Giả thuyết` label. |
| IM-Q35 | A platform with no known writer (Shopee, or TikTok Shop where every name is missing or masked) gets `"Chưa có dữ liệu"` for gender and age, with no numbers. | A Shopee-only fixture, and the IM-Q41 TikTok Shop fixture, have no numeric gender or age rows. |
| IM-Q36 | No per-person result: the output has no `writer_key`, review ID, name or list keyed by person. The warehouse stores guesses only per `writer_key` (never the name). | Scan the output for every fixture name, `writer_key` and review ID. A mutant that returns a per-writer list fails the scan. |
| IM-Q37 | The portrait counts go through the same SLAYER and SQL comparison as IM-Q23. | A mismatch monkeypatch on a portrait measure returns `SLAYER_SQL_MISMATCH`. |

## PR 2 conventions (R-IM07 to R-IM09)

- New data file `tools/mcp-insight/data/report-frame.json`: the 18 parts (R-I30, R-I31) and the source role table
  (R-I34). It holds exactly the data frozen in "Frozen report frame" below. The module path constant is
  `REPORT_FRAME_PATH`; tests point it at a copy.
- New shared store `<data dir>/insight-shared.sqlite` (design decision 6). It has two tables:
  - `sample_review(rules_kind, rules_version, reviewed_by, reviewed_at, sample_size, passed)`: an owner review of a
    sample of an automatic classification. `rules_kind` is `codebook`, `keyword_groups` or `portrait_rules`.
  - `method_ledger(method_key, subject_key, run_id, approved_by, approved_at)`: one row per owner-approved report
    that used a method, on one researched product (`subject_key`, for example `canxi`). `method_key` is
    `<tool>:<source key>:<rules version>`, for example `theme_counts:shopee_reviews:2026-10-30.4`.
  Only two module functions write it, `record_sample_review(...)` and `record_method_approval(...)`, for the owner or
  the coordinator. They are not MCP tools. No MCP tool writes the shared store, and no tool creates it when it is
  missing (a missing store reads as empty).
- Confidence levels, high to low: `Chắc`, `Khá`, `Yếu`, `Không` (R-I32). Labels: `Khung`, `Chưa có dữ liệu`,
  `Giả thuyết`.
- A "count row" is one row of `theme_counts`, `keyword_counts` or `portrait_counts` with its `count_id`. Its
  source is: `shopee_reviews` or `tiktok_shop_reviews` by the row's platform (theme and portrait rows), or
  `search_suggestions` (keyword rows).
- A count ID is "current" when the producing tool, called now on the same run, returns a row with that ID.

## Contract rows, PR 2

### R-IM01 extended to the PR 2 tools

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q52 | (Amends IM-Q1.) The registered tools are exactly nine: the five PR 1 tools plus `report_plan(run_id)`, `confidence_ceiling(run_id, part, evidence, hypothesis=False)`, `find_reason_links(run_id, theme_a, theme_b)` and `read_reviews(run_id, ids)`. Input schema types: `run_id`, `theme_a`, `theme_b` string; `part` integer; `hypothesis` boolean; `evidence` an array of objects `{"count_id": string, "part": integer or null}`; `ids` an array of strings. No argument takes SQL, a SLAYER query, a measure, a formula or a file path. `record_sample_review` and `record_method_approval` are not registered tools. | A mutant that registers `record_method_approval` as a tool fails the tool-name-set test. A mutant that adds a `sql` argument to `find_reason_links` fails the input-schema test. |
| IM-Q53 | (Extends IM-Q3, IM-Q38, IM-Q39.) The four new tools open no socket, resolve no host, start no subprocess and change no environment variable. The app home is byte-identical before and after each call, on success and on every error path. `confidence_ceiling` and `read_reviews` write nothing: the warehouse file's sha256 is unchanged and no shared store file is created. `report_plan` and `find_reason_links` write only the warehouse tables `count_registry`, `keyword_group` and `reason_flag` (IM-Q70). | (a) A mutant that opens a socket in `report_plan` trips the audit hook. (b) A mutant whose `read_reviews` opens the warehouse read-write and runs the PR 1 schema statements changes the warehouse sha256 and fails. (c) A mutant whose `confidence_ceiling` creates an empty shared store when it is missing fails the "no file created" check. |
| IM-Q54 | (Extends IM-Q40.) `report_plan`, `confidence_ceiling` and `find_reason_links` follow IM-Q40 on success and on every error path: no fixture review nonce, whole short review, 8-word run of a long review or writer name in the JSON result, the error `message`, stdout, stderr or `logging`. `read_reviews` is the only tool whose result holds review text, and only in `reviews[].text` for the requested IDs. Its error messages, stdout, stderr, logs, the warehouse and the shared store hold no review text. | A mutant that logs the text of each review read by `read_reviews` at DEBUG, and a mutant whose `find_reason_links` puts the matched connector sentence into the result. Both fail the scan. |

### R-IM07: the 18-part frame

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q55 | The report frame is the data file `data/report-frame.json` (frozen below), not code. The loader requires `contractVersion = "insight-report-frame-v1"`, `version`, `status`, 5 questions numbered 1 to 5, 18 parts numbered 1 to 18 in order, a `kind` per part (`frame`, `data` or `synthesis`), a `question` (1 to 5) on every `data` part, `basis_parts` (data parts only) on every `synthesis` part, unique source keys, and for each source a role per question that is `Chính`, `Phụ`, `Gợi ý` or null. Anything else gives `FRAME_INVALID` and no parts. `report_plan` returns `frame_version` and `frame_status`. | (a) A frame copy that changes the role of `search_suggestions` for question 2 from `Chính` to `Phụ` changes that cell's `role` in the output of parts 6 and 7. A mutant with the roles written in code fails. (b) A copy with a role `Chinh` (no diacritics), a copy with 17 parts, and a copy with parts 6 and 7 swapped each give `FRAME_INVALID`. |
| IM-Q56 | `report_plan(run_id)` returns `parts`, a list of exactly 18 objects in the order 1 to 18 (R-I30), with: `part`, `title`, `question_no` (null for parts 1, 2, 3 and 18), `question` (the question text, or null), `kind`, `label`, `steps`, `sources`, `ceiling`. Parts 2, 3 and 18 are `frame`: `label = "Khung"`, `ceiling = null` (R-I32: frame parts are not graded), `sources = []`. Parts 1, 16 and 17 are `synthesis`: `label = null`, `sources = []`, `steps = null` (R-I31: they keep the steps of the items inside), plus `basis_parts`. Parts 4 to 15 are `data`. Titles and question texts are byte-equal to the frozen frame. | A run fixture with every PR 1 source captured. Check the 18 numbers, titles, kinds and question numbers against the frozen table. A mutant that numbers the appendix 0, or that drops part 18, fails. A mutant that gives part 2 a ceiling fails. |
| IM-Q57 | Source cells (R-I34). A data part's `sources` has one cell per source whose role for the part's question is not null, in frozen file order. A cell has `source` (key), `name`, `role`, `step`, `status`, `reason`, `note`, `count_ids`, `ceiling`. A source is available when at least one of its `warehouse_sources` has `captured = 1` and `row_count ≥ 1` in `source_status`. Then `status = "Có dữ liệu"`, `reason = null` or `NOT_CODED` (IM-Q58). Otherwise `status = "Chưa có dữ liệu"`, `count_ids = []`, `ceiling = "Không"`, and `reason` is `NOT_COLLECTED` (the source has no `warehouse_sources`), `NOT_CAPTURED` (no capture) or `EMPTY_CAPTURE` (captured, 0 rows). A data part whose cells are all `Chưa có dữ liệu` has `label = "Chưa có dữ liệu"`; otherwise `label = null`. A part's `steps` is the distinct `step` values of its cells, in the frozen step order. | Fixture with Shopee reviews and keywords, no TikTok capture, no Trends capture, no product names. Part 4 has 6 cells (question 1): `shopee_reviews` and `search_suggestions` have data; `product_names` and `search_trends` are `NOT_CAPTURED`; `population_stats` and `simulated_personas` are `NOT_COLLECTED`. Part 13 has 2 cells, and `tiktok_shop_reviews` is `NOT_CAPTURED`. A mutant that lists all 11 sources in every part fails the cell count. A mutant that treats a captured source with 0 rows as available fails an `EMPTY_CAPTURE` fixture. |
| IM-Q58 | Count IDs per cell. Inside `report_plan`, the module computes `theme_counts`, `keyword_counts` and `portrait_counts` for the run (same rows, same IDs, same `count_registry` rows as calling those tools). A cell's `count_ids` lists, in tool row order, the IDs of rows from the tools in `part.count_tools ∩ source.count_tools` whose source is the cell's source. When `theme_counts` gives `NOT_CODED`, theme IDs are left out, and each cell whose source lists `theme_counts` and that would use it in this part gets `reason = "NOT_CODED"`. Other errors of the count tools (`SLAYER_SQL_MISMATCH`, `COUNT_ID_CONFLICT`, `CODEBOOK_EXCLUDED_THEME`, …) make `report_plan` return that error with no parts. Two calls on the same state give byte-equal results. | (a) On a coded fixture, every ID in part 8's `shopee_reviews` cell equals a Shopee row ID from a direct `theme_counts` call, and part 4's `shopee_reviews` cell holds exactly the Shopee `portrait_counts` IDs. A mutant that puts portrait IDs into part 8 fails. (b) An uncoded fixture gives part 8's `shopee_reviews` cell `reason = NOT_CODED` and `count_ids = []`, and `report_plan` does not return `NOT_CODED`. (c) A monkeypatched SLAYER mismatch gives `SLAYER_SQL_MISMATCH` and no `parts` key. |
| IM-Q59 | «Những gì báo cáo chưa trả lời được» (R-I37). `report_plan` returns `unanswered`, with one line per cell whose status is `Chưa có dữ liệu`, in part then cell order. A line has `part`, `source`, `unknown` (`"Phần <n> «<title>»: <name>"`), `step` (the cell's step), `reason` (the cell's reason), `why` and `needs`. `why` is `"Bản 1 chưa thu nguồn này"` for `NOT_COLLECTED`, `"Lần chạy chưa thu nguồn này"` for `NOT_CAPTURED`, and `"Lần chạy có thu nhưng không có dòng nào"` for `EMPTY_CAPTURE`. `needs` is `"Thu <name> cho lần chạy"`. A cell with `reason = NOT_CODED` has data and gets no line. | Spec scenario «Nguồn chưa thu»: a run with every PR 1 source captured except TikTok Shop reviews. Every `tiktok_shop_reviews` cell (parts 6, 7, 13, 14, 15) is `Chưa có dữ liệu` with `NOT_CAPTURED`, and `unanswered` has exactly one line for each of them (5 lines with `source = tiktok_shop_reviews`). With the frozen frame, `unanswered` has 32 lines in total (27 `NOT_COLLECTED` and 5 `NOT_CAPTURED`). The same run with TikTok Shop reviews captured has 27 lines and no `tiktok_shop_reviews` line. A mutant that writes one line per source, not per cell, gives 7 lines (6 not collected + 1) and fails. |
| IM-Q60 | Part ceilings (R-IM08 at plan level). A cell's `ceiling` is the highest `confidence_ceiling` level of its count IDs, each evaluated alone with the cell's part (`hypothesis = false`). It is `"Không"` when the cell has no count ID. A data part's `ceiling` is the highest of its cells' ceilings. A synthesis part's `ceiling` is the highest of its `basis_parts` ceilings: the best any claim in it can reach, since a synthesis claim's own ceiling is the lowest of what it cites (IM-Q67). A data part with `label = "Chưa có dữ liệu"` has `ceiling = "Không"`. | Fixture: Shopee reviews coded on the repo DRAFT codebook, an empty shared store, keywords captured. Every data part ceiling is `Yếu` or `Không`, never `Khá` or `Chắc`. With the IM-Q68 "Khá" setup, part 6's `search_suggestions` cell ceiling is `Khá`, part 6's ceiling is `Khá`, and parts 1, 16 and 17 have `Khá`. A mutant that takes the lowest cell ceiling gives part 6 `Không` (from a source with no count IDs) and fails. |
| IM-Q61 | Errors and names. `report_plan` gives `WAREHOUSE_NOT_BUILT`, `RUN_NOT_FOUND` and `RUN_AMBIGUOUS` like `theme_counts`, with no `parts`. Its result holds no provider or tool name in the text fields (`title`, `question`, `name`, `note`, `unknown`, `why`, `needs`): a case-insensitive scan finds none of `Google`, `World Bank`, `NVIDIA`, `Nemotron`, `SerpApi`, `Kalodata`, `Jev`, `TypeSafe`, `SLAYER`, and a case-sensitive scan finds no `Metric` (R-L01, R-I29). Source keys are neutral too (`search_suggestions`, not `google_suggest`). | A frame copy whose `search_suggestions` name is `Gợi ý tìm kiếm Google` must fail the scan. (The module does not filter names; the frozen frame is clean, and the test checks the repo frame through the tool output.) |

### R-IM08: confidence ceiling from the 4 checks

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q62 | `confidence_ceiling(run_id, part, evidence, hypothesis=False)` checks its input. `part` must be 1 to 18; a `frame` part (2, 3, 18) gives `INVALID_ARGUMENT` (frame parts are not graded). `evidence` has 0 to 50 items. For a data part, an item's `part` is null or equal to `part`. For a synthesis part, every item's `part` must be one of its `basis_parts` (null is not allowed). Each `count_id` must be a current count ID of the run (PR 2 conventions): an ID that is in `count_registry` but not current gives `COUNT_ID_STALE`; any other ID gives `COUNT_ID_UNKNOWN`; a `find_reason_links` ID gives `INVALID_ARGUMENT` (reason links are evidence for R-IM11, not counts for a claim). An error result has no `ceiling`. Empty `evidence` gives `ceiling = "Không"` with `reason = "NO_EVIDENCE"`. | (a) Move one label (IM-Q30's change), then pass the old ID: `COUNT_ID_STALE`. A mutant that resolves IDs from `count_registry` alone accepts it and fails. (b) Part 1 with an item `part: 2`: `INVALID_ARGUMENT`. (c) Part 8 with an item `part: 13`: `INVALID_ARGUMENT`. (d) `IMC-000000000000`: `COUNT_ID_UNKNOWN`. |
| IM-Q63 | Check 1 (right source for the question). For each item, the role is the frozen role of the item's source for the question of the item's part (the item's own `part` for synthesis claims). `Chính` passes. `Phụ` is missing with `SECONDARY_SOURCE`. `Gợi ý` is missing with `HINT_ONLY` and makes the item a hypothesis (IM-Q67). A null role makes the item's ceiling `Không` with `SOURCE_NOT_FOR_QUESTION`, whatever the other checks give. | A Shopee theme row in part 8 (question 3, `Chính`): check 1 passes. The same row in part 6 (question 2, `Phụ`): `SECONDARY_SOURCE`. A TikTok Shop theme row in part 8 (question 3, null): `Không`. A mutant that treats every available source as `Chính` fails the part 6 case. |
| IM-Q64 | Check 2 (sample large and diverse). Theme and portrait group rows: missing with `WRITER_UNKNOWN` when the row's `writer_basis` is `review`, otherwise `BELOW_THRESHOLD` when `threshold_met` is false, otherwise `BRANDS_NOT_STORED` (the warehouse stores no brand, so "not only one brand" cannot be shown; open question 17). So check 2 never passes for review rows in PR 2. Keyword rows: passes when `threshold_met` (≥ 5 keywords), otherwise `BELOW_THRESHOLD`. Portrait gender and age rows: missing with `HYPOTHESIS_ROW`. | Named-only TikTok Shop theme row with 5 writers on 3 products, in part 13: `BRANDS_NOT_STORED`. A mutant that passes check 2 whenever `threshold_met` is true fails. 5 distinct `co_nen` keywords pass; 4 give `BELOW_THRESHOLD`. |
| IM-Q65 | Check 3 (an owner reviewed a sample of the automatic classification). It passes only when the shared store has a `sample_review` row with `passed = 1` for the rules that made the row, and those rules are approved: theme rows need `rules_kind = codebook`, `rules_version` = the codebook version, and codebook `status = APPROVED` with non-null `approvedBy` and `approvedAt`; keyword rows need `keyword_groups`, the keyword-group version, and group `status = APPROVED`; portrait rows (groups, gender, age) need `portrait_rules` and `PORTRAIT_RULES_VERSION`. Reasons, first that applies: `CODEBOOK_NOT_APPROVED` or `KEYWORD_GROUPS_NOT_APPROVED`, then `NO_OWNER_SAMPLE_REVIEW`. The PR 1 row fields `check3_missing` and `check3_reason` of `theme_counts` are unchanged (IM-Q32). | (a) Repo DRAFT codebook plus a passed `codebook` sample row: `CODEBOOK_NOT_APPROVED`. (b) A codebook copy with `APPROVED`, `approvedBy` and `approvedAt` set, and no sample row: `NO_OWNER_SAMPLE_REVIEW`. (c) The same with a sample row for another version, or with `passed = 0`: `NO_OWNER_SAMPLE_REVIEW`. (d) The same with a passed sample row for the current version: passes. A mutant that reads only `status` fails (b). |
| IM-Q66 | Check 4 (the method gave stable results on 3 or more products). It passes when `method_ledger` has rows for the item's `method_key` (`<tool>:<source>:<rules version>`) on at least 3 distinct `subject_key` values. Otherwise it is missing with `METHOD_ON_<n>_PRODUCTS`, where n is the distinct count (0 when the shared store is missing). `record_method_approval(method_key, subject_key, run_id, approved_by, approved_at)` and `record_sample_review(rules_kind, rules_version, reviewed_by, reviewed_at, sample_size, passed)` create the store when needed and insert one row. They reject empty strings and unknown `rules_kind` with `ValueError`. | Ledger rows for `canxi` and `kem`: `METHOD_ON_2_PRODUCTS`. Adding a second `canxi` run still gives 2. Adding `sat` passes. A ledger row for another rules version does not count. A mutant that counts runs, not subjects, passes at 3 rows of 2 products and fails. |
| IM-Q67 | Level (R-I32, R-IM08). For each item: ceiling `Không` when check 1's role is null (IM-Q63); otherwise `Chắc` with 0 checks missing, `Khá` with exactly 1, `Yếu` with 2 or more. Then the item is capped at `Yếu` when it is a hypothesis: the call's `hypothesis = true`, a `Gợi ý` source, or a portrait gender or age row (IM-Q34). The claim's `ceiling` is the lowest item ceiling. For a synthesis part this is "the lowest of the claims it relies on". The result has `run_id`, `part`, `hypothesis` (true when any item is a hypothesis or the argument is true), `ceiling`, and `items`: each with `count_id`, `part`, `tool`, `source`, `platform`, `role`, `checks` (`{"1": {"missing": bool, "reason": str or null}, … "4": …}`), `missing_count`, `ceiling`. | Spec scenario «Thiếu câu kiểm 3 và 4»: a theme row that meets the threshold, the DRAFT codebook, and a ledger with 2 products gives `Yếu`. (Check 2 is also missing in PR 2, so `missing_count = 3`.) Keyword rows (IM-Q68) give `Chắc` with 0 missing. A keyword item `Chắc` with `hypothesis = true` gives `Yếu`. A TikTok Shop portrait age row in part 4 gives `Không` (TikTok Shop reviews have no role for question 1); with a frame copy that gives them `Phụ` for question 1, it gives `Yếu` and `hypothesis = true`. Part 1 citing one `Chắc` keyword item (part 6) and one `Yếu` theme item (part 8) gives `Yếu`. A mutant that takes the highest item fails. A mutant that maps 2 missing to `Khá` fails. |
| IM-Q68 | (Spec R-I32 scenario «Thiếu đúng một câu».) A keyword row with 5 or more distinct keywords, used in part 6 (question 2, `Chính`), with a keyword-group copy whose `status = APPROVED` and a ledger with 3 products for its method key, but no passed `keyword_groups` sample row: checks 1, 2 and 4 pass, check 3 is missing (`NO_OWNER_SAMPLE_REVIEW`), ceiling `Khá`. Adding the passed sample row gives `Chắc`. | (a) A mutant that ignores check 3 gives `Chắc` without the sample row and fails. (b) With the sample row but only 2 ledger products the expected ceiling is `Khá` (`METHOD_ON_2_PRODUCTS`); a mutant that ignores check 4 gives `Chắc` and fails. (c) With neither the sample row nor a third product the expected ceiling is `Yếu`. |

### R-IM09: evidence for the «Tại sao» chain

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q69 | `find_reason_links(run_id, theme_a, theme_b)` counts, per platform, the reviews that (1) have a counted label (IM-Q45: kept, current coding state) for `theme_a` and one for `theme_b`, and (2) whose stored text, after NFC and lower case, has a reason connector as a whole word: `vì`, `nên`, `do` or `để` (no letter or digit right before or after it, Unicode word rule). Rule version `REASON_RULES_VERSION = "reason-2026-10-30.1"`. The pair is unordered: (A, B) and (B, A) give the same rows and IDs. It returns `run_id`, `theme_a`, `theme_b` (as given), `connectors`, `link_basis = "BOTH_THEMES_AND_CONNECTOR"`, and `rows`: one per review platform present in the warehouse, `{platform, reviews, review_ids (sorted), count_id}`, with `reviews = 0` and `review_ids = []` for a platform with none. Reviews that only share the two themes, with no connector, are not counted (spec scenario «Cùng xuất hiện, không có lý do»). | Synthetic Shopee reviews coded under block `thuc_pham` (which has `T-VI`), all with kept current labels unless stated: R1 `zqv70 ngon vì chính hãng` with T-CHINHHANG and T-VI: counted. R2 `zqv71 ngon và chính hãng` with both themes: not counted (no connector). R3 `zqv72 rẻ nên mua` with T-GIA only: not counted. R4 with both themes and text `zqv73 dona hàng ổn`: not counted (`do` inside a word). R5 with both themes, connector, but the T-VI label `unclear`: not counted. A TikTok Shop review like R1: counted only in the `tiktok_shop` row. Expected `shopee.reviews = 1`, `review_ids = ["shopee:…R1"]`. Mutants that each fail: counting co-occurrence alone (R2), substring connector search (R4), counting unclear labels (R5), one cross-platform total. |
| IM-Q70 | Validation and storage. `theme_a` and `theme_b` must be core or block theme codes of the codebook (an F310 code is not, IM-Q48) and must differ; otherwise `INVALID_ARGUMENT`. A run with no coding target gives `NOT_CODED`. The per-review connector result is stored as the warehouse table `reason_flag(review_id, rules_version)` (rows only for reviews with a connector; no text), rebuilt for the rule version on each call. Counts go through SLAYER (model `reason_link`) and a reference SQL on the base tables, as in IM-Q23: any difference gives `SLAYER_SQL_MISMATCH` and no rows. | `T-GIAOHANG` as `theme_b`: `INVALID_ARGUMENT`. `theme_a = theme_b`: `INVALID_ARGUMENT`. A SLAYER result monkeypatched off by one: `SLAYER_SQL_MISMATCH` and no `rows`. The `reason_flag` table has no TEXT cell holding a nonce (IM-Q10 scan extended to it). |
| IM-Q71 | Reason-link count IDs follow IM-Q30: `IMC-` + 12 hex over the run ID, the tool `find_reason_links`, the row key (platform, the two theme codes sorted), the rules version (`reason-2026-10-30.1` plus the codebook version), the numbers (`reviews`, `review_ids`) and `state_sha256`. They are stored in `count_registry`. Same state, same IDs. | Add one counted label that makes a second Shopee review count: that row's `reviews`, `review_ids` and `count_id` change, and the old ID stays in `count_registry` with its old numbers. |
| IM-Q72 | `read_reviews(run_id, ids)` returns the stored text of 1 to 20 reviews of the run, for reading on the host machine only. `ids` are warehouse review IDs (`<platform>:<source id>`); duplicates collapse to one, in first-seen order. More than 20 distinct IDs, an empty list, or an ID that is not a string gives `INVALID_ARGUMENT` and no text. IDs not in the warehouse are listed in `not_found` (IDs only). The result is `{run_id, reviews: [{review_id, platform, text}], not_found, notice}`, where `text` is byte-equal to `review_text.text` and `notice` is `"Chỉ để đọc trên máy chủ. Không đưa chữ này vào báo cáo (R-I11)."`. It holds no `writer_key`, writer name, product key or count ID. The warehouse is opened read-only (IM-Q53). | (a) 21 distinct IDs: `INVALID_ARGUMENT`, and the error has no text. A mutant that truncates to 20 fails. (b) 20 IDs plus 5 repeats: 20 reviews. (c) One ID of another run's warehouse: in `not_found`. (d) The result for a TikTok Shop review with a named writer has no fixture writer name and no `w:` key. |

### Codebook `2026-10-30.4` (F311 overlap line)

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q73 | The repo codebook and the test reference copy are `2026-10-30.4`, copied from the owner's draft `jev-bo-chu-de-2610.json` with LF line endings. The only changes from `2026-10-30.3` are `version` and the `T-THIETKE` / `T-CHINHHANG` overlap rule, which now reads «Màu sắc, kiểu dáng, thiết kế của chính sản phẩm (đẹp/xấu, sang/trông rẻ, hợp mắt) = T-THIETKE. Màu hoặc kiểu khác ảnh/mô tả = T-CHINHHANG. Vẻ ngoài bao bì/hộp (đẹp, xấu, bắt mắt) = T-THIETKE (F311). Cách gói, chèn, seal: no theme (F310).» No overlap rule contains «Bao bì/hộp: no theme». `overlaps` is still not sent to Jev (IM-Q20), so no other row changes. This closes open question 15. | A codebook copy with the old sentence «Bao bì/hộp: no theme (F310).» fails the overlap check. A copy with `version = 2026-10-30.3` fails IM-Q14. |

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

## Frozen report frame (IM-Q55 to IM-Q61 oracle)

The file `tools/mcp-insight/data/report-frame.json` holds exactly this data, with `contractVersion:
"insight-report-frame-v1"`, `version: "frame-2026-10-30.1"` and `status: "UNREVIEWED"`, plus a free-text `source`
field. The questions, part titles and source roles are transcribed from R-I30 and R-I34. The source names and notes,
the steps of sources that R-I31 does not name, `count_tools`, `warehouse_sources` and `basis_parts` were written for
this MCP. **They are not owner-approved** (open question 16).

`steps` (the order used for a part's `steps`): `Biết đến`, `Quan tâm`, `Muốn mua`, `Mua`, `Sau mua`, `Chưa rõ bước`.

Questions (`questions[]`, `{no, text}`):

| no | text |
|---|---|
| 1 | Ai dùng, ai mua? |
| 2 | Băn khoăn gì trước khi mua? |
| 3 | Chọn sản phẩm dựa vào đâu? |
| 4 | Dùng xong thấy thế nào? |
| 5 | Nhóm khách nào bị bỏ ngỏ? |

Parts (`parts[]`, in this order). Frame parts have no other field. Synthesis parts have `basis_parts = [4, 5, …, 15]`.
Data parts have `question` and `count_tools`.

| part | title | kind | question | count_tools |
|---|---|---|---|---|
| 1 | Kết luận chính | synthesis | | |
| 2 | Câu hỏi kinh doanh | frame | | |
| 3 | Phạm vi và cách làm | frame | | |
| 4 | Khách hàng là ai | data | 1 | `portrait_counts`, `keyword_counts` |
| 5 | Khác biệt giữa các nhóm | data | 1 | `portrait_counts`, `keyword_counts` |
| 6 | Chủ đề quan tâm | data | 2 | `theme_counts`, `keyword_counts` |
| 7 | Nỗi lo trước khi mua | data | 2 | `theme_counts`, `keyword_counts` |
| 8 | Lý do chọn | data | 3 | `theme_counts`, `keyword_counts` |
| 9 | Thương hiệu và đối thủ | data | 3 | `theme_counts`, `keyword_counts` |
| 10 | Hành trình mua | data | 3 | `theme_counts`, `keyword_counts` |
| 11 | Khách gặp sản phẩm ở đâu | data | 3 | `theme_counts`, `keyword_counts` |
| 12 | Cách mua và dùng | data | 3 | `theme_counts`, `keyword_counts` |
| 13 | Cảm nhận | data | 4 | `theme_counts`, `keyword_counts` |
| 14 | Điều khách chê | data | 4 | `theme_counts`, `keyword_counts` |
| 15 | Nhu cầu chưa đáp ứng | data | 5 | `theme_counts`, `keyword_counts` |
| 16 | Hướng cơ hội | synthesis | | |
| 17 | Thử nghiệm và đo lường | synthesis | | |
| 18 | Phụ lục: nguồn của từng con số | frame | | |

Sources (`sources[]`, in this order). Roles per question 1 to 5; `—` is JSON null (R-I34 «không dùng»). The R-I34
row name is given only to map each key back to the spec table; it is not in the file.

| key | R-I34 row | name | step | Q1 | Q2 | Q3 | Q4 | Q5 | warehouse_sources | count_tools |
|---|---|---|---|---|---|---|---|---|---|---|
| `product_names` | Tên sản phẩm trên sàn | Tên sản phẩm trên sàn | Muốn mua | Phụ | — | Phụ | — | Phụ | `tiktok_shop_product_names`, `shopee_product_names` | |
| `sales_numbers` | Số bán trên sàn | Số bán trên sàn | Mua | — | — | Phụ | — | — | | |
| `tiktok_video_subtitles` | Phụ đề video bán chạy TikTok Shop | Phụ đề video bán chạy TikTok Shop | Muốn mua | — | — | Phụ | — | Phụ | | |
| `shopee_reviews` | Đánh giá Shopee | Đánh giá Shopee | Sau mua | Chính | Phụ | Chính | Chính | Chính | `shopee_reviews` | `theme_counts`, `portrait_counts` |
| `tiktok_shop_reviews` | Đánh giá TikTok Shop | Đánh giá TikTok Shop | Sau mua | — | Phụ | — | Phụ | Phụ | `tiktok_shop_reviews` | `theme_counts`, `portrait_counts` |
| `search_suggestions` | Gợi ý tìm kiếm Google | Gợi ý tìm kiếm | Quan tâm | Phụ | Chính | Phụ | — | Phụ | `keywords` | `keyword_counts` |
| `search_results` | Kết quả tìm kiếm Google | Kết quả tìm kiếm | Quan tâm | — | — | Phụ | — | — | | |
| `search_trends` | Google Trends theo tỉnh | Mức quan tâm tìm kiếm theo tỉnh | Chưa rõ bước | Phụ | — | — | — | Phụ | `trends` | |
| `population_stats` | World Bank | Số dân toàn quốc | Chưa rõ bước | Phụ | — | — | — | — | | |
| `simulated_personas` | NVIDIA Nemotron-Personas Vietnam | Hồ sơ dân số mô phỏng | Chưa rõ bước | Phụ | — | — | — | — | | |
| `ai_answer` | Google AI Overview | Câu trả lời AI trên trang tìm kiếm | Chưa rõ bước | — | Gợi ý | Gợi ý | — | — | | |

Source notes (`note`; null where not listed):

| key | note |
|---|---|
| `product_names` | Lời chào hàng của người bán, không phải lý do khách chọn (R-I34). |
| `tiktok_video_subtitles` | Lời chào hàng của người bán; tối đa 5 video (R-I34). |
| `shopee_reviews` | Đánh giá viết sau khi mua; lý do mua trong đánh giá là «kể lại» (R-I31). |
| `tiktok_shop_reviews` | Chỉ dùng khi TikTok Shop chiếm từ 50% doanh thu (R-I34); bản 1 chưa có số này. |
| `search_suggestions` | Chỉ cho biết người tìm hỏi gì; không làm bằng chứng về động cơ hay rào cản của khách (R-I34, R-L12). |
| `search_trends` | Mức so sánh 0–100, không phải số người (R-I35). |
| `population_stats` | Số «toàn dân», chỉ làm mốc so sánh (R-I35). |
| `simulated_personas` | Chỉ làm mốc so sánh toàn dân; không làm bằng chứng về khách, không đặt tên nhân vật (R-I35). |
| `ai_answer` | Chỉ gợi ý giả thuyết, không làm bằng chứng (R-I34). |

With this frame, data parts 4 to 15 have 65 source cells. 27 of them are sources that no PR 1 tool collects
(`NOT_COLLECTED`), and 5 are `tiktok_shop_reviews` cells (parts 6, 7, 13, 14, 15).

## Open questions (assumptions in this table)

1. `theme_counts(run_id, question)`: the spec does not define `question`. This table reads it as an optional theme
   code filter.
2. «Gợi ý tìm kiếm» is read from the Google search captures (`related_searches`, `related_questions`). The keyword
   groups above are new data written for this MCP, marked `UNREVIEWED`. They are not owner-approved.
3. Stored Shopee runs have no product name in the artifact store. The name comes from stored Metric rows when present,
   otherwise it stays NULL and the product is keyed by item ID.
4. Purchase step for every review label is `Sau mua` (R-I31). The Jev v2 codebook asks no step question.
5. **Owner decision O1: closed (IMCP-O1, 30/10/2026).** The owner chose neither plain A nor B: writers in a row =
   distinct named `writer_key` values + one per review with `writer_known = 0`. Any unnamed review in the row adds the
   note and makes check 2 missing. Rows with only named reviews count distinct names and carry no note. This follows
   design decision 3 and R-IM05 as written. The spec copy is unchanged, so `design.md` still calls decision 3 an
   assumption without an owner decision. IM-Q27, IM-Q28 and IM-Q50 apply the answer.
6. Stopping at the first Jev error (R-IM03) replaces the one-retry rule of the Jev v2 spec (section 8).
7. The run's category and keywords are the applied scope of the run scope record `scope.json`, by the app's
   `usedScope` rule (IM-Q8). Only a capture-2 outcome `OK` applies keyword 2 and `capture2.category`. The category
   evidence `category.category.label` (the Jev v2 spec's `scopeCategoryLabel`, section 4) is stored but not used for
   block selection, because a run that did not apply it searched all categories. Runs without the file, such as
   canxi `a2419abf`, fall back to the keyword. The v2
   `blockSelection.inputs` also lists `interviewProductType`; PR 1 does not read it.
8. `check3_missing` is always `true` in PR 1 (IM-Q32). An `APPROVED` status alone is not proof that a human reviewed
   a sample. The evidence needed for the non-missing branch is to be defined with R-IM08.
9. Label locators cover the whole review (`text_start = 0`, `text_end` = text length), because Jev codes the whole
   review and returns no span (IM-Q42).
10. `check2_missing` is always `true` in PR 1 (IM-Q28). Known writer names alone are not proof that the sample is
   large and diverse; the full check belongs to R-IM08.
11. The F310 list (three codes and three names) is fixed in the module, not taken from the codebook's `excluded`
   field, so a later codebook cannot bring a logistics theme back by dropping that field (IM-Q46). Detecting a renamed
   logistics theme by meaning, and not by code or name, is not in PR 1.
12. Whether a logistics-only review gets no theme in a real run depends on Jev answering `KHONG_NHAC`. The core
   `exclude` texts tell Jev so, but PR 1 can only test this with a fake transport (IM-Q48). The owner's 30-review
   sample (task 6.1) is where this is checked on real answers.
13. `keyword_counts` counts Google search suggestions, not theme labels. The frozen keyword groups have no logistics
   group. A suggestion about delivery would go to `khac`. This table reads F310 as covering theme labels only.
14. Whether a real review about packaging looks gets `T-THIETKE`, and one about packing gets no theme, depends on
   Jev reading the F311 `include`/`exclude` text. PR 1 tests what is sent and how answers are stored (IM-Q51), not
   Jev's judgement. The owner's sample (task 6.1) checks it on real answers.
15. **Closed in revision 8 (codebook `2026-10-30.4`, IM-Q73).** Codebooks `2026-10-30.2` and `2026-10-30.3` had an
   overlap rule `T-THIETKE` / `T-CHINHHANG` that ended with «Bao bì/hộp: no theme (F310)», which disagreed with F311.
   The owner's `2026-10-30.4` changes only that line: packaging looks belong to `T-THIETKE` (F311), and packing
   itself gets no theme (F310).
16. The report frame (IM-Q55) is new data written for this MCP, marked `UNREVIEWED`. Roles and texts come from
   R-I30 and R-I34. The choices that are not in the spec: neutral source names (R-L01); the step of Trends,
   population data, simulated personas and AI answers (`Chưa rõ bước`, R-I31 does not name them); which count tools
   serve which parts; and `basis_parts = 4 to 15` for all three synthesis parts. Part 18 is the appendix (R-I30 counts
   it as the 18th part).
17. **Check 2 and brands (IM-Q64).** R-I32 check 2 asks for a sample that is not from one product or one brand. The
   warehouse stores no brand, so check 2 never passes for review rows in PR 2 (`BRANDS_NOT_STORED`). Free Shopee
   reviews also have no writer name (`WRITER_UNKNOWN`). So no review-based claim can be above `Yếu` in PR 2 while
   the codebook is DRAFT and the ledger is empty. This matches the design risk «Mức Chắc chưa thể có ở bản 1».
   Keyword rows can reach `Khá` or `Chắc` once the keyword groups are approved and sampled.
18. **Reason links without spans (IM-Q69). This needs the owner's view.** R-IM09 asks to count reviews where the
   customer joins the two themes with a reason word. Jev labels the whole review and returns no span, so the MCP
   cannot tell which words carry which theme. PR 2 counts a review when it has both theme labels and a reason word
   anywhere in its text (`link_basis = BOTH_THEMES_AND_CONNECTOR`). Pure co-occurrence with no reason word is not
   counted, as the spec scenario requires. A reason word that joins two other ideas in the same review is still
   counted. The agent reads the review IDs with `read_reviews` to confirm. A stricter rule needs spans or a pairwise
   Jev question (paid) and is not in PR 2. The word list is the spec's four words. `nên` and `để` also have
   non-reason uses («nên dùng», «để lâu»), and text typed without diacritics (`vi`, `nen`) is not matched.
19. Check 4 (IM-Q66) counts researched products by `subject_key` (for example `canxi`, `kem`), not by product listing.
   The method key includes the rules version, so a new codebook version starts at 0 products. The ledger is written
   only by `record_method_approval`, which the owner or the coordinator calls when the owner approves a report. No
   report approval flow exists before R-IM12.
20. Check 3 (IM-Q65) needs both an approved rules file and an owner sample-review record for that exact version. The
   owner's 30-review check of the codebook (task 6.1, F312) was on `2026-10-30.2` and the owner kept it DRAFT
   (F313), so no record is seeded.
21. A claim's ceiling is the lowest of its evidence items (IM-Q67). A claim that cites one `Chính` row and one `Phụ`
   row gets the `Phụ` row's level. This reads «Khi một kết luận khớp hai mức, báo cáo SHALL lấy mức thấp hơn» (R-I32)
   as applying across evidence items.
22. R-I34 says TikTok Shop reviews are used only when TikTok Shop has 50% or more of revenue. The MCP has no revenue
   data, so it does not apply this gate. It shows the rule in the cell `note`. Also, R-I34 gives TikTok Shop reviews no
   role for question 1. So gender and age guesses, which only TikTok Shop names allow, get `Không` in parts 4 and 5.

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

## Re-review findings applied (revision 3)

| Finding | Severity | Rows |
|---|---|---|
| R2-1 Ambiguous-set mutant: `binh88` replaces `anhthu88`, mutant gives Nam | must-fix | IM-Q34 |
| R2-2 Coded-review counts per platform, no scalar sum | must-fix | IM-Q26, IM-Q16 |
| R2-3 No check-2 pass from known names; always missing in PR 1 | must-fix | IM-Q28, open question 10 |
| R2-4 Stored run category from the scope record; no caller category | must-fix | IM-Q8, IM-Q15, IM-Q1, open question 7 |
| R2-5 Count only labels of the current coding state | must-fix | IM-Q45 (new) |
| R2-6 Mixed named/unnamed threshold | owner decision | open question 5 (O1), IM-Q28 |
| R2-7 Product name in the coding fingerprint | should-fix | IM-Q43 |

## Scope update and re-review findings applied (revision 4)

| Item | Rows |
|---|---|
| Codebook `2026-10-30.1`: 13 core themes and an `excluded` list | IM-Q14, IM-Q15 (questions per call 15 and 13), IM-Q45 (version) |
| Task 2.7: reject a codebook with a logistics theme | IM-Q46 (new), open question 11 |
| Task 2.7: never ask Jev an excluded theme | IM-Q47 (new), IM-Q18 |
| Task 2.7: reviews still stored, nothing counted or shown | IM-Q48 (new), IM-Q24, open questions 12 and 13 |
| Task 2.8: R-I39 kept list and the owner's sentence | IM-Q49 (new) |
| R3-1 (must-fix): only the applied scope (`usedScope`, outcome `OK`) feeds block selection; category evidence kept apart | IM-Q8, IM-Q15, open question 7 |
| O1 (mixed named/unnamed threshold) | still open in revision 4 (open question 5) |

## Owner decision applied (revision 5)

| Decision | Rows |
|---|---|
| IMCP-O1: writers = distinct named + one per unnamed review; any unnamed review adds the note and makes check 2 missing; named-only rows have no note | IM-Q27, IM-Q28, IM-Q50 (new), open question 5 closed |

## Owner update applied (revision 6, F311)

| Item | Rows |
|---|---|
| Codebook `2026-10-30.2`: `T-THIETKE` include/exclude, `T-DONGGOI` excluded entry, overlap rule | IM-Q14, IM-Q45 (version), open question 15 (overlap gap) |
| Spec scenario «Bao bì bắt mắt»: packaging looks to `T-THIETKE`, packing gets no theme | IM-Q51 (new), open question 14 |

## Owner update applied (revision 7, F312)

| Item | Rows |
|---|---|
| Codebook `2026-10-30.3` (definitions of `T-CHATLUONG`, `T-CONGDUNG`, `T-VI`, `T-CAMGIAC`, `T-HANDUNG` changed; same codes, blocks, thresholds, limits and excluded list) | IM-Q14, IM-Q45 (version only); open question 15 still open (the stale overlap line is still in `2026-10-30.3`) |

## PR 2 rows and owner update applied (revision 8)

| Item | Rows |
|---|---|
| R-IM01 extended: nine tools, no write from the read tools, text only in `read_reviews` | IM-Q52 (amends IM-Q1), IM-Q53, IM-Q54 |
| R-IM07 / task 3.1: frame data file, 18 parts, source cells, count IDs, unanswered section, part ceilings | IM-Q55 to IM-Q61, frozen report frame, open questions 16 and 22 |
| R-IM08 / task 3.2: 4 checks, shared store with sample reviews and the method ledger, levels | IM-Q62 to IM-Q68, open questions 17, 19, 20 and 21 |
| R-IM09 / task 3.3: `find_reason_links`, `read_reviews` | IM-Q69 to IM-Q72, open question 18 |
| Codebook `2026-10-30.4` (F311 overlap line) | IM-Q73, IM-Q14 and IM-Q45 (version only), open question 15 closed |
