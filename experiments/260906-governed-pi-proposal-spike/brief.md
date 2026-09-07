# Governed Pi proposal spike brief

Date: 2026-09-06. Time box: at most 8 active implementation hours. Status: experiment only.

## Problem and hypothesis

Evaluate whether Pi can produce useful Task 011 proposal content from a verified Task 010 audit without entering the authoritative boundary. The hypothesis remains unproven until an owner-authorized live provider probe compares Pi with the deterministic direct template.

## Baseline

The direct baseline deterministically maps supported claims to `support`, contradicted claims to `risk`, and mixed/insufficient claims to `uncertainty`, using fixed Vietnamese title/summary/rationale/open-question text. It requires no process, model, provider, repair, credentials, or network.

## Success criteria

- Exact existing Task 011 schema and semantic validation remain the final gate.
- Zero invented claim codes and zero forbidden authority fields.
- One shell-free Pi process, one initial prompt, at most one repair, deterministic cleanup.
- Strict LF- or CRLF-delimited JSONL framing, matching prompt response before `agent_end` and `agent_settled`, and fail-closed malformed/duplicate/premature/oversized behavior.
- A live result must be materially more useful or easier than the direct baseline at acceptable latency/cost/complexity before `KEEP` is possible.

## Security boundary and fixed bounds

- Verified audit request JSON: 131072 bytes (128 KiB).
- Captured model output: 65536 bytes (64 KiB).
- Total RPC stdout: 1048576 bytes (1 MiB).
- Total stderr: 262144 bytes (256 KiB).
- Wall-clock timeout: 120000 ms.
- One child process, no parallel process, initial prompt plus at most one repair.
- Pi receives no credentials, path, database handle, SQL, approval/action command, or arbitrary tool declaration.
- Application owns proposal key/version/type, objective, source identity, requested next step, proposal UUID/state/time/digest/producer identity, validation, persistence, and cleanup.

The fixed Pi arguments are `--mode rpc --no-session --no-tools --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files --no-approve --provider <trusted> --model <trusted>`. The controlled skill variant adds only `--skill <exact experiment-owned SKILL.md>` while retaining `--no-skills` and every deny flag. It is prepared but not run.

## Offline evidence and verdict

The deterministic fake RPC executable is the only child used by this spike. It receives the fixed argument vector through `spawn` with `shell: false`, an allowlisted environment, no provider credentials, and all deny flags. The focused suite verifies: valid output through the existing Task 011 `AnalysisBackedProposalService` submit/replay boundary in a disposable migrated SQLite/artifact root; invalid output with exactly one repair; rejection after a second invalid output; wall-clock timeout and child termination; LF and CRLF JSONL framing with U+2028/U+2029 preservation; rejection for malformed, partial, duplicate, and premature records; and input, assistant-output, stdout, and stderr byte limits. Each persistence path closes the database and recursively removes its disposable root.

No Pi executable was available in the Fedora login PATH or standard executable locations checked before implementation, and no live Pi/model/provider call was authorized or made. No credentials, global Pi sessions, skills, or private configuration were inspected. Reported live tokens, cost, latency, and comparative usefulness therefore remain unavailable.

**Verdict: REVISE.** The offline governed boundary works, but `KEEP` is not justified. The exact remaining evaluation is: after the owner separately installs or identifies a trusted Pi executable and authorizes a bounded live probe, record `pi --version`, run one no-tools/no-session RPC invocation with this fixed launch and synthetic fixture using separately injected provider authentication, compare its schema/semantic pass rate, latency, cost, operator steps, and qualitative usefulness against `directTemplateProposal`, clean all disposable output/session residue, and then choose KEEP/REVISE/REJECT. Until that probe materially outperforms the direct adapter, production adoption remains prohibited.
