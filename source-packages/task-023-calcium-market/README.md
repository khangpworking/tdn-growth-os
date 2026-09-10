# Task 023 calcium-market source package

This package was added to the private repository with the owner's explicit
authorization to simplify transfer from Windows to the Fedora development
machine. It contains operator-supplied evidence, not runtime data and not a
verified live provider collection.

## Evidence relationships

- `metric html version.html` and `metrics.pdf` are one Metric evidence family.
  The PDF was printed from the saved HTML and is not an independent source.
- `Metrics V2.xlsx` and `metrics_validated.json` are structured/derived
  representations of that Metric evidence family. They are not independent
  corroboration.
- The two Kalodata workbooks are operator-supplied exports. Their commercial
  collection provenance and compatible measurement period have not been
  independently verified.
- `metrics_validated.json` came from the existing path
  `intermediate/metrics_validated.json`. The originally supplied path
  `intermediate/metrics/_validated.json` did not exist.

## Required handling boundaries

- Verify every file against `SHA256SUMS.txt` before use.
- Do not invent product, shop, provider, or listing IDs.
- Keep missing values distinct from observed zero.
- Do not compare Kalodata values directly with the 24-month Metric totals
  unless compatible periods are independently established.
- Do not treat existing `fixture:true` merged Kalodata JSON as provider
  evidence.
- Do not use a finished report as ingestion evidence.
- Do not commit provider credentials or new runtime artifacts.
