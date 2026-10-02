# 0005. Candidate cards and inferred preferences

- **Status:** Accepted (owner, 2026-10-01; amended with Astra, rounds 1–2)
- **Date:** 2026-10-01

## Context

Owners recognise what they want faster than they can describe it, so the owner proposed showing real products as A/B/C/D cards to pick from. Two risks came up:

- **Feedback loop.** Search ranking shapes the cards shown, the picks then narrow the next search, and the result drifts toward whatever ranked first.
- **Over-reading picks.** "Closest to what I mean" is not the same as "this is my competitor", and three consistent picks are not proof of a preference.

## Decision

- **Rounds.** Each round shows up to 4 real items (A–D), one "Khám phá" card, and "Không cái nào giống".
  - Fewer cards are allowed when data is thin; the system never makes up alternatives.
  - The exploration card appears only when a distinct eligible candidate exists. It explores outside the inferred preferences but stays inside the authorized search boundary.
- **No "why" on the cards.** Reasons are inferred from the picks (layer 3) and shown on the definition card for the owner to confirm. They stay layer 3 even after review.
- **Stopping.** Rounds stop when the picks agree. If they conflict, there is one tie-breaker round. Three consistent picks are a **stopping heuristic only**, and preferences may stay unresolved.
- **Peers are separate.** A card pick is **not** a peer declaration. The M07 peer set is confirmed explicitly on the definition card.
- **Category mode.** Segment cards show three real examples and keep two counts apart: unique listings retrieved, and totals reported by the provider. They also show a dated price range over comparable variants, a thin-data badge, and UNKNOWN kept as its own bucket.
- **Provenance.** The query, source and rank behind every card, plus the order the cards were shown in and what was picked, are retained ([0006](0006-approach-3-fixed-skeleton-ai-proposes.md)).
- "None" and mode correction are always available.

## Consequences

- The definition card must show the inferred preferences and the peer set as two separate confirmations.
- Outside-ring counts are sampled observations, not the size of everything excluded, and the UI must say so.
- The exploration slot reduces selection bias but does not prove it is gone.
