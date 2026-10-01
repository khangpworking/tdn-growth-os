# Report-kit to TDN integration specification (A42 W1)

**Root integration update:** `reportPresentation: report-kit-v1` now dispatches
creation and replay; absent selection preserves legacy bytes. Montserrat
400/700 in three subsets is embedded from licensed, versioned repo assets.
Only new-profile meta/header CSP permits `font-src data:`; no scripts or remote
requests. Earlier system-font-only and unwired-dispatch notes below are worker
handoff context, not current blockers. Current limits and Linux verification:
`../handoffs/research-a42-wave1-integration.md`.

Status: design intake (static inspection) plus the implemented renderer described in section 10. Base checkout head `ea38e7f8295c8cbd61ec7776c4363958867c1f10` (plus uncommitted A40/A41/A42 work). Nothing here has been compiled or run; execution evidence comes only from Linux CI. The kit handoff's own "7/7 tests pass" claims are **not** repeated here.

**Correction to the first version of this document.** It proposed editing `research-report-html.ts` and `report-assembly-html.ts` and bumping the renderer literals. That is wrong. `ReportVersionService.#readVerifiedVersion` rebuilds every report on each replay and compares the exact files, so both legacy renderers and their byte output must stay unchanged. The new look ships as a **new** renderer; root owns versioned request/profile dispatch. Sections 3, 4.3, 7 and 8 below are corrected accordingly.

**Decision in one paragraph.** Port the owner's look (Vietdata bulletin for Market, YouNet ECI for Insight: palette, type scale, card/header/insight-bar language, chart styles) into a new deterministic, script-free TDN renderer (legacy renderers untouched) as a shared CSS theme plus inline static SVG/CSS charts. Do not ship the kit build, runtime, ECharts or its `derive()` into retained reports. TDN calculation artifacts stay authoritative. The React operator app stays the shell and opens the retained `report.html` in a new tab, as it does today. One HTML per version carries a Market part (M01-M13) and an Insight part (I01-I17). All 30 sections always appear, in catalog order, with an explicit unavailable state when there is no output.

## 1. Verified sources

### 1.1 Kit (read-only) `C:/Users/Admin/Documents/Codex/2026-09-16/t-i/report-kit/`

Not a git repo. SHA-256, full:

| File | Bytes | SHA-256 |
|---|---:|---|
| `templates/vd-market.html` | 16,182 | `a4730922bcfa8b570c3bde31d353456e53fd4b00faf04ce646cb00b9552b508d` |
| `templates/eci-insight.html` | 18,755 | `68041b489b24be83f814ea5b9b1a049442d634547b65ec27bd81a8b30990a3ff` |
| `templates/runtime.js` | 5,581 | `8bc7e36303ab0946b2c794f49f083e1b25ca22e91c9fd4dd95c8f39718f049e1` |
| `src/build.ts` | | `71645d16105e4213964ba41820d47613c04d1124cd8329fd827027745fe3e0bd` |
| `src/check.ts` | | `f0b09a077d5f4c34dc0ae1508072a8bfd590185cbbe240b602d1ecfa4d8ee9ca` |
| `src/cli.ts` | | `fb6054bcd9c18a751285270d524132ab6592f0bc90a4352df5d623d45d75a81d` |
| `src/templates.ts` | | `16fff4a5820c2b71f6744f6eff0f2c8bfa3d21633872372338d72085c83f7632` |
| `src/schemas/common.ts` | | `f3d18b6df36c5a87e8642fec0f7d910269c1cf187ee0eab3bdbddd6a233364ef` |
| `src/schemas/vd-market.ts` | | `af010393567c7623ade1dd97da2fe5402cabf57c09214e6194390b748679ae11` |
| `src/schemas/eci-insight.ts` | | `408b304b55426415f4e78ffadf04f29e505ce650f8e55318c373a7ce7bd7d7f3` |
| `schemas/vd-market.schema.json` | | `ea2723f58b063f8b36fbde2df0c5c293935041da1d725fb8a3ed866fcfc0ff15` |
| `schemas/eci-insight.schema.json` | | `ebbdd9574f4402d35e23481d55a1d81545e9007add8d8ab5018ded3f572bf2d8` |
| `examples/canxi-market.json` | | `e6ac799f4485ea86f563470c0eadd3272be7e7e28f4f936309d0ee6af6ca1b38` |
| `examples/canxi-insight.json` | | `6726c9e366bb0fccee555c99b409db74a2e169000d74f7ab94f6431dcac1790b` |
| `README.md` | | `1eced29b87970be4a2b42791343d125eefedca7b171befc08d0f98d31890c44b` |
| `AGENT_HANDOFF.md` | | `cf7ba0c471d1f0056131b852326b5e13515392a9144269b0ba1b3836e307b183` |
| `package.json` | | `17bb36402d518c22ff32c4848a611414026e4241cb4521c29ad4c3daa2412f61` |
| `package-lock.json` | | `9d0ae555a47f03a8690f23142079884616296071d9ab48c152b3a6e6e7c413fb` |
| `node_modules/echarts/dist/echarts.min.js` (6.1.0) | 1,121,883 | `b66b25aeb4df84e33199dc21694014d336d222cbd9deb0e5a7c14bd6aa0d0fd0` |

