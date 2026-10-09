# TikTok report and Reader frontend handoff

Branch: khangpworking/ultimate-tiktok-reader-frontend-claude
Source base: 0cb094a (stage 5 commit, Refresh TikTok owner state and saved Reader list)
Current stage: stage 7 (API read integrity repair, source only)

## Verified so far

- Interface commits 9c8b2ab and 9fafed0 are merged. Generated TikTok types and nine standalone validators import from the generated contract.
- frontend:validators exit 0 (log: logs/validators.exit).
- frontend:typecheck first run exit 2: TikTokReadCitation.quote does not exist. Fixed in stage 4.
- frontend:typecheck second run exit 0 after the fix.
- research-tiktok-report-api.test.ts exit 0 for three stage 4 cases: exact-identity build, mismatched report digest rejection, no-token no-request.

## Stage 5 changes (source only)

- TikTokReportPanel.tsx clears source, context, coding view, and digests when the selection changes.
- It aborts an earlier open-coding request.
- It ignores async results after unmount or selection change.
- It calls onBuilt after a successful build.
- ReaderReportPanel.tsx accepts an optional refreshToken prop that reloads the saved Reader list. Existing variants and behavior are unchanged.
- RunView.tsx holds a build counter and passes it to both panels.

## Stage 7 changes (source only)

- tiktok-report-api.ts exports verifyTikTokCodingReadView, which checks the read view before display.
- It checks the draft binding against the request workspace and run.
- It checks the draft corpus against the requested package.
- It checks the report proposal ID and draft digest against the draft.
- It checks the report corpus, keyword digest, and counts against the draft.
- It checks the awaiting-review status on both documents.
- Any mismatch throws an integrity error. loadTikTokCodingView calls the verifier before it returns the view.
- tests/research-tiktok-report-api.test.ts adds a negative-control case for the verifier. It covers a valid pass, a mismatched draft digest, a mismatched count, and a mismatched requested package.

## Not yet proven

- The stage 7 test case is not run yet. The stage 4 API run predates this change.
- No frontend typecheck, test, or build run covers stage 5 or stage 7. Heavy checks and generation stay with the backend.
- No mounted browser proof exists yet. The backend routes for proposal, context, build, and coding read are not in src/ yet.
- Vietnamese labels in the TikTok panel have no humanizer review yet. Labels keep the awaiting-owner and proposed wording.

## Harness plan

- Outside Git: /tmp/ultimate-tiktok-report-reader-2026-10-10/harness-plan.md. It names the nearest fixture, helpers, routes, and process needs.

## Remaining journey

Select a retained S07 package. Load context, propose coding, open the cited report, build the saved Reader, list it, reopen it, retry exactly, and record a decision. The live run needs the accepted backend source commit.
