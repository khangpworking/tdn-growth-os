# Insight model proposals: whole-corpus UI

Checkpoint: 2026-10-04, uncommitted work on `fix/research-real-world-audit`.
Plan items: P4.4/P4.5/P6.1, benefiting I02/I04/I05/I06/I07/I08/I09/I10/I13.
This is a synthetic technical acceptance, not a real-model quality result,
business approval, Fedora activation or completion of those nine sections.

## User-visible delivery

The existing Insight coding panel can explicitly request model proposals for
every INCLUDED record with text. Original record indexes are retained. Batches
contain at most 100 records, execute sequentially and chain from the exact
verified predecessor. Excluded, unreadable and missing-text records are counted
separately rather than silently shrinking the corpus denominator.

A confirmation freezes the source/rule/predecessor/batches and warns about
possible cost, replaced rows in the new proposal and the need for review.
There is no automatic start, acceptance, report creation or automatic retry.
Users can stop after the current batch or interrupt waiting for its response.
Neither action rolls back a server write. Results open in the existing proposal
review, including records the model left uncoded.

Ambiguous HTTP outcomes, failed or mismatched read-back, PREPARED and conflicts
hold the exact request key/body. An explicit retry sends only that batch;
continuation needs another confirmation. Server-retained INVALID/UNKNOWN are
distinguished from an HTTP response that was lost. The UI warns that another
identity may incur another charge. Held requests are memory-only; reload loses
the local plan and never resumes it automatically.

## Ownership and audit corrections

Claude wrote `insight-model-batches.ts`, `InsightModelProposalPanel.tsx`, the
parent integration, two local CSS rules, the surface brief and mounted tests.
GPT inspected the owning client/backend retry order and audited the UI.

1. Mismatched read-back originally discarded the exact request. The mounted
   `readback-mismatch` case failed before the fix (missing exact-retry action),
   then passed after the panel retained the body. No new request is sent
   automatically after an integrity mismatch.
2. Chromium showed Escape cancellation lost the opener focus because opening
   the modal disabled the button before the shared dialog captured it. The
   panel now captures the opener before opening and restores it after cancel.
   The browser assertion failed before the fix and passed after it on desktop
   and mobile. The shared ConfirmDialog is unchanged.

## Verification actually run

- Linux mounted/client owner group: 17/17 PASS after both corrections.
- Linux frontend typecheck and production build: PASS. Vite still warns about
  an existing main bundle above 500 kB; this is not a performance benchmark.
- Chromium synthetic journey: 1440x1000 and emulated 390x844, reduced motion.
  250 source records, 240 eligible in 100/100/40 batches, five excluded and five
  unreadable. Four HTTP submissions include one exact retry; three synthetic
  model executions. No provider was contacted.
- Opening/cancelling calls nothing; Tab/Shift+Tab stay in the dialog, Escape
  cancels and focus returns. Stop retains the first verified batch. A deliberately
  mismatched second read-back stops the sequence; exact retry preserves its
  request; explicit continuation sends the remaining batch. No automatic
  receipt/report creation, page errors or document horizontal overflow.
- Browser script and receipts are outside Git. Final Fedora scratch evidence:
  `~/.cache/tdn-model-ui-vydC0X/evidence.json`.
  Screenshots copied to `.impeccable/review/insight-model/` for finish review.
- Impeccable detector: no new panel finding; six advisory findings in inherited
  CSS values. No design-system rewrite or new assets were introduced.
- Independent fresh finish review: SHIP for this local extension; all six
  desktop/mobile captures inspected, no material fixes. A fresh GPT 6.1 Sol high
  reviewer substituted for the unavailable shipped custom agent. Empty/loading
  states were inspected in source, not claimed as additional browser captures.
  The inherited design and sidecar remain unchanged. This is not Claude's final
  Market/Insight report-design approval or the owner's report acceptance.

Browser requests used synthetic route fixtures, not the production HTTP server.
Backend/model execution has separate evidence in the
[runtime/API handoff](research-insight-model-runtime-api.md). This UI evidence
must not be relabelled as a real paid-call benchmark or end-to-end deployment.

## Remaining

Real-source/model rubric, approved coding on real corpora,
report-content/web/PDF acceptance on the three cases, release CI and deployment
are still open. No business labels were approved, credentials accessed, live
database changed, migration run, or provider/model call made for this slice.
