# Handoff — NEXT-S25 (automatic report PDFs)

Updated: 2026-10-17
Branch: `wp/pdf-auto-209` (base main `e009d9ee`). Owner approval: 17/10.

## What it does

During the COLLECTION step of a run, after L9 admission, the Market flow looks for industry-report PDFs (S25):

1. `.pdf` links among this run's admitted web rows (marketplace, social and video hosts skipped).
2. Only when step 1 gives fewer than 2 candidates and the keyword draft exists: one extra search, `<keyword> báo cáo filetype:pdf`, same search provider and key as the web lane, never retried. Its rows pass the same L9 keyword filter.
3. At most 2 sequential downloads, in search order, through an SSRF guard: https on port 443 only, DNS name only (no IP literal), every DNS answer must be public, at most 3 redirects with each hop re-checked, no cookies or auth headers, size cap min(16 MiB, 20 MB), 60 s timeout, body must start with `%PDF-`. Duplicates by URL or by bytes are dropped.
4. Each kept file is stored as an ordinary COLLECTION capture (`pdf-discovery` / `pdfdiscovery.download`). The existing capture path retains every `%PDF-` capture as a run PDF (`analysis_pageindex_run_pdfs`, file name `source-N.pdf`), so the existing document reader and the M09 excerpt block pick it up. No new reader and no new timer.

The step document gets an optional `pdfDiscovery` field (search status, files, reason codes). Failures record a reason code only; they never fail the run and never draw an empty block. S25 rows for auto PDFs cite the download capture (`binding.kind = 'capture'`); PDFs the owner attached keep their package lineage.

## Flag

`TDN_RESEARCH_PDF_DISCOVERY_ENABLED=1` (exactly `1`; anything else is off). It also needs the search key that the web lane already uses. Off: no call, no field, no capture, no usage row; Market and Insight HTML are byte-identical to base `e009d9ee`.

## Per-run maximum

- Searches: 1 paid search (usage ordinal 14, provider `serpapi`), only when run rows give fewer than 2 PDFs.
- Downloads: 2 public-file GETs (usage ordinal 15, provider `pdf-discovery`, no credit).
- Document reading: at most 2 extra PDFs per run go to the existing reader, inside its existing per-run question cap.

## First canary check

1. Set the flag on the canary host only; keep everything else unchanged.
2. Run one Market keyword that is likely to have public reports.
3. Check in the COLLECTION step: `pdfDiscovery.search.status` (`CALLED` or `SKIPPED`), each file's status/reason, usage rows 14 (≤1 request) and 15 (≤2 requests).
4. Check `analysis_pageindex_run_pdfs` has one row per downloaded file and the M09 excerpt block shows quotes with no file name, no host and no provider name.
5. Run the Market gate and the 14-rule audit on the report; both must pass as before.
6. If any file has reason `PRIVATE_ADDRESS`, `URL_REFUSED` or `TOO_MANY_REDIRECTS`, note the URL host for review; do not relax the guard.

## Open points

- DNS rebinding: the guard checks DNS answers, then the fetch resolves again. Pinning the checked address needs a custom dispatcher.
- The market-method bridge reads all COLLECTION captures inside its 128 MiB budget; two full-size PDFs add about 43 MiB of envelope bytes.
- A search that throws before sending (for example a keyword with non-plain characters) still records an unsettled search usage row, same as the expanded-search lane.
