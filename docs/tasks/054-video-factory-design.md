# Task 054 — Video Factory design

Status: READY
Lane: Standard (this documents task). Implementation tasks 055–058 are Controlled; see §7.
Owner/worktree: `wp/vf0-docs`
Goal: Record the owner-approved design of Video Factory (9:16 Vietnamese b-roll video maker) for tasks 055–058. Keep unresolved decisions explicit in §10.
Non-goals: No code, test, migration, contract, package or CI change. No provider call. No deployment. No change to Caption & Poster (047–053) or to the reports.
Dependencies: Task 047 (brands, campaigns, Angles); Task 049 (`CreativeAiGateway`, attempts, executor lock); ADR 0003 (decision 8 — amended by ADR 0007); ADR 0004 (synchronous AI, attempts); ADR 0006 (worker pattern); ADR 0007 (video execution); the video-watch lane (`video-watch-gemini.ts`, `video-watch-media.ts`, `provider-common.ts`).
Owned paths: `docs/tasks/054-video-factory-design.md`; `docs/adr/0007-video-factory-execution.md`; `openspec/changes/video-factory-v1/` (proposal, spec, tasks); small edits to `docs/adr/0003-content-studio-b11-b13.md`, `INTENT.md`, `openspec/config.yaml`, `AGENTS.md`; `docs/outdated/2026-10-25/` snapshot and README row.
Acceptance: The owner approves this PR and the OpenSpec change `video-factory-v1`.
Minimum verification: `openspec validate --all` passes.
Escalate when: A slice task needs a decision not recorded here, or a process or provider boundary differs from ADR 0007, or an item in §10 (open) blocks a slice.

## 0. Problem and success measures

The owner runs content marketing and needs short vertical videos for supplements and related topics. An editor workflow does not fit one operator: the owner wants to type a topic or pick an Angle and get a finished video to check at three stops. ADR 0003 decision 8 kept video out of Content Studio; the owner has now decided that video is its own flow. This brief defines that flow so it can be built in small slices, each ending with something the owner can try.

Proposed success measures from the review (25/10/2026), not yet owner-approved:

| Measure | Meaning |
|---|---|
| Gap rate | Share of scenes with no suitable clip at stop 2. |
| Owner change rate | Share of scenes the owner changes at stop 2. |
| Time to first approval | From «Tạo video» to the first approved video in the owner's hands. |
| Cost per approved video | Paid-call count and cost of one approved video. |

## 1. Product decisions (confirmed 01/10/2026; updates dated below; items not marked Later are v1)

