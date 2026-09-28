# Research A4: source-backed report export

Status: draft PR #60, not merged or deployed. This is one implementation slice
of the full report-automation goal, not completion of all 30 sections.

## Delivered boundary

- An exact source-package ID and manifest digest bind a verified discovery
  workspace to retained workbook, manifest and optional label bytes.
- The exporter re-parses those bytes, recomputes the A1 calculation and builds
  the A3 packet. It does not authenticate the provider or operator labels.
- M03 scope totals and M04 cumulative shop concentration have exact-value
  charts. A number links to its claim, formula, denominator, membership and
  source-row locator. Overlapping scopes are never added together.
- The static Vietnamese HTML keeps source, calculation, AI interpretation and
  human decision separate. AI and approval are explicitly absent in this slice.
- All 30 section states remain visible. Partial calculations do not mean the
  complete section methodology is implemented.
- Original bytes and machine-readable dependencies accompany the report.
  Local browsers may open JSON references rather than download them; both
  actions must resolve to the retained exact file.
- Reads and publication have 32 MiB/member and 128 MiB aggregate bounds.
  Oversized data fails visibly rather than truncating rows.
- The CLI uses a read-only, query-only database. Export directories remain
  outside Git, owner-only, deterministic and non-overwriting.

## Verification record

- Code head `edf5bffff2123078ad4b53de2c6422834479bd02`: Linux
  [Check 36378129587](https://github.com/khangpworking/tdn-growth-os/actions/runs/36378129587)
  passed, including 461/461 backend tests, contracts, typechecks, frontend
  tests and build. The zero-denominator blocker regression remains intact.
- [Preview 36378129504](https://github.com/khangpworking/tdn-growth-os/actions/runs/36378129504)
  passed at the same code head. Every rendered summary, evidence anchor and
  source-file link was exercised on desktop and mobile; keyboard activation,
  visible focus and measured text contrast passed, with no page errors.
- Synthetic previews are generated through the actual persisted-source export
  CLI, not by hand-authoring a report. Browser evidence covers desktop 1440 px
  and mobile 390 px, native disclosures, evidence navigation, source files and
  keyboard focus. A PDF capture is preview evidence, not a production PDF job.
- No Windows tests, typechecks or builds were run.

## Review and design

Antislop is applied during design, as selected by the owner. The approved TDN
visual system is preserved. A fresh Impeccable-role review requested four
bounded corrections: reveal linked evidence, shorten the mobile preamble,
restore teal focus and enlarge numeric link targets. Fresh Linux captures
received final disposition **ship**; all four findings are resolved after two
bounded correction rounds. See `docs/frontend/research-evidence-delivery-gate.md`
for the main agent's evidence-backed Antislop gate.

The shipped named reviewer was not exposed by this harness; a fresh no-history
reviewer used the Impeccable finish-review contract. DESIGN.md and its existing
sidecar are not silently rewritten. Pre-existing context drift remains outside
this extension.

## Remaining work and authority boundaries

- A1 #52, A2 #54 and A3 #55 are unmerged dependencies carried by this draft;
  #60 must not bypass their independent reviews or owner merge decisions.
- Normalized observations and report-run versions are not yet persisted by
  A4. No operator dashboard route or report-approval API is added.
- Narrative structural checks cannot prove semantic truth. Interpretations
  need source-bound explanations and human review; approval does not create
  independent evidence.
- P3/P4 retained arithmetic is the next bounded method work. Seller-specific
  economics, optimal pricing and equal-dose comparisons remain out of scope.
- Migration integration, real source manifests/labels, report approval
  semantics and live deployment/provider authorization remain separate gates.

No private input, provider call, paid AI call, live migration, real business
decision, merge or deployment occurred.
