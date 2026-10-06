# Handoff — Vietnamese prose for M11/M12/I15 synthesis prompts

Updated: 2026-10-04
Worktree/branch: `research-automation-v1`, `fix/research-real-world-audit` (HEAD `0116091`, uncommitted)

## Integration addendum, GPT audit (04/10/2026)

The dependency work described below is now integrated in this working tree,
not deployed. New packet/input 1.1.0 preparations select prompt 1.2.0;
the prompt's inputContract remains 1.1.0. Packet 1.0.0 keeps prompt 1.0.0.
Retained packet 1.1.0 executions accept their original prompt 1.1.0 or the
new 1.2.0. No source, formula, admission or response contract changed.

Linux contract generation and backend typecheck passed. The three owning
unit/integration suites passed 10/10. One new prompt-byte contract test pins
the six historical section/version digests captured before integration.
No word-grep test or claim of semantic language quality was added.

An additional disposable before/after rehearsal created three synthetic
M11/M12/I15 executions under the old 1.1.0 prompt before updating code.
After integration, all three read and exact-retried with identical candidate
identities/bytes, zero provider calls and byte-identical query-only database.
All six 1.0.0/1.1.0 prompt digests remained unchanged. Evidence helper:
`artifacts/research-execution-20261003/verify-vietnamese-prompt-replay.mjs`
in the coordinator workspace, outside this repository.

Real Vietnamese output quality and the other interpretation prompt families
are still pending. ZCode's bounded independent audit ended failed; it is not
counted as a successful review. GPT inspected version binding and the retained
execution kernel directly. No Windows checks, release or live activation.

The remaining sections preserve Claude's original pre-integration handoff;
its "not yet active" statements describe that earlier stage only.

## Source pin

- Skill: `humanizer-vi` (MIT), https://github.com/longhang2004/vietnamese-humanizer, path `skills/humanizer-vi`.
- Reviewed upstream revision: `576c80fb445a8b2e9ec1993a6490ab6529b89d12` (skill metadata version `0.2.1`).
- Read: `SKILL.md`, `references/preservation-rules.md`, `registers.md`, `workflow.md`,
  `patterns.md`, `evaluation.md` from the local copy. The guidance was condensed into five static
  prompt lines. Runtime does not read or import any skill file or Windows path.

## Completed

`src/modules/analysis/research-automation/decision-synthesis-input.ts` (this file was already untracked before
this task, so `git diff` shows no base. The changes are listed exactly here):

1. Added `vietnameseSystemText(sectionId)`: the unchanged `expandedSystemText(sectionId)` (prompt 1.1.0) followed by
   five lines covering:
   - Vietnamese for free-text values, with identifiers, enum values, field names and claimIds unchanged.
     Existing rules take precedence over wording.
   - No translation or paraphrase of source quotes, statements, attributions, measure literals or names. Quotation
     marks only for exact copies. Attribution is kept.
   - Hedges, negation, conditions, period, scope, unit and denominator, self-report status, qualifiers,
     counterevidence, unknowns and missing-data limits keep their original strength. No causal connective unless the
     source states the link.
   - Proposals stay proposals. No decision, recommendation or priority wording.
   - No canned introductions or closings, no promotional or inflated wording, and no added examples or details.
2. `automationDecisionSynthesisPrompt` now types `version` as `AutomationDecisionSynthesisPrompt['promptVersion']`
   instead of the literal `'1.0.0' | '1.1.0'`. Today the two types are identical. Its `systemText` selection is
   `1.0.0 → systemText`, `1.1.0 → expandedSystemText`, otherwise `vietnameseSystemText`.
3. Source comment pins the upstream revision and points here.

No existing prompt line, JSON, schema, safety, admission, counterevidence or digit rule was removed or reworded.
The new lines are appended, so all earlier rules come first. The number-character ban still applies, and the new
lines contain no digits.

## Not yet active: exact dependency outside this ownership

**The Vietnamese guidance does not yet apply on generation.** Prompt versions are frozen and replay-verified:

- `contracts/analysis/automation-decision-synthesis-prompt.schema.json` restricts `promptVersion` to
  `["1.0.0", "1.1.0"]`. As a result, `automationDecisionSynthesisPrompt` rejects any other version with
  `INVALID_DECISION_SYNTHESIS_PROMPT`.
- `decision-synthesis-execution.ts` `bindsRetained` requires `prompt.promptVersion === admission.methodVersion`, which
  ties prompt version to packet version.
- `service.ts` dispatches new runs with `packetVersion: '1.1.0'`.

Editing the 1.1.0 text in place was rejected. It would change the bytes behind an existing version label, and
`verifyAutomationDecisionSynthesisPrompt` would then reject any retained 1.1.0 prompt with
`DECISION_SYNTHESIS_PROMPT_REPLAY_MISMATCH`. Instead, the new text is staged as successor version `1.2.0`, and that
branch cannot be reached until the following changes land together:

