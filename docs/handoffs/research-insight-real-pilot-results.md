# Insight real-source retrospective pre-pilot

Date: 2026-10-04. Unreleased working tree, not Fedora operator activation.
Sections: I02/I04/I05/I06/I07/I08/I09/I10/I13. Follow-up to
[preparation](research-insight-real-pilot-preparation.md).

## Frozen inputs and independent reference

The business session completed the 20-record reference before seeing model
output. GPT found a wrong-occurrence negation qualifier in R52; the business
session corrected it from an earlier identical word to the selected clause's
own occurrence, then froze the reference again. Exact substring validation alone
had not caught that semantic attachment error.

- Reference JSON SHA-256: `342bbdfd1875a92f852b80ade4b955c61cbd22a59a9687e599c84e45e0a669df`.
- Reference notes SHA-256: `28bacc2985ef4fd60161df18282c8b9933c3243dbf2ff23e92cf4df320644566`.
- Pilot rules SHA-256: `f43a78d8e67994d385f35a1253b69ad1dc77ec40c77251e156745c20161f5c5a`.
- Original 62-row source ledger retained, with 20 eligible records and original
  indexes. The reference contains 186 checked span occurrences and 26 literal
  topic codes. All context-specific topic mapping restrictions were supplied
  to the model; expected annotations were withheld.

The reference is AI-assisted, not human gold. This is a retrospective development
pre-pilot, not an unseen holdout, representative corpus or application acceptance.
Unresolved/alternative reference interpretations remain open, not binary errors.

## Observed production-path dispatch

Existing production service, transport, validators and persistence ran on the
private Linux copy prepared earlier. Model: `gpt-6.1-sol`; no explicit reasoning
effort is configured by this transport. Four calls, five original records per
call. No automatic retry. No new data-provider collection.

| Batch | Service elapsed | Structural result |
|---|---:|---|
| 1 | 79.795 s | VALID, retained pending proposal |
| 2 | 48.462 s | VALID, retained pending proposal |
| 3 | 63.959 s | VALID, retained pending proposal |
| 4 | 81.339 s | VALID, retained pending proposal |

Total service elapsed: 273.555 seconds. This is not end-to-end UI latency or a
performance guarantee. Billed cost remains UNKNOWN; the current text transport
does not return billing usage. Four dispatches do not prove a dollar amount.

All 42 record/topic-code membership pairs match the frozen reference. This
does not establish semantic accuracy across nine families: exact topic pairs
are only one dimension, and differing clause boundaries need separate review.

| Family | Reference annotation count | Model annotation count |
|---|---:|---:|
| I02 | 20 context containers | 0 |
| I04 | 18 | 8 |
| I05 | 29 | 14 |
| I06 | 1 | 2 |
| I07 | 0 mandatory | 0 |
| I08 | 2 candidates requiring relation review | 0 |
| I09 | 12 partial current-state candidates | 0 |
| I13 | 0 category-brand positives | 0 |

These counts are audit leads, not precision/recall. In particular, empty I02
containers are not missed positive evidence; I07/I13 have no mandatory positive
example here, so absence cannot demonstrate recall.

## Material observations and correction in progress

- Model omitted directly stated I02 task/time contexts and all I09 partial
  states. Omitting an unsupported gap is correct; discarding a supported
  current-state-only candidate loses the adopted method's incomplete evidence.
- One mixed evaluation was collapsed into a targetless MIXED statement rather
  than retaining separately evaluable clauses and the price target.
- One I06 proposal uses a contrast connector for order. It needs business
  adjudication; schema-valid span/relation containment cannot establish order.
- Some distinct reported actions/negations and opposed delivery claims were
  omitted or merged. Exact quotes still need clause/speaker/qualifier review.

The coordinator added generic per-family method instructions to
`src/modules/analysis/research-automation/insight-model-execution.ts`, based on
the adopted D06/D07 profile. No source-specific answer, product branch, validator
relaxation, schema change or reference edit was introduced. The updated prompt
explicitly distinguishes conditional context, reported action, clause polarity,
temporal order, reason/task relations and incomplete I09 states. The business
session is auditing these instructions and the observed results. Model quality
after the prompt change has not yet been measured.

