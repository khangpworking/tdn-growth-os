# Research A16: exact report review target

## Objective

Compose one deterministic internal-review inventory from one explicitly named
A10 report version and one explicitly named A13 interpretation run. A later
human decision must be able to name exactly what was reviewed without selecting
“latest”, regenerating AI text or silently changing the rendered report.

## Required behavior

- Read the report only through its verified exact-version interpretation-source
  reader and the interpretation only through its verified exact-ID reader.
- Cross-check report ID/version/version ID/semantic ID, packet ID/hash, claims
  hash, interpretation content/artifact identity and prompt configuration.
- Bind the full selected-source membership, declared period/channel, explicit
  intended use and explicit unknown geography/source-rights markers.
- Bind exactly one verified `report.html` artifact, including digest, media type
  and byte size, because the approved framework requires the future decision to
  retain which file the OWNER viewed.
- Inventory exact report sections, interpretation sections/items and supporting
  claims. These are reviewable content, not a human acceptance decision.
- Produce canonical bytes and a content-derived target ID without an ambient
  timestamp. Exact inputs replay byte-for-byte; a different report render or
  interpretation run has a different identity.
- Preserve explicit non-transfer limitations and remain internal-review-only.

## Explicit exclusions

- No approve/reject/hold field, reviewer, decision timestamp or authority.
- No UI, API, migration, database write or artifact publication.
- No model/provider call, regeneration, source collection or methodology change.
- No external-publication right, source-use right, delegation or revocation rule.
- No inference of product, geography, source authority or latest version/run.

## Verification ownership

One focused unit file owns only the new composition boundary: deterministic
identity, sensitivity to the selected run/render and fail-closed exact-lineage
checks. A10 and A13 continue to own persistence, artifact replay and corruption
coverage; those tests are not duplicated here.
