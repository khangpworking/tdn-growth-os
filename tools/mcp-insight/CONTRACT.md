# tdn-insight contract rows, PR 1 (R-IM01 to R-IM06)

Source of truth: `openspec/changes/insight-mcp-v1` (spec, design decisions 1 to 5), `openspec/changes/insight-method-v1`
(R-I31, R-I32, R-I33) and `openspec/specs/insight-report/spec.md` (R-I06, R-I11). This table is what the tests are
written from. Each row names one behavior and one negative control: an input or a one-check-removed module copy that
must make the row's test fail or flip its result.

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
- Warehouse: one SQLite file per run, `<data dir>/runs/<run_id>.sqlite`.
- Platforms: `shopee` and `tiktok_shop` for reviews, `google` for keywords and Trends.
- The Jev transport is one injectable function. Tests replace it with a fake that counts calls. There is no real
  network in any test.
- Fixtures are synthetic. They contain no real review text, names or IDs.

## Contract rows

### R-IM01: local, read-only app, paid flag, key from file

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q1 | The server is named `tdn-insight` and runs over stdio. The registered tools are exactly `build_warehouse`, `code_reviews`, `theme_counts`, `keyword_counts` and `portrait_counts`. No tool has a parameter that takes SQL, a SLAYER query or a measure formula. | Add a tool (for example `query`) or a `sql` parameter to a module copy. The tool-set equality test fails. |
| IM-Q2 | The app DB is opened only as `file:<path>?mode=ro` (URI). An `INSERT` through the module's app connection raises `sqlite3.OperationalError` (read-only). After `build_warehouse`, the app DB file's sha256 is unchanged and no `-wal` or `-journal` file was created by the module. | A module copy that opens with `mode=rw`: the `INSERT` succeeds, and the test must fail. |
| IM-Q3 | `build_warehouse`, `code_reviews(dry_run=True)`, `theme_counts`, `keyword_counts` and `portrait_counts` open no socket and resolve no host (audit hook). The module never binds or listens on a port. | A module copy that does a DNS lookup inside `code_reviews(dry_run=True)`: the audit hook trips. |
| IM-Q4 | `code_reviews(run_id, dry_run=False, max_calls=N)` without `INSIGHT_MCP_ALLOW_PAID` set to exactly `1` (unset, `true`, ` 1`, `0`) returns `refused: true`, `reason: "PAID_FLAG_MISSING"`, the eligible review count and `planned_calls`. The Jev transport is called 0 times and the key file is not opened. | With the flag set to `1`, a key file present and a fake transport, the same call reaches the transport. This proves that the flag is what blocks. |
| IM-Q5 | The key is read in-process from `INSIGHT_MCP_JEV_KEY_FILE`. The key value never appears in a tool result, an error message, stdout, stderr, a log line or a warehouse file. A missing key or file gives `JEV_KEY_MISSING` without echoing the file contents. | A synthetic key and a fake transport that raises an error containing the `Authorization` header. The tool output must still not contain the key. A module copy that passes the raw exception text through fails the test. |
| IM-Q6 | No machine path is written in code. An unset `INSIGHT_MCP_APP_DB` gives `APP_DB_NOT_SET`. A path that does not exist gives `APP_DB_NOT_FOUND`, and no file is created at that path. | Point `INSIGHT_MCP_APP_DB` at a missing file. The test asserts that the file still does not exist afterwards (a rw open would create it). |

