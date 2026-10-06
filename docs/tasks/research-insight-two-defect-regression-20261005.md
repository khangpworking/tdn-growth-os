# Insight prompt: two-defect regression benchmark

Owner authorization: run steps 1 and 2 on 2026-10-05: benchmark the repaired
prompt and request independent semantic audit from **Review marketing framework
files**. No deployment, acceptance receipt or live business write is authorized.

## Frozen scope

- Original B1 records: 5, 6, 13, 19, 23.
- Original B4 records: 52, 54, 56, 59, 61.
- Keep exact retained input bytes, reference coding, rules, configuration and
  batch size. Only the two I02 prompt instructions differ from the old run.
- Model: configured `gpt-6.1-sol` through CLIProxy. Same model ID is not proof of
  an immutable provider backend.
- Maximum two sequential transport attempts, no retry. Prior budget consumed:
  5/8. This authorization ceiling: 7/8. Failure or ambiguous status stops the
  remaining batch; a started attempt is counted before transport.
- Scratch database/artifacts only. Results remain PENDING_AI.
- This is development data already used for tuning, not held-out human gold.
  Do not combine B2/B3 old-prompt results to claim full new-prompt coverage.

## Acceptance and audit

Business session confirmed no methodological blocker before dispatch.

- S01: R52 I02 retains the original explicitly stated task with source pointers;
  no invented actor, completion or blind copying from I04. Valid span alternatives
  need not match reference bytes.
- S02: R19 clipboard/UI boilerplate does not become customer context. Preserve
  raw source, locator and batch membership; no empty I02 container requirement.
- Controls: R23/R52 negation, R54 reported/disputed claim, R61 record-local
  ordering, qualifiers/UNKNOWN, and I10 membership versus occurrences.
- Structural VALID is not semantic PASS. Per-execution candidates are the unit
  of comparison, not an accumulated proposal mixing prompt versions.
- Allowed conclusions: FIXED_IN_THIS_RUN, NOT_FIXED, REGRESSED, NOT_EVALUABLE,
  NEEDS_BUSINESS_REVIEW. No accuracy/precision/recall claim.

## Pinned identities

New prompt artifact SHA-256:
`e7a1881bce8f969365f90d321b5e7115a9cb15d0a4d22d00f6c58cdd6b2209a2`
(28,216 bytes, canonical JSON plus LF, including embedded schemas).

B1 input:
`e2cd09f7dc409e6e4ef55db7751b6fdbd516ac404747010d754c98c02c13028f`

B4 input:
`e7c68aad77fbd36ec1260dd4f186fccf783a877352d717db1ce56edcb02ba8c6`

Configuration:
`a6000a32721f950535238a2480383482a10b2bcaf585fdb8933a801c1901a389`

Reference:
`342bbdfd1875a92f852b80ade4b955c61cbd22a59a9687e599c84e45e0a669df`

Rules:
`f43a78d8e67994d385f35a1253b69ad1dc77ec40c77251e156745c20161f5c5a`

## Checklist

- [x] Freeze business criteria before dispatch.
- [x] Isolated preparation and zero-network byte-identity preflight.
- [x] B1 one-attempt execution and structural/provenance gates.
- [x] B4 one-attempt execution if B1 gates pass.
- [x] Independent semantic audit bound to retained artifacts.
- [x] Final handoff with budget, timings, findings and limitations.

Private records, retained inputs/output and raw quotations stay outside Git.
No project test command runs on Windows. Billing is UNKNOWN unless supported by
provider billing evidence. No new Jev calls are required: the separate shadow
triage pilot does not decide semantic acceptance.
