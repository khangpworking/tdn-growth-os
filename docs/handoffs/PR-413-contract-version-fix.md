# Handoff — PR #413 contract version compatibility

Updated: 2026-10-26
Worktree/branch: /home/pkhang/lanes/v3s1, fm/v3-step1-preset-form.
Completed: Resolved remaining P2 contract drift. Explicit presets require start-v2 / autorun-keyword-v2; run-v3 carries the suggestion categoryId; new saved scopes use autorun-scope-record-v2. Legacy API versions still validate without the new fields, and saved scope v1 is still read. New fields under old versions are rejected by API schema, request service validation and saved-scope reader. Frontend sends keyword-v2; generated types refreshed.
Changed paths: contracts/api/research-automation-api.{schema.json,generated.ts}; src/modules/analysis/research-automation/{service,autorun-scope}.ts; frontend/src/research-automation/AutoRunCard.tsx; tests/unit/{autorun-preset,autorun-service}.test.ts; frontend/tests/research-autorun-card.test.ts; this handoff.
Evidence (commands, results, relevant revision): npm run contracts:generate, npm run typecheck, npm run frontend:typecheck and git diff --check pass. Contract-row regression passes with current schema; running that exact regression with the pre-fix HEAD schema fails at “startRequest: new field rejected under old version” (actual true, expected false). Temporary baseline test/schema removed afterward. Preset/service owner tests pass (14 tests); the final contract-row-only rerun passes. All fixtures and transports are synthetic.
Evidence: node --import tsx --test --test-concurrency=1 tests/unit/autorun-preset.test.ts tests/unit/autorun-service.test.ts tests/integration/research-automation-api.test.ts frontend/tests/research-autorun-card.test.ts passes (54/54), including legacy scope HTTP projection. Existing negative integrity controls emit expected stderr.
Unresolved: None for the requested P2 fix. No merge or deployment performed.
Next action: Push this commit to the existing PR branch; independent review and CI remain PR gates.
Business decisions pending: None. Approved report rules are unchanged.

## CI version-pin follow-up — 2026-10-26

Worktree/branch: /home/pkhang/lanes/v3s1, fm/v3-step1-preset-form; baseline 0e04f724.
Completed: Searched repository tests, frontend tests and fixtures for run response, saved scope, start request and keyword-answer contract pins. Only the current run-response assertion in v3plug-p2-contract.test.ts was stale; changed its expected string from v2 to v3. Saved scope already expects v2. Retained historical v1/v2 fixtures and all compatibility, suggestion-version and preset rejection assertions unchanged; the frontend start form still correctly emits v1 without a preset.
Changed paths: tests/unit/v3plug-p2-contract.test.ts; this handoff. No production changes.
Evidence: Before editing, the targeted V1 test failed with expected run-v2 / actual run-v3. After editing, node --import tsx --test --test-concurrency=1 tests/unit/v3plug-p2-contract.test.ts tests/unit/autorun-preset.test.ts passed 21/21, including v1/v2 validation, legacy scope reading and the v1 suggestion rejection. npm run typecheck and git diff --check passed.
Unresolved: None.
Next action: Commit and push to the existing PR branch. Never merge or deploy.
Business decisions pending: None.
