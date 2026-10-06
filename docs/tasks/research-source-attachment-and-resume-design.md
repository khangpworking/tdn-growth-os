# P1.3 / P1.5a: source attachment and bounded report revision

Status: amended implementation design after Claude review
`review-murx57r7-f1vwnz`, 2026-10-03. The first proposal was NOT approved.
The owner approved bind-at-confirm plus explicit late-source revisions on
2026-10-03. This approves the timing policy, not unimplemented contracts or a release.
The Foundation origin slice (0039) and internal Analysis confirmation/source-set
slice (0040) are implemented with focused Linux proof. Additive Analysis 0041
now implements supplemental attempt/version storage, with HTTP confirmation v2,
exact version/status reads, revision creation and cancellation. Bounded raw Metric
XLSX upload, persisted inventory and explicit scope/supplemental UI are now
implemented with focused Linux and synthetic browser proof. Native raw upload
and actual-source/PDF acceptance are not complete. This is not a released intake feature.
P1.5a remains unchecked until the state/identity design is reconciled with its
implementation. Existing valid free reuse remains part of the approved policy.

## Preserve the agreed run

ADR research 0009 says confirmed research runs straight through to immutable
partial drafts. ADR 0015 keeps one scope checkpoint. Neither authorizes replacing
that flow with a mandatory second approval or an indefinite worker wait.

Keep that default. "Waiting for a file" describes the optional attachment task,
not an invented successful collection and not a new always-on run status.
Unrelated methods and report creation continue. Missing source remains explicit.
If a later requirement needs the whole run to pause after scope confirmation,
propose a superseding ADR before implementing it; do not hide that policy change
inside a source-import patch.

## State and action table

| Existing run / source action | Allowed behavior | Rejection / restart |
|---|---|---|
| Before scope confirmation | Allow file selection, bounded preflight and durable Foundation intake as a prepared source. This is not yet run admission. Metadata completion happens here without occupying a worker. | Invalid file: keep actionable local error; do not queue collection or change scope. |
| Confirm scope | Approved first-version boundary: verify exact prepared sources and selected native listing; freeze the input receipt set in the same Analysis transaction as scope confirmation. Existing valid native reuse is bound here, not silently replaced by a paid call. | Source-set/request/run CAS must each succeed. Do not confirm and pay if chosen retained evidence is corrupt or ambiguous. |
| Confirmed, including COLLECTION_QUEUED | The first-version input set is already fixed, even if no worker has started. Later uploads are prepared for an explicit supplemental revision, not inserted into collection or REPORTS. | No post-confirm upload changes the first report or triggers a provider fallback. |
| COLLECTION or REPORTS running | Keep the frozen receipt set; defer supplemental rendering until the current output is settled. An upload cannot alter the current attempt. | Finish this draft, then request a new report version. Never reopen a settled collection or render from a live package scan. |
| DRAFT_READY | Preserve both original report outputs. Explicit supplemental-source action schedules a new version using retained source/capture identities. | New source does not update old semantic/HTML/PDF bytes or create a paid recollection. |
| Source intentionally skipped | Retain the choice for this source task/version; independent methods continue and missing-source coverage stays visible. | Skip is not source absence, failure, or approval; later supplementation belongs to a new version if the old version is frozen. |
| Owner cancel before admission commit | Cancel the source operation; clean only its own request staging. | No Analysis admission is committed. A Foundation package already committed before cancellation may remain as an inert, marked prepared source; exact retry may adopt it, never discover it implicitly. |
| Owner cancel after admission commit | Exact source receipt remains historical; cancellation cannot erase accepted input. | New report work may be cancelled before output commit, but an already committed version remains readable. |
| Restart during upload/preflight | No admission exists until durable commit. Existing retained source is verified on retry. | Missing temporary bytes require reupload; never claim provider collection or retry paid calls. |
| Restart during report work | Preserve the receipt-set digest and exact attempt identity independently of QUEUED/RUNNING. Reuse verified retained sources and completed results. | A requeued step is not a reopened intake window. Ambiguous model/provider calls require reconciliation; restart is not permission to call again. |
| FAILED / CANCELLED / INTERRUPTED run | Terminal run and its settled steps remain unchanged. Pure supplemental rendering, if supported, has its own explicit version/attempt identity. | Paid collection still requires a distinct owner-started research action; no automatic retry of an interrupted provider operation. |

