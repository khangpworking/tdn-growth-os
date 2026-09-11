# Task 032 — combined B10 category-and-funding decision

Implemented on Fedora from required base `4f4641c78b1e8c8e4206fda70d359074f52cdce7`.

- One combined B10 decision covers category/portfolio approval and authorization to receive funding, with only `APPROVE`, `HOLD`, or `REJECT`.
- Corrections append immutable history and require the exact current decision ID; redundant states and stale corrections fail closed, while exact retries deduplicate.
- B10 reads only exact verified `LOCKED_STP` artifacts through `LockedStpReader`, freezes the exact lock digest and inherited lineage, and provides narrow historical/effective readers.
- No budget allocation, B11 implementation, direct Box 4 SQL/FK, category mutation, AI/Pi, provider/external action, UI/API, worker, scheduler, notification, deployment, or Windows backport.

Final SHA, checks, migration integrity/hash, synthetic acceptance, private read-only counts, CI, and structured PASS handoff are recorded on the draft PR.
