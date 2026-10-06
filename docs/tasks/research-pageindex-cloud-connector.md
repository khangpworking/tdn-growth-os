# Optional PageIndex Cloud retrieval connector

Status: implemented backend/CLI first slice; not deployed or connected to the live research UI.

## Authority and scope

Owner request on 2026-10-04: proceed with the remaining prompt benchmark and implement PageIndex Cloud after the public Task 2 pilot. This task owns the retrieval connector only, not benchmark prompts, reference labels, business methods, report history or runtime activation. The original eight-call prompt benchmark authorization is separate from Cloud billing.

The public synthetic Cloud pilot used four chat requests. It returned valid page/block references on that fixture. Its document itself contains a helpful explicit missing-data statement; this is not an unbiased production reliability benchmark. No new live Cloud requests are required for this implementation's tests.

## Implemented

- Closed draft-07 query contract and generated TypeScript, registered with the existing generator.
- Fixed vendor origin, `api_key` header, bounded response/body parsing, 90-second request deadline and no redirect/retry.
- Verified retained source package, manifest digest, exact file bytes, media type and source digest before querying.
- Local PDF extraction, not self-verification through Cloud OCR.
- Exact Cloud metadata name/ID/page count and completed-index checks before the chat request.
- Exact inline citation, response metadata and fetched block identity/geometry agreement.
- Quoted numbers and units are not rewritten. NFC/whitespace normalization permits layout variations; Markdown table separators are ignored only for table text matching. An empty normalized quote never verifies.
- Unmatched quotes remain explicitly unverified. Zero hits do not prove absence.
- Private raw answer/result/receipt outside every Git checkout; existing output refuses redispatch. An ambiguous attempt stays visible for manual reconciliation, not automatic paid retry.
- No key, source text, stack, database path or provider response body is printed on error.

## Operator invocation (Linux only)

Provide `TDN_PAGEINDEX_CLOUD_ENABLED=true`, `PAGEINDEX_API_KEY` through the existing private secret loader, and optionally `TDN_PAGEINDEX_PYTHON` pointing to a Python interpreter with `pypdf`. The optional parser dependency is pinned with its wheel hash in `scripts/requirements-pageindex.txt`; install it in a dedicated virtual environment, not globally. Full Linux CI installs it for the actual CLI test. Never paste keys into a command line or chat. Normal report reads do not require this key or Python dependency.

```sh
npm run research:pageindex:query -- /private/db.sqlite /private/artifacts /private/query.json /private/new-query-output
```

`query.json` follows `contracts/analysis/pageindex-cloud-query.schema.json`. It pins `sourcePackageId`, `manifestSha256`, `logicalPath`, `sourceSha256`, `cloudDocId`, `cloudFileName`, `pageCount`, and one explicit question. The Cloud document must already exist and have an operator-confirmed association with the exact retained file. There is no automatic upload in v1.

Output parent must already exist, resolve without symlink aliases, and be outside Git. The new directory is mode 0700; request, attempt, result and receipt files are mode 0600, flushed before success. The DB is file-must-exist, read-only and query-only. No migration runs. The CLI prints only counts and `UNREVIEWED` state.

Keep an incomplete attempt directory. Check the vendor dashboard and available result before authorizing a distinct operation; do not assume a transport error means no charge. Completed outputs can be read locally without redispatching. A missing receipt means incomplete, not automatically retryable.

## Test ownership

Connector tests own protocol/source-citation isolation: dispatch on mismatched source, wrong document, invented block identity, changed unit, empty quote, escaped key echo and unwanted retries are credible regressions. Existing A46 tests do not execute a Cloud transport. One CLI integration test separately owns actual local PDF extraction, private persistence, immutable attempt reuse prevention and byte-preserving SQLite reads. It runs a fake external transport with the unchanged production CLI and verified Foundation services, not a fake database/parser. No model-obedience claim is made from those fixtures.

Validation uses a separate Linux scratch copy and pinned Node 24.15.0. No Windows tests/build/typecheck, live DB access, new paid requests, migration or deployment is included.

## Remaining release work

- Independent review and Linux release gate over the integrated branch.
- Explicit upload consent, document lifecycle and durable source-to-Cloud binding if automatic indexing is needed.
- UI action for numbered citations, mapping candidates only to exact retained claim/locator lineage.
- Source-period and semantic support review, separate from text matching.
- Fedora deployment and browser acceptance; keep Cloud optional, not a default mandatory report dependency.
