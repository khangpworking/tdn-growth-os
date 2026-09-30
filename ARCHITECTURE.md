# TDN Growth Operating System

> Amendment 2026-09-11: the owner selected React + Vite + TypeScript for the new frontend. [ADR 0002](docs/adr/0002-react-vite-typescript-frontend.md) supersedes this original brief's vanilla TypeScript/Bootstrap frontend choice and exclusion of React from v1. Backend runtime, SQLite, module boundaries and Fedora hosting remain unchanged. Original baseline text below is retained for traceability.

## Project Architecture and Baseline Technology Stack

| Field | Value |
|---|---|
| Status | Accepted v1 baseline |
| Owner | Primary developer |
| Capacity | One developer, 40 hours/week |
| Architecture | Single-host TypeScript modular monolith |
| Runtime roles | Separate web and worker processes from one repository and build artifact |
| Review cadence | At each phase boundary or when a migration trigger is reached |

This is a living implementation baseline. It describes decisions, boundaries,
and triggers—not a wishlist of possible technology.

## 1. Purpose

The system turns external evidence into reproducible analysis, governed business
recommendations, and authorized actions for a calcium-supplement business.

It must support:

- Evidence acquisition, provenance, freshness, and retention.
- Versioned Data Packs and analytical Results.
- Deterministic calculations before AI interpretation where practical.
- Schema-constrained AI analysis through bounded tools.
- Durable background jobs and recoverable workflows.
- Health/legal, finance, marketing, and executive approval gates.
- Human authorization of consequential actions.
- Operational auditability, backup, restore, and replay.

### 1.1 Design priorities

When priorities conflict, the earlier item wins:

1. Evidence correctness, provenance, and governed authorization.
2. Low operational burden for one owner.
3. Delivery speed.
4. Maintainability and testability.
5. Compatibility with AI-assisted development.

### 1.2 Design principles

- Prefer established libraries for substantial generic capabilities.
- Keep small domain-specific logic local and explicit.
- Use one library per capability unless a measured requirement justifies overlap.
- Add a component only when it removes more operational burden than it creates.
- Retain working foundations until evidence justifies replacement.

These are decision guides, not testable architectural invariants.

### 1.3 Assumptions

- Production initially runs on one Linux host with local, non-network storage.
- The operator console has few concurrent internal users.
- Existing Express, SQLite, durable-worker, UI, and test foundations are usable
  unless the Phase 0 inventory shows otherwise.
- AI provides decision support but holds no business approval authority.
- The application does not store or process patient or medical records.
- Any public storefront is a separate system.
- The relevant regulated concern is health-claim substantiation and publication,
  not clinical care or medical-record processing.
- External collection is subject to licensing, provider terms, and legal review.

### 1.4 V1 non-goals

- Multi-tenancy or horizontal scaling.
- Microservices or independently deployed Boxes.
- Separate databases per Box.
- Native mobile applications or real-time collaboration.
- Autonomous AI approval or a general-purpose agent platform.
- A general policy engine or comprehensive analytics warehouse.
- A public commerce storefront.

## 2. Phase 0 Inventory Gate

Before affected production capabilities are enabled, confirm:

- Package manager, lockfile, module format, and current dependency inventory.
- SQLite driver, database location, migration mechanism, and current schema.
- Worker leases, transactional claims, retries, deduplication, cancellation,
  dead-letter behavior, resume, and replay.
- Host, process supervisor, storage layout, and filesystem durability.
- Recovery-point objective (RPO) and recovery-time objective (RTO).
- Artifact volume, growth rate, retention, and deletion obligations.
- Real user roles and approval capabilities.
- Licensing, collection rights, and retention rules for each source.
- Whether an AI-accessible tool executes code or processes hostile active content.

Unsafe affected capabilities remain disabled until their gate is resolved. Safe
inventory work and a manual-input walking skeleton may proceed in parallel.

## 3. Architectural Invariants

Changes to these rules require an Architecture Decision Record (ADR).

