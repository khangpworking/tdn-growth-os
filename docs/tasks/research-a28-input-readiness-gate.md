# Research A28: exact-input readiness gate

## Objective

Extend the exact-version 30-section readiness view with a deterministic check
for every catalog input required by each section. The check explains whether an
input is present, absent or present-but-invalid for the selected immutable
report version and points back to the exact packet, report artifact or report
record that supports a positive result.

This task adds no business section. Executable deterministic coverage remains
7/30: M02, M03, M04, M08/P4, M13, I03 and I17.

## Business boundary

The existing calcium package does not support another section without a new
owner decision or new section-specific evidence. In particular it does not
establish demand, supply, competitor comparability, linked drivers, consumer
behaviour, representativeness, margin, forecast or recommendation.

The gate may expose only:

- the exact catalog input identifier;
- `PRESENT`, `ABSENT` or `INVALID`;
- whether absence is blocking or the input is explicitly optional;
- fixed diagnostic codes;
- exact evidence references and digests for positive or invalid results.

Zero remains an observed zero, not missing or no demand. Missing remains
unavailable. UNKNOWN remains UNKNOWN and is never mapped to OUTSIDE.
ALL/WIDE/CORE remain overlapping and non-additive.

## Evaluation profile

The first profile is closed and versioned. It recognizes only the 30 input IDs
already present in catalog 0.6.0 and derives their state from the verified
report record and packet:

- source package, selected-source, normalized-input, receipt and metric-result
  identities;
- exact scope, label-source and deterministic claim membership;
- exact M02, M08/P4, M13, I03 and I17 method artifacts;
- explicit absence of owner questions/review, domain evidence, consumer cases,
  comparable groups, daily series, holdouts, outcomes and measurement designs.

An unknown future input ID fails closed rather than being treated as absent.
Artifact or digest disagreement is `INVALID`; it is never repaired or ignored.

## API and UI

The existing exact-version readiness endpoint remains the only route. Each
section entry gains catalog-ordered `inputChecks`. The frontend labels every
check with its state, uses plain Vietnamese guidance, and retains all A21
loading, integrity, filtering and progressive-disclosure behaviour.

No latest-version lookup, write API, migration, provider/AI call, owner action,
source import or report approval is added.

## Verification ownership

- One unit test owns the closed profile, exact evidence references, optional
  input semantics and fail-closed unknown input behaviour.
- The existing report API integration test owns exact-version projection and
  the closed response contract with the new checks.
- One mounted frontend test owns visible status/guidance and filtering. It does
  not duplicate the profile calculation.

Linux CI and the report preview are the release gates. No Windows test, build
or typecheck is release evidence.
