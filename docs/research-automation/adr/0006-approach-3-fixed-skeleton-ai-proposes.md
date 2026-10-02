# 0006. Approach 3: code owns the skeleton, AI proposes

- **Status:** Accepted (owner chose Approach 3; Astra AGREED, round 3)
- **Date:** 2026-10-01

## Context

Three approaches were considered:

1. Fully AI-driven agents.
2. A fixed pipeline with no AI.
3. A fixed code skeleton in which the AI only proposes.

tgos rules require:

- deterministic stages, budgets and authority;
- retained evidence;
- replayable outputs;
- no automatic strategy choice (A44 excludes AI generation, forecasts and automatic choices).

## Decision

**Code owns:**

- the stages and transitions;
- budgets and caps;
- authority and approvals;
- the list of allowed adapter operations.

Business transitions belong to the owning services. Workers handle only execution mechanics, including Task 015's handling of ambiguous starts.

**The AI proposes, inside that skeleton:**

- question wording and options, within the fixed intents ([0003](0003-category-interview-then-quick-search.md));
- groupings and segments;
- card candidates;
- inferred preferences;
- crawl plans, which may only reference approved, typed adapter operations and never contain arbitrary executable instructions.

**Retention:**

- Retained bytes: the candidate pools, card order, picks, prompts, model outputs and returned interpretations.
- Replay reopens those retained bytes. Running the model again is a **new attempt**, not a replay.

## Consequences

- Every AI step needs a retained-attempt contract.
- AI synthesis sections (M01, M11, M12, I14, I15) may show evidence and owner-option packets, but need their own retained-attempt contracts before they generate text. There is no automatic strategy selection.
- The design is more work than a plain agent, but its behaviour stays auditable and bounded.
