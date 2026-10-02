# 0010. Owner/team only, inside the loopback operator app

- **Status:** Accepted (owner "A", 2026-10-01)
- **Date:** 2026-10-01

## Context

tgos is a loopback operator app on Fedora that must never be exposed to the LAN or a domain. Its current authority (the OWNER token) represents a single operator, not authenticated team identities.

## Decision

- The feature is for the owner and team only, inside the existing loopback operator app. It is not customer-facing.
- v1 uses the single operator identity. Per-person team identities are out of scope.

## Consequences

- No public auth, rate limiting or multi-tenant work in v1.
- Audit records attribute actions to "the operator", not to named people.
- If team identities are needed later, that is a new ADR.
