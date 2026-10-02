# Literal review coding v1: rule semantics and limits

## Current proposal-2 execution rules (supersedes the historical proposal below)

GPT took over after Claude's session limit. The business review in
`Review marketing framework files`, turn `01a0fd00-e465-7521-bf1a-234c4580e613`,
returned AMEND, not approval of implementation bytes. The following conservative
defaults implement that review. The final JSON, brief and parser bytes must still
be reviewed together. The runtime only retains diagnostics; candidates are not
admitted as findings or counted as completed sections.

The JSON is revision `v1-proposal-2`; grammar is `literal-review-parser-v2`.
Its closed `decisionPolicy` is checked against the implemented policy. Exact
JSON, this brief and parser source are retained together in each diagnostic
source package, along with corpus, input, output and schema. Opening an old
report verifies retained bytes and does not run the current parser or rules.

| Operation | Accepted reading | Abstention |
|---|---|---|
| I04 subject | Explicit self or resolved hearsay frame; subjectless remains UNKNOWN | Third-party actor, possessive or unresolved subject remains pending |
| I04 modality | Factual action, attempted action, explicit completion or adjacent `chưa` before a simple verb | Conditional/future/advice/question/quotation remains pending. NOT_REPORTED is never emitted automatically |
| I04 trial | `đã dùng thử/mua thử` is ACTION_REPORTED; explicit `thử + VERB` is ATTEMPT_REPORTED | Mixed attempt/completion or negation scope remains pending |
| Bare `nên` | None in proposal-2 | Any operation relying on that linker is pending, even before `tôi/đã/rồi` |
| I05 | Unnegated declared polarity; exact target and holder when grammar resolves them | Any negated attitude is pending; no polarity flip. Unknown holder/target is UNKNOWN, not NOT_STATED |
| I05 holder | Self at the clause start with only recognized attitude-gap/target/aspect tokens before the attitude, or resolved hearsay | Self merely elsewhere, quoted speech, possessive or unresolved speech scope remains pending |
| I07 | Explicit adjacent same-sentence choice/reason with a declared unambiguous linker; negated reason prefix stays NEGATED; hearsay stays separate | No search across contrast or an intervening clause for a later choice. Conditional relations and negators inside the reason remain pending. No dictionary hit gives UNCLEAR, not OTHER_EXPLICIT |
| I08 | Explicit ATTEMPT_REPORTED followed by inability of that same verb through `nhưng`; the failed verb must equal or be the leading phrase of the attempted verb, with compatible actors and task objects | Bare purchase + complaint/out-of-stock does not prove attempted-task barrier. Negated, future, quoted or cross-actor/object obstacles remain pending |
| I02 | Exact context/time phrase, with all original qualifiers retained | Role/task/setting stay UNKNOWN; no parent, age, health or review-date inference |
| Informal token | Numeric `kg/k` immediately after a numeric token is not a negator | Other unresolved informal markers make only their evidence operation pending; no abbreviation conversion |

Quotation scope is detected before segmentation. Double/curly/French paired
quotes are protected, including quotes spanning multiple sentences; an unmatched
opener protects to the end. An ordinary unquoted sentence outside that span may
still be coded. Proposal-2 conservatively abstains on the whole sentence if any
of its words overlap a quote; it does not resolve nested quotations.

Removed automatic triggers: bare `lỗi`, voluntary `hủy đơn/huỷ đơn`, doctor or
pharmacist mention as trust, and bare `giá/giao` as monetary/access facets.
`đánh giá` and `giá mà` block facet substring matches. A closed phrase such as
`giá rẻ` is a declared literal facet, not a main motive or category admission.
No category vocabulary was expanded merely to obtain more matches.

Failure clauses pass the same subject grammar before they can qualify an action
or become an I08 relation. Third-party and unresolved named actors remain
pending. A missing failure subject may continue a local SELF or UNKNOWN task
without changing its attribution; two explicit self subjects must have the same
folded pronoun phrase. Cross-hearsay relations and a change from `tôi` to
`chúng tôi` are not resolved automatically. These guards apply equally to I04
qualifier absorption and I08, so `Tôi thử dùng nhưng con không dùng được` does
not become the narrator's attempted-task barrier.

