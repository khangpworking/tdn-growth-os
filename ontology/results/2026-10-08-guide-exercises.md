# Guide exercises 3.3, 3.4, 3.5 — 2026-10-08

Source base/pre-fix shapes: `7a4dd2a682423d967fe0372577d96a81d9780d34`. Run head: `5c8642c918c1d096f1695faac64361ce8f5dae4d`.
Command: `python3 ontology/guide-checks.py` from the worktree root (the script sets telemetry-off internally).

3.3: create a throwaway proposed shape with source, rule ID, Vietnamese message,
independent v1/v2 fixtures (GPT-6-astra) and masked cold review (input 4).
3.4: simulate written rule change marker one → two; old valid becomes invalid,
new valid becomes accepted. No Ultimate/CHANGELOG change. All scratch deleted.
3.5: same offline syntax/load/verified commands and isolated persistent state.
CLI input/output hashes and full verdicts are in the companion JSON.

| Dataset | Version | Expected | Actual | Result |
|---|---|---|---|---|
| guide-v1 | v1 | True | True | PASS |
| guide-v2 | v1 | False | False | PASS |
| guide-v1 | v2 | False | False | PASS |
| guide-v2 | v2 | True | True | PASS |
| E12-blank-file | before-fix | True | True | PASS |
| E12-wrong-attribution | before-fix | True | True | PASS |
| E13-missing-indicatorCode | before-fix | True | True | PASS |
| E4-blank-author | before-fix | True | True | PASS |
