# Common rules for section methods v1

Status: draft authoring convention, 2026-09-30. These rules bind this recipe set; they do not amend the runtime catalog, contracts, or owner-approved business policy.

## Reading a recipe

Every recipe records five independent facts: specification coverage; business authority for the named submethod; implementation state; input readiness; and execution/review state. `DRAFTED` means only that an actionable procedure exists. Unless an exact prepared input has been assessed, readiness is `NOT_ASSESSED`. No method in this batch has been executed or newly approved by writing it down. `method-index.json` is a planning registry, not an admission or runtime contract.

The catalog at `docs/research/report-section-catalog-v1.json` version 0.6.0 supplies canonical IDs, order, titles and planning metadata. Each recipe narrows authority to a particular operation. A bounded method does not complete its broader report section.

## Four evidence layers

1. Source evidence consists of retained source bytes, package metadata, locators and explicit provenance statements. A matching digest proves byte integrity, not source truth or provider authenticity.
2. Reproducible results contain deterministic normalization, arithmetic, membership, pointers and method outputs. Bind exact input, catalog, method and policy versions plus content digests. Identical bytes and versions must replay identically.
3. AI interpretation is a separate, versioned attempt over eligible claims. It may cite existing facts and state a concise evidence-linked rationale, assumptions, alternatives and limits. It must not generate executable calculation code or turn assertions into evidence. Never retain hidden chain-of-thought.
4. User decisions are authored by an authorized human and stored separately. A draft, score, comparison, recommendation-shaped string or AI output does not become a decision.

Rendering reuses retained accepted outputs. A new AI generation is a new attempt; model name, configuration, prompt/version, exact claim references, returned output, validation and human disposition belong to that attempt. A seed or temperature does not establish determinism.

## Shared value and evidence semantics

- A missing value remains missing. An observed zero remains an observed zero. `UNKNOWN` remains explicit; under the frozen M03/A32 policy it is retained in ALL and excluded from WIDE. CORE includes only frozen `CORE_CANDIDATE` membership. Do not substitute zero for missing or treat UNKNOWN as OUTSIDE.
- ALL, WIDE and CORE overlap; never add their totals. A membership delta is not growth. Listing count is not a unique-product count. Review rows are not people.
- Percentages require an explicit compatible numerator and denominator. A zero denominator yields no percentage. A partial observed subtotal is not a complete total. Unavailable/incompatible values stay null or blocked, with the cause retained.
- Compare only records sharing the declared entity identity, measure, unit, period and timezone, universe, inclusion/exclusion rules, sampling frame and codebook. Incompatible subsets remain separate. No inferred period, identity, commercial outcome or source population.
- Deduplicate only using a declared stable identity for the method: package digest/path for source files, platform plus source entity key for listings/shops, and owner-approved case/episode or content identity for qualitative evidence. Do not mint provider, product, listing or person identifiers from text. Keep duplicates and conflicts visible until a rule permits resolution.
- Deterministic ties use the owning implementation's order. If no approved order exists, preserve input order for display or mark the operation unresolved; do not invent a ranking. Rounding follows the named method; retain exact numerator/denominator where available.
- Counterevidence remains attached to the claim it qualifies. Do not resolve disagreement by majority vote, recency, source count or AI confidence unless an approved method explicitly says so.
- No population, prevalence, causal, forecast, market-share, health, effectiveness or strategy claim from a review sample or observational co-occurrence. Sales are not automatically demand; supply proxies do not substitute for demand; exposure is not outcome.
- Recipes use already supplied or retained data and published/owned research. They do not propose new customer surveys, interviews, recruited usability experiments, synthetic/LLM respondents, or a collection step as an unblock. I16 may document an unexecuted design only; recruiting or customer collection needs a separate future owner decision.

### Record identity and aggregation

Repeated references to the SAME exact file digest and row/span may be collapsed
as repeated references, or a real stable source record key may identify a repeated
record. Identical quote text at two different locators does NOT establish one
record, person, episode or observation. A text-content hash alone never authorizes
record deduplication. Reusing identical file bytes in storage does not merge its
distinct records or independent observations. Uncertain duplicates stay visible.

For example, two identical phrases at rows 3 and 8 remain two located records;
row 3 referenced twice remains one evidence reference. Neither operation counts
people. Cross-source record deduplication needs an actual compatible shared key
and a reviewed linkage policy.

Before summing a proposed measure, require its aggregation unit and proof that
the included entities/time intervals do not overlap. Same unit and period alone
are insufficient: a total and its subtotal, two representations of one total,
or overlapping windows cannot be added. If disjointness is unresolved, keep
separate observations and emit `AGGREGATION_OVERLAP_UNRESOLVED` (proposed code).

### Optional AI proposal contract — design only

