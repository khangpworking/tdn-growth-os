# M11/M12/I15 report integration checkpoint

2026-10-04, unreleased working tree on `0116091fd5dc0902594f92d969dfb3ee0732c9c8`, PR #110.
Plan v2.4 P5 integration, not completed section/business acceptance.

## Completed

- GPT added optional per-section `decisionSynthesisAi` to the existing Analysis service. I14 opt-in does not authorize these additional calls. Default stays off.
- The existing report worker builds the exact section packet/source input, delegates to the shared retained execution owner, and passes its verified outcome to presentation.
- Semantic reports retain service-owned `decisionExecutionIds`, not presentation-supplied candidate objects or identities. Reads reconstruct the exact packet and replay the corresponding section execution, including candidate bytes/manifests. Market also replays its exact sibling Insight, never latest.
- Deterministic Metric/coding/bounded/quote revisions use settled predecessor executions without new model calls. Source supplements keep the existing new-attempt boundary.
- Claude added M11/M12/I15 candidate presentation, source/counterevidence links, proposed relationship disclosures, conditions/prerequisites and limitations. GPT inspected the code and Linux output. All model text is escaped; no owner decision, amount, ranking or execution is created. Section completion remains unchanged.
- INVALID, DISPATCH_UNKNOWN, empty valid and not-configured outcomes retain safe report text, without printing provider responses, execution identities or internal failure codes.

## Files

- `src/modules/analysis/research-automation/service.ts`
- `src/modules/analysis/research-automation/reports.ts`
- `src/modules/analysis/research-automation/synthesis-evidence-report.ts`
- `tests/integration/research-automation-native-reviews.test.ts`
- Progress/status and this handoff. No new migration in this checkpoint; migration 0046 belongs to the preceding shared-execution checkpoint.

## Evidence

Linux scratch `~/.cache/tdn-p1-isolation-20261003-ZVXHsB`, pinned Node 24.15.0. No project tests/typecheck/build ran on Windows.

- Root typecheck PASS.
- Final affected group: **38 PASS, 1 optional Chromium PDF SKIP**. Suites: native reviews, decision synthesis execution, quote methods, bounded methods, reports, decision packets, decision synthesis input. This is not a full repository/release gate; overlapping earlier runs are not summed.
- Extended the existing source-to-report test owner rather than duplicating the whole journey: adopted raw context reaches four separate AI sections; original quotes remain source, AI prose never becomes evidence; exact IDs survive a quote revision with no redispatch; a fresh query-only service reads without configured AI; corrupt I15 candidate bytes reject both Insight and its paired Market.
- Added one report-worker outcome test for invalid, ambiguous and empty results. Ports are synthetic. Kernel tests remain the owner of classification details.
- Initial fixture mistakenly included numerals in candidate prose (`M11` and `alert(1)`), rejected correctly by the closed text contract. Fixed the fixture to use section labels and `alert()`; schema/production validation unchanged. The earlier missing-text failure is **not** claimed as renderer RED proof because that invalid fixture also caused it.
- Browser preview uses the real service/renderer and fixture packages for all three product categories: six separate HTML files and nine synthetic synthesis calls, zero provider calls. Chrome desktop 1440x1000 and mobile 390x844: **12 views**, exact anchor targets, keyboard Enter expand/collapse, no page errors, no page-wide horizontal overflow. GPT visually inspected M11 desktop and I15 mobile captures; other views have automated checks, not a separate visual approval.
- Outside-Git evidence: `artifacts/research-execution-20261003/decision-report-preview/` on the Windows workspace, including six HTML files, six representative section screenshots and `browser-evidence.json`. Builders `decision-preview.ts` and `decision-browser.mjs` are outside Git. The scratch database/artifact store was created for this preview and removed after export; runtime databases were never opened.
- `git diff --check` PASS before this documentation update; final check repeated on handoff.
- Business authority hashes remain unchanged: adoption `5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7`, synthesis profile `5fd879f42d6c9c82cbc87710b69206aaac2fc8d6bac2da18ba158825f910225a`.
- ZCode GLM-5.3-Flash high narrow read-only audit ended `stage: timeout`, 180000 ms, no result/session ID returned. No independent approval is attributed to it. Claude implementation ran via Opus alias/high; the concrete version was not independently verified.

## Remaining / next

1. Connect explicit runtime configuration and truthful per-section activity projection; the service option alone does not activate M11/M12/I15 in the operator web. Do not silently reuse I14 authorization for three more calls.
2. Broaden eligible claim support beyond the current narrow I02 context adapter under adopted business authority; these drafts do not complete the broad sections.
3. Continue source/method breadth for the other sections, real corpus/Metric acceptance and independent design acceptance. Do not return to M01/I14 polish.
4. Test six real web reports and six separate PDFs at one release version. This checkpoint generated synthetic HTML only; PDF visual and actual-source acceptance remain open.

No commit, push, merge, deployment, real business write, provider call or live migration occurred.
