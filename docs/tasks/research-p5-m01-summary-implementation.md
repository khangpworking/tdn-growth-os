# P5.2: M01 bounded AI descriptive summary — implementation plan

Scheduling note, 2026-10-03: retained as a design proposal, not an active coding
assignment. The owner's three-lane breadth correction in execution plan v2.4
prioritizes B1-A/B/C. Do not resume this M01 expansion automatically or treat it
as a dependency of independent Market/Insight method families. Existing serious
correctness/replay defects may still be fixed without expanding this proposal.

Date: 2026-10-03. Worktree `fix/research-real-world-audit`, baseline `0116091`
plus the dirty tree. This is a design document only. No production code, test,
migration, contract, generation, typecheck, build, provider call or database
access was done for it. Every file:line below was read in the current tree;
root should re-check line numbers after its own concurrent edits.

## 1. Outcome

A Market report's M01 currently shows an unranked inventory: each record with its
full provenance, 26 records over roughly 20 printed pages. After this slice:

- M01 shows a **SUMMARY_DRAFT** (`HUMAN_REVIEW_REQUIRED`, layer 3) written by a
  model in Vietnamese. Its statements contain no numbers. Each statement cites
  eligible claims. Under each statement, code renders that claim's value, unit,
  period, scope and a link to the trace.
- M01 also renders, from code:
  - conflict sets;
  - material limitations;
  - the status of the AI execution.
- The full M01 trace moves to M13 behind resolvable anchors. The trace is the
  unchanged inventory renderer, so no evidence is removed from web or PDF.
- The execution uses the existing I14 execution owner and the
  `analysis_research_automation_ai_executions` ledger. Report replay, view and PDF
  never call a model.
- An initial run makes at most one dispatch. Each explicit revision attempt makes
  at most one new dispatch. Uncertainty is terminal.

This is not completion: `completedAnalyticalSections` stays 0, and M01 keeps
state `EVIDENCE_INVENTORY`.

## 2. Authority

| Source | Binding content |
| --- | --- |
| Business turn `01a10252-6ac9-76b0-9f86-b33230dca865`, thread `01a0a8fd-02d2-7e71-ba4c-244930d054bd` (2026-10-03) | See the list below. **This is semantics approval only, not authority for provider calls.** |
| `docs/research/method-configurations-v1/synthesis-ai-profile.md` D11 (l.12) | M01 is a downstream inventory. A separate draft summary may cite it. Relevance, priority and conclusions are excluded. |
| same, D12 (l.28) | `SUMMARY_DRAFT` → M01, layer 3, `HUMAN_REVIEW_REQUIRED`. |
| same, D12 (l.56) | Numeric outputs bind to verified claim IDs and the renderer inserts the values. String scanners cannot prove absence. **Optional automated flags are warnings only.** A closed schema excludes score and rank. |
| same, D12 (l.62) | Retain config, prompt, input, output and validator. Replay reuses the output. Regeneration is a new attempt. |
| `docs/tasks/research-automation-execution-plan-v2.vi.md` l.130–133 | P5.2: claim bindings and limits per statement. P5.3: numbers only from verified bindings. P5.4: retain input, model, prompt and response; view and PDF never call AI. P5.5: a stored insufficient state. |
| same, l.143 | P6.4: the full trace goes in an appendix, not tens of pages in the conclusions. |

What the business turn approves (M01 AGREE under A41 synthesis profile v1, `exactQuestionOrUNSET`):

- `ownerQuestion` stays UNSET. Catalog order is not a ranking.
- SUMMARY_DRAFT is allowed with HUMAN_REVIEW_REQUIRED, and needs no approval per fixture.
- The summary uses only eligible, replayable claims, and keeps source, period, scope, conflicts and limits.
- Code binds numbers and citations.
- The model may not write numbers, comparisons or verbal quantification.
- It may not state an owner conclusion, direction, demand or TAM, or a recommendation.
- With no eligible claim the result is insufficient, never a positive conclusion.

## 3. Verified current state

### Execution owner

File: `src/modules/analysis/research-automation/i14-synthesis-execution.ts`.

- **Class.** `AutomationI14SynthesisExecutions` (l.231) has one `#inFlight` set
  (l.236).
- **`execute`** (l.246–341):
  1. Under the mutex it verifies the parent.
  2. If a row exists, it replays a settled row or claims a PREPARED row.
  3. Otherwise it stores four artifacts and inserts `section_id 'I14'`
     (l.286–291).
  4. A separate transaction claims the row (l.300–308).
  5. It re-reads the retained artifacts, dispatches once and settles.
  6. Any failure after the claim becomes `DISPATCH_UNKNOWN` (l.311–340).
- **`read`** (l.344–354) is query-only.
- **`recoverInterruptedDispatches`** (l.361–366) updates every `DISPATCHING` row
  with **no section filter**, and is guarded by `#inFlight.size`.
  - So an M01 owner **must be the same instance**. A second instance's recovery
    would mark the first instance's in-flight rows as unknown.
- **`readActivity`** (l.369–398) is root's in-progress usage accounting. It
  filters `section_id = 'I14'` and returns `{ i14: … }`. It is left untouched
  here.
- **Hard-coded I14 assumptions:**
  - `#verifyParent` l.420 requires INSIGHT;
  - `#row` l.428/430 filters `'I14'`;
  - `#readRetainedExecution` l.460–468 uses the I14 validators and checks the
    response contract `automation-i14-candidates`;
  - `#settled` l.440–457 replays through `validateAutomationI14CandidateResponse`;
  - the `Settlement` type (l.144) is candidate-typed;
  - `validateResponse` (l.209) is candidate-typed.