The business session confirmed this design is consistent with AI-proposes,
human-decides. It remains PROPOSED_UNAPPROVED and unexecuted in A40. M11/I14 may
present unranked hypothesis/direction candidates; I15/M12 may present strategy/
action options; M01 may present a separate draft summary. This does not activate
generation or approve a model, prompt or new domain policy.

Proposed input: exact claim IDs, artifact digests/pointers, source scopes and
limits, owner question/constraints if supplied, allowed candidate type and a
versioned output contract. Proposed output per candidate:

- candidate ID/type and text, marked layer 3 and `HUMAN_REVIEW_REQUIRED`;
- exact input claim references, concise evidence-linked rationale;
- assumptions, counterevidence references, UNKNOWNs, evidence gaps and limits;
- model/config/prompt version, attempt/input/output identities, validation result
  and separate human disposition reference or null.

Future validation must reject missing/unresolvable references, unsupported
numbers, changed scopes or generated owner constraints/identities. It must
expose remaining semantic uncertainty for review, not claim citations prove
support. Keep owner-authored options and AI candidates in separate arrays.
Missing owner options does not authorize automatic promotion of a candidate.
No default score, weight, rank, probability, ROI, preferred option or execution.
Only a separately authorized human decision selects or approves an option.

Reuse retained candidate bytes on report replay; regeneration is a new attempt.
Store explanatory summaries, not hidden chain-of-thought. Existing button-only
B7/B10 contracts remain untouched: no new required reason field. Optional future
report-review rationale may link separately and is not an action authorization.

### Dependency meaning

The JSON index separates required section artifacts from optional reusable
section outputs. Raw source/corpus/codebook/protocol inputs are independent
primitives, not disguised dependencies on another report section. Optional
dependencies do not require all possible upstream sections to be completed.
Cross-references and historical owner decisions are context, not live execution
edges. The business direction is I01 -> relevant evidence -> M11/I14 -> I15 ->
M12, with M01 as a terminal summary. I16 consumes existing protocol/outcome data
directly; I12 may reference its reviewed result but I16 does not depend on I12.
I10 consumes its corpus directly; I13 may reuse I10 coding, not the reverse.

## Shared input vocabulary

These are descriptive types for the recipes, not new runtime schemas. Later implementation must bind to accepted contracts or a reviewed contract change.

| Type | Shape and required identity |
|---|---|
| `ExactArtifactRef` | `{artifactId: string, version: string, sha256: lowercase-hex-64, locator: string}`; locator resolves inside the named immutable artifact. |
| `SourceFileRef` | `{packageId: string, packageVersion: integer, logicalPath: string, sha256: lowercase-hex-64, mediaType: string, evidenceFamily: string, provenance: declared-enum, period: [start,end] or null}`; exact bytes and manifest membership required. |
| `Period` | `{start: RFC3339 date or date-time, end: same declared convention, timezone: IANA name or explicit offset, basis: source-declared field}`; conventions must be compatible, not coerced. |
| `Observation<T>` | `{state: missing\|observed_zero\|observed_value, value: T or null, unit: string, precision: enum, source: SourceFileRef + locator}`; state/value consistency validated. |
| `ClaimRef` | `{claimId: string, artifact: ExactArtifactRef, pointer: JSON Pointer, scope: string, numeratorPointer?: string, denominatorPointer?: string, limitations: string[]}`; pointer resolution is referential integrity only. |
| `EvidenceRecordRef` | `{sourcePackageDigest: string, fileVersion: string, exactRowSpanOrQuoteLocator: string, availableTimeMetadata: string or null, coding/adjudication/provenance: exact declared values}`; this internal locator can support a located manual example and does not assert person/product/listing identity. |
| `CaseRef` | `{evidenceRecord: EvidenceRecordRef, caseId?: owner/source-issued stable ID, episodeId?: owner/source-issued stable ID, context: structured context, quoteOrEventDigest: string}`; optional IDs are never inferred from prose. Without a stable source key, do not deduplicate across files, join people/entities, count people/cohorts, or claim prevalence. |

All examples below are synthetic, describe expected method behavior only and are not execution evidence. Proposed blocker codes are local planning labels until registered in a reviewed runtime contract. An output remains visibly blocked or incomplete when a mandatory prerequisite fails.

## Proposed lifecycle and versioning

An implementation should verify exact input bytes and compatibility first, calculate only its declared deterministic operation, validate output shape and content identity, then retain the exact result for replay. A changed source, method, policy, codebook, denominator or interpretation invalidates the relevant downstream version. Do not rewrite an older report version. Reopen only the affected operation and its dependent outputs.

New deterministic recipes require a versioned input/output contract and acceptance cases before implementation. New AI work requires its own prompt/output/citation contract and human-review disposition. Existing approved submethods keep their current versioned contract and limitations; this document does not enlarge them.