1. Contract owner: add `"1.2.0"` to `promptVersion` in the prompt schema only. Leave `inputContract.methodVersion` at
   `["1.0.0","1.1.0"]`, because the input and packet are unchanged. Then regenerate
   `automation-decision-synthesis-prompt.generated.ts`.
2. Execution owner (`decision-synthesis-execution.ts` `bindsRetained`): replace
   `prompt.promptVersion === admission.methodVersion` with an explicit mapping: packet `1.0.0` → prompt `1.0.0`, and
   packet `1.1.0` → prompt `1.1.0` **or** `1.2.0`. Keep `prompt.inputContract.methodVersion === input.methodVersion`
   unchanged.
3. This file, in the same change: in `prepareAutomationDecisionSynthesis`, call
   `automationDecisionSynthesisPrompt(packet.sectionId, packet.methodVersion === '1.1.0' ? '1.2.0' : '1.0.0')`, and
   widen `AutomationDecisionSynthesisProjection.promptVersion` and its value to the prompt's version, not the packet's.
   This step was deliberately not made now: without steps 1 and 2 it would throw on every 1.1.0 preparation, or
   produce rows that fail `bindsRetained` on read.
4. Test owner: `tests/unit/research-automation-decision-packets.test.ts:96` asserts
   `literal.prompt.artifact.promptVersion === '1.1.0'` for a 1.1.0 packet. That assertion must change to `'1.2.0'`.
   This reflects the intended behavior change and does not weaken the assertion.

Packet `1.0.0` keeps prompt `1.0.0` with no Vietnamese guidance. Reaching it now requires replaying an older packet;
new runs use packet 1.1.0.

## Retained replay considerations

- Prompts `1.0.0` and `1.1.0` keep byte-identical text, so retained prompts still pass
  `verifyAutomationDecisionSynthesisPrompt` and their prompt SHA-256 values are unchanged.
- The execution kernel replays settled rows and dispatches `PREPARED` rows from **retained** prompt bytes. A row
  prepared under 1.1.0 before activation will still dispatch with the English-only 1.1.0 text. This is correct,
  because its recorded identity must not change.
- Input and packet artifacts, admission, claims, candidate response contract `1.0.0`, method code, formula output,
  source evidence, annotation spans and historical reports are untouched.

## Risks

- **No semantic-quality benchmark has been run.** Vietnamese quality, how well the model follows the rules, and
  preservation in real outputs are unmeasured. No provider call was made.
- Vietnamese text is usually longer than English. Candidate text values are still capped at 1000 characters, so
  over-long text will now fail validation rather than be truncated.
- `counteredTarget` must be copied character for character from the (now Vietnamese) candidate text. Diacritic
  normalization (NFC/NFD) could cause `COUNTEREVIDENCE_TARGET_NOT_IN_CANDIDATE` if a model re-encodes text. This is
  unverified.
- A source quote that contains a digit cannot be quoted, because the existing number-character rule wins. This was
  already true before this change.
- Example words in the prompt (such as "nên" and "ưu tiên") are guidance, not a validator. The candidate validator
  does not check vocabulary, and no word filter was added.
- Out of scope, not changed: other report interpretation prompts. These are the I14 prompt in
  `i14-synthesis-execution.ts`, the configured `promptText` in `report-interpretation.ts`, `interpretation-service.ts`
  and `research-evidence-audit-service.ts`, and the Insight annotation prompt in `insight-model-execution.ts`.
  Applying the owner's Vietnamese prose requirement to Market/Insight interpretations generated there needs separate
  owners and versioned changes.

## Evidence

Static source inspection only. No tests, typecheck, build, generator, validation command, provider call, database,
commit or push was run on Windows.

## Smallest owner-boundary checks for GPT (Linux)

- Typecheck: confirm that the new third `systemText` arm (narrowed to `never` under the current generated type)
  compiles.
- `tests/unit/research-automation-decision-synthesis-input.test.ts`: replay of prompt and input for 1.0.0 is
  unchanged.
- `tests/unit/research-automation-decision-packets.test.ts`: 1.1.0 prompt is still selected and passes replay.
- `tests/integration/research-automation-decision-synthesis-execution.test.ts`: retained-row binding and replay.

Do not add a test that greps prompt words. After activation, a useful test is that a retained 1.1.0 prompt still
binds and replays alongside a new 1.2.0 prompt.

## Unresolved / next action

Contract and execution owners apply steps 1, 2 and 4 together with step 3 in this file. Run a Vietnamese output
quality review on synthetic inputs before relying on it.

Business decisions pending: none. If packet-1.0.0 replays should also get Vietnamese prose, that needs an owner
decision.
