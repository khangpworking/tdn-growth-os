# Handoff — research content acceptance v1 (pre-code)

Updated: 2026-10-02

Later source work is recorded in the linked inventory: an alternative Dami
capture is now retained privately, with provider-reported dates mapped in a
new package version. The source gaps and proposed assignments below are the
historical pre-code checkpoint, not current source-readiness claims. They do
not override the literal grammar review or authorize report admission.

GPT follow-up: **AMEND**, not implementation approval for C1. Read the
independent review disposition at the top of the task document and
[verified source inventory](research-source-inventory-20261002.md). Date-unknown
context must not be blocked from all qualitative coding; category source
discovery remains system-owned; M07 inventory is not a completed peer comparison.
The source checks found no reusable review rows in the inspected stores and
did not locate the historical Task 016 page. Source date mapping remains
unverified. Claude's proposed assignments below are historical proposal details,
subject to that review; no production code was changed.

Worktree/branch: `research-automation-v1`, `fix/research-real-world-audit`, pinned
checkpoint `53538fc095ffd092e5f36647b2098ed9c11398bb` (draft PR #110). Not committed.

Completed: froze a 30-section content acceptance matrix with J/T/F case states,
seven shared families, failure categories and next action per row. Proposed one
gated code task for Claude. Documentation only, for independent GPT audit.

Changed paths:

- `docs/tasks/research-content-acceptance-v1.md` (new)
- `docs/tasks/research-30-section-remediation-plan.vi.md` (dated addendum inserted
  before "Phạm vi"; historical content unchanged)
- `docs/handoffs/research-content-acceptance-v1.md` (new)

Written with the Write/Edit tools, since there is no `apply_patch` here. No other
repository writes.

Evidence: read-only. I read the assigned docs, the code/schema facts cited in
the matrix, and only the listed artifact metadata/receipts. **No tests,
typecheck, build, scripts, browser, SSH, provider call, DB access, download,
commit or push.** A local `node -e` read JSON key shapes and counts from the
artifact files. No raw review, payload value, screenshot or private identifier
was copied into Git.

Key verified source gaps:

1. All three real cases contain only Kalodata captures, taken at `9355f57`
   before exact URL intake. There are no Shopee review rows and no Serp/dated
   documents.
2. Exact jelly: 0 selected, collection skipped, replay `NO_USABLE_OBSERVATIONS`.
   No admitted content for shop `78085196` / item `17678138164`.
3. Thermos/fan: M05 (78 literal values), M06 (39 window records) and unranked
   M07 cover three auditor-selected products. They are not the category.
4. Kalodata field meaning, window, timezone and additivity have no retained docs
   with locators in Git. M03 sums stay blocked (`SEM`). Metric is absent
   (`SRC` for M03/M04).
5. The review row schema's optional `createdAt` predates any live capture. The
   real date key, format and meaning are NOT_VERIFIED. The corpus projects no
   date today.

Proposed first code task: **C1 review-date projection and period eligibility**
(`research-review-corpus-v2` / `apify-shopee-review-row-v2`). It is gated by
read-only check RC-1 on the retained task-016 page. Owned paths, callers,
v1 replay compatibility and test boundary are in §6 of the task doc. I04 was not
chosen: there is no real corpus and its rule table is unpinned. C2 (L bridge for
I04/I05/I07/I08) follows SA-1, the rule pin and C1.

Unresolved / NOT_VERIFIED:

- Whether a jelly exact collection or any thermos/fan review corpus exists on
  Fedora or elsewhere (RC-2).
- Whether the task-016 raw page is still retained (RC-1).
- Whether Kalodata offers review text.
- Which commit produced replay v3.
- Whether the C1 schema registration in `scripts/generate-foundation-contract.mjs`
  conflicts with another writer's shared-contract ownership. GPT to confirm.

Next action: GPT audits the matrix and categories, runs RC-1/RC-2 on Fedora
read-only, then assigns or revises C1.

Business decisions pending: none now. One batched conditional owner question
(SA-2: exact Shopee listings for thermos/fan Insight, plus peers for M07/I13)
only if review-text availability cannot be resolved from retained docs.
Business-session review is needed for the I04–I08 Vietnamese literal rules
(C2), and for the review-date meaning only if the actor docs are silent.