The I05 modality guard also applies after bare `nên`, so advice such as `Bạn
nên yên tâm về sản phẩm` is pending, not a positive attitude. For I08, matching
verbs is only a prerequisite: after stripping leading/trailing ability or
completion particles, an explicitly stated failure object must exactly match
the task's remaining phrase. No aliases or object/category inference is used.
A locally omitted failure object may continue the task; an object only in the
failure is unresolved. `Tôi thử mua quạt nhưng tôi không mua thạch được` is not
a barrier for buying the fan. I07's forward result linker must sit directly at
the end of the reason clause; it cannot jump over `nhưng` or another clause.

The synthetic tests protect spans, pending versus absence, source conservation
and credible false-reading regressions. They are not labelled real-source
accuracy evidence. Date-unknown text may support labelled qualitative context
only; it cannot support annual/category prevalence claims.

The 15 questions in the historical section are resolved by these defaults and
the cited business turn. They are not new owner blockers. Only exact-byte review
remains before a specific rule revision can be admitted.

## Historical proposal-1 (superseded where different from the rules above)

Status: **PROPOSAL_PENDING_BUSINESS_REVIEW**. Nothing in this brief or in
`docs/research/literal-review-rules-v1.json` is an adopted codebook rule. The
coder declares `executionAuthority: NONE_RULE_PROPOSAL_ONLY` and always emits the
blocker `LITERAL_RULES_PROPOSAL_NOT_ADOPTED`. Root submits the exact rule-file
bytes (identified by `rules.sha256`) to the business reviewer before any
production wiring or real report run.

Original coder: Claude for the parser and rule table. Current owner: GPT for
review amendments, wiring, package/source replay and Linux verification.

## 1. What the coder is

`codeLiteralReviews(corpus, rulesBytes)` in
`src/modules/analysis/research-automation/literal-review-coding.ts` is a pure
function. Its inputs are:

- a structurally verified `ResearchReviewCorpus`, as `{ output, bytes }`;
- the exact rule-table bytes.

It returns `{ output: LiteralReviewCoding, bytes }`. It does not use the
network, a provider, a database, or the clock. It writes nothing and does not
mutate its inputs.

- **Annotation types:** candidates reuse
  `LocatedInsightMethods['input']` (`i02`, `i04`, `i05`, `i07`, `i08`). There is
  no competing semantic schema.
- **Records:** `records[k]` is a valid located record. `recordIndex = k` is
  assigned deterministically, one per (corpus group, version), in corpus order.
  The locator is `/records/{groupIndex}/versions/{versionIndex}/text`.
  `sourceSha256 = sha256(corpus bytes)`.
- **Provenance:** every candidate carries
  `{ basis: 'DECLARED', coderRole: 'RULE_GENERATED_DECLARATION literal-review-rules <revision> sha256:<rule bytes digest> parser:literal-review-parser-v1', adjudication: null, disagreement: null }`.
  It never sets `HUMAN_REVIEWED` and never sets `PENDING_AI`. There are no
  provider or person IDs.
- **Status separation:** the rule status (`rules.declaredStatus`) and the
  authority (`executionAuthority`) sit beside the candidate arrays, not inside
  them. Root must gate on `rules.sha256` equalling the business-reviewed digest
  before treating the candidates as adopted rule output.

## 2. Input integrity (rejections)

