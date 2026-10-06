# Source-bound literal coding proposals

Date: 2026-10-04. Unreleased changes on `fix/research-real-world-audit`, baseline
`0116091fd5dc0902594f92d969dfb3ee0732c9c8`. This is partial P4 progress,
not completion of the model-coding pipeline or any of the 30 report sections.

## Delivered

`POST /owner-api/workspaces/:workspaceId/research-automation/runs/:runId/insight-coding-literal-proposals`
accepts only `contractVersion: insight-coding-literal-propose-v1`, requestKey,
adoptionId and explicit previousProposalId. It uses the existing authenticated
OWNER gate and `AutomationInsightCoding` write owner. No new table, migration,
dependency, model configuration or provider request was introduced.

The service replays the adopted source context and exact predecessor, discovers
literal matches in I10/I13 codebook phrases, then persists an ordinary immutable
proposal through the existing service. The existing UI can review the resulting
proposal after authoritative reload; a UI action to initiate generation is not
part of this checkpoint.

- Exact case-sensitive text and UTF-16 spans; no normalization, inferred aliases,
  demographics, sentiment, journeys, gaps or implicit codebook adoption.
- All occurrences retained, including a mention in a negated or reported claim.
  A match is only a candidate for review, not proof of preference or semantic fit.
- Same source digest/locator is one record; excluded/unreadable records produce
  no candidates. Full source/corpus membership remains unchanged.
- No-hit records stay PENDING. No literal hit does not establish semantic absence.
- Previous annotations and dispositions are preserved. Repeating generation does
  not duplicate matching spans, or carry acceptance into a new proposal.
- Machine suggestions use the existing `PENDING_AI` calculation exclusion;
  `coderRole` explicitly records `literal-codebook-matcher-v1 (no model)`.
  The existing UI renders this basis as “Gợi ý chờ duyệt”. OWNER actor identity
  is never overloaded with a model/matcher name.
- Same-key exact historical retries remain available after a newer report;
  new stale predecessors conflict. Authenticated receipts remain a separate action.
- Expansion has incremental byte/array bounds. Over-limit output fails without
  silently dropping occurrences. The persistence envelope keeps its existing cap.

## Verification

All project checks ran on the isolated Fedora scratch checkout, not Windows or
the running operator. Final root and frontend typechecks PASS. Contracts were
generated on Linux and copied back.

- Literal proposer plus selected-projection owner tests: 5/5 PASS. Three synthetic
  product phrases exercise exact repeated mentions, supplementary Unicode before
  offsets, uppercase nonmatches, negation/hearsay retained as pending, duplicate
  records, excluded/unreadable records and no-hit pending coverage. Competing
  single-code matches cannot both be accepted; oversized generation is rejected.
- Existing OWNER HTTP journey extended, final 1/1 PASS: closed request, auth,
  generated candidates, exact retry without extra evidence, no automatic receipt
  or report edit, stale-predecessor conflict, explicit authored revision and
  acceptance, read-only history, historical generated retry after report revision.
- Existing exact-source coding/report journey: parent plus three synthetic case
  subtests PASS (4 reported tests), retaining source/proposal/receipt/report
  semantics. This ran before the final generator byte-bound addition; that test
  exercises the unchanged authored proposal path, not the new matcher.
- `git diff --check`: PASS.

Test ownership follows `test-audit`: extend the existing persisted HTTP owner for
new route behavior; focused pure tests own matching semantics, not another full
copy of persistence/retry tests. No assertion removed or weakened.

ZCode GLM-5.3-Flash high successfully inspected the pre-change coding contract
and service, session `sess_34e308f6-4d62-4377-81a7-4adafe9e1f55`.
Its optional suggestion to encode model
identity in actorId was rejected. The subsequent new-code review process ended
failed without a review result; this checkpoint does not claim independent code
approval. GPT inspected the write/currency/matching boundaries and added the
incremental expansion cap.

## Remaining work

P4.4 remains open: a retained, source-bound model-proposal execution path and
rubric evaluation are still required for semantic coding and relations. The
existing synthesis executor is bound to running report parents; adopted coding
rules belong to a completed exact report pair, so it must not be called under a
fabricated running report identity. Reuse its mechanics through an explicit
coding parent if extended; do not hide AI execution inside `propose()` or create
an untracked retrying caller. Retain model/input/prompt/response separately from
human authorization. No live model/private-corpus call or rule adoption occurred.

UI initiation, real-source coding acceptance, complete web/PDF acceptance,
commit/CI/release and Fedora deployment remain open. No completion count raised.
