# Research A6: bounded tablet quote normalization

## Scope and authority

This task implements only the retained M08/P4 packaging arithmetic from
`Comparable_Prices_v13_2026-09-21.json`, `Ma_tran_30_section_v18_2026-09-22.md`,
and the A5 P4 handoff. It accepts one quote at a time and returns a descriptive
`SCENARIO` result. It does not create evidence, call a provider, infer a
product identity, compare quotes, or make a business recommendation.

Base: A5 draft head `649abfb172c6e29d3ffa783cce1416241cb64fd4`. The retained
private `Comparable_Prices_v13_2026-09-21.json` method reference has SHA-256
`b3846f47ae027a8b7382857c16efa179bb7dab8d428e45aa9b4082f096c50b74`.
The reference is not published or run as commercial evidence by this task.

The pure boundary preserves the source locator, quote title, original pack
text, listed-versus-checkout price state, observation time/period, source role,
identity tier, and explicit variant/GTIN/version flags. `SOURCE_DECLARED`,
`OWNER_DECLARED`, and `SCENARIO_ASSUMPTION` are declarations only; the output
remains `DECLARED_UNVERIFIED`, `UNREVIEWED`, and `NOT_AUTHENTICATED`.

## Input contract

- `priceVnd` is a bounded non-negative decimal string with at most 40
  integer digits and 6 fractional digits. Currency is fixed to `VND`.
- `packCount` is nullable. When supplied it is a positive integer string with
  an explicit `OPERATOR_DECLARED` marker, `unit: TABLET` and owner/operator provenance. It is
  never parsed from `entityTitle` or `packText`.
- `sourceRef` requires an exact artifact SHA-256 and locator.
- `priceState` is retained as `DISPLAYED_LISTED` or `CHECKOUT_FINAL`; these
  states are never mixed or silently converted.
- Observation time is explicit: `KNOWN` requires an observed timestamp or
  period; `UNKNOWN` requires both to remain null. A retained period is declared
  text only; it is not provider verification or a compatible interval for
  comparison.
- Identity metadata is carried as declarations (`identityTier`,
  `variantStatus`, `gtinStatus`, `versionStatus`) and is never upgraded by the
  normalizer.

## Deterministic outputs

When `priceVnd` is valid, `pricePerPack` is available with the exact price
rational. When both price and an explicit positive count are available,
`pricePerTabletArithmetic = priceVnd / packCount` is emitted as a reduced
integer rational. Missing price or count produces `UNAVAILABLE` with named
missing inputs and null exact/display values; missing count is never treated as
zero and never inferred from title text.

Display values are separate half-even two-decimal VND strings. The exact
rational remains authoritative. Independent fixtures cover `240000 / 30 =
8000` and `100005 / 40 = 20001/8`, displayed as `2500.12`.

Every result retains the canonical input hash and states `SCENARIO`,
`UNREVIEWED`, `DECLARED_UNVERIFIED`, and `NOT_AUTHENTICATED`. Limitations
explicitly state that the count is operator-declared and not parsed or
verified, that an observation period is not verified or compared, and that the
arithmetic is packaging-denominator only.

## Hard boundaries and owner gaps

The normalizer rejects negative prices, zero/non-positive counts, unknown
observation time with values, known observation time with no value, and
non-operator count declarations. It contains no GTIN/variant inference, equal
dose/equal efficacy logic, min/max/range, price gap, category ladder, grouping,
ranking, winner, WTP, margin, cost, conversion, forecast, or recommendation.

Wider comparison requires an owner-selected basis (pack price, arithmetic
price per tablet, serving, active ingredient/equivalent dose, or landed price)
and an exact identity rule. Those decisions are deliberately outside this
slice. No new policy or framework is required for the single-quote arithmetic.

## Test-audit boundary

The unit suite owns this pure contract because existing tests do not cover
explicit pack-count gates, listed/final price-state preservation, exact
packaging rational arithmetic, or no-inference behavior. Expected values are
hand-calculated synthetic examples. The suite calls the production normalizer
directly and requires no test-only production seam.

No Windows tests, typechecks, builds, commits, provider calls, database writes,
or UI work are part of the delegated calculation subtask. Main-agent delivery
uses normal Git commits/pushes and Linux CI only; no merge/deployment is implied.

## Offline caller

`npm run research:quote:normalize -- <quote.json> <outside-git-bundle-directory>`

One bounded JSON input becomes exact raw input, canonical JSON input, replayable
result and a digest manifest. The command reuses the existing private publisher
(0700 directory, 0600 files on Linux; exact retry, no conflicting overwrite).
It opens no database and invokes no provider, AI or parser. One CLI test owns
byte wiring and manifest/replay; the existing publisher tests own file safety.

Canonical identity preserves decimal declarations: `1.0` and `1` have identical
arithmetic but different input hashes. The result never claims those lexical
forms are different economic observations. Other pack units, such as capsules,
sachets or ampoules, are outside this explicitly tablet-only contract rather
than silently labelled as tablets.
