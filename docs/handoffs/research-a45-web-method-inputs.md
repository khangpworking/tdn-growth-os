# Handoff: Research A45, explicit web method inputs

Updated: 2026-10-01. Branch: `feature/research-a45-web-method-inputs`.
Base: A44 `429d322d4bcf3735a2daaf50838750567cf217cc`, draft PR #103.
Delivery: [draft PR #104](https://github.com/khangpworking/tdn-growth-os/pull/104).
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
Linux Check [36832992394](https://github.com/khangpworking/tdn-growth-os/actions/runs/36832992394)
passed at executable checkpoint `b59b7ed9b94a08df2040c9b66b00156111ded25e`:
702 backend tests, 184 frontend tests, generated contracts, typechecks and build.
The final head and its Check, web-acceptance and normal HTML/PDF preview results
are pinned together in the final `HANDOFF_TO_CODEX` comment on PR #104. Check
that exact comment/head before landing; this document does not substitute an
earlier checkpoint for the final-head release gates.

The source-backed interrupted-publication fixture deliberately omits a method
packet whose claims bind the different, labeled result. Prepared/API/browser
acceptance owns the compatible all-three input path; evidence checks were not
relaxed to repair the fixture. The browser uses accessible report controls and
waits for the exact version picker, not the unrelated market picker or an
instantaneous count while history is loading.

Responsive evidence covers 1440px desktop, 768px tablet and 360px mobile. The
header correction follows the Opus decision in the UX brief section 12; no
overflow is hidden and all links remain. The empty-table cell returns to normal
flow. New method selectors and mobile nav links retain 44px minimum targets.
Navigation-settling changes in the preview helper do not remove source bytes,
disclosures, download checks, screenshots or the native PDF stream.

Linux browser diagnostics identified an implicit `/favicon.ico` request as the
remaining console 404. The static server now explicitly returns empty 204 for
that missing icon only, with the existing security headers and GET/HEAD gate.
Other missing assets remain 404; an actual preloaded icon still takes priority.
No icon artwork or index-reference validation exception was introduced. The
existing HTTP static-boundary tests cover absence, unrelated missing icons and
mutation rejection; the browser console assertion remains unchanged.

## Remaining boundaries

Synthetic acceptance establishes code and transport behavior, not the accuracy
of real calcium conclusions or complete real-data execution of all 30 sections.
Real method inputs still need complete source-bound declarations. No report is
automatically approved and no missing section is filled by AI interpolation.

No merge, Fedora activation, live migration or provider invocation is authorized
by this implementation. Release requires owner approval of the existing stack
and a fresh Fedora runtime/schema/backup/rollback preflight.
