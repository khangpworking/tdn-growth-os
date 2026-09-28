# Research A13: immutable report interpretation ledger

## Objective

Persist every application-validated A8 interpretation against one explicit A10
report ID and version. Repeated model runs over the same evidence may differ;
the ledger retains each run instead of presenting a regenerated answer as the
same result.

## Required behavior

- Replay the exact report version through `AnalysisReportVersionReader`; never
  select a latest version implicitly.
- Accept only canonical, schema-valid A8 interpretation artifact bytes.
- Rebuild the artifact from its safe user-visible content, exact report bundle,
  prompt text, generation configuration and telemetry before persistence and
  on every read.
- Store the exact prompt bytes as a content-addressed artifact. The A8 artifact
  keeps only its prompt digest and safe generation metadata.
- Assign a sequential interpretation number within the exact report version.
  Different run IDs may retain different or identical meaning.
- Exact retry of the same interpretation ID and bytes returns the same identity
  with zero database mutations. Reusing an ID with changed content fails closed.
- Keep rows and artifacts immutable. Missing, corrupt, noncanonical or
  lineage-mismatched content fails replay.
- Keep A10's original `interpretationState = NONE`: it means no interpretation
  was embedded when that base version was created. A13 is a later overlay.

## Four-layer boundary

A13 implements durable layer 3 only. Source evidence and deterministic results
remain authoritative. An interpretation remains unapproved and is not a source
fact, recommendation, business decision or permission to act. Hidden model
reasoning and raw provider responses are not retained.

## Explicit exclusions

- No live model/provider call, model routing, retry worker or prompt editor.
- No human review decision, approval, rejection or official-report selection.
- No change to source/calculation identities or A10 immutable rows.
- No API, UI, dashboard, HTML/PDF change or new section method.
- No live data import, provider collection or deployment.

## Verification ownership

- One integration test owns persistence, exact replay, multiple runs on the same
  evidence, exact retry, changed-identity rejection, immutability and corruption.
- A8 unit tests remain the single owner of language, citation and hypothesis
  validation. A13 does not duplicate them.
- One migration test owns v31 to v32 upgrade and idempotent rerun.
- Linux CI is the release gate. Windows tests, builds and typechecks are not run.

