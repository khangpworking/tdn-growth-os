# M11/M12/I15 explicit operator configuration

04/10/2026. Plan v2.4 P5 integration. Worktree only, not activated on Fedora.

## Implementation

- The existing operator reads separate `TDN_RESEARCH_M11_AI_ENABLED`,
  `TDN_RESEARCH_M12_AI_ENABLED` and `TDN_RESEARCH_I15_AI_ENABLED` flags. Each
  accepts only `true` or `false`; absent/false is off. A model name alone is not
  opt-in. I14 and Content Studio configuration do not enable these sections.
- An enabled section requires its corresponding `TDN_RESEARCH_<section>_AI_MODEL`,
  a configured loopback CLIProxy and OWNER writes. There is no model fallback,
  automatic model-list probe or implicit shared model selection.
- Bounds match the established I14 transport: 16384 output tokens, 300000 ms,
  262144 response text bytes. Temperature is retained as null and not sent.
  These are limits, not a model-availability or output-quality claim.
- The operator passes section configurations through the research API to the
  existing Analysis service. The read-only handle never receives generating
  ports. Missing writer and section/key mismatches fail before database open.
- Section adapters share the existing single-request HTTP implementation,
  including abort, envelope limits, safe errors and escaped-credential checks.
  Each binds its exact closed configuration. A private frozen copy prevents a
  caller from mutating the selected model after transport construction.
- The existing retained execution owner still owns admission, dispatch,
  validation, recovery and replay. No migration, new execution engine, provider
  integration, business authorization or automatic approval was added here.

## Verification scope

Test-audit authoring gate: extend the existing configuration and API-worker test
owners, rather than duplicate the source-to-report journey. New transport proof
protects wrong-section/configuration drift; existing HTTP failure cases remain
the shared transport's owner. No test-only production injection was added.

- Linux root typecheck PASS after correcting a generic typing error.
- Linux transport/configuration suite: 5/5 PASS. All HTTP calls target a
  disposable synthetic loopback server, not the installed CLIProxy.
- API-worker three-industry journey PASS (103.9 seconds). The first fixture has
  an eligible source context and dispatches exactly I14/I15/M11/M12 to the
  synthetic gateway using each configured model. Both Market drafts and the
  Insight strategy condition appear in the served reports. The other two
  fixtures have no eligible context and issue no additional model request.
  Metric classification/replay and query-only reopen preserve the four-call
  count. This is wiring/no-redispatch evidence, not real business acceptance.
- No Windows project test, typecheck or build was run.
- Final Linux root typecheck and affected group PASS: 28/28 across transport,
  decision execution and native-review integration. This overlaps the five
  transport cases above; do not add them together. No full release gate was run.
- Final `git diff --check` PASS. No UI source was edited in this checkpoint;
  design-context inspection does not constitute a UI change or design approval.

## Remaining

- Per-section activity projection and RunView presentation still need to include
  M11/M12/I15; the existing UI only presents I14 activity. Do not infer billing
  from dispatch counts or show an absent activity record as zero provider calls.
- Broader admitted evidence, real-source acceptance, final web/PDF review and
  release remain open. Narrow source-context synthesis is not completion of
  these sections or of the 30-section goal.
- No live configuration was changed. Actual activation still requires the
  release checks and authorized Fedora update.

No commit, push, merge, deployment, live migration, provider call or real-data
write was performed.