Kit goldens (`test/goldens/`, Windows-generated, 6 + 5 PNG) and `out/` are design references only, never TDN evidence. Their hashes are recorded in `docs/handoffs/research-a42-w1-report-kit-intake.md`.

Owner source HTML (`.../t-i/outputs/`, read-only, hashed in this task):

| File | Bytes | SHA-256 |
|---|---:|---|
| `Market_Report_Canxi_Competitor_Layouts_2026-09-29.html` | 60,798 | `b116d01893fc68b5bb93e7aeb4f1cb895f3f98c0a7af08877b4aaeae014b518b` |
| `Insight_Report_Canxi_Competitor_Layouts_2026-09-29.html` | 63,268 | `4e7ee5d21251b7962e2a34059f9456336a2905e94fc258e38b6fb63af88df0db` |
| `Market_Report_Canxi_Slides_2026-09-25.html` | 60,624 | `c310c4345c6e24fd608bcf40faa6d8db81dc102759f01f34c62badcd4e897a4a` |
| `Insight_Report_Canxi_Slides_2026-09-25.html` | 58,298 | `28de9f1bdc528622e8ca35f1252bcfab95d5b1d901be4d0f112c111eef4df7ca` |

Keep these four files and the two templates as the pinned visual reference. Do not copy them into the repo; record the hashes above in the PR.

### 1.2 Actual template inventory (from template/schema source)

Both templates are 100% JS-rendered: the HTML body is empty, `KIT.mount` builds `doc.innerHTML` from JSON, ECharts uses the SVG renderer, fonts are `data:` woff2 (Montserrat latin / latin-ext / vietnamese from `@fontsource/montserrat` 5.3.0), and the page sets `window.__KIT__`. Pages are fixed-size boxes with `overflow:hidden` and fixed heights.

**`vd-market` (720×1040 px, cover + 4 pages, footer numbers 02-05)**
- Cover: kicker, title, sub, date block, one big figure + note, 4-item TOC, diagonal yellow/blue clip, `.vd-logo`.
- p2 overview: 2 chart cards (`vd-cls` hbar, `vd-rev` vbar), 3-7 paragraphs (optional 3-column mini table), sources table 2-5 rows + rule box.
- p3 competition: `vd-top3`, `vd-ver`, wide `vd-trends` (bar + line).
- p4 trade: `vd-trade`, `vd-origin`, quotes table 1-4 rows (core/alt groups, struck list price) + rule box.
- p5 conclusion: `can`/`cannot` lists 3-5 items each, text, wide `vd-status` (6-16 rows, levels C0-C3).
- Tokens (from the `<style>` block): ink `#262838`, navy `#1B1D3A` / `#232E7A`, blue `#3F4FC1`, yellow `#FFC800`, card border `#D9DCEB`, body `#5E6270`; `font-family:Montserrat,sans-serif`; header bar `.cp` 22 px uppercase caption.

**`eci-insight` (1280×720 px, cover + 5 slides, footer slide numbers)**
- overview: exactly 3 KPIs, `eci-stars` donut (2-5 bands), 3 read items.
- questions: exactly 3 question panels with ok/unknown boxes.
- journey: case A 5 steps (+has/missing), case B before/after, flow 4 steps with status badge, 4 fragments.
- opportunity: 2 hypotheses + counter, protocol card (3 rows, A/B), 4 test steps + note.
- status: exactly 3 KPIs, `eci-status` grouped bar (8-20 modules, C/P levels 0-3), 4-6 bounds.
- Every slide: navy insight bar (<=170 chars) and a source line. Tokens: background `#F3F6FA`, ink `#0B1F44`, orange `#F7931E`, cyan `#059ED9`, header gradient `#061634 -> #0B2A5C` with a cyan radial glow; `.eci-logo` bordered wordmark.

