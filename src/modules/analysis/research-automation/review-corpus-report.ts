import type { ResearchReviewCorpus } from '../../../../contracts/analysis/research-review-corpus.generated.js';
import { escapeHtml as escape, readerPointer, type ReportCitations } from './descriptive-report.js';

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
    return `<tr><td>${escape(record.identity.listingKey ?? 'Chưa rõ mục sản phẩm')}<br>${escape(state)}</td><td><blockquote style="white-space:pre-wrap;overflow-wrap:anywhere">${version.textState === 'READABLE' ? escape(version.text ?? '') : version.textState === 'EMPTY' ? 'Nguồn không có phần chữ' : 'Phần chữ không đọc được'}</blockquote></td><td>${version.rating.state === 'VALID' ? `${version.rating.value}/5` : version.rating.state === 'MISSING' ? 'Thiếu điểm đánh giá' : 'Điểm đánh giá không hợp lệ'}</td><td>${version.sourceRefs.map(refMark).join('<hr>')}</td></tr>`;
  })).join('');
  return warning + `<details class="evidence-trace"><summary>Hồ sơ đối chiếu tập phản hồi</summary><p>Tập thu: <code>${escape(corpus.collectionSha256)}</code>. Phiên bản ánh xạ: ${escape(corpus.mappingRevision)}. Mỗi trích dẫn gắn với đúng mã băm trang và vị trí JSON; mọi lần xuất lại giữ nguyên phiên bản này.</p></details><div class="table-wrap" role="region" aria-label="Toàn bộ nhóm bản ghi đã thu" tabindex="0"><table><caption>Toàn bộ nhóm bản ghi đã thu, gồm dòng tách riêng và nội dung mâu thuẫn; không dùng chúng như một tập đã mã hóa.</caption><thead><tr><th>Mục sản phẩm / trạng thái</th><th>Nguyên văn</th><th>Điểm đánh giá nguồn</th><th>Vị trí nguồn</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Tập thu đã lưu nhưng không có dòng phản hồi. Không suy ra khách hàng không có phản hồi.</td></tr>'}</tbody></table></div>`;
}
