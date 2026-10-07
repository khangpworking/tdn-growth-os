# Handoff — WP-127-R2 research evidence archive

Updated: 2026-10-07
Worktree/branch: wp/127-r2-research-archive (from origin/main 35cad2d, no fetch/pull)
Completed:
- Refactored src/platform/artifacts/r2-media-archive.ts without behaviour change: extracted and exported copyVerifiedObject(client, bucket, { key, bytes, sha256, mediaType, maxBytes, allowedTypes }) holding the exact snapshot-before-await, validation, conditional put (IfNoneMatch '*'), 412 handling, streamed read-back with ContentLength/ContentType/hash checks, and error mapping; extracted and exported createR2Client(env) holding the exact env validation and S3Client options. R2MediaArchive.copy and createR2MediaArchive delegate to them (same key prefix, 8 MiB cap, png+jpeg only, same errors).
- Added src/platform/artifacts/r2-research-archive.ts: R2ResearchArchive with copy() only (no delete/list/get-URL), key tdn/v1/research/sha256/<2>/<sha>, 32 MiB cap, 5 allowed types (xlsx, pdf, json, jpeg, png), same safety behaviour via the shared core; createR2ResearchArchive(env) reuses TDN_R2_* validation with bucket tdn-media. No new env vars, no real network.
- Added tests/integration/r2-research-archive.test.ts (9 tests, stubbed S3Client.send, synthetic fixtures only): allowed-type matrix under research prefix with conditional private-put headers and read-back; 412 then matching get gives verified_existing without overwrite; corrupt digest/length/type give integrity and never copied; SDK error text with fake secret/endpoint maps to unavailable with neither leaked; disallowed type / 0 bytes / 32 MiB+1 / bad sha / mismatched sha give invalid_input with zero send calls; post-call buffer mutation does not change uploaded bytes; non-tdn-media bucket gives configuration; each env var missing or malformed gives configuration; prototype exposes only constructor+copy.
- tests/integration/r2-media-archive.test.ts untouched (zero diff) and passing.
Changed paths:
- src/platform/artifacts/r2-media-archive.ts (refactor only, +69/-46)
- src/platform/artifacts/r2-research-archive.ts (new, +33)
- tests/integration/r2-research-archive.test.ts (new, +259)
- docs/handoffs/wp-127-r2-research-archive.md (this file)
Evidence (commands, results, relevant revision):
- Baseline before changes: `node --import tsx --test tests/integration/r2-media-archive.test.ts` 7/7 pass; `npm test` 1041 tests: run A 1032 pass / 4 fail / 2 cancelled / 3 skipped, run B 1033 pass / 4 fail / 1 cancelled / 3 skipped. The 4 fails are the known baseline (three Task045 smoke tests needing frontend/dist, Cloud CLI unreviewed-results test); the cancelled test(s) are load flakes in the industry-routing family that vary run to run.
- After refactor, media test 7/7 pass with zero edits to the test file.
- After changes: `node --import tsx --test tests/integration/r2-research-archive.test.ts tests/integration/r2-media-archive.test.ts` 16/16 pass.
- `npm run typecheck` PASS (one strict-optional-property error in the new test was fixed before commit).
- `npm test` after changes: 1050 tests, 1041 pass / 5 fail / 1 cancelled / 3 skipped. Fails are the same 4 known baseline tests plus one 30 s timeout flake in research-automation-case-contract.test.ts ("one database routes three industries..."); that file passes 4/4 in isolation with these changes applied, so it is the same pre-existing load flake seen at baseline.
- `git diff --check origin/main...HEAD` PASS; `git diff --numstat origin/main...HEAD` shows only the three paths above (production 102 insertions/46 deletions, tests 259 insertions). No frontend changes, so no frontend checks. `npm run check` not required by brief, not run.
- Grep for `console.` in new/changed source and test: none. S3 Key/endpoint values are passed only to the SDK, never logged; errors stay mapped to codes.
- Test authoring per test-audit skill + TDN-GROWTH-OS.md: the new file owns the research prefix/cap/type contract the media test cannot cover; cases are table-driven (integrity triple, invalid inputs, env matrix); no production seam was added (send is stubbed on the test's own client instance).
- No Vietnamese owner-facing text was written, so humanizer-vi was not needed.
- Commits (used `-c` identity flags matching repo history; no git config was changed):
  - 98bfcd7 WP-127-R2: add private R2 research evidence archive with stubbed tests
  - 10d2123 WP-127-R2: extract shared R2 copy/verify core from media archive
Unresolved:
- None. No other files needed touching; no escalation trigger hit (media test passed unchanged; no package.json/lockfile change needed).
Next action:
- PR-A integration WP (service wiring + mirror-status persistence) can now use R2ResearchArchive/createR2ResearchArchive from this branch.
Business decisions pending:
- None for this WP.
