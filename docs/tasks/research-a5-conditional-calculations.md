# Research A5: bounded conditional calculations

## Objective and boundary

This task records the smallest deterministic P3 slice currently being authored;
the P4 plan is retained for a later, separately scoped change:

- P3 is a pure conditional economics calculator using the retained
  `Economics_Conditional_v13` equations.
- P4 is pure normalization of one quote with an explicitly declared tablet
  pack count and price.

The P3 implementation is limited to the pure calculator, canonical input/output
schemas, generated contract types, a private offline CLI, and their owning test
boundaries. It does not
include a provider call, AI interpretation, database migration, UI,
cross-source comparison groups, approval, a seller profitability decision, an
optimal price, equal-dose normalization, or a new business method. Outputs stay
`SCENARIO` and are never promoted to FACT by the calculator.

Source, owner, and scenario declarations are input provenance labels only.
They are not independent authentication and do not become evidence claims.
Every output must retain its source/category bindings, assumptions, limits,
and unavailable states.

The branch starts from A4 draft head `8a5423bdb806ba0c304e3dec77edf7660a555023`.
It does not merge or deploy A4 or its unmerged prerequisites. No Windows tests,
typechecks or builds are allowed; verification runs in Linux CI.

## Offline caller

`npm run research:economics:calculate -- <scenario.json> <outside-git-bundle-directory>`

The command accepts one bounded JSON input, validates and calculates it without
opening a database or calling a provider, then publishes exact raw input,
canonical input, result and a digest manifest through the existing private
bundle publisher. Files are 0600 and the directory 0700 on Linux. An exact retry
reuses unchanged files; conflicting output is never overwritten. This manifest
binds declared scenario bytes, not authenticated source evidence. The pure unit
suite owns equations; one CLI integration test owns wiring, replay and private
publication without duplicating the arithmetic suite.

## Authority and retained method

The accepted arithmetic comes from:

- `TDN_A5_source_bound_narrative_P3_P4_handoff_2026-09-28.md`
- `TDN_A5a_consistency_addendum_2026-09-28.md`
- retained `Economics_Conditional_v13_2026-09-21` artifacts
- retained `Comparable_Prices_v13_2026-09-21` artifact

Private retained-method checksums (the original files are not published here):

- `Economics_Conditional_v13_2026-09-21.json`: `4ad9dc0f8c7b4590f367d14d596773bbb089f04641eca6247642652721bb1a87`.
- `TDN_A5_source_bound_narrative_P3_P4_handoff_2026-09-28.md`: `764568efc8b33649348938092183efe7b7fe233b0699b3be2c8462beaf7b8a9b`.
- `TDN_A5a_consistency_addendum_2026-09-28.md`: `00279e59f7d3e0559c237330e1eb78e6390d077346c4b3c3fa5ba9019608061e`.

These identify the method references inspected, not evidence of current seller
fees or verified commercial measurements. Their proposed narrative approval
state machine is not adopted by this arithmetic-only slice.

The retained P3 scenario defines:

```text
P = price per unit, VND/unit
C = COGS per unit, VND/unit
O = other variable cost per unit, VND/unit
M = shared marketing budget per unit, VND/unit
T = target contribution per unit, VND/unit
n = positive units per order
c = commission rate
t = transaction rate
F_order = processing fee per order
```

For the fixed simplifying scenario only, both percentage fees use the same
`n × P` base:

```text
contribution_per_unit = P × (1 - c - t) - C - O - M - F_order / n
Pmin = (C + O + M + T + F_order / n) / (1 - c - t)
Cmax = P × (1 - c - t) - O - M - T - F_order / n
Mmax = P × (1 - c - t) - C - O - T - F_order / n
```

`Pmin` is the smallest price satisfying the target inequality. `Cmax` and
`Mmax` are separate one-at-a-time limits. They must not be jointly maximized.
The general nonlinear form is not in this slice. Numerical solving is deferred
until fee bases, caps, refunds, discounts, promotions, and other terms are
explicitly modeled and versioned.

The retained source does not establish seller-specific tax, overhead, returns,
voucher, shipping subsidy, settlement, conversion, demand, or inventory
distributions. These remain explicit excluded or not-modeled inputs.

## P3 contract plan

### Input envelope

The pure function should receive one canonical scenario envelope, for example
`p3-conditional-economics-v1`. Each numeric input is a decimal rational, not a
JavaScript floating point number, and carries:

```text
value: canonical decimal or reduced rational
unit: VND_PER_UNIT | VND_PER_ORDER | RATE | COUNT
kind: SOURCE_DECLARED | OWNER_DECLARED | SCENARIO_ASSUMPTION
sourceRefs: exact artifact/locator/category binding, when applicable
status: PROVIDED | NOT_MODELED | UNCONFIRMED
```

Required scenario fields:

