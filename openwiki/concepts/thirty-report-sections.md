---
type: delivery matrix
title: M01–M13 and I01–I17 Delivery Matrix
description: Compact implementation matrix for the 30 Market and Insight report sections. It maps retained input classes and code owners to their bounded delivery standing and canonical Ultimate Method references.
tags: [reporting, market-analysis, insight-analysis, delivery-status, ultimate-method]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T02:26:52.838Z
sources:
  - id: openwiki-source-1ffcdfa62628cecc901fbaab
    resource: repo://docs/research/report-section-catalog-v1.json
  - id: openwiki-source-8d2d04fcf9faa154c87546fd
    resource: repo://docs/research/ultimate-method/ultimate-method-30-sections.md
  - id: openwiki-source-fb45529fa7308c451b36f591
    resource: repo://docs/STATUS.md
  - id: openwiki-source-1ee2aa54e39386d103465aa1
    resource: repo://docs/tasks/ultimate-v1.11-tdn-sync-plan.md
  - id: openwiki-source-fc5bce688f3f339a87ad3118
    resource: repo://src/modules/analysis/bounded-analysis-gates.ts
  - id: openwiki-source-4d8615b41fd7d5fb769bcb81
    resource: repo://src/modules/analysis/insight-corpus-counts.ts
  - id: openwiki-source-c65f4c232f829cb9f1f29b8d
    resource: repo://src/modules/analysis/located-insight-methods.ts
  - id: openwiki-source-e2a313191361218b77debe54
    resource: repo://src/modules/analysis/metric-input-preparation-service.ts
  - id: openwiki-source-9310fb39f752b619ba3d0990
    resource: repo://src/modules/analysis/research-automation/reader-report-revisions.ts
  - id: openwiki-source-f3a0a60925ae6a9a9fa2ee86
    resource: repo://src/modules/analysis/research-automation/reader-unit-spec-intake.ts
  - id: openwiki-source-e087db8ae003ad693ac979a5
    resource: repo://src/modules/analysis/research-automation/reports.ts
  - id: openwiki-source-dcf9957ecc7c5099a757950b
    resource: repo://src/modules/analysis/research-automation/service.ts
generated: { by: "openwiki/0.7.1", at: "2026-10-09T02:26:52.838Z" }
---

# M01–M13 and I01–I17 Delivery Matrix

This implementation index maps every report section to the retained input class, owning code path, and current delivery standing. It is not business-method authority. The [Ultimate Method](../../docs/research/ultimate-method/ultimate-method-30-sections.md) is authoritative over recipes, configuration, and code; method description, approval, implementation, and reviewed execution remain distinct. The runtime catalog is planning metadata, not executable method authority.