| Topic | Decision |
|---|---|
| Purpose | Automation creator, not an editor. No timeline, no drag/trim/tracks UI. Internal tool; single operator. |
| Format | 9:16 first (1080×1920). 16:9 later. |
| Language | Vietnamese first (narration, UI copy). |
| Entry | Free topic, or a campaign Angle (its Big Idea, Angle, purposes, product facts). Brand optional: no brand → no logo unless one is uploaded for the project. |
| Pipeline | Topic/Angle → script → stop 1 → pick b-roll → stop 2 → voice + music → ffmpeg render → stop 3 → download. |
| Review stops | Three stops: stop 1 script, stop 2 clip picks, stop 3 final video. Stops on by default. The per-video «Bỏ qua duyệt» switch arrives in slice 3. A requested rewrite always stops at stop 1 (decision 9, script-vs-setup-decision.md, 01/10/2026). |
| Script shape | Scenes: Vietnamese narration line, English visual query (never spoken), target length, optional callout text. Generated through `CreativeAiGateway`. |
| B-roll sources | Order: own library → stock (Pexels, Pixabay) → AI generation. Used stock joins the library with source and licence. AI-generated clips stay in their own project and never enter the library. AI generation is a disabled plug-in point in v1. |
| Library intake | Browser upload (multi-file drag-and-drop) and a watched drop folder. No automatic shot splitting: the owner trims before upload. |
| Clip understanding | Gemini reads a clip only after the owner clicks «Phân tích n clip (n lượt Gemini)» (O2, 25/10/2026). It stores an English description, timestamped moments and a safe 9:16 crop. Use an official key, never an Antigravity login; F1 decides the route. Unread clips show «Chưa phân tích». No re-watch at render time. |
| Search | Text search over the stored English clip descriptions, then an AI rerank picks the top 3. No embeddings in v1. |
| Collections | Each clip is General or belongs to one brand; brand clips appear only in that brand's videos. |
| Voice | Vbee and ElevenLabs. The Vietnamese listening test (F2) picks the first provider; build winner first, the other in slice 3. |
| Subtitles | Not in v1. |
| Music | Own royalty-free track library, chosen by mood. Music lowered under the voice; mix normalised to −14 LUFS for social. |
| Render engine | ffmpeg only. No timeline editor product, no project export. |
| Where work runs | Inside the application: a Flow-owned service plus a worker attached to the operator executor. See ADR 0007 (O1, 25/10/2026). |
| Script prompt | Fixed in code in v1 (F179). Not editable in the prompt library. |
| Style | Presets: system default → brand default → per video (override fields). Slice 1 has system default + per-video settings; brand defaults arrive in slice 3. Format, framing, transitions, logo, music levels, voice. Colour looks, callout styling and still-image zoom later. |
| Output | v1: in-app preview + download. Drive/cloud and auto-posting later. |
| Timing | Each scene lasts as long as its voice audio. No word-level timing in v1 (cut 2). |
| Providers | One small module per provider, shared error type. The owner may choose another provider manually; the system never switches by itself. |
| AI usage display | Call counts and, for voice, character counts shown before running; no automatic retries. |
| Spending cap | No spending cap (01/10/2026). O3 remains open for unattended paid calls with batch + skip. |
| Delete | «Ẩn» and «Khôi phục». No purge in v1 (cut 8). |
| Batch | Many topics/Angles queued at once; slice 3, with the narration check; one combined call count before the batch starts. |
| Roadmap | v1 = §1 items not marked Later. Later: subtitles (karaoke default, style templates), hook variants (one body, several openings), AI clip generation, output destinations, 16:9, remaining style fields. Phase 2: Claude proposes motion graphics from project data, with «+ Thêm yêu cầu» for free text; the owner selects them and ffmpeg composites transparent animated layers. Choose the renderer then (HyperFrames, Remotion or Hypit; check licences). Phase 3: copy structure from a reference video into a style preset and script template, never its content. |

These are the completed-v1 rules. The staged build is in §7; batch and skip remain unavailable before slice 3.

## 2. Ownership

Video Factory lives in Box 4 (Flow). Code goes under `src/modules/flow/video-*`. Tables are named `flow_video_*`. Read brand, campaign and Angle data only through Flow services. Content Studio is the Caption & Poster flow shown as «Nội dung»; Video Factory is a separate flow. The new provider attempts table is `flow_video_provider_attempts`. Task 049's table accepts creative text/image calls, not voice or clip-analysis provider kinds (migration 0025); its target names are not restricted to Content Studio. Script and rerank go through the existing attempt service with a video target type; `flow_video_provider_attempts` holds only voice, clip-analysis and stock calls.

## 3. Execution model

Video runs inside the application process, following the ADR 0006 pattern: one Flow-owned `VideoService` and one `VideoWorker` attached to the operator executor, four job kinds (import, analyse, voice, render), one video job at a time. Script writing and the AI rerank run synchronously through `CreativeAiGateway`; ADR 0007 extends ADR 0004's Content-only synchronous exception to these video text calls. There is no script job. ffmpeg runs as a low-priority child process with memory and time limits, no shell, minimal environment. Files are read and written as streams. Every outside call has a time limit and can fail only its own job or synchronous action. On restart, running video jobs become interrupted and are never retried automatically. Unlike ADR 0006's local-render exception, video renders are not re-queued automatically. The true risk of option A: a hard crash in Video Factory code leaves the executor lock, so the whole app (reports and Content Studio included) stays down until the manual stale-lock recovery runs. The owner re-confirmed option A on 25/10/2026 (F183) and asked for an automatic safe restart in slice 1: after 055 the app comes back by itself; 055 must prove the lock-owner process is gone before taking the lock, so there are never two writers. In slice 3, 057 decides how batch scripts are written (inside the queueing request, or by escalating to amend ADR 0007). Full reasoning and rejected alternatives: see ADR 0007.

## 4. Reuse from main

