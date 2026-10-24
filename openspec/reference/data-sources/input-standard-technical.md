# Quy chuẩn dữ liệu đầu vào — bản kỹ thuật đi kèm

Version 1.0 · 17/10/2026 · companion to `quy-chuan-du-lieu-dau-vao.md` (same version number; bump together).
Repo baseline: production main 4c013bec. All paths below are repo-relative. Read-only consolidation; no repo edits.

## 0. Sources consolidated

| Short name | Repo path | Version / date seen |
|---|---|---|
| Ultimate | `docs/research/ultimate-method/ultimate-method-30-sections.md` | v1.13 |
| Catalog | `docs/research/ultimate-method/input-data-sources-30-sections.md` | v1.9, 08/10, status notes to 12/10 |
| Status | `docs/research/ultimate-method/source-status.md` | header "cập nhật 12/10/2026", rows dated 17/10 |
| README | `docs/research/ultimate-method/README.md` | 11/10 |
| CHANGELOG | `docs/research/ultimate-method/CHANGELOG.md` | last rows 12/10 (BR/DS format) |
| Test log | `docs/research/ultimate-method/input-data-sources-test-log.md` | last row ST-20261008-22 |
| Common rules | `docs/research/section-methods-v1/common-rules.md` | §Shared value and evidence semantics, §Record identity and aggregation, §Shared input vocabulary |
| ADR 0005 | `docs/adr/0005-report-evidence-and-decision-ledger.md` | accepted 28/09/2026 |
| 14 rules | `src/modules/analysis/research-automation/market-14-rules.ts` | — |
| Business gate | `src/modules/analysis/research-automation/market-business-gate.ts` | — |
| Lanes | `src/modules/analysis/research-automation/*-lane.ts`, `search-interest.ts`, `metric-capture-runner.ts`, `metric-opencli-executor.ts` | — |
| Ops / owner facts | Brief from the coordinating agent, 17/10 evening | marked "chủ quyết dd/mm" |

## 1. Part-by-part provenance

