# Handoff — NEXT-MARKET-INTAKE

Updated: 2026-10-08
Worktree/branch: `ultimate-impl-sync1-codex` / `khangpworking/ultimate-market-intake`
Assigned base: `1c58d2532f254ec476ef71879cf589400d106927` (PR175 merged after independent review and full hosted Check).
Completed: bounded authenticated operator JSON intake -> retained evidence -> receipt-bound existing reader build-v1.2 -> exact immutable HTML read. This is implementation completion for the assigned intake slice, not overall Ultimate alignment, business approval, deployment or native source authenticity.
Changed paths:

- Existing reader API schema/generated contract, frontend validator registrations and declaration exports.
- New `src/modules/analysis/research-automation/reader-unit-spec-intake.ts` and allocated `reader-report-revisions.ts`.
- Explicitly granted `service.ts` reader constructor staging and two delegates; central API authenticated intake/envelope hooks only.
- Reader unit-price projection accepts the canonical field subset it actually consumes; calculation/renderer semantics are unchanged.
- Reader panel/client, new frontend interaction/error tests, canonical contract check, additive HTTP integration case and this handoff.

Evidence: Node24.15/npm11.12, synthetic fixtures and fake transports only. Test concurrency2 throughout. See exact commands/results below.
Unresolved: independent final exact-head review and full hosted `npm run check` before any coordinator merge; native listing captures/extraction and Market auto integration remain separate scopes. No full local suite was run or claimed.
Next action: coordinator independently reviews the pushed draft candidate, monitors exact-head full hosted Check and performs any authorized normal merge. Worker never merges/deploys.
Business decisions pending: U11 multi-code family statistic/release, U26 policy and U32 positive aggregate reconciliation remain escalated; U40 live paid acceptance is unauthorized.
Source implementation commit: `7dc02ce42d1e6ab5429e913b96fbdc9c229fc35d`.

## Validation and leases

| Check | Result |
|---|---|
| Affected backend/API/reader checks: `node --import tsx --test --test-concurrency=2 tests/integration/research-reader-report.test.ts tests/integration/research-automation-api.test.ts tests/unit/next-market-reader.test.ts tests/unit/sync1-market-corrections.test.ts` | 37/37 PASS. Includes actual authenticated multipart intake/build/read, optional owner declaration, exact bytes and source identities, rejected forged/mismatched bindings, old direct requests and exact1.0–1.3 HTML/metric replay. |
| Frontend affected checks: reader-unit-spec-intake, research-automation and pageindex-run-wiring | 20/20 PASS. Explicit action/owner/file gating, original bytes in multipart, receipt context/status checks, error/retry, saved evidence distinguished from rejected build, adjacent run/PDF behavior. |
| `tests/unit/reader-unit-spec-intake-contract.test.ts` | PASS. Original buildRequest equals assigned-base definition; old/new discriminants, required packet, pointer/unit fields and no client-authored route identity. |
| Backend `npm run typecheck` | PASS on source/API implementation. |
| Frontend `npm run frontend:typecheck` | PASS under canonical lease. No source changes since this check. |
| Canonical generation and staged `git diff --exit-code contracts/` | PASS under explicit lease. Only allocated reader API contract changed; generator registrations/declarations are additive. Generated browser JS is ignored and reproduced from its generator. |
| Working/staged whitespace checks | PASS; final committed range check before push. |
| Full hosted `npm run check` | Mandatory coordinator exact-head gate, pending; no baseline waiver. |

Canonical phase commits `f8cc6ba` and `b760992c27d563a97156a4034d511882b441cddc` were independently staged/generated and committed. Explicit canonical lease release: `msg_3ca2e0fa3a36`; explicit service/API lease release after passing adjacent checks and source commit: `msg_4fe894c4ffe1`. No generator or shared source edits occurred after their releases. No unfinished Sources branch was imported; later coordinator composition must preserve both owners' hunks.

New test-fixture corrections addressed a synthetic token lacking required digits, a bigint count assertion and asynchronous browser digest settlement. The schema generator's API-array/input-tuple representation is reconciled only after AJV validates the shared canonical definition. No prior test/assertion was deleted, skipped or weakened.

## Intake contract and operator path

The explicit reader panel action selects a build-request JSON file, exact listing-spec JSON files and optional separate owner quantity-declaration JSON files. It accepts the existing `reader-report-build-v1.2` request, including its attached product-list package, profile, source period and `market-unit-prices-v1` packet. This bounded UI does not create native listing captures or automatically extract specs; an operator must prepare the structured observations and their correct source pointers. It preserves source bytes and does not infer quantities from titles or sales average prices.