Decision for 055: Video Factory copies only the small helpers it needs — the process runner and its spawn options, `sha256File`, the secret-echo check and the answer parsing (`answerOf`) — into its own Flow or platform files, each with a source note. It does not change research-automation code, so Market and the reports are untouched and no cross-lane coordination is needed. Voice audio responses must stream: the research lane's bounded response reader holds the whole response in memory, so it is not reused for audio.

| Reused unit | What it gives | Change needed |
|---|---|---|
| `video-watch-gemini.ts` | Inline request shape, answer parsing (`answerOf`), capture log and key-echo refusal pattern | Copy the needed helpers with a source note; the video copy is called with no retry. Send the bounded low-res preview, not the original; adapt the prompt and response schema for descriptions, moments and crop. F1 decides CLIProxy with an official key or a direct official key; the current client only supports CLIProxy and has no File API |
| `video-watch-media.ts` | No-shell `createProcessRunner`, `minimalEnv`, streaming `sha256File`, ffprobe parsing; tests inject a fake runner | Copy the runner and its spawn options plus `sha256File` with a source note. Add render priority, memory limits and media hardening to the video copy; the copied runner provides time limits only |
| `provider-common.ts` | HTTPS host allowlist pattern, `bytesContainSecret` | Copy `bytesContainSecret` with a source note. The video host allowlist is Video Factory's own, not the shared constant; retain CLIProxy's separate local-route validation. Capture types are research-specific; adapt video audit records without widening report contracts |
| `content-brand-fact-check.ts` (`brandFactCheck`) | Base of the narration safety check (R-V03) | Covers the brand-fact part only; health and legal detection is new; 057 decides the method |
| `content-ai-attempt-service.ts` | One gateway call per attempt, one-running-attempt guard, schema check, sweeps any target type | Script and rerank go through it with a video target type |
| `content-ai-call-count.ts` | The «n lượt AI» counting pattern | Used for script and rewrite calls (F183) |
| `content-media-service.ts` | Brand logo constant and media handling | Reuse the brand logo for the video logo field |
| `owner-http.ts` | Existing typed error codes | Reuse for video routes; no new codes |

The application reads keys from environment variables. An operations file may supply them, but it is not an application credential reader. Keep keys out of child environments, logs, errors, API bodies and database rows. Do not record machine paths in these documents.

## 5. Design decisions from the 10 cuts (simplest-plan §2, owner-approved 25/10/2026)

1. No embeddings or vector search. Search is text search over stored English descriptions, then AI rerank; one search function keeps a later swap possible.
2. No word-level timing. A scene lasts as long as its voice audio.
3. No general provider framework. One small module per provider; «no automatic switch» holds because there is no switch code.
4. No second job system. Video jobs reuse the existing worker pattern (ADR 0006) with four kinds; one video job at a time.
5. No preset version tables. Each render keeps a frozen copy of the settings it used (R-V13).
6. No new Gemini client or process runner design; reuse by copying the small existing helpers, and the video copy of the Gemini client is called with no retry.
7. No second Gemini key next to CLIProxy until F1 is checked. If F1 is clean, reuse the CLIProxy route. If it uses an Antigravity login, report the existing research-lane risk for a separate owner decision; do not change research credentials in a video slice.
8. No soft delete with expiry. Delete is «Ẩn»/«Khôi phục»; nothing is purged in v1.
9. No global «Đang tạo» tray in v1. Progress shows on the video list and the video page.
10. No destructive drop folder. Files are copied in; the source is never moved or deleted; a file already imported (same fingerprint) is skipped.

## 6. Rules that span tasks

- Invalidation: editing the script takes the clip pick away from each changed scene and flags the scene; the voice of changed scenes is rebuilt and the video re-renders (until slice 3 adds keeping old picks, F179). Changing a scene's clip rebuilds the render. A retry returns to the entry state of that step. An approved video stays final until a re-render; the approved flag is a label only. The full transition table is a slice-1 task deliverable.
- Paid-call rule (R-V10): counts shown before every paid call; script and rewrite calls show «n lượt AI» and the script model is fixed in code (F183); stock clips are counted inside the «Phân tích n clip» confirmation and no analysis ever runs without that click; character counts for voice; one combined count before a batch is queued (slice 3); no automatic retries.
- Narration check (R-V03): from slice 3 a health, legal and brand-fact check runs on every video and «Bỏ qua duyệt» can never skip it; it builds on `brandFactCheck` for the brand-fact part only. Until slice 3 the owner's review at stops 1 and 3 is the only narration check, skip review does not exist before then, and videos from slices 1–2 are labelled «Chưa kiểm lời đọc» (F183).
- Transitions: in v1 a fade is placed inside each clip, so the video is never shorter than the voice. A test asserts video length equals audio length.

