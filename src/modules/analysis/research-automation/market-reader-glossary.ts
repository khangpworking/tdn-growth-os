import { GLOSSARY as CHECKER_RULE1_TERMS } from './market-14-rules.js';

/** Reader vocabulary only. Definitions remain only when the delivered body uses the term. */
export const MARKET_READER_TERMS: readonly (readonly [string, string])[] = [
  ['listing', 'sản phẩm'], ['review', 'đánh giá'], ['reviews', 'đánh giá'], ['export', 'tệp dữ liệu'],
  ['peer set', 'nhóm đối thủ'], ['variant', 'biến thể'], ['pack', 'gói'], ['insight', 'hiểu biết'], ['section', 'phần'],
  ['Giá TB', 'giá trung bình'], ['P25', 'mốc 25 phần trăm'], ['P75', 'mốc 75 phần trăm'],
  ['NSX', 'nhà sản xuất'], ['H1', 'giả thuyết 1'], ['ROAS', 'tỷ lệ doanh thu trên chi phí quảng cáo'],
  ['CPA', 'chi phí trên đơn'], ['AI', 'trí tuệ nhân tạo'],
];

/** Current automation reader only; the versioned templates retain the vocabulary above. */
export const CURRENT_MARKET_READER_TERMS: readonly (readonly [string, string])[] = [
  ...MARKET_READER_TERMS,
  ['CPI', 'chỉ số giá tiêu dùng'], ['USD', 'đô la Mỹ'], ['VND', 'đồng Việt Nam'],
  ['HS', 'mã phân loại hàng hóa trong thương mại quốc tế'], ['HS code', 'mã phân loại hàng hóa trong thương mại quốc tế'],
  ['HS6', 'mã phân loại hàng hóa quốc tế gồm sáu chữ số'], ['UTC', 'giờ quốc tế phối hợp'],
  ['GDP', 'tổng sản phẩm trong nước'], ['PDF', 'định dạng tài liệu giữ nguyên bố cục'],
  ['SKU', 'mã quản lý một loại hàng hoặc biến thể'], ['CC BY', 'giấy phép cho phép sử dụng lại với điều kiện ghi công nguồn'],
  ['World Bank Open Data', 'dữ liệu mở của Ngân hàng Thế giới'],
  ['BLDC', 'động cơ điện một chiều không chổi than'], ['DC', 'dòng điện một chiều'], ['AC', 'dòng điện xoay chiều'],
  ['RPM', 'số vòng quay mỗi phút'], ['motor', 'động cơ'], ['brushless', 'không chổi than'],
];

const GLOSSARY_TABLE = /<table\b[^>]*(?:data-glossary="true"|class="[^"]*\bpl-terms-table\b[^"]*")[^>]*>[\s\S]*?<\/table>/gu;

function authoredProse(html: string): string {
  const excluded: string[] = [];
  return html.split(/(<!--[\s\S]*?-->|<(?:[^<>"']|"[^"]*"|'[^']*')+>)/gu).map((part, index) => {
    if (index % 2 === 0) return excluded.length ? ' ' : part;
    if (part.startsWith('<!--')) return ' ';
    const tag = /^<\/?([\w-]+)/u.exec(part)?.[1]?.toLowerCase();
    if (!tag) return ' ';
    if (part.startsWith('</')) {
      if (excluded.at(-1) === tag) excluded.pop();
    } else if (!/\/>$/u.test(part) && !['br', 'hr', 'img', 'input', 'wbr', 'meta', 'link', 'source', 'col'].includes(tag)
      && (excluded.length || ['q', 'blockquote', 'code', 'pre', 'svg', 'style', 'script', 'title', 'template', 'noscript'].includes(tag)
        || /\b(?:data-quote|hidden)(?:\s|=|>)|\baria-hidden="true"/iu.test(part))) excluded.push(tag);
    return ' ';
  }).join('').replace(/(?:https?:\/\/|www\.)[^\s<>]+/giu, ' ');
}

const visibleText = (html: string): string => html.replace(/<!--[\s\S]*?-->/gu, ' ')
  .replace(/<(?:style|script|svg|title|template|noscript)\b[\s\S]*?<\/(?:style|script|svg|title|template|noscript)>/giu, ' ')
  .replace(/<(?:[^<>"']|"[^"]*"|'[^']*')+>/gu, ' ')
  .replace(/&#x([\da-f]+);|&#(\d+);|&nbsp;/giu, (all, hex?: string, dec?: string) => {
    if (!hex && !dec) return ' ';
    const code = hex ? Number.parseInt(hex, 16) : Number(dec);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  }).replace(/\s+/gu, ' ');

export function filterReaderGlossary(html: string, options: { readonly currentReader?: boolean } = {}): string {
  const body = html.replace(GLOSSARY_TABLE, ' ');
  // Shared callers keep their historical quote-inclusive scan. Only the current reader scans authored prose.
  const scanned = visibleText(body);
  const prose = options.currentReader ? visibleText(authoredProse(body)) : scanned;
  // Current reader: a term checker rule 1 requires keeps its entry wherever rule 1 finds it, quotes included.
  const required = options.currentReader ? CHECKER_RULE1_TERMS.filter(([term]) => term.test(scanned)) : [];
  return html.replace(GLOSSARY_TABLE, table => table.replace(/<tr><td>([^<]+)<\/td><td>([^<]*)<\/td><\/tr>/gu, (row, term: string, meaning: string) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    if (new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(prose)) return row;
    const definition = `${term} ${meaning}`;
    return required.some(([name, explanation]) => name.test(definition) && explanation.test(definition)) ? row : '';
  }));
}
