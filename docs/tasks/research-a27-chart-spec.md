# Research A27: evidence-bound ChartSpec

## Outcome

Add one closed, canonical visualization contract between deterministic
`charts.json` and the HTML/PDF renderer. The contract makes every allowed M03
and M04 view replayable and gives every visible mark an exact reverse path to
ChartData and the calculation Result.

This task does not implement another one of the 30 business sections. Coverage
remains 7/30: M02, M03, M04, M08/P4, M13, I03 and I17.

## Allowed views

The exact v1 set contains fourteen horizontal-bar views in fixed order:

1. M03 scope totals for revenue, units, listings and shops;
2. M04 cumulative Top 1/3/10 observed-revenue share for ALL, WIDE and CORE;
3. M03 ALL-to-WIDE/CORE membership sensitivity for observed revenue, with
   materialized unit deltas and removed-record counts;
4. M04 group composition for ALL, WIDE and CORE, including explicit UNKNOWN;
5. M04 top-shop-removal sensitivity for ALL, WIDE and CORE.

Pie, donut, stacked Top-K, time-series, dual-axis, 3D, gauge, AI sorting and
cross-scope stacked charts are outside v1 because they would imply a relation
the calculation layer does not establish.

## Truth and replay boundaries

- `ALL`, `WIDE` and `CORE` overlap and are never additive.
- Missing, blocked or unavailable values are never converted to zero. An
  observed zero remains a visible exact zero.
- UNKNOWN remains visible and follows the frozen WIDE policy.
- Top-K shares are cumulative and retain their exact numerator, denominator,
  membership and Result pointers.
- Membership deltas are same-period filter effects, not growth.
- Group order is the Result's code-unit order. More than 100 groups blocks that
  visual instead of truncating, ranking or silently combining values.
- Local-max bar geometry is comparable only within its own view.
- The renderer validates the exact fourteen-view set and the frozen axis,
  scale, unit, order, geometry and relationship before producing HTML.
- ChartSpec is included in the semantic report identity, but renderer-only CSS
  or HTML/PDF changes do not create new business content.

## Evidence layers

The report preserves the requested separation:

1. original source bytes and locators;
2. reproducible Result and ChartData calculations;
3. optional evidence-bounded AI interpretation, still separate and unreviewed;
4. a future explicit human decision, also separate.

ChartSpec belongs to layer two. It creates neither interpretation nor approval.

## Architecture reference

The 2025 IEEE VIS workshop paper [Structured AI Agents for Reliable
Visualization Report Generation](https://lijieyao.com/assets/pdf/Structured_AI_Agents_for_Reliable_Visualization_Report_Generation.pdf)
supports decomposing reports into schema-bound subtasks whose quantitative
outputs are executed and verified before narrative composition. A27 adopts that
separation, but does not adopt model-generated Python as a production method:
TDN calculations remain named, versioned application code, and AI remains a
separate evidence-bounded interpretation layer.

## Verification ownership

The existing chart unit suite owns the canonical ChartSpec, exact view order,
mark/annotation pointers, missing/zero behavior and semantic-drift rejection.
The semantic-content suite owns renderer-insensitive identity. The existing
source-backed integration case owns the actual export, envelope digest,
download, visible HTML and mutation-free replay. No duplicate suite or
test-only production seam is added.

Linux Check and the research-report preview are release gates. Windows is used
only for contract generation and static inspection.