- **What is retained:**
  - A VALID outcome stores the validated envelope, not the raw response
    (l.520–523).
  - An INVALID outcome stores only its code.
  - The configuration contract is `automation-i14-synthesis-configuration`
    (`contracts/analysis/…configuration.schema.json`: providerId, modelId,
    temperature, maxOutputTokens, timeoutMs, maxResponseBytes ≤ 1 MiB).

### Migration 0042

File: `migrations/0042_analysis_research_automation_ai_executions.sql`. It is
untracked in git.

- l.14: `section_id CHECK(section_id = 'I14')`.
- l.23–27: a closed list of I14 `validation_code` values.
- l.45–48: unique `(run_id, section_id)` for the initial run, and
  `(attempt_id, section_id)` for attempts.
- l.58/64: the insert trigger requires `reports IN ('INSIGHT','MARKET,INSIGHT')`.
- The update trigger (l.69–87) does not check `reports`.
- l.89–91: the no-delete trigger.

Ledger: `src/platform/db/migrations.ts` l.73–77 rejects a changed checksum of an
applied migration, and l.88 runs each migration in `BEGIN IMMEDIATE`.

### M01 inventory and claims

- **Inventory** (`m01-evidence-inventory.ts` l.49–84):
  - `items` holds every claim of the bound source-claims artifact, in catalog
    section order `M05, I02, I04` (l.18, l.57).
  - Status is `INSUFFICIENT_EVIDENCE` when there are no items (l.64).
  - Limitation l.77 is `NO_AI_OR_PROVIDER_CALL_WAS_MADE`.
  - Maximum size is 64 MiB (l.16).
- **Market claims are M05 only.** `nativeReview` is passed for INSIGHT only
  (`service.ts` l.1059), and located is INSIGHT-only (l.1069). `m05Claims`
  (`source-claims.ts` l.151) keeps only `observed_value` and `observed_zero`
  (l.176), and adds `SOURCE_STATED_MEASURE_IS_NOT_DEMAND_OR_MARKET_SIZE` and
  `LOCATED_RECORD_IS_NOT_A_PERSON_OR_POPULATION` (l.183).
- **Service.**
  - `#executeReports` builds the claims (l.1067), then M01 (l.1072–1074), then
    I14 (l.1081–1087).
  - It treats a PREPARED result as an integrity failure (l.1087).
  - It strips renderer-authored owner fields (l.1095–1098) and attaches owner
    references (l.1099–1102).
  - `readReport` has guards at l.691–696, rebuilds M01 and byte-compares it
    (l.710–720), and requires a settled I14 with an equal ID (l.736–742).
  - `recoverOnStart` calls `recoverInterruptedDispatches` (l.775).
  - Reports render in `start.reports` order (l.1049), so in a pair MARKET comes
    before INSIGHT.
- **Renderer** (`reports.ts`):
  - M01 is section `EVIDENCE_INVENTORY` (l.195–199) and gets its appendix at
    l.305. M13 gets its appendix at l.315.
  - The body is assembled at l.334, in this order: explanation, views, scope,
    sourceTable (M13), observationTable, appendix.
  - The footer AI wording depends only on `i14Synthesis` (l.335).
  - `rendererVersion` is `automation-report-kit-v9` (l.270).
- **`synthesis-evidence-report.ts`:**
  - `sourceDetails` (l.27–30) emits the only `id="claim-…"`.
  - `m01InventorySection` (l.77–87) is the M01 table with full provenance.
  - Print CSS is at l.51–68. Its `td:has(>.evidence-trace)` rule applies only to
    provenance cells.

## 4. Root decisions (recommendation first)

| # | Decision | Recommendation | Why |
| --- | --- | --- | --- |
| D1 | Migration boundary | New **0043** that rebuilds the table. | See below. |
| D2 | Configuration contract | Reuse `automation-i14-synthesis-configuration` 1.0.0, with M01 values (model, maxOutputTokens, timeoutMs, maxResponseBytes). | See below. |
| D3 | Service option | Separate `m01SummaryAi?: AutomationI14ExecutionRequest['ai']`, default null. | See below. |
| D4 | Coverage | Every eligible claim must be cited at least once. | See below. |
| D5 | Lexicon | Advisory flags only, retained and rendered as warnings. | A41 D12 l.56. A hard reject would change approved semantics and needs business authority. |
| D6 | Raw response retention | Keep I14 parity now: the envelope for VALID, the code for INVALID. Option: a `response_sha256` column in 0043 for both sections. | See below. |
| D7 | Revision re-dispatch | Mirror I14: each explicit attempt gets a new identity and at most one dispatch, even with KEEP sources. | See below. |
| D8 | Bounds | ≤ 200 eligible claims, ≤ 1 MiB input, 1–20 statements, ≤ 600 characters per statement. | See below. |
| D9 | I02/I04 in Market M01 | Out of scope. | Market and Insight stay separate. Today Market claims are M05 only. A future inventory version needs a new summary input version. |
| D10 | Renderer identity | `automation-report-kit-v10`. | New M01/M13 layout. Stored v9 bytes are untouched. |
| D11 | Markup | See §11. | Uses the existing classes, needs no CSS change, and adds a visible "Mục N" ordinal in the M13 trace's first cell so that paper copies resolve. |
| D12 | Usage accounting | Root decides whether `readActivity` counts M01 (for example an additive `m01` block) **before** M01 AI is enabled in the operator. | The operator keeps `m01SummaryAi` null until then, so no M01 dispatch can go uncounted. |

Details:

- **D1.** 0042 is untracked, but it may already be applied to scratch or operator
  databases. Amending it would trip the ledger at `migrations.ts` l.75. Amend 0042
  only if root confirms that no retained database has applied it.
- **D2.**
  - The transport already validates this schema (`i14-cliproxy-transport.ts`).
  - A new contract would require changing the transport.
  - Cost: naming debt only, which should be documented.
