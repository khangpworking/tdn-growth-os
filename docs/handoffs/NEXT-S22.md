# Handoff — S22 Cục Thống kê CPI by province (Market Bảng 5.5)

Updated: 2026-10-17
Branch: `wp/nso-province-209` (from main `e009d9ee`). Draft PR; not merged, not deployed. No flag value, provider, OpenCLI or deploy configuration changed.

## What it does

- Reads the province CPI sheet ('Địa phương') from the **same CPI workbook** S21 already downloads. No extra request, no new capture ordinal, no new provider call.
- The header is pinned by one hash (rows 1–7, columns A–M) that covers the monthly editions seen so far (30-row and 84-row). Province names come from row 8. Any other header → `LAYOUT_UNKNOWN`; Bảng 5.4 (S21) still reads normally.
- Stored as optional `provinces` on the official-statistics step document. Documents without it stay valid and byte-identical.
- Market M05 renders **Bảng 5.5** directly after Bảng 5.4: one row per CPI line that matches the product group, one column per province, values as shown in the workbook (index, previous month = 100), every row cited to the workbook cell. No chart. Context only; no % and no ranking. M13 limits and the source appendix mention the province table only when it has rows.
- Source evidence binds **S22** to the same CPI capture SHA as S21. Insight is unchanged.

## Flag

- `TDN_RESEARCH_OFFICIAL_STATS_PROVINCE_ENABLED=true` turns it on. Default off.
- It only works when `TDN_RESEARCH_OFFICIAL_STATS_ENABLED=true` (S21) is also on. With either flag off, reports are byte-identical to main.

## First canary check (owner OK needed to set the flag)

1. Pick a Market run where S21 actually **downloads the CPI workbook**. Today that happens only when the monthly CPI rows lack the product group, so many runs never reach Bảng 5.5 — check the S21 step first.
2. In the stored step document, confirm `provinces.outcome` is `READ` (not `LAYOUT_UNKNOWN` or `NOT_FOUND`) and the province list matches row 8 of the workbook.
3. In the report, confirm Bảng 5.5 sits right after Bảng 5.4, numbers match the workbook cells shown, each row label carries a citation, and the M13 limits line includes the province note.
4. If `LAYOUT_UNKNOWN`: the header changed — record the new header hash from a sample and add a variant; do not loosen the check.
5. Source appendix: S21 and S22 both point to the same capture.

## Follow-ups (not in this package)

- Vùng (regional) table.
- Download condition: Bảng 5.5 is rare because the workbook is only fetched as a fallback. Owner decision whether to fetch it on every Market run (one more call per run).
- Python reader tests skip/fail on Windows because `python3` is the Store stub; run them on Fedora/CI.