| Code | Meaning |
|---|---|
| `RULE_TABLE_SIZE_INVALID` / `_BOM_FORBIDDEN` / `_NOT_UTF8` / `_NOT_JSON` | The rule bytes are empty, larger than 256 KiB, BOM-prefixed, not strict UTF-8, or not JSON. |
| `RULE_TABLE_DUPLICATE_OR_MISSING_KEY` | A table or lexicon key occurs other than exactly once in the raw text. `JSON.parse` keeps the last duplicate, so the reviewed reading could differ from the executed one. |
| `RULE_TABLE_SHAPE_INVALID` / `RULE_TABLE_LEXICON_SHAPE_INVALID` | The top-level or lexicon key set is not exact. There is no free-form or executable entry. |
| `RULE_TABLE_BINDING_INVALID` | One of these does not match the pinned value: `rulesetId`, revision pattern, `parserRevision`, `codebookId`, `profileSha256`, `adoptionSha256`, status (must be `PROPOSAL_PENDING_BUSINESS_REVIEW`), language or documentation path. |
| `RULE_TABLE_CLASS_INVALID:<class>` | The class does not have 1–300 phrases. |
| `RULE_TABLE_PHRASE_INVALID:<class>` | The phrase is not 1–6 lowercase letter/mark/number tokens separated by single spaces, is longer than 48 characters, is not NFC, or would change under the fold. |
| `RULE_TABLE_DUPLICATE_PHRASE:<class>` | The same phrase appears twice in one class. |
| `RULE_TABLE_ROLE_OVERLAP:<class>` | One phrase is in two classes of a disjoint role group (§4). |
| `INVALID_RESEARCH_REVIEW_CORPUS:…` | The corpus fails the corpus JSON Schema. |
| `CORPUS_BYTES_MISMATCH` / `CORPUS_ID_MISMATCH` | The bytes are not `canonicalJson(output)+"\n"`, or `corpusId` is not the digest of the body. |
| `CORPUS_TEXT_STATE_MISMATCH` | `textState` disagrees with `text`. |
| `SOURCE_REF_CONSERVATION_MISMATCH` | The sum of version `sourceRefs` is not `coverage.rawRows`. |
| `UNIT_INDEX_LIMIT_EXCEEDED` | There are more than 10,000 units, the located-input array limit. |

The rule table holds only closed phrase lists. The grammar is code-owned and
versioned by `parserRevision`. Rules can never supply regexes, code or
templates.

## 3. Units, eligibility and coverage

Each (group, version) is one unit. Eligibility is decided in this order:

1. `QUARANTINED`: the listing is wrong or unresolved, or the group disposition
   is `QUARANTINED`.
2. `CONFLICTING`: the group is `UNRESOLVED_CONFLICT`. Every version stays
   visible and is never coded.
3. `EMPTY_TEXT`.
4. `UNREADABLE_TEXT`.
5. `ELIGIBLE`.

`exclusionReasons` keeps every applicable reason, not just the winning one. A
located record is `INCLUDED` only when it is `ELIGIBLE`. When `text` is null it
is `UNREADABLE`; otherwise it is `EXCLUDED` and `dispositionReason` holds the
joined reasons.

- A missing native review ID or an invalid or missing rating does **not**
  exclude readable selected-listing text. These remain as `corpusReasons` only.
- Equal-native-ID duplicates are already one corpus version, and the unit keeps
  all of its `sourceRefs`. Text-equal rows with distinct IDs remain separate
  units.
- An eligible text that is not NFC gets `textFlags: ['NON_NFC_TEXT']` and is
  pending in every family. It is never normalized and matched against another
  string.
- For each family, an eligible unit is `CANDIDATE`, `CANDIDATE_WITH_PENDING`,
  or `PENDING`. If a family has neither a candidate nor a specific pending item,
  it gets `NO_RULE_MATCH`. "Unmatched" is never zero, `NOT_REPORTED` or proof of
  no action.
- `coverage` has the following counts: `rawRows`, `sourceRefs`, `recordGroups`,
  `units`, `eligibleUnits`, `quarantinedUnits`, `conflictingUnits`,
  `emptyTextUnits`, `unreadableUnits` and `nonNfcEligibleUnits`. It also has a
  per-family block with `candidateUnits`, `candidateWithPendingUnits`,
  `pendingUnits`, `candidates` and `pendingItems`. There is no success threshold
  and no "section complete" flag.

## 4. Text model and precedence

- **Offsets:** spans are exact UTF-16 offsets into the original `text`, and
  `quote === text.slice(start, end)`. Matching uses a length-preserving fold.
  Each UTF-16 code unit is lowercased only when that keeps its length.
  Otherwise the original unit is kept, so offsets never move. Uppercase
  accented Vietnamese matches. Unaccented text does not match the accented
  lexicon.
- **Tokens:** a token is a maximal `[\p{L}\p{M}\p{N}]+` run. A multi-token
  phrase matches only when its tokens are separated by non-newline whitespace,
  never across punctuation.