- **D3.** Two existing tests configure an I14 fake port:
  - `research-automation-case-contract.test.ts` l.86–117;
  - `research-automation-native-reviews.test.ts` l.26–46.

  Reusing `#i14Ai` would also send MARKET to their fake ports, and would couple
  the two enablements.
- **D4.** With the owner question unset, choosing a subset would be relevance
  selection. Coverage makes "summary" mean every eligible record is described.
- **D6.** P5.4 says "lưu response thực" ("store the actual response"). If root
  adds the column, it is one nullable column plus pairing checks in 0043, and
  both owners store the raw text before validation.
- **D7.** Cost is flagged: a revision of a MARKET,INSIGHT pair can make two calls.
  Reusing a prior summary across parents would be a new cross-parent semantic.
- **D8.** J-MARKET has 26 claims. Above a bound the outcome is a deterministic
  `NOT_DISPATCHED INPUT_EXCEEDS_BOUND`, with no truncation or sampling.

## 5. Eligibility boundary

- **Eligible.** Exactly the `items` of the M01 inventory v1 that the service just
  built and that `readReport` rebuilds byte-for-byte (`service.ts` l.714–719).
  Today these are M05 `observed_value` and `observed_zero` claims only. There is
  no further selection, filtering, ordering or deduplication.
- **Replayable.** The claims are rebuilt from verified method snapshots
  (l.700–709), and the inventory from those claims. The summary input is a pure
  function of the inventory bytes, and its sha is bound by the execution row.
- **Insufficient.** When the inventory is `INSUFFICIENT_EVIDENCE`, the outcome is
  `NOT_DISPATCHED INSUFFICIENT_EVIDENCE`. No row is written and no call is made.
  M01 renders the explicit insufficient copy, never a positive statement.
- **Too large.** More than 200 claims, or input bytes over 1 MiB, gives
  `NOT_DISPATCHED INPUT_EXCEEDS_BOUND`. No row is written; M01 shows the complete
  code-rendered evidence table.
- **Not eligible in this slice:**
  - Metric M03/M04 calculations, which are not source claims;
  - Kalodata inventory;
  - Insight declarations;
  - anything owner-authored.

## 6. Contract drafts

All three are new closed schemas under `contracts/analysis/`, with
`additionalProperties:false`, `contractVersion "1.0.0"`, and canonical JSON plus a
newline. Root adds them to `scripts/generate-foundation-contract.mjs` (the list
at l.8–15) and generates the `.generated.ts` files on Linux.

### 6.1 `automation-m01-summary-input.schema.json` (model-facing input)

```jsonc
{
  "contractVersion": "1.0.0", "methodId": "automation-m01-summary-input", "methodVersion": "1.0.0", "sectionId": "M01",
  "profile": { "profileId": "a41-synthesis-ai-profile", "profileVersion": "v1", "candidateType": "SUMMARY_DRAFT" },
  "runId": "<uuid>", "workspaceId": "<id>", "scopeSha256": "<hex64>",
  "inventory": { "methodId": "automation-m01-evidence-inventory", "methodVersion": "1.0.0", "inventorySha256": "<sha of exact inventory bytes>" },
  "ownerQuestion": { "state": "UNSET", "text": null },          // const
  "ownerConstraints": [],                                        // maxItems 0
  "ordering": "CATALOG_SECTION_ORDER_M05_I02_I04_UNRANKED",      // const
  "eligibleClaims": [{                                           // 1..200, inventory order, unique claimId
    "claimId": "…", "sectionId": "M05", "evidenceKind": "SOURCE_OBSERVATION",
    "source": { "logicalPath": "…", "attribution": "…" | null },
    "measure": { "literal": "…", "definition": "…", "entityLabel": "…" } | null,
    "unit": "…" | null, "precision": "exact" | "non_exact" | null,
    "periodState": "SOURCE_PERIOD" | "PERIOD_TEXT_ONLY" | "NO_PERIOD", "periodBasis": "…" | null,
    "scope": { /* inventory item scope object, unchanged */ },
    "coverageUnit": "…" | null,
    "declaration": { /* inventory item declaration */ } | null,
    "limitations": ["…"]                                         // observation then claim limitations, de-duplicated, order kept
  }],
  "conflictSets": [{ "conflictId": "<hex64>", "kind": "SAME_BINDING_DIFFERENT_VALUE_OR_STATE", "claimIds": ["…", "…"] }],
  "outputContract": { "methodId": "automation-m01-summary", "methodVersion": "1.0.0" },
  "limitations": [
    "ELIGIBLE_CLAIMS_ARE_THE_COMPLETE_VERIFIED_M01_INVENTORY_NOT_A_SELECTION",
    "VALUES_PERIOD_DATES_COVERAGE_COUNTS_AND_SOURCE_TEXT_ARE_WITHHELD_AND_RENDERED_BY_CODE",
    "CLAIM_ORDER_IS_CATALOG_ORDER_NOT_PRIORITY_OR_RANK",
    "OWNER_QUESTION_DIRECTIONS_AND_CONSTRAINTS_ARE_UNSET",
    "CONFLICT_SETS_ARE_CODE_DETECTED_EXACT_BINDING_DISAGREEMENTS_ONLY",
    "NOT_DEMAND_MARKET_SIZE_TAM_RECOMMENDATION_OR_OWNER_DECISION"
  ]
}
```

**Withheld from the model.** These are not sent:

- `value`, `state`;
- the period start and end;
- the coverage counts;
- the source statement, spans, locators and file sha.

The model is not allowed to output any of them, and the renderer binds them from
the claims. Labels, definitions and scope text may still contain digits. Only the
model's output is digit-free.

**Conflict detection** (code only):

- Items are grouped by canonical
  `{sectionId, measure, unit, period, periodText, scope}`.
- A group with two or more members whose `(state, value)` differ is a conflict
  set.
