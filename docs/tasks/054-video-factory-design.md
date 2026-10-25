# Task 054 — Video Factory design

Status: READY
Lane: Standard (this documents task). Implementation slices 055–058 are Controlled; see §8.
Owner/worktree: `wp/vf0-docs`
Goal: Record the owner-approved design of Video Factory (9:16 Vietnamese b-roll video maker) so slices 055–058 can start without re-interviewing the owner.
Non-goals: No code, test, migration, contract, package or CI change. No provider call. No deployment. No change to Caption & Poster (047–053) or to the reports.
Dependencies: Task 047 (brands, campaigns, Angles); Task 049 (`CreativeAiGateway`, attempts, executor lock); ADR 0003 (decision 8 — amended by ADR 0007); ADR 0004 (synchronous AI, attempts); ADR 0006 (worker pattern); ADR 0007 (video execution); the video-watch lane (`video-watch-gemini.ts`, `video-watch-media.ts`, `provider-common.ts`).
Owned paths: `docs/tasks/054-video-factory-design.md`; `docs/adr/0007-video-factory-execution.md`; `openspec/changes/video-factory-v1/` (proposal, spec, tasks); small edits to `docs/adr/0003-content-studio-b11-b13.md`, `INTENT.md`, `openspec/config.yaml`, `AGENTS.md`; `docs/outdated/2026-10-25/` snapshot and README row.
Acceptance: The owner approves this PR and the OpenSpec change `video-factory-v1`.
Minimum verification: `openspec validate --all` passes.
Escalate when: A slice task needs a decision not recorded here, or a process or provider boundary differs from ADR 0007, or an item in §10 (open) blocks a slice.

## 0. Problem and success measures

The owner runs content marketing and needs short vertical videos for supplements and related topics. An editor workflow does not fit one operator: the owner wants to type a topic or pick an Angle and get a finished video to check at three stops. ADR 0003 decision 8 kept video out of Content Studio; the owner has now decided that video is its own flow. This brief defines that flow so it can be built in small slices, each ending with something the owner can try.

Success measures, agreed with the owner through the review (25/10/2026):

| Measure | Meaning |
|---|---|
| Gap rate | Share of scenes with no suitable clip at stop 2. |
| Owner change rate | Share of scenes the owner changes at stop 2. |
| Time to first approval | From «Tạo video» to the first approved video in the owner's hands. |
| Cost per approved video | Paid-call count and cost of one approved video. |

## 1. Product decisions (owner-approved 01/10/2026; §1 items not marked Later are v1)

| Topic | Decision |
|---|---|
| Purpose | Automation creator, not an editor. No timeline, no drag/trim/tracks UI. Internal tool; single operator. |
| Format | 9:16 first (1080×1920). 16:9 later. |
| Language | Vietnamese first (narration, UI copy). |
| Entry | Free topic, or a campaign Angle (its Big Idea, Angle, purposes, product facts). Brand optional: no brand → no logo unless one is uploaded for the project. |
| Pipeline | Topic/Angle → script → review stop → pick b-roll → review stop → voice + music → ffmpeg render → review stop → download. |
| Review stops | Three stops: script, scene picks, final video. Stops on by default. Per-video «Bỏ qua duyệt» switch. A requested rewrite always stops at stop 1 (script vs setup, 01/10/2026). |
| Script shape | Scenes: Vietnamese narration line, English visual query (never spoken), target length, optional callout text. Generated through `CreativeAiGateway`. |
| B-roll sources | Order: own library → stock (Pexels, Pixabay) → AI generation. AI generation is a disabled plug-in point in v1. |
| Library intake | Browser upload and a watched drop folder. No automatic shot splitting: the owner trims before upload. |
| Clip understanding | Gemini reads a clip only after the owner clicks «Phân tích n clip (n lượt Gemini)» (O2, 25/10/2026). Unread clips show «Chưa phân tích». No re-watch at render time. |
| Search | Text search over the stored English clip descriptions, then an AI rerank picks the top 3. No embeddings in v1. |
| Collections | Each clip is General or belongs to one brand; brand clips appear only in that brand's videos. |
| Voice | Vbee and ElevenLabs. The Vietnamese listening test (F2) picks the first provider; build winner first, the other in slice 3. |
| Subtitles | Not in v1. |
| Music | Own royalty-free track library, chosen by mood. Music lowered under the voice; mix normalised for social. |
| Render engine | ffmpeg only. No timeline editor product, no project export. |
| Where work runs | Inside the application: a Flow-owned service plus a worker attached to the operator executor. See ADR 0007 (O1, 25/10/2026). |
| Script prompt | Fixed in code in v1 (F179). Not editable in the prompt library. |
| Style | Presets: system default → brand default → per video (override fields). Format, framing, transitions, logo, music levels, voice. Colour looks and callout styling later. |
| Output | v1: in-app preview + download. Drive/cloud and auto-posting later. |
| Timing | Each scene lasts as long as its voice audio. No word-level timing in v1 (cut 2). |
| Providers | One small module per provider, shared error type. The owner may choose another provider manually; the system never switches by itself. |
| AI usage display | Call counts shown before every paid call; no automatic retries. |
| Delete | «Ẩn» and «Khôi phục». No purge in v1 (cut 8). |
| Batch | Many topics/Angles queued at once; slice 3, with the narration check; one combined call count before the batch starts. |
| Roadmap | v1 = §1 items not marked Later. Later: subtitles, hook variants, AI clip generation, output destinations, 16:9, remaining style fields. Phase 2: motion graphics (check Remotion licence). Phase 3: structure copy from a reference video. |

