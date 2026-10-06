# Handoff: B, supplemental source UI

Updated: 2026-10-04 (Asia/Bangkok)

Status: **READY_FOR_INTEGRATION_REVIEW** for B. Independent finish disposition:
`ship` after the reviewer scored its sole descriptor-validation finding resolved.
Scope is assignment B only. The full 30-section goal remains paused. No section
completion, real-data business acceptance, release approval or deployment is claimed.

Repository: `C:/Users/Admin/Documents/Codex/2026-08-27/cou/work/research-automation-v1`.
Branch/HEAD remain `fix/research-real-world-audit` /
`0116091fd5dc0902594f92d969dfb3ee0732c9c8`. These changes are uncommitted, including
essential inherited untracked implementation. Do not reconstruct this tree from HEAD.

## Delivered

- Finished Claude's partial SupplementalSourcePanel and integrated it into the
  existing ReportVersionsPanel without replacing the approved design.
- Lists exact run-bound QUOTE/BOUNDED prepared packages with operator-supplied,
  unverified provenance and known/unknown acquisition time. Nothing is auto-selected.
- Upload accepts only supported prepared JSON bundles and the bounded bundle's
  two method Markdown files. Required path, descriptor, size and file constraints
  are explained before sending. This is not arbitrary PDF/XLSX ingestion.
- Storage and report admission are separate explicit actions. An acknowledged
  upload must match the authoritative inventory, including request identity,
  package digests, metadata and every file's path/hash/size/MIME.
- Explicit revision binds the exact current predecessor and exact selected package.
  Metric and native reviews remain KEEP. Each request admits one method family;
  adding the other requires another explicit revision. Prior-family inheritance
  follows A's checked service behavior, not an invented combined contract.
- Uploads and revisions freeze request snapshots. Double submission is guarded
  synchronously. Ambiguous results require an explicit exact retry; no auto-retry.
  Stopping a wait does not roll back a server write. Stale responses after a run
  switch or a stopped attempt cannot settle another form.
- OWNER, stale inventory/predecessor, pending/uncertain work and sibling actions
  have local guidance and shared blocking. A changed prerequisite cancels an
  unsent confirmation; uncertain submitted retries preserve the original snapshot.
- The original report remains selected. New history is reloaded authoritatively;
  separate Market/Insight web/PDF links stay tied to the explicitly viewed pair.

## Delta and tested identity

| File | Final SHA-256 |
| --- | --- |
| frontend/src/research-automation/SupplementalSourcePanel.tsx | 70f88b0b6c75ed2ddf51e0d8633a40b637dbd8ed46852c80eecb5011fb4617d9 |
| frontend/src/research-automation/supplemental-source.css | c7048bb6b234b48f180f3319f7ae1a182589783f9f0ee66b4d64db9655f98cbf |
| frontend/src/research-automation/ReportVersionsPanel.tsx | 9da82b3e256cdc47a70fa8c3eb2175fa55bc5ad0cb4c099918d0b687d194f017 |
| frontend/tests/research-supplemental-source-ui.test.ts | 3e7783c50095328376f31109ebecb80fb015b8606ce2d13ade5e19b83ebf62ff |
| frontend/tests/dom.ts | 2e50f7f70dca281c39978de8d9a9a8682d04f142342cbbb468732d09cb6ef586 |

The CSS is inherited Claude work, unchanged by the takeover. Before takeover,
SupplementalSourcePanel hash was
`4fd2874417ace2a68fd71e5068ba8a58da96abf927a60d8f6392e30b787312f4`;
ReportVersionsPanel hash was
`b2695c148a9bd8bc82850900c3e082e8db521e6af1ae5397b96119d75a059834`.
Copies are outside Git under
`C:/Users/Admin/Documents/Codex/2026-08-27/cou/artifacts/manual-B-before-20261004/`.

Narrow ownership expansion: existing `frontend/tests/dom.ts` registers a CSS
module loader, following the existing mounted-test pattern. Node tests ignore CSS;
the real browser verifies styling. No dependency or production-only testing seam
was added. Full frontend tests were therefore run, not only B's tests.

Added documentation: `docs/frontend/research-supplemental-source-surface.md`, this
result and `B-screenshots/`. No shared status or global completion counts were edited.

## Verification actually performed

Disposable Linux scratch only:
`/home/pkhang/.cache/tdn-p1-isolation-20261003-ZVXHsB`.
Node 24.15.0 / npm 11.12.1, pinned existing toolchain.

