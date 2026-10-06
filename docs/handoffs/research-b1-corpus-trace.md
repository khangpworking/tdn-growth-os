# B1: corpus coverage and exact trace in I03/I17

03/10/2026. Unreleased working tree on `0116091fd5dc0902594f92d969dfb3ee0732c9c8`, PR #110.

## Implemented by GPT

`corpus-trace-projection.ts` now has a production caller in `reports.ts` for
both verified native-source and exact-collection adopted declaration snapshots.
It counts method input rows separately from unique `(sourceSha256, locator)`
records, collapses identical duplicates for record counts, and rejects content
conflicts at the same identity. Included/excluded/unreadable dispositions stay
distinct. Candidate/item counts are separate from unique affected records;
admitted/pending/blocked groups may overlap and are never summed as people.

I03 displays coverage and per-family counts with links to the existing sections.
I17 retains exact source hashes/locators, source words, dates, dispositions and
coding counts, plus method/projection/policy references. Native raw quote output
uses this shared trace; exact-collection reports also keep the complete original
collection table, including quarantined and conflicting evidence. No source
author identifiers are added. Free text is escaped, not claimed PII-free.

Only newly rendered report HTML changes. The owning retained-artifact readers
and existing semantic completion counters are unchanged. Declared source words
do not become authenticated OWNER approval, final Insight, corpus ratios or
customer counts. I03/I17 remain partial context/trace, not complete analysis.

## Verification

All execution was on Fedora scratch
`~/.cache/tdn-p1-isolation-20261003-ZVXHsB`, not the operator database.

- Final Linux TypeScript check: PASS.
- Native/exact-review integration suites: 27 PASS. Existing journeys now verify
  the rendered coverage/trace, retained quarantined evidence, safe quotes,
  read-only replay and no repeat collection. No new duplicate end-to-end suite.
- Final projection + report + three-case synthetic preview group: 13 PASS,
  one optional Chromium unit test skipped because its environment flag was absent.
- Chromium desktop 1440×1000 and mobile 390×844: I03 section links and keyboard
  disclosure/focus work; I17 has all three synthetic records; no page errors or
  document-wide horizontal overflow. Tables retain explicit horizontal regions.
- Visual inspection of I03 desktop and I17 mobile: approved report typography,
  palette and reading layout preserved; this is not final design acceptance.
- `git diff --check`: PASS at this checkpoint.

Untracked external evidence:
`artifacts/research-execution-20261003/b1-corpus/` in the coordinating workspace
contains four screenshots and browser evidence JSON. Source code and all new
test inputs are synthetic. No model/data-provider calls were used for validation.

The first test fixture incorrectly expected the literal parser to emit a blocked
candidate for a conditional sentence; it emits pending without that candidate.
The pure accounting test now supplies explicit admitted/pending/blocked inputs,
while the existing persisted integration tests own actual parser/adoption proof.
No production parser or policy was changed to satisfy the test.

## Coordination and remaining work

Claude job `task-musl6w4c-btkzmf` ended at quota with no code. ZCode's one bounded
15-minute edit invocation ended with `ZCode task exceeded 900000 ms`, no returned
session ID or edited files. Neither worker result is counted as implementation.
GPT took over the corpus slice after both terminal outcomes were verified.

B1-A Metric rule adoption/assignment receipts and their classified report
revision remain open. Business clarification allows two separate OWNER actions;
it does not adopt actual J/T/F rules or labels. After this integration checkpoint,
prioritize that executable acceptance path and shared method families, not more
I03/I17 metadata or M01/I14 polish. No full release check, real-data acceptance,
commit, push, merge, deployment or operator restart occurred.
