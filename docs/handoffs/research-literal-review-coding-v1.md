# Literal review diagnostics: implementation handoff

Date: 2026-10-02. Base checkpoint: `53538fc095ffd092e5f36647b2098ed9c11398bb`,
existing draft PR #110. Working-tree changes are not a merged or deployed release.

Claude implemented the initial parser, JSON phrase table and synthetic unit
tests. Its task stopped on session quota before handoff. GPT took over and
audited code, integrated private diagnostic retention, and implemented the
business review amendments. No Claude completion or approval is claimed.

## Boundaries and delivered behavior

- Structural review admission preserves exact source locators, conflicting
  versions, duplicates and excluded/unreadable rows. No inferred reviewer IDs.
- The pure parser declares rule-generated candidates with exact original UTF-16
  spans and pending states. It does not call AI/providers, use the clock or
  infer category membership, review dates, motive or prevalence.
- `v1-proposal-2` / `literal-review-parser-v2` follows the conservative defaults
  from business turn `01a0fd00-e465-7521-bf1a-234c4580e613`. The final bounded
  grammar received exact-byte ACCEPT in turn
  `01a0fd27-d346-7531-9bdd-b98b5986631f`; see the
  [scoped receipt](research-literal-grammar-review-20261002.md). NOT_REPORTED is disabled, quoted/conditional
  speech remains pending, negated attitudes are not flipped, bare `nên` is not
  causal, and barriers need an explicit same-task attempted inability.
- The automation bridge retains corpus, rule JSON, semantics brief, parser
  source, authority files, input, output and output schema in a real immutable
  SourcePackage. Package `sourceAcquiredAt` stays null rather than borrowing
  scope-confirmation time. Generated candidates remain **unadopted diagnostics**.
- The report freezes that diagnostic identity. Historical reads verify the
  retained schema/output and exact Foundation source without running today's
  parser, rule file, clock or provider. All report annotation arrays remain empty.
- Insight shows that diagnostics are not findings. Failure in this method does
  not erase raw evidence or the independent Market report. Oversized content
  retains the existing bounded-report fallback.
- A terminal failed Actor with zero rows is FAILED, not successful empty data;
  returned rows from a failed Actor remain retained and labelled partial. No
  automatic paid recollection occurs. The report tells the reader what failed.

## Verification to date

Linux Node 24.15.0, isolated checkout and private synthetic stores only:

- Focused parser, package extension and automation integration: **16/16 PASS**.
- Repository strict TypeScript: **PASS**.
- Regression RED: quoted `Tôi đã dùng` was falsely SELF_REPORTED before the
  quote guard; numeric `1 kg` suppressed valid action before contextual handling;
  conditional recognized verbs produced NOT_REPORTED before the amendment.
- GREEN retains existing source-conservation and exact-span checks. Changed
  proposal-1 expectations follow the cited semantic change, not CI weakening.
- An independent GPT 6.1 Sol high audit found an actor bypass in inability
  clauses. RED reproduced false barriers for a child, an unrecognized name and
  changed hearsay scope; the fix resolves subjects before FAILURE and shares
  compatible-actor checks between I04 and I08. The final table also covers
  singular/plural self-subject drift and an explicit same-actor positive case.
  Static re-review closed the finding. Final focused suite: **16/16 PASS**;
  final strict TypeScript: **PASS**.
- Business re-review then returned three further AMEND items in turn
  `01a0fd1d-6deb-7480-ba9e-5ae1c92a308e`: I05 advice after bare `nên`, I08
  equal verbs with different task objects, and I07 crossing an intervening
  contrast to another choice. Each was reproduced RED and repaired at the
  owning grammar; the 5-test coding suite passed after repair. The new exact
  tuple was subsequently ACCEPTED within that receipt's stated limits.
- A full Linux repository check on that accepted grammar tuple passed
  **845 backend tests, 0 failed, 1 skipped** (846 total), **196 frontend tests**,
  production build, contract generation and both typechecks. This is local
  Linux proof, not published-head CI or final-byte proof for later extraction.
- Two isolated synthetic service/Chromium journeys exported independent Market
  and Insight HTML/PDFs. Normal and terminal-failed Actor cases passed desktop
  1440px/mobile 390px overflow checks, source-quote escaping and read replay
  without provider calls or database mutations. The failed-Actor case verifies
  the unadopted diagnostic snapshot, empty report annotation arrays and failure
  guidance. No analytical section completion is claimed.