- **Sentences:** they split at `. ! ? ; … CR LF 。 ！ ？`. A `.` or `,` between
  two digits does not split.
- **Clauses:** they split at any other punctuation and at linker phrases. A
  sentence is a question when its terminating punctuation contains `?` or `？`.
- **Longest match first:** at each token position, the longest phrase across
  the queried classes wins. On equal length, the earlier class in the query
  wins.
- **Lexical compounds** (`lexicalCompound`, such as `ổn định` and `thích hợp`)
  are masked first. Their tokens can never be read as a negator, polarity or
  verb (for example, `ổn` in `ổn định`).
- **Blocked compounds** (`eventBlockedCompound`, such as `người dùng`,
  `hạn sử dụng` and `dễ ăn`) compete with verbs during verb scanning. A blocked
  compound that wins consumes those tokens, so they are not an event.
- **Disjoint role groups** are enforced at load time:
  - linker classes;
  - facet classes;
  - `negator` / `noActionNegator`;
  - `selfSubject` / `otherPerson`;
  - `polarityPositive` / `polarityNegative`;
  - `actionVerb` / `eventBlockedCompound`;
  - `choiceVerb` / `eventBlockedCompound`.

  Classes outside these groups may intentionally share phrases, because they
  are queried in different positional roles. Examples: `mua` is both an action
  and a choice verb, `giá` is both an attitude target and a price facet, and
  `rồi` is both a clause opener and a perfective marker.
- **Negated reason:** `không phải` / `chẳng phải` / `không phải là` directly
  before a reason linker joins that linker as one negated link.

## 5. Proposed rule meanings by family

Every family uses the same **scope guards**, checked in this order. The first
one that applies makes the item pending; nothing is coded.

1. `INFORMAL_OR_UNACCENTED_MARKER`: an `informalMarker` token appears anywhere
   in the sentence.
2. `QUESTION_SENTENCE`.
3. `AMBIGUOUS_RESULT_LINKER`: the clause directly follows bare `nên`, and the
   clause does not open with a self subject or `đã`/`rồi`. Here `nên` may mean
   "should" instead of "so".
4. Conditional scope: a `conditional` phrase anywhere in the sentence.
5. Future/intent scope: a `futureIntent` phrase in the clause.

How conditional and future scope apply differs by family. I04 suppresses the
event, or makes it pending as `TENSE_OR_MODALITY_MIXED` when `đã`/`rồi` is also
present. I05 and I02 use `CONDITIONAL_SCOPE` or `FUTURE_OR_INTENT_SCOPE`. I07
keeps conditional reasons as `reasonPolarity: CONDITIONAL`.

### I04 — behaviour event (`eventKind`, `attribution`)

Grammar per action verb:
`[opener*] [subject] [negator | attempt | aspect]* VERB [completion] … [được]`.

Event kinds:

| Literal pattern | `eventKind` | Qualifiers kept |
|---|---|---|
| `VERB` (aspect allowed) | `ACTION_REPORTED` | — |
| `thử`/`cố`/`cố gắng`/`tìm cách` + VERB | `ATTEMPT_REPORTED` | attempt marker |
| VERB + `hết`/`xong` immediately after | `COMPLETION_REPORTED` | completion particle |
| `chưa`/`chưa từng`/`chưa bao giờ`/`chưa hề` + VERB | `NO_ACTION_EXPLICIT` | negator |
| Every action verb in the record is under a conditional/future marker, and the record has no other I04 candidate or pending item | `NOT_REPORTED`, `attribution: UNKNOWN`, span = sentence | the conditional/future markers |

Attribution comes from the subject slot:

| Subject slot | `attribution` / result |
|---|---|
| `selfSubject` | `SELF_REPORTED` |
| Hearsay: a `hearsayFrame` (+ optional `là`/`rằng`), or `otherPerson` [possessive] [self] + `nói`/`bảo`/`kể` (+ optional complementizer). This can also be a preceding hearsay-only clause in the same sentence with no linker between. | `OTHER_REPORTED`, with the hearsay frame kept as a qualifier and inside the span |
| `otherPerson` as the actor | **pending** `THIRD_PARTY_ACTOR` (see Q2) |
| No subject (openers only, or nothing) | `UNKNOWN` (see Q1) |
| Any other words before the verb | **pending** `UNRECOGNIZED_SUBJECT` |

