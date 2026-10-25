# Q3 current Market fixture updates

Compared the same synthetic inputs against `06a6658d` before re-pinning.
Market 1.4 changes only for R-M16/R-M37 tables 1.1 and 6.3, total-scope notes,
R-M34 sales-average labels/calculation notes and R-M35 comparison/period notes.
Source quotes, data, charts, references and calculation bytes stay unchanged.

- `search-ads-compatibility.json`: both reader HTML hashes change; frozen v1
  search-ad documents and flag-off HTML/step hashes stay unchanged.
- `package-f-plus-versioned-market.html`: same approved Market 1.4 changes;
  the legacy Market and Insight fixtures stay unchanged.
- `package-g-evidence-versioned-market.html`: identical to the reviewed F+
  versioned fixture before and after; the same approved changes apply.
- `package-g-references/market-template-v4.html.gz` and `manifest.json`: same
  approved Market 1.4 changes; legacy Market and Insight bytes/digests stay fixed.
- `macro-charts-report.test.ts`: only the Market 1.4 reader hash changes;
  the automated Market hash and legacy pins stay fixed.
- `shopee-public-f-plus`: see its README for the exact five changed payloads
  (three content-addressed members move) and 283 unchanged members.

The R-L20 fixes preserve neutral retained coverage counters and PDF ordinals.
Current geographic prose replaces an unscoped ranking with the observed count
within ten provinces; legacy geographic copy stays unchanged.
