# M02/M13 source scope and retained real-source replay

Date: 2026-10-04. Unreleased working tree on `0116091` / draft PR #110.
This is a bounded integration checkpoint, not 30-section or deployment acceptance.

## Implemented

- `market-scope-report.ts` projects the requested reporting period, the Metric
  source-declared measurement period, and recorded query windows separately.
- M02 renders source-specific classification: no accepted Metric selection means
  no classified CORE/WIDE claim; accepted selections show their actual calculation
  statuses, not the older unclassified result's blocked statuses.
- M13 links the original Metric package/content/manifest, preparation, source file
  digests and selected classification receipts. Hashes prove integrity, not truth.
- Query windows are grouped by provider, operation and quick-search/collection.
  Repeated windows remain multiple captures, not extra periods. Credit checks do
  not enter period coverage. No min/max bounding span is called measured coverage.
- Listing-selection dates do not constrain review dates. Metric classification
  does not propagate to Kalodata or reviews. No cross-source sum or join is added.
- Market renderer is v10; Insight stays v9 and does not receive this new projection.
  Existing saved reports remain read from their retained artifacts.
- No schema, migration, provider call, business approval, commit or deployment.

## Actual retained evidence

Replayed the original frozen start/scope and original response bytes, not numbers
from a finished report. The audit database was opened read-only/query-only;
Foundation method packages were written only into a new private scratch database.
The response transport is an offline queue and rejects any unretained request.

Both thermos and fan independently produced:

- 41 retained exchanges: 39 detail responses and two account-balance responses;
- 3 selected products, no selected peers; 13 query windows per product;
- M05: 78 located literal observations; M06: 39 located source records;
- M07: unranked inventory, not a peer comparison;
- M09: 3 deduplicated source-declared launch-date statements, not causal drivers;
- 78 quote inventory records, with zero eligible pack/item/100g operations because
  the required exact quote/variant/pack/mass bindings are absent;
- exact method read replay with zero database mutations.

The original jelly run selected no product and retained no COLLECTION captures.
It is explicitly missing, not replaced by quick-search or a later review package.
The later exact-listing review evidence is a separate source version to bind.

All 88 inspected source artifacts and the original database remained byte-identical.
There were zero source-provider/model calls and zero live runtime writes.

The initial helper failed because it parsed a GET's absent body as JSON; the
provider's transport correctly treated that thrown assertion as a transport error.
The helper now compares null bodies and method explicitly and records request
assertion errors outside the transport catch. No production guard was weakened.

## Verification and independent audit

- Linux root typecheck passed.
- Report unit + persisted Metric report owner: 12 passed, 1 optional PDF skip.
- The skipped PDF test was then run explicitly with Linux Chromium: 1/1 passed,
  two independent synthetic PDFs. This is export behavior, not real PDF visual acceptance.
- Updated existing three-industry classified API journey: 1 passed in 108.39 s.
  It verifies selected classification statuses/receipts and unchanged historical
  report reads, alongside its existing arithmetic and no-extra-model assertions.
- Real retained-source browser preview: thermos/fan, desktop 1440×1000 and mobile
  390×844. All four views passed; M02 disclosure works by keyboard, shows 13
  windows/39 captures, M13 anchor works, no page errors or document overflow.
  GPT inspected desktop and mobile screenshots. No visual redesign.
- ZCode GLM-5.3-Flash high, session `sess_f6d9a90e-af97-4beb-b8c0-8fe1faaa921a`,
  returned no concrete findings in the two-file projection/integration review.
  It did not audit the whole tree or service verification. GPT audited integration.
- Claude's preceding task hit its session quota; it is not recorded as completed
  implementation or independent approval. GPT performed this bounded task.

Private evidence outside Git under `artifacts/research-execution-20261003/`:
`replay-real-methods.mjs`, final `real-method-replay-final-receipt.json`, and
`real-scope-preview-nNdJTH/`. Fedora replay runs are `real-method-replay-YSgz6B`
(preview input) and `real-method-replay-dsE81q` (final stricter request checks).
These are distinct scratch package identities over the same original evidence.
Final replay receipt SHA-256:
`9866dbc267738f4374daa7a2aee502137b7108a3a4154bc6ebf84462f867038c`.
Browser evidence SHA-256:
`f2adfe5be1d35b7287584dee464b8c4637d74f1eb41f8c556c86b64b832210cb`.

Test-audit: extend the existing report and API owners. New scope test protects
confusing repeated queries with measured coverage; persisted assertions protect
shorter source periods and selected-vs-unclassified receipt projections. No new
test-only production seam. Repository uses node:test; skill's OpenClaw/Vitest
runner references do not apply.

Impeccable clarify and Antislop were used only for scope wording and the existing
reading layout. Evidence gate PASS for the changed surface: source-derived values,
inert text, unchanged palette/fonts, visible keyboard focus, working disclosure
and M13 navigation, desktop/mobile no overflow. This is not final report-design
approval or PDF visual acceptance.

## Remaining work

No section was promoted to full real-data/business acceptance. Next work must
increase analytical output or source eligibility, not polish these disclosures:
bind separate exact-listing review inputs, automate the reviewed coding path,
and obtain actual unit/pack denominators where required. Whole-market totals,
annual measurement compatibility, real corpus acceptance and six final PDFs
remain open. No source is substituted to make a case pass.
