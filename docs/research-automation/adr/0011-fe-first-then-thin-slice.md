# 0011. FE-first prototype, then one thin vertical slice

- **Status:** Accepted (owner build-flow rule; slice scope AGREED with Astra, round 3)
- **Date:** 2026-10-01

## Context

My first build order was interview, then collectors, then packaging. That order would have found the central incompatibility with the existing methods (see [0007](0007-source-neutral-scope-method.md)) too late. The owner also has a fixed build flow:

> Định nghĩa app → build prototype FE-first (→ deploy sớm nếu được) → bạn dùng thử → lấy feedback → thiết kế data/backend → hoàn thiện một vertical slice → test, deploy và tiếp tục lặp.

## Decision

1. **FE-first prototype**, deployed early. This is a single-file vanilla JS prototype with demo data, published as a private Artifact. It is iterated on owner feedback; v1–v5 are done ([LOG](../../LOG.md)).
2. After the owner accepts the prototype, design the data and backend.
3. **Slice 1 is one thin end-to-end run:**
   - a simple fixed-intent interview;
   - the explicit "Bắt đầu nghiên cứu";
   - a quick search on **one** adapter (a synthetic fixture until live use is authorized);
   - the definition card with explicit peer confirmation, and desired scope shown apart from observed coverage;
   - the retained raw data plus its raw→normalized mapping;
   - an immutable partial draft report.

   The slice commits to:
   - source-neutral scope, provenance, method account and evidence trace, rendered through **M02, M13, I03 and I17**, with their minimal changes made explicit;
   - **I01** ([0014](0014-i01-drafted-by-system.md));
   - **one** adapter-supported evidence method, **M07 by default**, chosen only after the adapter's response is shown to fit it.

   The slice does **not** commit to I13, I02, M09 or any other section. Those render as blocked or not-run, with an honest reason.

## Consequences

- Backend work waits for owner feedback on the prototype and for the API list.
- The first adapter is chosen by its fields ([0002](0002-v1-sources-api-first.md)).
- Adaptive cards and the other sections grow in later slices.
- Synthetic fixtures prove the mechanics only; acceptance needs an authorized live run on Fedora.
