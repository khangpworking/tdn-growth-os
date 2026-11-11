# Saved Shopee collection policy and execution identity

New runs save request-v2 with one immutable text-only policy (all, with-comments,
OR-selected stars; total1–2000/link; pooled or opt-in equal-stars). Existing
request-v1 history and partial PASS rules remain unchanged. Configured whole-flow
and direct M3 reserve one exact M2-bound custom plan/attempt under the shared run
lock. Explicit extra collections remain separate attempts. Incomplete reservations
block redispatch; exact reconciliation keeps the original identity.

`runs` and `run-info` expose the same execution view: active/uncertain work and
later failures override historical PASS, with receipt-verified current gates and
separate historical gates. Run-local monotonic execution records require no DB
migration or history backfill. Backend owns production/schema; Qoder owns UI,
bridge, tests and fixtures. Validation uses isolated synthetic data only; release
and any live collection require coordinator approval.
