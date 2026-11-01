---
name: tdn-insight-report
description: Write an Insight report for one stored run through the tdn-insight MCP, from the report frame to the rendered page.
---

# Write an Insight report with tdn-insight

Use this when the `tdn-insight` MCP is registered (see `tools/mcp-insight/README.md`) and a run has a warehouse
(`build_warehouse`). Call the tools in this order.

1. Plan. `report_plan(run_id)` gives the 18 parts, the sources each part may use, the usable count IDs, the ceiling
   of each part and the lines «Những gì báo cáo chưa trả lời được».
2. Counts. `theme_counts`, `keyword_counts` and `portrait_counts` give the numbers and their count IDs. Cite only
   IDs from the latest call; a changed count gets a new ID.
3. Reason links. For a «Tại sao» chain, `find_reason_links(run_id, theme_a, theme_b)` gives the reviews where a
   person checked that the customer joins two themes. Candidates are not evidence. A person reads them on the host
   with `read_reviews` and records the reading; never copy review text into the report.
4. Submit. Write each part 1 to 17 and send it with `submit_section(run_id, part, text, claims)`. Then write each
   insight statement and send it with `submit_statement(run_id, statement, replaces=None)`.
   - Every sentence of a data or synthesis part ends with its claim marker `[^ref]`, or is a heading or a
     «Chưa có dữ liệu …» sentence.
   - A number needs its unit (`đánh giá`, `người viết`, `sản phẩm`, `từ khóa`) and must equal the cited count.
     No percentages, no «người mua», no Market numbers, no conversion rates, no provider names.
   - Set `confidence` at or below the ceiling `confidence_ceiling` gives; set `hypothesis` when it says so.
   - A rejection lists every reason code. Fix the text and send it again; a resend is a new version.
   - A claim count ID (`claim_counts`) may back a sentence. A sentence that ranks claims states, beside its marker,
     «bằng chứng», the platform, `n/N đánh giá` (claim reviews and the platform sample) and the period
     («từ d/m/yyyy đến d/m/yyyy»). A claim number keeps each flag phrase of its row next to it.
5. Render. `render_report(run_id)` writes the page and the totals. Parts not written show «Chưa viết»; a part whose
   counts changed shows «Cần gửi lại» and must be sent again.

Claims (ý con), before step 2 when the report needs them:
- `claim_catalogue_packet` writes the theme's customer words outside the repository; `claims/draft_catalogue.sh`
  drafts the catalogue; send its JSON with `submit_claim_catalogue`. Then `code_claims` (dry run first) and
  `claim_counts`.
- Cross-check: `claim_grading_packet`, then `claims/cross_grade.sh`, then `record_claim_grades`. Until a version is
  `PASSED`, its claim rows are capped at `Yếu`.

Rules:
- `code_reviews` and `code_claims` with `dry_run=False` are paid calls, and so are the runners in `claims/`: each
  needs the owner's OK every time. Use `dry_run=True` to plan.
- Write in the third person. Motives and barriers come only from customer words: công dụng, giá, quy cách, chất
  lượng. A buying reason from reviews says «kể lại».
- No campaign ideas, no advice to competitors, no trial orders.
