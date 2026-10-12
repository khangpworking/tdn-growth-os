# Độ phủ kiểm tra — Báo cáo Insight (Kết luận chính, I01–I17)

Phạm vi: các quy tắc áp cho Insight trong `docs/research/ultimate-method/ultimate-method-30-sections.md` (§2, §2.1 L1–L10, §2.2 E4–E15, §3, §5, §6.3), nguồn theo `docs/research/ultimate-method/input-data-sources-30-sections.md`.
Cách làm: chỉ đọc code, không chạy gì. Nhánh `wp/onto3-209-coverage`. Shape ontology trong `ontology/shapes/*.ttl` đều `ex:status "proposed"`, chỉ dùng dữ liệu tổng hợp và **chưa nối vào ứng dụng**.

## Tóm tắt cho chủ (ngôn ngữ thường)

- Đã rà 54 quy tắc của báo cáo Insight. Có 15 quy tắc máy tự kiểm, 33 quy tắc chỉ kiểm một phần, 3 quy tắc mới nằm trên giấy và 3 quy tắc đang bị chặn vì thiếu điều kiện.
- Những phần chắc nhất:
  - chân dung khách cần đủ 3 thẻ bằng chứng, 5 người viết và câu trích nguyên văn;
  - mục "Định hướng chiến lược" có tối đa 3 đề xuất, mỗi đề xuất có người phụ trách và hạn chót;
  - máy chặn mọi đề xuất "đi mua hàng";
  - hành trình và khoảng trống nhu cầu chỉ được tính khi nằm trong cùng một bản ghi.
- Mọi con số do AI đưa ra đều mang nhãn "đề xuất, chờ chủ duyệt". Hiện chưa có bước để chủ duyệt bộ mã rồi phát hành, nên báo cáo Insight luôn ở dạng nháp. Như vậy là an toàn, nhưng chưa hoàn tất.
- Ba lỗ hổng lớn nhất:
  - lớp "người bán nhắm tới" (E5) chưa có code;
  - phần Kết luận chính chưa bắt buộc nêu giới hạn của mẫu ở điểm đầu tiên;
  - bình luận TikTok đã được lọc kỹ nhưng chưa được đưa vào báo cáo Insight.
- Nhiều kiểm tra về câu chữ chỉ dò từ khóa (ví dụ "nhất", "thị phần", "tổng hai sàn"), nên cách viết khác có thể lọt qua.
- Tiêu chí đủ mẫu thì kiểm được phần số lượng (300, tối đa 500, ít nhất 30 đánh giá có chữ). Hai tiêu chí phủ 50% doanh thu và điểm bão hòa thì đang bị chặn.

Ký hiệu đường dẫn trong bảng (tính từ gốc repo):
- `RA/` = `src/modules/analysis/research-automation/`
- `AN/` = `src/modules/analysis/`
- `RR/` = `src/modules/analysis/reader-report/`
- `COL/` = `src/platform/collectors/`

Trạng thái gồm: `Đã kiểm tự động`, `Kiểm một phần` (có ghi phần còn thiếu), `Chỉ có trong tài liệu`, `Không áp dụng/BLOCKED`.

## Bảng độ phủ

