# Handoff — authentic private source default coding

Updated: 2026-10-09 (implementation in progress; not settled)

Worktree/branch: `ultimate-impl-sync1-codex`, `khangpworking/ultimate-private-default-coding-sol`, clean new branch from reviewed main `e4b78f01b573d8284235fe06e693d587ffaabca7`. Frozen reader branch/head `59d6343919e104b157a1ac26db6d542f0684c8ad` preserved, no unmerged reader imports.

Completed:

- Actual audit confirmed source-only renderer22 can authenticate retained private corpus but historical default coding context/replay cannot consume it.
- Independent `private-insight-source.ts` reconstructs and compares the closed safe view, validates exact collection/page/locator alignment and preserves original quotes, rating presence/state/value, text states, admissions and locators. Only server-side native listing/review identity determines exact duplicate exclusion; identifiers never cross the projection boundary. Conflicting source-visible versions fail closed, all retained rows remain visible, missing identities and equal text with distinct native identities stay separate. No author-based join or person count.
- This source projection checkpoint is not the owning service/API/model/report deliverable. Existing service/source-only behavior remains unchanged until serial integration leases arrive.

Changed paths: new `src/modules/analysis/research-automation/private-insight-source.ts`, `tests/unit/private-insight-source.test.ts`, this handoff.

Evidence:

- Pinned Node24.15.0/npm11.12.1, `node --import tsx --test --test-concurrency=2 tests/unit/private-insight-source.test.ts`: **3 PASS**, `/tmp/tdn-private-coding-projection-tests.log`.
- `npm run typecheck`: **PASS**, `/tmp/tdn-private-coding-projection-typecheck.log`.
- Synthetic Foundation3/SQLite/CAS fixtures only; no application provider/model call or runtime data. No local full suite or generation.

Leases and design:

- Fresh task `task_0254b7e8d058`, dispatch `ctx_7e7c397355e0`, sole run `run_adc3551f8ed8`.
- Clean placement/independent new paths granted `msg_12410b4508bf`; actual ACK `msg_8a29c016966e`.
- Additive version design/native dedup policy and exact new-private branches in existing `insight-coding.ts`, `insight-default-coding.ts`, `insight-model-execution.ts` granted `msg_851e8545f8e2`.
- Renderer25 reserved (renderer23 already belongs to reviewed crosscheck); preserve source-only22 and historical default21. Private projection-v1, binding/default request/source/root/proposal/evidence-v2, model input-v2/prompt6, snapshot5. Existing immutable ledgers and generic exact default report selection suffice: **no DDL or migration**.
- GLOBAL/central/API/UI grants pending. Exact requested schema and UI path list sent `msg_ac76e1cb1672`; no edits to those paths yet. One GLOBAL writer and one central service writer at a time; only named reviewed main composition, no sibling WIP.

Unresolved:

- Actual authenticated no-adoption request, fake model execution, immutable pending proposal/snapshot, explicit report/read/retry, public/model/artifact privacy scans and historical compatibility remain to implement under serial grants.
- New private-coded owner reader support is **not claimed**. Frozen reader59 does not support the new renderer25/snapshot5; this task targets the owning retained HTML/report/read flow.
- Source text is verbatim and may contain personal data. Metadata stripping is not free-text anonymization. No native reviewer metadata/author ID/hash/key/profile in projection or model/report artifacts.

Next action: implement accepted additive coding/execution branches; receive canonical and central leases after current Metric/U16 phases release, complete owning acceptance then commit/push/draft PR and exact-head handoff. Coordinator owns independent review, full hosted exact-head check and normal merge; worker never merges.

Business decisions pending: U11 statistics/release, U26 policy, U32 aggregate/platform-person sums and U40 paid acceptance remain blocked. Pinned humanizer-vi `576c80fb445a8b2e9ec1993a6490ab6529b89d12` SKILL/preservation rules read; no new Vietnamese interpretation or application prompt integration in this checkpoint.
