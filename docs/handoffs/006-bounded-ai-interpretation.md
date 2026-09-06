# Task 006 handoff — Bounded AI interpretation

Status: implemented on `feature/006-bounded-ai-interpretation`; keep PR #6 draft for review.

## Completed

- Added only migration `0004_analysis_interpretations.sql`; migrations 0001–0003 remain byte-identical.
- Added canonical execution-request, untrusted-output, and application-owned interpretation-envelope contracts.
- Added a versioned prompt that prohibits claims, causal inference, recommendations, approvals, and autonomous action.
- Added declared verified Result reader and injected provider-neutral `AiGateway`; production code contains no provider SDK, network call, API key, or fake prose.
- Added bounded gateway execution, AJV plus semantic citation validation, immutable persistence, idempotency without a second successful gateway call, prompt-drift conflict, and verified replay.

## Gateway boundary

The untrusted execution request contains only `contractVersion` and `resultId`. Provider/model, prompt ID/version/text/digest, output schema/version, timeout, and maximum output tokens are constructor configuration. The gateway receives exactly one verified immutable Result plus its artifact digest, the configured prompt/schema/limits, a run ID, and `tools: []`.

Gateway output is untrusted. AJV rejects missing or additional fields. Application validation then requires every citation to be an existing allowlisted Result JSON Pointer and rejects recommendation, approval, instruction, or autonomous-action language before any output artifact or interpretation row write. Application code creates IDs, timestamps, provenance, and the canonical envelope; gateway-supplied provenance is not trusted.

## Changed paths

- `contracts/analysis/market-snapshot-interpretation-request.schema.json`
- `contracts/analysis/market-snapshot-interpretation-request.generated.ts`
- `contracts/analysis/market-snapshot-interpretation-output.schema.json`
- `contracts/analysis/market-snapshot-interpretation-output.generated.ts`
- `contracts/analysis/market-snapshot-interpretation.schema.json`
- `contracts/analysis/market-snapshot-interpretation.generated.ts`
- `migrations/0004_analysis_interpretations.sql`
- `prompts/analysis/market-snapshot-interpretation-v1.txt`
- `src/platform/ai/ai-gateway.ts`
- `src/platform/ai/index.ts`
- `src/modules/analysis/result-reader.ts`
- `src/modules/analysis/interpretation-service.ts`
- `src/modules/analysis/market-snapshot-service.ts`
- `src/modules/analysis/validation.ts`
- `src/modules/analysis/index.ts`
- `scripts/generate-foundation-contract.mjs`
- `tests/integration/bounded-ai-interpretation.test.ts`
- `tests/integration/sqlite-foundation.test.ts`
- `docs/foundation-data-dictionary.md`
- `docs/STATUS.md`
- `docs/handoffs/006-bounded-ai-interpretation.md`

## Verification

- Focused Task 006 integration tests: 5/5 passed locally.
- `npm run check`: 32/32 integration tests passed locally, including nine-contract generation and strict TypeScript checking.
- `git diff --check`: passed locally.
- Fedora permission probe: live database, WAL, SHM, Data Pack manifest, Result artifact, and interpretation artifact were all mode `0600`; disposable output was removed.
- GitHub Check workflow on PR #6: pending pushed commit.

## Remaining limitations

- There is no live provider, SDK, API key, network call, model routing, tool execution, retry, queue, worker, budget accounting, UI, Box 3 proposal, approval, or autonomous action.
- The wording guard is a narrow defense in depth; schema and application shape prevent action/approval fields, while later business/legal evaluation remains required before any live-provider use.
- Artifact storage precedes the SQLite transaction, so a failed interpretation row write after a new artifact can leave an unreferenced content-addressed artifact for later operational cleanup.
- Concurrent same-identity execution is uniqueness-protected but not coordinated into one shared response; race/worker behavior remains outside this task.
