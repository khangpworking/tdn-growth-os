# Plan: bring TDN in line with Ultimate v1.11, and show the approved data sources on the source board

Updated: 2026-10-08 · Base: `origin/main` `99b4fe5` · Business source of truth: [Ultimate Method v1.11](../research/ultimate-method/ultimate-method-30-sections.md) · Sources: [Input data sources for 30 sections](../research/ultimate-method/input-data-sources-30-sections.md) v1.7 · Related packages: [research-batch-2-packages.md](research-batch-2-packages.md)

This file is a plan with checklists. It does not assign work to agents; the owner splits it. When an item is split into a package, keep its ID (`U-..`, `B-..`) so the handoff can report it.

## Tóm tắt (cho chủ shop)

**Phần A: đưa 30 section theo Ultimate v1.11.** Mình rà code trên main ngày 08/10. Kết quả:

- **Có 2 luồng báo cáo Thị trường:**
  - **bản đọc:** báo cáo chủ đọc;
  - **bản nháp tự động:** bản có kiểm soát nguồn.

  Báo cáo Insight mới có bản nháp, chưa có bản đọc. Các file recipe phương pháp (A40) trong `docs/` không được code đọc. Muốn đổi cách làm của một section thì phải sửa code.
- **Code đang làm ngược quy tắc ở 9 chỗ:**
  1. mọi số đếm Insight phải chờ chủ duyệt bộ mã (trái E11, L3);
  2. chủ phải tự chọn đối thủ (trái E11);
  3. AI bị cấm dựng chân dung (trái E4);
  4. I01 bắt chủ viết câu hỏi (trái E7);
  5. I11 chờ chủ định nghĩa nhóm (trái E11);
  6. Kết luận chính của báo cáo Thị trường dùng "lớn nhất / nhiều nhất" (trái quy tắc 5);
  7. Phần 12 chọn 3 phương án theo doanh thu và xếp thứ tự (trái E2, E11);
  8. Phần 5 ghi "không đo nhu cầu" (trái E10);
  9. Phần 8 trộn loại giá và đoán quy cách từ tiêu đề (trái E9, M08).
- **Code còn thiếu hẳn:**
  - đếm người viết đã mã hoá (L2) và nhiều sàn đặt cạnh nhau (L5); kho review hiện chỉ có Shopee;
  - lọc nghĩa từ khoá (L9) và bình luận video là lời khách (L10);
  - chân dung người bán nhắm tới (E5);
  - số tham khảo ROAS/CPA kèm câu miễn trừ (E1);
  - kiểm chéo bộ mã bằng model thứ hai (κ);
  - số liệu Cục Thống kê và World Bank (E12, E13).
