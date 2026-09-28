# Research A6: explicit tablet quote arithmetic

Draft delivery from A5 head `649abfb172c6e29d3ffa783cce1416241cb64fd4`.
Unmerged research dependencies remain review/owner-merge gates; this does not
deploy or approve them.

Delivered: canonical closed input/output schemas, generated types, pure
`normalizeTabletQuote` / exact replay, synthetic unit fixtures and a private
`research:quote:normalize` CLI. The CLI publishes exact raw input, canonical
input, result and a digest manifest through the existing bounded publisher.

The normalizer performs only `price / explicit positive tablet count`. Missing
price/count stays unavailable. It preserves original pack text, title,
source ref, listed-versus-checkout price, observation declarations and
variant/GTIN/version flags. All output is SCENARIO, UNREVIEWED and declared/
unverified. Period text is not validated as a comparable commercial interval.
Counts and TABLET units are explicit operator declarations, never inferred
from prose. Exact rational values are separate from two-decimal half-even
display rounding.

No comparison groups, min/max/range, ranking, market price conclusion, demand,
WTP, equal dose, efficacy, recommended price or provider-authenticity claim.
Capsules/ampoules/sachets are not silently relabelled as tablets. Broader
comparison requires a separate owner-selected basis and identity rule.

## Validation record

No Windows tests, builds or typechecks. Canonical code generation is a mechanical
local step; Linux CI is authoritative. Final SHA, checks and handoff are recorded
on the draft PR. Unit tests own equations and input gates; one CLI integration
test owns exact-byte input/result/manifest wiring without duplicating the private
publisher's full safety suite. Expected arithmetic is independently specified:
240000/30 = 8000; 100005/40 = 20001/8, displayed 2500.12.

No dependency, migration, live database, runtime state, real data, provider call,
paid operation, human decision, merge, deployment or Windows backport changed.
