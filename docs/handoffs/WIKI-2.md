# Handoff — WIKI-2 OpenWiki

Updated: 2026-10-09
Worktree/branch: assigned WIKI-2 worktree; `pkg/WIKI-2-openwiki`
Completed: generated repository wiki, ten-page source review, three correction rounds, supplemental wiki-agent QA.
Changed paths: `openwiki/`; OpenWiki blocks only in `AGENTS.md` and `CLAUDE.md`; maintenance guide; this handoff. Ignore/dependencies/application code unchanged.
Evidence: checked main `2b44e4bcf75ac3bfd2a5d3a0de679a0fcb1a48ad`; generation baseline commit `b089ece9d0272d54719d6740faf34e4396878a25`.
Unresolved: CodeGraph index absent; two pages retain code-derived frontmatter and no description; final update was not a clean no-op; base drift and two generated trailing-whitespace errors remain escalated. No manual generated-page edits.
Next action: coordinator/owner reviews draft PR and escalated gates; three correction rounds are exhausted, so do not rebase or regenerate. No merge/deployment authorized.
Business decisions pending: none introduced.

## Checklist evidence — B-01–B-10

| Item | Result | Evidence |
|---|---|---|
| B-01 | ESCALATED base drift | Branch started at required checked SHA; origin/main advanced to c4f22331d7359289138fb7ef5fbc1c22842921ed after all three correction rounds. No rebase/regeneration. |
| B-02 | DONE | npm global metadata: OpenWiki 0.7.1; Node v22.23.2; initial help provider OpenAI, final interactive update labels OpenAI-compatible; model gpt-5.6-terra. No key/environment-file inspection. |
| B-03 | DONE | Authorized init exited 0; original INSTRUCTIONS text retained, evidenced corrections appended. Telemetry/Do Not Track on, LangChain tracing false on every invocation. |
| B-04 | DONE | Checkpoint removed only after process completion; no committed workflow or runtime checkpoint. |
| B-05 | DONE | Only managed blocks changed; required startup reading, CodeGraph role, owner/rule authority and no scheduling restored. Outside-block comparison passed. |
| B-06 | PARTIAL | Ten-page review below completed. CodeGraph explore failed because no index; direct code inspection used, no index initialized without authorization. |
| B-07 | DONE with metadata limitation | Checked SHA, delivery standing, source paths and rule pointers repaired; private-path/IP scan and JSON/local-link checks passed. Two metadata descriptions remain absent. |
| B-08 | PASS | Coordinator-run exact W1 Q1–Q3 all matched source at checked SHA 2b44e4bcf75ac3bfd2a5d3a0de679a0fcb1a48ad; 3/3 PASS, recorded below. |
| B-09 | ESCALATED stability acceptance | Committed baseline then authorized bare update; actual generated-page changes and interrupted source checkpoint, detailed below. |
| B-10 | DONE at publication | This template-based handoff, scoped commits, own-branch push and draft PR only. |

## Ten-page review

Both Market lanes were checked independently on the same page. Glossary and quickstart were additionally reviewed. Fixes used brief notes and regeneration, never hand-edited generated pages.

