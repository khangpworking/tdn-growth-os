# Per-section synthesis activity, 2026-10-04

Scope: P6.1 for M11/M12/I14/I15. This is execution visibility, not analytical
completion, provider billing evidence or live activation.

## Delivered

- The closed run API activity object accepts only present section projections.
  Existing I14-only responses remain valid; decision-only activity is supported.
  Missing sections remain absent, never fabricated as zero calls.
- Each projection comes from its existing retained execution owner after replay
  verification. Read routes perform no dispatch or mutation.
- RunView separates source-collection cost/calls from per-section AI activity.
  Native disclosures show lifecycle counts and unknown billing explicitly.
  Machine-valid responses are not labelled completed analysis or owner approval.
- The approved TDN palette/layout is retained. No new assets, navigation, model
  controls, dependencies, domain authorization or migrations were introduced.

## Verification

Test-audit authoring gate: extended existing run/service/UI test owners, rather
than introducing a duplicate end-to-end fixture. The service proof checks
independent per-section counts and mixed VALID/INVALID/UNKNOWN outcomes; mounted
UI proof covers decision-only, legacy absent, and disclosure behavior. No
assertion was removed or weakened and no test-only production seam was added.

- Linux contract generation, backend and frontend typechecks PASS.
- Affected UI/I14/native-review group: 37/37 PASS.
- Existing API three-industry journey: 1/1 PASS, 110.6 seconds for the case.
  This exercises served contract validation, activity presence/absence and
  preserved replay behavior with synthetic model transport, not real calls.
- Final Linux production frontend build PASS. Existing large-bundle warning
  remains; this checkpoint does not claim a performance optimization.
- Browser confirmation at 1440x1000 and 390x844 PASS: all four sections,
  decision-only three sections, legacy absent activity, error/retry, keyboard
  Enter/Space, click disclosures, visible focus and 44px summary hit areas.
  Five mocked GETs per viewport; no OWNER/provider request, page error or
  horizontal overflow. Actual RunView/styles are used in a labelled synthetic
  preview, not the live operator. Desktop collapsed/mobile expanded inspected.
- Impeccable bounded refinement: first paired inspection found insufficient
  summary target spacing; one CSS correction and one final paired confirmation.
  Detector returned no findings. No final report-design or owner acceptance is
  implied by this app-UI check.

The overlapping test invocations above are not added together and do not replace
a final full release gate. No Windows project tests were run.

Outside-Git evidence: artifacts/research-execution-20261003/
decision-activity-preview/ (screenshots and browser evidence), with the browser
harness beside it. Synthetic data only.

## Next

Return to source/method breadth: source-native M08 inputs and supported
source-neutral evidence for synthesis; no further activity-panel polish.
M11/M12/I15 still admit only narrow I02 use-context support. Real-data acceptance
for three products, final six web/six PDF review and release remain open.
No commit, push, merge, deployment, live database mutation or provider call.
