# Handoff — WEBTITLE-209 web search title read as the report's claim

Updated: 2026-10-18
Worktree/branch: `wp/web-title-quote-209`

Completed: a replayed Market run collected every source, then ended `FAILED` at
`REPORTS` with `REPORT_RENDER_FAILED`. The server log recorded
`MARKET_BUSINESS_GATE_FAILED:U13_SUPERLATIVE`.

Cause: the saved web search results carried page titles such as "Top 10 … bán
chạy nhất năm 2025" and "Tin tức mới nhất 24h qua". The "Kết quả tìm kiếm trên
web" table printed the title and site cells as plain text, and the reference
list printed the site name as a plain label, so the owned-wording rule read the
source's own wording as the report's claim. Web results are live search results,
so the failure depends on what the search returns that day. This is the same
class of fault as RENDERFAIL-209 (copied product titles), now in the web rows.

Changed paths:

- `src/modules/analysis/research-automation/reports.ts` — `webSourceText` marks a shown title, site name or free-form publication label as copied text (`<q data-quote>`). Withheld wording, "Chưa rõ trang" and the authored "Đăng" prefix stay unquoted. A retained publication label can itself contain a superlative.
- `src/modules/analysis/citation-register-html.ts` — a `WEB_RESULT` label that is a copied site name renders inside `<q data-quote>` in the reference list. The two labels reports write themselves ("Kết quả tìm kiếm trên web", "Trang web liên quan") stay unquoted.
- `src/modules/analysis/research-automation/market-business-gate.ts` — quote balancing recognizes only opening HTML elements, so escaped source text containing `data-quote` cannot disable inline normalization of authored claims elsewhere.
- `tests/unit/web-title-quote-209.test.ts` — synthetic regressions.
- `docs/handoffs/WEBTITLE-209.md`

Deliberate non-changes:

- No gate or lint rule was relaxed. The fix only marks copied source text, as the lint contract and RENDERFAIL-209 already do.
- Hiding is unchanged: a title or site that names a provider or the search engine is still replaced by the withheld wording, and the reference list still runs `assertReaderSafeCitation` on every label.
- Report wording and the reference list for every other source kind are unchanged.
- Two frozen report-byte digests were re-frozen, nothing else: `tests/integration/jev-209b-live.test.ts` (report bytes) and `tests/integration/research-automation-pdf-discovery.test.ts` (Market and Insight HTML). Their fixtures carry web rows, so the copied titles are now wrapped in `<q data-quote>`. Rendered against `c98639fa` on Linux, the new HTML equals the old HTML once those wrappers are removed; step, document, capture, usage and semantic digests are unchanged.

Evidence (Windows pre-check; CI is the run of record):

- `node --import tsx --test tests/unit/web-title-quote-209.test.ts`: 3/3 PASS. Draft and presentation reports pass `assertMarketBusinessGate`; with the marker removed the same HTML fails `U13_SUPERLATIVE`; an authored superlative still fails; the 14-rule audit result equals a neutral-title report; withheld text is unquoted and escaped source markup stays inside its cell.
- 27 test files that touch web results or the reference list: 212 PASS; the only failures are the `better-sqlite3` native module not loading on Windows (`insight-persona-report`, `research-automation`), unrelated to this change.
- `npm run typecheck`: exit 0.
- No provider, model, network, paid or credential call was made.

Linux review verification (Node 24.15.0, browser variables unset): typecheck exits
0; the five requested files pass all 27 assertions; the browser-free related and business-gate
checks pass 314 assertions across 33 files. Frozen-byte checks pass, and a direct
comparison with `c98639fa` preserves Market/Insight semantics, citation identities,
empty-report bytes and web/PDF register bytes for all five non-web source kinds.
The original regressions fail on `c98639fa`; the quote-token and publication-label
regressions also failed on the PR before their repairs. The separate
official-statistics integration file times out after the same five completed
tests on both this tree and `c98639fa`; its isolated category-map assertion passes.
No lint exemption was changed. CI on `17c94709` then failed the two report-byte
digests above, which that review did not run; they were re-frozen as described.

Unresolved: none for this lane.

Next action: review at the exact head, CI, merge; then rerun the replay test on a checkout of the merge.

Business decisions pending: none introduced by this lane.