Pending readings:

| Pattern | Pending reason |
|---|---|
| `không`/`chẳng`/… + VERB | `NEGATED_VERB_AMBIGUOUS` ("did not", "do not", "would not"?) |
| `không` + VERB + `được` (no attempt or completion) | `FAILURE`. After a contrast linker with a located task, it becomes a qualifier of that task (see the next row). Alone, it is **pending** `INABILITY_WITHOUT_LOCATED_TASK`. |
| CANDIDATE `nhưng`/`nhưng mà` FAILURE-or-`obstacleMarker` clause | One event: the span runs through the obstacle clause, which is also kept as a qualifier, so the full qualifying context survives. |
| Negator not adjacent to the verb chain | `NEGATION_SCOPE_UNCLEAR` |
| Negator after the verb | `POST_VERBAL_NEGATION_OR_QUESTION` |
| Two or more negators | `MULTIPLE_NEGATORS` |
| `chưa` + (`được` / attempt / completion) | `NEGATED_ABILITY_ATTEMPT_OR_COMPLETION` |
| Attempt + completion, or two attempt markers | `UNSUPPORTED_EVENT_PATTERN` |
| Coordinated verbs with different readings | `MIXED_EVENT_READINGS_IN_CLAUSE` / `MULTIPLE_EVENTS_IN_CLAUSE` |

In a clause, the first verb is the head. A later verb is coordinated only when
the gap is entirely opener, aspect, attempt, completion or negator words (for
example, `dùng và mua lại`). It inherits the head's subject. Any other later
verb is embedded context (for example, `mua cho con ăn`): it is kept inside the
span and is not a second event.

`dùng thử` / `uống thử` / `ăn thử` / `mua thử` are lexicalized action verbs, so
they are `ACTION_REPORTED`, not `ATTEMPT_REPORTED` (Q3).

### I05 — attitude (`polarity`, `target`, `speakerAttribution`)

A clause containing a `polarityPositive` or `polarityNegative` phrase produces
one candidate. The span is the whole clause.

- **Negation:** a negator may come directly before the polarity phrase, with
  only `polarityGap` words (`được, thấy, quá, lắm, rất, có, hơi, khá, cũng`)
  between them.
  - negator + positive → `NEGATIVE`;
  - negator + negative → `UNCLEAR`;
  - `chưa` → **pending** `NOT_YET_NEGATION`;
  - a negator not attached to a polarity phrase → **pending**
    `NEGATION_SCOPE_UNCLEAR`.
- **Polarity:** several phrases with different values give `MIXED`, or
  `UNCLEAR` if any one is `UNCLEAR`.
- **Target:** this is `SOURCE_STATED` only when the clause contains exactly one
  distinct `attitudeTarget` phrase. With none it is `UNKNOWN` (Q9). With two or
  more distinct ones, the item is **pending** `MULTIPLE_TARGETS`.
- **Speaker:**
  - a hearsay frame (or a preceding hearsay-only clause, when no named person
    is present) → `SOURCE_STATED`, spanning the frame;
  - a speech verb without a resolvable frame → **pending**
    `UNRESOLVED_SPEECH_FRAME`;
  - `otherPerson`, or a possessive before the self word → **pending**
    `THIRD_PARTY_ATTITUDE_HOLDER`;
  - a self word → `SOURCE_STATED`, spanning that word;
  - otherwise `UNKNOWN`.
- **Not used:** the star rating, silence, and whole-review sentiment are never
  used for polarity.

### I07 — reason for choice (explicit same-sentence linker only)

| Pattern | Relation |
|---|---|
| A | `CHOICE [không phải] vì/bởi vì/tại vì REASON` |
| B | `vì REASON … (cho nên/vì vậy/vì thế/do đó/nên) CHOICE`. The result linker is kept as a qualifier. |
| C | `REASON (cho nên/vì vậy/vì thế/do đó) CHOICE`, or `REASON nên (self/đã/rồi) CHOICE` |

The choice clause must contain a `choiceVerb`; otherwise the item is
**pending** `REASON_WITHOUT_LOCATED_CHOICE`. The choice subject is resolved as
in I04:

