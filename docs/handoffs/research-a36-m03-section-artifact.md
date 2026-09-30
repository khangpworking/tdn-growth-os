# Research A36 handoff: deterministic M03 section artifact

- Added closed request and section-artifact contracts.
- Verified exact A32/A33/A34/A35 dependencies via their own verifiers before rendering.
- Rendered a self-contained, CSP-locked Vietnamese HTML "Quy mô và diễn biến" section (no scripts, no external assets, no clock/random/local paths).
- Preserved missing-vs-zero, overlapping ALL/WIDE/CORE labeling, and sensitivity-not-growth framing across the metrics table, three A33 visuals, and A35 paragraphs.
- Bound renderer profile, exact dependency digests, and HTML SHA-256/byte size into a closed, replayable receipt.
- Added an outside-Git, no-overwrite, owner-only (0600) export CLI. Test design is under Codex ownership as two distinct focused owners — pure render/replay and CLI filesystem boundary — neither of which has been run yet; do not treat them as passing.

No model/provider call, insight/hypothesis, report version, approval,
migration, database write, dashboard UI, or deployment is included.