- The source is deliberately **not** part of the key, so disagreements both
  within one source and across sources are caught.
- `conflictId = sha256(canonicalJson({kind, claimIds}))`, with the members in
  inventory order. Sets are ordered by their first member.
- An empty list means no exact-binding disagreement was found. It does not mean
  the sources agree.

### 6.2 `automation-m01-summary-prompt.schema.json`

```jsonc
{ "contractVersion": "1.0.0", "methodId": "automation-m01-summary-prompt", "promptId": "automation-m01-summary", "promptVersion": "1.0.0",
  "profile": { "profileId": "a41-synthesis-ai-profile", "profileVersion": "v1", "candidateType": "SUMMARY_DRAFT" },
  "inputContract": { "methodId": "automation-m01-summary-input", "methodVersion": "1.0.0" },
  "responseContract": { "methodId": "automation-m01-summary", "methodVersion": "1.0.0", "shape": "JSON_OBJECT_WITH_ONLY_STATEMENTS" },
  "systemText": "…" }
```

`systemText` is a constant string, retained per execution like I14's `PROMPT`
(l.45–63). Draft rules, one per line:

1. **Role.** Draft an M01 descriptive summary for human review. It stays
   SUMMARY_DRAFT / HUMAN_REVIEW_REQUIRED. You decide nothing.
2. **Input only.** Use only the input JSON. Add no outside knowledge, sources,
   products, people or facts.
3. **Each claim.** An eligibleClaims entry is one source observation or
   attributed declaration. It is not a person, population, segment or market.
   Entry order is catalog order, not importance.
4. **What to describe.** Describe what the evidence covers: measures, entities,
   sources, whether a source period exists, scope, conflict sets and stated
   limitations.
5. **Forbidden content:**
   - any digit or number character;
   - quantities, including spelled-out ones;
   - verbal quantification (most, many, few, majority);
   - comparisons (higher, lower, more, larger, leading);
   - rank, priority, importance, trend, growth, demand, prevalence, market size,
     share or TAM;
   - causality, recommendations, owner conclusions and business direction.
6. **Owner question.** It is unset. Do not choose relevance, and do not present
   any statement as an owner choice.
7. **Coverage and conflicts.** Cite every eligibleClaims `claimId` at least once
   across all statements. A statement that cites any member of a conflict set
   must cite every member and list that conflictId in `conflictRefs`.
8. **Values come from code.** Values, periods and sources are inserted next to
   each statement by the report. Refer to evidence descriptively.
9. **Output.** Return exactly one JSON object `{"statements":[…]}`, with 1 to 20
   statements. Each statement has exactly `text` (Vietnamese, 1 to 600
   characters), `citedClaimRefs` (1 to 200 distinct) and `conflictRefs` (0 to
   200 distinct). Give no reasoning and no other field.

### 6.3 Model response (validated, not a stored contract)

```jsonc
{ "statements": [{ "text": "…", "citedClaimRefs": ["…"], "conflictRefs": ["…"] }] }
```

### 6.4 `automation-m01-summary.schema.json` (retained envelope)

```jsonc
{
  "contractVersion": "1.0.0", "methodId": "automation-m01-summary", "methodVersion": "1.0.0", "sectionId": "M01",
  "runId": "…", "workspaceId": "…", "scopeSha256": "…",
  "inventory": { "methodId": "automation-m01-evidence-inventory", "methodVersion": "1.0.0", "inventorySha256": "…" },
  "input": { "methodId": "automation-m01-summary-input", "methodVersion": "1.0.0", "inputSha256": "…" },
  "profile": { "profileId": "a41-synthesis-ai-profile", "profileVersion": "v1", "candidateType": "SUMMARY_DRAFT" },
  "ownerQuestion": { "state": "UNSET", "text": null }, "ownerDirections": [],
  "candidateType": "SUMMARY_DRAFT", "candidateStatus": "HUMAN_REVIEW_REQUIRED", "layer": 3, "conclusion": null,
  "statements": [{ "text": "^\\P{N}*[^\\s\\p{N}]\\P{N}*$ (≤600)", "citedClaimRefs": ["…"], "conflictRefs": ["…"] }],
  "advisoryFlags": [{ "statementIndex": 0, "code": "QUANTIFICATION_COMPARISON_OR_PROHIBITED_TOPIC_TERM", "term": "<lexicon entry, not model text>" }],
  "validation": { "structural": "SCHEMA_REFERENCES_COVERAGE_AND_CONFLICT_CLOSURE_PASSED", "semantic": "NOT_VERIFIED_HUMAN_REVIEW_REQUIRED" },
  "limitations": [
    "M01_SUMMARY_IS_AN_UNREVIEWED_LAYER_THREE_DRAFT_NOT_A_CONCLUSION",
    "STRUCTURAL_REFERENCE_AND_COVERAGE_VALIDATION_DOES_NOT_VERIFY_SEMANTIC_TRUTH",
    "NUMBERS_PERIODS_AND_COVERAGE_ARE_RENDERED_FROM_BOUND_CLAIMS_NOT_MODEL_TEXT",
    "AI_TEXT_REJECTS_NUMBER_CHARACTERS_BUT_NOT_SPELLED_OUT_QUANTITIES",
    "ADVISORY_LEXICON_FLAGS_ARE_WARNINGS_NOT_PROOF_OF_ABSENCE",
    "OWNER_QUESTION_UNSET_NO_RELEVANCE_SELECTION_OR_BUSINESS_DIRECTION",
    "STATEMENT_ORDER_IS_RESPONSE_ORDER_NOT_PRIORITY_OR_RANK",
    "NOT_DEMAND_MARKET_SIZE_TAM_RECOMMENDATION_OR_OWNER_DECISION",
    "CONFLICT_SETS_ARE_CODE_DETECTED_EXACT_BINDING_DISAGREEMENTS_ONLY",
    "DECLARATIONS_ARE_ATTRIBUTED_SELF_REPORT_NOT_AUTHENTICATED_TRUTH"
  ]
}
```