**Data model and build (for the boundary decisions below).** Kit JSON = `facts` (raw numbers) + prose strings with `{facts.x|fmt:arg}` / `{x.name|fmt}` placeholders (`n nx int round floor vnd pad2 upper`, `**hl**`) + per-point `fmt` templates. `derive()` computes `x.*` in JS doubles. Caps: `prose(max)`, `label`, `tpl` count visible characters; fixed list lengths. `near(a,b,tol)` tolerance checks accept sums within ~0.05-0.2. Build order: validate facts -> derive -> fill plain -> validate visible text -> fill HTML -> inline. Exit 0/1/2/3. The check fails the PDF on any overflow/overlap/clip. Example data is fabricated Canxi content; the brand slot reads `TRADE ATLAS`.

### 1.3 TDN files this design binds to (all exist at the base head)

- `src/modules/analysis/report-assembly-snapshot.ts` (`buildReportAssemblySnapshot`, AJV `contracts/analysis/report-assembly-snapshot.schema.json`, `assemblySha256`).
- `src/modules/analysis/prepared-report-assembly.ts` (`buildPreparedReportAssembly` -> `assemblyHtml`, `semanticContentBytes`, `semanticVersionId`).
- `src/modules/analysis/report-assembly-html.ts` (`renderReportAssemblyHtml`, `assemblyPanel`, `READINESS_ANCHOR`).
- `src/modules/analysis/research-report-html.ts` (`renderResearchReportHtml`, CSS literal at lines 365-368, `expectedChartViewIds`, `number()`/`width()` helpers, anchors `#method #trace #charts #chart-spec #quote #readiness #claims #provenance #source-rows #files`).
- `src/modules/analysis/report-version-service.ts` (`createPreparedVersion`, `#buildPrepared` line ~676 sets `report.html` and `rendererVersion:'report-assembly-html-vi-v1'`, `readArtifact`).
- `src/api/report-api.ts` (`/api/reports/:id/versions/:n/files/:name`, `sendArtifact` CSP at ~429), `src/api/operator-app.ts:303` (`staticHeaders`).
- `frontend/src/ResearchReportsPanel.tsx:118` (link opens `report.html` with `target="_blank"`), `frontend/src/data-source.ts:135` (`reportArtifactUrl`).
- `docs/research/report-section-catalog-v1.json` (30 sections), `research-chart-spec.ts`, `contracts/analysis/research-chart-spec.schema.json`.

## 2. The 30 sections

One mapping table, used by the renderer as a static `SECTION_VIEW` constant (id -> component, anchor). Rules:

- Always render all 30, in catalog order, inside `#market` (M01-M13) and `#insight` (I01-I17). Titles come from the snapshot (`sections[].title`), never from the kit.
- A section without `materialization.materialized === true` renders the **unavailable card**: title, `deliveryState` label, `catalog.fallbackReasons`, `readiness.blockingCodes`, absent/invalid `inputChecks`. Missing is shown as "Thiếu", never as zero or as an empty chart. Pending or UNKNOWN is shown as such.
- A materialized section may still have `readinessBlockedWhileMaterialized`; keep showing that flag (already in the snapshot).
- Counts of items are data-driven (0..N). The kit's "exactly 3 KPIs / 5 steps / 2 hypotheses" never applies. A kit slot with no data is not drawn, not filled with a placeholder.

Legend for "Today": the panel already produced by the current renderer. "Look": the kit component whose visual language the section adopts once it has content.

