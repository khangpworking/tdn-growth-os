# Research A37: M03 section-artifact retention ledger

A37 retains one exact A36 M03 section artifact as immutable, replayable
application state, keyed by its own `artifactSha256`, together with
deterministic membership for the exact six artifacts required to replay it:
the A32 verified metric set, A33 chart bundle, A34 narrative evidence
envelope, A35 factual narrative, A36 section-artifact receipt, and A36
rendered HTML.

Before any durable registration, every JSON contract is parsed and verified,
exact canonical identities/digests are checked, the existing A32-A35
verifiers and the A36 renderer are called with the exact declared
dependencies to replay the full chain, and the HTML SHA-256/byte size and
exact rendered bytes are compared. The retained row binds section `M03`,
the fixed renderer profile, `preparationSha256`, `metricSetSha256`,
`chartBundleSha256`, `envelopeSha256`, `narrativeSha256`, the A36
`artifactSha256`, and the HTML identity. Exact retries of identical
bytes/identity are mutation-free and return the same identity; reuse of the
identity with any changed bytes or metadata fails closed, and a failed or
losing write leaves no finalized row, member, active manifest, or orphan
canonical artifact owned by that request. Membership is immutable after
finalization.

This is a deterministic layer-two retention step, not report assembly: it
does not create a report version, interpretation, review target, human
approval, PDF, UI/API, or deployment. It exists so a future A38
report-version assembler can consume the exact retained section artifact
without regenerating calculations or prose.