- Linux frontend typecheck: PASS on final bytes.
- Focused mounted/client tests: 13/13 PASS (7 B, 4 report versions, 2 supplemental client).
- Complete frontend tests: 246/246 PASS.
- Frontend production build: PASS. Existing large-chunk advisory remains; no bundle
  optimization or new split architecture is included in B.
- Windows scoped `git diff --check`: PASS; this is a read-only diff check, not a
  Windows project test. Linux SHA-256 values matched all five files above.
- Real production-browser synthetic acceptance: PASS for both QUOTE and BOUNDED,
  including upload, unselected inventory after reload, explicit exact revision,
  cancellation without writes, focus containment/return, old viewing preservation,
  unsupported-format blocking, inventory loading/error/recovery and mobile overflow.
- Browser page errors: zero. External browser requests: zero. Provider/model calls:
  zero. The synthetic run's usage request count remained zero.
- Disposable operator closed, port-close assertion passed and its temporary database
  and artifacts were removed. No live operator was touched.

Browser runner is outside Git at
`C:/Users/Admin/Documents/Codex/2026-08-27/cou/artifacts/manual-B-browser.ts`.
It runs against actual server routes and persisted synthetic fixtures, not mocked
write routes. Only GET inventory was delayed/failed in the browser to capture safe
loading/error states. The error's English phrase is synthetic injected input.

No Windows project tests/typechecks/builds/generators ran. B did not rerun the full
backend repository suite or Linux CI; A separately documented its affected 16/16.

## Design and review

Impeccable context and the approved surface briefs were read before implementation.
Operate extension, ENERGY/RHYTHM/MOTION 1/1/1; Antislop applied during work. The
changed-target detector ran once and returned no findings (`[]`). Test-audit's
authoring gate limited tests to visible behavior at HTTP/mounted boundaries.

The first finish packet received `recapture` because a loading crop showed the
wrong sibling panel. It supplied no binding verdict. All captures were regenerated
and opened; the corrected loading crop shows the supplemental heading, loading
message and disabled admission. The fresh full review returned one P2 finding:
a selected descriptor renamed from JSON to Markdown could leave storage enabled.
The fix checks the current selected path is JSON. Its mounted regression failed
on pre-fix code for the expected disabled-state assertion, then passed. Browser
verification shows the same actionable blocker (`descriptor-validation.png`).
Final Linux checks above include this fix. The same reviewer scored the sole
descriptor-validation finding resolved and returned `ship`. That verdict approves
the listed fix only; the preceding full review covered the bounded B surface.

The harness has no specialized Impeccable agent-type selector; the finish reviewer
uses a fresh generic read-only subagent with the same evidence/skill criteria.
A separate documenter spawn and continuation were refused by the agent-thread
limit. The coordinator performed the bounded documenter fallback instead:

- No changes to DESIGN.md or `.impeccable/design.json`; source, tokens, sidecar,
  PRODUCT.md and the focused surface briefs were compared.
- Palette: incumbent navy/white with blue actions and teal focus; no new colors.
- Typography: incumbent system stack and existing body/label hierarchy.
- Layout: compact secondary source panel, native disclosure and mobile single column.
- Components: existing fields, radios, buttons and shared ConfirmDialog; scoped CSS.
- Named boundary: store first, explicitly admit later; source provenance is not approval.
- Pre-existing PRODUCT/DESIGN text still describes older prototype-only capabilities.
  It was reported, not rewritten or canonized as a new rule.

Preserved DESIGN SHA-256:
`eefe890aebdd4b9191aec979cc53e7376f90e337a5987889a0f1896e1812cc06`.
Preserved sidecar SHA-256:
`68aaa20d4afe2808d06033c7e40753e7d7231c2ab2fd2751222bef112ae5148e`.

## Boundaries and exact next step

A's client, revision client and verified backend hashes remain those in
`manual-A-result.md`. No backend service/contract/client, generator, dependency,
migration, real input, credential or C implementation was changed by B.

Observation only: `insight-model-execution.ts` currently differs from the original
manual checkpoint (now `e73a69b8e14c289f466b22f21a43fafa93cfb9ec54721b5b85f42ba20f05f7e3`).
B did not edit or audit that concurrent C delta; preserve it and obtain C's handoff.

Next: the coordinator can integrate C's separate
handoff, select a release checkpoint containing the actual dirty/untracked work,
and plan governed Linux release checks. No deployment or user-source research run
is authorized by this B handoff. Suitable real QUOTE/BOUNDED evidence, analytical
quality and final separate web/PDF acceptance remain unproven.

No commit, push, merge, deployment, paid call or real business record was created.

## Antislop delivery gate (coordinator, bounded B surface)

