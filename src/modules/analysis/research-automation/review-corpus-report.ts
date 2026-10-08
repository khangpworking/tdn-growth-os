import type { ResearchReviewCorpus } from '../../../../contracts/analysis/research-review-corpus.generated.js';
import { escapeHtml as escape, readerPointer, retainedQuoteHtml, storedLiteral, type ReportCitations } from './descriptive-report.js';

/** Literal source inventory, deliberately not customer coding or an Insight conclusion. */
export function reviewCorpusSection(corpus: ResearchReviewCorpus, id: 'I03' | 'I17', citations: ReportCitations): string {
  const refMark = (ref: { pageSha256: string; textPointer: string | null; rowPointer: string | null }): string => {
    const pointer = readerPointer(ref.textPointer ?? ref.rowPointer);
    return citations.mark({
      sourceKind: 'REVIEW', identity: ref.pageSha256.trim() === '' ? null : ref.pageSha256, locator: pointer.locator,
      label: 'Đánh giá khách hàng trên Shopee', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
      technical: { pageSha256: ref.pageSha256, ...(pointer.technical === null ? {} : { pointer: pointer.technical }) },
    });
  };
  const c = corpus.coverage;
  const terminalFailure = ['FAILED', 'TIMED-OUT', 'ABORTED'].includes(corpus.capture.actorStatus);
  const warning = (terminalFailure ? '<p class="warning">Nhà cung cấp báo lượt thu review thất bại. Biên nhận và mọi dòng đã trả về vẫn được giữ. Không có dòng không có nghĩa sản phẩm không có review. Cần kiểm tra trạng thái nguồn trước khi duyệt một lượt thu mới; hệ thống không tự chạy lại tác vụ tính phí.</p>' : '')
    + `<p class="warning">${corpus.capture.mode === 'fixture' ? 'Dữ liệu giả lập dùng kiểm thử. ' : ''}Phản hồi gắn với mục sản phẩm trên sàn, chưa xác nhận đúng biến thể. Kỳ báo cáo không lọc ngày review. Chưa mã hóa nội dung; số dòng không phải số khách hàng, tỷ lệ chủ đề hay độ phủ toàn thị trường. Thông tin định danh tác giả không được đưa vào báo cáo; nội dung tự do vẫn có thể chứa thông tin cá nhân.</p>`;
  if (id === 'I03') return warning + `<p class="reader-summary">Đã giữ ${c.rawRows} dòng phản hồi nguồn, trong đó ${c.selectedListingRawRows} dòng khớp mục sản phẩm đã chọn và ${c.quarantinedRawRows} dòng được tách riêng. Các số này mô tả tập thu, chưa phải số khách hàng hoặc mức phổ biến của một nhu cầu.</p><dl><dt>Dòng nguồn</dt><dd>${c.rawRows}</dd><dt>Dòng đúng mục sản phẩm đã chọn</dt><dd>${c.selectedListingRawRows}</dd><dt>Dòng tách riêng</dt><dd>${c.quarantinedRawRows}</dd><dt>Dòng có chữ đọc được</dt><dd>${c.readableRawRows} (toàn tập thu, gồm dòng tách riêng)</dd><dt>Dòng trùng đồng nhất đã gộp</dt><dd>${c.collapsedEqualDuplicateRows}</dd><dt>Nhóm ID có nội dung mâu thuẫn</dt><dd>${c.conflictingRecordGroups}</dd><dt>Dòng có điểm đánh giá không hợp lệ</dt><dd>${c.invalidRatingRawRows} (không tự bỏ phần chữ)</dd><dt>Phân tích chủ đề</dt><dd>Chưa mã hóa, chưa có mẫu số chủ đề</dd></dl><p>Cần nối bộ mã và phương pháp mã hóa có vị trí nguồn vào tập phản hồi trước khi kết luận về hành vi, động cơ, nhu cầu hay tỷ lệ chủ đề.</p>`;
  const rows = corpus.records.flatMap(record => record.versions.map(version => {
    const state = record.disposition === 'QUARANTINED' ? 'Tách riêng: không đủ nhận diện mục sản phẩm đã chọn' : record.disposition === 'UNRESOLVED_CONFLICT' ? 'Chưa xử lý: cùng ID nhưng khác nội dung' : 'Nguồn thô, chưa mã hóa';
    return `<tr><td>${storedLiteral(record.identity.listingKey ?? 'Chưa rõ mục sản phẩm', 'Mục sản phẩm được giữ trong bản lưu nguồn')}<br>${escape(state)}</td><td>${version.textState === 'READABLE' ? retainedQuoteHtml(version.text ?? '', 'blockquote') : version.textState === 'EMPTY' ? 'Nguồn không có phần chữ' : 'Phần chữ không đọc được'}</td><td>${version.rating.state === 'VALID' ? `${version.rating.value}/5` : version.rating.state === 'MISSING' ? 'Thiếu điểm đánh giá' : 'Điểm đánh giá không hợp lệ'}</td><td>${version.sourceRefs.map(refMark).join('<hr>')}</td></tr>`;
  })).join('');
  return warning + `<details class="evidence-trace"><summary>Hồ sơ đối chiếu tập phản hồi</summary><p>Tập thu: <code>${escape(corpus.collectionSha256)}</code>. Phiên bản ánh xạ: ${escape(corpus.mappingRevision)}. Mỗi trích dẫn gắn với đúng mã băm trang và vị trí JSON; mọi lần xuất lại giữ nguyên phiên bản này.</p></details><div class="table-wrap" role="region" aria-label="Toàn bộ nhóm bản ghi đã thu" tabindex="0"><table><caption>Toàn bộ nhóm bản ghi đã thu, gồm dòng tách riêng và nội dung mâu thuẫn; không dùng chúng như một tập đã mã hóa.</caption><thead><tr><th>Mục sản phẩm / trạng thái</th><th>Nguyên văn</th><th>Điểm đánh giá nguồn</th><th>Vị trí nguồn</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Tập thu đã lưu nhưng không có dòng phản hồi. Không suy ra khách hàng không có phản hồi.</td></tr>'}</tbody></table></div>`;
}