| ID | Title (catalog) | Today | Look (repeatable component) | When not materialized |
|---|---|---|---|---|
| M01 | Kết luận chính | none | `section-page` + claim list (future: exact-claim inventory) | unavailable card |
| M02 | Phạm vi và phương pháp | `#readiness` row + `m02-scope-method.json` download | fact card: platform, period basis, scope key from `snapshot.source.scope` | unavailable card |
| M03 | Quy mô và diễn biến | `#charts`: `scope-totals-{revenue,units,listings,shops}`, `scope-membership-sensitivity-revenue` | KPI strip (3 scopes from `m03.scopeTotals`) + vbar cards (vd-rev look) | partial totals keep "một phần/không đầy đủ" labels |
| M04 | Cơ cấu thị trường | `#charts`: `top-shop-share-*`, `group-composition-*`, `top-shop-removal-*` (9 views) | hbar cards (vd-cls look); ring only with a complete denominator | no share visual when denominator incomplete |
| M05 | Nhu cầu | none | source-measure table | unavailable card |
| M06 | Nguồn cung | none | located inventory table | unavailable card |
| M07 | Đối thủ | none | side-by-side peer table (vd-top3/ver look, no rank) | unavailable card |
| M08 | Giá và kinh tế đơn vị | `#quote` (M08/P4) | quote arithmetic table (vd-trade look; no invented list price) | "Thiếu quote" state (six partial paths remain, see A38) |
| M09 | Động lực và rủi ro | none | dated event inventory table | unavailable card |
| M10 | Dự báo và kịch bản | none | eligibility/blocker list | unavailable card; no trend chart |
| M11 | Cơ hội | none | unranked evidence bundle cards | unavailable card |
| M12 | Hành động | none | open decision packet (options may be empty) | unavailable card |
| M13 | Phụ lục và truy nguồn | `#provenance`, `#source-rows` | appendix pages (tables) | unavailable card |
| I01 | Câu hỏi kinh doanh | none | owner brief card with explicit UNSET fields | unavailable card |
| I02 | Khách hàng và hoàn cảnh | none | context table (role/situation/task/setting/time) | unavailable card |
| I03 | Phương pháp nghiên cứu | `#method` | method account card (existing A25 content) | unavailable card |
| I04 | Hành vi | none | coded-quote table | unavailable card |
| I05 | Cảm nhận và thái độ | none | polarity inventory with n/N only with complete denominator | unavailable card |
| I06 | Hành trình | none | ordered steps, same-record only; step count = data length | unavailable card; no cross-record journey |
| I07 | Lý do lựa chọn | none | choice -> reason clause table | unavailable card |
| I08 | Rào cản | none | task + obstacle table | unavailable card |
| I09 | Nhu cầu chưa được đáp ứng | none | gap-pair table | unavailable card |
| I10 | Chủ đề và mối quan tâm | none | theme corpus counts (hbar), pending shown | unavailable card; partial coverage stated |
| I11 | Khác biệt giữa các nhóm | none | group inventory table | unavailable card |
| I12 | Điểm tiếp xúc | none | three separate tables: presence / exposure / outcome (no conversion) | unavailable card |
| I13 | Thương hiệu và đối thủ | none | mention inventory table | unavailable card |
| I14 | Hướng cơ hội | none | unranked direction cards | unavailable card |
| I15 | Định hướng chiến lược | none | side-by-side alternatives (empty allowed) | unavailable card |
| I16 | Thử nghiệm và đo lường | none | protocol card, `DESIGN_ONLY` = "chưa thực hiện" | unavailable card |
| I17 | Phụ lục và bằng chứng | `#trace` | trace table | unavailable card |

Kit pieces with no TDN source, therefore **not ported as data views**: `vd-trends` (no multi-period series; M03 is one preparation), `vd-verify`/`vd-origin`/`vd-top3` (no declared source), `eci-stars` donut (no star distribution input), `eci-status` C/P module levels (kit-internal rubric). Replacement for the status view is a 30-tile status overview (`#status`, new renderer) built from `sections[].readiness.state` and `materialization.deliveryState` plus integer counts of those enums. Kit cover figure and sub-lines come from snapshot/lifecycle facts only (source package id, period basis, status `DRAFT_PARTIAL`, finality statement), never from kit example text.

Anchors: keep every existing id. Add `#market`, `#insight`, `#section-<ID>`. The operator app can link to `report.html#market` or `#insight`; no second version history and no script.

Brand: the kit wordmark slot renders "TDN Growth OS". Do not reproduce Vietdata/YouNet logos or wordmarks; palette, type, layout grammar only.

## 3. Rendering and data boundary

```
A30 preparation + A31 readiness + A37 M03 artifact          (unchanged)
   -> buildSourceBackedReport / buildReportAssemblySnapshot (unchanged, AJV-validated)
   -> root-owned profile dispatch by rendererVersion:
        'research-evidence-html-vi-v1'  -> renderResearchReportHtml   (legacy, byte-stable)
        'report-assembly-html-vi-v1'    -> renderReportAssemblyHtml   (legacy, byte-stable)
        'report-kit-html-vi-v1'         -> renderReportKitHtml        (new)
   -> A10 retains report.html (+ semantic-content.json, review-state.json)          (root)
   -> report-api serves GET-only, CSP script-free                                    (root)
```