The envelope does not copy the conflict sets. They are bound through
`input.inputSha256`, and the renderer recomputes them with the same exported pure
function.

## 7. Validation (pure module `m01-summary.ts`)

The response is validated in this order. The first failure becomes the code.

| Step | Check | Code |
| --- | --- | --- |
| 0 | Value is a string / within `maxResponseBytes` / parses as JSON | `RESPONSE_NOT_TEXT` / `RESPONSE_TOO_LARGE` / `RESPONSE_NOT_JSON` (shared, already in the owner) |
| 1 | The object has exactly the key `statements` | `SUMMARY_RESPONSE_FIELDS_INVALID` |
| 2 | Response schema: counts, lengths, uniqueness, and digit-free text (Unicode `\p{N}`, so full-width and other scripts too) | `INVALID_M01_SUMMARY` |
| 3 | Every cited ref is an eligible `claimId` | `CITED_CLAIM_NOT_ELIGIBLE` |
| 4 | Every conflict ref is a known `conflictId` | `CONFLICT_REF_NOT_ELIGIBLE` |
| 5 | Closure: if a statement cites any member of a set, it cites all members and the set's ID; a conflict ref requires citing all of the set's members | `CONFLICT_SET_NOT_FULLY_CITED` |
| 6 | Coverage: the union of cited refs equals the eligible set | `ELIGIBLE_CLAIM_NOT_CITED` |

- After validation the code builds the envelope and validates it against the
  envelope schema. A failure there is an integrity error, not a model INVALID.
- **Advisory flags** come from a small NFC-normalized, case-folded, multiword VI/EN
  lexicon, for example:
  - quantification and comparison: "phần lớn", "đa số", "hầu hết", "nhiều nhất",
    "cao nhất", "nhiều hơn", "ít hơn", "cao hơn", "thấp hơn";
  - ranking: "dẫn đầu";
  - prohibited topics: "xu hướng", "tăng trưởng", "nhu cầu", "quy mô thị trường",
    "thị phần", "khuyến nghị", "majority", "more than", "market size";
  - the full list is a reviewed constant.
- Flags never invalidate a response (D5). They are retained in the envelope and
  rendered as warnings. A flag records the lexicon entry, not a model substring.

## 8. Migration 0043 (root-owned; D1)

`migrations/0043_analysis_ai_executions_m01_summary.sql` runs inside the ledger's
`BEGIN IMMEDIATE`. SQLite cannot alter a CHECK, so the table is rebuilt:

1. Drop the 3 triggers and 2 unique indexes of 0042.
2. `ALTER TABLE analysis_research_automation_ai_executions RENAME TO analysis_research_automation_ai_executions_0042`.
   Nothing references this table by foreign key.
3. Create the table with the same columns and pairing checks, except:
   - `section_id IN ('I14','M01')`;
   - a section-paired check on `validation_code`:
     - I14 rows keep exactly the 9 existing codes;
     - M01 rows allow `RESPONSE_NOT_TEXT`, `RESPONSE_TOO_LARGE`,
       `RESPONSE_NOT_JSON`, `SUMMARY_RESPONSE_FIELDS_INVALID`,
       `INVALID_M01_SUMMARY`, `CITED_CLAIM_NOT_ELIGIBLE`,
       `ELIGIBLE_CLAIM_NOT_CITED`, `CONFLICT_REF_NOT_ELIGIBLE` and
       `CONFLICT_SET_NOT_FULLY_CITED`;
   - optionally `response_sha256` (D6).
4. `INSERT INTO new (explicit column list) SELECT … FROM _0042`. This must happen
   **before** the insert trigger is recreated, because that trigger rejects
   non-PREPARED rows.
5. `DROP TABLE …_0042`. Its no-delete trigger was already dropped in step 1.
6. Recreate both unique indexes, unchanged.
7. Recreate the triggers:
   - **Insert trigger.** It becomes section-aware:
     `(NEW.section_id = 'I14' AND r.reports IN ('INSIGHT','MARKET,INSIGHT')) OR (NEW.section_id = 'M01' AND r.reports IN ('MARKET','MARKET,INSIGHT'))`.
     All other conditions stay as in 0042 l.51–65.
   - **Update and no-delete triggers.** They are copied verbatim.

**Column meaning for M01 rows.** No column is renamed:

| Column | Holds |
| --- | --- |
| `admission_sha256` | The M01 inventory v1 artifact |
| `input_sha256` | The summary input |
| `candidates_sha256` | The summary envelope |

Applied-migration semantics are not touched. Existing I14 rows copy over
unchanged. Root updates `tests/integration/sqlite-foundation.test.ts`: l.58 lists
migrations `[1..43]`, l.71 expects version 43, and l.214–222 gains a
0042→0043 upgrade that preserves a settled I14 row.

## 9. Owner: shared core, additive API

The edits go in `i14-synthesis-execution.ts` only.

### Private profile

The core becomes parameterized by a **private** closed constant per section:
`I14_PROFILE` and `M01_PROFILE`. It is not exported, and it is not a registry.

| Field | Purpose |
| --- | --- |
| `sectionId` | `'I14'` or `'M01'` |
| `parentReport`, `reportsError` | INSIGHT / `PARENT_REPORTS_EXCLUDE_INSIGHT`, or MARKET / new `PARENT_REPORTS_EXCLUDE_MARKET` |
| `build(source)` | Returns `{ basis, basisBytes, inputBytes \| null, notDispatched? }`. I14 keeps the current `#build` (l.400–404). M01 calls `buildAutomationM01EvidenceInventory` then `buildAutomationM01SummaryInput`. |
| `basis` | Maximum bytes and schema validator: I14 admission, or M01 inventory at 64 MiB |
| `input` | Maximum bytes, validator, and how the basis sha appears inside the input (`admission.admissionSha256` or `inventory.inventorySha256`) |
| `prompt` | Bytes, validator, response contract ID |
| `classify(text, retained, maxResponseBytes)` | Returns a `Settlement` |
| `replay(bytes, retained, source)` | I14 keeps l.443–456. M01 re-validates the stored statements against the **retained** input, rebuilds the envelope and requires byte equality. |
| `maxEnvelopeBytes` | Size limit of the retained envelope |

