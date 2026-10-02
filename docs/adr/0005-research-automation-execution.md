# ADR 0005: Research automation execution boundary

Status: Proposed pending owner review

## Context

Automated research needs durable state across short HTTP requests and provider
operations that may be paid or ambiguous. The application already has one
SQLite database and one operator executor lock. A second queue framework would
split retry and cancellation truth from the owning Analysis service.

## Decision

Use one Analysis-owned `ResearchAutomationService` backed by migration 0038 and
one minimal `ResearchAutomationWorker` attached to the existing operator
executor. The service persists immutable request snapshots, raw capture
artifacts, usage, step results, and report output manifests. The worker claims
only queued steps and calls the injected provider/report ports. On process
restart, provider-running rows become `INTERRUPTED` and are never automatically
retried; local rendering may be re-queued because it has no provider charge.

Cross-Box workspace identity is validated through the declared Flow workspace
reader rather than a SQL foreign key. Reports are rendered from the frozen
semantic snapshot and are separately retained as HTML and, only when a real
Chromium renderer succeeds, PDF.

## Consequences

- HTTP mutation requests return an accepted receipt and remain idempotent by
  exact request key and canonical content.
- A cancellation cannot prove a remote provider was uncharged; the run retains
  the capture and unknown-cost state.
- The operator must start and gracefully close the worker before closing its
  database. Only the existing executor lock prevents process-level duplicates.
- Provider credentials, transport, and source-specific semantics stay behind
  `AutomationSourcePort`; this ADR does not authorize provider calls or claims
  of complete market coverage.

## Rejected alternatives

- A new generic queue would duplicate leases/retries and violate the existing
  executor boundary.
- Retrying an ambiguous paid request would risk a second charge and destroy
  evidence correctness.
- A cross-Box SQL foreign key would make Analysis depend on Flow table names
  instead of its declared read contract.
