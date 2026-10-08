# Thirty section methods v1

> **Current authority (2026-10-08):** This historical recipe set is superseded by [Ultimate v1.12](../ultimate-method/ultimate-method-30-sections.md) wherever they differ: E4/E11 (I02/D06 personas and coding defaults), E7 (I01 working question), E11 (I11 groups and M07 peers), and E2/E6/E11 (M12/I15 proposals). Preserve the evidence, provenance and human-action boundaries. This notice records document precedence, not implementation or operational acceptance.

Draft registry · 2026-09-30 · catalog identity `market-insight-30-section-catalog-v1` 0.6.0. This directory contains method specifications, not completed report sections, runtime admission rules, or a new authority contract. See [common rules](common-rules.md) and [authority index](authority-index.md).

## Coverage and state

The five state dimensions stay separate. Recipe coverage `DRAFTED` means a concrete method or parameterized procedure has been documented. All 30 recipe files now exist. M10 is explicitly split into a drafted gate, evaluation template, unapproved baseline proposal and incomplete production-forecast policy. Business authority is scoped to one named submethod; a draft recipe is not approval. Implementation reports code scope, not readiness. Readiness is `NOT_ASSESSED` unless an exact dataset was actually assessed. Execution/review `NOT_RUN` means no recipe ran and no output was reviewed in this documentation batch.

| Catalog order | ID | Canonical title | Group | Spec coverage | Business authority | Implementation | Input readiness | Execution/review |
|---:|---|---|---|---|---|---|---|---|
| 1 | M01 | Kết luận chính | Synthesis/owner | DRAFTED | UNRESOLVED_OWNER_POLICY | No bounded synthesis code | NOT_ASSESSED | NOT_RUN |
| 2 | M02 | Phạm vi và phương pháp | Existing bounded | DRAFTED | Approved A22 scope/method account only | A22 exists | NOT_ASSESSED | NOT_RUN |
| 3 | M03 | Quy mô và diễn biến | Existing bounded | DRAFTED | Approved A32 single-preparation totals only | A32/A37 exists | NOT_ASSESSED | NOT_RUN |
| 4 | M04 | Cơ cấu thị trường | Existing bounded | DRAFTED | Approved MetricScope/A27 group/concentration slices only | A1/A27 charts exist | NOT_ASSESSED | NOT_RUN |
| 5 | M05 | Nhu cầu | Additional market | DRAFTED | Proposed method, proxy choice unresolved | No full-section method | NOT_ASSESSED | NOT_RUN |
| 6 | M06 | Nguồn cung | Additional market | DRAFTED | Proposed method, supply unit/denominator unresolved | No full-section method | NOT_ASSESSED | NOT_RUN |
| 7 | M07 | Đối thủ | Additional market | DRAFTED | Proposed method, comparable universe unresolved | No full-section method | NOT_ASSESSED | NOT_RUN |
| 8 | M08 | Giá và kinh tế đơn vị | Existing bounded | DRAFTED | Approved A24 M08/P4 quote arithmetic only | A24 exists | NOT_ASSESSED | NOT_RUN |
| 9 | M09 | Động lực và rủi ro | Additional market | DRAFTED | Proposed source-bound event inventory | No full-section method | NOT_ASSESSED | NOT_RUN |
| 10 | M10 | Dự báo và kịch bản | Additional market | Gate/template + unapproved baseline drafted | Forecast choices unresolved | No approved forecast model | NOT_ASSESSED | NOT_RUN |
| 11 | M11 | Cơ hội | Synthesis/owner | DRAFTED | UNRESOLVED_OWNER_POLICY | No bounded synthesis code | NOT_ASSESSED | NOT_RUN |
| 12 | M12 | Hành động | Synthesis/owner | DRAFTED | UNRESOLVED_OWNER_POLICY | No bounded synthesis code | NOT_ASSESSED | NOT_RUN |
| 13 | M13 | Phụ lục và truy nguồn | Existing bounded | DRAFTED | Approved A23 source-to-record provenance only | A23 exists | NOT_ASSESSED | NOT_RUN |
| 14 | I01 | Câu hỏi kinh doanh | Synthesis/owner | DRAFTED | Owner-supplied question required | No full-section method | NOT_ASSESSED | NOT_RUN |
| 15 | I02 | Khách hàng và hoàn cảnh | Additional insight | DRAFTED | Proposed located-case coding; no population claims | No full-section method | NOT_ASSESSED | NOT_RUN |
| 16 | I03 | Phương pháp nghiên cứu | Existing bounded | DRAFTED | Approved A25 exact method account only | A25 exists | NOT_ASSESSED | NOT_RUN |
| 17 | I04 | Hành vi | Additional insight | DRAFTED | Proposed source-bound action/episode coding | No full-section method | NOT_ASSESSED | NOT_RUN |
| 18 | I05 | Cảm nhận và thái độ | Additional insight | DRAFTED | Proposed located statement coding | No full-section method | NOT_ASSESSED | NOT_RUN |
| 19 | I06 | Hành trình | Additional insight | DRAFTED | Proposed only where source links ordered episodes | No full-section method | NOT_ASSESSED | NOT_RUN |
| 20 | I07 | Lý do lựa chọn | Additional insight | DRAFTED | Proposed source-bound stated-reason coding | No full-section method | NOT_ASSESSED | NOT_RUN |
| 21 | I08 | Rào cản | Additional insight | DRAFTED | Proposed located barrier/context coding | No full-section method | NOT_ASSESSED | NOT_RUN |
| 22 | I09 | Nhu cầu chưa được đáp ứng | Additional insight | DRAFTED | Proposed evidence test; absence is not unmet demand | No full-section method | NOT_ASSESSED | NOT_RUN |
| 23 | I10 | Chủ đề và mối quan tâm | Additional insight | DRAFTED | Proposed frozen-corpus coding; prevalence choices unresolved | No full-section method | NOT_ASSESSED | NOT_RUN |
| 24 | I11 | Khác biệt giữa các nhóm | Additional insight | DRAFTED | Group, sparse-cell and uncertainty choices unresolved | No full-section method | NOT_ASSESSED | NOT_RUN |
| 25 | I12 | Điểm tiếp xúc | Additional insight | DRAFTED | Exposure/outcome/attribution choices unresolved | No full-section method | NOT_ASSESSED | NOT_RUN |
| 26 | I13 | Thương hiệu và đối thủ | Additional insight | DRAFTED | Proposed frozen content-corpus coding | No full-section method | NOT_ASSESSED | NOT_RUN |
| 27 | I14 | Hướng cơ hội | Synthesis/owner | DRAFTED | UNRESOLVED_OWNER_POLICY | No bounded synthesis code | NOT_ASSESSED | NOT_RUN |
| 28 | I15 | Định hướng chiến lược | Synthesis/owner | DRAFTED | UNRESOLVED_OWNER_POLICY | No bounded synthesis code | NOT_ASSESSED | NOT_RUN |
| 29 | I16 | Thử nghiệm và đo lường | Additional insight | DRAFTED | Existing-results or design-only; no new collection | No full-section method | NOT_ASSESSED | NOT_RUN |
| 30 | I17 | Phụ lục và bằng chứng | Existing bounded | DRAFTED | Approved A26 directional trace only | A26 exists | NOT_ASSESSED | NOT_RUN |