**Reused as-is:** `buildPreparedReportAssembly`, `buildReportAssemblySnapshot` and its schema, `ReportVersionService.createPreparedVersion/readArtifact`, `report-api.ts` routes and CSP, `ResearchReportsPanel` link, chart-spec validation, claim `<details id="claim-…">`, download links, `limitations` code maps. Both legacy renderers are also called **unchanged** by the new renderer and their `<section id>` blocks become the evidence appendix.

**New code (new files only; no schema, no migration, no dependency):**
1. `src/modules/analysis/report-kit-theme.ts`: `REPORT_KIT_CSS` (static, no `@import`, no `url()`) and `REPORT_KIT_FONT_STACK`.
2. `src/modules/analysis/report-section-pages.ts`: page-level rendering of M01-M13 and I01-I17 (`renderMarketSheet`, `renderInsightPanel`, `renderOverviewKpis`), a requirement/missing state per section, number formatting by string operations, bar geometry by BigInt basis points.
3. `src/modules/analysis/report-kit-html.ts`: `renderReportKitHtml(...)` (signature in section 10), `REPORT_KIT_RENDERER_VERSION = 'report-kit-html-vi-v1'`.
4. `tests/unit/report-kit-html.test.ts`: bounded behavior tests.

Root (not this worker) owns: the versioned request/profile field that selects `report-kit-html-vi-v1`, dispatch in `report-version-service.ts` for create and replay (the replay path must pick the renderer from the retained `rendererVersion`), passing `descriptiveMethods` when available, prepared assembly, report CSP, and integration.

There is no ledger rendition concept: artifacts are keyed `(report_id, version, file_name)` and `rendererVersion` exists only inside the retained `export-manifest.json`, whose bytes are hash-covered. A new renderer applies to newly created versions; old versions replay through their own legacy renderer and keep exact bytes. Re-rendering existing content is an explicit next version (`version+1`).

## 4. Keeping the ECI look without breaking security

### 4.1 Real CSP facts (source-inspected)
- Report artifact response (`report-api.ts` ~429): `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'` with `nosniff`, `no-referrer`, `no-store`; the HTML also embeds an equivalent meta CSP (`research-report-html.ts:364`). Asserted in `tests/integration/report-version-service.test.ts:778`.
- Operator app (`operator-app.ts:303`): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`.
- The report is opened as its own document (new tab), not framed by the operator app, so the operator CSP does not govern it. `frame-ancestors 'none'` on the operator app and `'self'` on the report are not involved.

### 4.2 What the kit would do under those policies
- Inline `<script>` (runtime + ECharts + data): blocked (`script-src` falls back to `default-src 'none'`). The kit body is empty until that script runs, so the page is **blank**.
- `data:` woff2 fonts: blocked (`font-src` falls back to `'none'`); text falls to the system sans.
- Inline CSS works (`style-src 'unsafe-inline'`). Inline SVG and pure CSS charts work.

### 4.3 Options compared and chosen

| Option | Verdict |
|---|---|
| Allow inline script + eval in report CSP for ECharts | Rejected: blanket `unsafe-inline`/`unsafe-eval` on a document that embeds source-derived text. |
| External bundled assets (`script-src 'self'` + route serving `echarts.min.js` 1.1 MB, runtime, fonts) | Rejected for v1: new asset routes, retained HTML no longer self-describing or byte-replayable without the assets, still JS-rendered (blank without script), new CSP relaxation. |
| Isolated rendering (sandboxed iframe / second origin with its own CSP) | Rejected for v1: extra origin/route and message plumbing for the same visual result; operator `frame-ancestors 'none'` and report `'self'` would both need re-decisions. |
| Static chart output (server-side inline SVG/CSS) | **Chosen.** Works under today's report CSP unchanged, is byte-deterministic, already the model of `.track`/`.signed-track` bars, prints, and keeps claim links and text accessible. |

Chosen shape: theme CSS + static SVG/CSS in a new string renderer (section 3). Fonts: `font-family: Montserrat,'Segoe UI',system-ui,…` with **no webfont**; installed Montserrat is used when present, otherwise the system fallback. No CSP change. Whether `local()` `@font-face` resolves under `default-src 'none'` is not verified; do not depend on it.

Embedding Montserrat is possible but needs a root decision first (nothing has been copied):
- Source: `C:/Users/Admin/Documents/Codex/2026-09-16/t-i/report-kit/node_modules/@fontsource/montserrat/files/montserrat-{latin,vietnamese}-{400,600,700,800}-normal.woff2` (8 files, about 105 KB).
- License: SIL Open Font License 1.1, "Copyright 2011 The Montserrat Project Authors". The OFL text must ship with the asset.
- CSP: embedded `data:` fonts are blocked by today's report CSP. They need a narrow `font-src data:` added to both the response header and the meta CSP, plus an update of the assertion at `tests/integration/report-version-service.test.ts:778`. The retained HTML then grows by about 140 KB of base64.

Versioning consequence: `ReportVersionService.#readVerifiedVersion` rebuilds all reports on replay and compares exact files. Legacy versions must therefore keep replaying through their original renderer, unchanged. The new renderer has its own `rendererVersion` literal, and dispatch on that literal is root-owned. No legacy literal is bumped.

