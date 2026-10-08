import type { PersonaSource, PersonaSnapshot, PersonaQuoteSelection, PersonaAttribute, PersonaQuote } from '../../../../contracts/analysis/automation-insight-persona.generated.js';
import { checkPersonaSource, checkPersonaBinding, checkPersonaQuote, checkPersonaAttribute, personaSnapshotValid, personaDigest } from './insight-persona-contracts.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { escapeHtml as escape, readerSafe, readerPointer, retainedQuoteHtml, storedLiteral, type ReportCitations } from './descriptive-report.js';
import { lintVisibleReportText } from '../report-visible-text-lint.js';

const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const pending = 'đề xuất, chờ chủ duyệt';
const attributeLabel: Record<PersonaAttribute['kind'], string> = {
  SITUATION: 'Hoàn cảnh nguồn nêu', NEED: 'Nhu cầu nguồn nêu', WORRY: 'Lo ngại nguồn nêu',
  PURCHASE_REASON: 'Lý do mua nguồn nêu', CHANNEL: 'Kênh nguồn nêu',
};
function invalid(): never { throw new TypeError('INVALID_INSIGHT_PERSONA_REPORT'); }
const selection = (quote: PersonaQuote): PersonaQuoteSelection => ({ recordIndex: quote.recordIndex, recordId: quote.recordId, locator: quote.locator, span: quote.selectedSpan });

/** Presentation guard only. The owning proposal reader authenticates source,
 * execution and private author/product proofs before supplying this snapshot.
 * Never infer new attributes, minimums, counts, classifications or approval. */
function check(snapshot: PersonaSnapshot, source: PersonaSource): void {
  checkPersonaSource(source); checkPersonaBinding(snapshot.binding, source);
  if (!personaSnapshotValid(snapshot) || !snapshot.classificationComplete || !snapshot.taxonomy ||
    snapshot.codebookSha256 !== personaDigest(snapshot.taxonomy)) invalid();
  const classified = new Set(snapshot.classifications.filter(row => row.status === 'CLASSIFIED').map(row => row.recordIndex));
  const cards = new Map(snapshot.cards.map(card => [card.cardId, card]));
  if (cards.size !== snapshot.cards.length) invalid();
  for (const row of snapshot.classifications) for (const quote of row.quotes) checkPersonaQuote(quote, source);
  for (const codes of [snapshot.taxonomy.topics, snapshot.taxonomy.journeys])
    for (const code of codes) for (const quote of code.examples) checkPersonaQuote(quote, source);
  const literal = (attribute: PersonaAttribute, members: ReadonlySet<number>) => {
    checkPersonaAttribute(attribute, source, members);
    if (!attribute.quotes.some(quote => quote.span.quote === attribute.value)) invalid();
  };
  for (const card of snapshot.cards) {
    const members = new Set(card.recordIndexes);
    for (const quote of card.quotes) {
      checkPersonaQuote(selection(quote), source);
      const original = source.records[quote.recordIndex];
      if (!original || original.text !== quote.text || !same(original.sourceDate, quote.sourceDate) ||
        !members.has(quote.recordIndex) || !classified.has(quote.recordIndex)) invalid();
    }
    literal(card.situation, members);
    for (const attribute of card.attributes) literal(attribute, members);
  }
  for (const persona of snapshot.personas) {
    if (persona.cardIds.some(id => !cards.has(id))) invalid();
    for (const attribute of persona.attributes) literal(attribute, new Set(persona.recordIndexes));
  }
}

/** Pure rendering from an exact verified final proposal. Citations use the
 * existing report registry and original located S05 source, never an AI id. */
