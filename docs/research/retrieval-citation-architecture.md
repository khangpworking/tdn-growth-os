# Report citations and retrieval experiments

Status: implementation preview; not deployed. Owner authorized the three workstreams on 2026-10-01. Final report design must be reviewed by the existing Claude session **Competitor mockup report design**, then accepted by the owner.

## Retained authority

TDN continues to own four distinct layers:

1. Exact retained source bytes, acquisition scope, period and locators.
2. Reproducible calculations, membership, denominators and method versions.
3. AI interpretations with referenced evidence IDs and explicit limitations.
4. Human decisions about whether to use those interpretations.

A document retriever is not an evidence authority. A model's explanation is not source evidence and no hidden chain-of-thought is required or stored. Store the submitted explanation, claims, selected references, limitations and operation metadata when an interpretation feature is implemented.

## Current slice

- `report-citations.ts` projects retained quantitative claim IDs into deterministic numbered references.
- `report-citation-html.ts` produces a separate offline rendition with numbered links and a readable source register.
- Existing `report-kit-html-vi-v1`, historical renderer dispatch and historical font bytes remain unchanged.
- The new rendition uses the Montserrat weights from the owner-approved report kit, stored under `assets/report-citations-v1/`; no Fedora system-font installation is necessary.
- Citation links do not invent quotes, product IDs, source IDs or document relationships. Calculation references remain distinct from source cells.
- Current exporter accepts no arbitrary generated prose and makes no model/provider calls.
- Retrieval candidates remain separate unless they match existing source/locator lineage. An external parser/verifier attestation is labelled as such, not falsely reported as independent byte extraction by this adapter.

## Tool allocation

| Tool | Proposed responsibility | Current boundary |
| --- | --- | --- |
| PageIndex | Find candidate pages/sections in a selected PDF | Isolated pilot only; never authorizes a claim or silently fills missing evidence |
| WeKnora | Optional document-library search across uploaded file formats | Considered later; not installed or connected to the live operator |
| OpenViking | Optional cross-run agent context/memory | Considered later; not an authoritative report/source database |
| Flint | Compile/audit eligible chart specifications | Offline, pinned compiler; no arithmetic, claim verification or automatic section completion |

Official upstream references checked on 2026-10-01: [PageIndex](https://github.com/VectifyAI/PageIndex), [WeKnora](https://github.com/Tencent/WeKnora), [OpenViking](https://github.com/volcengine/OpenViking). These projects describe retrieval/context capabilities; the allocation above is a TDN design proposal, not a claim that a native connector already exists.

## Optional combination, not a mandatory stack

TDN retained files → optional WeKnora corpus search → optional PageIndex PDF page selection → application-owned locator/quote verification → TDN citation projection → report preview.

OpenViking may later remember which documents and interpretations were useful, but a remembered statement must still resolve to the exact TDN source/calculation versions before entering a report. Rejection of a candidate is not proof that information is absent from the full document.

No installation of all three systems is required to ship numbered citations. A WeKnora/OpenViking benchmark should use the same public synthetic corpus and compare locator correctness, retrieval coverage, unsupported-claim count, latency, model-call cost, and setup/maintenance burden against TDN's existing retrieval path. Negative claims require explicit document coverage, not merely zero search hits. Installation and a paid benchmark remain separate, scoped actions.

## Pilot interpretation

The PageIndex experiment used all eight approved model calls: four with `gpt-5.6-luna`, then four with `gpt-6.1-sol`. It tested a custom CLIProxy adapter over the same public synthetic three-page PDF, not native SDK chat. Both models' restricted retrieval missed the same limitation page; both complete-page controls recovered it. Numeric meaning was stable on both, and GPT 6.1 repeated identical answer bytes. The primary source-coverage gate did not improve, so no production model was replaced. This does not establish anti-hallucination reliability or production accuracy. See [the comparison receipt summary](pageindex-gpt61-comparison.md).

Flint's earlier overflow experiment could silently omit categories. The new audit rejects omitted/extra/duplicate categories, changed numeric values, aggregation/stacking and overflow. A compiler PASS means the checked chart data survived compilation, not that the source denominator or business inference is valid.

Efficient uses for Flint are authoring a candidate specification from existing calculated data, comparing supported declarative backends during development, and rechecking category/value preservation after a compiler upgrade. Keep it off the ordinary report-read path and invoke it only for eligible chart sections. Its receipt must bind the normalized input, metric result, catalog, packet and ChartData, and must distinguish observed package metadata from an expected version pin.

## Release gates

1. Smallest meaningful tests on Linux; no Windows test/build/typecheck acceptance.
2. Actual read-only export CLI against disposable synthetic SQLite/artifacts; database bytes unchanged.
3. Fedora browser review of desktop/mobile numbered links and bundled Vietnamese fonts.
4. Exact Claude design-session review, with actionable findings fixed or disclosed.
5. Owner final approval before live operator update.

No schema migration, runtime dependency, model-call budget increase, production record mutation or deployment is included in this slice.
