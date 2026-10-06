# B2: Insight coding owner UI

Date: 04/10/2026. Unreleased worktree, branch `fix/research-real-world-audit`.
Frontend only; builds on the B2 owner transport in `research-b2-insight-coding.md`.
Surface brief: `docs/frontend/research-insight-coding-surface.md`.

## Changed paths

- `frontend/src/research-automation/insight-coding-ui.ts` (new): pure helpers.
  Readable labels, quote-occurrence search, UTF-16 span checks (no split surrogate
  pairs), history grouping, selection keys, local rule/draft checks mirroring the
  server rules, body-size guard.
- `frontend/src/research-automation/InsightCodingSpanPicker.tsx` (new): exact
  record view (single text node, original whitespace) and the quote-occurrence
  picker.
- `frontend/src/research-automation/InsightCodingRuleForm.tsx` (new): blank rule
  form with optional I10/I13 corpora, explicit members, a blank codebook and I13
  first-occurrence spans.
- `frontend/src/research-automation/InsightCodingDraftEditor.tsx` (new): local
  draft of I06, I09 (including relations), I13 mentions and corpus
  assignments/dispositions, with qualifiers, counterevidence and provenance.
- `frontend/src/research-automation/InsightCodingPanel.tsx` (new): adopt →
  propose → accept → report, with frozen confirmations, read-back and exact retry.
- `frontend/src/research-automation/insight-coding.css` (new): `.ic-*` classes
  scoped under `.ic-panel`, using existing tokens only.
- `frontend/src/research-automation/ReportVersionsPanel.tsx`: adds the
  "Duyệt gán mã Insight" toggle and a lazy-loaded panel keyed by `runId:pairId`.
  `insightBusy` joins the existing mutual busy guards with Metric source and
  classification.
- `frontend/tests/research-insight-coding-ui.test.ts` (new): one mounted flow and
  one unmount test.
- `docs/frontend/research-insight-coding-surface.md` (new) and this handoff.

Shared CSS, the API clients, generated files, the backend, existing tests and
shared status/plan files were not touched.

## Behavior

### Read and source states
- Each mount reads `loadInsightCoding` for the exact pair being viewed.
- Records are shown unmodified, with counts by state: included, excluded,
  unreadable.
- Each state has its own copy:
  - not found: no retained review source; add one in a new version;
  - integrity failure: stop and report it;
  - connection failure;
  - locked: no OWNER token;
  - not the latest pair: read-only history;
  - stale rule;
  - superseded proposal;
  - pending or disagreement items: shown, but cannot be accepted;
  - uncertain write: retry with the same request.

### Rules
- The rule form starts blank, and `ruleId` is a fresh UUID.
- A next revision copies only the explicitly selected current rule, with
  revision+1.
- Corpus members are an explicit, searchable checklist. "Membership complete",
  "multi-code", period, frame and channel are explicit; empty means null, never
  guessed.
- The codebook starts empty. I13 code labels equal the literal phrase.

### Quote selection
- The owner types a quote or takes the browser highlight.
- Every occurrence is listed with surrounding words. A repeated quote must be
  chosen explicitly.
- Offsets are derived from the exact record. Owners never see hashes or indexes.

### Draft, proposal and acceptance
- Draft items are local until "Xem lại và lưu đề xuất".
- `previousProposalId` is the latest proposal of the selected rule. It is shown
  as a readable "Nối tiếp đề xuất N" line in the confirmation.
- Acceptance is a checklist of the selected proposal's items. Hidden-page picks
  are counted and listed in the confirmation.
- Unpicked items stay pending, and corpora never shrink.
- Acceptance never creates a report.

### Report creation
- A separate checklist of receipts for the chosen proposal feeds
  `automation-insight-report-revision-v1` (KEEP Metric, KEEP review,
  `previousPairId` = viewed pair).
- It is blocked unless the proposal is the latest of a current rule and the
  parent source state is KEEP/KEEP.

