# Handoff: NEXT-TIKTOK-ADS / S16 TikTok top-ads auto-read

Updated: 2026-10-17
Branch: `wp/tiktok-topads-209` (base main 7339138a, which includes 8B / PR #278).

## What exists

- Runtime: `src/modules/analysis/research-automation/tiktok-top-ads-lane.ts`. Flag `TDN_RESEARCH_TIKTOK_TOPADS_ENABLED`, exactly "1". Off means no spawn, no step field, no usage row, and byte-identical reports.
- At COLLECTION, after the Meta 8B read, the lane opens the public top-ads list on `ads.tiktok.com` for region VN, period 30 and the run's product keyword. It runs in session `tdntiktok` with `--window background` on every call, under the shared `withOpenCliBrowserLock`.
  - Production plans 1 open. There are at most 5 opens, at least 30 s apart.
  - Allowed commands: open, wait time, get url, get html --max, extract, close. No login, typing, click or scroll.
- Stops: login wall / verification / captcha / block lead to STOPPED. A logged-in viewer gives `LOGGED_IN_SESSION_PRESENT` and nothing is kept. No recognised card structure gives UI_CHANGED, and the evidence is kept.
- Evidence: final URL, extract text of 1 MiB or less, and a fingerprint (marker and label counts, sizes, profile), stored through the 8B Foundation writer as `automation-tiktok-top-ads:<runId>-…`. Raw HTML is never stored. The report re-verifies the evidence offline before it lists any card.
- Report: Market M07 table 7.4 lists up to 10 captions that match the keyword meaning (L9). Non-matching captions are counted only. The table has a note, an M13 source line, no %, no bare 0 and no provider names.
- Usage: ordinal 13, provider `tiktok-top-ads`, the open count, no cost. Source board card `TIKTOK_TOP_ADS` (S16), FREE_COLLECT.

## Profile is UNWITNESSED

The profile is `tiktok-top-ads-visible-text-v1`. The URL table (`TIKTOK_TOP_ADS_URL_TABLE`) and the label, marker and viewer tables (`TIKTOK_TOP_ADS_PROFILE_TABLE`) were written without an authentic page sample. The first automatic canary run is the witness.

1. Run one canary with the flag on, using the agreed product keyword.
2. Read the stored evidence package: `reads/01-list/text.md`, `fingerprint.json` and `url.txt`.
3. If the final URL, the card labels or the markers differ, edit only those data tables, plus the synthetic tests if label names change. Expect UI_CHANGED on the first run if the real page does not use labelled lines.

## Not done

- No live run and no real browser; all tests use fakes.
- No deploy. Turning the flag on needs the owner's OK.