## Smallest intake boundary

- Reuse OWNER authentication/Origin, safe errors and request-scoped publication.
  Upload has its own bounded binary/file endpoint, not base64 XLSX in a JSON
  command. Preserve the existing route-specific limits: the research JSON
  handler is bounded at 16 KiB, while ordinary OWNER commands use 4 KiB.
- Intake preserves original bytes. The server creates logical paths and derives
  identity from the real run, frozen scope, validated file profile and exact bytes.
  File-observed metadata and operator declarations stay distinct. A generated
  descriptor cannot authenticate a provider or establish missing measurement dates.
- Persist a narrow Analysis-owned admission receipt only after exact package,
  run/scope binding and required metadata verification. It references package ID,
  manifest/content identities, source family, exact request and acceptance time.
  A native admission also retains the exact selected listing and native reference.
  Do not add cross-Box SQL/FKs or invent a native package-key prefix. The same
  source-decision table records explicit skips; absence and skip are distinct.
- Foundation owns storage-origin metadata and marks authored attachments within
  their original intake transaction. Manual inventory excludes this marker before
  LIMIT, without an unbounded Analysis ID list or cross-Box SQL. A REFERENCED
  historical/manual package remains unmarked and visible. An AUTHORED attachment
  may exist before Analysis admission; the marker is not acceptance, provider
  authentication or authority to execute it. 0039 implements only this boundary.
- New resolvers receive exact package IDs/digests from the frozen receipt set,
  never a live key or membership scan. Before confirmation, discovery may propose
  the same retained source that existing policy can reuse; confirmation binds it.
  Absent, ambiguous and damaged chosen sources must preserve their distinct
  behavior. Old runs and v1 verification keep their historical paths.
- Same request/content returns the old verified receipt, including after a later
  state change. Changed-content retry conflicts; missing committed publication
  recovers only the exact verified bytes. No whole-artifact-root sweep.
- Prepared uploads use per-operation identities rather than the fixed legacy
  `automation-metric-source:<runId>` version-1 key. A correction creates a new
  prepared package; a committed admission is never overwritten. Registered but
  unadmitted packages are inert and marked, not falsely promised absent.

## Version storage and method identity

Migration 0038 allows one immutable `(run_id, report_kind)` output and makes
terminal runs immutable. It cannot represent a second report version by updating
those rows. Bind-at-confirm can use the existing first-output rows with new
source-binding readers. Post-confirm UI intake must include the additive revision
path; do not ship an endpoint that merely races the worker. The extension belongs
to the same
ResearchAutomationService, not a new research orchestrator or interpretation ledger.

Keep existing output rows as historical v1. The extension names the source run,
previous exact report version, newly admitted source references, request identity,
working attempt state and frozen output identities. A committed pair is published
atomically; failed work does not advance the displayed report pair. Reads/export
select an explicit returned version ID. A new attempt does not fabricate a new
provider collection or silently change the old run's usage.

The Metric method v1 key/reader remains unchanged. A later attempt with changed
input needs a distinct method identity/version path; it must not collide with
`automation-method:<runId>` or rewrite a frozen v1 bundle. Reuse existing owner
services and dependency identities; new source invalidates only dependent results.
The original proposal reserved no Analysis migration number. The implementation
now uses additive 0041 for attempts, immutable requests and output memberships;
Foundation 0039 does not provide attempt storage.

Implementation checkpoint: 0040 owns first-version source sets only; 0041 owns
the supplemental lifecycle. The v2 Metric descriptor's stable
binding excludes future `confirmedAt`; the actual method snapshot binds the
confirmation time plus execution ID. Native v1 references retain their full
historical binding and resolve at the actual confirmation time. Prepared Metric
storage origins must match their stable descriptor binding; that is not provider
authentication or classification acceptance.

The existing 0030 report-version owner is Metric-packet-specific (2–3 source
roles, preparation/packet assumptions) and cannot store automation report pairs.
Do not fabricate a Metric packet to reuse it. Keep that owner's behavior intact.
Use the existing automation service with a narrow additive attempt table, a
source-decision/receipt table, and child output membership; not a third AI
interpretation ledger or a second orchestrator.

