# Research A2 handoff

Draft PR: https://github.com/khangpworking/tdn-growth-os/pull/54. Based on A1 `781e819b54b97434794600fcf7d03764484efbf9` / PR #52, not yet merged. PR targets main for existing Linux CI; review the A2-only delta from the A1 head and merge A1 first. No Windows tests, typechecks or builds run. Generated TypeScript files were produced by the existing schema generator only (not verification).

Implementation commit `7a3cd2aa0553f9fad5b980225cd9b23465e65922` passed Linux CI: https://github.com/khangpworking/tdn-growth-os/actions/runs/36336589081. Later documentation-only heads still require their own successful check. Exact final-head evidence belongs in the PR handoff comment. Business task independently reviewed this mapping with no material mismatch; technical independent review and owner merge remain outstanding.

Changes: two canonical manifest/sidecar schemas and generated types; bounded Python standard-library OOXML reader; TypeScript exact-profile normalization; private offline CLI; synthetic source-boundary tests; task/README/STATUS/INTENT documentation.

Test ownership (test-audit): one source integration file covers actual shared strings/numeric lexical values, period-vs-lifetime mapping, explicit scope/identity, duplicate rejection, fail-closed row locators, label freshness and actual CLI private publication/exact reuse. A1 retains ownership of arithmetic/ranking; no duplicated scope formula suite, browser/load tests or new production test seams.

Known boundaries: one Sheet1/20-column source profile, General-format metric cells, one workbook per run, no missing-date inference. First error yields JSON diagnostic and no result. Manifest and label provenance/adjudication are declarations, not independent authentication. Receipts retain raw OOXML type/index/style and resolved lexical values, not Excel rendered display. No private source copies are tracked.

Real source acceptance is blocked pending the selected source, explicit period/acquisition manifest and UNKNOWN policy. A source-bound sidecar is optional for an all-scope draft but required for WIDE/CORE; no Fedora file transfer performed. Synthetic test success must not be described as a real report or measured market finding. No provider/AI call, database migration, runtime or UI change, merge or deployment.

## Rich-string correction and current-main integration

Current main `ff20bbb1cc344fdf68eb7713327077826f899b81` was integrated normally; the STATUS-only conflict retained both research and Content Studio sections.

Review found that an ambiguous inline string with both a plain `<t>` and rich runs could silently discard the plain value. Shared strings could concatenate competing forms. The parser now admits either one plain text node or ordered, individually valid rich runs, never both; repeated inline containers and competing value representations are rejected. Valid plain/rich strings remain supported. No mapping, numeric policy or schema was changed.

The single owner-boundary regression uses synthetic workbook bytes through the real normalization path; no production test seam was added. On pre-fix head `9bffee60125f53ef84ce8e945d3ca973d3984a9c`, Linux CI [36340633431](https://github.com/khangpworking/tdn-growth-os/actions/runs/36340633431) failed only this regression: 446/447 backend tests passed, with the expected missing-rejection assertion for mixed inline content. Frontend 125/125 passed. Post-fix final-head evidence will be recorded in the PR comment; this document does not claim it has passed yet.
