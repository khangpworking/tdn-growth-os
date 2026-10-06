# Handoff — Insight I04/I09 construct prompt clarification

Updated: 2026-10-04
Worktree/branch: `research-automation-v1`, `fix/research-real-world-audit` (uncommitted)

GPT integration evidence: Linux response-validator tests 2/2 and production
exact-review tests 13/13 passed after this prompt-only edit. Four saved real
follow-up requests exact-retried with unchanged identities/bytes, zero calls
and zero database mutations. Original source database/artifacts were unchanged.
This proves retention/structural behavior, not semantic improvement. The first
focused invocation also named a nonexistent integration file and ran only the
two unit tests; the correct existing exact-review suite was then run separately.
No full-suite claim is made.

Completed:
- Added the private business follow-up audit's two generic wording proposals to the
  Insight semantic-coding prompt. Audit SHA-256:
  `79ce3252699cbaf80e008db835cca01cae6a22dc2f3c6c1b183b8699003568a1`.
- The wording clarifies existing D06/D07 constructs. It is not a new coding method,
  codebook, or authority decision.

Changed paths:
- `src/modules/analysis/research-automation/insight-model-execution.ts`
  (only the `systemText` template literal)
- `docs/handoffs/research-insight-construct-followup.md` (this file)

## Exact delta

File SHA-256 before: `de7fac9dfa95198ae7852e999c33083f529caaa51ae27a05b7abdd507ac6b428`
(the revision the audit reviewed). After:
`8c8380963b19ebe715f7807045ec3fe75c2fed13e2c2fd05804130cd9454a4ae`. The file is
untracked in Git, so this file hash is the only baseline. Both changes add text;
no existing sentence was changed or removed.

The I04 line gets these sentences appended:

> An action candidate must describe conduct attributed by the source. A predicate
> describing an attribute, condition or appearance is not an additional performed
> action merely because it contains a verb. Preserve such wording as
> descriptive/context evidence; if the action reading is unresolved, retain
> disagreement or omit the action candidate without marking a reviewed negative.

The I09 line gets these sentences appended:

> For desiredState, require wording that directly states a wanted or needed
> condition or outcome. A plan or conditional intention to perform an action alone
> is not automatically a desired-state statement; retain it in context/action-intent
> topics, or keep the desired-state interpretation unresolved with source-bound
> disagreement. Retain directly stated current states even when no desired state is
> present, including source-attributed experiential or perceived states; preserve
> qualifiers and do not turn them into verified facts, failures or latent needs.
> Apply the same eligibility rule to equivalent evidence across records. Missing
> sides and relations remain null.

These sentences are unchanged: the provenance/disagreement rules (`PENDING_AI`,
`semantic-coding-model-v1`, `adjudication:null`, source-bound `disagreement`), the
I05 rule against forcing polarity, and the I02 conditional/future context rule. The
new text has no product terms, record IDs, source snippets, expected answers, object
counts or lexicons. `contractVersion` is still `insight-model-prompt-v1`, which the
schema requires as a `const`. Prompt identity is the retained content digest, not
the version string.

Not changed: the request/input/prompt schemas, source eligibility (`buildInput`),
codebook, authority, the response validator (`validateSemanticCodingResponse`),
method computation, the frozen reference, outcomes, retained prompts and reports.

## Retained replay implications (static read of `synthesis-execution.ts`)

- New preparation: when no execution row exists, `execute` stores
  `built.promptBytes ?? adapter.promptBytes`. The Insight `build` returns no
  `promptBytes`, so new rows keep the new `json(prompt)` bytes and their
  `prompt_sha256`.
- Existing rows: `#readRetainedExecution` reads the stored prompt artifact by
  `row.prompt_sha256`. It checks the stored bytes against schema and canonical form,
  then binds admission and input only (Insight `bindsRetained` compares the input
  alone). The current prompt is never compared with or swapped in for stored bytes.
- PREPARED, not yet dispatched: checks `row.prompt_sha256` against the stored prompt
  bytes, not the current constant. `#dispatchAndRetain` sends
  `systemText(retained.prompt)`. A row prepared before this edit is therefore
  dispatched with its old stored prompt. This is the correct exact-retention
  behavior, but it means such a row will not use the new wording.
- Settled rows (`#settled`, `read`, `readActivity`): replay uses stored bytes only.
  Candidates are rebuilt with the unchanged response validator and must match the
  stored bytes exactly.
- No other code in `src/` or `tests/` pins the Insight prompt digest or text.
  Verdict: safe. I found no blocker.

## Static risks

- Overlap with existing rules: I04 already says intended future actions are not
  performed actions, and I09 already says missing sides stay null. The repetition
  is deliberate and should not conflict.
- The new rules could lead the model to omit some candidates that are correct
  today (for example, real desires that are only stated as wanting an action), or
  to report disagreement more often. Neither is checked by the response validator.
- "Apply the same eligibility rule to equivalent evidence across records" asks for
  consistency but cannot enforce it. Coverage gaps such as a skipped current-state
  inventory may remain.
- Size: about 1.1 KB of text added. The embedded schemas take at most 43 KB on
  disk, far below the 128 KiB prompt limit. Bytes were not measured at runtime.

## Limitations

- No tests, typecheck, build, generator, provider call, SSH, DB write, commit or
  deployment was run on Windows (as instructed). The parent owns integration and
  Linux tests.
- This does not show any change in model quality. A claim of improvement needs a
  new semantic evaluation against the frozen reference, with the retained prompt
  digest bound to each dispatch.
- The audit's traceability caveat still applies. Earlier follow-up outcomes record a
  code snapshot hash, not a retained prompt digest. Attribute results to a prompt
  revision only through the ledger's `prompt_sha256`; do not recompute it from
  current code.
- The audit's open adjudication items are unchanged: the I09 conditional-plan cases,
  the I04 appearance-predicate case, current-state omissions, ambiguous quantity
  wording, valence/actor elision, and the empty I07/I08.

Next action: the parent runs the Linux Insight execution/replay tests and decides
whether to commit. Any quality claim needs a separately authorized semantic re-run.

Business decisions pending: whether to treat plain intention statements as desires
would need an explicit, versioned method decision. This change does not make it.