| Section | Quy tắc | Nguồn dữ liệu | Kiểm bằng code | Kiểm bằng ontology | Trạng thái |
|---|---|---|---|---|---|
| Kết luận chính | §5 Kết luận + E6 (E3/L3/L4): 4–6 phát hiện, mỗi điểm có phạm vi và nhãn | Tổng hợp | `RR/insight-projection.ts:projectRetainedInsightFindings` (tối đa 6, câu phạm vi "đơn vị đếm là bản ghi", nhãn "Đề xuất, chờ chủ duyệt"); `RR/lint.ts:lint` (kiểm cấu trúc có "Kết luận chính") | — | Kiểm một phần: chưa ép tối thiểu 4 điểm; phát hiện chỉ lấy từ số đếm của từng họ I02–I09 |
| Kết luận chính | §5 Kết luận: mẫu hẹp thì giới hạn là điểm đầu; không suy rộng từ 1 sản phẩm | Tổng hợp | — (luật ≥3 sản phẩm chỉ có ở chân dung, không có ở kết luận) | — | Chỉ có trong tài liệu |
| I01 | §5 I01: trường chủ (`questionText`, `decisionToInform`, đối tượng, `scope`, `knownConstraints`), thiếu thì ghi UNSET | — | `AN/located-insight-methods.ts:businessQuestion` (`I01_*_UNSET`, `OWNER_FIELD_STATE_MISMATCH`). Ghi chú: code dùng `intendedAudience` | — | Đã kiểm tự động |
| I01 | §2.2 E7: câu hỏi làm việc do AI đề xuất, có nhãn, kèm danh sách trường chủ còn thiếu | — | `AN/located-insight-methods.ts:businessQuestion` (`WORKING_QUESTION_LABEL`, `AI_PROPOSED_AWAITING_OWNER`); `RA/decision-packets.ts` (`WORKING_QUESTION_AI_PROPOSED_AWAITING_OWNER`); test `tests/unit/located-insight-methods.test.ts` | — | Kiểm một phần: test chỉ phủ trường hợp AI có đề xuất câu hỏi. Khi không có đề xuất (`workingQuestionProposal` rỗng), `businessQuestion` vẫn ghi `AI_PROPOSED_AWAITING_OWNER` với câu hỏi rỗng (`text: null`), tức là gắn nhãn "AI đề xuất" cho một câu hỏi không có. Để sau: xem mục 11 ở "Lỗ hổng ưu tiên" |
| I02 | §5 I02: đếm bản ghi, không đếm người | S05, S07 | `AN/located-insight-methods.ts:summary` (`locatedRecordCount`); `RR/insight-projection.ts:projectRetainedInsightFindings` (câu phạm vi) | — | Đã kiểm tự động |
| I02 | §2.2 E4: chân dung cần ≥3 thẻ, ≥5 người viết (hoặc ≥5 nội dung khác nhau kèm "chưa xác minh là 5 người"), mỗi thuộc tính có trích dẫn, nhãn AI và "x/y bản ghi trong mẫu" | S05 (S07 chưa hỗ trợ) | `RA/insight-persona-evidence.ts:readPrivatePersonaEvidence` (`persona`, `card`, `authorMinimum`); `RA/insight-persona-projection.ts:projectPersonaResponse` (bỏ thuộc tính không nguyên văn, cần ≥3 chân dung); `RA/insight-persona-report.ts:insightPersonaSection`; test `insight-persona-report.test.ts` | `ex:E4Shape` (E4.ttl) | Kiểm một phần: chỉ có cho Shopee S05; với S07 code ghi rõ "unsupported" |
| I02 | §2.2 E5: lớp "người bán nhắm tới" tách riêng (4 kiểm tra, ≥2 sàn, n/N khớp) | S02, S14, S15, S17 | — (`AN/source-registry.ts` chỉ gắn nhóm `SELLER_VOICE`) | — | Chỉ có trong tài liệu |
| I03 | §5 I03 (A25): bảng nguồn theo sàn, ngày, số lượng, có sao/mã tác giả hay không | Tất cả nguồn đã dùng | `RR/insight-build-v1.ts:prepareInsightReaderBuild` (đoạn I03 "Đơn vị là bản ghi…"); `RA/review-corpus-report.ts:privateReviewCorpusSection` (chưa đọc chi tiết) | — | Kiểm một phần: chưa thấy bảng A25 đủ cột theo từng nguồn; `AN/i03-research-method.ts:buildI03ResearchMethod` chỉ làm cho Metric |
| I03 | §5 I03: bản ghi ngoài kỳ, tính theo giờ VN | Tất cả | `RA/insight-persona-evidence.ts` (`sourceDateEligibility: 'UNKNOWN'`); `RA/review-coverage-selection.ts:readMetricReviewCoverageBoundary` (`AUTHENTIC_MEASUREMENT_PERIOD_UNAVAILABLE`) | — | Kiểm một phần: chỉ ghi "chưa biết", chưa phân loại bản ghi trong kỳ hay ngoài kỳ |
| I04 | §5 I04: ý định mua chưa phải mua lại | S05–S07 (S12 chưa có, không tính là nguồn) | `AN/located-insight-methods.ts:summary` (`DECLARED_NOT_VERIFIED`, `CODING_PENDING`) | — | Kiểm một phần: không có kiểm tra phân biệt ý định với hành vi |
| I05 | §5 I05: cảm nhận; bản ghi chỉ có trạng thái không tính là tiêu cực | S05–S07 | `AN/located-insight-methods.ts:buildLocatedInsightMethods` (`recordPolarities` gộp thành MIXED/UNCLEAR) | — | Kiểm một phần: chưa có luật "chỉ có trạng thái ≠ tiêu cực" |
| I06 | §5 I06: thứ tự sự kiện chỉ lấy khi nguồn nói rõ trong cùng bản ghi | S05 | `AN/located-insight-methods.ts:buildLocatedInsightMethods` (`SOURCE_EXPLICIT_SAME_RECORD`, `RECORD_LOCAL`, `I06_EVENT_ORDER_UNRESOLVED`) | — | Đã kiểm tự động |
| I07 | §5 I07: lý do chọn phải nêu trực tiếp; không có thì ghi "0 bản ghi nêu trực tiếp lý do mua" | S05–S07 | `AN/located-insight-methods.ts:summary` (`NO_LOCATED_ANNOTATIONS`) | — | Kiểm một phần: chưa kiểm câu "0 bản ghi…" hiển thị ra |
| I08 | §5 I08: việc cần làm đi cùng trở ngại | S05–S07 | `AN/located-insight-methods.ts:summary` (có thứ tự `barrierFacet`) | — | Kiểm một phần: không ép cặp việc + trở ngại nằm trong cùng bản ghi |
| I09 | §5 I09: mong muốn và khoảng trống trong cùng bản ghi | S05–S07 | `AN/located-insight-methods.ts:buildLocatedInsightMethods` (`EXPLICIT_GAP` cần mong muốn, hiện trạng và quan hệ; `I09_INCOMPLETE_GAP_EVIDENCE`) | — | Đã kiểm tự động |
| I10 | §5 I10 + rule 4: kho cố định, n/N, số nháp có nhãn L3 | S05–S07 | `AN/insight-corpus-counts.ts:summarize`/`buildInsightCorpusCounts` (chỉ có tỷ lệ khi `COMPLETE`; `CORPUS_ZERO_DENOMINATOR`; `draftCounts` gắn nhãn); test `ins-209-insight-counts.test.ts` "U-03 v2 draft corpus keeps accepted completion and ratios withheld…" | — | Đã kiểm tự động |
| I10 | §2.2 E15: xếp hạng chủ đề bình luận theo từng sàn | S05–S07 | `RA/review-topic-ranking.ts:rankReviewTopicsByPlatform` | — | Kiểm một phần: chưa được gọi trong `RR/insight-build-v1.ts`; chi tiết ở dòng E15 bên dưới |
| I11 | §5 I11: nhóm theo sàn và theo mua lẻ/mua sỉ | S05/S06/S07 (+S21) | `AN/bounded-analysis-gates.ts` (`I11_SOURCE_ASSIGNMENT_EVIDENCE_REQUIRED`, `I11_SUPPRESSION_POLICY_UNSET`); `RA/reports.ts:draftInsightGroupsView` gọi từ `RR/insight-build-v1.ts`; test "U-04 draft rate eligibility keeps a 29-record group counts-only" | — | Kiểm một phần: chưa có bằng chứng lẻ/sỉ (renderer tự ghi điều này) |
| I12 | §5 I12: PRESENCE, EXPOSURE và OUTCOME tách riêng, không nối | S14, S15, S17, S07 | `AN/bounded-analysis-gates.ts` (`I12_PRESENCE_CANNOT_MEASURE_EXPOSURE_OR_OUTCOME`, `I12_*_MISSING`, `I12_WINDOW_UNKNOWN`); test `bounded-analysis-gates.test.ts` | — | Đã kiểm tự động |
| I02/I03/I12 | §2.2 E12/E13: số liệu bối cảnh có ghi nguồn và trạng thái giá trị | S21 và các nguồn khác | — (chưa đọc `RA/world-bank-*`, `official-statistics-*`) | `ex:E12Figure`, `ex:E13Figure` | Kiểm một phần: chưa xác minh code; shape chỉ là bản thử |
| I13 | §5 I13: thương hiệu ghi "theo tiêu đề người bán"; giả thuyết có nhãn | S05–S07, S14, S15, S18 | `AN/insight-corpus-counts.ts:buildInsightCorpusCounts` (I13 chỉ đếm cụm từ nguyên văn, `CORPUS_CHANNEL_MISSING`) | — | Kiểm một phần: chưa kiểm câu chữ "theo tiêu đề người bán" và nhãn giả thuyết |
| I14 | §5 I14: `priority=null`, nhãn "hướng AI đề xuất, chờ chủ duyệt" | Tổng hợp | `RA/i14-evidence-admission.ts` (`CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT`); `RR/insight-build-v1.ts` (lời giải thích "chưa phải hướng đã được chọn") | — | Kiểm một phần: chưa thấy kiểm `priority=null` cho I14 (`priority: null` mới thấy ở M11) |
| I15 | §2.2 E6 + E2: ≤3 đề xuất, mỗi đề xuất có việc, người phụ trách và hạn chót, kèm nhãn | Tổng hợp | `RA/decision-packets.ts` (`MAX_AI_CANDIDATES_V2 = 3`, `CANDIDATE_PROPOSAL_FIELDS_REQUIRED`, `AI_PROPOSAL_LABEL`); `RR/insight-build-v1.ts` (báo lỗi khi >3, `data-insight-action-count`); `RR/lint.ts:lint` F6 và I_ACTIONS | — | Đã kiểm tự động |
| I15 | §2.2 E6: `ownerOptions[]` và `aiCandidates[]` tách riêng | Tổng hợp | `RA/decision-packets.ts` (khung I15 với `ownerOptions: []` và các trường UNSET; ứng viên AI nằm trong artifact riêng) | — | Đã kiểm tự động |
| I16 | §5 I16: hai chế độ DESIGN_ONLY và EXISTING_RESULT | Chưa có nguồn chính dùng được; S12 (chưa có; dùng khi chủ có dữ liệu shop) | `AN/bounded-analysis-gates.ts` (`I16_DESIGN_ONLY_HAS_RESULT_DATA`, `I16_OUTCOMES_MISSING`; không có dữ liệu thì `BLOCKED`) | — | Đã kiểm tự động |
| I17 | §5 I17 (A26): truy vết nguồn và giữ nguyên văn | Tất cả | `RR/insight-build-v1.ts` (bảng I17 "Bản ghi và vị trí nguồn"; nếu thiếu bản kê nguồn thì ghi rõ là thiếu); `RA/insight-persona-report.ts:insightPersonaSection` (I17) | — | Kiểm một phần: bản kê nguồn chỉ có khi có `sourceEvidence` |
| I17 | §5 I17: đánh dấu bản ghi ngoài kỳ và bản ghi trùng | Tất cả | `RA/insight-persona-evidence.ts` (`SOURCE_NATIVE_ALIAS`); `RA/tiktok-comment-intake.ts:buildTikTokCommentCorpus` (`equalDuplicateRows`, `UNRESOLVED_CONFLICT`) | — | Kiểm một phần: có đánh dấu trùng, chưa có đánh dấu ngoài kỳ |
| Chung | §2 rule 1: thiếu không phải 0; hiện rõ UNKNOWN | Tất cả | `AN/insight-corpus-counts.ts` (khi chưa đủ thì `ratio: null`); `RR/lint.ts` F3 (cấm undefined/NaN/null); `RR/insight-build-v1.ts` ("không suy ra nguồn không có phản hồi") | `ex:UnknownRecord` (UNKNOWN.ttl) | Kiểm một phần: chưa có luật chung "UNKNOWN không vào tổng" trong app |
| Chung | §2 rule 2: định danh bản ghi; chỉ gộp khi cùng một bản ghi | S05, S07 | `RA/insight-persona-evidence.ts` (khóa theo reviewId gốc, `SOURCE_NATIVE_IDENTITY_CONFLICT`); `RA/tiktok-comment-intake.ts` (khóa `videoId:commentId`, `UNRESOLVED_CONFLICT`) | — | Đã kiểm tự động |
| Chung | §2 rule 3: chỉ cộng khi cùng đơn vị và kỳ; không cộng Shopee với TikTok | S05–S07 | `RR/lint.ts` W3 (cấm cụm "tổng hai sàn"); persona có giới hạn `NO_CROSS_PLATFORM_JOIN_OR_SUM` | — | Kiểm một phần: chỉ dò câu chữ, chưa kiểm phép cộng số |
| Chung | §2 rule 4: tỷ lệ phải có mẫu số khai báo | S05–S07 | `AN/insight-corpus-counts.ts` (`ratio {numerator, denominator}` chỉ khi `COMPLETE`) | — | Đã kiểm tự động |
| Chung | §2 rule 5: các câu khẳng định bị cấm mặc định | Tổng hợp | `RR/lint.ts` F5 (`insightNegated`: "thị phần", "xếp hạng", "toàn thị trường", "quy mô thị trường"), W4 | — | Kiểm một phần: dò từ khóa, có thể lọt cách diễn đạt khác |
| Chung | §2 rule 6: không làm nghiên cứu khách hàng mới | — | — (app không có tính năng khảo sát) | — | Chỉ có trong tài liệu |
| Chung | §2 rule 7: tái lập được (digest + vị trí, không ghi đè) | Tất cả | `RR/insight-build-v1.ts:prepareInsightReaderBuild` (so `frozenStartSha256`, `frozenScopeSha256`, digest `retainedMethods`); `RA/insight-persona-evidence.ts` (`VIEW_REPLAY_MISMATCH`, `CORPUS_DIGEST_MISMATCH`) | — | Đã kiểm tự động |
| Chung | §2 rule 8: bộ mã phải được duyệt trước khi đếm | S05–S07 | `RA/insight-persona-projection.ts:checkPersonaStage` (`codebookSha256` khớp taxonomy); `RA/insight-coding.ts` (`APPLICATION_SOURCE_POLICY_NOT_OWNER_APPROVAL`); test "U-03 accepted corpus counts identify the codebook revision instead of an owner receipt" | — | Kiểm một phần: chỉ ràng buộc phiên bản bộ mã, chưa có biên nhận chủ duyệt |
| Chung | §2 rule 9: AI đề xuất, người quyết | Tổng hợp | `RA/insight-coding.ts` (vai trò `OWNER`); `releaseEligibility: 'UNAVAILABLE'` trong persona và `RA/qualitative-draft-contracts.ts` | — | Kiểm một phần: chưa có luồng "chủ duyệt → phát hành" |
| Chung | §2.1 L1: hai bản ghi trùng nguyên văn vẫn là 2 bản ghi | S05, S07 | Khóa định danh theo ID gốc (`RA/insight-persona-evidence.ts`, `RA/tiktok-comment-intake.ts`), không theo chữ | — | Đã kiểm tự động |
| Chung | §2.1 L2: chỉ đếm người viết trong một sàn | S05, S07 | `RA/insight-persona-evidence.ts:authorMinimum` (hash tác giả S05); `COL/apify-tiktok-comments.ts` (hash có khóa); giới hạn "key-scoped within TikTok only" | — | Đã kiểm tự động |
| Chung | §2.1 L3: số nháp mang nhãn "đề xuất, chờ chủ duyệt"; chỉ phát hành khi bộ mã đã duyệt | S05–S07 | `AN/insight-corpus-counts.ts` (`draftLabel`); `AN/located-insight-methods.ts:summary` (`draftLabel`); `AN/report-visible-text-lint.ts:lintVisibleReportText` (`U13_PENDING_NUMBER`); test `u13-209-report-lint.test.ts` | — | Kiểm một phần: phần nhãn đã có; chưa có đường phát hành |
| Chung | §2.1 L4: không ngầm xếp hạng (E15 là ngoại lệ) | Tổng hợp | `AN/report-visible-text-lint.ts` (`U13_SUPERLATIVE`, `U13_PRIORITY`); `RA/decision-packets.ts` (`CANDIDATE_ORDER_IS_RESPONSE_ORDER_NOT_PRIORITY_OR_RANK`) | — | Kiểm một phần: dò câu chữ; thứ tự trình bày chưa được kiểm |
| Chung | §2.1 L5: mỗi sàn một cột, không cộng chéo sàn | S05–S07 | `RA/review-topic-ranking.ts:rankReviewTopicsByPlatform`; `RA/reports.ts:draftInsightGroupsView`; `RR/lint.ts` W3 | — | Kiểm một phần: chưa có kiểm cấu trúc bảng theo sàn |
| Chung | §2.1 L6: số sao là phân bố riêng; nguồn không có sao thì ghi "nguồn không có số sao" | S05 | `RA/insight-persona-report.ts:insightPersonaSection` (I17); `RA/review-corpus-report.ts:insightLiteralSection` (mới thấy ở chỗ gọi) | — | Kiểm một phần: chưa có phân bố sao ở I05 |
| Chung | §2.1 L7: lời người bán viết là "người bán nhắm tới" | S04, S14, S15, S17, S18 | `AN/source-registry.ts` (`SELLER_VOICE`); `RA/tiktok-comment-intake.ts` (loại `SELLER_OR_CREATOR`) | — | Kiểm một phần: chưa kiểm câu chữ "người bán nhắm tới". Quy tắc mới 12/10/2026 (lời người làm video review là lời người bán) chưa có trong code: `RA/video-reading-intake.ts` vẫn gắn `CREATOR` cho bản đọc `REVIEW_VIDEO` |
| Chung | §2.1 L8: không đề xuất mua hàng | Tổng hợp | `RA/decision-purchase-guard.ts:hasDecisionPurchaseProposal`, gọi trong `RA/decision-packets.ts` (`PURCHASE_SUGGESTION_NOT_ALLOWED`); test `decision-purchase-guard.test.ts` | — | Kiểm một phần: dò từ, chỉ áp cho ứng viên AI của gói ≥1.2.0; chưa áp cho I14, I16 và Kết luận |
| Chung | §2.1 L9: lọc nghĩa từ khóa có phiên bản, giữ dấu, ghi lại phần loại ở I17, bản ghi không rõ thì không đếm | S07 (+SerpApi) | `AN/keyword-meaning-filter.ts:filterKeywordMeanings`; `RA/l9-jev-triage.ts:applyL9JevDecisions`; `RA/tiktok-comment-intake.ts` (`UNCLEAR` để riêng); test `keyword-meaning-filter.test.ts` | — | Kiểm một phần: chưa thấy áp cho đánh giá Shopee S05 |
| Chung | §2.1 L10: tính bình luận dưới video review và video bán hàng; loại bình luận của creator, thương hiệu, chỉ tag, chỉ emoji; có nhãn loại nguồn và "bình luận thu được" | S07 | `COL/apify-tiktok-comments.ts` (`TAG_ONLY`, `EMOJI_ONLY`, `REPLY`, `SELLER_OR_CREATOR`); `RA/tiktok-comment-intake.ts:buildTikTokCommentCorpus` (`sourceType`, `sampleLabel`), `tikTokLocatedRecords`; test `apify-tiktok-comments.test.ts` | `ex:L10Shape` (L10.ttl) | Kiểm một phần: thương hiệu chỉ bị loại khi trùng ID hoặc handle người bán; S07 chưa nối vào báo cáo Insight |
| Chung | §2.2 E8/E14: thu tự động có trần chi, nhật ký chi phí, dừng khi gặp captcha, khi hủy vẫn giữ dòng chi phí | S05, S07 | `COL/apify-shopee.ts` và `COL/apify-tiktok-comments.ts` (truyền `maxTotalChargeUsd`); `RA/source-status.ts` (`spendCapUsd`); UI `frontend/src/research-automation/SourceStatusBoard.tsx` (hiện "Trần chi") | — | Kiểm một phần: chưa xác minh nhật ký chi phí, việc dừng khi gặp captcha và dòng chi phí khi hủy |
| Chung | §2.2 E11: mã hóa mặc định; "Duyệt cách xếp nhóm" ở pha 1 | S05–S07 | `RA/qualitative-draft-contracts.ts` (`U11_STATISTIC_UNAVAILABLE`, `releaseEligibility` = `UNAVAILABLE`); UI `InsightDefaultProposalPanel.tsx` (nhãn "đề xuất, chờ chủ duyệt") | — | Kiểm một phần: chưa đọc `RA/insight-default-coding.ts` chi tiết |
| Chung | §2.2 E11 (κ): kiểm chéo độ tin cậy | S05–S07 | `RA/insight-crosscheck-preparation.ts` (`CROSSCHECK_SAMPLE_LIMIT = 200`, "not a reliability statistic") | — | Không áp dụng/BLOCKED: κ đã được hoãn theo §3 và #209 |
| Chung | §2.2 E15: đếm mỗi bản ghi một lần cho mỗi chủ đề; hòa thì đồng hạng; chủ đề <3 lượt vào "Khác"; "Khác" >20% thì bổ sung tối đa 1 lần; xếp riêng từng sàn | S05–S07 | `RA/review-topic-ranking.ts:rankReviewTopicMentions` (`needsTopUp`, `khacShare`); test `review-topic-ranking.test.ts` | — | Kiểm một phần: mẫu số của "Khác" tính theo lượt nhắc chứ không theo bình luận đã gắn mã; chưa nối vào renderer; chưa kiểm lời chú thích về "mức quan trọng" |
| Chung | §6.3: khoảng 300 đánh giá mỗi sản phẩm (tối đa 500); ≥30 đánh giá có chữ để so sánh; quy tắc dừng A | S05 | `RA/review-coverage-selection.ts:privateProductReviewAccounting` (`REVIEW_COLLECTION_THRESHOLDS`, báo lỗi khi >500, `meetsComparisonTextMinimum`, `A_FIXED_COUNT`) | — | Đã kiểm tự động |
| Chung | §6.3: phủ ≥50% doanh thu, ≥5 thương hiệu, có cả hai sàn | S01/S02, S05 | `RA/review-coverage-selection.ts:readMetricReviewCoverageBoundary` (`coverageAvailable: false`) | — | Không áp dụng/BLOCKED: kỳ đo chưa xác thực; chưa có kiểm ≥5 thương hiệu |
| Chung | §6.3: quy tắc dừng B, bão hòa (lô 25, ≤5% mã mới) | S05–S07 | `RA/review-coverage-selection.ts` (có hằng số; `saturation: 'SOURCE_BOUND_CODING_UNAVAILABLE'`) | — | Không áp dụng/BLOCKED: cần có mã hóa gắn nguồn trước |
| Chung | §6.3: chân dung cần ≥5 người viết từ ≥3 sản phẩm; nói "của ngành hàng" phải có ≥3 sản phẩm | S05 | `RA/insight-persona-evidence.ts` (`PERSONA_BROADER_SCOPE_REQUIRES_THREE_SOURCE_PRODUCTS`) | — | Kiểm một phần: mới áp cho chân dung, chưa áp cho các câu "của ngành hàng" ở phần khác |