### R-IM02: run warehouse

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q7 | `build_warehouse(run_id)` accepts a full run UUID or an 8-hex prefix that matches exactly one run. If no run or more than one run matches, it gives `RUN_NOT_FOUND` or `RUN_AMBIGUOUS` and no warehouse file is created. | A prefix shared by two fixture runs gives `RUN_AMBIGUOUS` and no file. |
| IM-Q8 | Sources read, all stored data only:<br>- Shopee reviews: `foundation_shopee_collections` with `run_key = 'auto-<run_id>'`, then the collection artifact, then the `pages[]` row artifacts.<br>- TikTok Shop reviews: captures with operation `kalodata.product.comment.insight`, `original_comments[]` in the base64 response.<br>- Search suggestions: captures `serpapi.google.search`, `related_searches[].query` and `related_questions[].question`.<br>- Trends by province: captures `serpapi.google.trends` with `data_type = GEO_MAP*`, `interest_by_region[]`.<br>- Product names: `kalodata.product.detail` `product_name` (TikTok Shop), and the Shopee name from stored Metric rows (`product_base_id = 1__<item>__<shop>`) when one is stored, otherwise NULL.<br>The result returns counts per platform and per source. A source with no stored capture is reported as `"Chưa có dữ liệu"`, not 0. | A capture belonging to a second fixture run must not appear in the first run's warehouse. A run with no TikTok capture reports `tiktok_shop` as `"Chưa có dữ liệu"`, not `0`. |
| IM-Q9 | Writer rules:<br>- A Shopee review (no writer name stored) gets `writer_known = 0` and `writer_key = review_id`.<br>- A TikTok Shop review with a visible name gets `writer_known = 1` and `writer_key = "w:" +` the first 16 hex characters of sha256 of the NFC-normalized, case-folded, trimmed name.<br>- An anonymous TikTok Shop review (`is_anonymous` true, or a name containing `*`) gets `writer_known = 0` and `writer_key = review_id`.<br>The raw name is never stored. | Two TikTok reviews by the same name share one `writer_key`, and a third name differs. A masked name such as `a*****b` must not get `writer_known = 1`. |
| IM-Q10 | Customer text (review comment plus the Shopee attribute lines) is stored only in the table `review_text(review_id, text)`. No other table has a column named or holding `text`, `comment`, `name`, `user` or `attributes`. A scan of every TEXT cell outside `review_text` finds no 8-word run of any review text and no fixture writer name. | A module copy that also writes the comment into `review`: the scan test fails. A label table with a text column also fails the scan (spec scenario «Chữ khách trong bảng nhãn»). |
| IM-Q11 | Each review keeps its own platform. `review_id = "<platform>:<source review id>"`, and `platform` is never NULL. The same source review ID on two platforms gives two rows. | A fixture with the same source ID on Shopee and TikTok Shop must give 2 rows, not 1. |
| IM-Q12 | Shopee rows are read from the collection's `pages[]` only. Rows repeated across pages collapse to one by `reviewId`. Reviews in a listing's `excluded[]` are not stored. | A fixture with one review on two pages stores 1 row. |
| IM-Q13 | Determinism: two builds on the same app DB give the same `content_sha256`. The hash is taken over an ordered dump of the source tables, and the build time is excluded. Changing one stored rating changes the hash. A rebuild keeps existing Jev label rows for review IDs that still exist. | Change one fixture review's rating: `content_sha256` must differ. |

### R-IM03: Jev coding with codebook v2

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q14 | The codebook is the repo data file `tools/mcp-insight/data/insight-theme-codebook.json`, copied unchanged from the v2 draft (`version 2026-10-26.2`, `status DRAFT`). The loader rejects a codebook that is missing `version` or `status`, and returns `CODEBOOK_INVALID`. | A codebook copy without `status` is rejected. |
| IM-Q15 | Block selection, first match wins:<br>1. `block_override` argument.<br>2. The run's category label, exact match to `match.categoryLabels`.<br>3. The run keyword, matched against `match.keywords` (the longer matched term wins; on a tie, the earlier block in the file).<br>4. Otherwise the core only (`blockKey = null`, `matchBasis = NO_MATCH`).<br>The result carries `codebookVersion`, `blockKey`, `matchBasis`, `matchedTerm` and `questions_per_call` (at most `limits.maxQuestionsPerCall`). | Keyword `canxi` selects `thuc_pham` by keyword. An unmatched keyword gives core only with 16 questions. An unknown `block_override` is rejected (`BLOCK_UNKNOWN`), not ignored. |
| IM-Q16 | `dry_run` defaults to `True`. A dry run returns the eligible reviews (reviews with non-empty text that are not yet coded with this codebook version), `planned_calls` (one per eligible review, capped by `max_calls` when given, and by `limits.maxCallsPerRun`) and the block selection. It works without the paid flag and without a key file. Jev calls = 0. | A transport that raises if called: the dry run must not raise. |
| IM-Q17 | A real run (paid flag set) requires `max_calls`, an integer from 1 to `limits.maxCallsPerRun`; otherwise `MAX_CALLS_INVALID` and no call. The run stops when `max_calls` calls have been made, and returns `stopped: "CAP_REACHED"` and `calls_made`. | Cap 3 on 5 eligible reviews: exactly 3 transport calls. |
| IM-Q18 | The run stops at the first failed call, with no retry. A failed call is: an exception or timeout, HTTP other than 200, bad JSON, wrong `model`, a missing answer, an answer that is not `choice`, choices that do not match the 4 options, a probability outside 0 to 1, a probability sum off 1 by more than `thresholds.probabilitySumTolerance`, or a confidence outside 0 to 1. It returns `stopped: "JEV_THEME_UNAVAILABLE"` (transport, HTTP, JSON) or `"JEV_THEME_INVALID"` (answers), with no partial labels for that review. Labels of reviews coded before the error are kept. | An error on call 2 of 5: exactly 2 transport calls, and exactly 1 review has labels. |
| IM-Q19 | Labels:<br>- P(yes) is the sum of `CO_KHEN + CO_CHE + CO_KE`.<br>- P(yes) ≥ `thresholds.keep` gives a stored label with status `kept`.<br>- `thresholds.unclear` ≤ P(yes) < `keep` gives status `unclear` («chưa rõ»), stored but never counted.<br>- Below `unclear`, no row.<br>- Polarity is the highest `CO_*` option if it is ≥ `thresholds.direction` (`khen`, `che`, `ke`), otherwise `khong_ro_huong`.<br>Each label stores `codebook_version`, `block_key`, P(yes), polarity, and the purchase step `Sau mua` (R-I31: platform reviews are after purchase). The thresholds come from the codebook file, not from code. | P(yes) 0.69 gives `unclear`, which does not count; 0.70 gives `kept`. A codebook copy with `keep = 0.6` makes 0.69 `kept`. |
| IM-Q20 | The request body for one review holds only: the review text, platform, product name, block label, codebook version, and questions built from the codebook (code, name, include, exclude, the 4 options). It holds no `writer_key`, `review_id`, writer name or product URL. Each call has at most 20 questions. | The fake transport records the body. A fixture writer name and the `writer_key` must not be in it. |
| IM-Q21 | Idempotent: a review already coded with the same codebook version is not called again, and `planned_calls` excludes it. A second real run on a fully coded run makes 0 calls. | Code 2 of 5 reviews, then dry run: `planned_calls = 3`. |

