# Handoff — S22 Cục Thống kê CPI by province (Market Bảng 5.5)

Updated: 2026-10-17
Branch: `wp/nso-province-209` (from main `e009d9ee`). Draft PR; not merged, not deployed. No flag value, provider, OpenCLI or deploy configuration changed.

## What it does

- Reads the province CPI sheet ('Địa phương') from the national **CPI workbook** S21 uses.
- **Download (owner decision 17/10):** with the S22 flag on, the CPI workbook is downloaded on **every** Market run, even when the monthly workbook rows already cover the group.
  - Total requests stay within `OFFICIAL_STATS_MAX_CALLS` = 3 (listing + monthly + CPI), same 2 s spacing and timeout, no retry.
  - When S21 itself needs the CPI workbook (monthly rows lack the group), the province sheet reuses that same download.
  - The extra download happens after the S21 status is settled and keeps no national table or value: **Bảng 5.4, its rows, citations and the S21 status are unchanged**. The workbook is stored as a `CPI` file entry only for the province table. A failed extra download changes nothing for S21.
- The header is pinned by one hash (rows 1–7, columns A–M) that covers the monthly editions seen so far (30-row and 84-row). Province names come from row 8. Any other header → `LAYOUT_UNKNOWN`; Bảng 5.4 still reads normally.
- Stored as optional `provinces` on the official-statistics step document. Documents without it stay valid.
- Market M05 renders **Bảng 5.5** directly after Bảng 5.4 (only when 5.4 is drawn): one row per CPI line that matches the product group plus the all-goods reference, one column per province, values as shown in the workbook (index, previous month = 100), every row cited to the workbook cell. No chart, no %, no ranking. M13 limits and the source appendix mention the province table only when it has rows.
- Source evidence binds **S22** to the CPI capture SHA (the same capture S21 uses when S21 needed it). Insight is unchanged.

## Flag

- `TDN_RESEARCH_OFFICIAL_STATS_PROVINCE_ENABLED=1` turns it on. Default off.
- It only works when `TDN_RESEARCH_OFFICIAL_STATS_ENABLED=1` (S21) is also on. With the S22 flag off, requests and report bytes are exactly as on main (no extra download).

## First canary check (owner OK needed to set the flag)

1. Any Market run with a mapped group. Expect 3 official-stats requests (listing, monthly, CPI) — never more.
2. In the stored step document, confirm `provinces.outcome` is `READ` (not `LAYOUT_UNKNOWN` or `NOT_FOUND`), and the province list matches row 8 of the workbook.
3. Confirm Bảng 5.4 is the same as it would be without the flag (rows still cite the monthly workbook when it covers the group).
4. In the report, confirm Bảng 5.5 sits right after Bảng 5.4, numbers match the workbook cells shown, each row label carries a citation, and the M13 limits line includes the province note.
5. If `LAYOUT_UNKNOWN`: the header changed — record the new header hash from a sample and add a variant; do not loosen the check.
6. Source appendix lists S22 against the CPI workbook capture.

## Follow-ups (not in this package)

- Vùng (regional) table.
- Windows environments whose `python3` is the Store stub still need a real Python installation. The Linux reader checks passed in the reviews below.

## Earlier PR #280 writable review — 2026-10-17

Worktree/branch: assigned review worktree, `rv280`; reviewed head `80263b469ea9ba355f81fa5928949078ce620000` against `e009d9ee`.

Completed:

- No application defect found in the fetch cap, flag wiring, pinned parsing, old-document validation, rendering or capture lineage.
- Fixed a test that could accept a failing Flint rule 11: it previously disabled Flint and only compared failure lists. It now renders with Flint and explicitly requires rule 11 to pass.
- Added explicit coverage for the 30-row and 84-row province editions, reordered province headers, blank-cell preservation, both renderers' numbering and S22-only CPI lineage when S21 still cites the monthly workbook.
- Direct replay against a detached base worktree confirmed identical request URLs, stored collection document bytes and both report HTML byte streams with S22 off, for both the monthly-only and CPI-fallback paths.

Changed paths (committed in `d85c97f0`):

- `tests/integration/research-automation-official-stats-lane.test.ts`
- `docs/handoffs/NEXT-S22.md`

Evidence:

- Node 24.15.0 first on PATH; `npm run typecheck` passed after the test edits.
- All requested browser-free files ran: official statistics; World Bank lane/intake; source status/evidence; reader template/build/golden; Market presentation, business gates and fourteen rules; reader revisions; source evidence/appendix units; next-Market reader and honesty regressions.
- Official-statistics lane: **43/43 passed**, including Python, both province editions and the explicit Flint check.
- Across the 18 selected files: **179 tests, 170 passed, 8 failed, 1 skipped**. Base: **169 tests, 160 passed, the same 8 failed, the same 1 skipped**. Every failure is `listen EPERM` on loopback: four World Bank HTTP tests, three source-status HTTP tests and one reader HTTP test. No new assertion failure. Totals corrected during the head review below: the earlier aggregate omitted two passing integration gate cases because unit and integration logs shared a filename.
- Restricted Node child-process pipes initially produced `EPERM` or hung Python fixture generation on both revisions. Final reader/revision runs used `--test-isolation=none` and an external temporary preload that passes Python stdin through a temporary file descriptor. It executes the original Python scripts and preserves their real output, exit status and every assertion; it changes no repository code. Direct shell execution of the Python reader also matched the in-memory national/province results for both editions.
- All test commands unset `TDN_CHROMIUM_PATH`, `TDN_RESEARCH_PDF_CHROMIUM`, `TDN_REQUIRE_BROWSER` and `TDN_BROWSER_EXECUTABLE`. Test imports were checked before execution. No browser, external provider request, push, merge, deployment or configuration change was performed.