- **Thứ tự làm:** merge P1 (#143) và P2 (#140) trước, vì hai PR này sửa đúng các file sẽ đụng tới. Sau đó làm theo 4 đợt:
  - **A1:** gỡ 9 chỗ đang ngược quy tắc;
  - **A2:** các bộ kiểm tra dùng chung (nhãn bản nháp, kiểm chéo κ, lọc từ khoá, cấm so sánh bậc nhất);
  - **A3:** phương pháp mới (bảng giá theo đơn vị chuẩn, Kết luận chính dạng Nhận định / Bằng chứng / Trạng thái, bản đọc Insight, chân dung);
  - **A4:** các phần chờ nguồn dữ liệu mới. Phần này phần lớn đã có trong gói P5, P7, P9, P10, plan chỉ bổ sung chỗ còn thiếu.
- **Nghiệm thu:** chạy lại ba case (thạch dừa, bình giữ nhiệt, quạt cầm tay) rồi đối chiếu từng quy tắc.

**Phần B: thêm nguồn đã duyệt lên màn hình "Nguồn dữ liệu".**

- **Hiện có 5 thẻ:** Kalodata, SerpApi, Apify review Shopee, Metric, PageIndex.
- **Thêm 8 thẻ:**
  - file video Kalodata;
  - bình luận TikTok;
  - đọc nội dung video;
  - bài mạng xã hội công khai;
  - thư viện quảng cáo Meta;
  - Cục Thống kê;
  - Ngân hàng Thế giới;
  - Google Trends (tách dòng trong thẻ SerpApi).
- **Thông tin trên mỗi thẻ:** mã nguồn (S..), hạng tin cậy, nhóm nguồn, tên dùng trong báo cáo, trần chi tiền.
- **Nguồn chưa có bộ thu:** thẻ ghi "Chưa có bộ thu (gói P..)", tới khi gói đó merge.
- **Màn hình vẫn chỉ đọc:** không gọi thử nguồn, không lộ khoá.

## Ground rules for every item

- The Ultimate file wins over recipes, configs and code (Ultimate §1). Change code to match it, never the reverse.
- Keep the global definition of done G-01…G-13 from [research-batch-2-packages.md](research-batch-2-packages.md#global-definition-of-done-every-package).
- Stored report versions read back byte-identical (G-10). A changed renderer bumps its `rendererVersion`; old stored reports are not re-rendered.
- No live provider or model call in tests. Live paid runs still follow E8: announce the list and the estimated cost first.
- Every new numeric threshold needs a row in Ultimate Appendix G8 (business) or the "Numeric caps and why" table (engineering), in the same commit.
- When an item merges, update the **TDN** column of the matching CHANGELOG rows and the TDN column of README §4.

## Current state (audit of `99b4fe5`, 2026-10-08)

Two independent read-only audits, spot-checked. P1 (#143) and P2 (#140) are open and not on main; they touch `reports.ts` and `reader-report/market-template.ts`.

Where things live:
- **Market reader report:**
  - `src/modules/analysis/reader-report/market-template.ts`, which holds all the wording for M01–M13;
  - `scope-metrics.ts`, `classify.ts`, `build.ts`, `lint.ts`.
- **Market auto draft:**
  - `src/modules/analysis/research-automation/reports.ts`, where the sections are dispatched in code;
  - method modules: `descriptive-market-methods.ts`, `quote-methods.ts`, `generic-quote-unit.ts`, `metric-method-bridge.ts`, `m01-evidence-inventory.ts`, `decision-packets.ts`, `market-scope-report.ts`, `bounded-analysis-gates.ts`.
- **Insight:**
  - coding: `research-automation/insight-coding.ts`, `selected-insight-projection.ts`, `literal-*`, `insight-model-execution.ts`;
  - sections: `located-insight-methods.ts` (I01, I02, I04–I09), `insight-corpus-counts.ts` (I10, I13), `bounded-analysis-gates.ts` (I11, I12, I16), `i14-*`, `decision-synthesis-input.ts` (I15);
  - rendering: `report-located-insight-pages.ts`.
- **Configs:** only `docs/research/report-section-catalog-v1.json` is read at runtime, and only for titles and method ids. `section-methods-v1/*` is never read by code.

| Rule | State | Evidence | Gap |
|---|---|---|---|
| R1 missing ≠ 0 | Partial | draft keeps missing/zero apart; reader input schema requires numbers; `market-template.ts:119` writes 0 when no start date is known | U-30 |
| R2 record identity | Conflicts | `market-template.ts:124-128` counts "same brand" across Shopee and TikTok by lowercased name | U-31 |
| R3 aggregation | Partial | draft blocks unproven sums; reader adds two platforms (`build.ts:96-104`) | U-32 |
| R5 / L4 no ranking | Conflicts | M01 "nhóm lớn nhất", "Gian hàng lớn nhất", "nhiều doanh thu nhất" (`market-template.ts:161-163`); lint F5 checks only "xếp hạng"/"thị phần" | U-06, U-13 |
| E1 ROAS/CPA | Missing | no ROAS/CPA rendering; P4 computes `adShare` from ad spend (must not render) | U-33 |
| E2 M12 / E11 no priority | Conflicts | top 3 cells by revenue, "Thứ tự theo doanh thu" (`market-template.ts:291,307`); draft owner/deadline UNSET | U-07 |
| E3 M01 | Partial | 5 key points with pointers; no Nhận định / Bằng chứng / Trạng thái | U-29 |
| E9 / M08 unit price | Conflicts | reader mixes average price types and reads size from titles; draft does per 100 g for one quote only | U-34 |
| E10 M05 | Conflicts | "Nguồn không đo nhu cầu trực tiếp" (`market-template.ts:229-231`); draft limitation code says the same | U-08 |
| E11 peer set | Conflicts | owner picks peers (`ScopeConfirm.tsx`), ≥2 explicit peers required (`reports.ts:320-323`) | U-01 |
| E12 / E13 | Missing | no code | P10, P8-10, U-24 |
| M09 dated search | Partial | publication and event dates kept apart; query builder not wired | P5-07…09 |
| M10 | Done (blocked by design) | gate and reopen condition | — |
| M13 / I17 | Partial | provenance exists; no source tier, no L9 exclusion count | U-27 |
| L1 duplicate text | Done | identity = sha + locator | note text U-17 |
| L2 author counts | Missing | no author id in the review corpus | U-18 |
| L3 draft vs release | Conflicts | AI codes excluded from all counts until an owner receipt (`insight-corpus-counts.ts:63-65`) | U-03, U-13 |
| L5 platforms | Missing | corpus schema `platform: shopee` const | U-19 |
| L6 stars | Partial | star states kept; no distribution rendered | U-14 |
| L7 seller voice | Missing (Insight) | no seller-voice layer | U-15 |
| L8 no purchase | Partial | prompts ban budgets/owners, not trial purchases | U-16 |
| L9 keyword filter | Missing | — | U-12 |
| L10 video comments | Missing | waits on P9 | P9-05, U-19 |
| E4 personas | Conflicts | "Do not infer … personas" (`insight-model-execution.ts:41`); no persona code | U-05, U-20 |
| E5 seller persona | Missing | — | U-21 |
| E6 Insight conclusion + I15 | Conflicts / Missing | I15 prompt forbids owner and deadline, up to 20 candidates (`decision-synthesis-input.ts:98,126`); no Insight key-findings block | U-07, U-28 |
| E7 working question | Conflicts | `I01_OWNER_QUESTION_REQUIRED` (`located-insight-methods.ts:193`), `OWNER_QUESTION_UNSET` in decision packets and M01 inventory | U-02 |
| E8 / §6.3 review expansion | Partial / Conflicts | ≤5 owner-picked listings (`shopee-collection.schema.json:34`), ≤500 reviews | U-22 |
| E11 codebook cross-check | Conflicts | owner adopt → propose → accept is required; no second model, no κ | U-03, U-11 |
| E11 I11 groups | Conflicts | `I11_GROUP_POLICY_MISSING`, publication not authorized (`bounded-analysis-gates.ts:179-183`) | U-04 |

---

## Phần A. 30 section theo Ultimate v1.11

### A0. Preconditions

- [ ] U-00 Merge P1 (#143) and P2 (#140), or close them on purpose. Both are mergeable today. Everything in A1–A3 that edits `reports.ts` or `market-template.ts` starts after this, from fresh `main`.
- [ ] U-00b Add a pointer at the top of `docs/research/section-methods-v1/index.md` and of the recipes that conflict (I02/D06 personas, I01 owner question, I11 group policy, M07 peers, M12 owner choice): "Superseded by Ultimate v1.11 where they differ" with the rule ID. Docs only.

### A1. Remove the conflicts (code does what the rules forbid)

- [ ] U-01 **E11 peer set by default.**
  - Build the peer set from sales data in the frozen sample: same product group, same period. Add brands by in-sample revenue until they cover ≥50% of the group's revenue. Use the shop when the brand is unknown.
  - Freeze the rule before any number is read, and store the rule and the resulting list with the run. Brand names carry "theo tiêu đề người bán".
  - Owner-picked peers become optional additions, shown as a separate list. Remove the "≥2 explicit peers" requirement in `reports.ts:320-323`, the "peers are never implied" invariant in `model.ts:40`, and `peerSet: null` in `descriptive-method-bridge.ts:232`.
  - Reader M07 uses the default set instead of "nhóm đối thủ chưa chốt".
  - Tests: set reproducibility, a brand-unknown fallback, owner additions kept apart, old stored runs unchanged.
- [ ] U-02 **E7 working question.**
  - When the brief has no question, I01 shows a "câu hỏi làm việc do AI đề xuất, chờ chủ duyệt" plus the list of fields the owner may add (`decisionToInform`, `audience`, `scope`, `knownConstraints`).
  - Replace the blockers `I01_OWNER_QUESTION_REQUIRED` and `OWNER_QUESTION_UNSET` (`located-insight-methods.ts`, `decision-packets.ts:112`, `m01-evidence-inventory.ts:70`, `decision-synthesis-input.ts:112`) with that state.
  - The working question never filters or selects evidence; add a test that evidence sets are identical with and without it.
- [ ] U-03 **L3 + E11: counts no longer wait for an owner receipt.**
  - Draft counts are computed from AI-proposed codes and rendered with "đề xuất, chờ chủ duyệt" **in the same sentence as the number**, including Kết luận chính and top tiles.
  - Release counts need the U-11 cross-check, with the codebook version stated, not an owner receipt.
  - The owner adopt/accept flow stays available as an optional override and is recorded, but nothing waits on it.
  - Files: `insight-corpus-counts.ts:63-65,111`, `selected-insight-projection.ts`, `located-insight-methods.ts:176`, `report-located-insight-pages.ts:77,196`.
- [ ] U-04 **E11 default I11 groups.**
  - Groups by platform, plus retail vs wholesale only when the record itself says so (Ultimate I11 row in E11). Groups are disjoint.
  - Descriptive rates are shown only where the denominators are compatible and each group has ≥30 text records (the §6.3 comparison condition); otherwise counts only.
  - Remove `I11_GROUP_POLICY_MISSING` and `I11_PUBLICATION_NOT_AUTHORIZED` as hard blocks (`bounded-analysis-gates.ts:179-183`). Inference stays off.
- [ ] U-05 **E4: lift the persona ban** in the coding prompt (`insight-model-execution.ts:41`). Keep "no people counts" until L2 data exists (U-18). The persona builder itself is U-20.
- [ ] U-06 **Rule 5 / L4 in Market M01.** Rewrite the M01 key points without superlatives ("lớn nhất", "nhiều … nhất"). State each group with its share side by side, with the figure pointer. Same for `market-template.ts:253`.
- [ ] U-07 **E2, E6, E11: no ordering, proposed owner and deadline.**
  - Market M11/M12: stop picking "top 3 cells by revenue" and remove "Thứ tự theo doanh thu" (`market-template.ts:291,307`).
  - Up to 3 options, each with an immediate task, a proposed owner and a proposed deadline, all labelled "đề xuất, chờ chủ duyệt". Any order is stated as dependency order only (L4).
  - Draft packets: owner and deadline become AI-proposed with the label instead of UNSET (`decision-packets.ts:53-62`).
  - Insight I15: allow a proposed owner and deadline and cap the candidates at 3 (`decision-synthesis-input.ts:98,126`). Owner options and AI candidates stay in separate lists.
- [ ] U-08 **E10 in M05.**
  - Replace "Nguồn không đo nhu cầu trực tiếp" and the `M05_LITERAL_SOURCE_MEASURES_NOT_DEMAND_OR_MARKET_SIZE` limitation with the E10 wording "nhu cầu, đo bằng doanh số (ước tính) trong mẫu", with period, source, per-platform split (L5) and the E1-style disclaimer for estimates.
  - Search interest stays a separate "mức quan tâm tìm kiếm" line, never mixed with sales.
  - Still forbidden: market size outside the sample, unmet demand, forecasts, buyer counts.

### A2. Shared checks used by many sections

- [ ] U-11 **E11 codebook cross-check by a second model (G2, G7).**
  - An independent model re-codes every record when there are ≤200, else a random 200, with a stored seed. It does not see the first model's codes.
  - Compute Cohen's κ per code family. If κ ≥ 0.6, label the counts "phân loại do AI, đã kiểm chéo". If κ < 0.6, label them "độ tin cậy thấp" and keep them out of Kết luận chính.
  - List the records where the two models disagree in the appendix.
  - Store the model ids, seed, κ and sample with the codebook version.
  - Model calls go through the existing insight model client. Tests use fakes and a hand-computed κ fixture.
  - Optional: the same check for the reader's profile classification (`classify.ts`, Market R8).
- [ ] U-12 **L9 keyword meaning filter (shared module).**
  - Each category has a versioned keyword list and exclusion list stored as data. The AI drafts them from product names in sales data (E11); the scope include/exclude terms seed them.
  - Matching keeps Vietnamese diacritics. Text without diacritics is resolved from the record's own context or marked "chưa rõ có đúng sản phẩm không".
  - Excluded records are counted with a reason and shown in M13/I17. Unclear records stay out of the main counts.
  - P5, P7 and P9 call this module (G-13).
- [ ] U-13 **Report lint for rule 5/L4 and L3, both lanes and Insight.**
  - Flag superlatives as findings: "nhất" forms, "hàng đầu", "tốt nhất", "rẻ nhất". Verbatim customer quotes and section titles are allowed.
  - Flag "làm ngay… tiếp theo…" ordering without a dependency note.
  - Flag a number from unreviewed classification without the L3 label in the same sentence.
  - Extend `reader-report/lint.ts` (F5) and add the same checks to the auto-draft visible-text checks from P1.
- [ ] U-14 **L6 star distribution in I05:** a separate distribution table. A review without text is "chưa biết". When the source has no star field, write "nguồn không có số sao", never 0.
- [ ] U-15 **L7 seller-voice layer.**
  - Anything inferred from titles, descriptions, videos or ads is written "người bán nhắm tới…" or "người bán định vị…".
  - In I07, I08 and I13 it sits beside customer reasons and is not merged into them. Seller-raised rebuttals are kept out of customer barriers (I08).
- [ ] U-16 **L8 no purchases:** prompt and lint bans on trial orders or purchase suggestions in M12, I15 and I16. Quality is judged only from public sources and owner data.
- [ ] U-17 **L1 note:** identical text at two locators gets the note "trùng nguyên văn, có thể cùng một người"; both records are still counted.

### A3. New or changed methods

- [ ] U-29 **E3 Market Kết luận chính:** 4–6 findings, each as `Nhận định / Bằng chứng / Trạng thái`, with the evidence pointer (figure, table or number) and the scope (in sample, period, product group). No ordering by importance. A finding without evidence is softened or dropped.
- [ ] U-28 **Insight reader report and E6.**
  - Add an Insight template beside `reader-report/market-template.ts`, with the same presentation standard.
  - Insight Kết luận chính follows E3 + L3 + L4. Phần 15 (I15) has at most 3 proposals per U-07.
  - Sections I01–I17 render from the existing method outputs; nothing new is computed in the template.
  - Lint, citations and the publish gate are shared with Market.
- [ ] U-34 **M08 unit price by category, E9.**
  - The unit table follows Ultimate M08: mass (net weight, plus drained weight when the page shows it), volume, count, durable goods by size group, combos.
  - Quantity comes from the listing page or spec (S04), never guessed from the title. A missing quantity stays missing.
  - Side-by-side and sort only when the unit, price type and period all match; label "sắp xếp", never "rẻ nhất / tốt nhất".
  - Remove the title-size benchmark (`classify.ts:143-150`, `scope-metrics.ts:94-114`). Stop mixing average price (revenue ÷ units) with listed prices.
- [ ] U-33 **E1 advertising reference numbers.**
  - Render ROAS and CPA as estimated reference numbers: period, object (product, shop or video), and the mandatory disclaimer.
  - Ad Spend and `adShare` stay out of reports until the source field is confirmed. Add a guard test.
  - Still forbidden: channel A better than B, profit or "có lãi" from ROAS/CPA, mixing ad numbers with sales numbers as if from one source.
- [ ] U-27 **M13 / I17 source appendix:**
  - each source used, with its registry ID and tier (A–D) and its "tên trong báo cáo";
  - L9 exclusion counts;
  - the L10 source type ("bình luận dưới video review" / "bình luận dưới video bán hàng");
  - official-statistics attribution (E12, E13).
- [ ] U-30 **R1 in the reader:** an unknown value is never written as 0. Fix `coh.nShare` (`market-template.ts:119`) and allow missing values in the reader input where the source can lack them.
- [ ] U-31 **R2:** remove the cross-platform "same brand" count (`market-template.ts:124-128`). Show brand names per platform side by side; any match is "tên giống nhau theo tiêu đề, chưa xác minh".
- [ ] U-32 **R3:** a two-platform total is allowed only when both platforms come from the same export, period and unit, and the label says "cộng hai sàn trong mẫu". Otherwise show per platform only (L5). Add a test for each case.

### A4. Items that need new data (most are already packaged)

- [ ] U-18 **L2 author counts.** Check whether the Shopee review collector returns a reviewer id.
  - If yes: hash it with a private salt at intake and count authors per platform only.
  - If no: record "nguồn không có mã người viết", and E4 uses the "≥5 distinct contents, chưa xác minh là 5 người" fallback.
  - Comments from P9 already carry hashed ids.
- [ ] U-19 **L5 + L10 multi-platform corpus.**
  - Allow platforms other than Shopee in the review corpus (`research-review-corpus.schema.json` `platform` const), starting with TikTok comments from P9.
  - Each platform gets its own column; no cross-platform sums, no person merges.
  - Comments under review videos and seller videos count as customer voice, with their source type (L10). Creator and brand accounts are excluded.
- [ ] U-20 **E4 personas from reviews and comments**, not only social posts (P7-08 covers social).
  - ≥3 evidence cards, ≥5 authors (or the U-18 fallback), every attribute with a quote, unquoted attributes dropped, no inferred demographics.
  - The label "Chân dung do AI tổng hợp từ lời khách thật, không phải một khách hàng có thật", and the size as "x/y bản ghi trong mẫu".
  - Use one shared builder with P7.
- [ ] U-21 **E5 seller-targeted persona layer.**
  - Four checks, each computed by methods A/B/C where they apply, and the report states which methods passed.
  - Signals come from ≥2 platforms. Show the n/N match rate beside the owner's 70% as a hypothesis, plus counter-evidence.
  - Check 3 shows the ad-age reference markers 17 days, 3 weeks, 30 days and 60 days (G6); passing still needs ≥30 days or method B.
  - Inputs: P4 video and creator tables (merged), P9 video reading for the targeted group, Meta Ad Library start dates (S15) entered manually until a collector exists. The codebook goes through U-11.
  - Rendered in I02 (separate from E4) and I13.
- [ ] U-22 **E8 and §6.3 review expansion.**
  - Replace the "≤5 owner-picked listings" selection with coverage-based selection: products that together reach ≥50% of core revenue (method A) or ≥80% (method C), ≥5 brands, both platforms when a collector exists.
  - Collect about 300 reviews per product, at most 500. Stop per product by method A or by method B saturation (batches of 25, two base batches, ≤5% new codes).
  - Require ≥30 text reviews before comparing products. The report states which stopping method was used.
  - Each paid run is announced with the list and the cost estimate (E8).
  - Contract change in `shopee-collection.schema.json`.
- [ ] U-24 **E12 / E13** are delivered by P10 (intake, World Bank P10-12) and P8-10 (display). Add a check that the citation text and the "no arithmetic with sample numbers" guard appear in every section listed in E12.
- [ ] U-25 **M09** is delivered by P5-07…P5-09; **L10 collection** by P9-05. No extra item.

### A5. Acceptance and records

- [ ] U-40 Re-run the three acceptance cases (thạch dừa, bình giữ nhiệt, quạt cầm tay) on a staging copy (synthetic or approved data only; paid calls announced first). For each section, record pass/fail against its Ultimate rules in a new `docs/research/ultimate-method/tdn-acceptance-<date>.md`.
- [ ] U-41 Update the TDN column in README §4 and in every CHANGELOG row that this work closes (`Đã đồng bộ (PR …)`).

---

## Phần B. Màn hình "Nguồn dữ liệu"

### B0. Current state

- UI: `frontend/src/research-automation/SourceStatusBoard.tsx`.
- Server: `src/modules/analysis/research-automation/source-status.ts`.
- Contract: `contracts/api/research-automation-source-status-api.schema.json`.
- Route: `GET /api/workspaces/:id/research-automation/source-status`.
- Test: `tests/integration/research-automation-source-status.test.ts`.
- The source id is a closed enum (`KALODATA`, `SERPAPI`, `APIFY_SHOPEE`, `METRIC`, `PAGEINDEX`). Activity is read only for `kalodata`, `serpapi` and `apify-shopee` captures and usage, plus Metric uploads (`service.ts:994`).
- The board is read-only by design: it calls no provider and never returns a key value. Keep that.

### B1. Sources to show

Only sources that are in use or approved in the source registry. Sources marked "không đạt", "không dùng được" or only "đề xuất" stay off the board: S03, S06, S09, S11, S16, S17, S18, S24, S27. S12 (owner shop data) is added when an upload path exists.

| Card | Registry IDs | Group | How data arrives | Paid | Built by | State until built |
|---|---|---|---|---|---|---|
| Metric | S01, S04 | Bán hàng và thị trường | File upload; web snapshot | No (subscription) | done; automation in P6 | — |
| Kalodata API | S02 | Bán hàng và thị trường | API | Yes | done | — |
| Kalodata video and creator file | S02 | Bán hàng và thị trường | File upload | No (subscription) | P4 (merged) | — |
| Apify: Shopee reviews | S05 | Lời khách | API with a charge cap | Yes | done | — |
| Apify: TikTok comments | S07 | Lời khách | API, cap $3 per test run (owner, 08/10) | Yes | P9 | Chưa có bộ thu (gói P9) |
| Social public posts (Facebook, X) | S08, S10 | Lời khách (secondary) | Bundle from the operator machine | No | P7 | Chưa có bộ thu (gói P7) |
| Video content reading | S14 | Lời người bán | JSON from the operator machine | No | P9 | Chưa có bộ thu (gói P9) |
| Meta Ad Library | S15 | Lời người bán, quảng cáo | Manual entry for now | No | no package yet | Chưa có bộ thu |
| SerpApi: expanded search | S19 (S13, S26) | Thị trường | API | Yes | P5 | existing card; per-operation rows |
| SerpApi: Google Trends | S20 | Thị trường | API | Yes | P5 | row inside the SerpApi card |
| Official statistics (Cục Thống kê) | S21 | Số liệu vĩ mô | File upload + fetch script | No | P10 | Chưa có bộ thu (gói P10) |
| World Bank | S23 | Số liệu vĩ mô | Open API, no key | No | P10-12 | Chưa có bộ thu (gói P10) |
| PageIndex (PDF) | S22, S25 | Tài liệu | Automatic | Yes | P3 (merged) | — |

### B2. Checklist

- [ ] B-01 **Contract (additive).**
  - New source ids: `KALODATA_VIDEO_FILE`, `APIFY_TIKTOK_COMMENTS`, `SOCIAL_BUNDLE`, `VIDEO_READING`, `META_AD_LIBRARY`, `OFFICIAL_STATS`, `WORLD_BANK`.
  - New state `NOT_BUILT`, plus an optional `pendingPackage`.
  - Optional per-entry fields:
    - `registryIds` (e.g. `["S07"]`);
    - `tier` (`A`–`D`);
    - `group` (`SALES_MARKET`, `CUSTOMER_VOICE`, `SELLER_VOICE`, `MACRO`, `DOCUMENTS`);
    - `reportName` (the "tên trong báo cáo");
    - `spendCapUsd` (number or null);
    - `operations[]` (operation, `lastUsageAt`, count) for multi-operation providers such as SerpApi search and Trends.
  - Bump `contractVersion` if the generated validators require it. Regenerate with `npm run contracts:generate`.
- [ ] B-02 **Server build.**
  - `buildResearchAutomationSourceStatus` returns every card in B1.
  - Each card's built flag comes from the module being present on this build. Until it is, the card is `NOT_BUILT` with `pendingPackage`.
  - Registry IDs, tier, group and report name come from one constant that mirrors the registry. A test asserts each ID exists in `input-data-sources-30-sections.md`.
- [ ] B-03 **Activity readers.**
  - Extend `readSourceActivity` with:
    - Kalodata video file uploads;
    - TikTok comment captures and usage;
    - video-reading uploads;
    - social bundles;
    - official-statistics and World Bank rows;
    - SerpApi per operation (search vs Trends).
  - Each package that adds a source adds its reader and flips its card from `NOT_BUILT`, in the same PR.
  - Missing history stays `null` or 0 per the existing contract rules, never invented.
- [ ] B-04 **Charge caps.**
  - A separate cap per paid collection: `TDN_RESEARCH_TIKTOK_COMMENTS_MAX_CHARGE_USD`, owner approved 3 for test runs on 08/10.
  - It is independent of the Shopee cap. The card shows the cap and says "Đã có token nhưng thiếu hạn mức chi tối đa" when the cap is missing. A token alone never starts a collection.
- [ ] B-05 **Frontend.**
  - Add `SOURCE_COPY` entries, with group headings in the order of B1.
  - Show the registry IDs, tier, report name, cap line ("Trần chi: $3 mỗi lượt") and per-operation rows for SerpApi.
  - `NOT_BUILT` copy: "Chưa có bộ thu (gói P9)". Free sources say "Không tốn phí"; World Bank says "Không cần khoá".
  - The board may name providers; it is the internal board (G-08).
- [ ] B-06 **Tests.**
  - Contract validation for every card and state.
  - `NOT_BUILT` → built transition.
  - Cap shown or missing.
  - No credential value in any response.
  - Demo mode unchanged.
  - Executor disabled → every card `EXECUTOR_DISABLED`.
  - Frontend tests for the new copy and grouping.
- [ ] B-07 **Keep the board in sync with the registry.** When a source's status changes in `input-data-sources-30-sections.md` (e.g. a test turns it "dùng được"), update the B-02 constant in the same PR, and say so in the test log entry.

---

## File hotspots (for splitting the work)

Items that edit the same file should not run in parallel.

| File | Items |
|---|---|
| `reader-report/market-template.ts` (+ `lint.ts`, `scope-metrics.ts`, `classify.ts`) | U-06, U-07 (Market), U-08, U-13, U-29, U-30, U-31, U-32, U-34; after P2 |
| `research-automation/reports.ts` | U-01, U-29, U-33; after P1 |
| `research-automation/insight-coding.ts`, `selected-insight-projection.ts`, `insight-corpus-counts.ts` | U-03, U-11 |
| `located-insight-methods.ts`, `decision-packets.ts`, `m01-evidence-inventory.ts`, `decision-synthesis-input.ts` | U-02, U-07 (draft, I15) |
| `bounded-analysis-gates.ts` | U-04 |
| `insight-model-execution.ts` | U-05, U-16 |
| `ScopeConfirm.tsx`, `model.ts`, `descriptive-method-bridge.ts` | U-01 |
| `contracts/foundation/shopee-collection.schema.json`, review corpus schema | U-19, U-22 |
| `source-status.ts`, its contract, `SourceStatusBoard.tsx`, `service.ts` (`readSourceActivity`) | B-01…B-06; P3 also touched this contract (merged) |
| `service.ts` collection step | P5 only (existing rule) |

Suggested order:
1. U-00.
2. A1 in three groups that do not overlap:
   - Market reader: U-06, U-07 (Market), U-08;
   - draft and Insight: U-01, U-02, U-04, U-05;
   - counts: U-03.
3. A2: U-11, U-12 and U-13 can run in parallel.
4. B can run in parallel with A at any time.
5. A3 next, then A4 as P5, P7, P9 and P10 land.
6. A5 last.

## Owner decisions

None needed to start. Already decided and recorded:
- the P9 cap of $3 per test run;
- L10 comments as customer voice;
- E11 defaults;
- no Facebook groups.

Live paid runs and every merge still need the owner, as before.
