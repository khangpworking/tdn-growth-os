# Commit receipt — Package B gen5 U-27 Reader appendix (OpenCode native author)

Scope (coordinator-accepted): U-27 M13/I17 source appendix sliced to the retained
Reader journey for Shopee S05 + TikTok S07. Reuses B-02 SOURCE_REGISTRY read-only;
P9 retained bundles read-only. No third capability.

Candidate: `96f1ee123260cbd76edde13dadc46adc6b58e812` on
`khangpworking/ultimate-luna-b-gen5-opencode`, base verified
`059c22fa7643bc484d0f18ef470aec00c7743300`. No merge (coordinator gates own
independent Luna/xhigh review, full/generated/readiness/current-main gates,
matching-head merge, postmerge).

Changed paths (4):
- `src/modules/analysis/reader-report/shopee-build-v1.ts` (+SOURCE_REGISTRY import, I17 row)
- `src/modules/analysis/reader-report/tiktok-build-v1.ts` (+SOURCE_REGISTRY import, I17 row)
- `tests/integration/research-shopee-coding.test.ts` (I17 assertions only)
- `tests/integration/research-tiktok-reader.test.ts` (I17 assertions only)

Tool-start evidence (pinned Node 24.15.0 / npm 11.12.1, `node --import tsx --test`):
- RED pre-fix: TikTok journey failed on `Nguồn S07 · …` (`/tmp/gen5-red-tiktok.log`);
  Shopee settlement test failed on `Nguồn S05 · …` (`/tmp/gen5-red-shopee.log`).
- GREEN post-fix: TikTok 5/5 (`/tmp/gen5-green-tiktok.log`), Shopee 8/8
  (`/tmp/gen5-green-shopee.log`), neighbors 22/22 — source-board unit,
  source-status integration, TikTok coding, insight-reader
  (`/tmp/gen5-neighbors.log`). `node scripts/typecheck.mjs` exit 0
  (`/tmp/gen5-typecheck.log`). `git diff --check` clean.
- No `contracts/` change (G-04 N/A); no migration; no weakened assertions
  (existing assertions kept, new ones appended).

Exclusions kept: shared-contract/schema edits, service.ts, source-board behavior,
PDF lane, PR204/PR205, U-26/auth/owner-policy, model/provider/live calls,
E12/E13 macro rows, L10 collection. Stored Reader revisions replay byte-identical
(existing reopen/retry assertions green); only new builds carry the new rows.
Same `shopee-reader-kit-v1` / `tiktok-reader-kit-v1` versions (renderer-version
bump would cross OMP-owned service.ts + shared generated contract; precedent
PR203 I02 wording fix shipped under the same kit version).

Vietnamese note: new copy is deterministic template text reusing existing sentence
patterns (facts/numbers/terms/modals preserved). The upstream pinned
`humanizer-vi` revision was not fetchable in this environment; only the prior-run
local copy's preservation rules were read — no skill run is claimed.
