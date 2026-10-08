# ONTO-1 — proposed offline ontology experiment

Base: `998549072ae62b9d619ffbf645ba59b22a920d4e` (assigned `origin/main`).
All shapes remain **proposed**. No application integration, approval, deployment,
MCP registration, dependency installation or configuration change is included.
Synthetic fixtures are not research respondents or commercial evidence.

Run from the repository root:

```sh
./ontology/run-checks.sh
```

Requires installed `open-ontologies`, `oo-shacl`, Python 3 and Bash. The runner
sets `OPEN_ONTOLOGIES_STORAGE_MODE=persistent`, resolves the installed checker
through `OO_SHACL`, and passes `--no-connect --data-dir <scratch>` on every CLI
invocation. It creates one private temporary state directory per dataset and a
separate smoke directory; deletes only its own scratch state on exit. It never
uses a daemon or default data directory and makes no network request. State is
persistent across each dataset's separate load/check commands, not across runs.

Installed release: Open Ontologies **2.0.1**, identified by the local release
installation and executable SHA-256 (see results). `--version` is unsupported
and was attempted, not reported as successful. `--help` lists `validate`, `load`,
`shacl`, `reason`, `query` and the other CLI operations. `validate <file.ttl>`
checks RDF syntax only. Business metadata checks use:

```text
open-ontologies --no-connect --data-dir <scratch> validate ontology/shapes/<RULE>.ttl
open-ontologies --no-connect --data-dir <scratch> load ontology/tests/<valid-or-invalid>/<dataset>.ttl
open-ontologies --no-connect --data-dir <scratch> shacl --verified ontology/shapes/<RULE>.ttl
```

The default SHACL evaluator skipped `sh:node` and returned `conforms:null` in
preflight. `shacl --verified` initially could not locate its checker; selecting
the already installed `oo-shacl` with `OO_SHACL` fixed this without configuration
changes. A backslash-containing pattern was refused by the verified compiler;
final shapes use Core datatype/minLength constraints instead. Text fields check
nonempty strings, not meaningful attribution or whitespace normalization.
The checker reports that `sh:message` is ignored; Vietnamese messages remain in
the shapes, while the runner matches actual source shape/path and constraint.
Exit status alone is insufficient: CLI errors can exit zero. Errors,
undetermined verdicts, skipped evaluation, unexpected acceptance/rejection and
unrelated negative-control violations must fail the runner.

`tests/manifest.json` is the explicit expected dataset matrix. Each invalid case
changes a single condition from its valid control. Negative results must have
exactly one reported violation at the responsible property or named condition.
E4 identity alternatives use the `OrConstraintComponent`. Results JSON retains
CLI output, exact input and shape hashes, checker identity and every verdict.
The companion Markdown provides commands and an expected/actual table.

The separate smoke test loads two triples, reasons with RDFS and a certificate,
and asks whether the synthetic Child instance is also a Parent. If installed,
`oo-cert` checks the generated certificate. This proves only the recorded
inference from asserted triples; it does not validate these business rules.

## Projection boundaries

- E4: author IDs are distinct RDF string values scoped to one declared platform.
  The no-ID alternative forbids IDs, requires five distinct content literals and
  the exact unverified flag. Cards and optional attributes require quote/locator.
  These are explicit synthetic projections, not an importer or proof that the
  authors, quotations, platform or record contents are genuine/linked correctly.
- L10: creator/brand/tag-only/emoji-only flags are supplied classifications. Each
  exclusion forbids both customer-voice typing (the `customerVoice` boolean) and
  counting. Both video source types are permitted. Eligible comments need not
  be counted; completeness and semantic classification are outside this check.
- E12/E13: only attribution, allowed status and spreadsheet file/sheet/row trace
  are checked. PDF page/table traces and the broader Ultimate obligations are
  not implemented. The E13 shape intentionally checks the shared subset only.
- UNKNOWN: `UnknownRecord` is an already classified fresh UNKNOWN projection.
  It must remain in ALL and outside WIDE under the written current-workflow
  owner decision. It does not convert missing/stale/pending labels to UNKNOWN
  or change the calculator's generic contract.

Read `review/` before reuse. Unexpressed source authenticity, semantic judgments
and obligations outside the checklist subset are explicitly ESCALATED there.
No certificate or model review grants owner approval.

## Test authoring gate

These fixtures protect the task's externally observable acceptance contract at
the CLI boundary. Credible failures are omitted thresholds, weakened required
fields, collapsed distinctness and inverted exclusion logic. There was no prior
ontology test owner; the manifest owns the matrix here. No application export,
wrapper or production seam is introduced. Paired L10 exclusion controls ensure
rejections are caused by the intended field, not an unrelated constraint.
