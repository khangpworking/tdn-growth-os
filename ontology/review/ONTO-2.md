# ONTO-2 review provenance and attempts

2026-10-08. Shapes: Codex. Independent cases: GPT-6-astra, isolated rule/vocabulary
briefing, followed by verbatim source excerpts; no shape or repository reads.
Cold review: separate fresh GPT-6-astra agent, masked inputs 1–3 only, then final
input 1 and guide input 4. **reviewed by model, not by a domain expert**.
The two reviewer agents are separate; both differ from the shape implementer.
Rule source and owner decision remain authoritative. No adoption or deployment.

## Preflight revisions (not crashes)

1. Checker refused Unicode backslash escapes in the regex. Literal whitespace
   was also serialized as backslash escapes by the tool. Changed to literal
   character ranges excluding Unicode White_Space and ASCII controls; verified
   E4 valid control receives conforms=true.
2. Checker refused `{n}` repetition in E13 lexical patterns. Expanded into
   explicit repeated [0-9] classes; verified E13 valid control conforms=true.
3. Mixed tab/newline/CR data is refused during literal string handling, even
   without minLength. Stop probing this unsupported data representation; retain
   expected REJECT and actual UNDETERMINED as ESCALATED. No expected result changed.

No tool process crashed. Unsupported evaluator verdicts were inspected rather
than blindly retried. All other unexpected results must still fail the runner.
Owner-reported problems: empty; no extra owner item.

## Final blind review comparison

Input 1 is E4, input 2 E12, input 3 E13; mapping was not provided to reviewer.
See each rule review for complete final enforcement reading and remaining limits.
Input 4 enforces exactly one marker string "two" on GuideRecord. It has no other
requirements, permits other properties, and does not authenticate marker origin.
This is a throwaway guide exercise, not an added business rule.
