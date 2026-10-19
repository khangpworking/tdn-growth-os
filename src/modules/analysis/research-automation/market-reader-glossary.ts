/** Reader vocabulary only. Definitions remain only when the delivered body uses the term. */
export const MARKET_READER_TERMS: readonly (readonly [string, string])[] = [
  ['listing', 'sản phẩm'], ['review', 'đánh giá'], ['reviews', 'đánh giá'], ['export', 'tệp dữ liệu'],
  ['peer set', 'nhóm đối thủ'], ['variant', 'biến thể'], ['pack', 'gói'], ['insight', 'hiểu biết'], ['section', 'phần'],
  ['Giá TB', 'giá trung bình'], ['P25', 'mốc 25 phần trăm'], ['P75', 'mốc 75 phần trăm'],
  ['NSX', 'nhà sản xuất'], ['H1', 'giả thuyết 1'], ['ROAS', 'tỷ lệ doanh thu trên chi phí quảng cáo'],
  ['CPA', 'chi phí trên đơn'], ['AI', 'trí tuệ nhân tạo'],
];

const GLOSSARY_TABLE = /<table\b[^>]*(?:data-glossary="true"|class="[^"]*\bpl-terms-table\b[^"]*")[^>]*>[\s\S]*?<\/table>/gu;
export function filterReaderGlossary(html: string): string {
  // Source entries and verbatim quotes are visible too; only definitions and hidden markup are excluded.
  const prose = html.replace(GLOSSARY_TABLE, ' ').replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<(?:style|script|svg|title|template|noscript)\b[\s\S]*?<\/(?:style|script|svg|title|template|noscript)>/giu, ' ')
    .replace(/<(?:[^<>"']|"[^"]*"|'[^']*')+>/gu, ' ')
    .replace(/&#x([\da-f]+);|&#(\d+);|&nbsp;/giu, (all, hex?: string, dec?: string) => {
      if (!hex && !dec) return ' ';
      const code = hex ? Number.parseInt(hex, 16) : Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    }).replace(/\s+/gu, ' ');
  return html.replace(GLOSSARY_TABLE, table => table.replace(/<tr><td>([^<]+)<\/td><td>[^<]*<\/td><\/tr>/gu, (row, term: string) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(prose) ? row : '';
  }));
}
