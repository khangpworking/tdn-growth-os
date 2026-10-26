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

## Fixture regeneration investigation — 2026-10-26

Updated: 2026-10-26.
Worktree/branch: /home/pkhang/lanes/v3s1, fm/v3-step1-preset-form; HEAD b98e6aa0860a17205ef1e21756f899eb2b60e33d.
Completed: Reproduced both S9 failures before changing any fixture. Ran the repository generator with ROOT=/home/pkhang/lanes/v3s1, OUTPUT=/tmp/pr413-fixture-regeneration-t6QuVV and --candidate, with its five forbidden environment variables unset. Decoded both archives and verified every member against its manifest SHA-256 and byte size. All five changed run.json files differ byte-for-byte only in research-automation-run-v2 → v3; sizes are unchanged. Of 289 members, 283 remain identical, five run.json members change, and one trial artifact is renamed.
Changed paths: This handoff only. Committed fixture files remain untouched; generated candidate and comparison.diff are outside the checkout at /tmp/pr413-fixture-regeneration-t6QuVV.
Evidence (commands, results, relevant revision): node --import tsx --test tests/unit/shopee-public-review-integration.test.ts: 98/100 pass, both S9 tests fail. Repository-wide search for shopee-public-f-plus found no other test owner. node --import tsx --test tests/unit/v3plug-p2-contract.test.ts: 20/20 pass. npm run typecheck: pass. Generator: 289 baseline files. comparison.diff contains unified diffs for every changed run.json and the renamed artifact payload.
Unresolved: Extra change beyond run.json contract version: trial-run/artifacts/sha256/6d/6dd1ba495ac8720fdfe06a022641de4909aa288c0b169a6cb5b2d0d2e09ae824 becomes trial-run/artifacts/sha256/9c/9ce3b4d60b82875d12f690afb6c83d1068b95891ca41fccd0c54d0a24cbb4f5a. Its only payload change is /scope/contractVersion, autorun-scope-record-v1 → v2 (1434 bytes before and after).
Next action: Owner must decide whether to include the scope-contract artifact rename in the fixture refresh. Stopped under the task's explicit scope guard; no fixture replacement, commit, push, merge or deployment.
Business decisions pending: DECISION NEEDED — authorize the additional scope-contract fixture change or select another repair.

## Authorized fixture refresh — 2026-10-26

Coordinator authorized the saved-scope v1 → v2 artifact rename as part of this PR’s contract-version follow-on. Reused the preserved generator candidate; independently verified both 289-member archives against all manifest sizes and SHA-256 digests, and checked that the only byte changes are the five run-version strings and the saved-scope version string. Replaced tests/fixtures/shopee-public-f-plus/{manifest.json,artifacts.json.gz}. Updated only the S9 fixture-provenance assertion and manifest revision from the historical baseline revision to b98e6aa0860a17205ef1e21756f899eb2b60e33d (the generator source HEAD), replacing the generator’s transient candidate marker. All behavioral assertions remain intact; no production code changed. The earlier DECISION NEEDED is resolved.

Preserved comparison diff:

