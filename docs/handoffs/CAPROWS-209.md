# Handoff — CAPROWS-209 Metric results-page capture holds one page

Updated: 2026-10-13
Worktree/branch: this worktree, branch `wp/caprows-209` (based on `origin/main`)
Completed: diagnosis of the missing Market rows for keyword `canxi`. No application
code change: the retained capture contains one page of the results table, the intake
admits every row it contains, and the loss happens before the app in the capture step.
Investigated (read-only): retained package `93b85023-2d73-4f23-b5dd-07a5bfc03add`
(run `9dec9d6e-e4ac-4a54-aa83-9fb00d4c759d`, request key `20c3b7b2-…`, capture
`metric-1791901660229`) in the operator state directory, and the owner-supplied capture
directory for that run. Nothing in the state directory or the capture directory was
modified; no app process was started or called; no provider or network call was made.

## Finding

The capture holds the first page of the results-page product table and nothing else.
The app loses no rows: `verifyMetricCaptureArchive` on the exact retained bytes admits
the capture and reports `rowsRead` equal to the snapshot's `W12_topProducts` row count
(21). A correct capture would have paged the widget to its cap (200 rows / 10 pages);
only 1 page was read, and the table's header row was captured as a 21st row.

Counts (retained package `93b85023-…`, snapshot `20b20d46…`, manifest `7be91efe…`;
capture directory bytes identical to the retained ones):

| Source | Rows | Scope |
| --- | --- | --- |
| `snapshot.json` `groups.W12_topProducts` | 21 rows = 1 blank header row + 20 titled products (5 shopee, 15 tiktok) | in scope (keyword `canxi`, 2026-09-03…2026-10-02, shopee+tiktok) |
| products body in `raw-responses.json` (`/v2/market/analytics/products/`, page index 0) | 20 rows | **out of scope**: request has no keyword and `platforms: [1]` (shopee only); this is the page's initial default listing |
| products body for the two `queries: ["canxi"]` requests (page index 0 and 1 = table pages 1 and 2) | 0 rows | not recorded (`status: null`, `body: null`) |
| other captured bodies (shops 20, groups 40, shops-insight 5, search-basic 4, search history 10) | 0 product rows | n/a |

So no captured body holds the ~941 product rows reported as missing. `941` is the
manifest's `resultCount`, produced by the adapter's page-text count parse
(`metric.js:394-400` inside `observeMetricPage`), not a row count in any captured
body; the literal `941` does not appear as a product total anywhere in the saved
results DOM. In-scope product rows available anywhere in the capture: 20.

Manifest pagination fields for this package: `cap: 200`, `pageSize: 20`, `pagesRead: 1`,
`rowsRead: 21`, `totalShown: null`, `truncated: false`, `byPlatform.all` identical,
`views: [{platform: "all", pagesRead: 1}]`.

What the app does with those bytes (re-run locally against the retained package copy,
app code unchanged):

- `verifyMetricCaptureArchive` → `capture.truncation = {cap: 200, totalShown: null, pagesRead: 1, rowsRead: 21, truncated: false}`; admission rejects nothing, so the prepare receipt's `recordCount` is 21.
- The automation capture method keeps the 20 titled rows (blank row excluded as unattributed); the report limitation text (`metric-method-report.ts:203`) reproduces the manifest's fields verbatim ("… `cap` 200 … 21 dòng trong 1 trang").
- The reader path (`reader-report/metric-capture-rows.ts:47`) fails closed on this package with `BLANK_TITLE groups.W12_topProducts.rows[0].name`, because the DOM extraction included the table's header row. It does not silently drop the row, and it does not recover rows either.

Where the rows were lost, in the capture step (before the app):

1. The collected DOM for the top-products widget shows a pager with page items
   1,2,3,4,5,10 and "next" enabled at page size 20, i.e. the widget offered 10 pages
   (200 rows, the adapter cap). The collector clicked next — a canxi products request
   with page index 1 was issued — but the DOM it then read still showed page 1 (same
   20 rows, active page 1), and `collectResultPages` treats "same page number + same
   first row" as end-of-data (`tools/opencli-metric/clis/metric/metric.js:2094-2095`).
   It therefore stopped with `pagesRead: 1` while `pagination.nextAvailable` was still
   true (`:2117`). `paginationFor` then derives `pagesRead` from the page numbers seen
   in the retained DOM (`clis/metric/capture.js:837`), so the same stale page number
   also under-reports how many pages were merged.