The `Settlement` artifact becomes generic. The same one-row, mutex, claim, settle
and recovery code path serves both sections, and `#row`, `#verifyParent`, the
INSERT and `#readRetainedExecution` take the profile.

### Public API

Existing signatures and behavior are unchanged: `execute`, `read`,
`recoverInterruptedDispatches`, `readActivity`, every I14 type, the I14 bytes,
and the `SYNTHESIS_INPUT_TOO_LARGE` throw.

Additive:

```ts
export type AutomationM01SummaryNotDispatchedReason = 'INSUFFICIENT_EVIDENCE' | 'AI_NOT_CONFIGURED' | 'INPUT_EXCEEDS_BOUND';
export interface AutomationM01SummaryRequest {
  readonly parent: AutomationI14ExecutionParent;            // same parent shape as I14
  readonly inventory: AutomationM01EvidenceInventoryInput;  // exact frozen run/scope/claims; the owner rebuilds the inventory
  readonly ai: AutomationI14ExecutionRequest['ai'];         // null => AI_NOT_CONFIGURED; never consulted on replay
  readonly signal?: AbortSignal;
}
export interface AutomationM01RetainedSummary {
  readonly artifact: AutomationM01Summary; readonly bytes: Buffer; readonly sha256: string;
  /** From the retained prompt and configuration artifacts, not current config. */
  readonly generation: { readonly promptId: string; readonly promptVersion: string; readonly providerId: string; readonly modelId: string };
}
export type AutomationM01SummaryOutcome =
  | { readonly status: 'NOT_DISPATCHED'; readonly reason: AutomationM01SummaryNotDispatchedReason }
  | { readonly status: 'PREPARED'; readonly executionId: string }
  | { readonly status: 'VALID'; readonly executionId: string; readonly dispatched: boolean; readonly summary: AutomationM01RetainedSummary }
  | { readonly status: 'INVALID'; readonly executionId: string; readonly dispatched: boolean; readonly validationCode: AutomationM01SummaryValidationCode }
  | { readonly status: 'DISPATCH_UNKNOWN'; readonly executionId: string; readonly dispatched: boolean; readonly unknownCode: AutomationI14UnknownCode };
export type AutomationM01SummaryView = AutomationM01SummaryOutcome | { readonly status: 'ABSENT' } | { readonly status: 'DISPATCHING'; readonly executionId: string };

class AutomationI14SynthesisExecutions {
  executeM01(request: AutomationM01SummaryRequest): Promise<AutomationM01SummaryOutcome>;
  readM01(parent: AutomationI14ExecutionParent, inventory: AutomationM01EvidenceInventoryInput): Promise<AutomationM01SummaryView>;
}
```

- **Too-large input differs from I14 on purpose.** For M01 it is a deterministic
  `NOT_DISPATCHED`, not a throw. A large inventory must not fail a Market report
  that renders today.
- **`readM01` with no row** returns `ABSENT` if there is an input, otherwise
  `NOT_DISPATCHED` with the deterministic reason.
- **Naming debt.** The class and type names keep the `I14` prefix. Renaming would
  touch the service, API and tests, so it is left to root later.

### Pure modules (Claude-owned, new)

`src/modules/analysis/research-automation/m01-summary.ts` exports:

- `MAX_M01_SUMMARY_ELIGIBLE_CLAIMS`, `MAX_M01_SUMMARY_INPUT_BYTES`;
- `M01_SUMMARY_PROMPT` and its bytes;
- `m01ConflictSets(inventory)`;
- `buildAutomationM01SummaryInput(inventory, inventoryBytes)`, which returns
  `{ status: 'READY', input, bytes }` or a NOT_DISPATCHED reason;
- `validateAutomationM01SummaryResponse(parsed, input, inputBytes)`, which
  returns `{ artifact, bytes }` or throws `AutomationM01SummaryValidationError(code)`;
- `m01SummaryAdvisoryFlags(statements)`.

The module has no I/O and no database access, and no model is called.

## 10. Service integration (root-owned `service.ts`)

1. **Option.** `m01SummaryAi?: AutomationI14ExecutionRequest['ai']` becomes
   `#m01Ai`, default null, next to l.145/227.
2. **`#executeReports`**, after l.1074:
   - compute `parent` once and share it with I14 l.1084;
   - if `builtM01` exists, call `this.#i14Executions.executeM01({ parent, inventory: { run, scope, sourceClaims: builtClaims.artifact, claimsSha256: builtClaims.artifact.claimsSha256 }, ai: this.#m01Ai, signal: controller.signal })`;
   - treat a PREPARED result as an integrity error, as at l.1087;
   - add `m01Summary` to `input` (l.1088).
3. **Stripping and attaching.**
   - Strip renderer-authored `m01Summary` and `m01SummaryExecutionId` (l.1095–1098).
   - Attach `m01SummaryExecutionId` when `'executionId' in m01Summary`
     (next to l.1102).
4. **`readReport` guards.**
   - Next to l.691–696: a `m01SummaryExecutionId` requires
     `m01InventoryArtifact`, MARKET and a UUID.
   - Inside the M01 block, after l.719:
     `readM01(attempt ? SUPPLEMENTAL_ATTEMPT : INITIAL_REPORTS, inventoryInput)`
     must be `VALID`, `INVALID` or `DISPATCH_UNKNOWN`, with an `executionId`
     equal to the semantic's.