## 5. Facts, derived values, prose, claim references

| Kit concept | TDN handling |
|---|---|
| `facts.*` raw numbers | Not used. Sources are `snapshot.m03.scopeTotals` (decimal strings + `observedCount/missingCount/nonExactCount/complete`), chart-spec view points and their `valueText`, M08 exact rational + half-even 2-decimal display, M04 group arrays. Numerics stay decimal strings/BigInt/basis points, formatted by the existing `number()` helpers. |
| `derive()` -> `x.*` | Must not be ported as a calculation engine. Forbidden: float sums, corePct/share/rate recomputation, trend min/max, "verifyMiss", unsupported rates, `near()` tolerance acceptance. Allowed: presentation geometry only (bar width from an already-published value via `width()`), and integer counts of snapshot enums for the status sheet, labeled as counts of the snapshot. |
| Placeholder formats `n nx int round floor vnd …` | Not used. Text is produced by deterministic Vietnamese templates in TDN code over published strings; `round`/`floor` are never applied to money or rates. |
| Prose / `**highlight**` | Deterministic Vietnamese templates or retained semantic layer content. No AI call, no automatic rewrite. Kit Canxi sentences and numbers are design examples, never ingestion evidence. |
| Claim references | The kit's `data-slot="<json.path>"` becomes `data-section="<ID>"` plus `data-claim-id` / `data-view-id` on each figure, linking to `#claim-<id>` `<details>` and `#section-<ID>`. Section `claimIds`/`contextPointers` from the snapshot drive the links. |
| Missing / zero / UNKNOWN | Distinct states, as in `totalHtml` today: "Thiếu" (null/missing), observed zero, partial, non-exact. A `null` value never renders as 0 and never as a bar. |
| Source scope, partial status | Always shown near the figure: scope key, period basis, `DRAFT_PARTIAL`, completeness flag. Lifecycle status/finality text stays in the header. |
| Layers | Interpretation layers stay separate; `interpretation: NONE`, `review: UNREVIEWED` remain visible. Pending is never zero. |

## 6. Overflow and pagination

- No caps or truncation. The kit's `prose(max)`/`label`/`tpl` limits and fixed heights exist to keep fixed paper boxes from overflowing; TDN content is complete evidence, so layout must accommodate content, not the reverse. No `overflow:hidden` on content boxes, no `text-overflow:ellipsis`, no AI shortening.
- Browser view is continuous and responsive (reuse existing breakpoints at 700 px). Boxes use `min-height`, `min-width:0`, `overflow-wrap:anywhere`; wide tables sit in the existing `.table-wrap` horizontal scroller. Long lists and tables are complete, one row per source row; very large tables stay in the existing `#source-rows`/appendix blocks.
- Kit fixed page sizes (720×1040, 1280×720) are **not** browser layout. They may inform an optional print stylesheet only (`@page`), using the existing `@media print` rules (`break-inside: avoid` on figures/rows, `details>*{display:block}`).
- PDF is optional and later. It is not a dependency of the first localhost release. When wanted, reuse the Linux CDP `Page.printToPDF` already in `tests/helpers/capture-research-preview.mjs`, not the kit's Playwright/PDF pipeline, and never treat a PDF as a retained ledger artifact until a separate decision.
- Overflow guard (behavior, not pixels): in the existing preview capture, assert at 1440 px and 390 px that no element other than `.table-wrap` has `scrollWidth > clientWidth`, and that each of the 30 `#section-<ID>` anchors exists and each snapshot `claimId` has its `#claim-` target. Adapts the kit's in-page audit idea; reuses the existing 267-interaction check style.

