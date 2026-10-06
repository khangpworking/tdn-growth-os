# Handoff — A42 W1 report-kit renderer

Updated: 2026-10-01
Worktree/branch: `work/research-a24`, `feature/research-a42-live-report-wave1` (base head `ea38e7f8295c8cbd61ec7776c4363958867c1f10`), other workers' and root's uncommitted files untouched. No commit, no push.
Model: Claude Sonnet 5.5 (high effort).

Completed:
- Design intake `docs/frontend/research-report-kit-integration.md` (verified kit paths/hashes, template inventory, 30-section mapping, CSP analysis, data boundary). Corrected after review: the first version wrongly proposed editing the legacy renderers and bumping their `rendererVersion`. `ReportVersionService.#readVerifiedVersion` rebuilds and byte-compares every report on replay, so both legacy renderers and their output stay unchanged.
- New renderer in new files only. Export:
  ```ts
  export interface ReportKitInputs {
    readonly bundle: SourceBackedReportBundle;
    readonly snapshot?: ReportAssemblySnapshot;
    readonly retainedM03?: VerifiedSectionArtifactRetention;
    readonly semanticVersionId?: string;
    readonly descriptiveMethods?: DescriptiveMarketMethods;
  }
  export function renderReportKitHtml(inputs: ReportKitInputs): string;
  export const REPORT_KIT_RENDERER_VERSION = 'report-kit-html-vi-v1';
  ```
  `snapshot` and `retainedM03` must be given together or both omitted. Output is deterministic, script-free, self-contained, with the same meta CSP as the legacy renderer.
- Content: TDN cover and TOC, `#market` (overview KPIs, M01-M13), `#insight` (I01-I17), `#status` (30 tiles, stacked state bar), `#appendix` made of the legacy `<section id>` blocks extracted from `renderResearchReportHtml` / `renderReportAssemblyHtml` output. All 30 sections show a truthful state. M05/M06/M07/M09 show structured rows from `descriptiveMethods` when supplied, else a specific missing state. No AI conclusions, no inferred completion, no C0-C3/P0-P3 or confidence scores, no default KPI values, no journey fill, no missing-as-zero, no float recomputation (BigInt basis-point bar geometry, string-formatted numbers).
- 7 bounded behavior tests in `tests/unit/report-kit-html.test.ts` (synthetic fixtures, no pixel goldens, no source-text assertions).

Changed paths:
- NEW `src/modules/analysis/report-kit-theme.ts`
- NEW `src/modules/analysis/report-section-pages.ts`
- NEW `src/modules/analysis/report-kit-html.ts`
- NEW `tests/unit/report-kit-html.test.ts`
- `docs/frontend/research-report-kit-integration.md`
- `docs/handoffs/research-a42-w1-report-kit-intake.md`

Evidence:
- NOT EXECUTED. No test, typecheck, build, browser or Windows run was done, and no pass is claimed. The code has only been read statically.
- Earlier static facts still stand: SHA-256 of the kit, templates, schemas, examples and owner HTML (full values in the integration doc, section 1); CSP strings at `report-api.ts` ~429 and the meta tag in `research-report-html.ts`; the replay path rebuilding all reports.
- Kit goldens (`report-kit/test/goldens/`, 11 PNG) are Windows-generated design references only, not evidence. Their per-file hashes were dropped from this revision; re-hash them from the read-only kit directory if needed.

Unresolved:
- Linux verification of compile, tests, layout under the real CSP, overflow at 1440 px and 390 px, print, keyboard focus and contrast.
- Root integration: versioned request/profile field and dispatch in `report-version-service.ts` for create and replay (pick the renderer from retained `rendererVersion`); pass `descriptiveMethods`; retain bytes; prepared assembly; API CSP.
- Fonts are not embedded; the stack is `Montserrat,'Segoe UI',system-ui,…`. If embedding is wanted: source `<private path on the owner machine, withheld>` (8 files, ~105 KB), license SIL OFL 1.1 "Copyright 2011 The Montserrat Project Authors" (license text must ship). Needs a narrow `font-src data:` in header and meta CSP and an update of the assertion at `tests/integration/report-version-service.test.ts:778`. Nothing was copied.
- No journey/timeline component: there is no source contract for it.
- Known limits: `#charts` exists only when M03 is PARTIAL; descriptive data arrives outside the packet, so a packet delivery state for M05/M06/M07/M09 can lag (a visible note is shown, the state is not overridden); a positive ratio that rounds to 0 basis points draws no fill but keeps its printed value; test regexes depend on fixture data.

Next action:
1. Root: run on Linux `npm run contracts:generate` (expect no drift), `npm run typecheck`, `node --import tsx --test tests/unit/report-kit-html.test.ts`, then the existing `prepared-report-version`, `report-version-service` and `report-assembly` tests unchanged (they prove legacy bytes are stable), then the preview capture for one visual inspection round.
2. Root: wire versioned dispatch for `report-kit-html-vi-v1` and pass `descriptiveMethods`; extend the preview capture with the anchor and overflow checks.
3. Root: decide on font embedding (see Unresolved).

Business decisions pending:
- None blocking. Optional: approve copying the Montserrat woff2 files (SIL OFL 1.1) and a narrow `font-src data:` for exact typography; default is no. Delegated and recorded: TDN wordmark only, no competitor logos, one HTML with Market and Insight parts, no PDF requirement. WIDE/CORE/ALL stay overlapping scopes; the four A41 adopted policies are not reopened.
