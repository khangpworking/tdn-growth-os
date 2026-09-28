# Research A21: exact-version section readiness API and UI

## Objective

Show the current delivery condition of every section in one explicitly selected
report version without implying that catalog metadata is executable analysis.

## Required behavior

- Read one exact immutable report version through the existing verified reader.
- Project all embedded catalog definitions in catalog order and join each one to
  its exact packet delivery state, claim IDs, context pointers and blockers.
- Return the report, semantic-version, packet and catalog identities needed to
  detect drift or cross-version mixing.
- Reject missing, corrupt, duplicate or membership-mismatched packet data.
- Render a truthful matrix for the current 30-section catalog with separate
  Market and Insight filters.
- Distinguish partial deterministic output, method-only planning, missing
  prerequisites, required human input and not-implemented methods.
- Expose required inputs, current blockers, catalog fallback, claim IDs,
  evidence pointers, reopen conditions and section digests on demand.
- Preserve loading, connection and integrity-error states without demo fallback.

## Evidence boundary

The readiness matrix is a view of a replayed report packet. It does not add a
method, calculate a new result, authenticate a source, call a model or approve
content. In the current implementation M02, M03, M04 and M13 can be partial;
only M03 and M04 carry deterministic claim IDs when eligible observations exist.

## UI direction

Mode is Operate. The screen follows the approved navy, blue-grey, white and teal
TDN visual system at ENERGY 1, RHYTHM 2 and MOTION 1. The focal point is the
readiness distribution and the actionable reason each section cannot proceed.
Compact filters and native disclosure controls reduce cognitive load; state is
always written as text and never conveyed by color alone.

## Explicit exclusions

- No new business method, chart, claim or interpretation.
- No AI/provider call, human decision, approval, reviewer or publication action.
- No implicit latest report or interpretation selection.
- No write API, migration, scheduled job, data import or deployment.
- No attempt to make all 30 sections appear complete.

## Verification ownership

The existing HTTP integration test owns exact replay, catalog membership,
30-section projection and corruption failure. The frontend data-source test owns
the closed response contract and order rejection. One mounted component test
owns visible state, filtering and evidence-pointer disclosure. These cover
different transport, trust-boundary and UI risks rather than repeating the same
implementation detail.