```diff
Archive members: committed=289, regenerated=289
Removed: ['trial-run/artifacts/sha256/6d/6dd1ba495ac8720fdfe06a022641de4909aa288c0b169a6cb5b2d0d2e09ae824']
Added: ['trial-run/artifacts/sha256/9c/9ce3b4d60b82875d12f690afb6c83d1068b95891ca41fccd0c54d0a24cbb4f5a']
Changed: ['absent-run/run.json', 'exact-run/run.json', 'native-run/run.json', 'trial-run/run.json', 'unconfigured-run/run.json']

absent-run/run.json
--- committed/absent-run/run.json
+++ regenerated/absent-run/run.json
@@ -1,5 +1,5 @@
 {
-  "contractVersion": "research-automation-run-v2",
+  "contractVersion": "research-automation-run-v3",
   "runId": "aaaaaaaa-0000-4000-8000-000000000001",
   "workspaceId": "11111111-1111-4111-8111-111111111111",
   "revision": 8,
Only run contract version changed: True

exact-run/run.json
--- committed/exact-run/run.json
+++ regenerated/exact-run/run.json
@@ -1,5 +1,5 @@
 {
-  "contractVersion": "research-automation-run-v2",
+  "contractVersion": "research-automation-run-v3",
   "runId": "aaaaaaaa-0000-4000-8000-000000000001",
   "workspaceId": "11111111-1111-4111-8111-111111111111",
   "revision": 8,
Only run contract version changed: True

native-run/run.json
--- committed/native-run/run.json
+++ regenerated/native-run/run.json
@@ -1,5 +1,5 @@
 {
-  "contractVersion": "research-automation-run-v2",
+  "contractVersion": "research-automation-run-v3",
   "runId": "aaaaaaaa-0000-4000-8000-000000000001",
   "workspaceId": "11111111-1111-4111-8111-111111111111",
   "revision": 8,
Only run contract version changed: True

trial-run/run.json
--- committed/trial-run/run.json
+++ regenerated/trial-run/run.json
@@ -1,5 +1,5 @@
 {
-  "contractVersion": "research-automation-run-v2",
+  "contractVersion": "research-automation-run-v3",
   "runId": "aaaaaaaa-0000-4000-8000-000000000001",
   "workspaceId": "11111111-1111-4111-8111-111111111111",
   "revision": 8,
Only run contract version changed: True

unconfigured-run/run.json
--- committed/unconfigured-run/run.json
+++ regenerated/unconfigured-run/run.json
@@ -1,5 +1,5 @@
 {
-  "contractVersion": "research-automation-run-v2",
+  "contractVersion": "research-automation-run-v3",
   "runId": "aaaaaaaa-0000-4000-8000-000000000001",
   "workspaceId": "11111111-1111-4111-8111-111111111111",
   "revision": 8,
Only run contract version changed: True

Renamed artifact payload diff:
--- trial-run/artifacts/sha256/6d/6dd1ba495ac8720fdfe06a022641de4909aa288c0b169a6cb5b2d0d2e09ae824
+++ trial-run/artifacts/sha256/9c/9ce3b4d60b82875d12f690afb6c83d1068b95891ca41fccd0c54d0a24cbb4f5a
@@ -1 +1 @@
-{"capture":{"keywords":["synthetic jar"],"smartQuery":true},"contractVersion":"autorun-pick-record-v3","counts":{"deleted":0,"eligible":3,"notIncluded":1,"picked":3,"tokenGuardRejected":0,"walked":4},"excludedRows":[{"productBaseId":"1__104__204","reason":"NOT_MAIN_PRODUCT"}],"links":[{"brand":"Brand A","itemId":"101","productBaseId":"1__101__201","revenue":3000,"shopId":"201","url":"https://shopee.vn/product/201/101"},{"brand":"Brand B","itemId":"102","productBaseId":"1__102__202","revenue":2000,"shopId":"202","url":"https://shopee.vn/product/202/102"},{"brand":"Brand C","itemId":"103","productBaseId":"1__103__203","revenue":1000,"shopId":"203","url":"https://shopee.vn/product/203/103"}],"packageId":"bbbbbbbb-0000-4000-8000-000000000082","pickRuleVersion":"autorun-pick-v2","principalProductIds":["kalodata:12345"],"runId":"aaaaaaaa-0000-4000-8000-000000000001","scope":{"capture2":null,"category":{"category":null,"interviewMatch":null,"productType":null,"reason":"NO_CATEGORY_DATA","shares":null,"threshold":0.8,"top":null},"contractVersion":"autorun-scope-record-v1","keyword1":"synthetic jar","keyword2":{"candidates":[],"chosen":null,"modelVariants":"NO_TITLES","titleCount":0},"runId":"aaaaaaaa-0000-4000-8000-000000000001"},"terms":["synthetic"],"urls":["https://shopee.vn/product/201/101","https://shopee.vn/product/202/102","https://shopee.vn/product/203/103"],"workspaceId":"11111111-1111-4111-8111-111111111111"}
+{"capture":{"keywords":["synthetic jar"],"smartQuery":true},"contractVersion":"autorun-pick-record-v3","counts":{"deleted":0,"eligible":3,"notIncluded":1,"picked":3,"tokenGuardRejected":0,"walked":4},"excludedRows":[{"productBaseId":"1__104__204","reason":"NOT_MAIN_PRODUCT"}],"links":[{"brand":"Brand A","itemId":"101","productBaseId":"1__101__201","revenue":3000,"shopId":"201","url":"https://shopee.vn/product/201/101"},{"brand":"Brand B","itemId":"102","productBaseId":"1__102__202","revenue":2000,"shopId":"202","url":"https://shopee.vn/product/202/102"},{"brand":"Brand C","itemId":"103","productBaseId":"1__103__203","revenue":1000,"shopId":"203","url":"https://shopee.vn/product/203/103"}],"packageId":"bbbbbbbb-0000-4000-8000-000000000082","pickRuleVersion":"autorun-pick-v2","principalProductIds":["kalodata:12345"],"runId":"aaaaaaaa-0000-4000-8000-000000000001","scope":{"capture2":null,"category":{"category":null,"interviewMatch":null,"productType":null,"reason":"NO_CATEGORY_DATA","shares":null,"threshold":0.8,"top":null},"contractVersion":"autorun-scope-record-v2","keyword1":"synthetic jar","keyword2":{"candidates":[],"chosen":null,"modelVariants":"NO_TITLES","titleCount":0},"runId":"aaaaaaaa-0000-4000-8000-000000000001"},"terms":["synthetic"],"urls":["https://shopee.vn/product/201/101","https://shopee.vn/product/202/102","https://shopee.vn/product/203/103"],"workspaceId":"11111111-1111-4111-8111-111111111111"}
```

Validation and final handoff:

- Completed: Authorized fixture refresh and exact source-revision pin; full comparison diff preserved above.
- Changed paths: tests/fixtures/shopee-public-f-plus/{manifest.json,artifacts.json.gz}; tests/unit/shopee-public-review-integration.test.ts (provenance pin only); this handoff.
- Evidence: node --import tsx --test --test-concurrency=1 tests/unit/shopee-public-review-integration.test.ts tests/unit/v3plug-p2-contract.test.ts passed 120/120 (100 Shopee integration + 20 P2 contract), zero failures/skips. Both S9 owners passed. npm run typecheck passed after the final assertion edit; git diff --check passed. Initial test invocation was stopped because it had loaded the historical provenance assertion; the complete final rerun covers the final files.
- Review: Only the authorized six member payload changes, matching manifest digests/membership and source revision pin changed; behavioral assertions remain intact. No production or test seams added.
- Unresolved: None. Coordinator authorization resolves the previously recorded scope decision.
- Next action: Commit and push to the existing PR branch; independent review and CI remain PR gates. Never merge or deploy.
- Business decisions pending: None.
