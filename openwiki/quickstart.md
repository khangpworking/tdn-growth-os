---
type: task routing guide
title: TDN Growth OS Wiki Quickstart
description: A compact routing map for choosing the smallest relevant architecture, workflow, operations, source, and verification context before changing TDN Growth OS. It keeps Ultimate authority, repository implementation, and approval or acceptance evidence distinct.
tags: [quickstart, navigation, change-safety, research, reporting, governance]
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-362e06c30ccfdafd87339cb0
    resource: repo://ARCHITECTURE.md
  - id: openwiki-source-7326ac0e3ee5e4adda959281
    resource: repo://docs/research/ultimate-method/input-data-sources-30-sections.md
  - id: openwiki-source-fb45529fa7308c451b36f591
    resource: repo://docs/STATUS.md
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-17f8e2904f95696b6646d414
    resource: repo://src/api/operator-app.ts
  - id: openwiki-source-6e0ba11f9b200acfeffa6ad1
    resource: repo://src/modules/analysis/report-version-service.ts
  - id: openwiki-source-9310fb39f752b619ba3d0990
    resource: repo://src/modules/analysis/research-automation/reader-report-revisions.ts
  - id: openwiki-source-dcf9957ecc7c5099a757950b
    resource: repo://src/modules/analysis/research-automation/service.ts
  - id: openwiki-source-a6bf96da8c4db9e02ab0eb98
    resource: repo://src/modules/analysis/research-automation/source-status.ts
  - id: openwiki-source-4cfcd3bed0faed29f10e5fb5
    resource: repo://src/platform/db/migrations.ts
generated: { by: "openwiki/0.7.1", at: "2026-10-09T02:26:52.838Z" }
verified:
  - by: openwiki/0.7.1
    at: 2026-10-09T02:26:52.838Z
---

# TDN Growth OS Wiki Quickstart

**Checked main SHA:** `2b44e4bcf75ac3bfd2a5d3a0de679a0fcb1a48ad`

Use this page to select context, not to replace source inspection. A delivery statement in this wiki uses only **merged on main**, **open PR**, or **planned**. **Merged on main** establishes repository implementation at the checked SHA; it does not establish deployment, a live-source run, business acceptance, or approval.

## Startup priority

1. **Ultimate is business authority.** For a report-method or business-policy question, consult the [Ultimate Method](../docs/research/ultimate-method/ultimate-method-30-sections.md) and its [CHANGELOG](../docs/research/ultimate-method/CHANGELOG.md) before treating code, a work-item identifier, or a plan as authoritative.
2. **CodeGraph handles symbols and callers.** After choosing a route, use `codegraph explore` on the owning service or contract; source code and focused tests decide actual behavior.
3. **Wiki retrieval is optional.** Use the narrowest linked page when unfamiliar boundaries or unresolved context materially affect the task. Do not preload the wiki at task start.

## First five minutes

1. Read the task, [`README.md`](../README.md), and the relevant part of [`docs/STATUS.md`](../docs/STATUS.md). Classify the work as **Lean**, **Standard**, or **Controlled**. Production, valuable migrations, credentials/authentication, destructive work, and major architecture changes are Controlled work.
2. Choose **one primary route** below. Read [`ARCHITECTURE.md`](../ARCHITECTURE.md) as well when the change crosses a module, persistence, AI, authorization, or runtime boundary.
3. Trace the owning service, its callers, contract or migration, and one focused test with `codegraph explore`.
4. Run the smallest validation that proves the altered boundary. Fixtures are synthetic; do not make provider/model calls or claim a command passed unless it was actually run.

