# Handoff — VOICE-209: review-video creator speech as seller voice

Updated: 2026-10-12
Worktree/branch: wt-video-voice-209 / wp/video-voice-209 (base b05f36c9)
Completed:
- Video reading `voice` is always `SELLER` (BR-20261012-02, owner decision 12/10/2026).
- REVIEW_VIDEO speech is labelled `lời người làm video review` in read rows (`voiceLabel`); SELLER_VIDEO rows are labelled `lời người bán`.
- Stored readings written with voice `CREATOR` stay readable: `upgradeLegacyReadingBytes` maps them to the current seller reading bytes before the exact-retry and read byte comparisons. Stored `reading.json` is not rewritten; no migration or backfill.
- Tests updated and added (unit and P9 integration).

Changed paths:
- contracts/analysis/video-reading-v1.schema.json
- contracts/analysis/video-reading-v1.generated.ts (regenerated; the only generated file kept)
- src/modules/analysis/research-automation/video-reading-intake.ts
- src/modules/analysis/research-automation/p9-source-intake.ts
- tests/unit/video-reading-intake.test.ts
- tests/integration/research-automation-p9-sources.test.ts
- docs/handoffs/VOICE-209.md

Evidence (commands, results, relevant revision):
- Unit `tests/unit/video-reading-intake.test.ts`: 5 of 5 pass.
- Integration `tests/integration/research-automation-p9-sources.test.ts` (`--test-force-exit`): 11 of 12 pass. The reading route test asserts REVIEW_VIDEO gives `SELLER` with the review label and SELLER_VIDEO gives `lời người bán`. The one failure ("actual authenticated OWNER P4 ... routes") is `EBUSY` on unlink of `test.sqlite` during Windows teardown. The same failure occurs on untouched base HEAD, so it is pre-existing and not caused by this change.
- Typecheck: `npm run typecheck` exits 1 with no output on Windows because the script cannot spawn `.bin/tsc`. Running tsc directly with the same flags gives exit 0 over 924 files.
- `git diff --check`: clean (only the CRLF working-copy advisory for the generated file).
- Generator: `npm run contracts:generate` rewrote about 240 unrelated generated files because of `core.autocrlf=true`. Those were restored; only the video-reading generated file is in the diff.

Unresolved:
- Integration test for the legacy CREATOR read is not exercised end to end. Legacy handling is covered only by the unit test of `upgradeLegacyReadingBytes`.
- No report text shows the video-reading voice yet. The label `lời người làm video review` appears only in the read-view API rows.
- Body assertions after the reading route in the EBUSY-failing integration test may not have run because teardown fails first. Not verified.
- Windows `npm run typecheck` script issue (spawn of `.bin/tsc`) is not fixed here.

Next action:
- Add an integration fixture that writes a stored package with voice `CREATOR` and confirms it reads back as `SELLER` with the review label.
- Decide whether report templates should display the voice label.
- Fix the Windows typecheck spawn and the SQLite teardown EBUSY separately.

Business decisions pending:
- Whether the review-video label should also appear in report text and not only in the read API.

## Round 2 — review blockers fixed

Updated: 2026-10-12

- Restored `video-reading-v1` and its generated TypeScript exactly to `origin/main`; added versioned `video-reading-v2` contracts. New intake writes v2, while v1 `CREATOR` readings validate and project to in-memory `SELLER` rows with the label derived from `videoKind`. Read, receipt and history identities use v2 where their shape changed.
- Removed byte-rewriting legacy upgrade behavior. Stored `reading.json` bytes remain immutable, and citation identities plus `readingSha256` use the stored reading artifact digest for both v1 and v2 packages.
- Added P9 end-to-end coverage for stored legacy v1 and new v2 readings, including schema validation, labels, byte preservation and citation/receipt digest binding.

Checks completed for this round:
- Full unit suite: 715 passed, 3 skipped, 0 failed.
- `npm run typecheck`: passed.
- `tests/unit/video-reading-intake.test.ts`: 5 passed.
- `tests/integration/research-automation-p9-sources.test.ts`: 12 passed.
- Contract generation and stability check: passed.
- `git diff --check origin/main...HEAD`: passed.