Seven bounded recipes describe their named existing slice and its limits. The other 23 recipes are drafted proposals; they have not become owner-approved methods or executable runtime code. The six owner-decision methods M01/M11/M12/I01/I14/I15 have no approved full method; their safe output is an unranked evidence/question inventory until the owner supplies a decision policy. Existing partial code does not turn any broader section into a completed method.

## Current implementation coverage

The 7/30 bounded methods are: M02 scope/method account; M03 one-period totals; M04 group/concentration Result arrays and A27 views; M08/P4 single quote packaging arithmetic; M13 source provenance; I03 research-method account; and I17 directional evidence index. A38 assembles these partial outputs while keeping all 30 section states visible. This document does not claim 30/30 implementation, input readiness, execution, review, approval, finality or publishability.

## Consolidated owner decisions

This list is a working register; approval must name the exact policy/submethod and version.

1. **D01** — M05: choose and define the demand proxy or proxies, eligible evidence family, units, selection frame and any valid denominator. Sales, search activity or co-occurrence cannot be called demand by default.
2. **D02** — M06: choose the supply object and unit, define what proves availability/capacity, and supply a real compatible denominator. Offer rows are not automatically unique or available supply.
3. **D03** — M07: define the comparable competitor universe, entity identity/variant rules, common period and measures. Competitive priority/weights remain owner decisions.
4. **D04** — M09: define which dated event/risk classes and target metrics belong in scope. Evidence linkage may produce a source-bound event inventory; probability/impact scales and causal language need explicit authority.
5. **D05** — M10: select model or baseline, minimum compatible history, horizon, daily timezone/seasonality convention, missing-day/imputation policy, train/validation/holdout windows, error measures, selection rule and any decision threshold. None is approved by this recipe set. Owner-authored scenarios must be separate from evaluated forecasts.
6. **D06** — I02/I04–I08: decide codebook terms, context fields, identity/episode requirements, coder/adjudication roles and inclusion rules for each distinct question. Located examples can be reported without cross-source person identity; prevalence, cohorts, journeys and person counts cannot.
7. **D07** — I09/I10/I13: decide frozen corpus/sampling frame and coding/adjudication rules. Unmet-need criteria and prevalence denominator remain open. “Not found in a sample” is not unmet demand.
8. **D08** — I11: define groups, compatible denominator, predeclared sparse-cell rule and uncertainty method before inspecting outcomes. No cutoffs are supplied here.
9. **D09** — I12: define exposure unit, outcome, attribution window, dedup/identity basis and instrumentation. No effectiveness claim without compatible exposure/outcome; observational association is not causal.
10. **D10** — I16: decide whether the recipe documents an existing experiment result or an unexecuted design. For any lift claim, the source must already contain outcome, unit, comparator, instrumentation, assignment and approved analysis/uncertainty rules. No new recruitment, survey or experiment execution is proposed.
11. **D11** — M01/M11/M12/I01/I14/I15: supply the question/objective, eligible exact upstream claims, conflict handling, prioritization/decision criteria, accountable owner, constraints and reconsideration point. Without a reviewed policy, provide an unranked inventory and do not assert a preferred strategy or action.
12. **D12** — Any use of AI for interpretation needs separate prompt/output/citation validation, retained attempt metadata and explicit human review. AI is not authorized to choose numeric models, thresholds, proxy substitutions, rankings, groups or owner actions in this registry.

