# Research A34: citation-only M03 narrative evidence

A34 prepares the safe input boundary for a future evidence-bound narrative. It
verifies one exact A32 metric set and the A33 chart bundle replayed from it, then
emits sixteen structured facts: listing/shop counts, observed revenue/units and
membership deltas.

Each fact has a stable claim ID, exact value or explicit missing state, unit,
coverage, record membership, pointer into the metric set and applicable chart
IDs. Missing and observed zero remain different. The authoring rules require
every future number to copy and cite one claim value; prohibit causation,
forecast, market-share and health claims; forbid cross-period comparison and
addition of overlapping scopes; and limit prose to M03 observed facts and
explicit limitations.

A34 does not call a model and does not generate prose. The marketing-framework
owner still defines future business interpretation and section methodology.
The CLI writes one new owner-only JSON file outside Git and refuses overwrite.