- other person → **pending** `THIRD_PARTY_ACTOR`;
- unrecognized → **pending** `UNRECOGNIZED_SUBJECT`.

Other choice-clause guards:

- negator in the choice clause → **pending** `NEGATED_OR_UNCLEAR_CHOICE`;
- future/intent → **pending** `FUTURE_OR_INTENT_SCOPE`;
- bare-`nên` modal reading → **pending** `AMBIGUOUS_RESULT_LINKER`.

Output fields:

- **`reasonPolarity`:**
  - `NEGATED` for a negated reason (`không phải vì`);
  - `CONDITIONAL` when the sentence has a conditional, with the markers kept as
    qualifiers;
  - **pending** `NEGATED_CONDITIONAL_REASON` when both apply;
  - otherwise `AFFIRMED`.
- **`speakerBasis`:** `SELF_STATED` for a self subject. It is `OTHER_REPORTED`
  for a hearsay subject, or a hearsay frame in the reason clause, which is kept
  as a qualifier. Otherwise it is `UNKNOWN`.
- **`reasonFacet`:** exactly one distinct facet class in the reason clause
  gives `PRICE_COST`, `ACCESS_AVAILABILITY`, `PRODUCT_ATTRIBUTE` or
  `INFORMATION_TRUST`. `facetFitOrAttributeAmbiguous`, no facet, or more than
  one facet gives `UNCLEAR`. `FIT_NEED` and `OTHER_EXPLICIT` are never emitted
  (Q7).
- **`resultState`:** always `UNKNOWN`.

Keyword co-occurrence without a linker never creates a relation.

### I08 — barrier (explicit contrast linker only)

The pattern is `TASK-CLAUSE nhưng/nhưng mà OBSTACLE-CLAUSE`. The obstacle
clause contains an `obstacleMarker` (such as `không được`, `hết hàng`,
`bị hủy` or `giao chậm`) or reads as `không VERB được`. The task clause must be
an I04 candidate.

| Condition | Result |
|---|---|
| Task clause has no action verb | No item (silent) |
| `chưa` task | **pending** `NO_ACTION_TASK` |
| Suppressed task | **pending** `FUTURE_OR_INTENT_SCOPE` |
| Conditional sentence | **pending** `CONDITIONAL_SCOPE` |
| Any other non-candidate task | **pending** `TASK_CLAUSE_UNRESOLVED` |

- **`barrierFacet`:** uses the same single-facet rule as I07, applied to the
  obstacle clause.
- **`resolutionState`:** always `UNKNOWN`.
- **Not a barrier:** dissatisfaction after `nhưng` (for example,
  `mua nhưng thất vọng`).

### I02 — situation and time context

A clause containing a `contextSituation` phrase (such as `mua cho con` or
`mua tặng`) or a `contextTime` phrase (such as `hàng ngày` or `buổi sáng`) is
coded as follows:

- `situation` and/or `time` are `SOURCE_STATED`, spanning the whole clause;
- the matched phrases are kept as qualifiers;
- `role`, `task` and `setting` are always `UNKNOWN`.

These guards make the clause pending instead:

- the shared guards;
- a negator in the clause → `NEGATED_CONTEXT`;
- a speech verb or hearsay frame in the clause → `HEARSAY_CONTEXT`.

The coder never infers a demographic, a recipient's age or health, or that the
person is a parent.

### Conflicts

If two rule readings give one clause different codes, all of them are removed
and the clause gets **pending** `CONFLICTING_RULE_READINGS`. This mirrors the
located method's `CONFLICTING_CLAUSE_CODE` (per I04, I05, I07 and I08, keyed by
record + clause span). Identical readings are deduplicated.

## 6. Unsupported patterns (declared in `output.unsupported`)

- I02: role, task and setting are never evaluated. A field absent from the
  closed vocabulary is `UNKNOWN`, not `NOT_STATED`.
- I04: `SOURCE_LOGGED` is never emitted. Third-party actors are pending. A task
  and an inability in one clause are pending. Cross-record or sequence order is
  not coded (I06 is out of scope).
- I05: rating or silence is never used as polarity. An absent target or holder
  is `UNKNOWN`.