1. The five Boxes **MUST** remain modules in one modular monolith in v1.
2. One SQLite database **MUST** be the authoritative operational store.
3. Cross-Box mutations **MUST** use typed application services. A module
   **MUST NOT** write directly to another module's tables.
4. Cross-Box reads **MAY** use declared query interfaces.
5. The durable-worker subsystem **MUST** exclusively own execution mechanics:
   leases, scheduling, attempts, retries, backoff, cancellation, deduplication,
   and dead-letter handling.
6. Workflow rules and authoritative state **MUST** remain in Box application
   services and SQLite; workers apply transitions through those services.
7. n8n **MUST** remain connector-edge only. It **MUST NOT** be authoritative
   for workflows, approvals, evidence identity, or core retry semantics.
8. Deterministic calculations **MUST** precede AI interpretation wherever a
   defined formula can provide the result.
9. JSON Schema **MUST** be canonical for persisted and external contracts.
   AJV **MUST** validate every trust boundary.
10. AI **MUST NOT** receive ambient authority, unrestricted SQL, shell,
    filesystem, credentials, or approval powers.
11. Consequential actions **MUST** require an authorized human actor.
12. Finalized artifacts **MUST** be addressed and verified by SHA-256 digest.
13. Approval and transition history **MUST** be appended and superseded, never
    rewritten to represent a new decision.
14. Every durable operation **MUST** be idempotent or transactionally deduplicated.
15. The database and artifacts **MUST** be backed up and restorable together.

## 4. System Context

```text
Licensed APIs / exports / uploads / browser collection
                         |
                         v
                Connector boundary
          (application collector or n8n)
                         |
                         v
+----------------------------------------------------------------+
|                TypeScript modular monolith                      |
|                                                                |
| Box 1        Box 2         Box 3        Box 4        Box 5     |
| Data         Analysis      Orchestrator Flow Engine   QC &      |
| Foundation   Toolbox                                  Governance|
|                                                                |
| Typed application services and declared query interfaces       |
|                                                                |
| DB | Jobs | Artifacts | AI | Auth | Config | Logging           |
+----------------------------------------------------------------+
           |                  |                     |
           v                  v                     v
      SQLite WAL      Artifact filesystem      OpenAI API
           |
           v
    Durable worker process

Human operators -> Cloudflare Access/Tunnel -> web process
```

### 4.1 Primary governed workflow

```text
Acquire source
 -> persist raw evidence and provenance
 -> freeze versioned Data Pack
 -> run deterministic calculation
 -> request schema-constrained AI analysis
 -> validate output with AJV
 -> create proposed transition
 -> apply policy checks
 -> obtain authorized human decision
 -> execute approved action
 -> retain outcome evidence
 -> replay from frozen inputs
```

`UNKNOWN`, `HYPOTHESIS`, `HOLD`, `REJECTED`, and `APPROVED` are explicit
states, not prose conventions.

## 5. Module Boundaries

| Module | Owns | Must not own |
|---|---|---|
| Box 1 — Data Foundation | Sources, ingestion, raw evidence metadata, provenance, freshness, quality, Data Packs, artifact references | Strategy, claim approval, execution authority |
| Box 2 — Analysis Toolbox | Deterministic calculations, assumptions, uncertainty, AI synthesis, Results, citations | Mutable source truth, approval authority |
| Box 3 — Orchestrator | Governed proposals, scenarios, objectives, evidence-to-recommendation links, bounded AI coordination | Direct external side effects, approval authority |
| Box 4 — Flow Engine | B0–B14 lifecycle, authorized plans, tasks, external actions, status, outcome evidence | Policy authorship, rewriting approvals |
| Box 5 — QC & Governance | Policies, capability rules, approval requests, holds, decisions, supersession, audit views | Rewriting evidence, Results, or historical events |

Platform modules provide shared technical capabilities without Box-specific
business policy.

## 6. Repository Structure

```text
src/
  modules/
    foundation/
    analysis/
    orchestrator/
    flow/
    governance/
  platform/
    ai/
    artifacts/
    auth/
    configuration/
    db/
    jobs/
    logging/
  web/
    middleware/
    routes/
  worker/

frontend/
  api/
  components/
  pages/
  styles/

contracts/
migrations/
prompts/
tests/
  fixtures/
  integration/
  e2e/
scripts/
docs/
  adr/
```

