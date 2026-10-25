# ADR 0007: Video Factory execution boundary

Status: Proposed (25/10/2026). Owner direction: option A with the isolation
protections (O1, F176–F177); the owner accepted the crash risk (F177).

## Context

Video Factory is a new Flow feature: from a topic or Angle, the app writes a
script, finds b-roll, adds voice and music, and renders a 9:16 Vietnamese video
with ffmpeg (design in `docs/tasks/054-video-factory-design.md`; rules
R-V01–R-V16 in `openspec/changes/video-factory-v1/`). Renders take minutes of
CPU, clips and outputs are large media files, and several outside services are
paid. The application has one SQLite database, one operator executor, and one
worker pattern already proven by ADR 0006. ADR 0003 decision 8 ("không video")
excluded video from Content Studio; the owner has now decided that video runs
as its own flow and must not change the reports. The question is where video
work executes and how a failure stays contained.

## Decision

- Video work is owned by Flow: a `VideoService` owns workflow state and policy
  in `src/modules/flow/video-*` with `flow_video_*` tables (including a new
  `flow_video_provider_attempts` table; the 049 attempts table rejects video
  calls).
- Video execution uses the ADR 0006 pattern: one `VideoWorker` attached to the
  existing operator executor. No second process, no second queue. Four job
  kinds only: import, analyse, voice, render. One video job at a time.
- Script writing and the AI rerank run synchronously through
  `CreativeAiGateway` under ADR 0004 decision 1, so there is no script job
  kind.
- ffmpeg runs as a low-priority child process with memory and time limits, no
  shell, minimal environment (the reused process runner strips provider keys,
  so a child cannot carry secrets).
- Files are read and written as streams, never whole in memory.
- Every outside call has a time limit and fails only its own job; the app keeps
  running. No automatic retries and no automatic provider or account switching;
  the owner may switch manually (R-V10, R-V11).
- On restart, running video jobs become interrupted and are never retried
  automatically, matching the existing sweep rule.
- **Amends ADR 0003 decision 8** ("không video"): video is now its own flow
  next to Content Studio, Video Factory. The earlier copy of ADR 0003 is kept
  at `docs/outdated/2026-10-25/docs/adr/0003-content-studio-b11-b13.md`.

Accepted risk: a bug in Video Factory code itself can restart the application.
The owner explicitly accepted this on 25/10/2026 (F177) in exchange for the
simplicity of one process.

## Consequences

- The executor stays the single writer; the startup lock and sweep rules from
  ADR 0004 apply unchanged to video jobs.
- The operator must start and gracefully close the `VideoWorker` before closing
  its database; only the executor lock prevents duplicates.
- The reports and Content Studio are unaffected: a video job failure, an ffmpeg
  crash, or a provider timeout can mark only its own job failed.
- No additional authorization is granted by this ADR: paid provider calls and
  deployment still need task-specific owner approval (slices 055–058).
- A `flow_video_provider_attempts` table is required because the existing
  attempts table rejects provider kinds not known to it.

## Rejected alternatives

| Alternative | Reason rejected |
|---|---|
| A separate worker process (target of the owner's "separate worker" idea, evaluated as option B) | The goal — one dying service must not sink the ship — is met by per-call time limits, streamed files, and the niced ffmpeg child. A second process adds a second database writer, key delivery, orphan cleanup and restart logic without extra owner benefit (O1, F176–F177). |
| A second job queue for video | Duplicates leases, retries and cancellation truth and violates the one-coordinated-decision rule of ADR 0004 decision 5. |
| Embeddings and vector search over clip moments | Not an owner-visible need in v1; text search over stored English descriptions plus AI rerank answers the need and stays behind one search function. |
| A timeline editor or a professional editing suite | The owner asked for an automation creator, not an editor; no timeline UI, drag/trim/tracks, project export, or editing product. |
| The Vbee batch API | It requires a public webhook the local operator cannot receive; use one voice call per scene, and re-check the webhook claim in the slice task. |
| A second Gemini key next to CLIProxy | Decided by F1: if the CLIProxy accounts are official keys, reuse that route. Open a dedicated key only if F1 shows it is needed. |
