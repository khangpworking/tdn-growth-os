# B2: source-bound Insight coding owner

Date: 04/10/2026. Unreleased worktree on baseline
`0116091fd5dc0902594f92d969dfb3ee0732c9c8`, draft PR #110.

## Delivered and boundaries

Claude added `readInsightSourceContext` by factoring the existing verified
report reader. It requires an explicit historical pair and retains exact native
or located-v2 package identity, source input, scope and report digests. Fallback
and KEEP dependencies go through existing verified readers. A proposal-only v1
source cannot be substituted for an adopted literal snapshot. Existing
`readReport` output is unchanged. No source collection is performed on reads.

GPT added the closed `automation-insight-coding` contract and analysis-owned
`AutomationInsightCoding`, wired through `ResearchAutomationService`:

- separate trusted OWNER rule/codebook adoption, proposal and selected receipt;
- exact source binding and immutable artifact/SQL replay;
- sequential proposal replacement with exact predecessor, no silent acceptance
  inheritance; new selections of superseded proposals are rejected;
- exact historical retries return original evidence without database changes;
- selected receipts explicitly name the proposal digest; combined batches
  deduplicate indexes without deleting any source records or corpus members;
- existing `validateLocatedInsightInput` and `projectSelectedInsightCandidates`
  own source spans, relations, coding rules and calculations, not new formulas;
- unselected remains pending, and incomplete dispositions still block ratios;
- accepted self-reports remain declarations, never independently observed facts;
- only exact committed artifacts are published; authorized exact retry may
  restore missing registered bytes, never overwrite corrupt existing content.

Migration 0045 adds one Insight-specific immutable evidence table. It is not a
generic approval engine, report ledger or authority for other modules. All prior
migration files were left unchanged. No live database was migrated.

## Verification

Linux scratch, Node 24.15.0: contract generation and root typecheck passed.
Affected reader/owner and migration suites: **118/118 PASS**, including:

- three synthetic products through actual persisted source -> adoption ->
  proposal -> partial receipt -> complete receipt -> four-family calculation;
- full N=3 retained, partial ratio absent, complete literal n/N=2/3;
- exact source quotes, qualifiers/counterevidence and source records preserved;
- changed input binding, forged quote and superseded selection rejected;
- historical exact retry, no new collection, unchanged old report bytes;
- query-only reopened evidence resolution and exact missing-artifact recovery;
- native and located source context across historical/KEEP/oversized reports;
- v44->v45 migration and idempotent rerun with prior lineage/ledger unchanged.

The calculation-only helper had a separate earlier 17/17 focused check and
independent audit. Independent review of the new persistence owner found no
material defect in exact binding, stale/retry behavior, selection, immutable
storage and source replay. Its important limit: OWNER is trusted caller context
at this application-service boundary, not an HTTP authentication implementation.
No end-to-end authenticated approval is claimed until the OWNER API is wired and
tested. No Windows project checks were run. Linux evidence is retained
outside Git in `artifacts/research-execution-20261003/insight-coding-linux-tests.log`
under the coordinator workspace, not in this repository.

## Still required before calling these sections automated

1. Preserve the reviewed owner boundary; expose it only through the existing
   authenticated OWNER server, never user-supplied actor/role fields.
2. Report revision and historical read integration is now implemented (checkpoint
   below). Extend its proof through the authenticated HTTP and browser path.
3. Expose closed OWNER/read API contracts and source-span selection UI. Backend
   service methods alone do not make the workflow usable from the browser.
4. The existing located section renderer now displays I06/I09/I10/I13 with
   pointers and pending coverage. Browser/print finish evidence is still being
   gathered; partial method output is not a completed analytical section.
5. Real codebook/assignment acceptance and the same-version three-product web
   and two-PDF checks remain open. Synthetic product titles are not real coding.

No commit, merge, deployment, live business decision or paid provider call.

## Report integration checkpoint

The closed `automation-insight-report-revision-v1` request names the exact
previous pair, proposal and explicit receipt set; both source choices are KEEP.
New admission requires the current proposal/rule and exact source pair. The
queued request freezes its selection: subsequent proposal edits do not replace
it. Historical reads and retries do not require that old proposal to be current.

The service owns the snapshot, strips presentation-adapter copies and recomputes
the exact selected output from verified immutable evidence on replay. It checks
the retained source package/input/scope as well as receipt and proposal hashes.
The snapshot follows KEEP revisions; changing/skipping the source ends that
inheritance. Existing report pair/attempt storage is reused, with no migration.
New Insight-selection revisions retain the previous I14 execution without a
model dispatch. They leave the Market output unchanged. Oversized selected output
fails the existing bound; it is not silently truncated or relabelled complete.