| Page | Files read | Wrong claim / finding | Fix and final result |
|---|---|---|---|
| `openwiki/architecture/modular-monolith.md` | ARCHITECTURE.md; AGENTS.md; src/api/owner-api.ts; src/api/operator-app.ts; src/modules/foundation/index.ts; migrations/0030_analysis_report_versions.sql | Overlong guidance; no confirmed behavioral error; initially suspected relative-link error was disproved. | Round 1 shortened; checked SHA and owning paths retained. Verified corrected after rounds 1–3; metadata caveat above applies to Market/package pages. |
| `openwiki/workflows/research-report-lifecycle.md` | src/modules/analysis/report-version-service.ts; src/modules/analysis/report-review-target-ledger.ts; src/modules/analysis/metric-input-preparation-service.ts; docs/adr/0005-report-evidence-and-decision-ledger.md; docs/STATUS.md | Historical PR #177 merge substituted for checked base; behavior described without source paths; separate report workflows insufficiently distinguished. | Correction note; regenerate and recheck. Verified corrected after rounds 1–3; metadata caveat above applies to Market/package pages. |
| `openwiki/concepts/market-report-lanes.md` | src/modules/analysis/reader-report/build.ts; src/modules/analysis/reader-report/market-template.ts; src/modules/analysis/research-automation/reader-report-revisions.ts; src/modules/analysis/research-automation/service.ts; docs/STATUS.md | Missing checked base; package U-32 called business rule; code claims lacked paths; generated frontmatter lacked description. | Round 1 adds base, paths, description and links rule 3/L5 for legacy divergence. Reader and governed draft checked separately. Verified corrected after rounds 1–3; metadata caveat above applies to Market/package pages. |
| `openwiki/concepts/thirty-report-sections.md` | docs/STATUS.md; docs/tasks/ultimate-v1.11-tdn-sync-plan.md; src/modules/analysis/research-automation/reports.ts; src/modules/analysis/research-automation/index.ts | Old SHA and blanket open PR #110 status; builders named without paths. | Round 1 fixes base/status and adds 30 owning paths; follow-up separates reader spec intake. Verified corrected after rounds 1–3; metadata caveat above applies to Market/package pages. |
| `openwiki/integrations/data-source-registry.md` | docs/research/ultimate-method/input-data-sources-30-sections.md; docs/STATUS.md; src/modules/analysis/research-automation/source-status.ts; src/modules/analysis/research-automation/model.ts | Old checked SHA; source-use policy paraphrases; incomplete current-source integration standing. | Correction note; regenerate and recheck. Verified corrected after rounds 1–3; metadata caveat above applies to Market/package pages. |
| `openwiki/workflows/ultimate-alignment-packages.md` | docs/tasks/ultimate-v1.11-tdn-sync-plan.md; docs/tasks/research-batch-2-packages.md; docs/STATUS.md | PR #172 merge substituted as checked base; stale writer leases presented as current; abbreviated code paths. | Correction note; regenerate and recheck. Verified corrected after rounds 1–3; metadata caveat above applies to Market/package pages. |
| `openwiki/operations/decisions-and-authority.md` | INTENT.md; ARCHITECTURE.md; AGENTS.md; docs/adr/0002-react-vite-typescript-frontend.md; docs/adr/0005-report-evidence-and-decision-ledger.md | Business authority hierarchy paraphrased despite rule-pointer-only scope. | Correction note; regenerate and recheck. Verified corrected after rounds 1–3; metadata caveat above applies to Market/package pages. |
| `openwiki/operations/runtime-and-persistence.md` | src/platform/db/database.ts; src/platform/artifacts/artifact-store.ts; src/modules/analysis/research-automation/worker.ts; src/api/operator-app.ts; ARCHITECTURE.md | Literal loopback IP; repository behavior called deployed behavior. | Correction note; regenerate and recheck. Verified corrected after rounds 1–3; metadata caveat above applies to Market/package pages. |
| `openwiki/workflows/operator-workspaces-and-approval.md` | src/api/owner-api.ts; src/api/operator-app.ts; src/modules/analysis/report-review-target-ledger.ts; AGENTS.md | Missing checked base and source paths; literal loopback IP. | Correction note; regenerate and recheck. Verified corrected after rounds 1–3; metadata caveat above applies to Market/package pages. |
| `openwiki/testing/verification-and-replay.md` | package.json; AGENTS.md; docs/tasks/research-batch-2-packages.md; src/modules/analysis/report-version-service.ts | Historical batch SHA and inaccurate claim Git metadata unavailable; behavioral claims without paths; excessive test-authoring guidance. | Correction note; regenerate and recheck. Verified corrected after rounds 1–3; metadata caveat above applies to Market/package pages. |

Final round specifically added merged-on-main standing to architecture and verification, changed lifecycle standing to merged on main, and repaired the E14 section anchor. Source inspection establishes repository behavior only; application tests, deployment and live connector operation were not executed. Legacy reader divergence cites linked rule 3/L5; current reader arithmetic is per platform. Rule bodies remain in Ultimate.