Scope: the added source form/selection and its integration, not an app-wide audit
or analytical/report-content approval. Evidence is the final source, mounted
behavior tests, actual production-browser captures and existing design tokens.

### Hard gates

- R-02 PASS: added SupplementalSourcePanel copy contains no em dash.
- R-03 PASS: real 390px browser asserted no horizontal overflow; mobile crops verified.
- R-17 PASS: file sizes/limits derive from contracts; fixtures are labelled synthetic.
- R-18 PASS: no testimonials, invented people or avatar assets were added.
- R-23 PASS: no new branding, imagery, navigation or generated visual assets.
- R-24 PASS: no new navigation links; viewed-pair output paths were checked.
- R-25 PASS: inherited enabled text on white: ink 13.92:1, muted 5.64:1,
  primary white/blue 6.47:1; disabled controls are not enabled-text contrast claims.
- R-26 PASS: storage, selection, revision, retry, stop, abandon and reload have
  real handlers; mounted/browser checks exercise their user-visible outcomes.
- R-27 PASS: empty, loading, error and recovery are present in captured states.
- R-28 PASS: no FAQ or unrelated marketing content was introduced.
- R-32 PASS: dialog cancel/Tab/Shift+Tab/Escape/focus return checked in real Chrome.
- R-33 PASS: production edits used apply_patch; no external source-rewrite script.
- R-34 PASS: no theme toggle added; the approved incumbent light surface is preserved.
- R-35 PASS: final production build and recorded synthetic button/form journeys ran
  on Linux; stop/retry/stale-result cases are covered by mounted behavior tests.
- R-36 PASS: no fabricated security, performance, approval or completion claims.
- R-37 PASS: approved incumbent and six-block surface note were used before edits.
- R-38 PASS: realistic acceptance inputs are synthetic-labelled; no source is called
  provider-verified or an accepted analytical conclusion.

### Purpose gates

- R-01 PASS: no new gradient/glow; selection uses the existing blue action token.
- R-04 PASS: no new icon library or decorative magic/AI icon.
- R-06 PASS: incumbent body/label hierarchy; no costume monospace or tracked kicker.
- R-07 PASS: no decorative grid/pattern; structure follows source tasks.
- R-08 PASS: actions are verb labels, not arrow-decorated CTAs.
- R-09 PASS: provenance is meaningful text, not promotional badge chrome.
- R-10 PASS: no glass/backdrop effect added.
- R-12 PASS: scoped CSS adds no shadow; incumbent depth is unchanged.
- R-13 PASS: no colored glow introduced.
- R-14 PASS: native source options are repeated for consistent selection, not filler cards.
- R-19 PASS: no new entrance animations; incumbent reduced-motion rules remain.
- R-22 PASS: no generic illustrations or substitute asset chrome.

### Liveliness

- Dials PASS: ENERGY/RHYTHM/MOTION 1/1/1 recorded in the surface note.
- Dial consistency PASS: calm task form and scoped CSS, no dramatic/new motion.
- Focal point PASS: explicit viewed report pair remains first; source admission is secondary.
- Whitespace PASS: field groups, disclosure and separate action groups structure the task.
- Accent PASS: blue identifies selection/actions; teal is inherited keyboard focus.
- Motif PASS: exact source snapshot and explicit version selection belong to TDN's evidence flow.
- Design Read PASS: Operate for the owner, approved navy/white/blue/teal, recorded before work.

### Craftsmanship and quality locks

- C-1 PASS: palette, typography and layout preserve the approved incumbent; reasons in brief.
- C-2 PASS: visible controls have behavior or explicit prerequisite guidance.
- C-3 PASS: inventory, preparation, provenance and confirmation each serve source admission.
- C-4 PASS: loading/error/mobile/keyboard and stale/uncertain/locked states tested at owning boundaries.
- C-5 PASS: no fabricated claim; package storage is not analytical completion.
- R-05 PASS: task-led native form, not a marketing hero or template section filler.
- R-11 PASS: existing field/button/panel radius vocabulary preserved; no universal pills.
- R-15 PASS: Vietnamese action labels name storage, revision, retry and reload.
- R-16 PASS: no AI marketing buzzwords in added controls.
- R-20 PASS: exact packages, provenance, predecessor and separate report outputs define this TDN flow.
- R-21 PASS: approved light Operate context retained, no unsolicited theme change.
- R-29 PASS: no new palette; scoped CSS references existing blue/muted/line tokens.
- R-30 PASS: no external-product clone or discarded design reference introduced.
- R-31 PASS: six-block surface note records the reason for hierarchy, styling and interaction.
