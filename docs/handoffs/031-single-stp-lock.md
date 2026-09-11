# Task 031 — single STP working record and B9 lock

Implemented on Fedora from required base `13e6252d66aac624568db01875b5499b9b571bb8`.

- One mutable pre-lock STP working row per exact product workspace; identical saves deduplicate and changed saves update in place under the current canonical digest.
- Explicit segment order is preserved with closed validation of unique segment and target keys.
- OWNER-only B9 lock requires `governance:product-b9-lock`, exact current working digest, verified product workspace, and exact verified Task 030 clearance through declared readers.
- One canonical immutable `LOCKED_STP` freezes exact content and all required workspace, B7, clearance, actor, timestamp, and policy identity.
- No B10, approval/funding, scoring/ranking, AI/Pi, provider/external action, deployment, reopening, repositioning, rollback, multiple STP versions, or generic workflow engine.

Final SHA, checks, migration integrity/hash, synthetic acceptance, private read-only counts, CI, and structured PASS handoff are recorded on the draft PR.
