# Insight prompt benchmark: coordinator evidence audit

Updated: 2026-10-04 (Asia/Bangkok)
Worktree/branch: `research-automation-v1` / `fix/research-real-world-audit`
Inspected HEAD: `0116091fd5dc0902594f92d969dfb3ee0732c9c8`; pre-existing uncommitted work was preserved.

## Scope and decision boundary

Read-only audit of retained development outputs for prompt `8405e23e…`, followed by business-method review. This is not a new benchmark, coding adoption, report approval, all-30-section acceptance, release or deployment.

Claude ran the benchmark; the model being evaluated was `gpt-6.1-sol` through CLIProxy. Four retained VALID batches cover 20 known development records. These records were previously used for tuning; the reference is AI-assisted, not independent human gold. The first failed B3 dispatch remains in the history.

Calls remain **5/8 cumulatively**. No additional model, judge, collection or provider calls were made for this audit. Billing remains unknown. Remaining budget is not an instruction to dispatch.

## Completed technical checks

- Retrieved only benchmark evidence from separate Fedora scratch directories into owner-restricted local storage; no live operator, business database or credentials were changed.
- Independently re-hashed all four canonical candidates artifacts and the retained prompt; each matches its content-addressed name.
- Parsed each pretty candidates file and checked object equality against its canonical retained artifact. Different pretty-file bytes are not corruption.
- Checked 14 transferred remaining-run files against their manifest. B3 canonical bytes were independently checked; B3 was not covered by that remaining-run manifest.
- Read all four result receipts: each reports VALID and all 11 runner gates true. This is receipt inspection, not re-execution of services or tests.
- Verified unchanged bindings for reference coding, reference input, qualitative profile and method adoption. The original raw-source digest was recorded, not independently recomputed in this audit.
- Independently hashed current `insight-model-execution.ts`: `59b572db262035d47552e9b848d7e285b6cb3a63a254cb82b9d3390374a64147`, matching the benchmark's recorded source identity.
- Inspected response validation, selected projection, report source-context rendering and the coding approval UI. No Windows tests, builds, generators or typechecks were run.

### Exact retained identity

Prompt SHA-256: `8405e23e2476cb671d3a98866c0bad9b8999fff8417b1e0762e2d1ee15a2d1fb`

Configuration SHA-256: `a6000a32721f950535238a2480383482a10b2bcaf585fdb8933a801c1901a389`

| Batch | Record indexes (zero-based) | Candidates SHA-256 |
|---|---|---|
| B1 | 5, 6, 13, 19, 23 | `9f54937898a5b704746c884a0a9ceee6659e1b24cc245395e64b6476976ca20e` |
| B2 | 30, 32, 33, 35, 36 | `0a091181c352603abf4c3f52c4d5e130e87ab1a284008c846e18c14282a82e7f` |
| B3 | 37, 41, 47, 48, 49 | `9c0c524ec7abb389c69bb11a047d67a390aca10d0bbe16df3d8d46c10d4e1863` |
| B4 | 52, 54, 56, 59, 61 | `1bc1262eb17c1c4b403ad586a0cab8a76d5a8b107826c035c8a549cbf005b9d9` |

Reference coding SHA-256: `342bbdfd1875a92f852b80ade4b955c61cbd22a59a9687e599c84e45e0a669df`

Reference input SHA-256: `9a6bfbce7173e5c9cec409e18f90a3dfea4cd4eddbbf59668f471586896f7801`

## What structural results do and do not establish

The retained runner audit reports zero state/span conformance violations across the four batches. All reference I10 record/code memberships are represented: 42 memberships with 44 phrase occurrences, not 44 people or records. Short literal I10 spans were not widened.

The current output includes three negative I05 clauses in R52, while its I02 task remains NOT_STATED. The structural audit alone could not judge that omission; the completed semantic review below confirms it. Array counts, omitted qualifiers, UNKNOWN attribution and additional current-state rows are not automatically defects simply because they differ from the reference.

All outputs remain PENDING_AI. VALID confirms contract and evidence binding; it does not establish that an interpretation is correct or accepted. Positive I07/I08 coverage and generalization to the thermos and fan cases are not established by these retained outputs.

## Static review: source context at approval time

**Review UX gap, not a source-span validation failure:** the immediate proposal checklist and acceptance confirmation render short entry titles and metadata without a direct full-record disclosure. A separate draft/span editor exposes full records, but this is not the same as context being available next to every approval item.