Use one repository and one application package initially. Web and worker are
separate runtime processes built from the same artifact. Do not add a monorepo
manager, separately versioned internal packages, or separate Box deployments.

## 7. Baseline Technology Stack

| Concern | Baseline decision | Notes |
|---|---|---|
| Runtime | Node.js 24 LTS | Target after native-module and repository compatibility tests |
| Language | Strict TypeScript | Workspace-pinned version; `tsc --noEmit` in CI |
| API/web | Retained Express | Adopt Express 5 only after middleware and route compatibility tests |
| Database | SQLite in WAL mode | Local, non-network storage |
| SQLite driver | Retain supported existing driver | Likely `better-sqlite3`; confirm in inventory |
| Query/migrations | Retain reliable existing implementation | Explicit reviewed migrations |
| Background work | Existing database-backed durable workers | Repair in Phase 1 if inventory reveals weak guarantees |
| Contracts | JSON Schema + AJV | Generate TypeScript types; avoid duplicate schema systems |
| AI | Official OpenAI TypeScript SDK behind `AiGateway` | Structured outputs and bounded typed tools |
| Frontend | Vite + vanilla TypeScript | Vite transpiles; `tsc` type-checks separately |
| UI | Bootstrap | Single general UI system |
| Icons | Lucide | Accessible labels for icon-only controls |
| Browser networking/state | Native `fetch`, URLs, small local modules | Server and database remain authoritative |
| Logging | Pino + HTTP integration | Request, run, job, and actor correlation |
| Unit/integration tests | Retain adequate runner; otherwise Vitest | Use one unit-test runner |
| API tests | Supertest | Test routes through application boundaries |
| Browser tests | Playwright | Critical journeys and browser-required collection |
| Lint/format | ESLint + Prettier | Required CI checks |
| Editor tooling | Workspace TypeScript and editor LSP | `typescript-language-server` only for generic LSP editors |
| Perimeter identity | Cloudflare Tunnel + Access | Application still verifies identity and authorization |
| Artifacts | Content-addressed local filesystem | SQLite stores the manifest |
| Backup | Consistent SQLite snapshot + encrypted off-host restic | Back up DB, artifacts, and non-secret config together |
| Deployment | One Linux host | Existing supervisor; Compose only if it reduces burden |
| CI/CD | Existing CI or GitHub Actions | Lockfile-based reproducible install |
| Dependency updates | Renovate or Dependabot | Choose one |
| Secret scanning | Gitleaks | Do not commit plaintext secrets |

Sentry is optional at production launch if unattended errors are otherwise easy
to miss. It is not a baseline architecture dependency.

### 7.1 TypeScript configuration

Enable at minimum:

- `strict`
- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- Source maps
- `tsc --noEmit` as a required CI gate

Prefer ESM for new code only when compatible with the existing repository. Do
not delay delivery solely to migrate module formats.

### 7.2 Express request path

```text
request
 -> authentication
 -> authorization
 -> AJV input validation
 -> application service
 -> AJV output validation where applicable
 -> response
```

Routes and middleware must remain thin. Business rules belong in Box services.

### 7.3 Frontend policy

Progressively migrate touched screens to Vite, vanilla TypeScript, Bootstrap,
and Lucide. Use native accessible HTML controls when sufficient. Do not recreate
server workflow truth in browser state.

Angular, PrimeNG, React, Vue, Redux, and a general client-state framework are
not part of v1.

## 8. Data, Artifacts, and Migrations

### 8.1 SQLite practices

- Enable WAL and foreign keys.
- Configure a busy timeout.
- Keep write transactions short.
- Use explicit transaction boundaries.
- Control WAL checkpoints.
- Claim jobs transactionally.
- Execute each migration once during deployment.
- Take a consistent backup before production migrations.
- Use corrective forward migrations and verified restore procedures; do not
  assume every migration can be automatically reversed.

### 8.2 Artifact storage