### R-IM04: fixed semantic layer

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q22 | SLAYER models are YAML files in the repo (`tools/mcp-insight/semantic/`). Fixed measures: review count, distinct writers, distinct products, distinct keywords. Fixed dimensions: platform, theme, polarity, purchase step, and the portrait dimension and group. No measure name equals a column name of its model, and the loader checks this. | A model copy with a measure named like a column is rejected at load. |
| IM-Q23 | Every count a tool returns is computed twice: once by SLAYER, and once by a fixed reference SQL kept beside the measure. If they match, the numbers are returned. If any value differs, the tool returns `SLAYER_SQL_MISMATCH` and no numbers. | A SLAYER result monkeypatched off by one gives the error, with no rows in the output. |
| IM-Q24 | Agents cannot pass free queries. Tool arguments are typed and validated: `run_id` is a UUID or 8-hex prefix, and a theme filter must be a codebook theme code. Anything else is `INVALID_ARGUMENT`. | Theme `T-GIA' OR 1=1` is rejected. |
| IM-Q25 | The SLAYER storage and datasource are created in a temporary directory for each call, point at the run warehouse, and are removed afterwards. Telemetry is off (`DO_NOT_TRACK=1`, `SLAYER_USAGE_REPORTING=off`). The repo YAML files are unchanged after a call. | The sha256 of every file in `semantic/` is the same before and after `theme_counts`. |

