# Handoff — M11/M12/I15 retained decision synthesis rendering

Updated: 2026-10-04
Worktree/branch: `research-automation-v1` / `fix/research-real-world-audit` (uncommitted)

Completed:

- `AutomationReportInput.decisionSynthesis?: Partial<Record<AutomationDecisionSectionId, AutomationDecisionExecutionOutcome>>`
  added in `reports.ts`. It matches the field GPT already declared on the service-side `ResearchAutomationReportInput`.
  This is presentation input only. The renderer does not put it, candidate bytes or candidate artifacts into `semantic`.
  The service keeps ownership of retained references.
- `decisionPacketSection(packet, claims, synthesis?)` renders the outcome for that section inside the existing
  packet view. When `synthesis` is absent, the output is byte-identical to the previous historical fallback.
- VALID with candidates: a `<h3>Đề xuất AI đã lưu · Chưa được người dùng duyệt</h3>` block appears above the
  inventory, which now has its own `<h3>Bằng chứng đã lưu của mục</h3>`. Each candidate renders as an
  `article.evidence-entry` with:
  - a type label (HYPOTHESIS / OPPORTUNITY_DIRECTION / STRATEGY_OPTION / ACTION_OPTION) marked as a draft awaiting review;
  - escaped text, the rationale labelled as the AI's;
  - support refs and counterevidence refs that link to the existing `#decision-{sectionId}-{claimId}` evidence anchors,
    each label showing the upstream section;
  - one `details.evidence-trace` per proposed counterevidence relation, holding the countered target, the six
    compatibility statements (marked unverified) and the inferential limitations;
  - conditions (I15), prerequisites (M12), assumptions, unknowns, evidence gaps and limitations.
  The block also renders the envelope limitation codes in the existing method-limits disclosure.
  The copy says the candidates are not source evidence, a market conclusion, a chosen option or an authorised action.
  It says display order is response order, not rank. It says the system makes no size, budget, cost or return
  estimate, and that spelled-out quantities in the drafts are unverified.
- VALID with an empty candidate list: says the retained run proposed nothing, and gives the insufficient-evidence
  reason when present. No "no AI step" copy is shown.
- NOT_DISPATCHED (AI_NOT_CONFIGURED / INSUFFICIENT_EVIDENCE), PREPARED, DISPATCH_UNKNOWN and INVALID: fixed copy
  adapted from I14. The report never shows `validationCode`, `unknownCode` or `executionId`.
- When a synthesis outcome exists, the packet's own limitations disclosure is relabelled "Giới hạn và mã của danh
  sách bằng chứng". This makes clear that the packet code `NO_AI_OR_PROVIDER_CALL_WAS_MADE` describes the packet, not
  the section. The M11 purpose line changes from "chưa được đề xuất" to "chưa được người dùng duyệt" only when
  candidates exist.
- `reports.ts`:
  - The section explanation now varies with the synthesis state. With no synthesis, it keeps the original sentence.
  - The state stays `EVIDENCE_INVENTORY` and `completedAnalyticalSections` stays 0.
  - The headline adds one sentence for sections with candidates, saying they are unreviewed drafts and do not count
    as completed analytical sections.
  - The footer uses neutral wording ("Kết quả xử lý AI được lưu riêng, chưa được người dùng duyệt; …") when any
    rendered decision section has a VALID outcome. Otherwise the I14 VALID footer and the no-AI footer stay unchanged.
- Display guards throw the same way as the existing `decisionPacketSection` mismatch checks:
  - when candidate `sectionId/runId/workspaceId/scopeSha256` differ from the packet;
  - when a referenced claim is not a packet item.
  The renderer does not check the packet hash, because the service already replay-verified the candidates.
- The shared `list` helper moved to module scope so I14 and decision candidates use it. I14 output is unchanged.

Changed paths:

- `src/modules/analysis/research-automation/reports.ts`
- `src/modules/analysis/research-automation/synthesis-evidence-report.ts` (untracked in Git, so there is no Git
  baseline for this diff)
- `docs/handoffs/research-decision-synthesis-rendering.md`

Evidence (commands, results, relevant revision):

- Read-only inspection only:
  - types in `decision-packets.ts`, `decision-synthesis-execution.ts`, `synthesis-execution.ts` and
    `contracts/analysis/automation-decision-packets.{schema.json,generated.ts}`;
  - call sites in `service.ts` (render input and semantic stripping, lines ~1372–1412) and `index.ts`.
- Not run, per instructions: typecheck, tests, build, generation and visual inspection.
  Type correctness, the claim that historical output is byte-identical, and the new HTML are all unverified.
  They need Linux `tsc` and the report tests.
- Renderer-owned copy contains no em dash.

Unresolved:

- Linux typecheck and tests need to run once the service wiring lands.
- Suggested assertions:
  - an absent `decisionSynthesis` keeps the old M11/M12/I15 HTML and explanation;
  - every candidate link resolves to an existing `decision-{sectionId}-{claimId}` id;
  - model text containing `<script>` is escaped;
  - no `validationCode` or `unknownCode` appears in the HTML;
  - the footer and headline are correct for VALID-empty and for INVALID;
  - `semantic` has no `decisionSynthesis` key.
- Desktop, mobile and print need a visual check of the nested relation disclosures on Linux-generated output.
- This file is not added to `docs/STATUS.md`; the integrator owns that.

Next action: GPT finishes the service wiring that passes `decisionSynthesis`, then runs the Linux typecheck and the
report tests with the assertions above.

Business decisions pending: none for rendering.
