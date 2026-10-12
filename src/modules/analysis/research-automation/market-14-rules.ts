import { auditMarketReportHtml } from './market-business-gate.js';

export type Market14Result = {
  rule: string;
  ok: boolean;
  kind: 'machine' | 'evidence';
  detail: string;
};

const decode = (value: string): string => value.replace(/&#x([\da-f]+);?|&#(\d+);?|&([a-z]+);/giu,
  (all, hex?: string, decimal?: string, name?: string) => {
    const code = hex ? Number.parseInt(hex, 16) : decimal ? Number(decimal) : NaN;
    if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) return String.fromCodePoint(code);
    return ({ amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' } as Record<string, string>)[(name ?? '').toLowerCase()] ?? all;
  });

function visible(html: string): string {
  return decode(html
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<(?:script|style|noscript|template|title)\b[\s\S]*?<\/(?:script|style|noscript|template|title)>/giu, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')).replace(/\s+/gu, ' ').trim();
}

function snippets(values: readonly string[]): string {
  const unique = [...new Set(values.map(value => value.replace(/\s+/gu, ' ').trim()).filter(Boolean))].slice(0, 3);
  return unique.length ? unique.map(value => `snippet:${value.slice(0, 160)}`).join(' | ') : 'clean';
}

function blocks(html: string): string[] {
  return [...html.matchAll(/<(?:p|li|td|th|h[1-6])\b[^>]*>([\s\S]*?)<\/(?:p|li|td|th|h[1-6])>/giu)]
    .map(match => visible(match[1] ?? '')).filter(Boolean);
}

function section(html: string, id: string): string {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return html.match(new RegExp(`<section\\b[^>]*\\bid=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/section>`, 'iu'))?.[0] ?? '';
}

function result(rule: string, ok: boolean, kind: Market14Result['kind'], detail: string): Market14Result {
  return { rule, ok, kind, detail };
}

const GLOSSARY: readonly [RegExp, RegExp][] = [
  [/\blisting\b/iu, /sản phẩm/iu],
  [/\breview\b/iu, /đánh giá/iu],
  [/\bexport\b/iu, /tệp dữ liệu/iu],
  [/peer\s*set/iu, /nhóm đối thủ/iu],
  [/giá\s*TB/iu, /giá trung bình/iu],
  [/P25/iu, /mốc\s*25%/iu],
  [/P75/iu, /mốc\s*75%/iu],
  [/\bNSX\b/iu, /nhà sản xuất/iu],
  [/\bH1\b/iu, /giả thuyết\s*1/iu],
  [/\bROAS\b/iu, /doanh thu trên chi phí quảng cáo|tỷ lệ doanh thu trên chi phí quảng cáo/iu],
  [/\bCPA\b/iu, /chi phí trên đơn|chi phí mỗi đơn/iu],
  [/\bAI\b/iu, /trí tuệ nhân tạo|mô hình/iu],
];

function glossaryText(html: string): string {
  const match = html.match(/<(?:dl|table)\b[^>]*(?:class=["'][^"']*pl-terms|data-glossary=["'][^"']*true)[^>]*>[\s\S]*?<\/(?:dl|table)>/iu);
  return visible(match?.[0] ?? '');
}

function technicalLeaks(html: string): string[] {
  const body = html
    .replace(/<[^>]*\bdata-quote(?:\s|=|>)[\s\S]*?<\/[^>]+>/giu, ' ');
  const text = visible(body);
  return [
    ...(text.match(/(?:[A-Za-z]:\\[^\s<>"']+|\/(?:home|Users)\/[^\s<>"']*)/gu) ?? []),
    ...(text.match(/\b[0-9a-f]{64}\b/giu) ?? []),
    ...(text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gu) ?? []),
    ...(text.match(/\b(?:UNKNOWN|ALL|WIDE|CORE|OUTSIDE|METHOD_OUTPUT|SOURCE_CONTEXT|EVIDENCE_INVENTORY|Sheet1)\b/gu) ?? []),
  ];
}

function sampleSizeIssues(html: string): string[] {
  return blocks(html).filter(block => /\btrong mẫu\b\s*(?:(?:\(\s*n\s*[=:]\s*\d+\s*\)\s*)?[:;,.!?]|(?:có|gồm)\s+|)\d/iu.test(block) &&
    !/(?:\bn\s*[=:]\s*\d+|mẫu\s+(?:gồm|có)\s+(?:n\s*[=:]\s*)?\d+|tệp\s+(?:gồm|có)\s+(?:n\s*[=:]\s*)?\d+)/iu.test(block));
}

function tableFragments(html: string): string[] {
  return [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/giu)].map(match => match[0] ?? '');
}

function platformTableIssues(html: string): string[] {
  const ignored = /data-glossary|market14-sources|market14-glossary|class=["'][^"']*(?:pl-terms|pl-web)[^"']*["']|(?:Nguồn số liệu|Nguồn số liệu đã lưu|Kết quả tìm kiếm trên web)/iu;
  return tableFragments(html).filter(table => !ignored.test(table) && /<th[^>]*>\s*(?:Sàn|Nền tảng|Platform)\s*<\/th>/iu.test(table)
    && !/Shopee|TikTok\s+Shop/iu.test(visible(table)));
}

function sourceCoverage(html: string): { label: string; ok: boolean }[] {
  const text = visible(html);
  return [
    { label: 'sales metrics', ok: /dữ liệu bán hàng|số liệu bán hàng|doanh thu bán hàng/iu.test(text) },
    { label: 'review platform data', ok: /dữ liệu đánh giá|đánh giá sản phẩm|nguồn đánh giá/iu.test(text) },
    { label: 'search results', ok: /kết quả tìm kiếm/iu.test(text) },
    { label: 'comment scraping', ok: /bình luận đã thu|dữ liệu bình luận|nguồn bình luận/iu.test(text) },
  ];
}

function evidenceDetail(html: string, terms: readonly RegExp[]): string {
  const found = blocks(html).filter(block => terms.some(term => term.test(block))).slice(0, 3);
  return found.length ? `READ: ${snippets(found)}` : 'READ: reviewer must inspect the report claims and their cited number, figure or table.';
}

/** Audit the owner’s fourteen Market-report rules without fetching or parsing source data. */
export function auditMarket14(html: string, trace?: string): Market14Result[] {
  const text = visible(html);
  const gate = auditMarketReportHtml(html, { presentation: false });
  const gateResult = (rule: string): { ok: boolean; detail: string } => {
    const found = gate.find(item => item.rule === rule);
    return found === undefined ? { ok: false, detail: `${rule} result unavailable` } : found;
  };
  const glossary = glossaryText(html);
  const missingGlossary = GLOSSARY.filter(([term, explanation]) => !term.test(glossary) || !explanation.test(glossary)).map(([term]) => term.source);
  const reader = /id=["'](?:phan-\d+|phu-luc)["']/iu.test(html);
  const sectionLabels = [...Array.from({ length: 12 }, (_, index) => `Phần ${index + 1}`), 'Phụ lục'].filter(label => !text.includes(label));
  const visibleCodes = text.match(/\bM(?:0[1-9]|1[0-3])\b/gu) ?? [];
  const appendixLabels = text.match(/Bảng\s+PL\.\d+/giu) ?? [];
  const noteBad = [
    ...(text.match(/Ghi chú\s*:/giu) ?? []),
    ...(text.match(/Chú thích mang[^.]{0,100}/giu) ?? []),
  ]; const limNotes = [...html.matchAll(/<(?:p|div)\b[^>]*class=["'][^"']*(?:ex-note|lim)[^"']*["'][^>]*>/giu)].length;
  const coverTag = html.match(/<header\b[^>]*class=["'][^"']*\bcover\b[^"']*[^>]*>/iu)?.[0] ?? '';
  const image = /data:image\/(?:jpeg|png|webp);base64,/iu.test(coverTag);
  const externalCover = /(?:url\(['"]?https?:|<img\b[^>]*\bsrc=["']https?:)/iu.test(coverTag);
  const malformedCover = /data:image\/(?:jpeg|png|webp);(?!base64,)/iu.test(coverTag);
  const coverRead = !image || !trace || !/(?:CC0|public-domain|owner-supplied|licensed|giấy phép)/iu.test(trace);
  const chartIssues = [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bchart\b[^"']*["'][^>]*>/giu)]
    .map(match => match[0]).filter(tag => !/data-engine=["'](?:flint|svg-fallback)["']/iu.test(tag));
  const iconCounts = { shopee: (text.match(/\bShopee\b/gu) ?? []).length, tiktok: (text.match(/\bTikTok\s+Shop\b/gu) ?? []).length };
  const icons = { shopee: (html.match(/<i\b[^>]*class=["'][^"']*\bpi\s+s\b[^"']*["'][^>]*>/giu) ?? []).length,
    tiktok: (html.match(/<i\b[^>]*class=["'][^"']*\bpi\s+t\b[^"']*["'][^>]*>/giu) ?? []).length };
  const localIconCss = /data:image\/svg\+xml;base64,/iu.test(html);
  const m12 = section(html, reader ? 'phan-12' : 'M12');
  const m12Text = visible(m12), m12Tables = tableFragments(m12);
  const m12Options = m12Tables.some(table => (table.match(/<tr\b/giu) ?? []).length >= 4);
  const m12Structure = m12Options && /(?:ba|3)\s+phương án|phương án/iu.test(m12Text) && /(?:việc làm nhanh|việc làm ngay)/iu.test(m12Text) && /người phụ trách/iu.test(m12Text) && /hạn/iu.test(m12Text) && /đề xuất[, ]+chờ chủ duyệt/iu.test(m12Text);
  const sources = sourceCoverage(html);
  const sampleIssues = sampleSizeIssues(html);
  const tables = platformTableIssues(html);
  const declaredPlatforms = html.match(/data-market-platforms=["']([^"']*)["']/iu)?.[1]?.split(',').map(value => value.trim()).filter(Boolean) ?? ['shopee', 'tiktok'];
  const allPlatformsMentioned = declaredPlatforms.every(platform => platform === 'shopee' ? /\bShopee\b/iu.test(text) : /\bTikTok\s+Shop\b/iu.test(text));

  return [
    result('1', missingGlossary.length === 0, 'machine', missingGlossary.length ? `missing glossary entries: ${missingGlossary.join(', ')}` : 'plain-Vietnamese glossary is present'),
    result('2', sectionLabels.length === 0 && visibleCodes.length === 0 && appendixLabels.length > 0, 'machine', sectionLabels.length || visibleCodes.length || appendixLabels.length === 0 ? `missing labels: ${sectionLabels.join(', ')}${visibleCodes.length ? `; visible codes: ${visibleCodes.join(', ')}` : ''}${appendixLabels.length === 0 ? '; no PL.x table label' : ''}` : 'Phần/Phụ lục labels and PL.x table labels are visible; technical ids are not'),
    result('3', technicalLeaks(html).length === 0, 'machine', snippets(technicalLeaks(html))),
    result('4', gateResult('G08_PROVIDER_NAME').ok && !/\bGoogle\b/iu.test(text), 'machine', /\bGoogle\b/iu.test(text) ? 'visible provider/tool name: Google' : gateResult('G08_PROVIDER_NAME').detail),
    result('5', noteBad.length === 0 && limNotes >= 0, 'machine', noteBad.length ? snippets(noteBad) : 'notes use their own line'),
    result('6', true, 'evidence', evidenceDetail(html, [/doanh thu|tỷ trọng|giá trung bình/iu])),
    result('7', gateResult('U32_NO_CROSS_PLATFORM_TOTAL').ok && sampleIssues.length === 0 && !/(?:thị phần|quy mô thị trường)\s+(?:là|đạt|tăng|giảm|chiếm)\s*\d/iu.test(text), 'machine', sampleIssues.length ? snippets(sampleIssues) : gateResult('U32_NO_CROSS_PLATFORM_TOTAL').detail),
    result('8', true, 'evidence', evidenceDetail(html, [/nhận định|nhóm|doanh thu|giá/iu])),
    result('9', m12Structure, 'machine', m12Structure ? 'M12 has three labelled proposal rows, a quick-win label, owner and deadline fields' : 'M12 is missing the three-option, quick-win, owner, deadline or approval-label structure'),
    result('10', externalCover || malformedCover ? false : !coverRead && image, externalCover || malformedCover ? 'machine' : coverRead ? 'evidence' : 'machine', externalCover || malformedCover ? 'cover must be an embedded stored asset; external or malformed cover markup is not allowed' : coverRead ? 'READ: needs owner/asset and a trace entry with the reuse licence' : 'cover image is embedded and licensed in the trace'),
    result('11', (!iconCounts.shopee || icons.shopee >= iconCounts.shopee) && (!iconCounts.tiktok || icons.tiktok >= iconCounts.tiktok) && localIconCss && chartIssues.length === 0, 'machine', chartIssues.length ? `charts missing engine marker: ${chartIssues.length}` : `platform icons: ${icons.shopee}/${iconCounts.shopee} Shopee, ${icons.tiktok}/${iconCounts.tiktok} TikTok Shop`),
    result('12', allPlatformsMentioned && tables.length === 0, 'machine', tables.length ? `tables without a platform label: ${tables.length}` : allPlatformsMentioned ? 'Shopee and TikTok Shop are labelled in platform exhibits' : 'both platforms are not labelled'),
    result('13', sources.every(source => source.ok), 'machine', sources.filter(source => !source.ok).length ? `missing source labels: ${sources.filter(source => !source.ok).map(source => source.label).join(', ')}` : 'all four neutral source labels are present'),
    result('14', true, 'evidence', evidenceDetail(html, [/đánh giá|review|bình luận|300/iu])),
  ];
}

export function assertMarket14MachineRules(html: string, trace?: string): void {
  const audited = auditMarket14(html, trace);
  const failed = audited.filter(rule => rule.kind === 'machine' && !rule.ok);
  if (failed.length) throw new TypeError(`MARKET_14_RULES_FAILED:${failed.map(rule => rule.rule).join(',')}`);
}