Linux existing validator and production exact-review suites: 15/15 PASS.
No new synthetic mock is offered as proof of language understanding. Exact
retry of all four retained real proposals under the new prompt returned the
same results, with zero model calls, zero database mutations and unchanged
database bytes. The original source database and artifact tree remained exact.
The retry command uses the OWNER service's write-capable transaction boundary;
it is not claimed to be a query-only read endpoint.

## Private artifacts and next action

### Development follow-up and business audit, 2026-10-04

The business session audited the baseline and generic D06/D07 prompt. It
confirmed the context/partial-state omissions, mixed-clause granularity loss
and unsupported temporal relation. It distinguished these from valid negative
wording and representation differences. Private audit SHA-256:
`d94eba5ce668b57a3e44f20b62b628e6a9ab918a0ae62a7b18073464c43835c8`.
It did not approve the model, application or report.

The separately identified `method-prompt-followup` then completed four calls
against the same source, reference and rules. It used the generic method prompt
at source-file SHA-256
`98f5e6a95ed4c4385803005f931186bfa8e6b35900de498efc3d955db9f357e0`.
All four results are structurally VALID and remain pending AI proposals.

| Batch | Service elapsed | Result |
|---|---:|---|
| 1 | 106.984 s | VALID |
| 2 | 58.577 s | VALID |
| 3 | 124.971 s | VALID |
| 4 | 161.805 s | VALID |

Total: 452.337 seconds, versus 273.555 seconds in the baseline. This is one
development comparison, not evidence of stable performance or unseen accuracy.
There were eight model dispatches across the two runs. Monetary cost is still
UNKNOWN, not zero. No provider recollection was made.

| Family | Baseline objects | Follow-up objects | Interpretation |
|---|---:|---:|---|
| I02 | 0 | 12 | Direct context is now represented; field meanings still need audit. |
| I04 | 8 | 20 | Distinct and contradictory reported actions are better separated. |
| I05 | 14 | 20 | Mixed evaluation split and price target recovered; some omissions remain. |
| I06 | 2 | 1 | Unsupported contrast-based order removed; explicit order retained. |
| I07 | 0 | 0 | No resolved positive in the reference; no recall claim. |
| I08 | 0 | 0 | Reference candidates remain unresolved; no false-negative count. |
| I09 | 0 | 20 | Partial states recovered, but repurchase intent coded as desire needs audit. |
| I13 | 0 | 0 | No category-brand positive in this sample. |

I10 retains the same 42 record/code pairs. Object counts are diagnostic leads,
not precision/recall or the number of accepted insights. The business session
is independently reviewing the follow-up, including I09 desire-versus-intent
and missing evaluative clauses. Reference and rules were not rewritten to fit
the model.

The baseline audit also identified a contradictory instruction: every
provenance was required to have `disagreement:null` while other instructions
allowed explicit uncertainty. The coordinator applied the exact reviewed
replacement after the follow-up, permitting a concise source-bound disagreement
while retaining `PENDING_AI`, the model coder role and null adjudication.
Current source-file SHA-256:
`de7fac9dfa95198ae7852e999c33083f529caaa51ae27a05b7abdd507ac6b428`.
This final clarification has not had another live model benchmark.

Linux validator and production exact-review suites passed again: 15/15, no
skips. A separate exact replay of all four follow-up requests under the clarified
prompt returned the same retained proposal identities and bytes, with zero
model calls and zero database mutations. Database bytes and original source
database/artifact tree stayed unchanged. Acceptance rows remain zero and there
is still one report pair. No PDF, live activation or completion promotion.

Private phase: `~/.cache/insight-real-run-Bq0Bkt/method-prompt-followup`.
Comparison SHA-256:
`1e5fc0f0be79c4ff3e82c9bbb6c08f846d947a260de510fb2db94a4ed6ef61de`.
Observed annotations SHA-256:
`8ae69afba609caa1df7b582ab3d6808021d6d39ff656cb8f538d7c0238d21e19`.
Free-text sources and outputs remain private and outside Git.

### Baseline artifacts (retained)

Private root: `~/.cache/insight-real-run-Bq0Bkt`. Reference, rules,
requests, outcomes, proposals, comparison and replay receipts remain outside Git.
Comparison digest: `58d122404c17f8917b324d8a53cf7c26632bc59524a20b60567c6621fd5779c6`.
Observed annotation digest: `010ed5e4e10858c765b4287af4ea12dc61194efe6a63907475cbd2f8fd4dc767`.
No application acceptance receipt was created; the original one report pair
remains unchanged. No new PDF, business decision or live deployment.

