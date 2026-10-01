# Research A36 handoff: deterministic M03 section artifact

- Added closed request and section-artifact contracts.
- Verified exact A32/A33/A34/A35 dependencies via their own verifiers before rendering.
- Rendered a self-contained, CSP-locked Vietnamese HTML "Quy mô và diễn biến" section (no scripts, no external assets, no clock/random/local paths).
- Preserved missing-vs-zero, overlapping ALL/WIDE/CORE labeling, and sensitivity-not-growth framing across the metrics table, three A33 visuals, and A35 paragraphs.
- Bound renderer profile, exact dependency digests, and HTML SHA-256/byte size into a closed, replayable receipt.
- Added an outside-Git, no-overwrite, owner-only (0600) export CLI. Test design is under Codex ownership as two distinct focused owners — pure render/replay and CLI filesystem boundary.

No model/provider call, insight/hypothesis, report version, approval,
migration, database write, dashboard UI, or deployment is included.

## Final Linux CI evidence

Implementation head `86dd803a49a6dafe444068b7f3851529349296f0` on
`feature/research-a36-m03-section-artifact` passed Linux CI:

- Check: https://github.com/khangpworking/tdn-growth-os/actions/runs/36700286536/job/109837856863
  — `npm run check` (contract generation, strict backend/frontend TypeScript,
  frontend production build) with 176/176 frontend tests (0 fail) and
  612/612 repository tests (0 fail).
- Research report preview: https://github.com/khangpworking/tdn-growth-os/actions/runs/36700286542/job/109837856168
  — synthetic preview build completed with no page error; visual evidence
  artifact uploaded.

Draft PR #98 remains open and in draft; this docs update does not mark it
ready or merge it.