### Write safety
- Each write uses a frozen snapshot and a synchronous in-flight guard.
- After adopt, propose or accept, the view is re-read. The code checks the
  returned `evidenceId`, its kind and the canonical request (accept compares
  against the server's ordered selection), then selects the created item
  explicitly.
- Rejected, authorization, conflict or not-found errors clear the retry and
  reload; the draft is kept.
- Connection or unknown errors keep the exact operation for "Thử lại đúng thao
  tác". The UI never retries automatically or generates a new key.
- Results after unmount are ignored, with no read-back.

### Dirty-state guards
- An open rule form, editor, draft, picks, dialog or pending retry marks the
  parent busy, which locks version switching and Metric controls, and sets a
  `beforeunload` warning.
- Changing the rule is locked while a draft exists; "Bỏ bản nháp" asks for
  confirmation.

### Token
- The owner token is used from props only and is never stored.

## Claude handoff checks (before GPT integration)

Per instruction, Claude ran nothing on Windows: no typecheck, tests, generation or
build. The original requested Linux checks were:

- `npm run typecheck` (frontend tsconfig: `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`).
- `node --import tsx --test frontend/tests/research-insight-coding-ui.test.ts`,
  plus `research-report-versions.test.ts` and
  `research-metric-classification.test.ts` for regressions.
- The frontend Vite build.

## Blockers and risks for GPT

1. **CSS under the Node test runner.** `InsightCodingPanel` imports
   `./insight-coding.css`.
   - `ReportVersionsPanel` loads the panel through `React.lazy`, with a
     fallback message if the import fails, so existing tests never evaluate
     the CSS.
   - The new test registers a `node:module` load hook that turns `.css` into
     an empty module.
   - Confirm that the hook composes with `tsx/esm/api` `tsImport` on Node 24.
     If not, move the hook into a shared test loader (outside my ownership).
2. **Vite chunking.** The lazy import creates one extra chunk. Confirm the build
   and any bundle-size budget.
3. **Finish review.** The finish review, synthetic desktop/mobile captures and
   the DESIGN.md note remain open. The surface brief says "Not yet reviewed".
4. **Domain policy, not invented here.**
   - `coderRole` is free owner text.
   - Basis is chosen per item, starting blank, and is only a declaration.
   - Whether a real study needs named coder roles, or a second coder before
     acceptance, needs an owner decision before real coding.
5. **Scale.** Proposal items page at 30 and members at 20. The record select
   shows at most 200 filtered options. Proposals near the 10 000-item and 8 MiB
   limits were not profiled in a browser.
6. **Abandoning an uncertain write.** As in Metric classification, a pending
   ambiguous write keeps the panel busy until an explicit retry succeeds or is
   definitively rejected; the only way to abandon it is a page reload. Product
   may want an explicit "verify by reload, then discard" action.
7. **No real-data decisions or provider calls were made.** All fixtures are
   synthetic.

## GPT integration and Linux proof, 04/10/2026

The Claude job `task-musvw1ba-xcdz4z` completed before GPT took ownership.
The mounted fixture initially failed the actual API schema: record locators
contained `reviews.json#` instead of JSON pointers. GPT corrected the fixture
to `/0` and `/1`; no production validator or assertion was relaxed.

Confirmed and repaired at the owning UI boundary:

- Collapsing the rule form or unfinished annotation editor unmounted its local
  inputs and released the navigation guard. The forms now remain mounted but
  hidden. Rule switching and replacing a draft stay blocked until explicit
  discard or successful verified save. Discard has its own confirmation.
- A failed history refresh also unmounted those forms. Keep the last verified
  view mounted while the visible failure blocks writes; successful retry restores
  eligibility without clearing input. This does not approve stale data.
- Fixed code phrases could not select occurrences after the first fifty, and
  could not follow the suggested longer-quote workaround. The picker now exposes
  successive batches without changing the fixed phrase or UTF-16 offsets.
- Disabling the underlying form before modal mount lost its opener in Chrome.
  The panel captures the opener before opening and restores focus after the form
  is enabled again. Shared ConfirmDialog is unchanged.

The unused `insight-coding-span.ts` worker helper was removed after confirming
zero production/test callers; the UI's existing quote helper remains the owner.

Evidence, Linux scratch only:

- Frontend typecheck and production build PASS. The main app still reports the
  existing >500 kB chunk warning; this checkpoint does not resolve it.
- Five affected frontend files: **18/18 PASS**, including five mounted Insight
  tests. Collapse, refresh-loss and >50 occurrence regressions each failed before
  their respective production repair and passed after it.
- Synthetic Chrome desktop 1440×1000 and mobile 390×844: rule adoption,
  duplicate-quote choice, proposal, acceptance and separate report request PASS.
  Four explicit mocked writes per viewport; KEEP/KEEP and exact second occurrence
  checked. Collapse preserves input; Escape cancels without a write and restores
  focus. No page errors or horizontal overflow. Preview process was stopped.
- Browser uses mounted production components and mocked transport. It does not
  prove real persistence, report generation, real-data coding or business approval.

Logs and screenshot copies are outside Git under
`artifacts/research-execution-20261003/`: `tdn-b2-ui-red.log`,
`tdn-b2-read-red.log`, `tdn-b2-quote-red.log`, `tdn-b2-ui-green-final.log`,
`tdn-b2-ui-build-final.log`, `tdn-b2-ui-browser.log`, `desktop-editor.png`,
`mobile-editor.png`, `mobile-receipt.png`. The successful browser run preceded
the final refresh-failure-only repair; focused tests and build include that repair.

Still open: independent finish/design approval, full release checks, native
highlight behavior on physical devices, the wider I09/corpus browser journey,
and same-build real three-case web/PDF acceptance. Manual coding UI is an R1
supporting path, not automatic AI coding or R2 completion. No section completion
count is increased. No commit, merge, deployment, provider calls or live writes.
