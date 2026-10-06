# Supplemental source transport and run isolation

Date: 2026-10-04. Unreleased dirty tree on baseline `0116091`.
Plan v2.4 R1, sections M08/M10/I11/I12/I16. This is a source path, not completed analysis.

## Integration

- New `POST /owner-api/workspaces/:workspaceId/research-automation/runs/:runId/sources/supplemental` uses the existing OWNER authentication and exact Origin gates before reading the multipart body.
- Closed metadata, one `file:<logicalPath>` part per declared file. Maximum 16 files, 8 MiB each, 32 MiB total. Multipart filenames never become filesystem paths.
- The service binds to the persisted start and confirmed scope. New preparation is allowed after the original draft pair exists. Exact retained requests can replay without creating more package rows.
- Upload calls the Foundation package owner through the request-scoped artifact store. It does not wake collection or revision workers, mutate the current run, create a report, authenticate a provider or approve evidence.
- A browser client captures an immutable metadata/file snapshot, sends once, validates the closed receipt and checks SHA-256, exact byte size and media type for every uploaded file. An ambiguous transport failure is surfaced, not retried automatically. Explicit revision admission remains a separate action.
- Reloadable inventory/context work is being completed by Claude. The form/picker is still pending; the client alone is not a usable UI.

## Independent integration finding

The new upload origin was run-bound, but the existing quote/bounded revision
reader only verified the selected package's exact bytes. An attachment from
run A could consequently be selected by run B. The regression used a real
authenticated HTTP upload followed by a second confirmed run: before the fix,
the foreign-source revision returned **202**, where rejection was required.

The service now checks attachment-origin binding before revision admission,
worker method execution and historical source replay. Prepared supplemental
keys must also match the run and method family. Missing origin on a prepared
package fails integrity verification. Existing manual packages without an
attachment origin retain their explicit-selection behavior. No canonical
method contract or Foundation schema was changed.

## Verification recorded so far

All execution below was on disposable Linux scratch, not Windows or the live operator.

- Contract generation and backend typecheck: PASS.
- Persisted intake owner: 1/1 PASS (quote and bounded, invalid inputs, exact retry, source replay).
- HTTP supplemental tests after isolation repair: 2/2 PASS, including the RED-before/GREEN-after foreign-run regression.
- Existing quote/bounded revision owners: 2/2 PASS, including literal arithmetic, explicit source lifecycle and historical replay.
- Frontend typecheck and transport/related suite: 20/20 PASS. This covers multipart snapshots, response mismatches and no automatic retry; it is not a browser layout check.
- Expanded same-run upload-to-new-pair journey and full API suite: 13/13 PASS on Linux. The old report bytes remain unchanged, exact retry returns the retained pair, and a foreign-run source is rejected.
- Claude delivered persisted context and inventory; GPT added GET inventory and the reload client. Those final changes have not yet been synchronized and verified together on Linux.
- UI/browser/PDF acceptance and real-source acceptance: pending. Work is paused at the owner's request on 2026-10-04; preserve the current tree and resume with the final inventory integration check.

Do not add overlapping suite counts into a completion score. The existing
business methods still decide source suitability, and missing native price,
pack/variant, time series or approved labels remain missing.

## Worker evidence and limits

Claude implemented the first intake owner and is completing persisted context
and inventory. GPT integrated transport/service/client and independently found
and repaired the cross-run admission gap. ZCode GLM-5.3-Flash high was dispatched
for a narrow read-only HTTP audit, but the process ended with
`ZCode task exceeded 240000 ms`; no findings or review pass were obtained.
It was not restarted blindly. JEV was not used for deterministic origin checks.

No live database, credentials, provider calls, migrations, merge or deployment
were part of this integration work. Source/model probes are documented separately.
