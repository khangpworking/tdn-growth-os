# A38/A39 integrated delivery: verification checkpoint

2026-09-30. Existing draft PR #100, branch
`feature/research-a38-report-assembly-snapshot`.
Starting head: `e47faf7c92f7db9dafb0e8423b1a726fe8099031`.

## Authority and scope

After both Claude production lanes reached quota, the owner explicitly asked
GPT to take over the remaining code. The accepted task remains
`docs/tasks/research-a38-integrated-report-delivery.md`; business methods remain
owned by the framework review session. There is no new business-policy choice.

The delivery reuses seven bounded paths: M02, M03, M04, M08/P4, M13, I03 and I17.
It does not declare seven complete business sections or a completed 30-section
report. Missing inputs remain visible. Output is DRAFT_PARTIAL, interpretation
NONE and review UNREVIEWED. Runtime AI interpretation for the new prepared
profile is not part of this delivery; the historical v1 interpretation path
and its identity rules remain unchanged.

## Implementation

- Closed 30-section assembly snapshot with separate readiness, materialization
  and catalog fallback fields.
- Separate `prepared-report-v1` request/semantic profile reusing the A10 ledger.
- Exact A30 workbook/manifest/labels selection, A31 readiness, A37 returned
  identity and six exact retained member byte artifacts are verified.
- Default owning readers let ordinary ReportVersionService instances reopen
  prepared versions. No read-side migrations or writes are added.
- Actual assembled HTML is retained under the existing `report.html` filename.
  Charts remain before the new expandable status/traceability panels. Missing
  values, observed zero and partial totals have distinct Vietnamese labels.
- The assembly CLI binds the result to queryable normalized rows using the
  existing owning store, matching the established report-creation command.
- Failure cleanup reuses the existing request-owned artifact store, promoted
  to the platform layer with an API compatibility re-export. Private staging
  is removed on failure; publication follows committed-record verification.
  Only exact retries can rebuild genuinely missing members, and only after
  verifying the complete record and membership. Corruption is not overwritten.

## Validation plan and current evidence

Test-audit assigns one primary owner per behavior: snapshot composition, A10
integration/replay, and the CLI/filesystem boundary. Existing arithmetic tests
remain authoritative. Tests use a real synthetic A30-through-A37 preparation;
one retained JSON member is deliberately noncanonical to prove exact-byte
retention. No real report, review or provider output is used.

The independent static review identified normalized-origin binding and failed
artifact cleanup. Targeted static re-review found both repairs addressed, with
no remaining blocker. This is not an execution result. Linux CI runs the full
repository check for this batch because shared registration files changed.
The preview job exports the actual retained report, captures desktop/mobile,
checks browser interactions and retains only synthetic visual evidence.

At this checkpoint, no Linux execution result is claimed. No Windows test,
build or typecheck was run. Static whitespace checks passed; the new HTML
wrapper's Impeccable detector returned no findings, which is not visual
acceptance. Final CI and screenshot inspection remain required.

No merge, deployment, applied migration change, new dependency, provider call,
real-data mutation or business approval is authorized by this checkpoint.