```text
artifacts/sha256/<digest-prefix>/<full-digest>
```

Write through a temporary file, verify the digest, then atomically rename. The
SQLite manifest records:

- Digest, byte size, and media type.
- Original source and acquisition time.
- Producing run and Data Pack.
- Schema, parser, calculation, and policy versions.
- Retention status.

A user-supplied filename must never define artifact identity.

Content digests provide stable identity and mismatch detection, not
administrator-proof immutability. Stronger assurance requires an independently
protected signature, anchor, or write-once copy.

## 9. Ownership of State and Side Effects

| Concern | Authoritative owner |
|---|---|
| Business and workflow state | SQLite through owning Box application services |
| Transition rules | Owning Box application service |
| Job leases, attempts, retries, scheduling | Durable-worker subsystem |
| Evidence metadata and Data Packs | Box 1 — Data Foundation |
| Calculations and Results | Box 2 — Analysis Toolbox |
| Proposals and scenarios | Box 3 — Orchestrator |
| Authorized execution and outcomes | Box 4 — Flow Engine |
| Policies and approvals | Box 5 — QC & Governance |
| Artifact bytes | Content-addressed artifact store |
| External connector execution | n8n or application collector |
| AI tool dispatch | `AiGateway` and application command dispatcher |
| Human authorization | Application capability matrix |

n8n may poll providers, receive webhooks, retain connector-local cursors and
execution metadata, normalize envelopes, call authenticated endpoints, and send
notifications. It must not own business truth, approvals, Data Pack or Result
identity, core retries, evidence lineage, or B0–B14 progression.

Assume at-least-once worker execution. Every handler must be idempotent or
protected by a transactional idempotency key.

## 10. Governed AI

The application owns the provider boundary:

```ts
interface AiGateway {
  execute<TInput, TOutput>(
    request: GovernedAiRequest<TInput, TOutput>
  ): Promise<GovernedAiResult<TOutput>>;
}
```

The gateway—not the model—enforces:

- Authorization and narrow credentials.
- Allowlisted, schema-versioned tools.
- Time, token, cost, and result-size limits.
- Idempotency and deduplication.
- Structured-output validation with AJV.
- Audit events for calls and tool results.

Each AI run records run/job IDs, model identifier, prompt identifier and version,
input artifact digests, output schema version, tool requests/results, usage,
latency, errors/retries, and human disposition.

AI proposes state changes. Application services validate and apply them. AI
cannot approve its own recommendation.

If any AI-accessible tool executes arbitrary code or processes hostile active
content, container or VM isolation becomes an immediate baseline requirement.

### 10.1 Reproducibility and replay

- Exact deterministic replay requires frozen inputs plus calculation, code, and
  configuration versions.
- AI replay preserves inputs, prompt version, model identifier, settings, tool
  traces, and output schema for audit, but may not produce byte-identical text.
- Never depend on model re-execution to recreate the original governed record;
  retain the original validated output as an artifact.

### 10.2 Structured report execution

Automated reports are assembled from closed, versioned section recipes rather
than one unconstrained prompt. The execution order is source preservation,
input validation and normalization, section readiness, allowlisted
deterministic calculation, evidence-bound chart and interpretation artifacts,
validation, human disposition, and versioned presentation.

Charts and narrative inputs for a section must share the same verified metric
set. An AI model may select an allowlisted recipe or produce a schema-validated
interpretation, but it may not invent quantitative values or supply arbitrary
Python/JavaScript for execution. Changing source membership, normalization,
method, policy, prompt, chart semantics, or human disposition produces a new
versioned identity. This adopts the useful structured-unit idea from
"Structured AI Agents for Reliable Visualization Report Generation" while
rejecting its arbitrary model-generated code path.

## 11. Authentication, Authorization, and Governance

Cloudflare Tunnel limits public origin exposure. Cloudflare Access establishes
perimeter identity. The application must still validate identity assertions and
enforce authorization.

Use a small capability matrix for:

- Owner/administrator.
- Analyst/proposer.
- Health/legal approver.
- Finance approver.
- Marketing approver.
- Read-only auditor.

