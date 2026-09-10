# Task 029 — owner-operated B8 four-gate decisions

Implemented on Fedora from required base `a79b2f762e5142fa154e36b7bd3c117d758ea91a`.

- Added closed B8 request and immutable decision artifact contracts for LEGAL, SCIENTIFIC, QUALITY, and FINANCE.
- Added OWNER/capability-first authorization, append-only sequential versions, exact retry/replay, immutable canonical artifacts, and product-workspace digest binding through `ProductWorkspaceReader` only.
- Added deterministic four-lane status; `readyForB9` is true only for four current PASS states.
- Added only migration `0017_product_b8_lane_decisions.sql`; migrations 0001–0016 remain unchanged.
- B8 remains button-only and stores no reason, rationale, notes, evidence, attachment, specialist/reviewer identity, or AI text.
- No product workspace mutation, B9 record/transition, task/action, provider call, real calcium decision, deployment, or Windows backport.

Final SHA, test counts, migration hash, CI, private readiness, and PASS handoff are recorded on the draft PR.