## 2. Ownership

Video Factory lives in Box 4 (Flow). Code goes under `src/modules/flow/video-*`. Tables are named `flow_video_*`. Brand, campaign and Angle data is read only through Flow services, never by joining Flow tables from other modules. The video attempts table is new (`flow_video_provider_attempts`); the attempts table from Task 049 rejects video calls.

## 3. Execution model

Video runs inside the application process, following the ADR 0006 pattern: one Flow-owned `VideoService` and one `VideoWorker` attached to the operator executor, four job kinds (import, analyse, voice, render), one video job at a time. Script writing and the AI rerank run synchronously through `CreativeAiGateway` (ADR 0004 decision 1), so there is no script job. ffmpeg runs as a low-priority child process with memory and time limits, no shell, minimal environment. Files are read and written as streams. Every outside call has a time limit and can fail only its own job; on restart, running jobs become interrupted and are never retried automatically. The accepted risk: a bug in Video Factory code itself can restart the app (owner accepted 25/10/2026, F177). Full reasoning and rejected alternatives: see ADR 0007.

## 4. Reuse from main

| Reused unit | What it gives | Change needed |
|---|---|---|
| `video-watch-gemini.ts` | Request shape, bounded reader, capture log, key-echo refusal, ffprobe-assisted checks | Set retries to 0; send the low-res preview, not the original; route decided by F1 — CLIProxy route if F1 shows an official key, else a direct official key |
| `video-watch-media.ts` | No-shell process runner, `minimalEnv`, `sha256File`, ffprobe parsing, fake runner for tests | As-is |
| `provider-common.ts` | HTTPS host allowlist, secret-echo check | As-is; every internet provider goes through the allowlist rule |
| `content-brand-fact-check.ts` (`brandFactCheck`) | Base of the narration safety check (R-V03) | Extend for health and legal claims on video narration |

Keys come from environment variables, never from files with a machine path. No machine path appears in any document or migration.

## 5. Design decisions from the 10 cuts (simplest-plan §2, owner-approved 25/10/2026)

1. No embeddings or vector search. Search is text search over stored English descriptions, then AI rerank; one search function keeps a later swap possible.
2. No word-level timing. A scene lasts as long as its voice audio.
3. No general provider framework. One small module per provider; «no automatic switch» holds because there is no switch code.
4. No second job system. Video jobs reuse the existing worker pattern (ADR 0006) with four kinds; one video job at a time.
5. No preset version tables. Each render keeps a frozen copy of the settings it used (R-V13).
6. No new Gemini, ffprobe and process code. Reuse the video-watch units with retries set to 0.
7. No second Gemini key next to CLIProxy until F1 is checked. If F1 is clean, reuse the CLIProxy route.
8. No soft delete with expiry. Delete is «Ẩn»/«Khôi phục»; nothing is purged in v1.
9. No global «Đang tạo» tray in v1. Progress shows on the video list and the video page.
10. No destructive drop folder. Files are copied in; the source is never moved or deleted; a file already imported (same fingerprint) is skipped.

## 6. Rules that span tasks

- Invalidation: editing the script re-picks clips for changed scenes and rebuilds voice and render (until slice 3 adds keeping old picks, F179). Changing a scene's clip rebuilds the render. A retry returns to the entry state of that step. An approved video stays final until a re-render; the approved flag is a label only. The full transition table is a slice-1 task deliverable.
- Paid-call rule (R-V10): counts shown before every paid call; the analysis click; one combined count before a batch; no automatic retries.
- Narration check (R-V03): health, legal and brand-fact check on every video; «Bỏ qua duyệt» can never skip it; built on `brandFactCheck`.
- Transitions: in v1 a fade is placed inside each clip, so the video is never shorter than the voice. A test asserts video length equals audio length.

## 7. Slices

Each slice ends with something the owner can try (owner build order, 01/10/2026).