- I07: `FIT_NEED` / `OTHER_EXPLICIT` are not emitted. `resultState` is
  `UNKNOWN`. The `do`/`nhờ` linkers and cross-sentence reasons are not
  recognized.
- I08: `resolutionState` is `UNKNOWN`. Dissatisfaction without a
  task–obstacle pair is not coded.
- All families: non-NFC text is pending. Unaccented or teencode text is pending
  only when a listed informal marker appears. Otherwise it usually ends as
  `NO_RULE_MATCH`.
- I06, I09, I10 and I13 are out of scope.

## 7. Limits (also in `output.limitations`)

- The rules are not business-reviewed and have not been accuracy-tested
  against real reviews. The synthetic test sentences are not real-source
  evidence.
- The provenance is a declared, rule-generated statement, not human review.
- The coder makes no inference of any of these: motive, health outcome,
  demographic, rating sentiment, exposure, prevalence or cross-record journey.
- Records are not unique people.
- No source date or capture time is projected (`timeText: null`). Undated
  records may support labelled qualitative context only. They may not support
  period claims.
- Raw corpus bytes and state are unchanged. The coder reads only `text` and
  the structural fields.

## 8. Questions for the business reviewer

1. **Subjectless verbs.** For example, `Đã dùng hết hộp.` is coded
   `attribution: UNKNOWN`. Should a subjectless first-person review clause be
   `SELF_REPORTED`?
2. **Third-party actors.** For example, `Con mình ăn hết hộp.` is pending. Is
   a reviewer reporting a family member's action acceptable as
   `OTHER_REPORTED`, or must it stay pending?
3. **`dùng thử` / `mua thử`.** These are coded `ACTION_REPORTED`, while only
   `thử + VERB` is coded `ATTEMPT_REPORTED`. Agree?
4. **Record-level `NOT_REPORTED`.** This is emitted only when every action verb
   in the record is conditional or future and nothing else is coded. Its
   attribution is `UNKNOWN`. Acceptable, or never emit `NOT_REPORTED`?
5. **`không + VERB`.** This stays pending (`NEGATED_VERB_AMBIGUOUS`). Should
   `không dùng` ever be `NO_ACTION_EXPLICIT`?
6. **Bare `nên`.** It reads as "so" only before a self subject or `đã`/`rồi`;
   otherwise it is pending as possible "should". Is that guard right?
7. **Facets.** `dễ ăn`, `phù hợp` and `cho bé` are `UNCLEAR` instead of
   `FIT_NEED` or `PRODUCT_ATTRIBUTE`. Should any of them map to a named facet?
   Should `OTHER_EXPLICIT` ever be emitted?
8. **`mua cho con` / `mua tặng`.** These are I02 *situation*. Should they
   instead be *role* (buyer for someone else)?
9. **Absent target or speaker.** These are `UNKNOWN`. Should a clause with no
   target phrase be `NOT_STATED`?
10. **Informal markers.** Single-letter `k`, `kg`, `kh`, `se`, `neu` and `chua`
    make the whole sentence pending. Is the list too broad or too narrow?
11. **Unaccented text and tone-placement variants.** `hủy`/`huỷ` are both
    listed. Should more old/new tone-placement variants be listed? Is
    unaccented text acceptable as unmatched?
12. **Conditionals.** A conditional anywhere in a sentence suppresses every
    I04 clause in that sentence. Is that too broad, given that the conditional
    may scope only one clause?
13. **Perfective plus future/conditional.** For example,
    `Nếu đã dùng rồi thì…` goes pending (`TENSE_OR_MODALITY_MIXED`) instead of
    being suppressed. Agree?
14. **I05 holder.** A self word gives `speakerAttribution: SOURCE_STATED` with
    the self span, while no holder gives `UNKNOWN`. Is that the intended
    distinction?
15. **Vocabulary.** Should any phrase be added to or removed from the
    `obstacleMarker`, polarity, facet or `contextTime` lists before the first
    real-corpus dry run?

Business answers produce a new rule `revision` and new bytes. Some answers
change the grammar (for example, Q1, Q2, Q5 and Q12); those also bump
`parserRevision` and must be implemented and re-tested. They are not table
edits.
