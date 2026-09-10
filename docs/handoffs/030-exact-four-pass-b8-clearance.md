# Task 030 — exact four-PASS B8 clearance

Implemented on Fedora from required base `01ca3331da1612b6ea2740465eaa582a50169c2b`.

- Closed request accepts only contract version, product workspace ID, and exactly four keyed decision IDs.
- Box 4 replays all four exact PASS decisions and checks current effective status through the two narrow Box 5 readers only.
- Immutable clearance freezes exact workspace/candidate/B7 lineage and deterministic LEGAL, SCIENTIFIC, QUALITY, FINANCE membership.
- Exact retries deduplicate; changed sets conflict; historical replay does not require decisions to remain latest.
- Added only migration 0018. No product-workspace/B8 mutation, B9 record, task, approval, provider, AI, external action, deployment, or Windows backport.

Final SHA, checks, migration hash, synthetic acceptance, private read-only readiness, and PASS handoff are recorded on the draft PR.
