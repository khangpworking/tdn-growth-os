# Market snapshot interpretation

Use this Box 2 capability when a completed, verified `market_snapshot_v1` Result needs bounded descriptive interpretation.

- Skill identity: `analysis:market-snapshot-interpretation` version `1`.
- Required input: immutable Result UUID through the governed execution request contract.
- Output: receipt referencing the existing immutable Task 006 interpretation ID and artifact SHA-256.
- Adapter: `GovernedAnalysisSkillExecutor` delegates to `MarketSnapshotInterpretationService`.
- Prompt/output contracts: Task 006 market-snapshot interpretation prompt and schemas.
- Authority denied: tools, shell, arbitrary filesystem access, approval, business mutation, and network access except the interpretation service's configured injected `AiGateway`.

This file is declarative documentation, not executable authority. The static registry in application code is the authoritative allowlist; no runtime scans or loads this file.