2. The two canxi products responses were never recorded (`status`/`body` null), so the
   snapshot's W12 rows can only come from the DOM fallback; the page-2 read never
   observed page-2 content.
3. `truncated` is false and `totalShown` is null, so neither the manifest nor the app
   can tell a reader that 20 of the offered 200 rows were kept (`capture.js:845` only
   sets `truncated` when `totalShown` is known).

The same shape appears in every other prepared capture in the operator state
(4 packages, each `pageSize 20`, `pagesRead 1`, `truncated false`, 21 rows; a further
capture for another keyword merged 41 rows while still reporting `pagesRead: 1`), so
this is a systematic pagination defect, not a one-off for this run.

## Changed paths

- `docs/handoffs/CAPROWS-209.md` (this file) only. No `src/**`, contract, test or
  adapter change: the app admits all rows the capture holds, and the capture tooling
  (OpenCLI bridge / installed adapter) is out of scope for this lane.

## Evidence (commands, results)

- `node --import tsx` probe over a copy of the retained package: intake admits the
  capture (keyword `canxi`, platforms `["shopee","tiktok"]`, period 2026-09-03…2026-10-02,
  `truncation` exactly as quoted above); `W12_topProducts` 21 rows, 1 blank-title row,
  5 shopee, 15 tiktok; reader path throws `BLANK_TITLE` at `rows[0].name`.
- Row census of the capture's `raw-responses.json` (sha256 `1a50461b…`, matching the
  digest declared in the manifest): 279 records, 12 with bodies, 267 without; product
  bodies and scopes as in the table above.
- Pager/page evidence from the capture's own debug DOM for the same run (page-1 and
  page-2 reads both show page 1), and the captured canxi products request bodies
  (`page: 0` then `page: 1`, `limit: 20`).
- `npm run typecheck`: clean.
- Metric capture tests (`tests/unit/research-automation-metric-capture.test.ts`,
  `tests/integration/research-automation-metric-capture.test.ts`,
  `tests/unit/p6-209-adapter.test.ts`): 88 passed, 0 failed.
- Wider `grep -rl capture tests` set (70 files): 573 passed, 3 failed, 1 cancelled,
  3 skipped. The 3 failures are the known Task045 operator-app runtime/launcher tests
  that need a built `frontend/dist` (baseline reproduced on clean `origin/main`,
  `docs/handoffs/RULES14-209.md:54`, `docs/handoffs/GATE-209.md:217`); the cancelled
  test is the load-sensitive three-industries case. This change is documentation-only.
- `git diff --check`: clean.

## Unresolved

- The capture adapter needs, before the next capture: wait until the table has actually
  rendered the page just requested (or the response body has been recorded) before
  reading it, keep paging while "next" is available and `rowsRead < cap`, stop treating
  a repeated page number/first row as end-of-data, record the products response bodies
  (or page-wise totals), and derive `pagesRead`/`rowsRead`/`totalShown`/`truncated` from
  the pages actually merged so the app can disclose the real coverage. That is capture
  tooling, outside this lane.
- With the current retained bytes the app cannot recover the missing rows: the upload
  boundary takes only `snapshot.json` + `manifest.json`, the other declared capture
  files (raw responses, HTML, screenshots) are not retained in the package, and the
  one recorded out-of-scope products body is the page's pre-search default listing.
- The reader path's `BLANK_TITLE` failure on a capture whose table includes a header
  row is a separate, fail-closed robustness gap; it drops no valid row and is not
  needed for this finding.

## Next action

Owner decision. Either (a) fix the capture adapter's pagination and run a new
owner-approved capture for `canxi`, then re-prepare and rebuild the Market report; or
(b) accept the current 20-product sample as an explicitly limited observation. No
application code change and no re-preparation was made here; stored packages still
verify against their exact bytes.

## Business decisions pending

- Whether a corrected capture for keyword `canxi` (up to 200 rows) is wanted, and
  whether the same correction is wanted for the other prepared captures that show the
  same one-page defect.