5. **No recovery change.** `recoverOnStart` l.775 already covers M01 rows,
   through the single shared instance.

API projection, RunView, usage contracts and `readActivity` are **not** changed by
this slice (D12).

## 11. Rendering

### New `src/modules/analysis/research-automation/m01-summary-report.ts` (Claude)

`m01SummarySection(outcome, inventory, claims): string` returns M01's appendix
content in every state. It never emits `id="claim-…"`.

1. **Status block**, by outcome:

   | Outcome | Rendered |
   | --- | --- |
   | VALID | `<h3>Bản nháp tóm tắt AI · Chưa được người dùng duyệt</h3>`, then a notice. The notice says that only structure, citations and coverage were checked and the content is unverified; that numbers, periods and scope are inserted by the system, not written by AI; and that statement order is not priority. Then one line with promptId@version, providerId/modelId and executionId. |
   | INSUFFICIENT_EVIDENCE | `warning`: no eligible evidence, so no summary, and nothing can be concluded from the gap. |
   | AI_NOT_CONFIGURED | The table below is a system evidence list, not a summary. |
   | INPUT_EXCEEDS_BOUND | The evidence exceeds the summary bound. Nothing was cut or sampled, and everything is below and in M13. |
   | INVALID / DISPATCH_UNKNOWN | The response was not used; there is no automatic retry. Same meaning as I14 l.16–17. |
   | PREPARED | A defensive notice. The service never renders it. |

2. **Statements (VALID).** One `<article class="evidence-entry">` per statement,
   in response order:
   - `<p>` escaped text;
   - a bound-facts `evidence-table` for its cited claims, with columns:
     - Bằng chứng (evidence): entity / definition / "Mục N · M05";
     - Giá trị và trạng thái (value and status);
     - Kỳ đo và phạm vi (period and scope);
     - Truy nguồn (trace): `<a href="#claim-<id>">Truy nguồn mục N</a>`;
   - conflict refs, linked to the conflict block.

   Every number on the page comes from the claim or inventory item through code,
   never from the statement.

   **Non-VALID with items.** One bound-facts table of all items in inventory
   order, so the evidence stays near the section.
3. **Conflict sets.** Always present when there are items. Each set lists its
   members' bound facts. With no sets the copy is: "Không phát hiện mâu thuẫn
   theo quy tắc ràng buộc chính xác; điều này không chứng minh các nguồn thống
   nhất." ("No conflict found under the exact-binding rule; this does not prove
   the sources agree.")
4. **Advisory flags (VALID).** Shown as warnings per statement: "Cảnh báo từ ngữ,
   không phải bằng chứng vắng mặt" ("Wording warning, not evidence of absence").
5. **Material limitations.** A visible list, not collapsed:
   - the fixed summary limitations, or the inventory limitations when not VALID;
   - the de-duplicated union of claim limitations, in first-seen order;
   - shown once, instead of about 15 codes repeated in each record.
6. A link `<a href="#m01-trace">Xem toàn bộ truy nguồn M01 tại phụ lục M13</a>`.

The fact-cell formatting matches `m01InventorySection` l.82–84.

- **Preferred (D11):** root approves extracting those three cells into an
  exported helper in `synthesis-evidence-report.ts`. The output is unchanged
  apart from the approved ordinal, the CSS is untouched, and both sections use
  the helper.
- **Fallback:** duplicate the formatting in the new module, with a parity test.

### `reports.ts` (root, after markup approval)

- **l.195–199.** Keep `state: 'EVIDENCE_INVENTORY'` and `method`. Vary only the
  explanation when `input.m01Summary` is present.
- **l.305.** If `input.m01Summary` is present, use
  `m01SummarySection(input.m01Summary, input.m01Inventory, input.sourceClaims)`.
  Otherwise use the unchanged `m01InventorySection`. That is the legacy layout,
  for direct renderer callers.
- **l.315.** M13 renders
  `descriptiveAppendix(…) + (input.m01Summary && input.m01Inventory && input.sourceClaims ? '<h3 id="m01-trace">Truy nguồn bằng chứng M01</h3>' + m01InventorySection(…) : '')`.
  The `claim-` IDs now live only in M13. The appendix is last in the M13 sheet
  (l.334).
- **l.297 headline.** Add one clause when M01 is VALID: an unreviewed AI summary
  draft.
- **l.335 footer.** Use the AI wording when `i14Synthesis` **or** `m01Summary` is
  VALID.
- **l.270.** Set `rendererVersion` to v10 (D10). Keep `completedAnalyticalSections`
  at 0.
- **Market and Insight stay separate.** M01 is Market-only, and INSIGHT is
  unchanged.

### Print and web

- No CSS change. Bound-facts tables have no `.evidence-trace` cell, so the
  existing print rule lays out their four short cells side by side (l.57–58), and
  the mobile reflow (l.42–50) applies.
- The M13 trace keeps the print-record layout that root verified.
- `pdf.ts` still opens every `<details>`.
- Pages move from M01 to M13. The total may rise slightly, because a claim cited
  by two statements gets two compact rows. Nothing is hidden to save pages.
- Root verifies on Linux.

## 12. Tests: one strongest owner per risk

