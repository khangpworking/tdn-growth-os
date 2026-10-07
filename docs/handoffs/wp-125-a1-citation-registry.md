# Handoff — WP-125-A1 shared citation registry + "Nguồn tham khảo" register

Updated: 2026-10-07
Worktree/branch: `wp/125-a1-citation-registry`, based on `origin/main` 35cad2d (no fetch).
Completed:
- `CitationRegistry` (`src/modules/analysis/citation-registry.ts`):
  - `cite(input)` gives one number `[n]` per source + locator, in order of first appearance. The same source and locator always reuse the same number, and the first label wins.
  - `citationId = sha256(canonicalJson({ sourceKind, identity, locator }))`, using the locator after `normalizeReportCitationLocator`.
  - A source with no lineage (`identity` null or blank) gets `null`: no number and no entry.
  - The label and quote are checked for provider names (case-insensitive substring). The list is `FORBIDDEN_PROVIDER_NAMES` from `reader-report/lint.ts` plus SerpApi, Apify, PageIndex, Agent-Reach, OpenCLI and zen-studio. A match throws `CitationLabelError('PROVIDER_NAME_IN_LABEL')`.
  - Provider identity and other technical fields are kept only in `technicalTrace()` (`citation-trace-v1`), never in `entries()`.
  - URLs: https only and no credentials, otherwise `INVALID_URL`. The stored and shown URL is origin + path only, without query or fragment.
  - Malformed input fails closed with `INVALID_INPUT`. This covers: an unknown kind or verification, a blank label, a retrievedAt that is not ISO, and a locator the shared normaliser rejects.
- `renderCitationRegister(entries, { format })` and `renderCitationMark(n)` (`src/modules/analysis/citation-register-html.ts`):
  - Each item shows `[n] · label · ngày dd/mm/yyyy · locator · link`, and every part is escaped with `escapeHtml`.
  - Web: the link reads "Mở nguồn" and has `rel="noopener noreferrer"`. PDF: the URL is printed as the link text.
  - No entries gives an empty string.
- 7 unit tests in `tests/unit/citation-registry.test.ts`:
  - numbering and reuse;
  - no lineage → no number;
  - provider names in the label or quote, all case variants, while the technical trace keeps them;
  - URL rules;
  - malformed input;
  - escaped, reader-safe HTML;
  - byte-identical output for the same cite sequence.
- Not wired into any report (out of scope; the follow-up comes after #123).

- **Review fix (owner review, 2026-10-07):** provider names and digests could reach "Nguồn tham khảo" through the locator text or the URL, because only the label and quote were checked.
  - `assertReaderSafeCitation` now checks the label, quote, locator text and displayed URL.
  - A provider name → `PROVIDER_NAME_IN_LABEL`. A run of 32+ hex characters → the new `TECHNICAL_ID_IN_LABEL`.
  - `renderCitationRegister` re-checks every entry, including entries built outside the registry.
  - 2 regression tests were added.

Changed paths:
- `src/modules/analysis/citation-registry.ts` (new)
- `src/modules/analysis/citation-register-html.ts` (new)
- `tests/unit/citation-registry.test.ts` (new)
- `docs/handoffs/wp-125-a1-citation-registry.md` (this file)

Evidence (commands, results, relevant revision):
- These runs are a **Claude Windows pre-check**, not the authoritative run. The reviewer or GPT re-runs on Linux in a clean directory.
- Node v24.15.0. `npm ci` needed `--ignore-scripts` on this Windows host because the node-gyp path was missing. The `better-sqlite3` build was copied from a working clone. No package files changed.
- `npm test` before (35cad2d): tests 1041, pass 906, fail 132, cancelled 0, skipped 3. The failures are all Windows environment issues: no Python (exit 9009), EPERM on fsync, and path and permission differences.
- `npm test` after (f828bde): tests 1048, pass 912, fail 132, cancelled 1, skipped 3.
  - The 7 new tests all pass.
  - The full-run failure list differs from the baseline by 4 names. Three are in `tests/integration/shopee-file-research.test.ts`, failing on EPERM fsync. One is in `research-automation-case-contract.test.ts`, which timed out at 30 s under load and is the 1 cancelled.
  - Re-running both files alone gives the same result on untouched 35cad2d and on this branch: 38 tests, 21 pass, 17 fail, with the same failing names. These are Windows flakes, not caused by this change.
- Focused run: `node --import tsx --test tests/unit/citation-registry.test.ts` → 7/7 pass.
- `tests/unit/report-citations.test.ts` → all pass. `report-citation-html.test.ts` → 1 fail, "Python was not found", which is also in the baseline.
- `npm run typecheck`: the npm script does not run on Windows. The same `tsc --noEmit` was run through a local wrapper → exit 0.
- `git diff --check origin/main...HEAD` → clean.
- `git diff --numstat origin/main...HEAD` (code commit; this handoff adds one more file):
  ```
  28   0  src/modules/analysis/citation-register-html.ts
  159  0  src/modules/analysis/citation-registry.ts
  130  0  tests/unit/citation-registry.test.ts
  ```
- `git log --oneline origin/main..HEAD`: `f828bde WP-125-A1: add shared citation registry and source register HTML`, plus the handoff commit.

Unresolved:
- The `TDN-GROWTH-OS.md` note named in the brief does not exist on this host. The `test-audit` skill (SKILL.md, CAMPAIGN.md) was read. The `humanizer-vi` skill is not installed here, so the Vietnamese UI strings ("Nguồn tham khảo", "Mở nguồn", "trang N", "bảng S, ô C", "mục /…") were kept short and literal.
- Locator text for a JSON pointer is shown as `mục /groups/W2/revenue`. A friendlier reader label per pointer belongs to the wiring step.
- The forbidden-name list lives in this module as `CITATION_FORBIDDEN_NAMES`. If the shared `FORBIDDEN_PROVIDER_NAMES` is later widened, the extra names here can be dropped.

Next action: The coordinator reviews and re-runs the tests on Linux. The wiring into the automated and reader reports is the next WP, after #123.
Business decisions pending: none.
