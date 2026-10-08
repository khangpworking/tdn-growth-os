# ONTO-2 — proposed offline ontology checks

Base: `7a4dd2a682423d967fe0372577d96a81d9780d34` (fetched `origin/main`).
Unmodified baseline: run from an exact archive of current `origin/main` and retained under `results/` with its source SHA.
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
ONTO-2 uses Core sh:pattern with literal character ranges excluding Unicode
White_Space and ASCII controls, without backslashes. It rejects space-only and
Unicode whitespace-only text. Escaped tab/newline/CR data is refused by the
checker itself: that negative case is ESCALATED with expected REJECT unchanged.
Invisible format characters U+200B/U+FEFF are not White_Space and remain allowed;
no normalization or semantic-content verification is claimed. E12/E13 now enforce
their respective exact attribution strings.
The checker reports that `sh:message` is ignored; Vietnamese messages remain in
the shapes, while the runner matches actual source shape/path and constraint.
Exit status alone is insufficient: CLI errors can exit zero. Errors,
undetermined verdicts, skipped evaluation, unexpected acceptance/rejection and
unrelated negative-control violations must fail the runner.

`tests/manifest.json` is the explicit expected dataset matrix. Each invalid case
changes a single condition from its valid control. Negative results must have
exactly one reported violation at the responsible property or named condition.
E4 identity alternatives use `OrConstraintComponent` on named `E4AuthorIDs` or
`E4UnverifiedContent` source shapes, selected by mandatory `identityMode`.
Each explicitly escalated unsupported case stays visible as UNDETERMINED; it
is never counted as a pass. Other mismatches still fail the runner. Results JSON retains
CLI output, exact input and shape hashes, checker identity and every verdict.
The companion Markdown provides commands and an expected/actual table.

The separate smoke test loads two triples, reasons with RDFS and a certificate,
and asks whether the synthetic Child instance is also a Parent. If installed,
`oo-cert` checks the generated certificate. This proves only the recorded
inference from asserted triples; it does not validate these business rules.

## Projection boundaries

- E4: author IDs are distinct RDF string values scoped to one declared platform.
  Set `identityMode "author-ids"` or `identityMode "unverified-content"` exactly
  once. The no-ID alternative forbids IDs, requires five distinct content literals
  and exactly one exact unverified flag. Authors link directly to the focus persona
  through `ex:author`, cards through `ex:card`; foreign-persona links cannot count.
  Cards and optional attributes require nonblank quote/locator.
  These are explicit synthetic projections, not an importer or proof that the
  authors, quotations, platform or record contents are genuine/linked correctly.
- L10: creator/brand/tag-only/emoji-only flags are supplied classifications. Each
  exclusion forbids both customer-voice typing (the `customerVoice` boolean) and
  counting. Both video source types are permitted. Eligible comments need not
  be counted; completeness and semantic classification are outside this check.
- E12: exactly `Cục Thống kê (nso.gov.vn)`, allowed status and spreadsheet
  file/sheet/row trace. E13: exactly `Ngân hàng Thế giới (World Bank Open Data)`,
  same status/trace, plus exactly one indicatorName, indicatorCode, year and
  datasetUpdateDate. Year/date are strings with four-digit / YYYY-MM-DD lexical
  patterns, not calendar validation. PDF traces and wider semantic obligations
  remain ESCALATED in the separate rule reviews.
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

## ONTO-2 evidence and maintenance

Independent cases: `tests/independent/manifest.json`, authored by GPT-6-astra
from rule text and vocabulary without shapes; root manifest adds only diagnostic
selectors, preserving independent expected booleans and datasets. Cold review:
separate fresh GPT-6-astra agent, masked inputs only. Both differ from Codex.
See `review/ONTO-2.md` and per-rule reviews. Model review is not domain approval.

`OPENWIKI_TELEMETRY_DISABLED=1 python3 ontology/guide-checks.py` exercises adding
and changing a throwaway rule, removes its temporary files, and records guide
receipts plus four pre-fix regressions. The main runner records its actual HEAD,
exact source/fixture/shape/tool hashes and all verdicts; historical results remain
unchanged. The date prefix records this task's 2026-10-08 run. A subsequent evidence
commit may follow the tested implementation commit; hashes bind the tested inputs.

Fixture authoring gate: new rows guard exact attribution, required indicator
metadata, nonblank fields, persona-scoped membership and identifiable alternatives
at the existing CLI boundary. Credible regressions are accepting wrong sources,
omitting metadata or counting another persona's links. Earlier cases did not
cover those failures. No production seam or application tests were added. The
four pre-fix controls demonstrate acceptance by original shapes; current checks
reject them. The only deleted fixture is the explicitly requested RDF duplicate.
