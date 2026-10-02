# 0014. I01 owner question drafted by the system

- **Status:** Accepted (owner, 2026-10-01, v2)
- **Date:** 2026-10-01

## Context

I01 (the owner's question or decision the report should serve) was going to come from interview questions about report purpose and business context. [0003](0003-category-interview-then-quick-search.md) removed those questions, so I01 needs another source.

## Decision

- The system drafts I01 from the approved market definition: the keyword, the mode, the answers or description, the confirmed scope, peers and preferences.
- The draft is labelled as a system draft and goes into **owner review**, like the rest of the report ([0009](0009-draft-run-through-and-coverage.md)).
- It never chooses a strategy for the owner; it frames the question only.

## Consequences

- I01 is in the slice 1 commitment ([0011](0011-fe-first-then-thin-slice.md)).
- Owner edits to I01 create a new report version.
- I01 drafting is an AI step, so it needs a retained-attempt contract ([0006](0006-approach-3-fixed-skeleton-ai-proposes.md)).
