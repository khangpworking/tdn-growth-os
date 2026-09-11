# Handoff — frontend init and shape

Updated: 2026-09-11.
Branch: `docs/frontend-product-shape`.
Base: `1e8cd2dcfd49fe339c0e05cc3bc88994a77dfc6a`.

## Completed

- PRODUCT.md records confirmed users, boundaries and deferred work.
- ADR 0002 and INTENT D27 record React + Vite + TypeScript; the original architecture is retained below a superseding note.
- `.impeccable/config.json` records the owner's explicit mockup-first choice.
- Vietnamese B7–B10 functional brief covers buttons, current versus frozen state, concurrency, evidence and API gaps.
- Direction selection payload prepared. Catalogue service unreachable on two attempts; no quality-bar boards or generated images claimed.
- Owner clarified that Option 3 (portfolio overview) and Option 2 (product workspace detail) are complementary surfaces and may be implemented together; Option 1 remains an optional quick-operations density inside detail.
- Added `docs/frontend/design-md-four-way.html` and `design-md-references.md` as an exploratory comparison only. The four-way reference board is now superseded; use `docs/frontend/direction-options.html` as the active visual baseline.

## Verification

Documentation-only. Git whitespace check passed. Runtime source, contracts, migrations, dependencies and CI unchanged; no full suite required. No frontend/API code, login, deployment, collection or business decision executed.

## Unresolved and next action

The original prototype is the selected visual baseline; Overview + Detail is the confirmed paired structure (INTENT D28–D29). Do not ask the owner to choose between them again. The connected `docs/frontend/workspace-prototype.html` is the next reviewable HTML iteration; B8 actions are in-memory demos, B9/B10 are informational views only. `DESIGN.md` and `.impeccable/design.json` document the observed visual system. Review this refined mockup with the owner before React/API implementation.

The owner subsequently approved the multi-market prototype (INTENT D31). Task 033 is authorized: follow `docs/tasks/033-react-workspace-ui.md` and the exact GitHub handoff SHA. The design package will be published on `feature/033-react-workspace-ui` for Fedora implementation. Keep Task 024 deferred. Do not reuse older UI assumptions implying mutable B7 decisions or reopenable STP.
