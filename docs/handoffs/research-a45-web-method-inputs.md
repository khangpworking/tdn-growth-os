# Handoff: Research A45, explicit web method inputs

Updated: 2026-10-01. Branch: `feature/research-a45-web-method-inputs`.
Base: A44 `429d322d4bcf3735a2daaf50838750567cf217cc`, draft PR #103.
This is a stacked draft, not an independent merge or deployment target.

## Implemented

- Explicit none-or-one selection for descriptive market methods, located
  Insight methods and bounded method packets from the selected retained package.
- Schema-based inventory with opaque IDs bound to package identity, family,
  logical path and exact descriptor bytes. No filename inference or automatic
  pairing; schema admission does not establish compatibility or approval.
- Closed API selection and safe method-input error contracts. Known input
  incompatibility is actionable; storage corruption and unexpected failures
  remain generic integrity errors.
- Both prepared and source-backed versions receive the exact resolved paths.
  Existing consumers retain authority, byte, locator and claim verification.
- Complete immutable request identity is checked before retry preparation or
  section writes, including recovery after missing artifact publication.
  Omitted method inputs and three explicit nulls resolve to the legacy request.
- The approved operator layout is preserved. Native selects start at Không dùng,
  reset with source changes and freeze together with the request/display snapshot.
  Pending/error/retry behavior never silently substitutes newer selections.
- A Linux-only real-browser acceptance workflow builds the production frontend,
  starts a disposable synthetic operator, creates a retained report, opens its
  HTML, verifies the evidence download and reloads without another report POST.
  Browser tooling is pinned outside the application dependency graph.

## Design and test ownership

Claude Opus 5.5 high produced the UX brief after the owner's quota reset.
GPT-5.6 Luna xhigh implemented code and performed independent review. The
coordinator owns shared contracts, API integration and Linux CI evidence.

Test Audit is applied during authoring: the service owns request/retry identity;
HTTP owns safe admission/error translation; mounted frontend tests own picker
state and frozen submissions; the real browser owns production wiring and
responsive delivery. Existing consumer tests own method arithmetic and lineage.
No test-only production export, migration, application dependency, new ledger,
upload, provider call, AI inference, approval or real business record is added.

## Verification

Contract generation and static diff checks are permitted on Windows. Tests,
typechecks, production builds and browser execution run only on Linux CI.
Linux results and the exact final head will be recorded after publication.

## Remaining boundaries

Synthetic acceptance establishes code and transport behavior, not the accuracy
of real calcium conclusions or complete real-data execution of all 30 sections.
Real method inputs still need complete source-bound declarations. No report is
automatically approved and no missing section is filled by AI interpolation.

No merge, Fedora activation, live migration or provider invocation is authorized
by this implementation. Release requires owner approval of the existing stack
and a fresh Fedora runtime/schema/backup/rollback preflight.