## 7. Bounded implementation checklist

Owner = this worker for the four new files; root for everything shared (`report-version-service.ts`, prepared assembly, API CSP, `index.ts`, generator, App/data-source, package manifests, migrations, workflows, STATUS/INTENT, legacy renderers).

| # | Change | Owner | Files |
|---|---|---|---|
| 1 | Theme | this worker (done, unexecuted) | `src/modules/analysis/report-kit-theme.ts` |
| 2 | 30-section pages | this worker (done, unexecuted) | `src/modules/analysis/report-section-pages.ts` |
| 3 | Renderer entry, cover, nav, appendix reuse | this worker (done, unexecuted) | `src/modules/analysis/report-kit-html.ts` |
| 4 | Behavior tests | this worker (written, unexecuted) | `tests/unit/report-kit-html.test.ts` |
| 5 | Versioned profile/request field and dispatch for create and replay; pass `descriptiveMethods`; retain bytes | root | `report-version-service.ts`, API, contracts |
| 6 | Overflow/anchor check in preview capture | root | `tests/helpers/capture-research-preview.mjs` |
| 7 | Font embedding and `font-src data:` only if root approves | root | CSS/CSP, `tests/integration/report-version-service.test.ts:778` |

Validation, Linux only (CI): `npm run contracts:generate` drift (expected none), strict typecheck, `tests/unit/report-kit-html.test.ts`, existing `research-report-charts`, `report-assembly-snapshot`, `prepared-report-version` and `report-version-service` tests (these must remain green and unchanged, proving legacy bytes are stable), preview job desktop and mobile, keyboard focus, contrast. No pixel goldens or per-sentence source-text assertions. Windows kit goldens and any Windows render are not evidence. One visual inspection round of the Linux preview artifact is the design gate.

Out of scope: React changes beyond the existing link (optionally a `#market` / `#insight` link pair in `ResearchReportsPanel.tsx`, coordinator-owned App wiring), CSP relaxation, new dependencies, ledger/migration, PDF export, AI interpretation, providers.

## 8. Blockers and decisions

**Blockers for root integration:** dispatch by `rendererVersion` is not wired (root-owned), and fonts are not embedded.

Routine, delegated (recorded so nobody re-asks): the new look is a new renderer, legacy renderers untouched; new wordmark is TDN; no competitor logos; system font stack in v1; one HTML with Market and Insight parts.

One optional root-level choice, only if exact Montserrat matters: approve copying the 8 woff2 files (SIL OFL 1.1) and a narrow `font-src data:` (section 4.3). Default is no.

No legacy literal is bumped, so there is no old-version rebuild limitation.

## 9. Static versus Linux verification

Verified statically in this task: file existence, sizes and SHA-256 of the kit, templates, schemas, examples and the four owner HTMLs; template/schema/build/check source; TDN CSP strings at the cited lines; renderer, snapshot, assembly, ledger and API source; CI path routing; that the replay path rebuilds and byte-compares every report (so legacy renderers must not change); that the ledger has no rendition table.

Not verified; requires Linux execution: any claim that the new theme renders correctly under the real report CSP in a browser, `local()` font behavior, responsive/print layout, the overflow and anchor checks, typecheck/contract drift/test results, and the kit's own build and tests (never run here).

## 10. Implemented renderer (unexecuted)

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

