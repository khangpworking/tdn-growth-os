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
| Pipeline | Topic/Angle → script → review stop → pick b-roll → review stop → voice + music → ffmpeg render → review stop → download. |
| Review stops | Three stops: script, scene picks, final video. Stops on by default. Per-video «Bỏ qua duyệt» switch. A requested rewrite always stops at stop 1 (script vs setup, 01/10/2026). |
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

Video Factory lives in Box 4 (Flow). Code goes under `src/modules/flow/video-*`. Tables are named `flow_video_*`. Read brand, campaign and Angle data only through Flow services. Content Studio is the Caption & Poster flow shown as «Nội dung»; Video Factory is a separate flow. The new provider attempts table is `flow_video_provider_attempts`. Task 049's table accepts creative text/image calls, not voice or clip-analysis provider kinds (migration 0025); its target names are not restricted to Content Studio. Slice 1 must define audit ownership for script and rerank calls without duplicate attempts.

## 3. Execution model

Video runs inside the application process, following the ADR 0006 pattern: one Flow-owned `VideoService` and one `VideoWorker` attached to the operator executor, four job kinds (import, analyse, voice, render), one video job at a time. Script writing and the AI rerank run synchronously through `CreativeAiGateway`; ADR 0007 extends ADR 0004's Content-only synchronous exception to these video text calls. There is no script job. ffmpeg runs as a low-priority child process with memory and time limits, no shell, minimal environment. Files are read and written as streams. Every outside call has a time limit and can fail only its own job or synchronous action. On restart, running video jobs become interrupted and are never retried automatically. Unlike ADR 0006's local-render exception, video renders are not re-queued automatically. The accepted risk: a bug in Video Factory code itself can restart the app (owner accepted 25/10/2026, F177). Full reasoning and rejected alternatives: see ADR 0007.

## 4. Reuse from main

| Reused unit | What it gives | Change needed |
|---|---|---|
| `video-watch-gemini.ts` | Inline request shape, bounded response reader, `answerOf`, capture log, key-echo refusal | Remove its hard-coded retry; send the bounded low-res preview, not the original; adapt the prompt and response schema for descriptions, moments and crop. F1 decides CLIProxy with an official key or a direct official key; the current client only supports CLIProxy and has no File API |
| `video-watch-media.ts` | No-shell `createProcessRunner`, `minimalEnv`, streaming `sha256File`, ffprobe parsing; tests inject a fake runner | `minimalEnv`, `sha256File` and `probe` are private. Extract only needed helpers with Market coordination. Add render priority, memory limits and media hardening; the runner currently provides time limits only |
| `provider-common.ts` | HTTPS host allowlist pattern, `bytesContainSecret` | Its fixed allowlist has no video-provider hosts. Add reviewed hosts for direct providers; retain CLIProxy's separate local-route validation. Capture types are research-specific; adapt video audit records without widening report contracts |
| `content-brand-fact-check.ts` (`brandFactCheck`) | Base of the narration safety check (R-V03) | Extend for health and legal claims on video narration |

The application reads keys from environment variables. An operations file may supply them, but it is not an application credential reader. Keep keys out of child environments, logs, errors, API bodies and database rows. Do not record machine paths in these documents.

## 5. Design decisions from the 10 cuts (simplest-plan §2, owner-approved 25/10/2026)

1. No embeddings or vector search. Search is text search over stored English descriptions, then AI rerank; one search function keeps a later swap possible.
2. No word-level timing. A scene lasts as long as its voice audio.
3. No general provider framework. One small module per provider; «no automatic switch» holds because there is no switch code.
4. No second job system. Video jobs reuse the existing worker pattern (ADR 0006) with four kinds; one video job at a time.
5. No preset version tables. Each render keeps a frozen copy of the settings it used (R-V13).
6. No new Gemini, ffprobe and process code. Reuse the video-watch units with retries set to 0.
7. No second Gemini key next to CLIProxy until F1 is checked. If F1 is clean, reuse the CLIProxy route. If it uses an Antigravity login, report the existing research-lane risk for a separate owner decision; do not change research credentials in a video slice.
8. No soft delete with expiry. Delete is «Ẩn»/«Khôi phục»; nothing is purged in v1.
9. No global «Đang tạo» tray in v1. Progress shows on the video list and the video page.
10. No destructive drop folder. Files are copied in; the source is never moved or deleted; a file already imported (same fingerprint) is skipped.