| Slice / task | Scope | Lane | Owned paths | Acceptance | Must answer |
|---|---|---|---|---|---|
| 1 — 055 | Video menu, list, «Tạo video»; script through the AI gateway + stop 1; clip library upload and music library; stop 2 with owner picks; voice; ffmpeg render with presets + stop 3 + download; delete = hide | Controlled (new paid voice provider; new execution boundary) | `src/modules/flow/video-*`, new API and contract paths, new migration | The owner creates a real video from a topic, checks three stops, downloads it | Full project state and transition table; claim, sweep and cancel rules (only differences from ADR 0006); API dispatch and schema contract; version tokens; `flow_video_provider_attempts`; per-call time limits and the crash test; streaming upload (larger than the current media cap); rejection-code enum; proxy and thumbnail spec; HDR and VFR handling; ffmpeg hardening; music intake, states and mood vocabulary; artifact purge stays out of v1; disk-floor env names; migration numbers from the then-current head; create only the tables this task needs |
| 2 — 056 | Gemini clip reading after the owner's click; top-3 suggestion; Pexels stock with add-to-library; Angle as script source; drop folder import; no-match scenes fail cleanly while skipping | Controlled (two new paid providers) | same directories | The owner watches a video build itself except voice and render already proven | F1 checked before route choice; inline preview size limit; retries = 0; env-var allowlist for keys; search contract; re-analysis versioning; count of analyses shown including stock-triggered ones; logo, face and text filters in matching (A13); rerank output schema; stock order, count and minimum duration; Pexels caching and reuse terms; drop folder copy-verify and duplicate skip |
| 3 — 057 | Narration safety check outside skip; «Bỏ qua duyệt» and batch with one combined count; brand preset layer; second voice provider; Pixabay; script reuse and keeping old picks | Controlled (new paid provider key; unattended paid calls possible) | same directories | The owner runs a batch with skip on; every video passed the narration check | State of O3 (spending cap + batch + skip) before enabling; O4 for supplement-brand videos before enabling; batch entity, maximum N and cancel; fairness while one render runs at a time; Pexels terms analogue for Pixabay; the exact rewrite rule from script vs setup (decisions 6–8); build the brand preset layer on frozen render snapshots |
| 4 — 058 | Fedora live qualification of the whole pipeline with real calls | Controlled | no product code; runbook and evidence updates | Recorded qualification; merge blocked until the owner writes «deploy SHA» later (not in this task) | A per-provider call budget set by the owner before the run; stop rules; evidence fields; no retry during the run |

Three slices (055–057) land one after another; each merge needs the owner's OK, and deployment happens only on the owner's «deploy <SHA>».

Risk and recovery table for the Controlled slices:

| Risk | Control | Recovery |
|---|---|---|
| Provider failure or slow provider | Per-call time limit; typed error; no automatic retry (R-V10, R-V11, R-V14) | Only the failed job stops; the owner presses «Thử lại» |
| Interrupted job after restart | Running jobs marked interrupted by the executor sweep (ADR 0004/0006 pattern) | Never retried automatically; the owner restarts the step |
| Cost overrun (skip + batch, slice 2–3) | Combined call count shown before a batch; narration check cannot be skipped (R-V03); O3 and O4 answered before slice 3 ships skip | Owner approves each slice merge; live run has a per-provider budget (058) |

## 8. Risks

| Risk | Mitigation |
|---|---|
| Render starves the operator | ffmpeg child at low priority; memory and time limits; one video job at a time (ADR 0007). |
| Crash leaves running rows | Executor sweep marks them interrupted; manual «Thử lại»; a restart test per job kind replacing the known UI crash of earlier work. |
| Credential leak | Environment variables, host allowlist, secret-echo check; keys never in logs, errors, API bodies or DB rows; tests assert absence. |
| Wrong or unsafe clip in a brand video | Collections (R-V07); recorded logo, face and text facts; stop 2 on by default. |
| Licence violation | Source + licence mandatory for stock (R-V05) and music (R-V09); AI clips never enter the library (R-V06). |
| Vietnamese voice quality | Listening test F2 before choosing the default; both providers kept. |
| Health-claim narration | Automated narration check on every video; «Bỏ qua duyệt» cannot skip it (R-V03; architecture health and legal gates). |
| Hostile media files parsed by ffmpeg or ffprobe | Protocol whitelist, time limits, refuse links; files processed as streams through the runner from `video-watch-media.ts`. |
| Backup of original clips | Originals cannot be regenerated; they are backed up with the database per the architecture backup invariant; DB backup alone is not enough. |
| Owner footage sent to Google | Data-use terms depend on the key tier; raise with F1 before slice 2 analysis runs. |
| Silent spend | Counts before every paid call (R-V10); no cross-provider switch (R-V11). |

## 9. Alternatives

A table of rejected alternatives is in ADR 0007 (execution model and search decision). This brief does not repeat it.

## 10. Open items

| # | Item | Status |
|---|---|---|
| O3 | No spending cap + batch + skip review allows unattended paid calls | Open; needed before slice 3. |
| O4 | May a supplement-brand video skip review? | Open; needed before slice 3. |
| F1 | Which accounts CLIProxy on Fedora uses | Open; read-only check; decides the Gemini route for slice 2. |
| F2 | Vbee vs ElevenLabs Vietnamese listening test | Open; owner listens; small paid calls need the owner's OK. |
| F3 | ffmpeg 8.0.1 with xfade, loudnorm, sidechaincompress | Done 25/10/2026. |
| F4 | Remotion licence terms | Phase 2 only. |

Rejected or declined by the owner (do not re-propose): every notivn/AIEV idea — whisper alignment, QC gate, VieNeu-TTS, SFX (01/10/2026).
