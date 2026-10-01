# PageIndex retrieval pilot: GPT 6.1 comparison

Date: 2026-10-01. Decision: **no production model replacement**.

The owner authorized GPT 6.1 on the same public synthetic fixture as the previous Luna pilot, with parallel implementation of report citations. The exact route advertised by the local CLIProxy was `gpt-6.1-sol`. The experiment used four remaining authorized calls; the total budget is now **8/8**, with zero automatic retries.

## What was compared

Both models received the same three-page Vietnamese PDF, PageIndex tree and OCR pages, questions, system messages, JSON-output instructions and `max_tokens: 1500`. The adapter did not set an explicit reasoning-effort parameter on either model. Provider defaults may therefore differ. The two batches ran at different times, not as a randomized latency benchmark.

Fixture SHA-256: `688d925bf54d0101b453931fc0e40ca7877c0b8d0f1010aa74f135ea6389eb58`.

Each model used four calls: page selection, answer from selected pages, identical answer request repeated, and a full-three-page coverage control. The source contains observed revenue of 1,234,567 VND, calcium of 120 mg, and an explicit absence of conversion measurement on page 3.

This is a custom bounded adapter over real PageIndex `get_tree`/`get_ocr`, not a test of native PageIndex `chat()` or automatic indexing. The local tree was supplied for the fixture. No cloud document upload or private market document was used.

## Observed results

| Check | gpt-5.6-luna | gpt-6.1-sol |
|---|---|---|
| Revenue and calcium values | Correct in both answer calls | Correct in both answer calls |
| Absent conversion number | Not invented | Not invented |
| Select page 3 for the limitation | Missed | Missed |
| Source quotes resolve for all three answers | Failed selective coverage | Failed selective coverage |
| Full-document control | All four checks passed | All four checks passed |
| Repeated numeric meaning | Stable | Stable |
| Repeated answer bytes | Different | Identical |
| Observed four-call elapsed time | 47.583 seconds | 27.030 seconds |
| Reported total tokens | 3,501 | 3,026 |

GPT 6.1 was faster and byte-stable in this tiny run. It did **not** repair the gating failure: both selected only page 2 and therefore lacked the source limitation needed for the absent-measurement citation. Both selective receipts remain FAIL. A NOT_FOUND answer without a limitation quote is not a fabricated number; the failure here is citation coverage, not an accusation of numerical hallucination.

## Release decision

The conditional switch requires demonstrated improvement on the task's primary requirement: correct source coverage and verifiable citations, without degrading numeric/absence handling. Neither model passed selective coverage. Keep the previous experiment baseline; do not change Content Studio or other production models based on this result. There is currently no production PageIndex QA path or existing web PageIndex default to replace.

Before a future integration, validate a deterministic limitation-page inclusion or bounded coverage fallback, with an explicit call budget. Such a fallback must not turn a missing figure into a zero or an inferred fact. A larger representative corpus and separately authorized calls would be needed to establish a production-quality ranking.

The live report-citation renderer is independent of this pilot: it attaches retained deterministic calculation/source evidence, accepts no arbitrary AI-generated prose or retrieval candidate as verified fact, and makes no model calls.

## Receipts

The task-owned private experiment stores `root-live-receipt.json`, `coverage-control.json`, `gpt61-comparison.json` and the append-only attempt ledger `root-model-budget.json` outside Git. SHA-256 verification confirmed that the original two Luna receipts were unchanged. Calls 5 through 8 record the four GPT 6.1 attempts. Only answer JSON, checks, token usage and elapsed time were retained; no private chain-of-thought was requested or stored.

Model identity/reference: [GPT 6.1 Sol official model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-sol). Account-specific billing was not measured; token counts are not actual dollar charges.
