# Research A36: deterministic M03 section artifact

A36 composes the exact A32 metric set, A33 chart bundle, A34 evidence
envelope and A35 factual narrative into a single self-contained Vietnamese
HTML "Quy mô và diễn biến" section. Every dependency is verified by its own
existing verifier with exact lineage before rendering; nothing is
recalculated or reinterpreted.

The renderer is a pure function of the four verified artifacts: identical
inputs and renderer profile always produce byte-identical HTML. ALL/WIDE/CORE
stay labeled as overlapping scope views, membership comparisons are labeled
sensitivity rather than growth, and missing values render as an explicit
"Chưa có số đủ điều kiện" marker instead of zero. The result is a closed,
versioned `M03SectionArtifact` receipt binding the renderer profile, the
exact upstream digests, and the rendered HTML's SHA-256 and byte size; its
verifier recomputes identity and can replay the full chain from exact
dependencies to detect tampering.

This is a deterministic composition/rendering step, not an AI generation
step: no interpretation, recommendation, or conclusion is added beyond what
A32-A35 already verified.
