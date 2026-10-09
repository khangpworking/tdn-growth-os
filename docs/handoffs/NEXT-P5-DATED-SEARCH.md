# P5 explicit dated/single-site expanded search

Task `task_e3facc72a28c`, dispatch `ctx_602611cbeff7`, run `run_adc3551f8ed8`.
Base: `f78c02cb366069b348acadf68c8449538f91a80f`.

## Delivered boundary

The internal `expanded-search-request-v1` sidepath plans only confirmed product/brand
words. It accepts an explicit calendar window and one plain DNS domain, sends Google
`tbs=cdr:1,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY` together with `site:<domain>` in `q`,
and refuses query-operator/domain/calendar injection before transport. The new path
requires the response's exact `search_parameters.q`; ordinary collection keeps its
existing parser, wire parameters, output shape, limits and cache-key helper.

`createExpandedSearchRunner` in `expanded-search.ts` actually calls the bounded SerpApi
adapter and existing L9 consumer. Each runner belongs to one fixed run/credential scope
and shares the supplied `SearchCallBudget` (unchanged search 10 / Trends 4 defaults).
The cache identifies every actual secret-free parameter, requested window/domain and
UTC retrieval day. It retains settled paid attempts, including ambiguous failures,
without automatic retry; replay issues no new request and reports zero invocation
usage separately from the original receipt. Returned bytes are copied from the cache.

Every result retains its capture/position identity, source URL, literal reported `date`
or null and `retrievedAt`; requested window/domain remain separate. Expanded captures
have distinct session identities. L9 validates its existing canonical data before any
request and classifies retained title/snippet records before `mainCount`. That count
means INCLUDED result records only: not unique entities, event dates or market rates.
EXCLUDED and UNCLEAR records and their reasons remain in the result accounting.

## Scope and limits

P5-07/08/09, M09/S19/E14 and U25 have an executable internal safe slice. No application
Start/API/storage/report/source-board activation is added. Full P5-02/04 functional
run storage, Trends integration, provider rights/Phase 0 GO and live activation remain
pending; historical spike approval grants no permission for live calls. No event date
is inferred from a query window and a site restriction authenticates no authority.
General U27/G13 consumers and U11/U26/U32/U40 remain unresolved.

Owned changes: the three granted query/provider files, new `expanded-search.ts`, and
this handoff. Canonical schemas, old tests/assertions, service/API/frontend, manifests,
caps/defaults and ignored browser output are unchanged. No Vietnamese interpretation
or humanizer invocation was authored.

## Verification and next action

Validation under the coordinator's sole runner grant `msg_33dae518db03`: pinned
Node 24.15.0 strict backend statics exited 0. One serialized concurrency-2 tree passed
37/37 controls: 30 unchanged original query/provider/L9 tests and seven new outsideGit
fake-transport controls. These cover wire/cache/date/L9/budget/cancellation/parser
refusal and complete ordinary output/capture/wire equality against exact f78 provider
source on seven synthetic fixtures (no nondeterminism exclusions). No failures or
skips occurred. Heavy runner released immediately after the final child; ignored
browser JS remains the original `734e6851` bytes and dependencies were reused unchanged.
Evidence and final author report: `/tmp/ultimate-p5-dated-search-sol`.
Independent reviewer2d, exact-candidate hosted full/readiness and normal matching-head
merge remain required; publication is HOLD. No whole P5 or milestone closure is claimed.
