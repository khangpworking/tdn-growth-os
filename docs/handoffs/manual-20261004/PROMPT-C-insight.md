# Assignment C: address generic Insight coding gaps identified by the semantic audit

First read:

`C:/Users/Admin/Documents/Codex/2026-08-27/cou/work/research-automation-v1/docs/handoffs/manual-20261004/COMMON.md`

Work only on C. This task is independent of A. Do not change A/B-owned files. Do not resume the whole 30-section goal or dispatch live model/provider tests.

## Outcome

Use the completed business-semantic audit to improve generic Insight coding behavior while preserving located evidence, conservative uncertainty and pending human review. Separate a proven software bug, a model omission, an unresolved interpretation and missing eligible source material. Do not optimize for a private expected count.

## Read and verify evidence

Read `docs/handoffs/research-insight-real-pilot-results.md`, current `insight-model-execution.ts`, `semantic-coding-response.ts`, and the adopted method authorities under `docs/research/method-configurations-v1/` plus `method-configurations-v1-adoption.md`.

The section specs in `docs/research/section-methods-v1/sections/` provide background but may retain old PROPOSED/DRAFTED headers. Use the adoption register/current authority to resolve policy; do not silently promote an old spec.

Private read-only audit:

`C:/Users/Admin/.codex/private/tdn-insight-pilot-20261004/construct-prompt-followup/pilot-business-audit-construct.md`

Expected SHA-256:

`653efbfa2f7689fd8011c84efb26f0bf1b8c42f29e270c45633b39686a2dd69d`

Structured audit:

`C:/Users/Admin/.codex/private/tdn-insight-pilot-20261004/construct-prompt-followup/pilot-business-audit-construct.json`

Expected SHA-256:

`179eb881a8345f44aecba013cc135919143336930789b36646561fe997fb76f1`

The same directory contains retained prompt, outcomes, comparison, annotations and exact-replay verification; read only what a finding requires. Do not copy raw source/private reference into the repository or treat it as a human-labelled holdout.

Audit verdict on 20 retained source records: I06 PASS for one narrow record-local order; I10 PASS for 42 distinct record-code memberships (44 span assignments). I02/I04/I05/I07/I08/I09/I13 remain NOT_READY. All coding stays PENDING_AI; application acceptance is zero.

## Owned paths

- `src/modules/analysis/research-automation/insight-model-execution.ts`, limited to generic prompt/input behavior relevant to the findings.
- A new helper under the same module only if it solves a demonstrated problem without creating another orchestration layer.
- New focused tests under `tests/unit/` or `tests/integration/` with unique names for this task.
- Your own result handoff and, if needed, a proposed semantic clarification document.

`semantic-coding-response.ts` is read-only initially. If its validator has a proven defect, report the minimal proposed hunk for coordinator assignment. Do not change schemas, migrations, service/API, UI, selected-insight-projection guards, acceptance roles or stored reference data.

## Priority findings

1. I05: clear negative/evaluative clauses were omitted even though the same clauses appeared in other families; identical aggregate counts hid the regression. Add a generic family-by-family clause coverage/self-check at generation, not hard-coded record IDs or a fallback that invents sentiment.
2. I02/I09: directly stated partial context/current states were inconsistently retained. Apply the same source-eligibility rule to equivalent evidence; never create empty coverage rows or infer the missing desired side/gap.
3. I04: literal quantity co-text and unknown actor attribution were given stronger interpretations. Preserve actor/quantity ambiguity, distinguish relevant co-text from established counterevidence, and retain future intention separately from completed conduct.
4. I06/I10: distinguish uncertainty about the narrow coded claim from limits on stronger claims. Do not clear disagreement merely to pass selection, change the guard, authenticate actors or assert causal order. Literal topic assignments must keep access to meaning-critical enclosing context; repeated spans do not increase record counts.
5. I07/I08/I13: some positive interpretations remain unresolved or are absent from this packet. Do not force positive examples, declare empty arrays equivalent to no reason/barrier/brand, or collect data just to fill a test.

## Work checklist

1. Produce a short finding→code/prompt→expected behavior map using the audit's finding IDs. Identify anything needing new business policy; isolate it rather than blocking independent corrections.
2. Inspect how prompt bytes/configuration are retained. Make a generic revision while keeping old attempts and exact retries bound to their original stored prompt/input. Existing immutable executions must remain replayable; do not rewrite history or change expected old hashes.
3. Avoid a second model call solely for phrasing. Use humanizer-vi for Vietnamese interpretation copy where relevant, preserving raw source spans and structured coding.
4. Fix demonstrated deterministic code defects if within ownership. Prompt self-check wording alone does not prove semantic coverage; state that distinction.
5. Run appropriate Linux checks using a separate disposable snapshot from A. Existing insight execution/response tests can verify stored lifecycle, exact offsets, pending provenance, retries and invalid payload rejection. Use synthetic inputs for any new tests. Do not add string-search tests that merely assert a prompt contains your wording, or mock a desired response and call that evidence of model improvement.
6. Write a benchmark proposal using the same retained source/rules plus independently prepared other-category cases, before any new calls. Include method-level coverage, unsupported claims, polarity/negation, attribution, partial-state eligibility and source-locator validity. Record cost/latency separately and avoid accuracy claims from an AI-assisted development reference. Fresh calls and acceptance remain with the coordinator.

Suggested targeted Linux checks, selecting only tests affected by your edits:

```bash
npm run typecheck
node --import tsx --test tests/unit/research-semantic-coding-response.test.ts
```

Find the existing insight execution tests by searching file content before choosing the appropriate integration subset. Do not assume a filename from memory or run the entire repo suite for a wording-only change. If you change a retained execution behavior, verify historical/exact retry preservation using synthetic transport, with zero live calls.

## Deliver

Write `manual-C-result.md` with the generic delta, file hashes, actual Linux proof, unresolved disposition/policy points and the proposed real-model benchmark. Explicitly report that offline checks do not establish fresh model semantic quality. Do not adjudicate private rows, inflate counts, claim readiness for all nine families, commit/deploy or call a model/provider. Stop after the bounded handoff.