export function insightPersonaSection(snapshot: PersonaSnapshot, source: PersonaSource,
  id: 'I02' | 'I03' | 'I17', citations: ReportCitations): string {
  check(snapshot, source);
  const mark = (quote: PersonaQuoteSelection): string => {
    const pointer = readerPointer(quote.locator.textPointer);
    return citations.mark({ sourceKind: 'REVIEW', identity: quote.locator.pageSha256, locator: pointer.locator,
      label: 'Đánh giá khách hàng trên Shopee', retrievedAt: source.capture.retrievedAt, url: null,
      quote: readerSafe(quote.span.quote) ? quote.span.quote : null,
      quoteVerification: readerSafe(quote.span.quote) ? 'APP_VERIFIED' : 'NOT_APPLICABLE',
      technical: pointer.technical === null ? {} : { pointer: pointer.technical } });
  };
  const attribute = (value: PersonaAttribute): string => `<p>${attributeLabel[value.kind]} (${pending}): ${retainedQuoteHtml(value.value)} ${value.quotes.map(mark).join(' ')}</p>`;
  const warning = '<p class="warning">Nguồn là lời khách trên Shopee, giữ riêng với lời người bán. Phần chữ nguyên văn vẫn có thể chứa thông tin cá nhân. Ngày từ nguồn chưa xác lập kỳ đo lường; không dùng mẫu này để kết luận cho kỳ nghiên cứu hoặc toàn bộ khách hàng. Không nối người hay cộng số giữa các nền tảng.</p>';
  const qualification = '<p>Chủ đề, hành trình, cảm nhận và chân dung đều là đề xuất AI chờ chủ duyệt. Chưa có thống kê độ tin cậy, quyết định phát hành hoặc điều kiện đưa vào kết luận chính.</p>';
  const cards = snapshot.cards.map(card => `<article id="persona-card-${card.cardId}" class="persona-evidence-card"><h4>Thẻ bằng chứng theo hoàn cảnh · ${pending}</h4>${attribute(card.situation)}${card.attributes.map(attribute).join('')}${card.identityLimitation ? `<p>${escape(card.identityLimitation)}</p>` : ''}${card.quotes.map(quote => `<div><p>Đoạn được chọn ${mark(selection(quote))}</p>${retainedQuoteHtml(quote.selectedSpan.quote, 'blockquote')}<details open><summary>Toàn bộ lời nguồn, giữ cả phủ định và thông tin trái chiều</summary>${retainedQuoteHtml(quote.text, 'blockquote')}</details><p>Ngày nguyên văn từ nguồn: ${quote.sourceDate.literal === null ? 'chưa rõ' : escape(quote.sourceDate.literal)}; kỳ đo lường chưa rõ.</p></div>`).join('')}</article>`).join('');
  let body: string;
  if (id === 'I02') {
    const personas = snapshot.personas.map(persona => `<article class="persona-proposal"><h4>Chân dung theo lời nguồn · ${pending}</h4><p data-classified="pending">${escape(persona.label)} · Shopee: ${escape(persona.sampleSizeLabel)}${persona.identityLimitation ? `; ${escape(persona.identityLimitation)}` : ''}.</p>${persona.attributes.map(attribute).join('')}<p>Thẻ bằng chứng của đề xuất: ${persona.cardIds.map(cardId => `<a href="#persona-card-${cardId}">Thẻ hoàn cảnh</a>`).join(' · ')}.</p></article>`).join('');
    body = warning + qualification + (snapshot.insufficiency ? `<p>${storedLiteral(snapshot.insufficiency, 'Giới hạn bằng chứng được giữ trong đề xuất đã lưu.')}</p>` : '')
      + (personas || '<p>Chưa có từ ba đến sáu chân dung đủ điều kiện nguồn. Các thẻ có bằng chứng vẫn được giữ dưới đây; không thay phần thiếu bằng chân dung giả định.</p>') + cards;
  } else if (id === 'I03') {
    const definitions = [snapshot.taxonomy!.topics, snapshot.taxonomy!.journeys].map((codes, index) => `<h4>${index === 0 ? 'Chủ đề' : 'Hành trình'} · bộ mã đề xuất, chờ chủ duyệt</h4><ul>${codes.map(code => `<li><p>${storedLiteral(code.label, 'Nhãn đề xuất đã lưu')}: ${storedLiteral(code.meaning, 'Định nghĩa đề xuất đã lưu')} (${pending}).</p>${code.examples.map(quote => `<p>${retainedQuoteHtml(quote.span.quote)} ${mark(quote)}</p>`).join('')}</li>`).join('')}</ul>`).join('');
    body = warning + qualification + '<p>Mẫu dựng bộ mã lấy toàn bộ phần chữ đủ điều kiện khi ít hơn 300 bản ghi; nếu có đủ, lấy 300 bản ghi đầu theo thứ tự nguồn đã giữ. Đây là mẫu theo thứ tự nguồn, chưa xác nhận tính ngẫu nhiên hoặc đại diện. Các lô phân loại bám đúng bộ mã và thứ tự bản ghi đã giữ. Mức tin cậy thấp hoặc ý nghĩa còn mơ hồ giữ là chưa phân loại.</p>'
      + definitions + '<p>Chân dung chỉ giữ khi đủ thẻ, bằng chứng tác giả hoặc điều kiện nguồn thật sự thiếu mã người viết, và liên kết sản phẩm từ nguồn. Các điều kiện này không xác minh số người thực tế hay mức phổ biến. Thuộc tính hiển thị chỉ sao chép lời trích có vị trí; không suy tuổi, giới, thu nhập, nơi sống hay nghề.</p>';
  } else {
    const disposition: Record<PersonaSource['records'][number]['disposition'], string> = { INCLUDED: 'Đưa vào tập chữ để phân loại', EXCLUDED: 'Tách khỏi tập phân loại', UNREADABLE: 'Phần chữ không đọc được' };
    const rows = source.records.map(row => {
      const pointer = readerPointer(row.locator.textPointer);
      const cite = citations.mark({ sourceKind: 'REVIEW', identity: row.locator.pageSha256, locator: pointer.locator,
        label: 'Đánh giá khách hàng trên Shopee', retrievedAt: source.capture.retrievedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
      const rating = row.rating.state === 'VALID' ? `${row.rating.value}/5` : row.rating.state === 'ABSENT' ? 'nguồn không có số sao'
        : row.rating.state === 'MISSING' ? 'Nguồn có trường sao nhưng thiếu giá trị' : `Điểm nguồn không hợp lệ${row.rating.value === null ? '' : `: ${row.rating.value}`}`;
      const exclusion = row.exclusionReason === 'SOURCE_NATIVE_ALIAS' ? 'Bản lặp cùng định danh nguồn; không thêm vào mẫu hoặc phân loại'
        : row.disposition === 'INCLUDED' ? '' : row.text === null ? 'Phần chữ không đọc được' : row.text.trim() === '' ? 'Nguồn không có phần chữ' : 'Không được nguồn chấp nhận vào tập chữ đã chọn';
      return `<tr><td>${disposition[row.disposition]}${exclusion ? `<br>${exclusion}` : ''}</td><td>${row.text === null ? 'Phần chữ không đọc được' : row.text.trim() === '' ? 'Nguồn không có phần chữ' : retainedQuoteHtml(row.text, 'blockquote')}</td><td>${escape(rating)}</td><td>${row.sourceDate.literal === null ? 'Nguồn thiếu ngày; kỳ đo lường chưa rõ' : `${escape(row.sourceDate.literal)}; kỳ đo lường chưa rõ`}</td><td>${cite}</td></tr>`;
    }).join('');
    body = warning + qualification + '<p>Hồ sơ giữ nguyên phần đưa vào, tách riêng, không có chữ và không đọc được. Bản lặp cùng định danh nguồn không thêm vào mẫu; cùng chữ ở vị trí nguồn khác nhau vẫn giữ riêng. Số sao giữ riêng với cảm nhận do AI đề xuất, không tự suy khen hoặc chê.</p>'
      + `<div class="table-wrap"><table><caption>Bản ghi nguồn của đúng đề xuất; không phải bảng số người hoặc tỷ lệ dân số</caption><thead><tr><th>Trạng thái tập chữ</th><th>Nguyên văn</th><th>Số sao nguồn</th><th>Ngày từ nguồn</th><th>Vị trí nguồn</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  const failures = lintVisibleReportText(body).filter(result => !result.ok);
  if (failures.length) throw new TypeError(`INSIGHT_PERSONA_VISIBLE_TEXT_LINT_FAILED:${failures.map(result => result.rule).join(',')}`);
  return body;
}