Relevant files:

- `frontend/src/research-automation/insight-coding-ui.ts`: `proposalEntries()` and `recordLabel()`.
- `frontend/src/research-automation/InsightCodingPanel.tsx`: proposal checklist and `entryList()` used by acceptance confirmation.
- `src/modules/analysis/report-located-insight-pages.ts`: report entries already link to full original records with source locations.

Proposed bounded repair: allow reading the complete source record from each proposal/confirmation entry, especially short I10 phrases. Preserve exact short spans, source identity, unmodified quotations, pending provenance and the existing explicit acceptance operation. Do not inflate excerpts, automatically accept entries or infer missing context. No repair or live-browser acceptance was performed in this audit.

## Business-method review

Status: **complete for these saved development outputs**, from **Review marketing framework files**. Verdict: two confirmed semantic defects plus pending adjudication, not production acceptance. Independently re-hashed all 35 locally available file bindings recorded in its JSON: zero mismatches. Both returned files have owner/SYSTEM-only ACLs and include no raw review quotations.

Private audit receipt identities (files remain outside Git):

- `saved-output-semantic-audit-20261004.md`: `9e6251b4eda02c17de0a0d6860ea323418b8a12e0a30a586d4e1fade80365e7e`.
- `saved-output-semantic-audit-20261004.json`: `c390ca4dd9157656daec3a569c66382c63624f32bd70bcaf8ea5c7814bd91526`.

### Confirmed defects

| Issue | Location | Verdict | Minimal generic repair proposal |
|---|---|---|---|
| S01 | B4 / I02 / R52 | An explicitly stated task was omitted, although the source activity is also retained in I04. | Recheck stated tasks against the original source after coding each family. Do not require a completed action; do not mechanically copy I04, infer an actor or claim verified performance. |
| S02 | B1 / I02 / R19 | Pasted clipboard UI boilerplate became customer situation/task context. Exact span matching does not make this interpretation relevant. | Check clause relevance before context assignment; exclude interface/template boilerplate from customer-context annotations while preserving raw text and source membership. |

These are generic interpretation issues, not a need for another data provider. Do not hard-code record IDs, source phrases, reference row counts or forced positives.

### Valid alternatives and unresolved limits

- R23 and the three negative clauses in R52 are retained in this run. Missing bare-fact NEUTRAL/UNCLEAR reference containers are not automatically false negatives.
- R54's disputed completion claim retains reporting context, contradictory evidence and disagreement. It is not verified delivery. Speech/completion rows must not be counted as independent deliveries. Some reporting attribution still needs adjudication; UNKNOWN for an elided actor is not automatically wrong.
- I06 R61 supports only the within-record order; it does not establish a journey or verified person identity.
- I09 has 36 source-located current-state entries with no inferred desired-state/gap. Additional rows are not automatically overcoding. Ambiguous quantity and recommendation interpretations remain pending.
- I10 preserves 42 record/code memberships and 44 occurrences, all PENDING_AI. Repeated occurrences do not increase the record denominator.
- Positive I07/I08/I13 coverage, thermos/fan generalization, frontend experience and all-30 acceptance remain unevaluated by this semantic audit.

The business audit independently checked 209 located span objects against source text. This is reported semantic-auditor evidence, not a second parent re-execution. Canonical model-input bytes and the complete raw provider dataset were not supplied for independent re-hashing; persisted input digests and the raw dataset digest retain that binding limitation.

## Next action

1. Implement only separately authorized S01/S02 generic repairs and the source-context approval gap. The returned verdict has been bound to these retained outputs; valid alternatives and unevaluable controls are listed separately above.
2. Keep reported claims, hearsay, perceptions and disputed/question interpretations at their stated certainty level in approval and export views.
3. If a repaired prompt needs another dispatch, freeze the revision and agree a bounded verification plan first. Focus on the affected B1/B4 questions and relevant controls, not a blind full rerun. Preserve all failed and successful attempts.
4. Do not spend another call using the unchanged prompt to settle a method/eligibility decision. Such a call would not establish correctness or reproducibility.
5. Require separate semantic acceptance and report/web/PDF acceptance before declaring the qualitative pipeline, much less all 30 sections, complete.

No production code, prompt, reference, migration or test was modified by this coordinator audit. Only this new handoff was authored; no commit, push, merge or deployment occurred.
