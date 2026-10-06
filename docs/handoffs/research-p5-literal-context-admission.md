# P5: source-bound literal context admission

Date: 2026-10-03. Worktree: `fix/research-real-world-audit`, baseline
`0116091fd5dc0902594f92d969dfb3ee0732c9c8`. Uncommitted integration slice.

## Problem and semantic authority

The adopted literal parser records matched I02 situation/time phrases both in
their structured fields and in `qualifiers`. I14 v1 rejected every qualified
row. A raw native review could therefore produce an eligible source-bound
situation while never reaching synthesis. Earlier retention tests started with
manually encoded I02 and did not exercise this representation mismatch.

`Review marketing framework files`, thread
`01a0a8fd-02d2-7e71-ba4c-244930d054bd`, completed turn
`01a10227-6557-73d0-bde1-fbcc64126392`, returned AGREE for the narrow v1.1
exception. The owning bridge must verify the retained adopted tuple, policy and
projection membership; caller-authored metadata or equal spans alone do not
establish authority. Every qualifier must equal a situation/time matcher span
of the same row/source. Other qualifiers remain blocked. Negation, condition,
hearsay, ambiguity and conflict guards remain in force. Role/time alone and
bare I04 action remain insufficient. All qualifiers and counterevidence stay
retained without counting duplicate spans as additional evidence.

For synthetic “Tôi mua tặng bình giữ nhiệt.”, the context supports only a narrow
conditional-fit candidate awaiting human review. It does not establish who the
recipient is, their age or needs, or market demand. This is semantic agreement,
not code approval, real coding acceptance or live-model authorization.

## Implementation

- Admission method 1.1.0 adds an exact retained literal-projection reference.
  It is derived from the existing verified native/located snapshot, not an API
  field, model response or fresh keyword guess.
- Qualifier equality is checked only after binding that projection to the
  same run, output, package and admitted I02 member. Generic/custom annotations
  still fail the qualifier gate even when the text and offsets match a field.
- Neither the parser, lexicon, adopted tuple nor original coding is changed.
  The pinned semantics brief describes whole-clause I02 spans, whereas its
  pinned parser/tests use matched phrases. This slice uses the verified actual
  offsets, does not silently edit the hashed authority file, and does not expand
  a phrase into a whole-clause assertion.
- New report executions explicitly select 1.1.0. Historical report reads select
  the version from their verified saved admission. Existing AI execution
  retries and reads use their retained admission version, including candidate
  validation. They do not upgrade old output or call the model again.
- No migration, UI style change, new provider, JEV promotion or automatic
  human acceptance is part of this slice.

## Validation boundary

The new primary regression enters at Foundation intake with raw synthetic native
rows, then runs the actual adopted parser, projection, report service, retained
AI execution and report reader. Only the final text transport is synthetic.
Before the repair it failed at the intended assertion: zero dispatches instead
of one. After the repair it passed with one source-cited, unreviewed candidate,
retained qualifier, blocked conditional/negated/time-only cases and query-only
replay without additional calls. It is not evidence of model quality.

The existing execution-owner test also requests replay under the newer rule and
requires the original v1 candidate bytes. A separate pure-admission test covers
the custom-row trust boundary: duplicate spans cannot grant adopted authority.
No new production test seam was introduced. Repository-native Node tests run
only in the isolated Fedora scratch checkout; no Windows project checks run.

Linux contract generation/typecheck and the initial affected group passed
42/42. The final focused admission/execution/native group, including the
unmatched-second-phrase case, passed 30/30. These groups overlap and are not
additive coverage or a full release gate. The independent Luna review traced
initial execution, verified replay and supplemental KEEP through the owning
bridges and found no reachable bypass. Its initial concerns about forged
helper arguments were withdrawn after checking those production boundaries
and the existing source-package/method identity validation.

P3/P4 batch acceptance, broader coding, actual model activation/quality,
three-product real evidence acceptance, all-30 coverage, Claude/owner final
design acceptance, merge and Fedora deployment remain open. JEV remains an
optional shadow proposer, not evidence or acceptance authority.
