# ADR 0007: Video Factory execution boundary

Status: Proposed (25/10/2026); Accepted when the owner approves the slice-0 PR.
Owner direction: option A with the isolation protections (O1, F176–F177). On
25/10/2026 the owner re-confirmed option A (F183) and asked for an automatic
safe restart after a crash in slice 1 (task 055).

## Context

Video Factory is a new Flow feature: from a topic or Angle, the app writes a
script, finds b-roll, adds voice and music, and renders a 9:16 Vietnamese video
with ffmpeg (design in `docs/tasks/054-video-factory-design.md`; rules
R-V01–R-V16 in `openspec/changes/video-factory-v1/`). Render cost depends on
the media and settings; clips and outputs can be large, and outside services can
be paid. The application has one SQLite database, one operator executor, and one
worker pattern already proven by ADR 0006. ADR 0003 decision 8 ("không video")
excluded video from Content Studio; the owner has now decided that video runs
as its own flow and must not change the reports. The question is where video
work executes and how a failure stays contained.

## Decision

- Video work is owned by Flow: a `VideoService` owns workflow state and policy
  in `src/modules/flow/video-*` with `flow_video_*` tables (including a new
  `flow_video_provider_attempts` table). Task 049's attempts table accepts
  creative text/image calls; it has no voice or clip-analysis provider kinds.
  Its target names are not restricted to Content Studio. Script and rerank
  calls go through the existing attempt service with a video target type; the
  new table holds only voice, clip-analysis and stock calls.
- Video execution uses the ADR 0006 pattern: one `VideoWorker` attached to the
  existing operator executor. No second Node process, no second queue. Four job
  kinds only: import, analyse, voice, render. One video job at a time.
- This ADR extends ADR 0004 decisions 1 and 5, whose synchronous exception is
  currently Content Studio-only: video script writing and AI rerank also run
  synchronously through `CreativeAiGateway`. There is no script job kind.
- ffmpeg runs as a low-priority child process with memory and time limits, no
  shell and an environment containing only required non-secret values. Video
  Factory copies the small helpers it needs (process runner and spawn options,
  `sha256File`, secret-echo check, answer parsing) into its own Flow or platform
  files, each with a source note; research-automation code is not changed, so
  Market and the reports are untouched and no cross-lane coordination is needed.
  The copied runner filters the parent environment and provides time limits;
  slice 1 must add render priority, memory limits and media hardening to the
  copy. Voice audio responses must stream; the research lane's bounded response
  reader holds the whole response in memory and is not reused for audio.
- Files are read and written as streams, never whole in memory.
- Every outside call has a time limit and fails only its own job; the app keeps
  running. A synchronous script or rerank failure stops only that action.
  No automatic retries and no automatic provider or account switching;
  the owner may switch manually (R-V10, R-V11).
- On restart, running video jobs become interrupted and are never retried
  automatically. ADR 0006 permits re-queueing local report renders; video jobs
  do not use that exception.
- **Amends ADR 0003 decision 8** ("không video"): video is now its own flow
  next to Content Studio, Video Factory. The earlier copy of ADR 0003 is kept
  at `docs/outdated/2026-10-25/docs/adr/0003-content-studio-b11-b13.md`.

Accepted risk: a hard crash in Video Factory code leaves the executor lock, so
the whole application (reports and Content Studio included) stays down until
the manual stale-lock recovery runs. The owner re-confirmed option A on
25/10/2026 (F183) and asked for an automatic safe restart in slice 1: after 055
the app comes back by itself; 055 must prove the lock-owner process is gone
before taking the lock, so there are never two writers.

## Consequences

- The executor process remains the only operator authorized to execute video
  jobs. The startup lock is not a SQLite write lock; existing services open
  several write connections. Slice 1 adds video startup sweeping under the
  same lock holder and keeps viewers read-only.
- The operator must start and gracefully close the `VideoWorker` before closing
  its database; only the executor lock prevents duplicates.
- An ffmpeg crash or provider timeout is contained to its job or action. The
  shared-process crash risk above still applies to reports and Content Studio.
  This ADR changes no report rule or Content Studio workflow.
- No additional authorization is granted by this ADR: paid provider calls and
  deployment still need task-specific owner approval (slices 055–058).
- The new video provider attempts table records video-provider calls outside
  the creative text/image contract; the existing table is not a generic job
  queue. Reuse the attempt pattern rather than widening report contracts.

## Rejected alternatives

| Alternative | Reason rejected |
|---|---|
| A separate worker process (option B) | The owner chose option A with limits, streamed files, per-call time limits and a crash test (O1, F176–F177). It reduces worker supervision and key-delivery work; the corrected hard-crash risk above remains, and slice 1 adds the automatic safe restart (F183). |
| A second job queue for video | Duplicates leases, retries and cancellation truth and violates the one-coordinated-decision rule of ADR 0004 decision 5. |
| Embeddings and vector search over clip moments | Not an owner-visible need in v1; text search over stored English descriptions plus AI rerank answers the need and stays behind one search function. |
| A timeline editor or a professional editing suite | The owner asked for an automation creator, not an editor; no timeline UI, drag/trim/tracks, project export, or editing product. |
| The Vbee batch API | The draft says it requires a public webhook; verify this claim in the voice slice. The agreed plan uses one voice call per scene. |
| A second Gemini key next to CLIProxy | Decided by F1: if the CLIProxy accounts are official keys, reuse that route. Open a dedicated key only if F1 shows it is needed. |
