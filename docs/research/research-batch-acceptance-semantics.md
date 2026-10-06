# Research batch acceptance: bounded business review

Date: 2026-10-03. Applies to P3.2a/P4.3a of execution plan v2.3.
Authority: the **Review marketing framework files** session reviewed this delta
and returned **AMEND, conditional semantic acceptance**. This is not code
approval, adoption of a new industry codebook, real OWNER acceptance, or a
change to the 30 approved methods.

## Required distinctions

- Scope approval chooses what to research. Rule/codebook adoption defines the
  classification. Row-disposition acceptance accepts specific assignments.
  None of these substitutes for the other two.
- UNKNOWN is a label value. PENDING and ACCEPTED describe a decision state.
  Accepted UNKNOWN remains outside WIDE. Missing, stale or unreviewed labels
  cannot be relabelled UNKNOWN to pass coverage.

## Confirmation and persistence

Selection binds exact immutable proposal IDs and content, input/source/corpus
revision, scope and rulebook revision. Proposals preserve the label/code, group,
quote/span, attribution and relevant relation. Editing creates a new proposal
revision. Screen filters never implicitly select records; confirmation includes
selected proposals hidden by the current filter. Unselected proposals stay
pending rather than becoming rejected or evidence of absence.

Receipt records the exact subset, authenticated actor, time and confirmed
revisions. A stale/conflicting selection rejects the whole batch, not a silent
partial write. Exact retry returns the stored receipt and time, even after newer
proposals appear; it never carries acceptance into the new revision. Cumulative
batches on one revision do not double-count assignments. Mutually exclusive
assignments cannot both be accepted; Insight multi-code follows its codebook.

## Calculation boundaries

MetricSourceLabels stays closed and unchanged. Any receipt/evidence envelope
stands beside and binds the exact sidecar. Classified calculation opens only
when the entire chosen universe has valid frozen dispositions, including
accepted UNKNOWN; selecting a subset never shrinks that universe silently.

Insight may publish accepted quotes/coding as partial output. Pending remains
visible in coverage; final ratios still use the existing completeness gates.
OWNER acceptance does not turn self-report into measured behavior, DECLARED
into FACT, or association into causality.

## Required generic proof

For each of the three cases: a source-bound proposal, explicit OWNER selection,
accepted receipt, and an output resolving the same source and limits. Synthetic
titles for standalone jelly, thermos and handheld fan products may exercise
membership proposals; synthetic quotes saying the author bought/tried/used the
product may exercise declared action. These are technical fixtures, not approved
real labels or new industry rulebooks.

Counterexamples: partial selection, accepted UNKNOWN excluded from WIDE,
unselected pending, changed/stale revision rejected, retry without duplicates.
Scope decisions and codebook `0.1.0-proposal` remain unresolved where previously
unresolved. The earlier `metric-membership-evidence-v1` envelope is not adopted
merely by this review. Ask for new business boundaries only when actually absent.