Unresolved: no confirmed application defect. Loopback HTTP checks remain limited by the sandbox, identically on base.

Next action: review commit `d85c97f0`; an unrestricted HTTP test run and the separately authorized first canary remain follow-ups.

Business decisions pending: none for this review.

## Head review — 2026-10-17

Reviewed `d85c97f03ed49926ddbb9be4857d4a59d8055c17` on `rv280c`, including the whole PR against a fresh detached base at `e009d9ee`.

- The committed regression tests use synthetic workbooks and relative imports, cover both sheet extents, header order and blank cells, and explicitly require Flint rule 11 and both renderers' numbering checks to pass. No application or test defect found. S22/S23/S24 source-status rows match the implemented flags and the owner decisions supplied for this review.
- Node 24.15.0 first on PATH; typecheck passed. Official-statistics lane: **43/43 passed**, with every Python reader test executed.
- Across **23 browser-free files**: **200 tests, 191 passed, 8 failed, 1 skipped**. Base: **190 tests, 181 passed, the same 8 failed, the same 1 skipped**. The eight failures are the loopback `listen EPERM` cases listed above. This includes the original 18 files plus World Bank source intake, intake/contract units, Market presentation report and frontend source-status checks.
- Missing generated frontend validators initially failed identically on head and base; local validator generation resolved all five affected checks on both. Generated declaration bytes were unchanged. The Python stdin pipe timeout also reproduced on an unmodified base reader test; final runs used the inspected temporary stdin-file-descriptor preload and `--test-isolation=none`, preserving real Python execution and assertions.
- Fresh synthetic replay with S22 off confirmed exact request URLs, stored collection document bytes and both report HTML streams against base, for monthly-only and CPI-fallback paths; the reader replay used Flint.
- Only this handoff changed in the head review: corrected committed-change status and earlier totals, and recorded current evidence. No machine paths, browser launch, external request, provider/config change, push, merge or deployment. Every test command unset the four browser environment variables required by the review brief.

Unresolved application/test defects: none. Follow-ups remain an unrestricted loopback HTTP run and the separately authorized first canary. The handoff correction is uncommitted.

## Final confirmation after merging main — 2026-10-17

Worktree/branch: assigned review worktree, `rv280d`. Reviewed actual HEAD `dd388b6c6000a255dd7ca454614070edb0c03040` using `git diff 312fb10f...HEAD`; detached baseline created with `git worktree add ../base 312fb10f`. The preceding handoff correction is already committed in `acdd78b9`, included in this merge head.

Completed:

- No application defect found. Both renderers retain Bảng 5.3, World Bank Hình 5.3/5.4, Bảng 5.4, Bảng 5.5, then Comtrade Bảng 6.2 and Hình 6.1/6.2 in that order.
- Added the missing small combined regression with synthetic World Bank series, Comtrade rows and province rows present together. It checks the exhibit order, numbering lint, limitation sentences, province appendix wording and explicit Flint rule 11 in both renderers, plus the presentation business gate and machine-rule regressions.
- Rechecked the request cap, flag gating, pinned parsing, old documents, unchanged national rows, S22 capture lineage and owner text rules. S22/S23/S24 source-status rows and the canary instructions remain accurate.
- Fresh flag-off replay against `312fb10f` confirmed identical request sequences, exact stored collection artifact bytes and both report HTML streams for monthly-only and CPI-fallback paths. Requests remain two and three respectively. No earlier replay artifacts were used as evidence for this comparison.

Changed paths (uncommitted in this review):

- `tests/unit/macro-charts-report.test.ts`
- `docs/handoffs/NEXT-S22.md`

Evidence:

- Node 24.15.0 first on PATH; `npm run typecheck` passed before and after the test edit; `git diff --check` passed.
- Across 27 browser-free files: **236 tests, 227 passed, 8 failed, 1 skipped**. Official-statistics lane **43/43**, World Bank lane **20/20**, Comtrade lane **18/18**, macro-chart units/report **13/13**. Template/build/golden, Market presentation and gates, fourteen rules, reader revisions, source evidence/appendix, World Bank intake/contracts and frontend source-status checks were included.
- All eight failures are loopback `listen EPERM`: four World Bank HTTP cases, three source-status HTTP cases and one reader HTTP case. All three affected files were rerun against `312fb10f`; every failing test name and error matched. The baseline S21 lane also passed **33/33**. The single skip requires the optional retained golden-data directory.
- The initial Python stdin pipe timeout reproduced on the unmodified baseline reader test. Final runs used `--test-isolation=none` and the inspected temporary stdin-file-descriptor preload, outside Git. Real Python reader execution, outputs, exit status and assertions were preserved; all Python tests ran. Local frontend validator generation supplied the existing prerequisite on both revisions without changing tracked generated declarations.
- Every test command unset `TDN_CHROMIUM_PATH`, `TDN_RESEARCH_PDF_CHROMIUM`, `TDN_REQUIRE_BROWSER` and `TDN_BROWSER_EXECUTABLE`; selected test files and helpers were checked for browser imports/launches before execution. No browser, external network/provider request, push, merge, rebase, commit, deployment or configuration change was performed in this review.

Unresolved: no confirmed application or test defect; the eight loopback checks remain constrained by the sandbox.

Next action: review the uncommitted combined regression and handoff; rerun the loopback HTTP checks in an unrestricted environment. The first live canary still requires its separate authorization.

Business decisions pending: none for this review.
