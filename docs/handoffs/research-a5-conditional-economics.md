# Research A5: conditional P3 arithmetic

Draft PR #61. Base: A4 head `8a5423bdb806ba0c304e3dec77edf7660a555023`.
This draft carries unmerged research dependencies; their review/merge authority
is not bypassed. No production deployment or real-seller calculation occurred.

## Delivered

- Closed AJV-validated scenario contracts and generated TypeScript types.
- Exact reduced bigint rational contribution, Pmin, Cmax and Mmax arithmetic.
- Requested outputs only; each missing non-solved input makes that output
  unavailable, never a fabricated zero. Cmax does not require C; Mmax does not
  require M; Pmin does not require an existing P.
- Explicit fixed fee bases and category declarations, positive integer units
  per order, nonnegative costs/prices and a strictly positive fee denominator.
  Individual fee bindings must agree with the fixed model; mixed/unknown bases
  fail with `FEE_BASE_MISMATCH` instead of silently using the model-wide base.
- Negative contribution/thresholds are preserved with warnings.
- Exact rational values remain authoritative; display uses versioned half-even
  two-decimal VND rounding, with upward integer rounding for Pmin.
- Available Cmax/Mmax carry the mandatory one-at-a-time warning. They cannot
  be jointly maximized, and none of the results is an optimal-price claim.
- Declared source/owner/scenario provenance, modeled/excluded terms, stable
  input digest and exact replay guard. Source authenticity is not established.
- `research:economics:calculate` publishes exact raw input, canonical input,
  result and digest manifest to a private outside-Git directory. It does not
  open SQLite, migrate, call AI/provider services or create a business record.
- Exact output retry preserves bytes and modification times; changed output
  conflicts without overwrite. Existing private publisher owns file safety.

## Verification

No Windows tests, typechecks or builds. Canonical schema code generation was
performed locally; verification is Linux-only.

Linux Check [36378795592](https://github.com/khangpworking/tdn-growth-os/actions/runs/36378795592)
at `25f8f4cedb22ce2b219a96d3692bab86233f5981` passed: backend 471/471,
frontend 125/125, generated contracts, strict types and frontend build.
The subsequent final head adds the one-at-a-time output warning, per-fee base
validation and a focused half-even/large-integer table. Its final CI and independent-review disposition
are recorded on PR #61; earlier green evidence does not certify later changes.

The inherited preview helper's Chrome startup wait was made explicitly bounded
at 30 seconds and now requires a valid published debugger port. A CI runner
previously exceeded the 10-second startup budget before reaching any report
assertion. No interaction, contrast or output assertion was weakened.

The pure unit boundary owns arithmetic and missing-input gates. One actual-CLI
integration test owns input/output wiring, replay, immutable publication and
Linux permissions. No browser, load, stress or provider test was added for P3.

## Limits and next step

All results remain SCENARIO, UNREVIEWED and DECLARED_UNVERIFIED. Declared fee
categories are not authenticated against seller rules; missing applicability,
caps, refunds, taxes, discounts, shipping, inventory and demand are not modeled
as real zero. A scenario zero is separately explicit. No real-profit forecast,
recommendation, approved report, comparison group or causal claim is created.

P4 per-quote tablet normalization is a separate bounded follow-up. SQLite
report persistence, dashboard wiring, narrative semantic review and owner
approval remain separate integration/policy gates. No migrations, dependencies,
existing domain contracts, real data or runtime state were changed by A5.