**Checked main SHA:** `2b44e4bcf75ac3bfd2a5d3a0de679a0fcb1a48ad`. The opening update in the [sync plan](../../docs/tasks/ultimate-v1.11-tdn-sync-plan.md#plan-bring-tdn-in-line-with-ultimate-v112-and-show-the-approved-data-sources-on-the-source-board) and [status record](../../docs/STATUS.md#ultimate-alignment--implementation-run-08102026) replace the former PR #110 baseline: the listed bounded slices are merged on main. They do not establish full Ultimate alignment or section acceptance.

## Authority and reading key

| Authority | Canonical link |
|---|---|
| Shared rules | [1–9](../../docs/research/ultimate-method/ultimate-method-30-sections.md#2-quy-tắc-dùng-chung-áp-cho-cả-30-section) |
| Insight clarifications | [L1–L10](../../docs/research/ultimate-method/ultimate-method-30-sections.md#21-làm-rõ-khi-áp-cho-insight-mới-ở-v11) |
| Approved exceptions | [E1–E14](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) |
| Market section rules | [M01–M13](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) |
| Insight section rules | [I01–I17](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) |

All rows inherit [1–9](../../docs/research/ultimate-method/ultimate-method-30-sections.md#2-quy-tắc-dùng-chung-áp-cho-cả-30-section); Insight rows also inherit [L1–L10](../../docs/research/ultimate-method/ultimate-method-30-sections.md#21-làm-rõ-khi-áp-cho-insight-mới-ở-v11). **Merged on main** means a bounded capability is present in the checked tree. **Planned** names the remaining capability separately; neither label means an entire section is accepted.

## Runtime boundary

[`src/modules/analysis/research-automation/reports.ts`](../../src/modules/analysis/research-automation/reports.ts) loads the catalog to enumerate Market or Insight sections, validates run/workspace/source bindings, dispatches retained method snapshots, and emits `SOURCE_CONTEXT`, `SOURCE_TABLE`, `EVIDENCE_INVENTORY`, `METHOD_OUTPUT`, `METHOD_NO_USABLE_RECORDS`, or `BLOCKED`. Its semantic output fixes `completedAnalyticalSections` at `0`; rendering a retained method result is not a full analytical completion.

The builders own bounded calculation and validation; the report module is the presentation and lineage boundary. [`src/modules/analysis/descriptive-market-methods.ts`](../../src/modules/analysis/descriptive-market-methods.ts) owns M05/M06/M07/M09 source-bound outputs; [`src/modules/analysis/located-insight-methods.ts`](../../src/modules/analysis/located-insight-methods.ts) owns located I01–I10/I13 outputs; and [`src/modules/analysis/bounded-analysis-gates.ts`](../../src/modules/analysis/bounded-analysis-gates.ts) owns M10/I11/I12/I16 gate outputs. The matrix identifies the primary owner rather than treating the renderer as the computation owner.

## Delivery matrix

| ID and Ultimate refs | Retained input class | Owning full code path | Delivery standing |
|---|---|---|---|
| M01 · [M01](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) · [E3](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) | Source claims or market-presentation snapshot | [`src/modules/analysis/research-automation/reports.ts`](../../src/modules/analysis/research-automation/reports.ts) | **Merged on main:** renders retained evidence inventory/presentation. **Planned:** full M01 delivery remains tracked as U-29. |
| M02 · [M02](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) | Run, scope, captures, source package | [`src/modules/analysis/research-automation/market-scope-report.ts`](../../src/modules/analysis/research-automation/market-scope-report.ts) | **Merged on main:** retained source-scope context. **Planned:** broader coverage validation. |
| M03 · [M03](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) | Verified Metric package and normalized input | [`src/modules/analysis/metric-input-preparation-service.ts`](../../src/modules/analysis/metric-input-preparation-service.ts) | **Merged on main:** verified preparation and scoped Metric presentation. **Planned:** positive cross-platform totals remain U-32. |
| M04 · [M04](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) | Verified classified Metric result | [`src/modules/analysis/research-automation/reports.ts`](../../src/modules/analysis/research-automation/reports.ts) | **Merged on main:** retained classified Metric view when attached. **Planned:** classification/rate eligibility remainder. |
| M05 · [M05](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) · [E10](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) | Located descriptive observations | [`src/modules/analysis/descriptive-market-methods.ts`](../../src/modules/analysis/descriptive-market-methods.ts) | **Merged on main:** source-bound descriptive partitions. **Planned:** breadth and section acceptance. |
| M06 · [M06](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) | Located supply observations | [`src/modules/analysis/descriptive-market-methods.ts`](../../src/modules/analysis/descriptive-market-methods.ts) | **Merged on main:** source-record inventory. **Planned:** identity/coverage needed for a broader supply result. |
| M07 · [M07](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) · [E11](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) | Frozen classified sales and optional owner additions | [`src/modules/analysis/default-market-peers.ts`](../../src/modules/analysis/default-market-peers.ts) | **Merged on main:** retained default peer selection and separate additions. **Planned:** U-26 admission policy. |
| M08 · [M08](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) · [E1](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) · [E9](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) | Exact retained quote/spec artifact | [`src/modules/analysis/research-automation/reader-report-revisions.ts`](../../src/modules/analysis/research-automation/reader-report-revisions.ts) (with [`reader-unit-spec-intake.ts`](../../src/modules/analysis/research-automation/reader-unit-spec-intake.ts)) | **Merged on main:** authenticated reader-only spec intake and receipt-bound reader build. **Planned:** native extraction, auto-report integration, and full unit-economics delivery. |
| M09 · [M09](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) | Located dated event statements | [`src/modules/analysis/descriptive-market-methods.ts`](../../src/modules/analysis/descriptive-market-methods.ts) | **Merged on main:** dated event inventory and conflicts. **Planned:** independent event-source breadth. |
| M10 · [M10](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) | Bounded series and gate package | [`src/modules/analysis/bounded-analysis-gates.ts`](../../src/modules/analysis/bounded-analysis-gates.ts) | **Merged on main:** gate output. **Planned:** no forecast implementation; advanced execution remains disabled. |
| M11 · [M11](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) | Version-bound source claims and decision packet | [`src/modules/analysis/research-automation/decision-synthesis-execution.ts`](../../src/modules/analysis/research-automation/decision-synthesis-execution.ts) | **Merged on main:** retained evidence/decision-draft path. **Planned:** source breadth and acceptance. |
| M12 · [M12](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) · [E2](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) | Decision packet, claims, constraints | [`src/modules/analysis/research-automation/decision-packets.ts`](../../src/modules/analysis/research-automation/decision-packets.ts) | **Merged on main:** retained packet/draft path. **Planned:** supporting inputs and acceptance. |
| M13 · [M13](../../docs/research/ultimate-method/ultimate-method-30-sections.md#4-chi-tiết-market-report) | Captures, manifests, method snapshots | [`src/modules/analysis/research-automation/reports.ts`](../../src/modules/analysis/research-automation/reports.ts) | **Merged on main:** source and method trace. **Planned:** multi-source inclusion/exclusion disclosure. |
| I01 · [I01](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) · [E7](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) | Brief, scope, working-question proposal | [`src/modules/analysis/located-insight-methods.ts`](../../src/modules/analysis/located-insight-methods.ts) | **Merged on main:** retained brief and labelled working-question path. **Planned:** acceptance. |
| I02 · [I02](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) · [E4](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) · [E5](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) | Located review records, exact spans, coding provenance | [`src/modules/analysis/located-insight-methods.ts`](../../src/modules/analysis/located-insight-methods.ts) | **Merged on main:** source-bound/draft coding path. **Planned:** business validation and complete persona delivery. |
| I03 · [I03](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) | Corpus package, coding binding, receipts | [`src/modules/analysis/research-automation/reports.ts`](../../src/modules/analysis/research-automation/reports.ts) | **Merged on main:** corpus and coding trace. **Planned:** accepted corpus/method coverage. |
| I04 · [I04](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) | Located event annotations | [`src/modules/analysis/located-insight-methods.ts`](../../src/modules/analysis/located-insight-methods.ts) | **Merged on main:** source-bound/draft coding path. **Planned:** business validation. |
| I05 · [I05](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) | Located polarity clauses and literal evidence | [`src/modules/analysis/located-insight-methods.ts`](../../src/modules/analysis/located-insight-methods.ts) | **Merged on main:** retained polarity/literal paths. **Planned:** star-distribution and validation remainder. |
| I06 · [I06](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) | Same-record event and relation annotations | [`src/modules/analysis/located-insight-methods.ts`](../../src/modules/analysis/located-insight-methods.ts) | **Merged on main:** source-stated sequence declarations. **Planned:** validation. |
| I07 · [I07](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) | Same-record choice/reason relations | [`src/modules/analysis/located-insight-methods.ts`](../../src/modules/analysis/located-insight-methods.ts) | **Merged on main:** source-bound/literal path. **Planned:** seller-voice and validation remainder. |
| I08 · [I08](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) | Same-record task/obstacle relations | [`src/modules/analysis/located-insight-methods.ts`](../../src/modules/analysis/located-insight-methods.ts) | **Merged on main:** source-bound/literal path. **Planned:** seller-voice and validation remainder. |
| I09 · [I09](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) | Desired/current-state relations | [`src/modules/analysis/located-insight-methods.ts`](../../src/modules/analysis/located-insight-methods.ts) | **Merged on main:** explicit-gap and incomplete-evidence states. **Planned:** business validation. |
| I10 · [I10](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) · [E11](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) | Frozen corpus, codebook, assignments, dispositions | [`src/modules/analysis/insight-corpus-counts.ts`](../../src/modules/analysis/insight-corpus-counts.ts) | **Merged on main:** retained corpus counts and draft-count path. **Planned:** U-11 cross-check. |
| I11 · [I11](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) · [E11](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) | Source-backed group cells or coding counts | [`src/modules/analysis/bounded-analysis-gates.ts`](../../src/modules/analysis/bounded-analysis-gates.ts) | **Merged on main:** group inventory and conditional descriptive-rate gate. **Planned:** inference remains disabled. |
| I12 · [I12](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) | Presence, exposure, outcome records | [`src/modules/analysis/bounded-analysis-gates.ts`](../../src/modules/analysis/bounded-analysis-gates.ts) | **Merged on main:** separate inventories. **Planned:** linkage/effectiveness remains disabled. |
| I13 · [I13](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) · [E5](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) | Frozen literal-phrase corpus, mentions, dispositions | [`src/modules/analysis/insight-corpus-counts.ts`](../../src/modules/analysis/insight-corpus-counts.ts) | **Merged on main:** literal mentions and corpus counts. **Planned:** U-11 cross-check and seller-voice breadth. |
| I14 · [I14](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) | Admitted claims and retained synthesis outcome | [`src/modules/analysis/research-automation/i14-evidence-admission.ts`](../../src/modules/analysis/research-automation/i14-evidence-admission.ts) | **Merged on main:** evidence-admission and optional retained synthesis path. **Planned:** real-input validation. |
| I15 · [I15](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) · [E2](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) · [E6](../../docs/research/ultimate-method/ultimate-method-30-sections.md#22-ngoại-lệ-đã-được-chủ-duyệt) | Decision packet, claims, constraints | [`src/modules/analysis/research-automation/decision-packets.ts`](../../src/modules/analysis/research-automation/decision-packets.ts) | **Merged on main:** retained strategy-draft path. **Planned:** source breadth and acceptance. |
| I16 · [I16](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) | Measurement design or existing-result gate package | [`src/modules/analysis/bounded-analysis-gates.ts`](../../src/modules/analysis/bounded-analysis-gates.ts) | **Merged on main:** design/eligibility gate. **Planned:** estimator and execution remain disabled. |
| I17 · [I17](../../docs/research/ultimate-method/ultimate-method-30-sections.md#5-chi-tiết-insight-report) | Corpus/package manifests, locators, coding artifacts | [`src/modules/analysis/research-automation/reports.ts`](../../src/modules/analysis/research-automation/reports.ts) | **Merged on main:** corpus, coding, and source trace. **Planned:** complete family and keyword-exclusion trace. |

## Invariants and change boundary

The report renderer does not manufacture a result when a method snapshot is absent, has no usable records, or fails lineage checks. For current runs it rejects mismatched run, workspace, collection, coding, and retained presentation bindings before dispatch; old reports retain versioned renderer paths instead of being silently reinterpreted by newer logic. [`src/modules/analysis/research-automation/reports.ts`](../../src/modules/analysis/research-automation/reports.ts)

Bounded builders validate normalized declarations before producing canonical output. The descriptive and located builders rebuild retained output to detect replay mismatches; the gate builder does the same. [`src/modules/analysis/descriptive-market-methods.ts`](../../src/modules/analysis/descriptive-market-methods.ts), [`src/modules/analysis/located-insight-methods.ts`](../../src/modules/analysis/located-insight-methods.ts), and [`src/modules/analysis/bounded-analysis-gates.ts`](../../src/modules/analysis/bounded-analysis-gates.ts)

For operational context, see [Market Report Lanes](market-report-lanes.md), [Data Source Registry](../integrations/data-source-registry.md), [Quickstart](../quickstart.md), [Verification and Replay](../testing/verification-and-replay.md), [Research Report Lifecycle](../workflows/research-report-lifecycle.md), and [Ultimate Alignment Packages](../workflows/ultimate-alignment-packages.md).
