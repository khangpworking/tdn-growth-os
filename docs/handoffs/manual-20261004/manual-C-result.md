# Handoff — Assignment C: generic Insight coding gaps from the semantic audit

Updated: 2026-10-04 (Asia/Bangkok)
Worktree/branch: `fix/research-real-world-audit`, HEAD `0116091fd5dc0902594f92d969dfb3ee0732c9c8` (uncommitted tree preserved; no reset/clean/stash/branch switch; no commit/push/deploy).
Status: **READY_FOR_REVIEW** (bounded assignment complete; all work below is offline — zero model/provider calls, zero live database writes, zero acceptance changes).

## 1. Assignment

Address the generic Insight coding gaps identified by the private construct-prompt business-semantic audit (`pilot-business-audit-construct.md` SHA-256 `653efbfa…dd69d`, `pilot-business-audit-construct.json` SHA-256 `179eb881…76f1` — both verified before use). Improve generic prompt/input behavior in `insight-model-execution.ts` only; preserve located evidence, conservative uncertainty and pending human review; separate proven bugs, model omissions, unresolved interpretations and missing eligible source material; do not optimize for a private expected count.

## 2. Files changed (before → after SHA-256)

| Path | Before | After |
|---|---|---|
| `src/modules/analysis/research-automation/insight-model-execution.ts` | `8c8380963b19ebe715f7807045ec3fe75c2fed13e2c2fd05804130cd9454a4ae` (matches checkpoint-files.json) | `e73a69b8e14c289f466b22f21a43fafa93cfb9ec54721b5b85f42ba20f05f7e3` |
| `tests/integration/research-insight-prompt-retention.test.ts` | — (new file, unique to this task) | `0cfb17557199771cd37b28b0fd4415e28ecd5fef44a6915eebe2ccc5c6bce48e` |

`semantic-coding-response.ts` is **byte-identical** (`638d45982f6d6ad15888f293ff942340d8ac6e6ef068886cffae5030adbd8df1`). No proven validator defect was found, so **no hunk is proposed** for coordinator assignment. No schema, migration, service/API, UI, projection guard, acceptance role or reference data was touched. All other changed/untracked files in the tree belong to A/B/inherited work and were not modified.

## 3. Finding → code/prompt → expected behavior map

Audit classification first: **no finding was a proven software bug in my owned code.** F02 (I05 omissions) and the I02/I09 coverage gaps are model omissions under the prior prompt; F04's selection block is an intentional guard interacting with over-broad model disagreement; F08 is missing eligible source material (source-limited families). The only owned lever without a second model call was generic prompt wording at generation time; the deterministic validator already enforces location/structure/pending provenance.