## 6. Rules that span tasks

- Invalidation: editing the script re-picks clips for changed scenes and rebuilds voice and render (until slice 3 adds keeping old picks, F179). Changing a scene's clip rebuilds the render. A retry returns to the entry state of that step. An approved video stays final until a re-render; the approved flag is a label only. The full transition table is a slice-1 task deliverable.
- Paid-call rule (R-V10): counts shown before every paid call, including a bounded maximum for stock-triggered analyses; character counts for voice; the analysis click; one combined count before queueing a batch; no automatic retries.
- Narration check (R-V03): health, legal and brand-fact check on every video; «Bỏ qua duyệt» can never skip it; built on `brandFactCheck`.
- Transitions: in v1 a fade is placed inside each clip, so the video is never shorter than the voice. A test asserts video length equals audio length.

Script and setup (owner-approved 01/10/2026; only version reuse and clip retention move to slice 3 under F179):

- «Tạo video» starts a separate setup draft. Only «Tạo» creates a project; script edits autosave to that project. Resuming a waiting project preserves the setup draft; setup shows waiting script reviews and a link to the full list.
- Topic, Angle, brand, writing style, hook and length change words and are editable only at stop 1. Voice, music, logo and framing are editable at any review stop. Changes apply only to this video; no batch-wide edit in v1. Show settings used by the current version and pending settings separately.
- Before rewriting, save manual edits as version N. Lock the editor during the request. Save the result as N+1 tied to its exact input; reject stale results and writes. Failure unlocks unchanged N. A direct hook edit («Dùng làm cảnh 1») still works.
- A brand change requires re-picking incompatible Angle and brand preset choices; they stay pending until rewrite succeeds. An Angle change stays in the project. Each version records its source and effective settings; the campaign link follows the active version, old links remain, and batch membership does not change silently.
- History is read-only. From slice 3, «Dùng lại bản này» copies a version and its settings into N+1, returns to stop 1 and marks downstream output outdated. Back to stop 1 is available from stops 2 and 3. Toggling skip applies on the next processing start and never resumes by itself.
- From slice 3, retain a clip pick only if the scene identity and English query are unchanged, the clip is eligible for the brand/collection, it covers one continuous cut, and its 9:16 crop fits the framing. Otherwise flag the scene at stop 2 and show «Lựa chọn trước»; enable reuse only when eligibility, duration and framing checks pass, with a reason otherwise.

## 7. Slices

Each slice ends with something the owner can try (owner build order, 01/10/2026).