Attempt contract: own request key/digest, source run, sequential attempt number,
exact previous committed version (or legacy v1 pair), frozen receipt-set digest,
QUEUED/RUNNING/COMMITTED/FAILED/CANCELLED and output identities. Failed attempts
remain historical and do not advance the committed report version. Enforce one
open attempt per run and validate the expected predecessor during creation and
commit. Attempt numbers and committed version numbers are separate so failures
do not manufacture missing report versions. Worker pickup, restart and cancel
must cover this table without changing terminal run rows.

The claim succeeds only when its guarded UPDATE changes exactly one row. A
frozen set persists through recovery. New v2 method snapshots verify the attempt's
sources rather than demanding the legacy COLLECTION document, which can contain
the previous paid review source. Keep v1 keys/readers untouched.

Reads expose a version list and select an exact version/pair ID for web and PDF.
Publication commits the requested Market/Insight set atomically; for the usual
two-report request neither side advances alone. A supplemental attempt preserves
the original requested kinds, keyword, period and confirmed scope. A scope/kind
change is a new research run under ADR 0015, not an attachment correction.

## Owner-approved policy boundary

The approved timing rule is bind-at-confirm for the first report and an explicit
new version for later sources. This satisfies both straight-through execution
and the existing requirement to attach to an already-confirmed run. It does not
silently discard post-confirm intake. The owner answered “Duyệt cách đề xuất”
on 2026-10-03. A changed scope requires a new research run; a supplemental
version preserves the original requested kinds and scope. No additional approval
checkpoint or provider call follows merely from preparing or viewing a source.

Preserve existing free native reuse: discover/verify the exact matching retained
capture before the confirmation boundary and freeze its reference there. Do not
switch to 'explicit attachment only' and cause a new paid collection for a case
that previously reused retained evidence. The proposal adds no mandatory approval
checkpoint, no new source provider and no permission to call a provider.

## Current implemented boundary, 2026-10-03

The service accepts a supplement only after the original run reaches DRAFT_READY.
FAILED/CANCELLED/INTERRUPTED parent-run supplementation is still future work, not
an implemented capability implied by the state table above. Exact KEEP/SKIP or
retained package selections are frozen on the attempt. No upload or collection
is started by revision admission. Attempts and successful version numbers are
distinct; failed/cancelled work does not create a displayed version gap.

The HTTP slice retains v1/default report routes and adds explicit pair-ID web/PDF
reads, version lists, attempt status, OWNER creation and cancellation. Existing
Origin/token/body limits stay in place. The default URL never means latest.
Creating/cancelling attempts delegates to ResearchAutomationService; reads verify
immutable source, predecessor and output artifacts. KEEP results retain their
original method identity, while changed input uses a distinct execution identity.

Linux generation/typecheck and the integrated eight-file owner/HTTP group passed
78/78. An inactive service handle cannot interrupt an attempt owned by another
worker; the regression was verified RED with the prior bulk update and GREEN
with exact active identities. These are focused checks, not final release CI.
Safe raw upload/publication recovery, UI intake/version selection and real
three-case content acceptance remain open. No frontend or live runtime changed.

## Raw Metric upload implementation, 2026-10-03

The subsequent API slice implements Metric upload/publication recovery only:

- `POST /owner-api/workspaces/:workspaceId/research-automation/runs/:runId/sources/metric`.
- Multipart fields: `metadata` containing the closed
  `automation-metric-prepare-v1` request, plus `workbook` containing original
  XLSX bytes. The filename never controls a filesystem or logical storage path.
- Existing auth, Origin and Host checks precede body consumption. Workbook limit
  is 32 MiB, metadata 16 KiB; ordinary research JSON stays 16 KiB. Receipt is
  `PREPARED_NOT_ADMITTED`, with exact package ID, observed record count and clearly
  operator-declared source dates/label. No internal artifact path/hash is exposed.
- Header, contiguous row range and supported numeric/profile structures use the
  existing bounded offline reader. Neither header recognition nor normalization
  authenticates the export's filters/category/period. Original bytes are retained;
  acquisition stays null unless declared. There are no accepted labels or new
  calculation/preparation rows from upload.
- Exact request retry verifies original package content/origin and returns 200;
  new preparation returns 201. Changed content under the same key conflicts.
  Confirmed-scope drift requires a new run. Preparation does not wake a worker,
  and post-confirm uploads never enter the original frozen source set.
