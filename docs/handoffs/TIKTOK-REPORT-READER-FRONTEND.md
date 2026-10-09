# TikTok report and Reader frontend handoff

Branch: khangpworking/ultimate-tiktok-reader-frontend-claude
Source base: 48d85b1 (stage 4 commit, Add TikTok coding and saved Reader owner panel)
Current stage: stage 5 (stale-state and refresh repair, source only)

## Verified so far

- Interface commits 9c8b2ab and 9fafed0 merged. Generated TikTok types and nine standalone validators import from the generated contract.
- frontend:validators exit 0 (log: logs/validators.exit).
- frontend:typecheck first run exit 2: TikTokReadCitation.quote does not exist. Fixed in stage 4.
- frontend:typecheck second run exit 0 after the fix.
- research-tiktok-report-api.test.ts exit 0, 3 cases: exact-identity build, mismatched report digest rejection, no-token no-request.

## Stage 5 changes (source only, not yet checked)

- TikTokReportPanel.tsx: clears source, context, coding view, and digests when the selection changes. It aborts an earlier open-coding request. It ignores async results after unmount or selection change. It calls onBuilt after a successful build.
- ReaderReportPanel.tsx: optional refreshToken prop reloads the saved Reader list. Existing variants and behavior are unchanged.
- RunView.tsx: holds a build counter and passes it to both panels.

## Not yet proven

- No frontend:test, frontend:typecheck, or frontend:build run for stage 5. Heavy and generation remain with the backend.
- No mounted browser proof. The backend routes for proposal, context, build, and coding read are not in src/ yet.
- Vietnamese labels in the TikTok panel have no humanizer review yet. Labels keep the awaiting-owner and proposed wording.

## Remaining journey

Select a retained S07 package. Load context, propose coding, open the cited report, build the saved Reader, list it, reopen it, retry exactly, and record a decision. The live run needs the accepted backend source commit.