The business session confirmed on 2026-09-30 (session `01a0a8fd-02d2-7e71-ba4c-244930d054bd`) that no standalone approved full method exists for M01, M11, M12, I01, I14 or I15, and that its six-family input packet does not provide all procedures/thresholds. Root-level audit and any later owner parameter approval remain separate from this drafting work.

## Execution order and machine-readable index

[method-index.json](method-index.json) lists all 30 IDs/titles, recipe paths,
scoped authority, required versus optional section dependencies and decision
references. It is a planning registry, not a replacement for runtime contracts.

Reuse existing preparation and bounded method owners first. Draft new operations
in input-family batches: source/proxy inventories, coded existing evidence,
compatible group/outcome analysis, then synthesis and decision packets. Do not
make every calculation await a complete 30-section report.

I10 reads its corpus directly and may feed I13; I16 reads existing protocol and
outcomes directly and may inform I12. The decision direction is I01 → eligible
evidence → M11/I14 → I15 → M12. M01 is a downstream summary, never a prerequisite
of its own inputs. Optional reused outputs do not require all other sections.

## What still needs approval before new operations run

The 12 decision groups above are not 12 questions the owner must answer now.
Many are method configuration that the business-method owner can draft for
review; data-dependent choices remain unset until a real intended use is known.

Recommended first delivery scope, still a proposal: compute transparent
descriptive operations over explicit compatible inputs, retain located examples,
and emit unranked evidence inventories. Keep forecast, inferential group claims,
automated priority/strategy selection and new customer research disabled.
Use declared/adjudicated coding instead of silently adopting an AI taxonomy.

Optional AI hypothesis/direction/option drafting is specified separately in
[common rules](common-rules.md). It can support the intended AI-proposes,
human-decides workflow without requiring the owner to author every candidate.
No model/prompt is activated here. Owner options remain separate from AI
candidates, and existing button-only decision APIs are unchanged.

## Review record

Luna xhigh authored all 30 recipe bodies. Codex integrated the planning registry
and corrected dependency cycles, source-hash transcription, aggregation overlap,
record deduplication and AI-candidate boundaries. The business-method session
reviewed all four groups for procedure shape and claim boundaries; this is not
approval of unresolved parameters, executed evidence or commercial conclusions.
No Windows tests/build/typecheck, runtime changes or provider calls were made.