### Follow-up audit completed and exact prompt traced (04/10)

Business audit confirmed actual gains in context, clause separation, attributed
conflicts and temporal-order restraint. It did not approve semantic acceptance.
Remaining findings: action intention versus desired state, a missing partial
current state, and an appearance predicate misread as a performed action.
Unresolved interpretations remain for review; neither object counts nor missing
neutral annotations are automatically accuracy errors.

Claude applied the audit's two generic I04/I09 clarifications without changing
the method, validator, source, reference or authority. New source-file SHA:
`8c8380963b19ebe715f7807045ec3fe75c2fed13e2c2fd05804130cd9454a4ae`.
No new model output has been generated under this wording. Four real follow-up
exact retries still returned their old results with zero model calls/mutations;
the copied database and original source database/artifact tree stayed unchanged.

Query-only inspection established that all four follow-up calls used prompt
`86759df337db9a532d5d8e430cc904f176461cfc7b990b7f51726bd8d4477b3b`
and configuration
`a6000a32721f950535238a2480383482a10b2bcaf585fdb8933a801c1901a389`.
That retained prompt still has the original JSON-form disagreement-null
instruction. The later provenance and construct fixes must not be credited
with this run's observed gains. Stored outcomes were not rewritten.

Private trace-v2 SHA:
`c054f68b8fe4c7d7ed15e54d27cbeb340169be92d5dc92dcbb52f4486764cde8`.
It corrects the first diagnostic helper's string probe, which searched for a
prose-form instruction instead of the actual JSON-form instruction. Prompt
bytes, dispatch digests and outcomes are unchanged. The exact retained prompt
and trace were supplied to the business reviewer; no fresh provider call was
needed. Original business audit SHA before its trace addendum:
`79ce3252699cbaf80e008db835cca01cae6a22dc2f3c6c1b183b8699003568a1`.

Next: verify these specific construct fixes in a bounded semantic run, then
address missing real thermos/fan corpora and the other method/source families.
Do not call a development rerun an unseen benchmark. No section-completion
counter is promoted, and no acceptance receipt, PDF or deployment was created.

### Construct/provenance follow-up executed (04/10)

The next four batches completed under code SHA
`8c8380963b19ebe715f7807045ec3fe75c2fed13e2c2fd05804130cd9454a4ae`.
Query-only inspection verified the actual persisted dispatch prompt, not just
the current source file: all four used prompt SHA
`6899efbe28e3c2607b8ac62a84fe90262caefa79384dd6eb7d4fca9baa39ed2d`.
It includes the revised uncertainty/provenance wording and construct guidance.
The same reference, rules and 20 retained records were used, without new collection.

| Batch | Service elapsed | Structural outcome |
|---|---:|---|
| 1 | 107.041 s | VALID |
| 2 | 73.646 s | VALID |
| 3 | 116.804 s | VALID |
| 4 | 179.285 s | VALID |

Total 476.776 seconds; 12 model dispatches across all three development runs.
Monetary billing remains UNKNOWN. Counts: I02=10, I04=19, I05=20, I06=1,
I07=0, I08=0, I09=26, I13=0. I10 retains 42 exact record/code memberships.
Neither counts nor structural validation demonstrate semantic improvement.
In particular, partial/empty-state entries must not be counted as resolved
needs. The business session is auditing exact source meaning independently.

Four exact retries returned the retained results with zero model calls and
zero database mutations. Private database bytes and the original source
database/artifact tree were unchanged. Application acceptance rows remain zero;
the single original report pair remains unchanged. No PDF or activation.

Private phase: `~/.cache/insight-real-run-Bq0Bkt/construct-prompt-followup`.
Comparison SHA: `d81f3ec628e21a194e7d5cfd96b8bae68f69e1b31aa137219ccb925a97144cc2`.
Observed annotations SHA: `70b79acfbf72382d96b5116b6f0476d23bf6c6bedd884dde4286d049036bfe2e`.
Retained prompt trace SHA: `9cc407bcbd7416db24095e7cd07039681b18c77f2f9afc05905a1bcc0e0e0802`.
Replay receipt SHA: `c77c4af5a592d3195d4db8f8f1ff4936720955a4bd71b45c8034036b1de58264`.
All detailed records remain outside Git. Semantic acceptance is still open.