The packet's sources name exact SHA-256 hashes and LISTING_SPEC / OWNER_DECLARATION roles. Each record binds workbook row, marketplace, listing, variant, category, mass basis/count kind/durable spec group, price kind/conditions, quantity/unit and observation period. A JSON pointer resolves the whole observation in the exact uploaded document. An optional owner override resolves a separate document and may change quantity alone. Listing declarations and owner declarations are retained separately; neither authenticated owner intake nor digest verification authenticates the seller's claims.

New owner multipart upload: `POST /owner-api/workspaces/:workspaceId/research-automation/runs/:runId/reader-reports/unit-spec-intakes`. One `metadata` JSON field contains `reader-unit-spec-intake-v1`, metricPackageId, platforms and unitPrices; one `file:<sha256>` field per declared source contains its original bytes. Filenames are inert. Maximum 16 files, 2 MiB each, 8 MiB total and bounded metadata. Owner token/origin/write permission precede parsing. Canonical fields, exact hashes, UTF-8/JSON and whole packet/source/row bindings are checked before canonical publication. All uploaded sources must be used.

The existing content-addressed store and SQLite artifact registry retain original bytes plus a versioned receipt binding workspace/run/draft pair/package/workbook/actor/packet. No new persistence system, migration, source-board capability, runtime cap or manifest file is introduced. A repeated identical upload returns the same receipt without an extra source/report record. Read verification does not repair corrupt evidence.

New build envelope on the existing owner reader-report route: `reader-report-unit-spec-build-v1`, intakeSha256 and the unchanged build-v1.2 request. The receipt must be registered and match the exact current context/packet before building. Stored build provenance includes its receipt hash. A repeated envelope uses the original immutable revision and exact HTML bytes, without model/provider calls. The UI verifies response contracts/binding/status and requires a new explicit click after failure; there is no automatic retry or report approval.

## Compatibility and limits

The old `buildRequest` definition and build-v1 / v1.1 / v1.2 semantics stay unchanged. The new envelope selects the existing v1.2/input1.4/builder-v4 computation; it adds authenticated intake provenance rather than changing historical calculations. Old requests/artifacts/renderer bytes remain supported and exact retries do not regenerate. The historical direct retained-source path is preserved explicitly, not rebranded as authenticated operator intake.

U34 overall remains partial for native captures/extraction and auto-report integration; this task closes only the standalone operator JSON intake -> reader consumption gap as verified by the affected checks. No seller/provider authenticity, business approval or release is claimed. U33 advertising provenance remains absent; this task adds no ROAS/CPA, adSpend or adShare fields.

Vietnamese interface wording follows neutral analytical preservation rules. Pinned humanizer-vi SKILL and preservation rules at revision `576c80fb445a8b2e9ec1993a6490ab6529b89d12` were read; no report interpretation, prompt or historical source text was rewritten.

## Checklist evidence

| ID | State | Evidence / limit |
|---|---|---|
| U34 | DONE for operator JSON intake/reader slice; PARTIAL overall | Actual authenticated HTTP/UI path and exact-byte verification; native captures/extraction and auto remain outside scope. |
| U11/U26/U32 | ESCALATED | No new statistic, release, policy or reconciliation decision. |
| U40 | N/A | No live paid staging authorization or execution. |
| G01 | DONE | Assigned scope, partials and blockers recorded. |
| G02 | PARTIAL (hosted gate) | 37/37 affected checks and backend typecheck PASS; final exact-head full hosted check pending. |
| G03 | DONE for affected validation; hosted full gate pending | Frontend20/20 and frontend typecheck PASS. |
| G04 | DONE | Granted canonical lease, strict AJV validation, staged deterministic generation/diff PASS and durable release. |
| G05 | DONE | Scoped/granted files only; working/staged and final committed-range whitespace checks PASS. |
| G06 | DONE | Synthetic fixtures only; no runtime/private source data. |
| G07 | DONE | No application model/provider/collector calls. |
| G08 | DONE | Plain Vietnamese owner wording; source quotes/bytes are untouched. |
| G09 | DONE | Missing stays missing; no authenticity/approval/release/completion invented. |
| G10 | DONE | Old buildRequest unchanged; old1.0–1.3 HTML/metric replay, existing v1.2 consumption, new upload/build/retry/exact read verified. |
| G11 | DONE | Additive meaningful tests; no existing assertion weakened/deleted. |
| G12 | DONE | Required handoff fields, evidence, scope and checklist recorded; exact final SHA/PR delivered through fresh lifecycle. |
| G13 | N/A | No keyword collection/filter integration. |
