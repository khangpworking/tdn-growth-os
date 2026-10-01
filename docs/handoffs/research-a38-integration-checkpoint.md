# A38/A39 integrated delivery: draft PR handoff

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

## Validation and evidence

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

Code head: `8ede53df54c18ed31c6761b422651403f97c0de2`.

- [Linux Check](https://github.com/khangpworking/tdn-growth-os/actions/runs/36727007911):
  PASS, 621/621 backend and 176/176 frontend tests, strict typechecks, generated
  contract drift verification and production frontend build.
- [Linux preview](https://github.com/khangpworking/tdn-growth-os/actions/runs/36727007917):
  PASS. The actual retained synthetic report and legacy report were exported.
  Both 1440 px and 390 px captures were inspected. The prepared report has no
  horizontal page overflow, 267 verified interactions per viewport, visible
  keyboard focus, no browser errors and minimum measured text contrast 5.64:1.
- The initial preview run caught a helper defect: the center of a wrapped
  inline link's bounding box was whitespace. The helper now clicks an actual
  text-fragment hit region; navigation and exact downloaded bytes are still
  asserted. No product assertion was removed or weakened.
- Synthetic prepared HTML SHA-256 from that preview:
  `39de09bb5dd80143edc006725eaeb3af9af55b4badee6c6d8f30ec52f6e8bfc8`.
  The CI artifact is `research-report-synthetic-preview`, directory `assembly`.
  It includes the report, exact evidence downloads, screenshots and machine
  readable interaction/visual evidence. Source identities are freshly created
  synthetic fixture identities, so a new fixture run is not the same pinned
  input package. Within one retained version, retries and byte replay are exact.
- Impeccable static detector: no findings on the new wrapper. Antislop design
  gate: `docs/handoffs/research-a38-design-gate.md`. Two visual inspection rounds
  used Linux-generated evidence, not a Windows runtime.
- Independent static re-review: no remaining blockers in exact source binding,
  ordinary reader reopening, staged artifact cleanup/recovery or navigation.
- No Windows test, build or typecheck was run. Local contract code generation
  and Git whitespace checks ran; Linux is authoritative for execution.

## Remaining boundaries and next step

PR #100 is open/draft and stacked on the A37 branch. Complete owner review and
the prerequisite stack integration before merge. No merge or deployment is
included. The command is a prepared-input CLI, not a new operator create form.
New prepared-profile AI interpretation remains deferred. Real-input acceptance
has not run. M08/P4 needs exact supplementary quote inputs; the other missing
business inputs and methods are still blockers, not invented content.

The sample has seven partial materializations and 23 without output; none is
declared a complete business section. Six partial paths remain when the quote
input is absent. No new business-method approval was inferred from CI success.

No merge, deployment, applied migration change, new dependency, provider call,
real-data mutation or business approval is authorized by this checkpoint.