/** New literal method view only. Historical reviewCorpusSection bytes are frozen. */
export function insightLiteralSection(output: import('../insight-literal-evidence.js').InsightLiteralEvidence,
  id: 'I05' | 'I07' | 'I08' | 'I13' | 'I17', citations: ReportCitations): string {
  const review = (pointer: string) => {
    const index = /^\/input\/reviews\/(0|[1-9]\d*)$/.exec(pointer)?.[1];
    const row = index === undefined ? undefined : output.input.reviews[Number(index)];
    if (!row) throw new TypeError('LITERAL_REVIEW_POINTER_MISSING');
    return row;
  };
  const marks = (pointer: string, field: 'text' | 'rating' = 'text') => review(pointer).sourceRefs.map(ref => citations.mark({
    sourceKind: 'REVIEW', identity: ref.sourceSha256, locator: field === 'rating' ? ref.ratingLocator : ref.textLocator ?? ref.rowLocator,
    label: 'Đánh giá khách hàng trên Shopee', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
  })).join(' ');
  if (id === 'I05') {
    const stars = output.stars;
    let html = '<h4>Phân bố số sao từ nguồn, tách khỏi cảm nhận trong lời viết</h4><p>Số sao không tự chuyển thành khen hoặc chê. Bản ghi không có chữ có cảm nhận chưa biết; phần chữ không đọc được cũng chưa xác định cảm nhận. Đơn vị là bản ghi trong tập đã giữ, không phải số người.</p>';
    if (stars.state === 'SOURCE_FIELD_ABSENT') html += '<p>nguồn không có số sao; chưa có phân bố số sao, không thay bằng 0.</p>';
    else if (stars.state === 'NO_USABLE_RECORDS') html += '<p>Chưa có bản ghi nguồn tương thích để lập phân bố số sao; không suy ra nguồn không có review.</p>';
    else html += `<div class="table-wrap"><table><caption>Số sao nguồn ghi trong tập bản ghi, chưa đối chiếu với tác giả</caption><thead><tr><th>Số sao</th><th>Số bản ghi</th><th>Vị trí nguồn</th></tr></thead><tbody>${stars.bins.map(bin => `<tr><td>${bin.value}/5</td><td>${bin.recordCount}</td><td>${bin.recordPointers.map(pointer => marks(pointer, 'rating')).join(' ') || 'Không có bản ghi trong tập ở mức sao này'}</td></tr>`).join('')}</tbody></table></div>`;
    const states = [
      ['nguồn không có số sao', stars.absentField], ['Nguồn có trường sao nhưng thiếu giá trị', stars.missingValue],
      ['Giá trị số sao không hợp lệ; không tự bỏ phần chữ', stars.invalidValue],
      ['Không có chữ; cảm nhận chưa biết', stars.textlessUnknown], ['Phần chữ không đọc được; cảm nhận chưa biết', stars.unreadableText],
    ] as const;
    html += `<div class="table-wrap"><table><caption>Phần còn thiếu và trạng thái phần chữ, giữ riêng với phân bố sao</caption><thead><tr><th>Trạng thái</th><th>Số bản ghi</th><th>Vị trí nguồn</th></tr></thead><tbody>${states.map(([state, count]) => `<tr><td>${state}</td><td>${count.recordCount}</td><td>${count.recordPointers.map(pointer => marks(pointer)).join(' ') || 'Không có bản ghi thuộc trạng thái này trong tập'}</td></tr>`).join('')}</tbody></table></div>`;
    return html;
  }
  if (id === 'I17') return '<h4>Đối chiếu nguyên văn trùng ở các vị trí nguồn</h4><p>Trùng chữ không xác minh cùng tác giả. Những bản ghi có vị trí nguồn khác nhau vẫn giữ riêng và vẫn tính theo quy tắc của tập nguồn; tham chiếu nguồn trùng hệt và nhóm định danh mâu thuẫn giữ quy tắc xử lý cũ.</p>' +
    (output.duplicateTexts.length ? `<ul>${output.duplicateTexts.map(group => `<li><p>${group.label}.</p>${retainedQuoteHtml(review(group.recordPointers[0]!).text!, 'blockquote')}<p>${group.recordPointers.map(pointer => marks(pointer)).join(' ')}</p></li>`).join('')}</ul>` : '<p>Chưa ghi nhận nguyên văn trùng ở hai bản ghi được đưa vào tập này.</p>');
  const intro = id === 'I08'
    ? 'Lời người bán tự nêu lo ngại hoặc phản bác được giữ riêng, không đưa vào rào cản của khách. Rào cản của khách chỉ lấy từ lời khách.'
    : id === 'I07' ? 'Lời người bán nhấn mạnh được đặt cạnh lý do khách tự nói; tiêu đề hoặc mô tả không xác nhận lý do lựa chọn của khách.'
      : 'Lời người bán về định vị được giữ riêng với lời khách nhắc thương hiệu; không suy danh tính hay hiệu quả từ câu chữ.';
  if (output.sellerLayer.state === 'UNAVAILABLE') return `<h4>Lời người bán, tách khỏi lời khách</h4><p>${intro}</p><p>Chưa có tiêu đề, mô tả, video hoặc quảng cáo người bán với trường nguồn và vị trí đã đối chiếu trong tập này. Cần bản thu chi tiết sản phẩm đã chọn, có nội dung gốc và dấu vết nguồn; không suy người bán từ lời review.</p>`;
  return `<h4>Lời người bán, tách khỏi lời khách</h4><p>${intro}</p><p>Người bán định vị qua tiêu đề hoặc mô tả đã lưu dưới đây; đây là lời nguồn, chưa phải kết luận về khách hàng. Nguồn TikTok Shop được giữ riêng với review Shopee; không nối người hay cộng số giữa hai nguồn.</p><ul>${output.sellerLayer.statementPointers.map(pointer => {
    const index = /^\/input\/sellerStatements\/(0|[1-9]\d*)$/.exec(pointer)?.[1];
    const statement = index === undefined ? undefined : output.input.sellerStatements[Number(index)];
    if (!statement) throw new TypeError('LITERAL_SELLER_POINTER_MISSING');
    const mark = citations.mark({ sourceKind: 'CAPTURE', identity: statement.sourceSha256, locator: statement.locator,
      label: statement.sourceType === 'LISTING_TITLE' ? 'Tiêu đề sản phẩm đã lưu trên TikTok Shop' : 'Mô tả sản phẩm đã lưu trên TikTok Shop',
      retrievedAt: statement.retrievedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
      technical: { responseSha256: statement.responseSha256, productId: statement.productId } });
    return `<li><p>${statement.sourceType === 'LISTING_TITLE' ? 'Tiêu đề người bán' : 'Mô tả người bán'} ${mark}</p>${retainedQuoteHtml(statement.text, 'blockquote')}</li>`;
  }).join('')}</ul>`;
}
