# Advanced analysis configuration profile v1

Status: proposed configurations for review. This file separates useful descriptive records from forecast, inferential, causal and effectiveness claims. It does not authorize any analysis, define owner thresholds or require new data collection.

## D05: M10 forecast eligibility and diagnostic baseline

M10 has four separate states:

| Subscope | Profile state | Meaning |
|---|---|---|
| Eligibility gate | `DRAFTED_GATE` | Checks whether the supplied daily series and policies are structurally complete. It may return eligible/ineligible plus blockers, not predictions. |
| Parameterized evaluation | `DRAFTED_TEMPLATE` | Can run only after a complete, versioned model/split/error policy is supplied and accepted. |
| Last-observed constant baseline | `PROPOSED_UNAPPROVED_DIAGNOSTIC` | Concrete comparator proposal for review. It is not a selected default, approved forecast or business recommendation. |
| Production forecast | `INCOMPLETE_FORECAST_BLOCKED` | No owner-approved model, history minimum, real horizon, gap policy, selection rule, error policy or decision threshold exists. |

### Gate inputs and checks

Every series row needs an existing source locator, `date`, timezone, `metric`, unit, value state (`observed_value`, `observed_zero`, `missing`, `UNKNOWN`) and value/null consistent with that state. The run must freeze the exact entity universe, date range, daily boundary, metric meaning, aggregation rule, train/validation/holdout boundaries, horizon, split order, gap policy, model/baseline version, error metric and any model selection rule. A stable `internalSeriesKey` may be derived from this frozen definition and the exact source row locators/digests; it is an artifact key, not a provider/entity ID or cross-source identity. Those values are not filled from an example.

Reject duplicate series/date rows. Partition incompatible series by metric, unit, timezone, daily boundary, universe and observation frame. Require train dates to precede validation and holdout dates; ranges cannot overlap. Apply the declared gap policy to every declared split, including validation when present. Missing calendar days are not zero. If a required policy is unset, produce an eligibility report and `BLOCKED`, not a fitted or forecast series. No minimum history or horizon threshold is supplied by this profile.

### Proposed last-observed-value diagnostic

This candidate is deliberately simple enough to implement and audit. It has no tuning step and is not a production default. Before inspecting holdout outcomes, the run must pin one compatible daily series; explicit timezone and entity universe; train end `T`; nonoverlapping holdout dates `H` after `T`; and the candidate's gap rule. The proposed candidate gap rule is `REJECT_ANY_MISSING_OR_UNKNOWN_DAY_IN_TRAIN_OR_HOLDOUT`; a later owner-approved policy may replace it in a new version. Require an observed value on `T` and observed actuals for each date in `H`. This structural requirement does not set a real-world minimum-history or horizon threshold.

This candidate uses train and holdout only; it performs no validation-based
selection. If a later model profile supplies a validation split, validate its
gap policy and temporal order too. It must not reuse the holdout to choose a
model and then present the same holdout score as independent evaluation.

For the single-series candidate:

```text
anchor = y[T]
for each h in H: prediction[h] = anchor
error[h] = abs(prediction[h] - actual[h])
MAE = sum(error[h]) / count(H)  # exact fraction in original unit
```

Empty holdout, missing anchor or a gap under the candidate rule produces no score. Keep each prediction, actual, error, input locator, split and candidate revision. Do not round or turn MAE into a pass/fail threshold, accuracy percentage, confidence interval or model endorsement. No cross-series pooling is proposed.

Synthetic arithmetic fixture: `y[T]=10`; two explicit holdout actuals are 12 and 8. The candidate predicts 10 and 10, errors are 2 and 2, and exact `MAE=4/2=2 source units`. Two dates are fixture arithmetic, not an approved horizon or history rule. It was not run on real data.

Owner choices before real evaluation: whether to activate this diagnostic, or select another model; intended target/horizon; minimum compatible history; daily timezone/boundary; missing-day policy; split policy; candidate selection/error measure; and any decision threshold. Per-run inputs include exact series digest, universe, dates, periods, split boundaries, metric/unit and declared gap states. Forecast and owner-authored scenarios remain separate outputs.