Script and setup (owner-approved 01/10/2026; only version reuse and clip retention move to slice 3 under F179):

- «Tạo video» starts a separate setup draft. Only «Tạo» creates a project; script edits autosave to that project. Resuming a waiting project preserves the setup draft; setup shows waiting script reviews and a link to the full list. (slice 1)
- Topic, Angle, brand, writing style, hook and length change words and are editable only at stop 1. Voice, music, logo and framing are editable at any review stop. Changes apply only to this video; no batch-wide edit in v1. Show settings used by the current version and pending settings separately. (slice 1)
- Before rewriting, save manual edits as version N. Lock the editor during the request. Save the result as N+1 tied to its exact input; reject stale results and writes. Failure unlocks unchanged N. A direct hook edit («Dùng làm cảnh 1») still works. (slice 1)
- A brand change requires re-picking incompatible Angle and brand preset choices; they stay pending until rewrite succeeds. An Angle change stays in the project. Each version records its source and effective settings; the campaign link follows the active version, old links remain, and batch membership does not change silently. (pending re-picks and campaign link: from slice 2; brand presets and batch membership: slice 3)
- History is read-only. From slice 3, «Dùng lại bản này» copies a version and its settings into N+1, returns to stop 1 and marks downstream output outdated. Back to stop 1 is available from stops 2 and 3. Toggling skip applies on the next processing start and never resumes by itself. (history read-only and back to stop 1: slice 1; «Dùng lại bản này» and the skip switch: slice 3)
- From slice 3, retain a clip pick only if the scene identity and English query are unchanged, the clip is eligible for the brand/collection, it covers one continuous cut, and its 9:16 crop fits the framing. Otherwise flag the scene at stop 2 and show «Lựa chọn trước»; enable reuse only when eligibility, duration and framing checks pass, with a reason otherwise. (slice 3)

## 7. Slices

Each slice ends with something the owner can try (owner build order, 01/10/2026).