| Plain part | Came from |
|---|---|
| Phần 1 thứ bậc | Ultimate §1 (owner written decision > Ultimate > A40 recipes > A41 config); Ultimate §6.1 (rules → Ultimate; catalog/status/grade → Catalog); brief: Status wins on status (newest, 17/10); README "new-decision flow" (6 steps) and "rule in Ultimate but not in code is not done" |
| Phần 2 từ điển | Common rules vocabulary; ADR 0005 layers; Catalog §1 |
| Phần 3 thang chấm | Catalog §1 (A–D), §1.2 representativeness (Cao/Vừa/Thấp), §1.3 seven usage rules (incl. M01 show-both-sides, E12/E13 naming exception) |
| Phần 4 danh mục | Catalog §2 (S01–S27: tool, grade, representativeness, cost), §3 section→source table; Status §2/§3 labels; brief 17/10 six status groups; lane constants (§4 below) |
| Phần 5 quy trình | ADR 0005 four layers; Ultimate §2 rule 2/3/7, L9; Common rules Observation state; gate + 14-rule files |
| Phần 6 khuôn dữ liệu | Common rules §Shared input vocabulary (explicitly "descriptive, not new runtime schemas") |
| Phần 7 quy tắc | Ultimate §2 (1–9), §2.1 (L1–L10), §2.2 (E1–E15), §6.3 review thresholds, appendix G1–G8 (G4 ±18 points, G8 M10 ≤180 days, source test 50 records); brief owner-text rules |
| Phần 8 giới hạn | Lane constants; Status §S25 review (PR #282); Catalog cost column; CHANGELOG BR-20261008-07 (P5 ≤10 searches), BR-20261008-12 (E14 example cap 3 USD TikTok comments); brief (Apify ≤15 USD/pilot, Kalodata 0,1 pt/call, ≥6 pt canary, Metric uncapped 08/10, video 45 days) |
| Phần 9 conflicts/gaps | Cross-reading of the above |

## 2. Authority and status labels

- Status labels (Status §1): `Đã duyệt`, `Đã test`, `Chạy thử`, `Đề xuất`, `Không thu` (always with reason). Labels are documentation only; no code reads them.
- Status values used in the plain table = Status file labels (in parentheses) + brief 17/10 group. Disagreements listed in plain Phần 9 (19 items).

## 3. Four layers (ADR 0005)

1. Source evidence: exact bytes, locators, scope, acquisition period.
2. Deterministic calculation: every displayed value resolves to layer 2 or 1.
3. AI interpretation: immutable, unapproved; cites existing claim IDs only; unsupported number / invented provenance / approval language → fail closed; no chain-of-thought stored.
4. Human decision: append-only.
Three identities: semantic version, render version, review history.

## 4. Source → code, flags, constants

Flag defaults: every flag below is documented as default OFF ("mặc định tắt") in Status; production values on 17/10 per brief.

| S | Code (intake / lane) | Env flag | Prod 17/10 | Constants (from code) |
|---|---|---|---|---|
| S01 / S04 | `metric-capture-runner.ts`, `metric-opencli-executor.ts`; `src/api/operator-app.ts` wiring | `TDN_METRIC_OPENCLI_ENABLED` (+ `TDN_METRIC_OPENCLI_ADAPTER_MANIFEST`, `TDN_METRIC_OPENCLI_ADAPTER_SHA`, `TDN_METRIC_CAPTURE_DIR`) | on | no spend cap (08/10) |
| S02 | chưa rõ (Kalodata client not opened) | chưa rõ | paused (0 points) | 0,1 pt/call; stop on balance error; canary ≥6 pt (owner) |
| S05 / S07 | chưa rõ (Apify actors; native review collection SKIP) | chưa rõ | paused (unfunded) | ≤15 USD/pilot, aim ~10 (owner) |
| S14 | `video-watch-lane.ts` | `TDN_RESEARCH_VIDEO_WATCH_ENABLED` (+ `TDN_RESEARCH_VIDEO_MEDIA_DIR` absolute, `TDN_RESEARCH_VIDEO_WATCH_MODEL` plain gemini-* id, `TDN_RESEARCH_YTDLP_BIN`, `TDN_RESEARCH_FFPROBE_BIN` default `ffprobe`) | on | `VIDEO_WATCH_MAX_VIDEOS=10`; read budget 32 MiB/file, 128 MiB total; 45-day retention (owner) |
| S15 | `meta-auto-lane.ts` | `TDN_RESEARCH_META_AUTO_ENABLED` | on, unverified | `META_AUTO_MAX_OPENS=5`, `META_AUTO_MAX_BRANDS=2`, `META_AUTO_SPACING_MS=30000`, command timeout 90 s, text cap 1 MiB, HTML ≤4.000.000 chars, stream cap 24 MiB, read budget 8/128 MiB |
| S16 | `tiktok-top-ads-lane.ts` | `TDN_RESEARCH_TIKTOK_TOPADS_ENABLED` | on, unverified | `TIKTOK_TOP_ADS_MAX_OPENS=5`, `SPACING_MS=30000`, timeout 90 s, ≤200 cards/read, field ≤500 chars, keyword ≤120 chars |
| S17 | `google-ads-lane.ts` | `TDN_RESEARCH_GOOGLE_ADS_ENABLED` | on | `GOOGLE_ADS_MAX_BRANDS=3`, `SPACING_MS=2000`, timeout 30 s, ≤8 MiB; owner: ≤3 calls/report |
| S19 | `expanded-search-lane.ts` | `TDN_RESEARCH_EXPANDED_SEARCH_ENABLED` | on | `EXPANDED_SEARCH_MAX_CALLS=3`; P5 plan ≤10 searches (BR-20261008-07) |
| S20 | `search-interest.ts`, `search-trends.ts` | `TDN_RESEARCH_SEARCH_TRENDS_ENABLED` | on | `SEARCH_TRENDS_LIMITS`: maxKeywords 5, maxCallsPerRun 4, geo VN, `today 12-m` |
| S21 | `official-statistics-lane.ts` | `TDN_RESEARCH_OFFICIAL_STATS_ENABLED` | on | `OFFICIAL_STATS_MAX_CALLS=3`, `SPACING_MS=2000`, timeout 60 s, list ≤2 MiB, no retry |
| S22 | `official-statistics-lane.ts` | `TDN_RESEARCH_OFFICIAL_STATS_PROVINCE_ENABLED` (requires S21 flag) | on | shares the 3-call cap; CPI workbook fetched each Market run |
| S23 | `world-bank-lane.ts` | `TDN_RESEARCH_WORLD_BANK_ENABLED` | on | timeout 20 s; `WORLD_BANK_INDICATORS` = NE.CON.PRVT.PC.KD, SP.POP.TOTL; CaptureLog cap = indicators × 2 = 4 calls |
| S24 | `comtrade-lane.ts` | `TDN_RESEARCH_COMTRADE_ENABLED` | on | `COMTRADE_MAX_CALLS=4`, `SPACING_MS=6000`, `RATE_WAIT_MS=65000`, timeout 30 s, ≤8 MiB |
| S25 | `pdf-discovery-lane.ts`; reader `src/modules/analysis/pageindex-documents.ts`, `pageindex-questions.ts` | `TDN_RESEARCH_PDF_DISCOVERY_ENABLED`, `TDN_RESEARCH_PDF_DISCOVERY_MAX_PAGES` (default 60), `TDN_PAGEINDEX_CLOUD_ENABLED`, `TDN_PAGEINDEX_MAX_QUESTIONS_PER_RUN` | OFF (no reader account) | `MAX_FILES=2`, `MAX_SEARCHES=1` (search ordinal 14; downloads ordinal 15), `MAX_REDIRECTS=3`, timeout 60 s, ≤min(capture cap, 20 MB); no retries; DNS-pinned HTTPS; `BRIDGE_BUDGET_LIMIT` → skip; owner-sent files 1–1000 pages |
| Insight coding | `src/api/operator-app.ts` | `TDN_RESEARCH_INSIGHT_CODING_AI_ENABLED` (+ `_MODEL`), `TDN_RESEARCH_TIKTOK_CODING_AI_ENABLED`, `TDN_RESEARCH_SHOPEE_CODING_AI_ENABLED` (+ `_MODEL`) | Insight coding on (which of the three: chưa rõ) | — |

Fixed limitation strings in code (rendered verbatim to the owner): `WORLD_BANK_LIMIT`, `COMTRADE_LIMIT`, `OFFICIAL_STATS_LIMIT`, `OFFICIAL_STATS_PROVINCE_LIMIT`, `SEARCH_ADS_LIMIT` — all say "context only, not a market estimate, never combined with sample sales".

## 5. Data shapes (common-rules, descriptive only)

- `ExactArtifactRef { artifactId, version, sha256, locator }`
- `SourceFileRef { packageId, packageVersion, logicalPath, sha256, mediaType, evidenceFamily, provenance, period }`
- `Period { start, end, timezone, basis }`
- `Observation<T> { state: missing | observed_zero | observed_value, value, unit, precision, source: SourceFileRef + locator }`
- `ClaimRef { claimId, artifact, pointer, scope, numeratorPointer?, denominatorPointer?, limitations[] }`
- `EvidenceRecordRef { sourcePackageDigest, fileVersion, exactRowSpanOrQuoteLocator, availableTimeMetadata, coding/adjudication/provenance }`
- `CaseRef { evidenceRecord, caseId?, episodeId?, context, quoteOrEventDigest }`
- Scopes ALL / WIDE / CORE overlap, never added; UNKNOWN kept in ALL, excluded from WIDE.
- Dedupe only on stable identity; text hash alone never dedupes (L1).
- No shared runtime validator exists for these shapes (gap).

## 6. Reason / error codes worth knowing

- `MARKET_14_RULES_FAILED:<ids>` — thrown by `assertMarket14MachineRules` when any machine-kind rule fails.
- `MARKET_BUSINESS_GATE_FAILED:<ids>` — thrown by `assertMarketBusinessGate`.
- `AGGREGATION_OVERLAP_UNRESOLVED` — proposed in common rules (not confirmed in code).
- `BRIDGE_BUDGET_LIMIT` — S25 skips when the bridge budget is reached.
- Exclusion reasons from L9 are reported in M13 / I17 (code list chưa rõ).

## 7. 14 rules (`auditMarket14(html, trace?, {requireFlint})` → `{rule, ok, kind: machine|evidence, detail}`)

| # | Kind | Check |
|---|---|---|
| 1 | machine | plain glossary (listing, review, export, peer set, giá TB, P25, P75, NSX, H1, ROAS, CPA, AI) |
| 2 | machine | "Phần 1–12", "Phụ lục", "Bảng PL.x"; no visible M01–M13 |
| 3 | machine | no paths, 64-hex hashes, snake/UPPER_SNAKE ids, JSON, UNKNOWN/ALL/WIDE/CORE/Sheet1 |
| 4 | machine | no provider names (G08_PROVIDER_NAME), no "Google" |
| 5 | machine | standalone "Chú thích:" line; no "Ghi chú:" |
| 6 | evidence | revenue / share / average price claims (reviewer) |
| 7 | machine | no cross-platform total (U32); n = sample statement; no n = 0 next to numbers; no market share/size |
| 8 | evidence | findings cite number / figure / table |
| 9 | machine | M12 table 3 rows, option/owner/deadline, "đề xuất, chờ chủ duyệt" |
| 10 | machine (+evidence for licensed/owner cover) | embedded AI base64 JPEG cover with alt; external cover fails |
| 11 | machine | platform icon at each Shopee/TikTok Shop mention, local icon CSS, Flint charts (macro may use svg-fallback), 3 sample charts when product rows exist |
| 12 | machine | platform tables labelled Shopee / TikTok Shop |
| 13 | machine | four neutral source labels: dữ liệu số bán, dữ liệu đánh giá, kết quả tìm kiếm, dữ liệu bình luận |
| 14 | evidence | reviews / comments / 300 |

## 8. Business gate (`auditMarketReportHtml(html, {presentation, partialTotals})`)

Rule IDs: `G08_PROVIDER_NAME`, `U32_NO_CROSS_PLATFORM_TOTAL` (explicit phrase list), `E2_NO_REVENUE_ORDER` ("Thứ tự theo doanh thu", "top 3", non-negated "xếp hạng"/"thị phần"), `SECTIONS_PRESENT` (presentation only, M01–M13), `M12_PROPOSAL_LABEL` (presentation only), `PARTIAL_TOTAL_FORBIDDEN` (from `partialRowTotals`: totals with missingCount>0 not stated as complete), `NO_LEAK`, `SEARCH_INTEREST_NOT_COUNT`, `WORLD_BANK_NOT_ARITHMETIC` (conditional), `PDF_EXCERPT_NOT_MARKET_NUMBER` (conditional), `SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL` (conditional), plus U13 lint results from `lintVisibleReportText` (`src/modules/analysis/report-visible-text-lint.ts`). Provider lists come from `src/modules/analysis/reader-report/lint.ts` (`FORBIDDEN_PROVIDER_NAMES`, `CAPTURED_PROVIDER_NAMES`). The "9-rule gate" named in the brief does not map 1:1 to these IDs — open conflict.

## 9. Rule-code index

- Ultimate §2 rules 1–9; §2.1 L1–L10; §2.2 E1–E15 (E15 ranking: per platform, <3 mentions → "Khác", "Khác" >20% → ≤1 extra round, κ deferred).
- §6.3 review thresholds: ≥50% revenue (80% method C), ≥5 brands, both platforms, ~300/product (max 500), ≥30 text reviews for product comparison (G4 ±18 pts), stars + author ID required, persona ≥5 authors / ≥3 products, "của ngành hàng" ≥3 products of different brands, saturation batches 25 / 2 baseline / stop ≤5% new themes.
- G8: M10 ≤180 days → conditional scenarios only; source test ≥50% relevant and ≥30% candidate customer voice on 50 records.
- Catalog §4 rejected sources: surveys, Similarweb, Semrush, Instagram tools, Comtrade Apify actor, Index Mundi, Internet Live Stats, Statista, population office, CIA Factbook / Gapminder, Ministry of Justice.
- Catalog §6: procedure to add/change a source (see the doc for the exact steps); Status §4: status-update procedure.

## 10. Gap / conflict counts

Plain file Phần 9: 13 gaps ("Chỗ còn hở"), 19 conflicts ("Điểm mâu thuẫn cần chốt"). Additional technical gaps: S02/S05/S07 intake file names and flags not located; per-lane stop-vs-continue semantics not consolidated; L9 exclusion reason-code list not located.
