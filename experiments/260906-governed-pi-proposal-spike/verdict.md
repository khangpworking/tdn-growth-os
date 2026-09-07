# Task 012 verdict

**Primary verdict: REVISE.** Governed Pi is not adopted into production.

## What passed offline

- The fixed RPC launch is direct and shell-free, uses an allowlisted environment, supplies trusted provider/model arguments, and retains all no-session/no-tool/no-extension/no-skill/no-template/no-theme/no-context/no-approval flags.
- The parser accepts LF and CRLF JSONL, strips exactly one CR immediately before an LF, preserves U+2028 and U+2029 within JSON strings, validates UTF-8 fatally, and rejects malformed, incomplete, duplicate, premature, and oversized protocol data.
- Deterministic fake-child output passes the existing Task 011 schema and semantic validation through `AnalysisBackedProposalService`, persists and replays in a disposable SQLite/artifact root, permits at most one repair, and cleans up on success and failure.
- Focused typecheck/tests, the full repository check, protected-path comparison, and residue inspection are required before handoff; sanitized results are recorded in `evidence/offline-results.md`.

## Why this is not KEEP

No trusted local Pi executable or version was available, and no live Pi/model/provider call was authorized or made. Consequently there is no measured live schema/semantic pass rate, latency, token/cost result, operator burden, or usefulness comparison against `directTemplateProposal`. Offline boundary correctness alone does not establish that Pi adds value.

## Controlled live validation still required

After the owner separately installs or identifies a trusted Pi executable and explicitly authorizes a bounded live probe: record read-only `pi --version`; run exactly one synthetic-fixture RPC call with the fixed no-tools/no-session launch and separately injected authentication; compare schema/semantic pass, latency, cost, operator steps, and qualitative usefulness with `directTemplateProposal`; remove all disposable output/session residue; then choose KEEP, REVISE, or REJECT. Production adoption remains prohibited unless that controlled probe materially outperforms the direct Task 011 application path.
