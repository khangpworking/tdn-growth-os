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
- Python reader tests skip/fail on Windows because `python3` is the Store stub; run them on Fedora/CI.
