# 0009. Run straight through to drafts; coverage per operation

- **Status:** Accepted (owner "A", 2026-10-01; coverage wording with Astra)
- **Date:** 2026-10-01

## Context

After the definition is approved, the run could either pause for owner input mid-way or go straight through. Some sections will lack the evidence they need: revenue, history, linked journeys, costs. A44's 30 sections are bounded execution paths, including inventories and blockers; they are not 30 complete analyses.

## Decision

- **Option A:** the run goes straight through and produces draft reports labelled "Bản nháp, chưa duyệt", with pending items (for example, coding that hasn't finished) visible. Owner review creates a **new version**; the draft is never edited in place. Reports are immutable.
- Pending coding blocks only the final ratios that depend on it, not unrelated sections.
- Coverage is reported **per operation and per actual run input**, using the states run-s / inv / review / block. A section that shows an inventory or a blocker is **not** counted as a completed analysis.
- Owner claims carry `operator_supplied_unverified`.

## Consequences

- The report UI and the review queue must show the reason for each section's state. The prototype's step 5 grid and step 6 grid already show reasons; the report screen is not prototyped yet.
- No report promises "complete M01–M13 / I01–I17". The promise is both structures, with honest coverage.
- Typical limits are recorded in Astra's round 1 table:
  - Current price × cumulative "sold" is not period revenue.
  - M10 shows eligibility only, with no forecasting.
  - Papers don't describe this buyer population.
