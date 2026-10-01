# Market configuration profile v1

Status: concrete v1 proposal for review, not owner-approved policy or runtime configuration. It defines safe descriptive operations for M05-M09 and an eligibility boundary for M10. The A40 recipes remain the section-method baseline; this profile resolves candidate parameter values without changing their authority.

## Configuration layers

Separate these fields on every run:

| Layer | Field | Rule |
|---|---|---|
| Method profile | `profileId`, `profileVersion`, `policyRevision` | Pin the exact profile bytes and any owner-approved overrides. A draft revision cannot activate itself. |
| Run scope | `question`, `sourceManifestDigest`, `period`, `timezone`, `universe`, `inclusionRule`, `exclusionRule` | Supply values from the selected source/run. Do not guess missing fields from a section title. |
| Observation | `measureIdOrLiteral`, `valueState`, `value`, `unit`, `aggregationUnit`, `memberOrWindowRefs`, `sourceRef`, `locator` | Preserve source meaning, exact unit and locator. Missing, observed zero and UNKNOWN remain distinct. |
| Human authority | `proxyMappings`, `peerSet`, `taxonomyOverrides`, `decisionPolicy` | Required only for the material interpretation named below. Store the approver, date and exact revision. Missing authority leaves safe inventory available and blocks only the affected comparison/interpretation. |

Periods and timezones must be compatible as declared; incompatible inputs remain separate. Before any sum, the run must identify the aggregation unit and show that member entities or time intervals are disjoint. Matching measure, unit and period alone do not prove additivity. A duplicated representation, subtotal plus total, or overlapping interval is not summed. Exact source precision is retained; no annualization, conversion or rounding is introduced by this profile.

Common record identity rules apply: collapse repeated references to the same digest and exact locator, or records with a real stable source key. Identical text at different locators remains distinct. Internal `EvidenceRecordRef` locators support source-record inventories and examples; they do not create product, listing, shop or person IDs. No fresh survey, interview, recruitment, experiment or simulated respondent data is in scope.

## D01: M05 demand-related evidence

**Proposed v1 output:** a partitioned inventory of literal source measures. A measure becomes a demand proxy only after a human approves a versioned mapping from that source measure to a stated interpretation. Sales, search activity, review counts, offers and co-occurrence remain named as observed, not relabeled as demand. No combined demand score exists in this profile.

Required run fields per observation: source digest and exact locator; literal measure name; source family; value state/value; unit and precision; observation period and timezone; entity/geography universe; inclusion/sampling frame; aggregation unit and membership/window refs. The method may display rows without a proxy approval. The method may calculate a subtotal only when `additive=true` is declared for the exact measure and the partition has compatible unit, period, timezone, universe, frame and inclusion rules, plus evidence of disjoint members/windows.

Proposed operation:

```text
partition by (measure, source family, unit, period, timezone, universe, frame, inclusion rule)
for each partition:
  retain every located observation and its missing/zero/UNKNOWN state
  if exact additivity and disjointness are established:
    subtotal = exact sum(observed values); completeness = all required members observed
  else:
    subtotal = null; retain rows; blocker = AGGREGATION_OVERLAP_UNRESOLVED or ADDITIVITY_UNDECLARED
  rate = numerator / explicit compatible denominator only when denominator > 0
```

Never turn a missing component into zero. An incomplete subtotal is labeled partial and is not a total. A zero or missing denominator returns no rate. The output is ordered by literal source measure, declared period, source digest and locator, not commercial priority.

Toy fixture: in one declared period, the same source reports the same literal search-count measure for two disjoint, source-keyed store partitions: 12 and 8. If the source establishes additivity and the same unit/frame applies, the subtotal is 20 search events, not “20 units of demand.” The example does not union providers or time periods. If a denominator is absent, no percentage is emitted. A transaction file with 20 sales and no approved proxy mapping remains “20 reported sales.”

Allowed claims name the source, measure, unit, scope and period. Forbidden claims include total or unmet demand, buyer count, market size, causal drivers, intent, or a composite score unless separate owner policy and evidence authorize the exact claim. Owner decisions: approve any proxy mapping and its eligible source family, scope and denominator interpretation. Per-run inputs: actual period, source values, frame, locators and disjointness evidence. Evidence blockers do not become new owner-policy questions.

## D02: M06 supply evidence

The proposed source-stated object labels are `OFFER`, `SOURCE_STATED_AVAILABILITY`, `IMPORT_ENTRY`, `MEASURED_QUANTITY`, `SOURCE_STATED_CAPACITY`, and `OTHER_LITERAL`. These are descriptive bins for review, not claims that an item is live, in stock, unique, deliverable or available. Until a reviewer accepts this code list, preserve source wording under `OTHER_LITERAL`.

Required fields: exact source locator; literal object/status; source-stated quantity and unit if present; period/timezone and date meaning; geography/variant; aggregation granularity and member/window refs; available source identity key; denominator, if a rate is requested. A `SOURCE_STATED_AVAILABILITY` label always retains attribution to the source. Do not infer freshness, active status or remaining stock.

Safe operations are (a) count located records with complete locator coverage, labeled `locatedRecordCount`; (b) show explicit missing/zero/positive source values separately; and (c) sum measured quantities only within a compatible unit, period, universe, definition and proven disjoint aggregation frame. Do not add offer counts, import entries, measured quantities and capacity. Do not convert units, infer unique sellers/products, or annualize. If external IDs are absent, emit records only, not entity counts. A rate requires an explicit compatible denominator; zero or missing denominator yields null.