| Finding | Families | Delta in `insight-model-execution.ts` system prompt (generic; no record IDs, no counts, no invented sentiment) |
|---|---|---|
| F01 | I02 | Replaced "do not create an empty context row merely to fill coverage" with a row-eligibility rule: one context row whenever ≥1 field is directly stated, even if other fields are unstated or their interpretation unresolved; unresolved interpretation keeps that field UNKNOWN without suppressing the row; no row when no field is stated. |
| F02 | I05 (+ all families) | Added a global pre-return self-check: re-check every supplied record clause by clause, family by family; each directly stated clause/task/state must be evaluated by its own family; another coded aspect or similar totals elsewhere never substitutes, and equal/similar family totals do not demonstrate coverage. |
| F03 | I04 | Added: attribution states only whom the source identifies (UNKNOWN when the actor is not identified; OTHER_REPORTED only for a source-attributed non-speaker; actor-elided reports stay literal event reports); counterevidence requires an explicitly stated contrary fact/relation — relevant co-text with an unknown relationship (e.g. quantities without a stated comparison) goes in qualifiers and is not a contradiction/shortfall; COMPLETION_REPORTED covers exactly the stated completed activity, never a related unstated activity (ordering/payment/delivery). |
| F04 | I06 (+ provenance) | Added: same-record order requires only explicit in-record linkage; unidentified actor/person ID/timestamps/episode keys limit stronger identity or cross-record claims, not this narrow order claim, and must not be cited as disagreement on a row whose linkage the source states; genuine order disagreement is never cleared. Rewrote the disagreement rule claim-scoped: disagreement is about the annotation's own claim; source limitations on different/stronger claims are represented in the family's own fields; never clear or narrow genuine disagreement to obtain selection or approval. The selection guard was **not** changed. |
| F05 | I09 | Extended the existing eligibility sentence: the same eligibility rule applies across records **and independently of other families** (a directly stated state is retained as currentState even when the same clause is coded in another family); never emit a gap row with both sides null; never infer the missing desired state or gap relation. |
| F06 | I10 | Added the counting unit: one membership per source-native record per code even when the phrase repeats; retain each distinct occurrence as its own span assignment without merging or dropping repeats; repeated spans, batch slices and identical texts never become additional records, people or memberships. |
| F07 | I10 | Added: a short literal span stays valid while its full original record is retained; do not widen a span beyond the codebook phrase occurrence. (The enclosing-context display guard is a projection/UI concern outside C's ownership — see §7.) |
| F08 | I07/I08/I13 | Added to the arrays rule: an empty array states only that the supplied records contain no eligible located clause for that family; it is never proof that no reason, barrier or brand exists and never a reason to force an example. |

Also unchanged on purpose: raw-span/offset rules, `PENDING_AI`/`semantic-coding-model-v1`/`adjudication:null` provenance forcing, "return all arrays even empty", "never invent missing evidence", no second model call for phrasing. humanizer-vi skill (available locally, revision per COMMON.md) was **not applicable**: the prompt is English instruction text and no Vietnamese interpretation copy was authored; raw spans and structured coding are untouched.

## 4. Prompt-byte retention (history safety)

The kernel (`synthesis-execution.ts`) stores prompt bytes content-addressed at new preparation only ("Exact frozen prompt bytes retained by a new preparation only. An existing row always uses its retained prompt.") and replays settled rows from retained bytes only. Therefore the revision changes new attempts only; the four retained pilot dispatches (prompt `6899efbe…ed2d`) and all earlier attempts remain replayable with their original stored prompt/input and expected hashes. No code change was needed for this; the new integration test verifies the binding with a synthetic transport (zero live calls).

## 5. Actual checks (Linux; disposable snapshot separate from A)

- Snapshot: `/home/pkhang/.cache/tdn-c-insight-prompt-20261004/snapshot` (fresh dir, sole writer this task; excludes `.git`, `node_modules`, runtime/private data, secrets). Source tarball SHA-256 `ef7ee2858a888038b52402ed231f1740053a1935ce6a4ade8232fb5c1c68c0e2`; pre-run manifest `../snapshot-manifest.sha256` (SHA-256 `2306d1b4ee1d9bc7b9c74f5b8007cd936c47d35dff1b25034053060a27031729`, 800 files). The test file was fixed after the manifest; the final synced bytes of both changed files were re-hashed on Fedora and match the table in §2 (`e73a69b8…`, `0cfb1755…`).
- Toolchain: `/home/pkhang/.nanobot/workspace/.toolchains/node-v24.15.0-linux-x64/bin` — node v24.15.0, npm 11.12.1. `npm ci` from lockfile (147 packages).
- `npm run typecheck` — **PASS** (after fixing two type errors in my new test; snapshot error output retained in run history).
- `node --import tsx --test tests/unit/research-semantic-coding-response.test.ts` — **2/2 PASS**.
- `node --import tsx --test tests/integration/research-insight-prompt-retention.test.ts` (new) — **1/1 PASS**. Verifies with synthetic transport only: dispatch under the revised prompt reaches VALID; claimed HUMAN_REVIEWED/adjudicated provenance is forced back to `PENDING_AI`/null while source-bound disagreement is preserved; the retained prompt artifact at `prompt_sha256` equals the dispatched systemText; an exact retry with no transport returns the identical proposal (`exactRetry: true`) with zero new calls and zero DB mutations (`total_changes()` unchanged); an invented-quote payload settles INVALID and replays INVALID with zero mutations.
- `node --import tsx --test tests/integration/research-automation-exact-reviews.test.ts` (existing production-path insight suite, affected by the prompt constant) — **13/13 PASS**.
- NOT_RUN: full repo suite, market/family suites unaffected by the edit, live model/provider calls, real-data semantic verification, any Fedora operator state change.
- Debug helper used transiently on the snapshot was removed; mid-fix failures and their resolution are summarized here: the only test-side defect was an invalid-attempt request that did not chain `previousProposalId` to the first proposal and was correctly rejected by the parent-identity guard (the guard works as designed; the test now chains it).

**Explicit limitation: these offline checks prove lifecycle, exact offsets, pending provenance, retry preservation and invalid-payload rejection on synthetic inputs. They do not establish fresh model semantic quality under the revised prompt, and the prompt self-check wording alone does not prove clause coverage. No live benchmark has run.**

## 6. Proposed real-model benchmark (for coordinator approval; no calls made)

Design principles: same frozen 20-record retained source, frozen reference and dispatch rules (private digests as recorded in the audit JSON: source `d64c6117…10a6`, reference `342bbdfd…69df`, rules `f43a78d8…5c5a`) **plus** independently prepared synthetic other-category cases for thermos and handheld fan (fresh paraphrases authored for this benchmark, never derived from private rows and never scored against a private expected count). AI-assisted development audits remain references for comparison, not a holdout and not an accuracy oracle.

Dimensions (per family, per batch):
1. Method-level coverage: for each family, does every directly stated clause/task/state have an own-family evaluation (self-check effectiveness; F01/F02/F05)?
2. Unsupported claims: no people counts, causality, completion beyond stated activity, material/composition facts, population or prevalence claims.
3. Polarity/negation: clause-level polarity with literal targets; local negation qualifiers attach to their own occurrence; star/silence never yields sentiment.
4. Attribution: actor-elided clauses → UNKNOWN; third-party/hearsay stays attributed; no authenticated actors.
5. Partial-state eligibility: equivalent current states retained consistently across records and families with null missing sides; no null/null placeholders; no inferred desired side/gap.
6. Source-locator validity: all spans exact half-open UTF-16 slices of unmodified text; repeated occurrences retained while record-code membership counts once.
7. Disagreement scoping: narrow-claim uncertainty preserved; identity limitations not cited as disagreement on established narrow claims; nothing cleared to pass selection.

Protocol: freeze the benchmark spec and synthetic fixtures with hashes before any dispatch; fresh batches only (no replay comparisons across prompts presented as improvement); record per-dispatch elapsed time and structural outcome, with cost reported separately and marked UNKNOWN where billing is unavailable; report counts as audit leads with units named (objects vs spans vs record-code memberships vs records), never as precision/recall or acceptance. Fresh calls, adjudication and application acceptance remain with the coordinator. Output is a development comparison only — not unseen-data accuracy, not readiness for all nine families.

## 7. Unresolved / policy points (isolated; none blocks independent corrections above)

1. **I04 attribution disposition (business):** my prompt makes UNKNOWN the conservative generic reading for actor-elided clauses. Whether existing OTHER_REPORTED readings (retained pilot rows) are re-disposed is a routine business disposition on pending rows — not decidable offline by C.
2. **I06 disagreement scope vs selection guard (business, later):** the guard was preserved per the audit. If the business ever wants record-local orders with unknown actors selectable despite identity-only disagreements, that is an explicit selection-policy change (coordinator + owner), never a prompt instruction to clear disagreement.
3. **I10 enclosing-context display (needs coordinator assignment):** short literal topic spans are valid but meaning-critical context (negation/comparison/hearsay) lives in the full record; a report/export that shows only bare snippets would misrepresent them. The fix belongs in selected-insight-projection/UI (outside C's ownership; no defect observed in current rendering — this is the audit's presentation-risk recommendation).
4. **I08 R47/R48 and I07 R5/R6 alternatives (business):** existing task-obstacle and future-purpose readings remain unresolved adjudication candidates under the frozen reference; empty model output is conservative abstention, not two proven misses.
5. **I13 source limit:** no eligible category-brand positive, codebook or declared peer set exists in the packet; positive-family capability remains unproven and must not be forced.

## 8. What the next agent can depend on

- The revised generic prompt at the hashes in §2 affects **new** insight preparations only; retained executions/retries replay from stored bytes (verified by test, synthetic transport, zero live calls).
- `semantic-coding-response.ts` and all A/B-owned/shared files are untouched; ownership of `insight-model-execution.ts` is released back to the coordinator.
- The disposable snapshot `/home/pkhang/.cache/tdn-c-insight-prompt-20261004` is mine; safe to delete after review. A's scratch was never touched.
- Private audit material was read at the exact permitted paths, hashes verified, and nothing private (raw source, reference rows, audit text) was copied into the repository.
- Next precise step: coordinator approves/adjusts the §6 benchmark spec, then runs the bounded fresh-model comparison; nothing in this handoff claims semantic improvement of a fresh model run.