Allowed now: eligibility/blocker output and, only after approval, a clearly labeled baseline evaluation over an exact compatible holdout. Forbidden: a production forecast, sales prediction, model endorsement, accuracy claim based on training data, assumed seasonality, imputation, causal claim or business threshold. No new survey, interview, recruitment, simulated respondent or experiment is part of M10.

## D08: I11 owner-defined group records

The safe v1 operation inventories groups and compatible observed values without inferring group membership. Required run fields are a frozen owner-defined `groupPolicyRef`; source-issued group assignment or exact assignment evidence; group overlap/exhaustiveness declaration; outcome definition; numerator and denominator with unit, period, timezone, universe, frame and locators; and any sparse-cell/output policy. If a record has no source-supported assignment, its group is `UNKNOWN`, not guessed from prose by AI.

First output: one cell per declared group and exact measure partition, showing available source values, missing/zero/UNKNOWN state, assignment coverage and denominator. Counts must name their unit: record, source aggregate, or source-issued person/entity. Internal `EvidenceRecordRef` counts are records/spans, not people. Keep group cells separate if definitions, period, measure, sampling frame or denominator differ. Overlapping groups are not a partition and must not be added.

An optional descriptive rate is `r_g = numerator_g / denominator_g` only for explicit nonzero denominators with the same measure, unit, period, universe, inclusion rule and count unit. The run names that unit as `LOCATED_RECORD`, `SOURCE_AGGREGATE`, or an actual source-identified entity; raw event counts cannot be presented as a distinct-record/entity rate. An optional absolute difference is `r_A - r_B`; retain exact fractions. These computations require a declared comparison request and do not confer statistical meaning. No population inference, causal effect, ranking, uncertainty estimate or segment priority is enabled. No sparse-cell cutoff is invented: without a reviewed release/suppression rule, exact cells remain internal descriptive material and any decision/publication claim is blocked.

Synthetic fixture: two owner-defined groups provide compatible, source-supplied aggregate values, A=4/10 and B=3/10. If a descriptive rate comparison is explicitly enabled, the output is `r_A=0.40`, `r_B=0.30`, `r_A-r_B=0.10`; it is not a significance result or evidence that group membership caused a difference. If either denominator or group assignment is missing, preserve raw cells and return no rate/difference.

Owner choices: group taxonomy/assignment, whether groups overlap, release/suppression policy, whether descriptive rates are useful, and any separate inferential method. Per-run inputs: actual group assignments, measures, denominator, scope and exact sources. Allowed: counts/rates for the declared source-defined groups under compatible inputs. Forbidden: inferred personas, people/cohort counts without real identity, demographic generalization, causal group effects, segment ranking or population claims from a review sample.

## D09: I12 touchpoint, exposure and outcome separation

Store three distinct record types: `PRESENCE` (a touchpoint/channel/content is mentioned or listed), `EXPOSURE` (a source records delivery to an eligible unit), and `OUTCOME` (a separately measured result). Presence does not imply exposure. Exposure does not imply outcome. Do not substitute clicks for purchase, page availability for views, or outcomes for eligible exposure.

An inventory needs exact source locators, source-stated touchpoint/content label, date and provenance. The only candidate ratio in this profile is a distinct-unit subset rate. It requires an exact unit key or a source-provided aggregate of unique eligible exposed units, compatible period/timezone and window, and a reviewed link/dedup rule:

```text
observedOutcomeRate = distinctEligibleExposedUnitsWithAtLeastOneLinkedOutcome / distinctEligibleExposedUnits
```

The subset numerator cannot exceed its compatible denominator; a violation rejects the ratio and surfaces a conflict. Multiple outcomes for one unit count once only under a real stable key or source-provided distinct-unit aggregate. Do not divide raw outcome events by exposure events and call it conversion: those event counts can have different units and the ratio may exceed one. Zero or missing denominator yields null; incomplete outcomes remain visible. Without a stable compatible link, display exposure and outcome records in separate partitions and emit no rate. No person-level join may be inferred from manual locators. Even an observed unit rate does not show channel effectiveness, credit allocation, ROI or causality. Causal/effectiveness claims require a separately reviewed existing design/result; I16 is optional context, not a mandatory dependency for the safe touchpoint inventory.