Claude changed only `reports.ts` and its renderer test. GPT audited, integrated
and fixed a confirmed zero-versus-missing rendering defect: a complete 0/3 is
usable method output, not missing evidence. Source text stays inert and declared
coding remains distinct from independently verified observation. I03/I17 show
selection trace without upgrading the underlying source.

Linux scratch checks: generation/typecheck PASS; final affected suite **46 PASS,
1 SKIP** (Chromium export test without its opt-in environment). The renderer
regression failed on I10's verified-zero state before the fix and passes after.
Three synthetic products exercise persisted source, selections, report creation,
old-report replay, stale rejection, immutable retry and source KEEP/SKIP. Original
Market bytes and the retained AI execution rows stay unchanged for selection
revision. A damaged receipt blocks report reads and exact revision retry.

ZCode completed the bounded contract review. Its suggestion to require current
proposals during all historical resolution was rejected: that would invalidate
old reports. The longer integration review timed out at 180 seconds and supplies
no review approval. GPT remains responsible for code audit. No claim is made
that long ZCode coding jobs are now timeout-free.

## Synthetic browser and PDF checkpoint

Linux Chromium rendered the persisted synthetic three-case reports into six
separate PDFs, Market and Insight for each case. Desktop 1440x1000 and mobile
390x844 checks recorded no whole-page overflow or page errors; disclosure,
I06-to-I17 links, keyboard focus and horizontal table scrolling worked. The
report copy now distinguishes a selected receipt from verified source provenance
and explains narrow-screen table scrolling. The focused persisted journey and
renderer check passed (5 tests including child cases); this is overlapping
evidence, not five new independent features.

Visual review of the sampled PDF pages found orphan table headers and excessive
blank space. Vietnamese text and sampled content remained readable, but print
quality is not approved. The diagnostic preview expands every disclosure and
has 14 Market / 46 Insight pages per synthetic case; page count is not a content
completion metric. Evidence remains outside Git under
`artifacts/research-execution-20261003/insight-coding-preview/` in the coordinator
workspace. No real-source acceptance, final Claude design approval, release or
deployment is claimed. HTTP and browser approval controls remain a separate
integration checkpoint.

## HTTP and browser-client checkpoint

Claude completed the six assigned backend/contract/test files. GPT reviewed the
actual diff, added precompiled browser validators, integrated the Insight revision
request into the existing client, and added focused client transport coverage.
ZCode's bounded read completed, but its client implementation timed out at
420 seconds after writing a file. GPT took ownership of that unfinished file;
no successful coding handoff from ZCode is claimed.

- GET exact pair coding history verifies every immutable item and full source
  context, excludes actor identity, preserves all kinds and rejects over-limit
  histories instead of truncating. GPT moved the byte-bound check into assembly
  so it rejects before accumulating the complete oversized history.
- Three POST OWNER routes reuse authentication, exact Origin and closed domain
  requests, with trusted server actor and no automatic report/provider dispatch.
  Only these routes use the 8 MiB coding request limit. Other limits stay unchanged.
- New writes return 201; verified retry returns 200. Source/pair conflicts,
  caller input errors and generic stored-integrity failures remain distinct.
- The client preserves caller snapshots and exact selected receipt IDs, rejects
  mismatched response bindings/kinds/retry states and never retries an ambiguous
  mutation automatically. No persistent token storage or new UI controls.

Linux evidence: generation and root typecheck PASS; affected HTTP/exact/native/
renderer group **48 PASS, 1 optional PDF skip**. After the final byte-bound audit
change, root typecheck and the primary HTTP journey passed again. Frontend
typecheck/build and client/revision **7/7 PASS**. Initial client typecheck exposed
missing validator declarations; GPT added them. A distinct wrong-request-kind
client regression reproduced a TypeError on the pre-fix code, then passed after
validation/discriminant ordering was repaired. No assertions were weakened.
Vite still warns about the existing large application chunk; no full-release or
performance acceptance is claimed.

Logs: `tdn-b2-http-validation.log`, `tdn-b2-client-validation.log`,
`tdn-b2-client-red.log`, and `tdn-b2-http-final.log`, retained outside Git in the
coordinator's `artifacts/research-execution-20261003/` folder. The temporary Linux
preview test was removed after PDF capture to prevent duplicate suite execution;
the preview source and artifacts remain recoverable in the coordinator folder.

Remaining: span/relation/codebook UI, final report design/print acceptance, real
accepted coding and same-version three-product acceptance. This is authenticated
transport integration, not completed analysis of I06/I09/I10/I13 or all 30 sections.