## Exact W1 evidence — coordinator-run

The coordinator supplied the exact W1 evidence below. All three answers matched source at checked SHA `2b44e4bcf75ac3bfd2a5d3a0de679a0fcb1a48ad`; B-08 and active G-10 are PASS. This replacement worker records that evidence without rerunning OpenWiki or claiming a new source review.

| Question | Answer and source evidence | Result |
|---|---|---|
| Q1 — owner-read lane and governed auto draft | Owner-read lane = Market Reader Report: `src/modules/analysis/reader-report/build.ts`, `src/modules/analysis/reader-report/market-template.ts`, `src/modules/analysis/research-automation/reader-report-revisions.ts`, `src/modules/analysis/research-automation/service.ts`, `src/api/research-automation-api.ts` and migration 0048. Governed auto draft = `src/modules/analysis/research-automation/reports.ts`. | PASS at checked SHA |
| Q2 — business-rule authority and divergence | Business rules live in `docs/research/ultimate-method/ultimate-method-30-sections.md`, with business rows in `docs/research/ultimate-method/CHANGELOG.md`. The written rule wins business authority; divergence is reported as code differs from rule ID. | PASS at checked SHA |
| Q3 — sources/packages | S07/S14 → P9/U-19; S15 → U-23; S19/S20 → P5; S21/S23 → P10/U-24. S03, S06, S08–S13, S16–S18, S24, S26 and S27 have no explicit collector package assignment. | PASS at checked SHA |

## Timing and cost

| Run | Observed elapsed | Cost |
|---|---|---|
| Init | Start 01:23:29.255 UTC; first post-exit observation 01:54:42 UTC; approximately 31 minutes (31m13s to observation). | Not visible |
| Correction 1 | 01:54:59.029–02:25:56.980 UTC; 30m57.951s | Not visible |
| Correction 2 | 02:26:52.838–02:44:11.238 UTC; 17m18.400s | Not visible |
| Correction 3, final | 02:45:12.359–02:49:24.476 UTC; 4m12.117s | Not visible |

Times for correction runs use checkpoint start/completion metadata, not billing runtime. Initial init did not advance its checkpoint because source changed while it was running; correction 1 reconciled that state.

## Guide corrections and loop control

Maintenance guide now documents authorized private-config preflight without inspecting/exporting keys, telemetry/tracing flags, npm version metadata instead of unsupported --version, non-TTY help failure, ten-page initial review, optional wiki retrieval after required startup reading, generated-block rewrites and false scheduled-workflow claims, post-exit checkpoint cleanup, bootstrap workflow removal, own-branch draft publication and empirical unchanged-update acceptance. Initial setup runbook was outside allowed edit scope and remains unchanged.

Three evidenced correction rounds only: round 1 fixed stale SHA/status, rule paraphrases, source citations and private/IP text; round 2 fixed source-section anchors, M08 reader/native standing and missing source paths; round 3 fixed delivery labels and E14 href. No fourth content-fix round. Help had one Ink non-TTY crash; no repeated crash. Model compatibility warnings did not prevent successful generation. LangSmith remained unconfigured/skipped with tracing false.

## ACTIVE goal gates

These are the active goal gates, replacing the unrelated prior self-check.

