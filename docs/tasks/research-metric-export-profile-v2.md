# Metric export profile v2

## Purpose

The genuine Metric export acquired during the approved real-world report audit
has a different header order and product URL shape from the legacy Sheet1
profile. Add an explicitly selected profile for that format. Keep the workbook
unchanged and retain the existing legacy behavior.

## Implementation

- Extend the closed manifest schema with profile
  `metric-shopee-product-list-sheet1-v2`, version `2.0.0`, and its exact header
  digest. Reject cross-paired profile, version and header declarations.
- Check the complete 20-column header before reading rows. In v2, Link shop is
  I and Mã sản phẩm is J. Preserve all original typed cells and cell locators.
- Admit the observed `https://shopee.vn/<slug>-i.<shop>.<item>` URL shape only
  in v2, alongside the existing canonical URL. Cross-check the extracted IDs
  with the exact shop URL and composite ID. Reject conflicting IDs, unexpected
  authorities and query/fragment-bearing export URLs.
- Continue mapping period units from D and revenue from E. Lifetime values in
  R and T remain source evidence, not period operands.
- Reuse the existing calculator, precision handling and missing-versus-zero
  rules. No classifier, repair, auto-detection, source acquisition automation
  or current-run attachment is introduced by this change.

## Verification

The normalizer is the primary test owner. Two new synthetic boundary tests
protect the reordered mapping and declaration/identity rejection cases.
Existing legacy, CLI, preparation, readiness and calculator tests remain.
The new mapping regression must reject on the legacy baseline for the intended
unsupported-manifest reason and pass on the updated reader. All execution is
on Linux; no Windows test, typecheck or build.

An isolated real-source CLI acceptance must parse all retained rows without
altering raw bytes, retain declared source dates rather than the requested
report dates, leave precision unverified, and keep classified scopes blocked
without frozen labels. This is an intake proof, not a final report or an
independently verified provider measurement.

## Next boundary

Attach the exact package and capture-filter metadata to a confirmed research
run. Retain the full calculator output for both M03 and M04 and use frozen
semantic replay. Do not rerun today's normalizer or calculator when reading a
saved report. See the handoff for remaining source and business limits.