- Request staging publishes only verified committed membership. Missing
  publication may recover only from an exact request, immutable package, matching
  origin/member/manifest metadata and identical bytes. Corrupt existing paths
  reject without repair. Recovery makes zero database mutations and retains
  first-storage artifact timestamps, even when package B finalized later.

Linux generation/typecheck plus the final integrated owner/API group passed
80/80 (zero skips/failures); upload-specific API/Foundation group passed 14/14.
One real HTTP journey guards bounded multipart/auth, rejection before writes,
exact original bytes, inert pre/post-confirm preparation and same-key retries.
The Foundation owner separately guards lost-publication recovery, corruption and
ownership; it is not another mock of HTTP upload. No test-only production seam.

Not yet implemented/verified: UI upload and explicit version selection, abort UX
after an ambiguous request, general CSV/JSON/native review upload, release/full
CI, actual source acceptance and PDF/browser intake acceptance. The existing
native supplemental route selects a retained verified package; it does not make
an arbitrary review document into verified capture lineage. All P1/R1 gates stay
open until their full acceptance criteria pass.

## Prepared-source inventory and scope UI, 2026-10-03

GET `.../runs/:runId/sources/metric` now lists exact verified, run-owned prepared
packages through Foundation's declared lookup/reader. It does not invoke Python,
calculate, admit, write or choose latest. Canonical context and manifest metadata
are checked against the retained upload request and stable scope/run binding.

The existing scope screen now exposes this inventory and original-XLSX upload.
Uploading still requires explicit subsequent selection. Uncertain requests keep
the exact request/file snapshot for retry; scope edits and final confirmation
are held while the upload outcome is unresolved. Stop waiting aborts only the
client wait. Reload can rediscover a published source; nothing is auto-admitted.
Native reuse or skip is separately explicit in the final confirmation.

Linux focused backend checks passed 30/30, frontend boundary/workflow checks
12/12 and the frontend invocation 199/199. Generation, typechecks and production
build passed. Independent code audit found no blocker. Desktop/mobile synthetic
component inspection passed overflow, page-error and dialog-cancellation checks.
The default scope finish reviewer returned ship at the synthetic component
scope. No live upload, release CI or full P1/R1 acceptance is claimed.

## Explicit version and attempt UI, 2026-10-03

Durable attempt-list GET uses the owning verified reader and rejects identity,
sequence or active-attempt contradictions. Reload restores pending state without
a new POST. The DRAFT_READY dossier exposes exact pair selection, two web/PDF
links per selected pair and a retained-source supplemental confirmation. The
original is the initial selection even when later versions exist. Unknown
connection outcomes keep the immutable request body/key for explicit retry.
Cancel carries one exact attempt ID and does not replace/delete any saved pair.

Version and attempt GETs can straddle a commit; fresh creation is blocked until
the committed pair is visible. This blocker has a mounted RED/GREEN regression.
Linux client 5/5, mounted 3/3 and owner HTTP 6/6 passed. The frontend invocation
passed 207/207 before the mobile current-step correction; subsequent typecheck,
build and affected checks passed 20/20. Synthetic actual-RunView browser checks
at desktop/mobile passed explicit selection, create/cancel, Escape/focus return
and no overflow/page errors. The finish reviewer scored its sole mobile-step
finding resolved and returned ship, at this preview scope only.

No actual input upload, live operator mutation, release CI, real report/PDF
acceptance or 30-section completion is implied. Root delivery gate and design
documentation review still precede a finished UI handoff. The broader P1/R1
checkboxes remain open.

## Acceptance for the first production slice

1. Through UI, attach a valid raw export: prepared before confirmation for the
   first report, or attached to the exact confirmed run for a supplemental
   version. Exercise both paths, not a script-only package intake.
2. Prove run-bound native selection and manual inventory exclusion with durable
   provenance. More than 100 unrelated attachments cannot block an exact read;
   more than 100 genuine manual choices still produces the honest existing limit.
3. Damaged selected source, wrong run/listing, ambiguous IDs and late input
   conflict fail without changing report input or triggering a paid fallback.
4. Exact retry, source-operation cancellation and publication recovery protect
   observable ownership boundaries. One focused owner proof per distinct risk.
5. Separate Market and Insight web/PDF reflect the same frozen version. Supplemental
   source creates a distinct version; old source, reports and usage remain readable.

These are implementation gates, not a waiver of R1's minimum useful content for
all three cases or permission to activate the live operator.
