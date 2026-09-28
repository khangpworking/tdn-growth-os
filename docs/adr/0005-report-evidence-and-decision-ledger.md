# ADR 0005: Four-layer report evidence and decision ledger

Status: **Accepted, 2026-09-28.** The owner approved the four-layer boundary
for report automation. Approval covers the architecture below, not the market
or insight conclusions of any report.

## Context

The same source bytes and calculation period must not produce an apparently
new business truth merely because an AI run uses different wording. A report
also needs to distinguish a draft that has never been reviewed from content an
owner accepted for use. Renderer changes must not rewrite either history.

Research A1 through A7 already provide exact source lineage, deterministic
calculations, section readiness, chart data, exact export manifests and a
semantic content identity with no AI interpretation. The next work must extend
that foundation without treating AI prose as source evidence or exposing hidden
model reasoning as an audit record.

## Decision

TDN report automation uses four separate, traceable layers.

1. **Source evidence** stores or references the exact original bytes, immutable
   source metadata, verified locators, scope and acquisition period. Unknown
   classification remains visible but is excluded from WIDE calculations.
2. **Deterministic calculation** stores normalized inputs, method versions,
   reproducible results, fact claims and chart data. Every displayed value must
   resolve to this layer or to exact source evidence.
3. **AI interpretation** is an immutable, unapproved artifact. It contains only
   concise user-visible conclusions, a short evidence logic summary,
   application-resolved claim citations, assumptions and limitations. It does
   not store chain-of-thought. AI may select existing claim IDs but may not
   create source facts, measurements, provenance or approval.
4. **Human decision** is append-only and separate from report meaning. A review
   names the exact semantic version and records an explicit decision. Framework
   approval never approves a report. A renderer or export never creates a
   review decision.

The system keeps three identities distinct:

- **semantic version:** meaning-bearing source, calculation and interpretation
  content;
- **render version:** exact HTML, PDF and export bytes;
- **review history:** immutable human decisions against one semantic version.

SQLite will eventually register these identities and their artifact manifests.
Until migrations 0026 through 0028 are integrated, no report migration number
is reserved or skipped. Contracts and pure verification may proceed without a
database schema change.

## Interpretation guardrails

- Interpretation is allowed only for a section whose deterministic claim set
  exists and is verified.
- Each statement cites one or more existing claim IDs from the same section.
- Citation detail is copied by application code from the verified packet, not
  accepted from model output.
- Unsupported numbers, recommendation or approval language, invented
  provenance and citations outside the allowlist fail closed.
- Hypotheses are labelled as hypotheses and carry explicit assumptions and
  limitations.
- Re-running a model may create a new interpretation artifact, but identical
  meaning is compared by a content digest that excludes provider telemetry and
  render bytes.
- Each retained run is a separate immutable overlay on an explicit base report
  version. The base version is never rewritten to embed later interpretation;
  its original `NONE` state remains historically true. Prompt bytes and safe
  generation metadata are retained for replay, while hidden chain-of-thought
  and raw provider responses are not.

## Retrieval and orchestration boundary

Future WeKnora or OpenViking indexing may help find source material, but an
index hit is not evidence until it resolves to exact registered bytes and a
verified locator. Future LangGraph or JEV orchestration may coordinate work,
but cannot bypass calculation, citation, review or version gates.

## Consequences

- Reproducible calculations remain authoritative when AI wording varies.
- A report can show why an interpretation was made without storing hidden
  reasoning.
- A human can reject one interpretation and later review another without
  changing source or calculation history.
- The report can be rendered again without inventing a new semantic version.
- Sections without approved methods or required evidence remain blocked or
  method-only; AI cannot fill those gaps.