- `scenarioId`, `methodVersion`, `currency = VND`, `unitBasis`.
- `pricePerUnit` when calculating contribution, `Cmax`, or `Mmax`.
- `cogsPerUnit` when calculating contribution, `Pmin`, or `Mmax`.
- `otherVariableCostPerUnit` for every retained output.
- `sharedMarketingPerUnit` when calculating contribution, `Pmin`, or `Cmax`.
- `targetContributionPerUnit` for `Pmin`, `Cmax`, `Mmax`, and target comparison.
- `unitsPerOrder`, a positive integer, whenever `F_order / n` is used.
- `commissionRate` and `transactionRate`, each with an explicit base binding.
- `processingFeePerOrder`, with exact source/category binding or an explicit
  scenario assumption.
- `feeBasePolicy = N_TIMES_PRICE_PER_ORDER` for this first implementation.
- `categoryBinding`, including the declared category path, binding state, and
  source refs. A category match remains declared, not authenticated.

The fixed scenario may carry the retained `3,000 VND/order` processing fee and
the retained category-rate declarations, but it must state that the same
`n × P` base is a simplifying scenario assumption. It must not silently treat
the source's potentially different live fee bases as identical.

### Explicit excluded costs

Inputs outside the retained equation are represented separately, never as
implicit numeric zero:

```text
sellerBusinessTax
fixedOverhead
returnsRefunds
vouchersDiscounts
shippingSubsidy
settlementAdjustments
affiliateOrOtherFees
demandConversion
inventoryCapital
```

Each entry is either an explicitly declared scenario value, or
`NOT_MODELED` with a visible limitation. A declared scenario zero is different
from an unknown value and different from a term omitted by the method. No
output may default a missing or unknown cost/rate to zero.

### Per-output gates

The calculator returns an output object for every requested result. Each output
has `state = AVAILABLE | UNAVAILABLE`, an exact value only when available, a
`missingInputs[]` list, `heldFixed[]`, and output-specific limitations.

| Output | Required inputs | Solved value and boundary |
|---|---|---|
| `contributionPerUnit` | `P`, `C`, `O`, `M`, `n`, `F_order`, `c`, `t` | Exact contribution. `T` is optional unless reporting target comparison. |
| `Pmin` | `C`, `O`, `M`, `T`, `n`, `F_order`, `c`, `t` | Smallest price satisfying the target. `P` is not an input. |
| `Cmax` | `P`, `O`, `M`, `T`, `n`, `F_order`, `c`, `t` | Maximum COGS while all other inputs remain fixed. `C` is not an input. |
| `Mmax` | `P`, `C`, `O`, `T`, `n`, `F_order`, `c`, `t` | Maximum shared marketing while all other inputs remain fixed. `M` is not an input. |

If an input is absent for one output, that output is `UNAVAILABLE` and names
the missing input. For example, `Cmax` does not require an observed COGS value,
but `Mmax` does. A contribution result may be available while its target
comparison is unavailable when `T` is missing.

The denominator `1 - c - t` must be strictly positive. A rate with a different
base, an unbound category, or a missing fee basis rejects the fixed scenario
with a stable structural code. This first slice does not add a general fee
combiner or numerical solver.

### Exact arithmetic and display

Use a small internal rational value type backed by `bigint`:

- reduce numerator and denominator by greatest common divisor;
- keep signs canonical and denominator positive;
- never use binary floating point for arithmetic or identity;
- serialize exact results as canonical numerator/denominator or exact decimal
  strings;
- include `methodVersion`, `feeBasePolicy`, and `roundingVersion` in result
  identity.

The exact rational is authoritative. A separate display field is optional and
must state its deterministic rule. Use integer VND display for thresholds,
with `CEIL_INTEGER_VND` for `Pmin` so the displayed integer still satisfies
the minimum inequality. Other VND outputs may use a declared
`HALF_EVEN_DECIMAL_V1` display scale. Display rounding never replaces the
exact value.

No hidden zero is permitted. `UNAVAILABLE` has `value = null`, a non-empty
`missingInputs[]`, and no synthetic numeric display.

### Output identity and limitations

The output envelope should contain:

- `contractVersion`, `methodVersion`, `scenarioId`, and canonical input hash;
- all output states, exact values, display values, and rounding metadata;
- `inputProvenance[]` with SOURCE, OWNER, or SCENARIO kind;
- fee/category/source bindings;
- `modeledTerms[]` and `excludedTerms[]`;
- `heldFixed` for each threshold;
- `limitations[]`, including the conditional/scenario state;
- a stable rejection list for structural failures.

The result is a conditional contribution/threshold calculation. It is not
realized profit, seller economics, demand, conversion, willingness to pay,
forecast, optimal price, or a business recommendation.

## P4 contract plan (future): explicit tablet quote normalization

P4 is limited to one quote at a time. It does not form cross-source groups,
rank competitors, build a category ladder, or compare equal doses.

### Input

`normalizeExplicitTabletQuote` receives:

- `quoteId`;
- exact `sourceRef` and locator;
- quote title/entity and the original `packText`;
- explicit positive integer `packCount` in tablets;
- exact non-negative `priceVnd` and `currency = VND`;
- `priceState = DISPLAYED_LISTED | CHECKOUT_FINAL`;
- observed date/period when available;
- `identityTier`, variant/GTIN/version status, and source role.

