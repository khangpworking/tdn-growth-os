# Research A2 handoff

Implementation complete locally; Linux CI and review pending. Based on A1 `781e819b54b97434794600fcf7d03764484efbf9` / PR #52, not yet merged. No Windows tests, typechecks or builds run. Generated TypeScript files were produced by the existing schema generator only (not verification).

Changes: two canonical manifest/sidecar schemas and generated types; bounded Python standard-library OOXML reader; TypeScript exact-profile normalization; private offline CLI; synthetic source-boundary tests; task/README/STATUS/INTENT documentation.

Test ownership (test-audit): one source integration file covers actual shared strings/numeric lexical values, period-vs-lifetime mapping, explicit scope/identity, duplicate rejection, fail-closed row locators, label freshness and actual CLI private publication/exact reuse. A1 retains ownership of arithmetic/ranking; no duplicated scope formula suite, browser/load tests or new production test seams.

Known boundaries: one Sheet1/20-column source profile, General-format metric cells, one workbook per run, no missing-date inference. First error yields JSON diagnostic and no result. Manifest and label provenance/adjudication are declarations, not independent authentication. Receipts retain raw OOXML type/index/style and resolved lexical values, not Excel rendered display. No private source copies are tracked.

Real source acceptance is blocked pending explicit period/acquisition manifest and policy/sidecar; no Fedora file transfer performed. Synthetic test success must not be described as a real report or measured market finding. No provider/AI call, database migration, runtime or UI change, merge or deployment.
