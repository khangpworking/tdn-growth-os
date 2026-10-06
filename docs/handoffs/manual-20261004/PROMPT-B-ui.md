# Assignment B: supplemental source upload and selection in the existing UI

First read:

`C:/Users/Admin/Documents/Codex/2026-08-27/cou/work/research-automation-v1/docs/handoffs/manual-20261004/COMMON.md`

Work only on B in that repository. Read `manual-A-result.md` in this directory before implementation. A must have delivered READY_FOR_UI with checked final contract/client hashes. If that file is absent or incomplete, you may inspect the existing design and propose a component plan, but do not claim backend availability or execute an unverified upload journey. Do not independently redo A.

## Outcome

Let an operator upload a supported prepared package, rediscover it after reload, explicitly select it, and request a new report pair through the existing revision API. This should remove the UI blocker for M08 and bounded methods M10/I11/I12/I16, without promising analytical results that the supplied evidence does not support.

Read:

- `DESIGN.md`
- `docs/frontend/research-source-intake-surface.md`
- `docs/frontend/research-report-versions-surface.md`
- `docs/handoffs/research-supplemental-source-intake.md`
- `docs/handoffs/research-supplemental-method-client.md`
- Current `ReportVersionsPanel.tsx`, `MetricSourcePanel.tsx`, existing ConfirmDialog, revision client and supplemental client.

Use the established React/TypeScript/native control patterns. The owner approved the current design and Antislop during implementation; this is a narrow form extension. Use Impeccable if available and document what actually ran. Preserve the approved report design.

## Owned paths

- New `frontend/src/research-automation/SupplementalSourcePanel.tsx` and a narrowly scoped CSS file if needed.
- `frontend/src/research-automation/ReportVersionsPanel.tsx`.
- New `frontend/tests/research-supplemental-source-ui.test.ts`.
- Your own result handoff and a focused new surface note/screenshots.

Backend, schemas/generators, source client `api.ts`, revision client and shared status remain owned elsewhere. If an existing client has a genuine missing behavior, report the necessary hunk to A/coordinator rather than silently editing it. Do not add a combined revision contract.

## Required behavior

1. Read prepared inventory using `loadPreparedSupplementalSources`; show source labels, family, operator-supplied status and time in understandable Vietnamese. Keep hashes/UUIDs out of the primary controls. Never auto-select the latest package.
2. Upload only formats the current backend supports. Show a concise bundle explanation and validate required files/size before sending. Do not advertise arbitrary PDF/XLSX/text imports as normalized quote/time-series data. Reuse real canonical fixtures to explain expected package shape; do not invent a new parser or infer pack size/price from product titles.
3. Use `prepareSupplementalSource` with a stable hidden request key and immutable metadata/file snapshot. Guard double submission synchronously. After an ambiguous response, allow an explicit retry of the exact original snapshot; do not resend automatically or mix new edits into it. Changing/closing a form or switching run must not allow late results to change another form.
4. After successful upload, reload authoritative inventory and verify the exact returned package appears. Upload stores a source; a distinct action selects it for a new report version. Keep explicit selection and operator-supplied provenance visible.
5. Reuse `createReportRevision`, the exact current predecessor pair and exact IDs/digests/descriptor from the selected inventory entry. Current quote/bounded request contracts keep Metric and native reviews as KEEP and admit only one method family per request. Guide users to a subsequent version for the other family instead of making up a combined request. Confirm semantics from the existing service before claiming a previous family's output is inherited.
6. Use a compact confirmation that captures the immutable request. Block writes when OWNER unavailable/locked, inventory stale, another attempt pending, a predecessor is no longer current, or a request is uncertain. Explain the actionable blocker next to the control.
7. Reload authoritative attempt/version state after success/conflict. Keep explicit viewing of old versions, two web views and two PDF links tied to the selected exact pair. Do not navigate or replace the viewed report implicitly.
8. Include loading/empty/error/failed-integrity states, cancellation semantics, keyboard focus and mobile layout. Never label a stored package as provider verified, accepted analytical content or an automatically completed section.

Vietnamese intent for the main distinction: “Nguồn đã lưu. Chọn nguồn và tạo phiên bản mới để đưa vào báo cáo.” Give practical guidance when no valid package is available. Leave source limits visible without exposing backend plumbing.

## Verification

On disposable Linux, run frontend typecheck/build and the smallest meaningful mounted UI tests. Use the existing jsdom tools; no new dependencies. Cover the new behavior: upload versus admission, reload selection, immutable retry/double submit, stale completion after a run/form switch and one explicit revision with the exact selected package. Do not test private methods or source strings to prove user behavior.

Browser acceptance uses synthetic data and a disposable operator with provider/model execution disabled. Exercise the real upload/list/revision journey at 1440×1000 and 390×844, keyboard confirmation/cancel/focus, empty/loading/error states. Save screenshots and list observed interactions. Do not use the live operator or user's records.

Document checks that were actually run. A UI without Linux/browser verification is PARTIAL, not finished. If only static inspection is possible, state the limitation and hand off reviewable code.

## Handoff

Write `manual-B-result.md`: owned-file delta/hashes, screenshots, observed behaviors/checks, unresolved prerequisites and exact next step. Do not update global completion counts. Stop after handoff; no commit/deploy/provider call or business acceptance.

