# Automation Market method bridge v1

Status: implemented for retained, offline run evidence. Service/report wiring and
Linux verification belong to the coordinating lane. This is bounded M03/M08
inventory, not completed analytical sections or live activation.

## Boundary

`AutomationMarketMethodBridge.execute({runId,start,scope,collection,captures},
signal?)` reads the existing immutable capture artifacts, verifies supported
Kalodata detail exchanges, finalizes one Foundation source package, and returns
an `AutomationMarketMethodSnapshot` containing the existing canonical temporal
and generic-quote outputs. No Metric envelope, provider call, new evidence ledger
or automatic semantic approval is introduced.

The package key is `automation-method:<runId>-market-v1`, version 1. It retains
all supplied COLLECTION capture envelopes, exact decoded request/response bytes
for admitted exchanges, the frozen run/scope/collection and capture inventory,
the mapping revision, both method schema documents and both method descriptors.
Source-package metadata marks every representation non-independent. Provider
bytes remain provider-reported; application mapping/schema files remain
operator-supplied and unverified. A SOURCE role on a mapping/schema document
identifies its retained documentary bytes, not provider truth or owner authority.

Mapping revision: `kalodata-product-detail-market-inventory-v1`. The shared
`verifyAutomationDetailCaptures` supports successful price-only responses without
manufacturing a comparable. Existing scalar verification still requires exact
run, scope, selected/peer product reference, capture ordinal, query window,
request/response digests and raw-field correspondence. Known unsuccessful
outcomes cannot admit price evidence. Historical `INVALID_PAYLOAD` is admitted
only after the unchanged raw exchange passes current successful-detail checks;
the original classification remains in the package mapping.

## What real bytes permit

M03 keeps verified revenue/sales fields and their actual raw request dates.
Positive values retain NON_EXACT precision; a reported zero remains
OBSERVED_ZERO. Definition, temporal flow/additivity, source calendar/timezone,
canonical boundaries/duration, full scalar completeness and marketplace variant
identity are unknown. Requested and query dates do not populate observed-window
boundaries. The fixed frame retains every selected and explicit peer reference,
including members with no admitted scalar. No temporal operations are requested.

M08 retains `unit_price`, `min_price` and `max_price` separately as literal fields
with presence/readability state. The unit-price record is NON_EXACT, MISSING or
UNREADABLE. A second RANGE record exists only for two valid ordered endpoints.
A missing endpoint is not copied from the other endpoint; a reversed pair stays
explicitly conflicting literal inventory. No field is asserted to be the exact
purchased price of an identified variant/pack. Observation time, checkout,
conditions, variant/offer linkage, homogeneous pack, physical count, NET mass and
DRAINED mass remain unknown. All four price computations are unavailable.

The snapshot's frozen `sourceRequirements.temporal` and `.quotes` give the
renderer explicit source gaps. Product names, titles and descriptions cannot
resolve any of these requirements. Provider object IDs do not become verified
marketplace listing/variant IDs.

## Retention and replay

The service must retain the whole canonical snapshot under its committed
content-addressed artifact digest before presenting it. `verify(snapshot,input)`
is a reader of that committed snapshot, not an authenticity mechanism for an
arbitrary caller-resealed output. It validates the exact Foundation package
identity/key/version, frozen run inputs, full file membership and metadata,
capture-to-decoded-payload equality, retained schema/profile, input/output hashes
and exact descriptor membership. It never performs intake, calls a calculator,
reads today's profile, uses the clock or fetches a provider. Historic v1 metadata
and mappings remain fixed when a later writer is added.

No record truncation is allowed. Existing capture bounds and the 128 MiB package
read bound remain in force; each method inventory is limited to 500 records,
registered method sources to 1000 files, and each method/snapshot JSON output to
8 MiB. A larger collection rejects this bridge admission with an explicit bound
error; the existing paid capture artifacts are not deleted or altered.

## Primary proof

New owner: `tests/integration/research-automation-market-methods.test.ts`.
The tests use synthetic raw HTTP-shaped bytes with independent expected values,
the production artifact store and Foundation service. They cover actual
scalar/price admission and source retention, price-only/missing/unreadable/range
cases, exact-idempotent intake, read-only frozen replay, source/run/descriptor
drift, contradiction-before-write and a 502-record no-truncation case.

Test-audit authoring gate: the observable contract is real-byte admission and
mutation-free retained replay. Credible failures are price-only captures being
dropped, query/price fields being promoted into semantic proofs, or retained
source drift being accepted. Standalone method tests cannot exercise the
Foundation/capture boundary. The tests require no test-only production seam.

Linux checks, not Windows commands:

```sh
npm run typecheck
node --import tsx --test tests/integration/research-automation-market-methods.test.ts tests/unit/research-automation-verified-observations.test.ts
git diff --check
```

No Linux result is claimed here until the coordinating lane records the actual
result against these final bytes. Existing M03/M08 arithmetic proof is separate
from this bridge's admission/replay proof.
