# Insight audit follow-up: three bounded lanes

Date: 2026-10-04. Updated: 2026-10-05. Owner authorized Claude, Jev and Codex to work together on the saved-output audit follow-up. This is not all-30-section acceptance, deployment or approval of private coding.

Baseline: dirty worktree `fix/research-real-world-audit` at HEAD `0116091fd5dc0902594f92d969dfb3ee0732c9c8`. Existing changes are preserved. Parent audit: `docs/handoffs/research-insight-prompt-benchmark-audit-20261004.md`.

## Ownership and dependencies

| Lane | Owner | Owned work | Does not own |
|---|---|---|---|
| A | Claude Opus, high effort | Full-source disclosure at proposal review and acceptance confirmation; mounted UI regression; new handoff | Backend, prompt, schemas, methods, runtime, private data |
| B | Jev, orchestrated by Codex | Separate synthetic source-clause triage pilot with frozen rubric, exact responses and bounded calls | Application routing, source admission, coding acceptance, report generation |
| C | Codex | Two generic I02 prompt repairs; audit Claude changes; freeze combined Linux snapshot and verification; coordinator handoff | Silent method changes, source/reference rewriting, deployment |

Claude edits only InsightCodingPanel.tsx, insight-coding.css, an optional new InsightSourceContext.tsx, the existing mounted coding UI test and its own new handoff. Parent edits the prompt owner and this task/coordinator handoff. No concurrent writes to the same files. Tests run only after both writers stop, from an isolated Linux snapshot.

## Checklist

- [x] A: offer the complete exact source record at each review/confirmation item.
- [x] A: preserve short annotation spans, source snapshot, index selection and existing explicit acceptance guards.
- [x] A: unavailable/unreadable cases inspected; long text, literal HTML and zero-write disclosure exercised on Linux.
- [x] C: add generic scope-check instructions; preserve original records and relevant mixed clauses. Model-quality verification remains separate.
- [x] C: add generic original-source task recheck, including conditional/future wording; prohibit blind cross-family copying. Model-quality verification remains separate.
- [x] B: freeze synthetic fixtures/labels/rubric before dispatch; 16/20 calls, no automatic retry.
- [x] B: no private records or expected labels sent; structured responses/latency/usage retained.
- [x] B: audit errors and repeats; correct JSON-key-order probability comparison; no accuracy/speedup overclaim.
- [x] C: review implementation and test value; mounted regression fails for missing disclosure on pre-fix panel and passes after repair.
- [x] C: Linux backend prompt-retention test, mounted UI tests, backend/frontend TypeScript and frontend build; desktop 1440px/mobile 390px browser inspection.
- [x] C: separate verified technical behavior from unmeasured model-quality and release acceptance.

## Stop conditions and ceilings

- Jev is shadow-only. It cannot drop records, change corpora/denominators, accept coding, clear disagreements or replace deterministic validation. It is not on the application critical path.
- No new GPT benchmark calls in this task. Its existing budget stays 5/8; those remaining three calls are not repurposed for Jev.
- No private-source upload, paid collection, provider rerun, live business writes, migration, operator restart, commit, push, PR, merge or deployment.
- No Windows project tests/build/typecheck/generators. Pilot code is standalone API evaluation, not an application test; production checks run on Linux.
- Prompt revision retains existing historical artifacts/replay. No schema change, product-specific keyword patch, forced reference counts or fabricated annotations.
- If Claude is unavailable, report that state and preserve completed parent/pilot work. Do not falsely claim three completed lanes or silently substitute another Claude model.

## Completion evidence

Record actual model and call count, exact changed-file/prompt identities, Linux environment and commands, executed checks, screenshots if taken, failure/root-cause evidence and unresolved semantic controls. Retain synthetic pilot artifacts outside the application checkout. Application promotion of Jev, real-source prompt verification and all-30 web/PDF acceptance require distinct decisions and evidence.

Completed slice evidence: `docs/handoffs/research-insight-audit-followup-parallel-20261005.md`. No production promotion or deployment.