Toy fixture: three located rows say “offer shown” but contain no stable offer ID, measured quantity or denominator. Output `locatedRecordCount=3`, `uniqueOfferCount=null`, no availability rate. Another source says 12 packs and a second says 4 kilograms; keep separate partitions and emit no total of 16.

Allowed claims: “These located rows report offers” or “the source states capacity of X [unit] during P.” Forbidden: total available supply, complete market capacity, unique item/vendor counts without real IDs, provider ranking, stale/current status without a time rule, or a supply share without a real denominator. Owner decision: accept/extend the descriptive object labels or approve a specific availability/freshness/denominator rule. Per-run inputs: source values, units, dates, exact record identity and any disjointness evidence.

## D03: M07 competitor comparison

Comparison is an owner-scoped, side-by-side table. Required owner declaration for a competitor comparison: `anchorRef`, ordered `peerRefs[]`, source-supported or owner-authored membership basis, scope and membership revision. If no peer set is supplied, return an unranked inventory of located candidate mentions. Do not promote search co-occurrence or AI suggestions into peer membership.

For every side-by-side row, retain literal entity label and actual source ID if present, variant/pack, measure definition, value state, unit, period/timezone, population/frame, locator and provenance. Compare only cells with the same measure, unit, period convention, universe, variant rule and inclusion policy. Otherwise show separate rows with `NOT_COMPARABLE`. Proposed optional difference, only after the owner enables that operation: `peerMinusAnchor = peerValue - anchorValue` in the original unit. It is not a score or preference. No ratio, normalization, weighting, rank or “best/worst” output is configured. A zero anchor does not support a ratio.

Display uses owner peer order when supplied; otherwise stable source locator order and explicit `UNRANKED` status. Duplicate-looking references are not entity-resolved by text. M08/P4 quote arithmetic stays within its approved one-quote scope and does not, by itself, authorize price comparison or per-unit normalization.

Toy fixture: an owner-supplied toy peer set has anchor 10 and peer 12 of the same named unit/measure/period. The table shows 10 and 12. If optional signed difference is separately enabled, it shows `+2 peer-minus-anchor`; it still assigns no rank. If peer set or variant comparability is missing, show an inventory and no comparison.

Allowed claims are limited to the declared peer set and common measured scope. Forbidden claims: competitor identity inferred from proximity, market rank/share, product equivalence without a reviewed rule, advantage, price leadership, or strategy. Owner decision: peer universe, anchor, membership and whether the optional signed difference has business meaning. Per-run inputs: exact peer refs, observations, periods, units and compatible source records.

## D04: M09 dated events and possible drivers

The v1 operation is a source-bound event/risk inventory, not impact analysis. Each row carries `statementType` from the proposed list `DOCUMENTED_EVENT`, `SOURCE_STATED_DIRECTION`, `CANDIDATE_DRIVER_HYPOTHESIS`, `COUNTEREVIDENCE`, `UNCLASSIFIED`; exact source wording; publication date and claimed event date as separate nullable fields; date basis; named entity/scope; affected metric if explicitly named; source locator; and conflict references.

Use `DOCUMENTED_EVENT` only when the source states an event and the locatable record supports the statement. `SOURCE_STATED_DIRECTION` records the direction attributed to the source, not a verified measured effect. A `CANDIDATE_DRIVER_HYPOTHESIS` is a layer-3 suggestion and must name both a mechanism and affected metric; its rationale and assumptions cite exact claims. If either is absent, retain an unclassified note. Preserve negation, hearsay/source attribution and contrary dates as separate linked claims. Do not infer entity linkage from similar names.

Stable display order is known event date, then source digest/locator; unknown dates remain at end with null. No probability, impact score, causal estimate, risk rank, trend window or combined driver index is produced. Quantitative comparison is outside this profile unless the metric, denominator, time window and an approved analysis are independently supplied.

Toy fixture: source A says an event occurred on date X; source B gives date Y. Output two dated source claims and a conflict link; output no causal effect. A note that says “this may raise measured cost through fee change” can be retained as a candidate hypothesis only if it links a documented fee claim and named cost metric. It is not a causal result.

Allowed: attributed dated statements, located support/counterevidence, and clearly marked unapproved hypothesis candidates. Forbidden: “the event caused growth/drop,” probability or impact scores, forecast, or market-wide driver claims from timing alone. Owner decision: approve any expanded event taxonomy, entity-link rules, metric/window and any future impact method. Per-run inputs: target scope, source dates and meanings, exact evidence links, and any supported metric/unit.

## Provenance and review status

Authority baseline: A40 `sections/M05.md` through `sections/M10.md`, `common-rules.md`, and the A40 plan’s evidence-family requirements. Existing code authority applies only to M08/P4 and other named bounded methods; it does not implement these M05-M07/M09 operations. The coordinator relayed business recommendations for D01-D04 in session `01a0a8fd-02d2-7e71-ba4c-244930d054bd` on 2026-09-30: literal measures; nonoverlap before aggregation; no proxy substitution or composite score; proposed supply labels; owner-declared peers; and no event causality/impact score. No stable review-artifact digest is frozen here, so these remain review recommendations, not an authority grant. Exact source file digests and relevant business-review revision must be recorded before a later implementation freezes this profile.
