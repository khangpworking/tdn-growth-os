# Product intent: synthesis first, traceable review evidence on demand

Date: 2026-10-10
Status: owner-approved intent. Implementation pending.

## Owner intent

Users should not need to read thousands of TikTok comments or Shopee reviews. The product should present concise, useful synthesis while preserving a direct way to inspect and verify the evidence behind each finding. Detailed source processing and AI coding belong in the backend. Complete evidence remains accessible on demand.

This clarification follows the Ultimate plan's established separation of source evidence, calculations, AI interpretation and human decisions. Exact citations and source locations were foundational requirements. The specific shared synthesis-first presentation is an implementation decision clarified here, not a claim that this exact UI was specified in the earliest plan.

## User experience

The primary experience shows grouped themes, supported stated sentiment, scoped record counts, exclusions, uncertainty and exact supporting quotations. Findings are AI proposals awaiting owner review, not automatically accepted conclusions. A user can expand a finding to inspect the underlying review, full context and source locator without reading the whole corpus first.

Filtering and explicitly named navigation ordering help users find evidence. Frequency does not mean importance. No default business-priority score, invented weighting or hidden importance ranking is authorized.

A saved Reader is an evidence and inspection surface beneath the synthesis. A long-form Reader screen is not the primary delivery outcome. AI consumes authenticated structured source records and context directly, not rendered Reader HTML or PDF.

## Backend architecture

1. Authenticate retained source packages, sample membership and run/workspace bindings.
2. Project eligible source text and context into an explicit versioned coding input without exposing private author identities.
3. Execute compatible source-bound AI coding with immutable input, prompt, configuration and execution identities.
4. Validate supported categories, stated sentiment and exact quotations against the admitted source.
5. Calculate record counts and exclusions in application code. Retain citation mappings, codebook versions and uncertainty.
6. Publish a compact retained summary/API projection and evidence drill-down.
7. Serve saved results without recollection or new model execution. Exact retries must not duplicate dispatch or consumption. Uncertain or failed execution must not become readable success.

## Shared presentation, distinct evidence

TikTok and Shopee can share compatible presentation components and interaction patterns. Their source authentication, eligibility rules and retained evidence remain distinct. TikTok comments are not automatically product reviews or proof of purchase. Counts must not be pooled across platforms or presented as unique people or population prevalence.

Deduplication follows exact source-record identity. Identical wording at different source locations does not prove the same record or author. Preserve exact quotations, context, negation and source locators. Unknown periods and missing, null or zero values remain distinct.

## Next authorized delivery: Shopee U22 sample synthesis

The TikTok source-bound draft coding, cited report and saved Reader package is already merged in PR #202. The next bounded package applies the synthesis-first experience to a retained Shopee U22 sample.

The existing U22 sample is explicitly refused by current coding admission. Add an authenticated, versioned admission path and compatible backend coding/summary integration. Do not merely remove that refusal, widen a historical allowlist or reinterpret renderer27 as an existing private-default source.

Reuse supported topic and stated-sentiment coding where its contracts genuinely fit. Preserve historical schemas, prompts, reports, methods and stored bytes. Share UI components only where compatible, without redesigning or reopening the delivered TikTok package unnecessarily.

## Acceptance

An owner can select an already-retained Shopee sample. The owner can then get a cited draft synthesis, inspect supporting evidence, save and reopen the result, and retry. The retry must not duplicate collection or model execution. Mounted application, API and storage verification must establish the complete journey with synthetic fixtures and fake model or collector transports. An unused backend helper or a mocked UI-only success does not meet this criterion.

Wrong source, membership, workspace, run, manifest, digest, configuration or quotation must be refused before model execution or publication. Saved reads and retries must enforce authenticated execution status and immutable lineage. Historical supported readers and reports must remain compatible.

Independent exact-candidate review, full or generated CI, readiness, current-main compatibility, normal authorized matching-head merge and post-merge verification remain release gates. Intent approval is not implementation completion or whole-plan acceptance.

## Explicit non-goals

This package does not authorize importance scores, personas, second-stage classification, cross-platform totals, statistical conclusions, population or unique-person inferences, automatic recollection, saturation or requested-period coverage claims. It does not resolve U11, U26, U32 or U40 policies, and it does not substitute synthetic inputs for authentic business evidence.

No deployment, live or paid application-provider calls, credential changes or spending-cap changes are included. The coordinator stops after this single package is delivered or genuinely blocked. No automatic next capability is authorized.
