# Task 012 handoff — Governed Pi proposal spike

Status: experiment completed on `feature/012-governed-pi-proposal-spike`; verdict **REVISE**; PR #12 remains open and draft.

## Identity and purpose

- Authorized correction base: `410e988be329f35064e7ccdc3c453dd0f9ef30d0`.
- Corrected implementation/evidence commit: `110f66766a99ab2dc8527fbba414b22caa70f39c`.
- Final handoff commit: the Git commit containing this document (its immutable full SHA is reported in the PR `HANDOFF_TO_CODEX` comment because a commit cannot embed its own hash).
- Purpose: evaluate a time-boxed, no-tools Pi RPC proposal adapter against the stable Task 011 submission boundary without granting Pi persistence, approval, action, tool, or production authority.
- Primary verdict: **REVISE**. Governed Pi is not adopted into production; Task 011's direct application path remains authoritative.

## Changed paths

- `experiments/260906-governed-pi-proposal-spike/.gitignore`
- `experiments/260906-governed-pi-proposal-spike/brief.md`
- `experiments/260906-governed-pi-proposal-spike/evidence/offline-results.md`
- `experiments/260906-governed-pi-proposal-spike/fake-pi-rpc.mjs`
- `experiments/260906-governed-pi-proposal-spike/prototype/strict-jsonl.ts`
- `experiments/260906-governed-pi-proposal-spike/tests/governed-pi-proposal.test.ts`
- `experiments/260906-governed-pi-proposal-spike/verdict.md`
- `docs/STATUS.md`
- `docs/handoffs/012-governed-pi-proposal-spike.md`

## Offline results

- Experiment-local TypeScript typecheck: passed.
- Focused deterministic offline suite: **9/9 passed**.
- Full `npm run check`: **62/62 repository tests passed**.
- `git diff --check`: passed.
- Regression coverage proves complete CRLF protocol acceptance and preservation of U+2028/U+2029 inside JSON strings for LF and CRLF across byte chunk boundaries.
- Existing fail-closed coverage verifies malformed JSON, fatal invalid UTF-8, oversized data, incomplete final frames, duplicate/premature protocol events, timeout/abort/cleanup, exactly one repair, and Task 011 submit/replay.

## Production-boundary verification

Comparison with authorized base `410e988be329f35064e7ccdc3c453dd0f9ef30d0` found no changes under production `src/`, production `contracts/`, migrations 0001–0008, `package.json`, `package-lock.json`, or `.github` CI configuration. Task 011 behavior remains unchanged. Migration SHA-256 values remain:

- `0001`: `cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb`
- `0002`: `b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46`
- `0003`: `a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec`
- `0004`: `0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d`
- `0005`: `e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592`
- `0006`: `241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88`
- `0007`: `18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b`
- `0008`: `285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848`

## Pi and provider evidence

- No local Pi executable was available during the original Task 012 inspection, so no Pi version was recorded.
- Official Pi documentation was pinned to upstream revision `9767ba275f3e9a5ee0f5c5342249b629ab1b2282` dated 2026-09-05.
- This correction pass did not install or invoke Pi, call a model/provider, perform a live probe, or inspect credentials, global sessions, skills, or private Pi configuration.
- Residue inspection found no runtime database/WAL/SHM, provider output, credentials, private configuration, session, log, environment, or temporary artifact. Experiment output is narrowly ignored by `experiments/260906-governed-pi-proposal-spike/.gitignore` as `out/`.

## Verdict and remaining validation

**REVISE.** The governed offline boundary passes, but there is no live evidence that Pi improves on `directTemplateProposal`, so KEEP is unsupported.

Exact remaining controlled-live-validation step: after the owner separately installs or identifies a trusted Pi executable and explicitly authorizes a bounded live probe, record read-only `pi --version`; run exactly one synthetic-fixture RPC call with the fixed no-tools/no-session launch and separately injected authentication; compare schema/semantic pass, latency, cost, operator steps, and qualitative usefulness against `directTemplateProposal`; remove every disposable output/session artifact; then decide KEEP, REVISE, or REJECT. Production adoption remains prohibited unless that controlled probe materially outperforms the authoritative direct Task 011 path.