AI must not approve governed decisions. A human may approve only when the
capability matrix authorizes the actor. Separation of proposer and approver is
enforced wherever policy or law requires it.

Approval events append:

- Actor identity and role snapshot.
- Action: approve, reject, hold, or supersede.
- Rationale and timestamp.
- Data Pack, Result, decision, and artifact identifiers.
- Policy and threshold versions.
- Previous state and concurrency version.

Prior events are never edited to represent a new decision. Hash chaining may be
added for tamper evidence, but without an independent anchor it must not be
described as immutable or administrator-proof.

Health/legal review is required for health-claim rules and representative
outputs before publication.

## 12. Collection Strategy

Use the lowest-maintenance lawful method that satisfies the requirement:

1. Licensed provider API or export.
2. Manual upload.
3. Ordinary HTTP retrieval and parsing.
4. Playwright only when browser execution is necessary.

Each collector records provenance, acquisition time, parser version,
licensing/retention status, rate constraints, and failures. Retain raw input
where permitted and provide a manual fallback.

## 13. Testing Strategy

Required coverage includes:

- Deterministic formulas and accepted calcium fixtures.
- JSON Schema contracts and database constraints.
- Migrations and pre-migration recovery.
- Worker leases, retries, cancellation, idempotency, and duplicate delivery.
- Authentication, authorization, and approval transitions.
- Artifact digest verification and frozen-input replay.
- Missing, stale, and conflicting evidence.
- Unsupported or unsafe health claims.
- Invalid model output and denied AI tools.
- One complete calcium workflow.

CI order:

```text
lockfile install
 -> contract and migration checks
 -> tsc --noEmit
 -> ESLint and Prettier checks
 -> unit and integration tests
 -> server and frontend builds
 -> critical Playwright journeys
 -> secret/deployment-artifact scan
```

## 14. Observability and Operations

Pino logs must propagate request, run, job, and applicable actor identifiers.

Track at minimum:

- Queue age and failed/dead-letter jobs.
- Approval wait time.
- Source freshness.
- AI cost and latency per accepted result.
- Last successful backup.
- Last successful restore rehearsal.

Provide operational views for stalled workflows, failed jobs, pending approvals,
and stale sources. Centralized tracing and a full metrics platform are deferred
until structured logs and correlation IDs cannot localize material failures.

## 15. Deployment, Backup, and Recovery

Run web and worker as separate processes on one Linux host using the same build
artifact. Use the existing supervisor unless Docker Compose demonstrably reduces
deployment burden. n8n communicates only through authenticated connector APIs.

Deployment sequence:

1. Verify the release artifact and configuration.
2. Create a consistent pre-migration backup.
3. Apply migrations exactly once.
4. Replace/restart web and worker processes.
5. Run health checks and a critical smoke test.
6. Retain the preceding artifact for application rollback.

Create SQLite snapshots with the Online Backup API or `VACUUM INTO`; never
blind-copy an active WAL database. Back up the database snapshot, artifacts, and
non-secret configuration together to an encrypted off-host restic repository.

Define RPO/RTO in Phase 0, set backup cadence accordingly, and perform and record
a restoration rehearsal at least monthly.

## 16. Architecture Decision Records

Store ADRs under `docs/adr/NNNN-title.md` with:

- Context.
- Decision and status.
- Alternatives considered.
- Consequences.
- Trigger to revisit.

Seed ADRs:

1. Modular monolith and canonical Box boundaries.
2. SQLite as the v1 authoritative operational store.
3. Worker execution ownership and n8n connector boundary.
4. JSON-Schema-first contracts with AJV.
5. Bounded `AiGateway` and human approval authority.
6. Content-addressed artifacts and replay scope.
7. Single-host web/worker topology.
8. Snapshot plus restic recovery strategy.
9. Reproducibility: deterministic exactness versus bounded AI replay.

The baseline is adopted by this document. New ADRs are required for material
changes to invariants, authoritative stores, trust boundaries, topology, or
major runtime dependencies—not for every library installation.

## 17. Implementation Sequence

### Phase 0 — Inventory and controls

