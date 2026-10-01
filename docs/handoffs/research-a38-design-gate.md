# A38 report HTML design gate

Scope: new assembly panel and its integration into the approved report renderer,
not a redesign of the operator app. Reading this as an evidence report for the
TDN owner, using the approved white/navy/blue/teal direction, ENERGY 1 / RHYTHM 2 /
MOTION 1. Native disclosures keep technical detail available without putting a
30-row matrix before the charts. No assets, typography system or theme added.

Evidence: Linux preview run 36727007917 at code head 8ede53d; assembly desktop
1440 px and mobile 390 px screenshots, visual-evidence.json and
interaction-evidence.json. Each viewport completed 267 real interactions.
Minimum measured text contrast 5.64:1; zero browser errors. The static Impeccable
detector found no issue in the new wrapper. Main coordinator inspected two
visual batches; no further layout change was required.

## Hard gate

- R-02 PASS: new visible copy contains no em dash; source text is rendered as evidence, not rewritten.
- R-03 PASS: page widths 1425/1440 and 375/390; no horizontal page overflow in both captures.
- R-17 PASS: 7/30 is derived from the retained section matrix and explicitly means partial output.
- R-18 PASS: no testimonials or people added.
- R-23 PASS: no invented assets; sample title explicitly says Synthetic.
- R-24 PASS: browser clicked anchors and verified visible exact destination IDs.
- R-25 PASS: visible text contrast checks passed, minimum measured ratio 5.64:1.
- R-26 PASS: disclosures, evidence links and exact-file downloads worked at both widths.
- R-27 PASS: static retained document; missing/zero/blocked states are labelled. Loading belongs to existing operator UI, not this offline file; corrupt assembly is rejected before delivery.
- R-28 PASS: no FAQ added.
- R-32 PASS: Enter opens disclosure and Tab advances with visible outline in browser evidence.
- R-33 PASS: feature is authored in TypeScript source; no post-generation HTML patch script.
- R-34 PASS: no theme toggle; approved fixed light report remains intact.
- R-35 PASS: actual retained HTML ran in Linux Chrome; all discovered controls were exercised.
- R-36 PASS: report says unreviewed and not publishable; trace hashes do not certify source truth.
- R-37 PASS: existing approved direction retained; no new design choice required.
- R-38 PASS: fixture is labelled synthetic and no generated consumer/market conclusion was added.

## Purpose gate

- R-01 PASS: no gradient or glow added.
- R-04 PASS: only native disclosure markers; no decorative icon system.
- R-06 PASS: inherited readable system type; code font confined to trace identifiers.
- R-07 PASS: no decorative background pattern.
- R-08 PASS: no decorative CTA arrows added.
- R-09 PASS: inherited draft badge communicates actual authority, not promotion.
- R-10 PASS: no glassmorphism.
- R-12 PASS: no new shadow or floating component.
- R-13 PASS: no glow.
- R-14 PASS: no repeated feature cards; status table is a real data comparison.
- R-19 PASS: no animation added to an evidence-reading surface.
- R-22 PASS: no generic illustrations.

## Liveliness

- Dials PASS: ENERGY 1 / RHYTHM 2 / MOTION 1 follow the approved brief.
- Consistency PASS: quiet type and separators, charts and compact disclosures; no motion.
- Focal point PASS: report title, actual charts and assembly scope heading establish reading order.
- Whitespace PASS: native disclosure blocks separate scope, calculations and traceability.
- Accent PASS: inherited blue links identify evidence navigation; no extra accent colors.
- Identity PASS: exact-value-to-evidence links and four evidence layers are specific to TDN reporting.
- Design Read PASS: existing evidence-report direction was declared before refinement.

## Craft and consistency

- C-1 PASS: each new block serves scope, retained M03 comparison or reproducibility.
- C-2 PASS: no inactive interaction; Linux click-through is recorded.
- C-3 PASS: all 30 rows come from the catalog; no filler sections invented.
- C-4 PASS: tested desktop/mobile, missing data and keyboard; no unsupported theme added.
- C-5 PASS: synthetic data is labelled; figures bind retained calculation artifacts.
- R-05 PASS: report hierarchy follows evidence, not a marketing-page template.
- R-11 PASS: no new pill-shaped components.
- R-15 PASS: labels name the operation, such as viewing section states or downloading the snapshot.
- R-16 PASS: new copy makes no AI marketing promises.
- R-20 PASS: content preserves TDN's preparation/readiness/materialization distinction.
- R-21 PASS: existing light-only print-friendly direction remains intentional.
- R-29 PASS: no color token or palette was introduced.
- R-30 PASS: no external product style was copied.
- R-31 PASS: layout supports chart-first reading relative to the new diagnostics; technical identifiers are disclosed on demand.
