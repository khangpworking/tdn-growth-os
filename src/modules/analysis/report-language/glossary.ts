/** One Market glossary entry: the reader-visible term, its plain Vietnamese meaning and the pattern that accepts an explanation. */
export interface GlossaryEntry {
  readonly term: string;
  readonly meaning: string;
  readonly meaningPattern: RegExp;
  /** True for terms only the current reader defines; checker rule 1 never requires them. */
  readonly readerOnly: boolean;
}

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** The one presence matcher for a glossary term: Unicode word edges, case-insensitive, any internal space may be absent or repeated. */
export function glossaryTermPattern(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${term.split(/\s+/u).map(escape).join('\\s*')}(?![\\p{L}\\p{N}_])`, 'iu');
}

const checker = (term: string, meaning: string, meaningPattern: RegExp): GlossaryEntry => ({ term, meaning, meaningPattern, readerOnly: false });
const reader = (term: string, meaning: string): GlossaryEntry => ({
  term, meaning, meaningPattern: new RegExp(meaning.split(/\s+/u).map(escape).join('\\s+'), 'iu'), readerOnly: true,
});

/** Checker rule 1 terms first, then the reader-only terms of the current automation reader. Order and strings are pinned by reader hashes. */
export const MARKET_GLOSSARY: readonly GlossaryEntry[] = [
  checker('listing', 'sản phẩm', /sản phẩm/iu),
  checker('review', 'đánh giá', /đánh giá/iu),
  checker('reviews', 'đánh giá', /đánh giá/iu),
  checker('export', 'tệp dữ liệu', /tệp dữ liệu/iu),
  checker('peer set', 'nhóm đối thủ', /nhóm đối thủ/iu),
  checker('variant', 'biến thể', /biến thể/iu),
  checker('pack', 'gói', /gói/iu),
  checker('insight', 'hiểu biết', /hiểu biết/iu),
  checker('section', 'phần', /phần/iu),
  checker('Giá TB', 'giá trung bình', /giá trung bình/iu),
  checker('P25', 'mốc 25 phần trăm', /mốc\s*25(?:%|\s+phần trăm)/iu),
  checker('P75', 'mốc 75 phần trăm', /mốc\s*75(?:%|\s+phần trăm)/iu),
  checker('NSX', 'nhà sản xuất', /nhà sản xuất/iu),
  checker('H1', 'giả thuyết 1', /giả thuyết\s*1/iu),
  checker('ROAS', 'tỷ lệ doanh thu trên chi phí quảng cáo', /doanh thu trên chi phí quảng cáo|tỷ lệ doanh thu trên chi phí quảng cáo/iu),
  checker('CPA', 'chi phí trên đơn', /chi phí trên đơn|chi phí mỗi đơn/iu),
  checker('AI', 'trí tuệ nhân tạo', /trí tuệ nhân tạo|mô hình/iu),
  reader('CPI', 'chỉ số giá tiêu dùng'), reader('USD', 'đô la Mỹ'), reader('VND', 'đồng Việt Nam'),
  reader('HS', 'mã phân loại hàng hóa trong thương mại quốc tế'), reader('HS code', 'mã phân loại hàng hóa trong thương mại quốc tế'),
  reader('HS6', 'mã phân loại hàng hóa quốc tế gồm sáu chữ số'), reader('UTC', 'giờ quốc tế phối hợp'),
  reader('GDP', 'tổng sản phẩm trong nước'), reader('PDF', 'định dạng tài liệu giữ nguyên bố cục'),
  reader('SKU', 'mã quản lý một loại hàng hoặc biến thể'), reader('CC BY', 'giấy phép cho phép sử dụng lại với điều kiện ghi công nguồn'),
  reader('World Bank Open Data', 'dữ liệu mở của Ngân hàng Thế giới'),
  reader('BLDC', 'động cơ điện một chiều không chổi than'), reader('DC', 'dòng điện một chiều'), reader('AC', 'dòng điện xoay chiều'),
  reader('RPM', 'số vòng quay mỗi phút'), reader('motor', 'động cơ'), reader('brushless', 'không chổi than'),
];