The repository implementation is a TypeScript modular monolith with one authoritative SQLite database. Module writes go through the owner’s application service; cross-module reads use declared interfaces. AI may propose, but authorized humans approve governed decisions ([`ARCHITECTURE.md`](../ARCHITECTURE.md#L96-L123), [`AGENTS.md`](../AGENTS.md#L27-L32)).

## Task routing map

| Task concerns | Read first | Then, only if needed | Keep distinct |
|---|---|---|---|
| Module ownership, cross-module integration, composition roots, or a new table | [Five-Module Monolith and Write Boundaries](architecture/modular-monolith.md) | [Runtime, SQLite, Artifacts, and Safe Operations](operations/runtime-and-persistence.md) | Owner-service writes versus declared cross-module reads |
| Source package, Metric preparation, source-backed report version, interpretation, or review target | [Research-to-Report Lifecycle](workflows/research-report-lifecycle.md) | [Verification, Contracts, and Deterministic Replay](testing/verification-and-replay.md) | Evidence, calculation, interpretation, and human decision |
| Market draft, Market Reader HTML, revision, citation, or reader decision | [Market Reader Report and Governed Automation Draft](concepts/market-report-lanes.md) | [Research-to-Report Lifecycle](workflows/research-report-lifecycle.md) | Automation draft pair versus separately versioned reader revision |
| M01–M13 or I01–I17 implementation, renderer, method output, or blocked input | [M01–M13 and I01–I17 Delivery Matrix](concepts/thirty-report-sections.md) | [Ultimate Alignment Packages and Sync Plan](workflows/ultimate-alignment-packages.md) | Ultimate rule authority versus bounded delivery standing |
| Approved source, collector, source board, provider seam, or report source disclosure | [30-Section Input Data Sources and Collector Integration](integrations/data-source-registry.md) | [Research-to-Report Lifecycle](workflows/research-report-lifecycle.md) | Registry approval versus a wired collector, retained package, or report use |
| Owner decision, Ultimate change, ADR, unresolved intent, or a status conflict | [Owner Decisions, ADRs, and Change Authority](operations/decisions-and-authority.md) | [`INTENT.md`](../INTENT.md) | Business authority, technical decision, intent, delivery evidence, and output approval |
| SQLite, migration, artifact integrity, launch, shutdown, configuration, or recovery | [Runtime, SQLite, Artifacts, and Safe Operations](operations/runtime-and-persistence.md) | [Five-Module Monolith and Write Boundaries](architecture/modular-monolith.md) | Repository implementation versus deployment and operational acceptance |
| Schema, retained replay, artifact digest, API contract, frontend interaction, or fake connector boundary | [Verification, Contracts, and Deterministic Replay](testing/verification-and-replay.md) | The affected workflow page | Unit behavior versus retained-state, API, and UI boundaries |
| Workspace, proposal, owner POST, report-review handoff, external action, or Content Studio | [Operator Workspaces and Approval Boundaries](workflows/operator-workspaces-and-approval.md) | [Owner Decisions, ADRs, and Change Authority](operations/decisions-and-authority.md) | Read projection/UI, authenticated write, external action, and approval |
| Current Ultimate-alignment package, source-board work, shared schema/renderer work, or U/P/B/SYNC item | [Ultimate Alignment Packages and Sync Plan](workflows/ultimate-alignment-packages.md) | [30-Section Input Data Sources and Collector Integration](integrations/data-source-registry.md) | Bounded **merged on main** slice versus **planned** remainder and separately planned acceptance |
| Vietnamese research/governance wording or a status term | [Vietnamese Research and Governance Glossary](concepts/vietnamese-business-glossary.md) | The owning workflow page | Translation/orientation versus a business rule or approval condition |

## Boundary reminders

### Reports and research

Choose the report lane before changing a renderer or state transition. The source-backed report ledger, automation draft pair, and Market Reader revision are different persistence and authority models ([`src/modules/analysis/report-version-service.ts`](../src/modules/analysis/report-version-service.ts#L180-L305), [`src/modules/analysis/research-automation/service.ts`](../src/modules/analysis/research-automation/service.ts#L341-L400), [`src/modules/analysis/research-automation/reader-report-revisions.ts`](../src/modules/analysis/research-automation/reader-report-revisions.ts#L94-L106)). A rendered draft, retained interpretation, review target, or UI display is not an owner approval. Use the lifecycle page for source-backed versions; use the Market-lanes page for automation drafts and reader revisions.

### Sources and delivery standing

A source appearing in the Ultimate registry or source board is not proof that its collector is configured, wired into a run, or accepted as report evidence. Status records show bounded alignment packages as **merged on main** while collector activation, policy, and acceptance gaps remain **planned**. Do not convert a work-item ID into a business rule or a historical merge into deployment evidence.

### Runtime and persistence

Read the runtime page before modifying startup or owner APIs. The operator root opens read applications and conditionally opens owner-write applications; a write-enabled operator acquires executor authority before composing owner applications ([`src/api/operator-app.ts`](../src/api/operator-app.ts#L147-L208)). Migration files must be contiguous, and the migration runner rejects ledger/checksum or `user_version` inconsistencies before applying pending migrations transactionally ([`src/platform/db/migrations.ts`](../src/platform/db/migrations.ts#L24-L107)).

## Focused validation starting points

The repository defines `npm run contracts:generate`, `npm run typecheck`, `npm run frontend:typecheck`, `npm run frontend:build`, `npm run frontend:test`, `npm test`, and `npm run check` ([`package.json`](../package.json#L34-L49)). Select rather than reflexively running every command:

1. **Schema or canonical response:** regenerate contracts, review the generated diff, then run the owning contract/API check.
2. **Calculation, renderer, retained artifact, or replay:** run the owning focused test and cover exact retry plus the relevant missing, corrupt, or wrong-binding failure.
3. **Database or migration:** run focused upgrade/integration coverage; use a forward migration rather than changing an applied migration.
4. **HTTP, authorization, or owner write:** test the route and service boundary, including rejected or disabled-write behavior.
5. **Frontend:** run `npm run frontend:typecheck` and the relevant frontend test; add `npm run frontend:build` when generated validators or build wiring changes.
6. **Shared or release-level boundary:** expand to `npm run check` only when its breadth is justified.

This documentation update did not execute these commands.

## Stop and hand off

Stop for an owner decision rather than guessing a business threshold, source choice, approval role, external action, or unresolved Ultimate policy. Broaden review for Controlled work. At handoff, record changed paths, the checked SHA, one delivery standing, commands actually run and outcomes, synthetic/real-data scope, blockers, and the next step. Preserve relevant failure output; do not weaken a valid assertion merely to obtain a green check.

## Related context

- [Five-Module Monolith and Write Boundaries](architecture/modular-monolith.md)
- [Market Reader Report and Governed Automation Draft](concepts/market-report-lanes.md)
- [30-Section Input Data Sources and Collector Integration](integrations/data-source-registry.md)
- [Owner Decisions, ADRs, and Change Authority](operations/decisions-and-authority.md)
- [Runtime, SQLite, Artifacts, and Safe Operations](operations/runtime-and-persistence.md)
- [Verification, Contracts, and Deterministic Replay](testing/verification-and-replay.md)
- [Research-to-Report Lifecycle](workflows/research-report-lifecycle.md)
- [Operator Workspaces and Approval Boundaries](workflows/operator-workspaces-and-approval.md)
- [Ultimate Alignment Packages and Sync Plan](workflows/ultimate-alignment-packages.md)