| Slice / task | Scope | Lane | Owned paths | Acceptance | Must answer |
|---|---|---|---|---|---|
| 1 — 055 | Video menu, list, «Tạo video»; script through the AI gateway + stop 1; clip library upload and music library; stop 2 with owner picks; voice built against a fake voice (the F2 winner is connected only after F2 is recorded — the last slice-1 checkpoint); ffmpeg render with system + per-video settings, hard cut/fade + stop 3 + download with the «Chưa kiểm lời đọc» label; automatic safe restart after a hard crash; hide/restore clips, music and projects | Controlled (new paid voice provider; new execution boundary; shared executor-lock startup code) | `src/modules/flow/`, `src/platform/`, `src/api/` (incl. shared executor-lock startup), `contracts/api/`, `migrations/`, `frontend/`, `tests/`, `.github/workflows/`, `docs/` | The owner creates a video from a topic, chooses each clip by label, checks three stops and downloads it. CI is green with a fake voice; after deploy the owner makes one real video with a small voice budget set at deploy time (F183) | 055-Q1 full state/transition and script/setup contract, incl. scene length at stop 2 uses the script's target seconds and the rule when the real voice is longer than the picked clip (the fallback needs the owner's confirmation); 055-Q2 claim, sweep and cancel differences from ADR 0006; 055-Q3 automatic safe restart after a hard crash: prove the lock-owner process is gone before taking the lock, never two writers (shared startup/lock code; helps the whole app); 055-Q4 API dispatch, upload route/body limit, schema and generator registration, status schema, frontend route kinds; 055-Q5 version tokens; 055-Q6 provider attempts and text-call audit ownership (script and rerank through the existing attempt service; the video table holds voice, clip-analysis and stock only); 055-Q7 helper copying with source notes (no research-automation change); 055-Q8 size limits and streaming artifact-store/upload support; 055-Q9 rejection codes, proxy/thumbnail, HDR/VFR, ffmpeg hardening; 055-Q10 music states/moods; 055-Q11 lifecycle and hide/restore, no purge; 055-Q12 disk floor and original-clip backup/restore (owner decides off-host backup before merge); 055-Q13 scene-schema bounds; 055-Q14 F2 winner request limits/errors, voice-name and number pronunciation, webhook verification (if the winner needs a callback route, escalate to the owner before building it); 055-Q15 composition and clip fitting; 055-Q16 loudness/duration tolerances; 055-Q17 pinned CI ffmpeg/filter check, run across all CI shards or a new CI job; 055-Q18 migration numbers from current head (0060 next at af53534a), only tables needed |
| 2 — 056 | Gemini clip reading after the owner's click; top-3 suggestion; Pexels stock with add-to-library; Angle as script source; drop folder import; block no-match scenes at stop 2 | Controlled (new Gemini and stock boundaries) | `src/modules/flow/`, `src/platform/`, `src/api/`, `contracts/api/`, `migrations/`, `frontend/`, `tests/`, `docs/` | The owner creates a video from an Angle, confirms analysis counts, gets three eligible suggestions per scene and can change them; missing matches block stop 2 | 056-Q1 F1 before the Gemini route choice; 056-Q2 Gemini schema/enums/model, inline preview size limit, no retries (the video copy is called without retries), key delivery and the Video Factory's own reviewed hosts; 056-Q3 search contract and re-analysis versions; 056-Q4 analysis count including stock clips, counted inside the «Phân tích n clip» confirmation, no analysis without the click; 056-Q5 logo/face/text filters; 056-Q6 rerank schema and matching parameters; 056-Q7 stock order/count/minimum duration and Pexels caching/reuse terms; 056-Q8 stable-file scan every few minutes plus «Quét thư mục», copy-verify and duplicate skip |
| 3 — 057 | Narration safety check outside skip; «Bỏ qua duyệt» and batch with one combined count; no-match scenes fail clearly with skip on; brand preset layer; second voice provider; Pixabay; slide transition; script reuse and keeping old picks | Controlled (new provider boundaries; unattended paid calls possible) | `src/modules/flow/`, `src/platform/`, `src/api/`, `contracts/api/`, `migrations/`, `frontend/`, `tests/`, `docs/` | After O3/O4 are answered, the owner runs a permitted batch with skip on; every video passed the narration check; a missing match fails clearly without black frames | 057-Q1 O3 and O4 before enabling skip; 057-Q2 batch entity, maximum N, fairness and cancel; 057-Q3 how batch scripts are written (inside the queueing request, or escalate to amend ADR 0007, see §3); 057-Q4 narration-check method and outcomes (health and legal detection is new; the brand-fact part exists already); 057-Q5 second voice provider request limits/errors and pronunciation; 057-Q6 Pixabay caching/reuse terms; 057-Q7 slide timing without shortening video; 057-Q8 the five clip-retention checks and version reuse in §6; 057-Q9 brand defaults on frozen render snapshots |
| 4 — 058 | Fedora live qualification of the whole pipeline with real calls | Controlled | `docs/` runbook, status, handoff and sanitized evidence references; private evidence outside Git | Recorded qualification at the merged implementation SHA with green Linux CI; merge needs the owner's OK; deploy only on «deploy <SHA>» | 058-Q1 a per-provider call budget set by the owner before the run; 058-Q2 stop rules; 058-Q3 evidence fields; 058-Q4 no retry during the run |

Three slices (055–057) land one after another; each merge needs the owner's OK, and deployment happens only on the owner's «deploy <SHA>».

Each implementation task narrows the directory set above to explicit owned files before coding. It must name minimum verification and escalation conditions. Use numbered contract rows, one negative control per row, injected transports and a fake process runner; one CI smoke uses tiny synthetic clips. Verify restart by state × job kind: only running rows become interrupted. Use affected static checks and behavior tests; Linux CI at the final SHA is the final gate. Do not run the full local suite. Update the runbook, STATUS and handoff with each slice. Escalate unresolved owner decisions or changed provider/process boundaries; fixes apply system-wide, not to one run.

055 opens with its numbered contract table (rows 055-Q1…, split "before coding" and "before merge"): GLM drafts it, a fresh Sol session reviews it, the coordinator checks it, and open questions go to the owner; GLM writes code only after the table is committed and reviewed. 055 runs in four checkpoints, each green on CI before the next starts: (1) schema, worker, sweep, fake runner and the automatic safe restart; (2) script, stops 1–2 and the libraries; (3) render with fake voice, stop 3 and download with the «Chưa kiểm lời đọc» label; (4) the F2 voice adapter. The automatic safe restart touches the shared executor-lock startup code and helps the whole app, not only Video Factory.