- `snapshot` and `retainedM03` are given together (prepared path, legacy `#assembly` section is included in the appendix) or both omitted (source-backed partial path). One without the other throws `TypeError('report kit HTML: SNAPSHOT_AND_RETAINED_M03_MUST_BE_TOGETHER')`. Other codes: `SNAPSHOT_SECTION_COUNT_MISMATCH`, `SNAPSHOT_SECTION_ORDER_MISMATCH:<id>`, `SNAPSHOT_DELIVERY_STATE_MISMATCH:<id>`, `PACKET_SECTION_MISSING:<id>`, `LEGACY_EVIDENCE_SECTION_MISSING:<id>`.
- Output is deterministic: no clock, no randomness, no script, no external reference. Meta CSP is identical to the legacy renderer's.
- Page order: cover with TDN brand and TOC, jump nav, `#market` (overview KPIs, 13 sheets), `#insight` (17 panels), `#status` (stacked state bar, legend, 30 tiles), `#appendix`, footer. Every section exists as `#section-<ID>`.
- Appendix: the legacy renderer's `<section id>` blocks (`method`, `trace`, `quote`, `chart-spec`, `assembly`, `readiness`, `claims`, `provenance`, `source-rows`, `files`), extracted from the legacy output, so claim, diagnostic and row anchors keep resolving. `#charts` is provided by the M03 sheet.
- M05/M06/M07/M09 show structured rows from `descriptiveMethods` when supplied, otherwise a specific missing state. Because descriptive data arrives outside the packet, the packet's delivery state for those sections can lag; the page shows a visible note and does not override the packet state.
- Geometry: bar widths come from BigInt integer ratios turned into basis points and printed as `width:NN.NN%`; zero or missing draws no fill. Non-exact, UNKNOWN and missing rows appear only in tables. Numbers are formatted with string operations only (`.` thousands, `,` decimals).
- Scope rules shown on the page: ALL/WIDE/CORE are overlapping filter scopes, not top-shop or origin labels and not additive; ratios need a frozen complete denominator; UNKNOWN is retained and excluded from WIDE per the frozen policy; partial inventories never imply the whole market or causality. No C0-C3/P0-P3, no confidence score, no default KPI values, no journey fill (no journey component exists because there is no source contract).

Static risks, not compiled or run: type errors in the new files; test regexes depend on fixture data; a positive ratio that rounds to 0 basis points draws no fill (the value is still printed); `#charts` exists only when M03 is PARTIAL.

## 11. Finish documentation: approved report extension (2026-10-01)

Static consistency inspection of `report-kit-html.ts`, `report-kit-theme.ts`,
`report-kit-fonts.ts` and `report-section-pages.ts` confirms the inherited report
direction: Market keeps navy `#232E7A`, blue `#3F4FC1`, yellow `#FFC800`, white
sheets and framed chart cards; Insight keeps pale `#F3F6FA`, navy `#0B2A5C`, cyan
`#059ED9`, orange `#F7931E` and rounded panels. Bundled Montserrat 400/700 covers
Latin, Latin Extended and Vietnamese; the theme retains its 15px/1.6 body and
responsive headline scale. These choices carry the owner's approved bulletin
and insight layouts into the existing retained-report renderer.

The finish preserves that identity with bounded readability and layout changes:

- Cover TOC text uses `#FFDE59`; the Insight header label uses `#B5E8FA` as
  minimal accessible text variants. The Insight wordmark has a fixed navy
  backdrop, so its text does not depend on the decorative gradient underneath.
- At 900px and below, the cover stacks and the blue background belongs to the
  actual TOC region; diagonal cover decoration is removed. Two-column content
  uses `minmax(0,1fr)`, cards can shrink with `min-width:0`, and wide evidence
  tables keep their labelled, keyboard-focusable scroll regions.
- Proportional and signed bars have no artificial minimum width. Source values
  remain printed when a small positive ratio rounds to zero basis points;
  zero and unavailable values do not acquire a fabricated fill.
- Supporting text inside `dd small` starts on a separate line, matching table
  metadata and keeping quote values distinct from their exact-value notes.

Source data, item counts and wording may change without filling absent slots,
inventing chart marks or forcing evidence into fixed page boxes. The existing
app `DESIGN.md` describes a separate operator-shell context; its tokens and the
approved report world are not drift to repair or a replacement design system.
`PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` remain unchanged. Earlier
worker notes above remain historical context. This is a source inspection only:
Linux browser verification of rendering, contrast, keyboard use and responsive
overflow is pending; no visual PASS is claimed, and no Windows tests, typecheck,
build or browser verification were run for this finish note.

### Coordinator confirmation after the static note

Linux preview 36765488049 on `a3687fe74591f32fcb31831584f6ab00469d1e24`
subsequently passed. Independent confirmation reviewed the new desktop/mobile
captures and scored all four material corrections resolved, with disposition
`ship` for those fixes. Document widths fit both viewports; metadata and chart
geometry remain readable and truthful. The lighter text tints and fixed navy
brand backdrop preserve the approved direction. Gradient readability was
visually reviewed, not automatically contrast-certified. Interaction evidence
records no page errors, 343 actions per viewport, exact-byte evidence access,
keyboard activation and visible focus. Long screenshots are bounded to 8,000px
and complemented by section captures. See the A42 wave 1 handoff for complete
check links and release limits. No Windows execution was used.