| Gate | Result | Evidence |
|---|---|---|
| G-1 | ESCALATED | Required checked base was 2b44e4bcf75ac3bfd2a5d3a0de679a0fcb1a48ad; origin/main advanced to c4f22331d7359289138fb7ef5fbc1c22842921ed after all three rounds. Limit exhausted; no rebase/regeneration. |
| G-7 | PASS | Generator evidence: telemetry off, tracing false, `.run.json` absent after completion, allowed paths checked. Replacement worker made no generator/provider call. |
| G-8 | PASS (generator evidence) | Managed blocks only; outside-block comparison passed. Replacement worker preserves pre-existing uncommitted AGENTS.md/CLAUDE.md changes. |
| G-9 | PASS with recorded metadata limitation | Ten-page source/content/SHA review above; checked SHA retained. Two generated descriptions remain absent. |
| G-10 | PASS | Exact coordinator-run W1 Q1–Q3 matched source, 3/3. |
| G-11 | ESCALATED | Final update changed generated bodies/metadata and retained interrupted source checkpoint; not a clean no-op. |
| G-12 | ESCALATED overall | Safety/path checks recorded; origin/main advanced to c4f22331d7359289138fb7ef5fbc1c22842921ed after all three rounds, and two generated trailing-whitespace errors remain. No fourth round or rebase. |
| G-13 | PARTIAL pending clean tree | B-01–B-10 rows recorded; generator publication reported clean tree. Replacement worker found pre-existing uncommitted AGENTS.md/CLAUDE.md changes and preserves them under the handoff-only edit restriction. Scoped commit/push and draft PR update are authorized; current tree cannot honestly be called clean. |

Static verification: working-tree git diff --check passed, but final base-to-HEAD check failed as recorded below; JSON parse; checked-base presence on all 12 substantive pages; local Markdown target files resolve; managed-block outside text equals base; private path/IP scan; allowed-path/dependency/workflow checks. Generated Mermaid validation is tool-reported; no independent browser render or application suite run.


## B-09 actual update observation

Invocation started 02:49:52 UTC. Bare --update entered first-run TTY setup; existing repository was confirmed, LangSmith skipped, and run selected without inspecting secrets. Setup displayed OpenAI-compatible / gpt-5.6-terra. Run checkpoint start 02:51:03.342 UTC; final metadata 02:59:15.523 UTC (8m12.181s); CLI reports 8m13s. Cost not visible.

Raw diff against committed baseline: 12 tracked paths, 114 insertions / 53 deletions: AGENTS.md, CLAUDE.md, four page claim sidecars (architecture, authority, verification, lifecycle), .last-update.json, .page-manifest.json, and those four Markdown pages. CLI reported two changed page bodies (architecture and verification); authority/lifecycle changed verification timestamps only. Architecture clarified ledger/user_version must match rather than merely not lag the head, consistent with src/api/operator-app.ts. Verification retained NOT EXECUTED and separated delivery from check standing. No content correction run followed.

The handoff was created during the update. OpenWiki detected source changes, exited 0 and finalized pages without advancing the source checkpoint: .last-update.json remains status interrupted at the checked base, and .run.json is absent. This is not a valid frozen-input no-op demonstration. Both instruction blocks were restored to the approved committed text afterward. No generated Markdown, sidecar, manifest or update metadata was hand-edited. Expected metadata-only acceptance is ESCALATED; stop at three content-fix rounds. Future clean-input reconciliation needs separate authorization/review.

## Publication

Draft PR: https://github.com/khangpworking/tdn-growth-os/pull/196

Own branch pkg/WIKI-2-openwiki pushed only. Review commits: b089ece (generated baseline), 8d1dc08 (update observation/handoff), followed by this publication-record commit. Coordinator-run exact W1 confirmed 3/3 matches at checked main; see Q1–Q3 above. No merge, deployment, scheduling or CI workflow created.

## Final base-diff check limitation

`git diff --check origin/main...HEAD` failed on generated Markdown hard-break trailing spaces: openwiki/operations/runtime-and-persistence.md:51 and openwiki/workflows/operator-workspaces-and-approval.md:45. Earlier working-tree checks did not include the initially untracked generated pages and later checks compared already committed pages. Therefore the overall base-diff whitespace gate is ESCALATED, not PASS. No hand-edit or fourth regeneration round was performed. Generator publication reported a clean worktree. The replacement worker found pre-existing AGENTS.md/CLAUDE.md changes and leaves them untouched; draft remains for review with the recorded limitations.

## Replacement evidence-only publication

Only this handoff and draft PR #196 body are updated by the replacement worker. No OpenWiki invocation, generated-page edit, config change, key-file read, rebase or regeneration. Pre-existing AGENTS.md/CLAUDE.md changes are excluded from the commit and preserved. Checked remote-tracking base equals the supplied advanced SHA; exact W1 evidence is coordinator-supplied.