| Risk | Owner | Strongest assertion |
| --- | --- | --- |
| Model creates numbers, cites ineligible claims, skips claims or breaks conflict closure | New `tests/unit/research-automation-m01-summary.test.ts` (Claude) | A table of responses mapped to exact codes, including Unicode `\p{N}` (Arabic-Indic, full-width), extra keys, duplicates, partial conflict citation and an uncited claim. Advisory flags never change VALID. The envelope is byte-stable. |
| Input leaks withheld data, or is non-deterministic | Same file | The input contains no `value`, period dates, coverage counts, statements or spans. Identical bytes for identical inventory bytes. Conflict IDs are stable. Insufficient and exceeds-bound give no input. |
| Renderer prints model numbers, or anchors fail to resolve | New `tests/unit/research-automation-m01-summary-report.test.ts` (Claude) | Values in M01 come only from claims. Every `href="#claim-"` resolves to exactly one `id`, and that id is in M13. All inventory claim IDs, quotes, hashes and limitation codes appear in the full report. M01 contains no `id="claim-"`. Insufficient copy appears for zero items. |
| Double dispatch, retry after uncertainty, or cross-section recovery | New `tests/integration/research-automation-m01-summary-execution.test.ts` + helper `tests/helpers/m01-summary-fixture.ts` (paused MARKET parent; Claude) | Insufficient → zero port calls and no row. Initial → one call; re-execute replays with zero calls. Timeout or abort → `DISPATCH_UNKNOWN`, then zero calls. Restart recovery marks M01 `DISPATCHING`. `ACTIVE_DISPATCH_IN_PROCESS` while an I14 or M01 dispatch is in flight. INSIGHT-only parent → `PARENT_REPORTS_EXCLUDE_MARKET`. Corrupted envelope or manifest → integrity error. |
| View or PDF calls AI, revision reuses identity, presentation forges `m01SummaryExecutionId`, historical reads change | Extend `tests/integration/research-automation-case-contract.test.ts` (root) | A counting fake port stays at 1 across read and PDF. A revision attempt gets a new executionId. A forged ID is stripped or rejected. A v9 report without the ID is served byte-identical. |
| Migration loses I14 rows, or triggers allow the wrong section or report | `tests/integration/sqlite-foundation.test.ts` (root) | Upgrade 0042→0043 keeps a settled I14 row. Insert matrix: I14 + MARKET-only rejected; M01 + INSIGHT-only rejected; M01 + MARKET accepted. An M01 code on an I14 row is rejected. |
| I14 regression | Existing `research-automation-i14-execution.test.ts`, `-i14-cliproxy-transport.test.ts`, `-native-reviews.test.ts`, `-case-contract.test.ts` (unchanged) | They pass unmodified. Any I14 test edit is a red flag. |

## 13. Ownership, dependencies and sequence

| Path | Owner |
| --- | --- |
| `contracts/analysis/automation-m01-summary{-input,-prompt,}.schema.json` | Claude (new) |
| `src/modules/analysis/research-automation/m01-summary.ts`, `m01-summary-report.ts` | Claude (new) |
| The three new test files and `tests/helpers/m01-summary-fixture.ts` | Claude (new) |
| `i14-synthesis-execution.ts` (core refactor + `executeM01`/`readM01`) | Claude, **only under a root lock and after root's `readActivity` usage edits land** |
| `synthesis-evidence-report.ts` (optional fact-cell helper and ordinal; no CSS) | Claude, only if root approves D11 |
| `migrations/0043_…sql`, `sqlite-foundation.test.ts`, `scripts/generate-foundation-contract.mjs` and generated `.ts`, `service.ts`, `reports.ts`, `research-automation-case-contract.test.ts` | Root |
| `research-automation-api.ts` / `operator-app.ts` wiring for `m01SummaryAi`, usage accounting, API projection, RunView | Root, later (D12). Provider enablement needs separate authority. |

Sequence:

1. **Root:** D1–D12 and markup approval.
2. **Claude:** the three schemas, `m01-summary.ts` and its unit test.
   **Root:** generator entries, Linux generation, typecheck and unit run.
3. **Root:** 0043 and the foundation test.
4. **Claude (with lock):** the owner refactor, `executeM01`/`readM01`, the
   execution test and the helper. **Root:** Linux run, including the unchanged
   I14 suites.
5. **Claude:** `m01-summary-report.ts`, its test, and the optional helper
   extraction.
6. **Root:** `service.ts`, `reports.ts`, v10 and the case-contract test.
7. **Root:** Linux typecheck, all research-automation suites, and six synthetic
   exports. Use a counting fake port for VALID, plus each non-VALID state. Check
   the page count and evidence parity against the 78-page J-MARKET baseline. No
   provider is used.
8. **Later, separate authority:** operator wiring of `m01SummaryAi`, after usage
   accounting covers M01.

## 14. Non-goals

- No human disposition or approval workflow. Everything stays
  HUMAN_REVIEW_REQUIRED.
- No owner question, ranking, conclusion, demand, TAM or recommendation.
- No change to I14 behavior, I14 bytes, the M01 inventory v1 builder or bytes, or
  stored report bytes.
- No new ledger, registry, framework, queue, agent or generic workflow.
- No API projection, RunView, usage contract, print CSS, deployment, migration
  execution or provider call.

## 15. Risks

| Risk | Note |
| --- | --- |
| Spelled-out quantities ("hai", "ba") and implicit comparisons pass the schema | Disclosed by a limitation and the lexicon warnings. Human review is the control. |
| Coverage forces long statements on large inventories | Bounded at 200 claims and 20 statements; above that, `INPUT_EXCEEDS_BOUND`. A real-provider pilot needs separate authority. |
| A summary input change breaks replay | Version the input. Keep the v1 builder for as long as v1 rows exist, as I14 does with `admissionVersion`. |
| A PREPARED row plus a configuration change gives `EXECUTION_IDENTITY_CONFLICT` | Inherited from I14 (l.267). The report fails visibly instead of calling with a different configuration. |
| Revision cost | D7: a MARKET,INSIGHT revision can make two calls. |
| Usage gap | M01 calls would be invisible to `readActivity` until D12. The operator option therefore stays null until then. |
| Fragment targets in closed `<details>` on the web | The link lands on the trace summary line, and the reader expands it. PDF opens all details. |
