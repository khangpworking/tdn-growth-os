---
name: research-evidence-audit
description: Produce a bounded immutable audit of claims against one verified research_evidence_index_v1 Result.
---

# Research Evidence Audit

Input: one verified `research_evidence_index_v1` Result ID.

Output: one immutable research evidence audit reference. The audit evaluates support only within the supplied Research Pack and cites exact application-created segment pointers.

Authority: Box 2 may read the verified Result and invoke only the injected `AiGateway` with `tools: []`. It has no shell, arbitrary filesystem, direct networking, approval, publication, business mutation, or autonomous-action authority. This file is declarative; the static code registry is authoritative.