Toy fixture: a retained source reports 100 distinct eligible exposed units, of which 5 have at least one linked outcome in the same window. If the owner approves the descriptive rate definition, output `5/100=5% of eligible exposed units with a linked outcome`. If the source instead has 100 exposure events and 5 outcome events without unit-level dedup/linkage, output separate event counts and no ratio. If it claims 105 distinct units with outcomes out of 100 eligible exposed units, reject the subset rate and surface the conflict.

Owner choices: any channel taxonomy, outcome/eligible-unit definition, attribution window, event dedup rule, and whether a descriptive rate may be shown. Per-run inputs: source presence/exposure/outcome records, actual unit/window/key, source digests and missingness. Allowed: attributed presence, logged exposure, separately measured outcomes and approved compatible descriptive ratio. Forbidden: effectiveness, channel rank, causal attribution, ROI, conversion or person linkage without explicit compatible evidence and authority.

## D10: I16 existing-result or design-only mode

Choose one input mode, never infer one from the other:

| Mode | Required input | Deterministic output |
|---|---|---|
| `DESIGN_ONLY` | Owner question; outcome and unit; comparator; assignment concept; exposure/instrumentation; observation window; exclusions; planned analysis and uncertainty fields, each exact or `UNSET` | `METHOD_ONLY`, `NOT_EXECUTED`, result fields null, exact gaps listed. It requests no execution or new collection. |
| `EXISTING_RESULT` | Exact existing protocol and result data; assignment unit/mechanism; treatment and comparator; eligible/exposure instrumentation; outcome/unit/window; exact source locators; exclusions/attrition; predeclared estimator, missing-data rule and uncertainty method | A replayable calculation only if every protocol/data match and the named estimator is approved; otherwise an eligibility record with no estimate. |

No default estimator, success threshold, recruitment plan, experiment execution or simulated responses. A numeric estimate must use only the retained predeclared method. For example, a binary risk difference may be calculated as `treatment successes / assigned treatment units - comparator successes / assigned comparator units`, but only when that exact estimand and denominators are in the reviewed protocol. The formula is not a default. Missing outcome is not failure/zero. Observational exposure is not a causal treatment assignment.

Synthetic fixture: a design-only document names an outcome and comparator but has no execution data; output remains `METHOD_ONLY/NOT_EXECUTED` with null estimate. An existing reviewed protocol with 4/10 and 3/10 under a predeclared binary risk-difference estimator yields `0.10` before uncertainty assessment; this fixture is arithmetic only. If a comparator or assignment method is missing, no lift/effect estimate is emitted.

Per-run inputs: exact protocol/data digests, assignment and unit, comparator, outcome and time window, exclusions, estimator, missingness and uncertainty. Owner decisions: whether an existing method/policy can support the claim and which existing review disposition is valid. I16 does not request new primary-customer collection. Allowed: method-only design metadata or a reviewed estimate under the exact existing approved protocol. Forbidden: claiming experiment/lift from design, inferring causal effect from observational exposure, choosing the estimator after seeing outcomes, or asking the owner to recruit/test participants.

## Authority and readiness

Sources: A40 `sections/M10.md`, `I11.md`, `I12.md`, `I16.md`, `common-rules.md`, and A40 task requirements for forecasts, groups, touchpoints and experiments. The M10 baseline arithmetic is a proposed submethod only; no model, operational horizon, minimum history, threshold, real input readiness or execution is approved. Existing I16 protocol/results, if any, must be supplied as run evidence. The coordinator relayed D05/D08-D10 recommendations in business session `01a0a8fd-02d2-7e71-ba4c-244930d054bd` on 2026-09-30. This packet has not frozen the review artifact digest; the recommendations are not owner approval. Pin actual profile and source revisions before implementation.