Shared screen states belong to slice 1: empty, queued/running with progress, failed with a safe message and manual retry, interrupted, stale version with unsaved input preserved, missing clip, unconfigured provider, hidden/restorable and clearly marked demo data. Slice 2 adds analysis and matching states; slice 3 adds batch and skip states.

Use the Video Factory-only workers (25/10/2026, F173/F175): GLM 5.3 Flash writes code; a separate Sol 6.1 xhigh session writes tests; another fresh Sol 6.1 xhigh session reviews. Before slice 1, check GLM availability and CI ffmpeg provisioning. At af53534a, tasks 054–058 and ADR 0007 are free; 052 is reserved by 047. Re-check numbering at the implementation head; do not add a D-number to INTENT.

Risk and recovery table for the Controlled slices:

| Risk | Control | Recovery |
|---|---|---|
| Provider failure or slow provider | Per-call time limit; typed error; no automatic retry (R-V10, R-V11, R-V14) | Only the failed job stops; the owner presses «Thử lại» |
| Interrupted job after restart | Running jobs marked interrupted by the executor sweep (ADR 0004/0006 pattern) | Never retried automatically; the owner restarts the step |
| Cost or ambiguous charge (055–058; unattended batches only in 057) | Counts before calls, bounded stock analyses, one combined batch count; O3/O4 before skip; owner-set per-provider budget and stop rules for 058 | Stop the step or cancel queued work; retain known/unknown charge evidence; no automatic retry or account switch; owner decides whether to retry |

## 8. Risks

| Risk | Mitigation |
|---|---|
| Render starves the operator | ffmpeg child at low priority; memory and time limits; one video job at a time (ADR 0007). |
| Crash in app code | A hard crash leaves the executor lock: the app stays down until the manual stale-lock recovery runs. Slice 1 (055) adds an automatic safe restart, proving the lock-owner process is gone before taking the lock (never two writers); the sweep marks running rows interrupted and they are never retried automatically; manual «Thử lại»; a restart test per job kind. |
| Credential leak | Environment variables, host allowlist, secret-echo check; keys never in logs, errors, API bodies or DB rows; tests assert absence. |
| Wrong or unsafe clip in a brand video | Collections (R-V07); recorded logo, face and text facts; stop 2 on by default. |
| Licence violation | Source + licence mandatory for stock (R-V05) and music (R-V09); AI clips never enter the library (R-V06). |
| Disk growth | No automatic purge in v1. Slice 1 must define free-space status and the floor below which new renders are refused. |
| Vietnamese voice quality | Listening test F2 before choosing the default; both providers kept. |
| Health-claim narration | Until slice 3 the owner's review at stops 1 and 3 is the only narration check and videos from slices 1–2 are labelled «Chưa kiểm lời đọc» (F183); from slice 3 an automated check runs on every video and «Bỏ qua duyệt» cannot skip it (R-V03). |
| Hostile media files parsed by ffmpeg or ffprobe | Protocol whitelist, time limits, refuse symlinks and hard links; add these controls to the reused runner and process files as streams. |
| Backup of original clips | Originals cannot be regenerated; DB backup alone is not enough. No backup or restore procedure for video files exists today. The owner decides about off-host backup of originals and sets the disk floor before 055 merges; slice 1 must answer how to back up and restore originals with the database. |
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
| F2 | Vbee vs ElevenLabs Vietnamese listening test | Open; owner listens; small paid calls need the owner's OK. Needed before 055 connects a real voice provider. |
| F3 | ffmpeg 8.0.1 with xfade, loudnorm, sidechaincompress | Done 25/10/2026. |
| F4 | Remotion licence terms | Phase 2 only. |

Preconditions recorded 25/10/2026: GLM 5.3 Flash availability checked (works through opencode); helpers are copied, not extracted, so no Market coordination is needed; ADR 0007 becomes Accepted when the owner approves this PR.

Rejected or declined by the owner (do not re-propose): every notivn/AIEV idea — whisper alignment, QC gate, VieNeu-TTS, SFX (01/10/2026).