### R-IM05: R-I33 thresholds, ready to use

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q26 | `theme_counts(run_id, question=None)` returns one row per (platform, theme code, polarity), where polarity is one of `all`, `khen`, `che`, `ke`. Fields: `platform`, `theme_code`, `theme_name`, `polarity`, `step`, `reviews`, `writers`, `products`, `threshold_met`, `threshold_note`, `writer_basis`, `check2_missing`, `check3_missing`, `count_id`. Only `kept` labels count. `question` is an optional theme code filter. A run with no labels returns `NOT_CODED`, not zeros. | An `unclear` label does not change `reviews`. An uncoded run returns `NOT_CODED`. |
| IM-Q27 | Review threshold (R-I33): `threshold_met` is true only when writers ≥ 5 and products ≥ 3. Otherwise `threshold_note = "dưới ngưỡng"`. | 4 writers on 3 products gives false with «dưới ngưỡng». 5 on 2 gives false. 5 on 3 gives true. |
| IM-Q28 | If any review in a row has `writer_known = 0`:<br>- `writer_basis = "review"`.<br>- `writers` counts distinct `writer_key`, which equals reviews for unnamed rows.<br>- The note includes «đếm theo đánh giá, nguồn không có tên người viết».<br>- `check2_missing = true`.<br>If all reviews in the row have known writers, `writer_basis = "writer"`. | TikTok Shop: 5 reviews from 2 named writers on 3 products gives `writers = 2` and false. This proves that writers, not reviews, are counted when names exist. |
| IM-Q29 | There is no cross-platform total (R-I06). Every row has exactly one platform, and no row or field sums Shopee and TikTok Shop. A theme present on both platforms gives separate rows. | A fixture with a theme on both platforms: no output row has `reviews` equal to the two-platform sum or a platform other than the two. |
| IM-Q30 | `count_id` is `IMC-` + 12 hex, derived from the run, the tool, the row keys, the codebook version and the warehouse `content_sha256`. It is stored with its numbers in the warehouse table `count_registry`. The same call twice gives the same IDs. Changed data gives a different ID. IDs are unique within a response. | Change one fixture label, and the affected row's `count_id` changes. |
| IM-Q31 | `keyword_counts(run_id)` groups the run's distinct normalized keywords (NFC, lower case, collapsed spaces) by the repo data file `tools/mcp-insight/data/keyword-groups.json` (regex per group, first match wins). Choose-type groups (which kind, for whom, should I, side effects, comparison) get step `Quan tâm`. The usage group (how and when to take it) gets `Chưa rõ bước` and is never counted into a step. Each row has `keywords`, `threshold_met` (keywords ≥ 5), `threshold_note`, `count_id` and platform `google`. | 4 distinct keywords gives false with «dưới ngưỡng». Two keywords differing only in case or spaces count once. |
| IM-Q32 | When the codebook `status` is not `APPROVED`, every `theme_counts` row has `check3_missing = true`. | A codebook copy with `status: APPROVED` gives `check3_missing = false`. |

### R-IM06: customer portrait, totals only

| Row | Behavior | Negative control |
|---|---|---|
| IM-Q33 | `portrait_counts(run_id)` returns, per platform:<br>- «Ai dùng» groups from the «Đối tượng sử dụng» field only, for reviews that have the field.<br>- «Mua cho ai» groups from self-told phrases in the review text.<br>Each group row has `reviews`, `writers`, `products`, `threshold_met`, `threshold_note`, `writer_basis` and `count_id`. The group regex tables (G, W) and the field regex are the same as the 25/10/2026 scripts (`1-doi-tuong-va-mua-cho-ai.py`, `6-tao-sqlite-nhan.py`). Field values that match no group go to «Khác / không rõ». | A copy of the reference regex tables is compared with the module constants, and they must be equal. A review without the field never lands in «Ai dùng». |
| IM-Q34 | Gender and birth year are guessed only for writers with `writer_known = 1`. Gender uses rule v2: exclusive given names of at least 4 letters, substring match. Birth year takes 4 digits first, then the last 2 digits. Age bands are taken from the run's year. Results are returned as totals per gender and per age band only. Every gender and age row has `label = "Giả thuyết"` and `max_confidence = "Yếu"`. | A writer named `huyen1992`-style (synthetic) counts as 1 in Nữ and 1 in the 30–39 band of 2026. Removing the `Giả thuyết` label in a module copy fails the test. |
| IM-Q35 | A platform without writer names (Shopee) gets `"Chưa có dữ liệu"` for gender and age, with no numbers. | A Shopee-only fixture has no numeric gender or age rows. |
| IM-Q36 | No per-person result: the output has no `writer_key`, review ID, name or list keyed by person. The warehouse stores guesses only per `writer_key` (never the name). | Scan the output for every fixture name, `writer_key` and review ID. A module copy that returns a per-writer list fails the scan. |
| IM-Q37 | The portrait counts go through the same SLAYER and SQL comparison as IM-Q23. | A mismatch monkeypatch on a portrait measure returns `SLAYER_SQL_MISMATCH`. |

## Open questions (assumptions in this table)

1. `theme_counts(run_id, question)`: the spec does not define `question`. This table reads it as an optional theme
   code filter.
2. «Gợi ý tìm kiếm» is read from the Google search captures (`related_searches`, `related_questions`). The keyword
   groups in `keyword-groups.json` are new data written for this MCP. They are not owner-approved.
3. Stored Shopee runs have no product name in the artifact store. The name comes from stored Metric rows when present,
   otherwise it stays NULL and the product is keyed by item ID.
4. Purchase step for every review label is `Sau mua` (R-I31). The Jev v2 codebook asks no step question.
5. The design assumption for `writer_known = 0` (design decision 3) is applied per row: one unnamed review in a row
   switches that row to the review basis.
6. Stopping at the first Jev error (R-IM03) replaces the one-retry rule of the Jev v2 spec (section 8).