## Lỗ hổng ưu tiên

Xếp theo rủi ro kinh doanh với một báo cáo Insight chạy tự động:

1. **Kết luận chính (§5)**: một sản phẩm hoặc một sàn vẫn có thể bị đọc như kết luận chung. Cần một luật trong `projectRetainedInsightFindings` đếm số sản phẩm và số sàn: dưới 3 sản phẩm hoặc chỉ 1 sàn thì điểm đầu tiên phải là câu giới hạn, kèm một quy tắc lint chặn câu suy rộng.
2. **E5, lớp người bán nhắm tới**: chưa có code. Cần validator riêng cho 4 kiểm tra, ≥2 sàn và n/N khớp. Lớp này phải tách hẳn khỏi lời khách và bị chặn khi thiếu S14, S15, S17 (S16 chưa dùng được, không tính là nguồn).
3. **L10/S07**: bình luận TikTok chưa vào báo cáo Insight, và bình luận của tài khoản thương hiệu chỉ bị loại khi trùng ID người bán. Cần nối `tikTokLocatedRecords` vào `prepareInsightReaderBuild` và thêm danh sách tài khoản thương hiệu đã được duyệt.
4. **Rule 8/L3, biên nhận chủ duyệt bộ mã**: hiện không có. Cần một bản ghi chủ duyệt gắn `codebookSha256`; chỉ khi có bản ghi đó mới bỏ nhãn nháp và mở `releaseEligibility`.
5. **I03/I17, bản ghi ngoài kỳ**: chưa được đánh dấu. Cần so ngày nguồn với kỳ yêu cầu theo giờ Asia/Ho_Chi_Minh, gắn cờ cho từng bản ghi, rồi tách số trong kỳ và ngoài kỳ.
6. **E15**: cần sửa mẫu số "Khác" thành số bình luận đã gắn mã, nối vào renderer của I10 và thêm lint cấm chú thích kiểu "quan trọng nhất".
7. **L8**: hiện chỉ chặn ở ứng viên AI của I15. Cần chạy `hasAuthoredPurchaseProposal` trên toàn bộ chữ hiển thị (I14, I16, Kết luận) bằng `lintVisibleReportText`.
8. **Rule 3/L5, cộng chéo sàn**: hiện chỉ dò chữ. Cần gắn thuộc tính sàn cho mỗi ô số và kiểm không có ô nào trộn hai sàn hoặc cộng hai sàn.
9. **L6/I05**: cần phân bố số sao tách theo nguồn, kèm luật "bản ghi chỉ có trạng thái không tính là tiêu cực" khi gộp `recordPolarities`.
10. **Áp shape ontology vào dữ liệu thật**: các shape E4, L10, UNKNOWN (UnknownRecord) và E12/E13 mới là bản thử. Cần chuyển dữ liệu thật của persona, corpus S07 và số liệu bối cảnh sang RDF rồi chạy SHACL trong CI, để có thêm một lớp kiểm độc lập với code.

Mục dưới đây là **để sau**: đã ghi nhận ở lần rà lại ngày 12/10/2026, chưa sửa code trong gói này.

11. **I01/E7, không có đề xuất câu hỏi** — để sau. Khi AI không đưa ra câu hỏi làm việc (`workingQuestionProposal` rỗng), `businessQuestion` không được ghi trạng thái `AI_PROPOSED_AWAITING_OWNER`. Có thể dùng một trạng thái riêng, ví dụ "chưa có câu hỏi, chờ chủ", kèm test cho trường hợp này.