- Complete the inventory gate.
- Test Node.js 24 and native-module compatibility.
- Define RPO/RTO and capability matrix.
- Establish strict TypeScript, CI, Pino correlation, secrets handling, backup,
  and the first restoration rehearsal.
- Select one accepted calcium fixture.

### Phase 1 — Walking skeleton, target by approximately week 6

Deliver one complete path:

```text
source
 -> evidence
 -> Data Pack
 -> deterministic calculation
 -> validated AI analysis
 -> proposal
 -> authorized human decision
 -> approved action
 -> retained outcome
 -> replay
```

### Phase 2 — Reliability

- Add failure, rejection, hold, timeout, retry, and duplicate-delivery paths.
- Add operational screens and stale-input handling.
- Exercise migration rollback procedures and monthly restore rehearsal.
- Expand security and governance tests.

### Phase 3 — Scenario-driven expansion

Add sources, questions, B0–B14 states, roles, UI capabilities, and AI tools only
for accepted use cases with fixtures and approval criteria.

## 18. Deferred Technologies and Migration Triggers

| Technology | Adopt only when |
|---|---|
| PostgreSQL | Sustained writer contention, multiple application hosts, or availability requirements exceed SQLite |
| DuckDB | Repeated analytical workloads materially exceed SQLite or require large columnar exports |
| Managed object storage | Multi-host access, local durability/capacity risk, lifecycle policies, or signed access is required |
| Dedicated queue | Recovery, priority scheduling, or independent scaling requirements exceed the current worker |
| Drizzle | The current query/migration layer is absent or repeatedly causes defects and delays |
| Litestream | Required RPO is shorter than the verified snapshot interval |
| Frontend framework | Shared-state and DOM coordination defects become a measured delivery bottleneck |
| htmx | Repeated server-driven partial-update screens justify another interaction model |
| Rich grid/chart libraries | An accepted screen exceeds Bootstrap and native controls |
| Policy engine | Resource-specific or customer-specific policies must change without deployment |
| Pi or broader agent runtime | A time-boxed spike proves gains in governance, recovery, isolation, and productivity |
| Evaluation platform | Versioned fixtures become difficult to operate or report manually |
| OpenTelemetry/metrics platform | Pino and correlation IDs cannot localize material production failures |
| Runtime hard isolation | Immediate—not deferred—if AI tools execute code or process hostile active content |

Avoid in v1: microservices, Kubernetes, Kafka, Temporal, gratuitous Redis/BullMQ,
single-host MinIO, GraphQL, Angular/PrimeNG, React/Vue, multiple scraping stacks,
automated model routing, unrestricted agents, and separate Box databases.

## 19. Principal Risks

| Risk | Initial mitigation |
|---|---|
| Existing worker guarantees are weaker than assumed | Phase 0 lease/retry/idempotency tests; repair before depending on it |
| SQLite resides on unsuitable storage | Require local persistent storage and restore testing |
| RPO/RTO remain undefined | Make them Phase 0 decisions and size backup cadence accordingly |
| Collection or retention violates source terms | Per-source licensing record and legal review |
| Library preference becomes dependency sprawl | One library per capability; review maintenance, license, and bundle impact |
| AI appears more authoritative than its evidence | Explicit uncertainty states, citations, AJV validation, and human gates |
| Immutability or replay claims are overstated | Use precise digest and deterministic/AI replay wording from this document |
| Parallel AI changes violate module boundaries | Typed interfaces, code review, and boundary tests when first violation occurs |
| The owner becomes integration and approval bottleneck | Limit scope, prioritize the walking skeleton, and monitor approval delay |

## 20. Definition of Baseline Complete

The baseline is operational when:

- Phase 0 decisions are recorded.
- The walking skeleton passes end to end with one accepted calcium fixture.
- Invalid evidence, invalid AI output, unauthorized approval, duplicate jobs,
  and rejected/held transitions fail safely.
- A deployment and migration complete successfully.
- A backup restores the database and artifact set together.
- The restored system can replay the accepted deterministic path from frozen
  inputs and display the retained original AI output and audit trail.
