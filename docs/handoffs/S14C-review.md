# Handoff — S14C review and scoped fixes

Updated: 2026-10-25
Worktree/branch: `wp-s14-captions-209` / `wp/s14-captions-209`

Completed: Independently reviewed the code/test briefs, prior results, approved R-I12/R-I13/R-M23/R-L01/R-P04 rules, and the branch diff. Confirmed and fixed overlapping subtitle cues, cues beyond the declared duration, whitespace changes in supposedly verbatim cue text, and flag-off fallback step-byte drift. Enabled the three existing failing TODO assertions without changing their expected values. Extended the existing subtitle fixture to preserve multiple spaces and line breaks, and the existing durable integration case to check native-reading replay/revision without rank, media or model redispatch.

Changed paths:

- `src/modules/analysis/research-automation/video-watch-subtitles.ts`: preserve decoded cue text; reject distinct overlapping cues and endpoints outside duration, while still merging exact duplicates.
- `src/modules/analysis/research-automation/video-watch-lane.ts`: preserve legacy fallback document bytes when the paid lookup is off; always mark native subtitle attempts.
- `src/modules/analysis/research-automation/collection-lanes-save-step.ts`: record explicit fallback VIDEO markers when the paid lookup is enabled.
- `tests/unit/video-watch-s14c.test.ts`: enforce the parser regressions in its existing table and the real subtitle path, without new test seams.
- `tests/integration/research-automation-s14c.test.ts`: enforce the original main-byte hash and native replay/revision/privacy behavior.
- This handoff.

Evidence (commands, results, relevant revision): Review began at `906a7361a235c2c66e7fab8fe6e71768573779f4`. The original contract run reported 19 pass / 3 TODO. Strengthened assertions failed before production fixes. Contract regeneration leaves all generated contracts unchanged. A scratch export of `origin/main` at `06a6658d5d3d32ef63486e28b587a4d9c6986d07` independently reproduces collection SHA-256 `78a5635a460b3e7387c996985425d13ea97ef12153ecafe2f2e0394285b1a033`; the corrected flag-off branch matches that unmodified hash. Removing subtitle dispatch only in a scratch export makes row 2 fail at the SUBTITLE assertion with actual VIDEO; scratch source is restored and both scratch exports are removed. Final check counts and pushed-head verdict are recorded in `/home/pkhang/claude-2410/s14c/out/review-s14c.md` and its accompanying log files.

Unresolved: None after round 2. The round-1 total-caption edge is closed by `cae6e8867c5e51a70737727922ae2bed72d2ff34` and the boundary regression below. The external round-2 verdict names the final local HEAD; this review does not push.
Next action: Coordinator pushes the reviewed local HEAD and uses CI as the release gate. No PR or deployment is part of this task.
Business decisions pending: None. The brief requires cues inside the recorded duration, so out-of-range native tracks fall back to the existing video path. When ranking is off, absence of a path marker retains legacy fallback semantics; SUBTITLE remains explicit. Native subtitles remain controlled by the existing video-watch flag. Account-wide balance observations remain in retained captures; attributed run cost stays UNKNOWN under the existing service policy.

## Round 2 — fresh review and caption boundary proof

Updated: 2026-10-25
Worktree/branch: `wp-s14-captions-209` / `wp/s14-captions-209`
Completed: Reviewed the whole `origin/main...HEAD` diff against Parts A/B and the round-1 checks with the test-audit skill. Confirmed parser and prompt share `SUBTITLE_MAX_CAPTION_CHARS = 200_000` and count NFC code points of the same joined text. Oversized tracks return no subtitles before a model call and fall back to video.
Changed paths: `tests/unit/video-watch-s14c.test.ts` adds exactly one table-driven contract row (199,999 joined characters → SUBTITLE/NATIVE_SUBTITLE; 200,001 → VIDEO/MODEL_TRANSCRIBED) using the existing fixture with test-local byte input. This handoff is the only other round-2 change; no production code changed.
Evidence (commands, results, relevant revision): Node 24.14.0; typecheck passes; 15 scoped test files importing affected modules pass (175 tests, zero failures/skips/TODOs); contract generation passes with no generated drift; `git diff --check` passes. On a scratch export of exact pre-fix `aa4396ac5f6b9a45e1bccea082386022c0dec1cc`, the unchanged new row passes the under-cap case and then exits 1 at `attempt.reason`: actual MODEL_FAILED for 200,001 characters, expected successful VIDEO publication. Scratch removed. Logs and final local-head verdict: `/home/pkhang/claude-2410/s14c/out/review2-s14c.md` and its sibling `review2-s14c-*.log` files.
Unresolved: None. All checks were offline with synthetic fixtures; no production state or live provider/model/tool was used.
Next action: Coordinator pushes; CI is the remaining gate.
Business decisions pending: None.
