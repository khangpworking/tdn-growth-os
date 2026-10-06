# Handoff — Insight coding: full source context at approval time

Updated: 2026-10-05 (Asia/Bangkok)
Worktree/branch: `research-automation-v1` / `fix/research-real-world-audit`; base HEAD `0116091`, pre-existing uncommitted and untracked work preserved. No commit, push or PR.

Completed:

- Closes the review UX gap recorded in `research-insight-prompt-benchmark-audit-20261004.md` ("Static review: source context at approval time"). Root cause: the proposal checklist and the shared `entryList()` used by the propose/accept confirmations rendered only the entry title (the short coded span) and metadata lines. The full record was reachable only through the separate draft editor.
- Each checklist entry and each entry in the propose/accept confirmation now has a native `<details>` disclosure, "Xem toàn văn nguồn". It reuses the existing `SourceRecordView`, which shows the stored record text as-is (React text, `pre-wrap`, no trimming or normalization), record number, attribution, locator, source time, inclusion state and reason. The SHA-256 is not shown. A null text shows the existing explicit unreadable message. An index absent from the verified records shows an explicit "không có trong nguồn đã xác minh" problem line, never substitute text.
- `recordIndex` is resolved against `view.context.input.records`, the records of the verified view whose evidence bindings the loader checks against the context binding. PROPOSE/ACCEPT operations now carry that `records` array alongside their already-snapshotted `entries`, so the dialog renders from the snapshot taken when it opened.
- Lifecycle inspection: while a dialog is open, reload is disabled (`held`), opening needs no load failure or in-progress load, and a successful write's `setView` and `setDialog(null)` run in one batched continuation. The current code has no observed path that swaps data under an open dialog. The snapshot keeps that guarantee local to the dialog, so no separate lifecycle test was added.
- Toggling is a native DOM toggle with no React state, handler, fetch, model call, selection change or acceptance. Entry titles, selection keys/indexes, pending provenance lines, blocked holds, double-submit and confirmation guards are unchanged.
- Keyboard: `ConfirmDialog`'s Tab cycle selects `[tabindex]` but not `summary`. Without `tabIndex={0}`, the disclosure was unreachable by Tab inside the dialog. `ConfirmDialog` was not edited.
- CSS (scoped, existing tokens only): link-blue 13px/650 summary, and inside the disclosure the record text drops the editor's 320/240px inner scroll cap and keeps ink colour inside `.confirm-dialog`. Long text wraps through the existing `pre-wrap`/`overflow-wrap:anywhere` rules in the panel and the scrolling dialog body. No new colours, fonts, assets or motion.

Changed paths:

- `frontend/src/research-automation/InsightCodingPanel.tsx`
- `frontend/src/research-automation/insight-coding.css`
- `frontend/tests/research-insight-coding-ui.test.ts`
- `docs/handoffs/research-insight-source-context-ui-20261004.md` (this file)

Test gate (test-audit authoring):

1. Protects: at approval time, a short I10 literal phrase has its complete stored record (line break, negation outside the span, hearsay, hedge, markup-like text as text) beside it in the checklist and the confirmation, the span stays short, and toggling writes nothing and leaves exact selected indexes unchanged.
2. Fails on: removing the disclosure, truncating/rewriting the text, rendering it as HTML, widening the title span, toggling causing a write or mark change, or dropping the dialog Tab reachability.
3. Existing coverage had no source-context assertion. The existing first mounted test (semantic proposal → exact selection) was extended instead of adding a near-duplicate. A `records` override on the shared synthetic server adds one included record.
4. No production seam: it uses the real panel, the real `ConfirmDialog` and synthetic HTTP. No new exports.

Evidence: NOT RUN. Per lane instructions, no Windows tests, typecheck, build or generator were run, and no Linux checks were run from this lane. Planned focused commands for the parent's frozen Linux verification:

```
npm run frontend:validators
node --import tsx --test frontend/tests/research-insight-coding-ui.test.ts
npx tsc -p frontend/tsconfig.json --noEmit
npm run frontend:build
```

Unresolved:

- The test toggles via `summary.click()` and expects jsdom's summary activation behaviour to flip `details.open`. If the installed jsdom lacks it, those `open` assertions fail for an environment reason. Do not weaken them; report back.
- Impeccable: the skill instructions (SKILL.md, operate.md, craft-floor.md) and antislop-ui were read. `impeccable context` was not rerun in this lane because the parent had already run it. DESIGN.md and the surface brief were read directly. No browser or detector pass was made, so the visual result at 390px and in the dialog is unverified.
- No in-text highlight of the coded span(s) inside the full record. `Entry` exposes only `recordIndex`, and changing `insight-coding-ui.ts` was out of scope.
- The disclosure shows the record locator but not the source file path. This matches the existing draft-editor record view. With several source files, the locator alone may be ambiguous.

Next action: the parent audits the diff, runs the commands above on Linux, then decides on a browser pass (desktop and 390px, keyboard into the dialog disclosure).

Business decisions pending: none from this slice.
