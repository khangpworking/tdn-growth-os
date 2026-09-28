# Research A15: exact-version interpretation dashboard

## Objective

Let the local operator inspect retained A13 interpretation overlays from the
existing report-version workspace without confusing AI text with source
evidence, deterministic results or human approval.

## Required behavior

- Start only after the operator explicitly selects one report series and one
  report version.
- Fetch the A14 interpretation index only under that exact report/version.
- Require an explicit interpretation selection; never infer “latest”.
- Verify each index entry names the selected semantic version and verify the
  selected detail against its index summary before rendering it.
- Show conclusion, evidence logic, resolved citations and pointers,
  assumptions, item limitations and run-wide limitations.
- Show safe provider/model and prompt ID/version provenance without exposing
  prompt material, provider request identifiers, tokens, latency or artifact
  paths.
- State visibly that every interpretation remains unapproved layer-three
  material and is not source evidence or a human decision.
- Provide truthful loading, empty, connection and integrity states with a
  bounded retry.
- Preserve responsive and keyboard-usable behavior in the established TDN
  operator surface.

## Explicit exclusions

- No approve, reject, select-as-official or regenerate action.
- No OWNER write endpoint, model/provider call or automatic interpretation.
- No report, interpretation, source or decision mutation.
- No migration, domain rule, deployment or live-data change.
- No synthetic interpretation shown in real mode.

## UX direction

This is an **Operate** surface for an OWNER answering three questions: what did
AI conclude, which exact claims support it, and what limits remain. It inherits
the TDN navy/blue-grey/white visual language at ENERGY 1, RHYTHM 2 and MOTION 1.
The conclusion and unapproved status lead; technical digests remain available
in a secondary disclosure rather than dominating the reading path.

## Verification ownership

The existing mounted report-panel test owns the frontend lifecycle: explicit
report version, exact-version interpretation fetch, no implicit interpretation
selection, detail selection and evidence/limitation rendering. A14 continues to
own HTTP projection and integrity errors; A13 continues to own persistence and
replay. No duplicate backend or domain tests are added.