- Root visually inspected the desktop/mobile I03 screenshots. The added
  notices retain the approved type/color/layout and distinguish method proposal,
  source failure and coverage. Impeccable's static detector reported one
  unchanged advisory (`font-size:26px` outside the documented type ramp), not a
  new style defect. These are acceptance checks, not Claude's final design
  approval or an all-interactions accessibility audit.
- No Windows tests, typecheck, build or browser execution.

The test-audit authoring gate chose the pure coding boundary for grammar
regressions and the actual automation service for failed-source/report replay;
there are no new test-only production exports or source-text assertions.

Private synthetic proof directories on Fedora:
`/home/pkhang/.cache/tdn-content-slice-20261002-D2sz8L/synthetic-paired-reports-D3XV7u`
and `synthetic-paired-reports-nskh3D` under the same parent. They contain
synthetic databases, outputs and screenshots, not real provider evidence.
No generated output or private review text is committed.

## Outstanding, not disguised as completion

1. Separately pinned candidate admission/render policy. The accepted grammar
   does not automatically activate report annotations or certify accuracy.
2. Production automation intake for the genuine Dami SourcePackage adapter.
   Its private separate source holds 62 raw rows and 20 readable exact-listing
   comments; diagnostic retention is verified, but no Zen collection or
   completed report is invented.
3. System-owned Shopee discovery/selection for thermos and fan.
4. Market field meanings/annual additivity and the missing Metric primary source.
5. Real useful section contents, paired PDF/web acceptance, Claude design review
   and owner report approval. Tests passing does not complete 30 sections.

Source/cost evidence: [source inventory](research-source-inventory-20261002.md).
The two controlled Actor starts reported USD 0.013 in total. No migration,
dependency change, active runtime mutation, merge or deployment occurred.

## Implemented extraction and genuine SourcePackage review adapter

Independent inspection confirmed that the Zen collection contract cannot
truthfully represent Dami. The implemented adapter uses a shared
production located-record coding boundary, with the existing corpus adapter
preserving its current output and a SourcePackage adapter verifying exact
package/descriptor identity through `buildPackageLocatedInsightExtension`.
This uses the existing Located contract and Foundation ledger, not fabricated
collection IDs, a second source ledger or duplicate semantic schemas.

The adapter verifies the original package/descriptor through the existing
Located reader and preserves source digests, pointers, original text,
dispositions and date strings. It rejects pre-annotated descriptors rather than
silently admitting imported codes. It prepares proposal-only files without
database writes; the caller uses the existing SourcePackageService for intake.
Native capture dependencies remain original, not projected into Zen IDs.

The extracted parser SHA-256 is
`1eae3adc45fcb7190dcdb543e9bb55c01388c175dfe64f54dd3ba09acfbfbc2b`;
adapter SHA-256 is
`10a376b346e0354625803c69f1591e0c8aa8b80cbd5488cb44a62656b43449ba`.
Rules and semantics are unchanged. Four real Foundation synthetic-corpus
comparisons against the preserved ACCEPTED parser produced identical output
bytes: 26 grammar cases, empty output, exclusion/unreadable/missing-ID rows and
duplicate/conflicting identities. This is representative refactor evidence,
not exhaustive semantic certification. The final adapter-focused owner/sibling
suite passed **18/18** and strict TypeScript passed on Linux.

The complete check after extraction also passed on isolated Fedora:
**847 backend passed, 0 failed, 1 skipped** (848 total), **196 frontend passed**,
contract generation, both typechecks and production build. Independent
GPT 6.1 Sol high static review found no blocking finding in this scope. It
explicitly did not certify admission, accuracy, source authenticity or report
completion. The new adapter is not yet a production automation caller.

Private Dami v2 execution retained a separate immutable diagnostic package.
It preserved 62 records, 20 included original date strings and zero report
annotations. There are one I04 candidate (with pending) and three I05 spans
across two records; the other families remain pending. These are diagnostic
declarations, not unique people, prevalence, accuracy or completed sections.
Exact retry added zero mutations; the original package remained unchanged;
no new provider call or live runtime write occurred. See the source inventory
for retained digests. Production automation wiring and admission remain open.

Retained TypeScript alone is not a promise of reproducible execution without
its runtime/dependency closure. Frozen display must verify retained bytes,
not rerun the current coder.
