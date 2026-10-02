# Research automation provider readiness

Updated 2026-10-02 for the provider lane takeover.

## Delivered

- Completed the internal provider boundary in `src/modules/analysis/research-automation/providers.ts` and retained the existing common transport/Kalodata implementation.
- Added `provider-serpapi.ts`: one bounded official SerpApi Google organic-results request for a labelled current web snapshot. It never presents web results as annual or sales evidence.
- Added synthetic owner-boundary tests in `tests/unit/research-automation-providers.test.ts` for capability states, exact request windows, field mapping/provenance, disjoint-period collection, malformed payloads, raw captures, cancellation ambiguity, and input/SSRF rejection.
- Kalo collection preserves explicit selected and peer refs independently, splits requested periods into non-overlapping <=30-day windows, and emits single-product summaries only when every window succeeds. It does not create market or annual totals.
- Metric remains `WAITING_FOR_INPUT` (manual authenticated export), and Apify Shopee remains `UNSUPPORTED` (no verified product-detail connector).

## Exact internal exports

`providers.ts` exports the registry/configuration (`createResearchAutomationProviderRegistry`, `researchAutomationProviderConfigFromEnv`, `ProviderConfigurationError`, `PROVIDER_CREDENTIAL_ENV`), contract helpers (`formatProviderProductRef`, `parseProviderProductRef`, `splitPeriodIntoWindows`, `inclusiveDayCount`), bounds (`KALODATA_LIMITS`, `SERPAPI_LIMITS`), and the `ResearchAutomationProvider` interface plus input, result, capture, coverage, usage, and transport types. Calls accept `AbortSignal` and an optional progress callback.

Configured adapters are selected only from server environment presence:

- `TDN_KALODATA_SECRET_KEY` enables Kalodata quick search and explicit product-period detail.
- `TDN_SERPAPI_API_KEY` enables SerpApi current web discovery.
- `TDN_APIFY_TOKEN` is reported for capability visibility only; no Apify call is wired.

## Safety and evidence boundaries

Provider requests use fixed HTTPS hosts, redirect refusal, bounded 30-second/8 MiB transport, finite rate-limited work, exact request/response capture bytes, secret-echo refusal, and no caller-supplied URL fetch. Paid ambiguous outcomes are retained and never automatically retried. Monetary charges remain `UNKNOWN`; Kalodata credits are observed account-balance deltas only when both free balance receipts succeed and are labelled account-wide.

The request shapes were checked against the official [Kalodata Open Center docs](https://www.kalodata.com/open-center/docs) and [SerpApi Google Organic Results API](https://serpapi.com/organic-results). SerpApi request parameters are `engine=google`, the normalized owner keyword, `gl=vn`, `hl=vi`, and a bounded `num=10`; the API key is added only to the outbound URL and never to the capture endpoint or parameter map. Organic result URLs are accepted only as HTTPS values and are retained as provider-reported web results.

## Validation handoff

No Windows test, typecheck, build, provider request, credential read, commit, push, or deploy was performed. Run the focused provider test and the repository's required Linux checks in the isolated Fedora checkout with the pinned Node 24 toolchain. The current snapshot still needs parent integration with backend lifecycle/persistence and frontend CSP/source-image handling.