| Slice / task | Scope | Lane | Owned paths | Acceptance | Must answer |
|---|---|---|---|---|---|
| 1 — 055 | Video menu, list, «Tạo video»; script through the AI gateway + stop 1; clip library upload and music library; stop 2 with owner picks; F2-winning voice; ffmpeg render with system + per-video settings, hard cut/fade + stop 3 + download; hide/restore clips, music and projects | Controlled (new paid voice provider; new execution boundary) | `src/modules/flow/`, `src/platform/`, `src/api/`, `contracts/api/`, `migrations/`, `frontend/`, `tests/`, `.github/workflows/`, `docs/` | The owner creates a video from a topic, chooses each clip by label, checks three stops and downloads it | Full state/transition and script/setup contract; claim, sweep and cancel differences from ADR 0006; API dispatch, upload route/body limit, schema and generator registration, status schema, frontend route kinds; version tokens; provider attempts and text-call audit ownership; coordinated helper extraction; size limits and streaming artifact-store/upload support; rejection codes, proxy/thumbnail, HDR/VFR, ffmpeg hardening; music states/moods; lifecycle and hide/restore, no purge; disk floor and original-clip backup/restore; scene-schema bounds; F2 winner request limits/errors, voice-name/number pronunciation and webhook verification; composition and clip fitting; loudness/duration tolerances; pinned CI ffmpeg/filter check and responsible shard; migration numbers from current head (0060 next at af53534a), only tables needed |
| 2 — 056 | Gemini clip reading after the owner's click; top-3 suggestion; Pexels stock with add-to-library; Angle as script source; drop folder import; block no-match scenes at stop 2 | Controlled (new Gemini and stock boundaries) | `src/modules/flow/`, `src/platform/`, `src/api/`, `contracts/api/`, `migrations/`, `frontend/`, `tests/`, `docs/` | The owner creates a video from an Angle, confirms analysis counts, gets three eligible suggestions per scene and can change them; missing matches block stop 2 | F1 before route choice; Gemini schema/enums/model, inline preview size limit, retries = 0, key delivery and reviewed hosts; search contract and re-analysis versions; analysis count including stock-triggered maximum; logo/face/text filters; rerank schema and matching parameters; stock order/count/minimum duration and Pexels caching/reuse terms; stable-file scan every few minutes plus «Quét thư mục», copy-verify and duplicate skip |
| 3 — 057 | Narration safety check outside skip; «Bỏ qua duyệt» and batch with one combined count; no-match scenes fail clearly with skip on; brand preset layer; second voice provider; Pixabay; slide transition; script reuse and keeping old picks | Controlled (new provider boundaries; unattended paid calls possible) | `src/modules/flow/`, `src/platform/`, `src/api/`, `contracts/api/`, `migrations/`, `frontend/`, `tests/`, `docs/` | After O3/O4 are answered, the owner runs a permitted batch with skip on; every video passed the narration check; a missing match fails clearly without black frames | O3 and O4 before enabling skip; batch entity, maximum N, fairness and cancel; narration-check outcomes; second voice provider request limits/errors and pronunciation; Pixabay caching/reuse terms; slide timing without shortening video; the five clip-retention checks and version reuse in §6; brand defaults on frozen render snapshots |
| 4 — 058 | Fedora live qualification of the whole pipeline with real calls | Controlled | `docs/` runbook, status, handoff and sanitized evidence references; private evidence outside Git | Recorded qualification at the merged implementation SHA with green Linux CI; merge needs the owner's OK; deploy only on «deploy <SHA>» | A per-provider call budget set by the owner before the run; stop rules; evidence fields; no retry during the run |

Three slices (055–057) land one after another; each merge needs the owner's OK, and deployment happens only on the owner's «deploy <SHA>».

Each implementation task narrows the directory set above to explicit owned files before coding. It must name minimum verification and escalation conditions. Use numbered contract rows, one negative control per row, injected transports and a fake process runner; one CI smoke uses tiny synthetic clips. Verify restart by state × job kind: only running rows become interrupted. Use affected static checks and behavior tests; Linux CI at the final SHA is the final gate. Do not run the full local suite. Update the runbook, STATUS and handoff with each slice. Escalate unresolved owner decisions or changed provider/process boundaries; fixes apply system-wide, not to one run.

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
| Crash leaves running rows | Executor sweep marks them interrupted; manual «Thử lại»; a restart test per job kind. |
| Credential leak | Environment variables, host allowlist, secret-echo check; keys never in logs, errors, API bodies or DB rows; tests assert absence. |
| Wrong or unsafe clip in a brand video | Collections (R-V07); recorded logo, face and text facts; stop 2 on by default. |
| Licence violation | Source + licence mandatory for stock (R-V05) and music (R-V09); AI clips never enter the library (R-V06). |
| Disk growth | No automatic purge in v1. Slice 1 must define free-space status and the floor below which new renders are refused. |
| Vietnamese voice quality | Listening test F2 before choosing the default; both providers kept. |
| Health-claim narration | Automated narration check on every video; «Bỏ qua duyệt» cannot skip it (R-V03; architecture health and legal gates). |
| Hostile media files parsed by ffmpeg or ffprobe | Protocol whitelist, time limits, refuse symlinks and hard links; add these controls to the reused runner and process files as streams. |
| Backup of original clips | Originals cannot be regenerated; DB backup alone is not enough. Slice 1 must answer how to back up and restore originals with the database; current backup coverage must not be assumed to include video files. |
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