The function validates the explicit pack count and preserves `packText`, but it
does not infer a count from ambiguous title prose. Missing or ambiguous pack
identity makes the per-tablet output `UNAVAILABLE`, not zero.

### Output

When exact price and currency are valid:

```text
pricePerPack = priceVnd
pricePerTabletArithmetic = priceVnd / packCount
```

`pricePerTabletArithmetic` is emitted only when `packCount > 0` is explicit.
The output retains the exact rational, an optional display value with explicit
rounding, the original pack text, identity tier, source/period state, and
limitations. Its evidence state remains declared/unverified and its output
state remains `SCENARIO`, not FACT.

P4 rejects or marks unavailable for:

- inferred or ambiguous pack count;
- missing source locator, price, or currency;
- mixing listed/displayed and checkout/final price states;
- equal-dose or equal-efficacy claims without active-ingredient and serving
  inputs;
- WTP, optimal-price, category-ladder, price-gap, winner, margin, cost, or
  conversion conclusions.

Equal-dose, equal-serving, landed-price, exact variant/GTIN grouping, and any
cross-source comparison require an owner-selected comparison basis and are
future work.

## Planned pure test layer

Use one focused unit suite owned by the P3 pure calculation boundary. This
follows the test-audit authoring gate:

- Observable contract: exact rational results, per-output gates, explicit
  unavailable states, fee-base compatibility, and quote normalization.
- Credible regressions: floating point drift, hidden zero defaults, solving the
  wrong variable, mixing fee bases, or interpreting an ambiguous pack count.
- Existing A1 tests do not cover P3 equations or quote input gates, so this
  is a distinct owner boundary.
- No production-only seam is needed. Tests call the pure functions directly.

Expected values must be hand-calculated in the test fixture, not produced by
the helper under test. Synthetic fixtures are not official evidence.

### Independent P3 examples

Use `P = 160000`, `C = 50000`, `O = 10000`, `M = 10000`, `T = 20000`,
`c = 31/200`, `t = 3/50`, `F_order = 3000`.

For `n = 1`, independently calculate:

```text
1 - c - t = 157/200
contribution = 52600 VND/unit
Pmin exact = 18600000/157 VND/unit, display 118472 VND/unit
Cmax = 82600 VND/unit
Mmax = 42600 VND/unit
```

For `n = 3`, independently calculate:

```text
F_order / n = 1000 VND/unit
contribution = 54600 VND/unit
Pmin exact = 18200000/157 VND/unit, display 115924 VND/unit
Cmax = 84600 VND/unit
Mmax = 44600 VND/unit
```

Also cover:

- missing `O` makes every affected output `UNAVAILABLE`, not zero;
- missing `C` blocks `contributionPerUnit`, `Pmin`, and `Mmax`, but does not
  block `Cmax`;
- missing `T` leaves contribution available but makes threshold outputs and
  target comparison unavailable;
- `c + t >= 1` is rejected or unavailable with a stable denominator code;
- commission base `n × P` plus transaction base `P` rejects the fixed scenario;
- `NOT_MODELED` tax/overhead/returns remain visible and are not numeric zero.

### Independent P4 examples

Use hand-selected synthetic quotes:

- `240000 VND`, explicit `30` tablets gives exact `8000 VND/tablet`;
- `100005 VND`, explicit `40` tablets gives exact `20001/8 VND/tablet` and
  a separately labelled half-even display value `2500.12` at two decimals;
- absent or ambiguous `packCount` leaves `pricePerPack` available when valid,
  but `pricePerTabletArithmetic` unavailable with the missing-input code;
- displayed/listed and checkout/final states remain distinct;
- title text alone cannot supply a pack count.

## Sequencing and deferred policy

The bounded P3 implementation order is now:

1. Add canonical P3 schemas and generated types.
2. Add pure rational arithmetic and P3 per-output gates.
3. Add the focused P3 unit suite with independent hand-worked expectations.
4. Leave P4 quote normalization, DB and UI wiring deferred until separately
   authorized and scoped.

Deferred without a new owner decision or evidence contract:

- nonlinear fee models and numerical solving;
- tax, overhead, returns, refunds, vouchers, shipping subsidy, settlement,
  demand, conversion, inventory, or bundle economics;
- optimal pricing, WTP, forecast, profitability, or recommendation language;
- equal-dose/equal-serving/equal-efficacy normalization;
- exact variant/GTIN/product-family matching;
- cross-source comparison groups and rankings;
- AI interpretation, human approval, dashboard, and database persistence.

The only policy gap required even for the bounded calculator is the execution
scope for a chosen scenario: whether the caller is allowed to use the retained
category-rate declarations and the fixed same-fee-base assumption. The
calculator can remain reusable without deciding seller applicability. No
broad new business framework is needed.

## Acceptance boundary

The P3 portion of this plan is complete when its pure implementation can prove,
through synthetic tests, exact arithmetic, output-specific missing-input
behavior, no hidden zero, fee-base compatibility, explicit display rounding,
requested-output omission, and conservative scenario boundaries. P4 pack
handling remains a later task. A passing calculator still produces `SCENARIO`
outputs only. It does not create a source-backed claim, business decision,
approval, or commercial readiness.
