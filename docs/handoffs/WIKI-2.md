# Handoff — WIKI-2 OpenWiki

Updated: 2026-10-09
Worktree/branch: assigned WIKI-2 worktree; `pkg/WIKI-2-openwiki`
Completed: generated repository wiki, ten-page source review, three correction rounds, supplemental wiki-agent QA.
Changed paths: `openwiki/`; OpenWiki blocks only in `AGENTS.md` and `CLAUDE.md`; maintenance guide; this handoff. Ignore/dependencies/application code unchanged.
Evidence: checked main `2b44e4bcf75ac3bfd2a5d3a0de679a0fcb1a48ad`; generation baseline commit `b089ece9d0272d54719d6740faf34e4396878a25`.
Unresolved: exact three owner-goal questions were absent (get_goal returned null); CodeGraph index absent; two pages retain code-derived frontmatter and no description. No manual generated-page edits.
Next action: owner reviews draft PR and supplies exact W1 questions if required; no merge/deployment authorized.
Business decisions pending: none introduced.

## Checklist evidence — B-01–B-10

| Item | Result | Evidence |
|---|---|---|
| B-01 | DONE | Fetched origin/main and verified exact required SHA; own branch created from it. |
| B-02 | DONE | npm global metadata: OpenWiki 0.7.1; Node v22.23.2; initial help provider OpenAI, final interactive update labels OpenAI-compatible; model gpt-5.6-terra. No key/environment-file inspection. |
| B-03 | DONE | Authorized init exited 0; original INSTRUCTIONS text retained, evidenced corrections appended. Telemetry/Do Not Track on, LangChain tracing false on every invocation. |
| B-04 | DONE | Checkpoint removed only after process completion; no committed workflow or runtime checkpoint. |
| B-05 | DONE | Only managed blocks changed; required startup reading, CodeGraph role, owner/rule authority and no scheduling restored. Outside-block comparison passed. |
| B-06 | PARTIAL | Ten-page review below completed. CodeGraph explore failed because no index; direct code inspection used, no index initialized without authorization. |
| B-07 | DONE with metadata limitation | Checked SHA, delivery standing, source paths and rule pointers repaired; private-path/IP scan and JSON/local-link checks passed. Two metadata descriptions remain absent. |
| B-08 | ESCALATED exact-goal gate | Supplemental guide questions match 3/3 before and after regeneration; unavailable original questions cannot honestly be claimed tested. |
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

## W1 supplemental QA

Questions are exact phrases used from the guide, not asserted to be the unavailable original goal questions. Agent read generated wiki only; parent compared answers with source/docs at checked main. Final re-ask produced the same meanings and resolved historical-SHA ambiguity.

| Question | Answer | Expected / source comparison | Match |
|---|---|---|---|
| how does the research flow fit together | Active workspace → verified immutable source package → frozen Metric preparation/readiness → immutable unreviewed report version → optional bound interpretation → review target; target creation does not approve the report. Automation draft pairs and reader revisions are distinct. | Same source-backed sequence, with target preparation separate from approval and automation workflows separate. Sources: src/modules/analysis/report-version-service.ts; src/modules/analysis/report-review-target-ledger.ts; src/modules/analysis/metric-input-preparation-service.ts; docs/adr/0005-report-evidence-and-decision-ledger.md | 3/3 supplemental set; this answer MATCH on initial and final asks. |
| who owns report versions | Analysis owns report state; ReportVersionService owns source-backed/prepared versions. Automation pairs and reader revisions have separate lifecycles; OWNER decides a reader revision. | Analysis ownership with separate source-backed, automation-pair and reader-revision identities. Sources: src/api/owner-api.ts; src/modules/analysis/report-version-service.ts; src/modules/analysis/research-automation/service.ts; src/modules/analysis/research-automation/reader-report-revisions.ts | 3/3 supplemental set; this answer MATCH on initial and final asks. |
| which report lane does the owner read, and which one is the governed draft? | Market Reader Report is the OWNER-facing lane, built from ready verified draft plus a run-bound workbook. Governed automation draft presents retained evidence/method outcomes and blocked states; reader approval is separate. | Owner reads reader lane; research-automation produces the governed draft; distinct review authority. Sources: docs/tasks/ultimate-v1.11-tdn-sync-plan.md; src/modules/analysis/reader-report/index.ts; src/modules/analysis/research-automation/service.ts; src/modules/analysis/research-automation/reports.ts | 3/3 supplemental set; this answer MATCH on initial and final asks. |

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

## G-7–G-13 self-check

| Gate | Result |
|---|---|
| G-7 | PASS / tests N/A: no provider calls in tests; no tests changed/run. OpenWiki operational provider calls were explicitly authorized. |
| G-8 | N/A: application owner-facing Vietnamese report prose unchanged; wiki is internal English context. |
| G-9 | PASS: missing data/blocked states retained; unavailable cost/questions and absent CodeGraph index explicitly reported. |
| G-10 | N/A: no historical report bytes, runtime data or replay implementation changed. No replay executed. |
| G-11 | PASS: no tests deleted, skipped, weakened or authored. |
| G-12 | PASS: template fields and B checklist recorded here. |
| G-13 | N/A: repository documentation indexing is not keyword business-record collection. |

Static verification: git diff --check; JSON parse; checked-base presence on all 12 substantive pages; local Markdown target files resolve; managed-block outside text equals base; private path/IP scan; allowed-path/dependency/workflow checks. Generated Mermaid validation is tool-reported; no independent browser render or application suite run.


## B-09 actual update observation

Invocation started 02:49:52 UTC. Bare --update entered first-run TTY setup; existing repository was confirmed, LangSmith skipped, and run selected without inspecting secrets. Setup displayed OpenAI-compatible / gpt-5.6-terra. Run checkpoint start 02:51:03.342 UTC; final metadata 02:59:15.523 UTC (8m12.181s); CLI reports 8m13s. Cost not visible.

Raw diff against committed baseline: 12 tracked paths, 114 insertions / 53 deletions: AGENTS.md, CLAUDE.md, four page claim sidecars (architecture, authority, verification, lifecycle), .last-update.json, .page-manifest.json, and those four Markdown pages. CLI reported two changed page bodies (architecture and verification); authority/lifecycle changed verification timestamps only. Architecture clarified ledger/user_version must match rather than merely not lag the head, consistent with src/api/operator-app.ts. Verification retained NOT EXECUTED and separated delivery from check standing. No content correction run followed.

The handoff was created during the update. OpenWiki detected source changes, exited 0 and finalized pages without advancing the source checkpoint: .last-update.json remains status interrupted at the checked base, and .run.json is absent. This is not a valid frozen-input no-op demonstration. Both instruction blocks were restored to the approved committed text afterward. No generated Markdown, sidecar, manifest or update metadata was hand-edited. Expected metadata-only acceptance is ESCALATED; stop at three content-fix rounds. Future clean-input reconciliation needs separate authorization/review.
