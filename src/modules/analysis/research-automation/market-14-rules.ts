import { MAX_COVER_JPEG_BYTES } from './cover-image-codec.js';
import { auditMarketReportHtml } from './market-business-gate.js';

const AI_COVER_PREFIX = 'data:image/jpeg;base64,';
const MAX_AI_COVER_BASE64 = Math.ceil(MAX_COVER_JPEG_BYTES / 3) * 4;
/** A rule-10 AI cover is a bounded, padded base64 JPEG that starts with SOI and ends with EOI. */
const isAiCoverJpeg = (src: string): boolean => {
  const payload = src.startsWith(AI_COVER_PREFIX) ? src.slice(AI_COVER_PREFIX.length) : '';
  if (!payload || payload.length > MAX_AI_COVER_BASE64 || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(payload)) return false;
  const bytes = Buffer.from(payload, 'base64');
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
};

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
  const text = visible(html);
  return [
    ...(text.match(/(?:[A-Za-z]:\\[^\s<>"']+|\/(?:home|Users)\/[^\s<>"']*)/gu) ?? []),
    ...(text.match(/\b[0-9a-f]{64}\b/giu) ?? []),
    ...(text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gu) ?? []),
    ...(text.match(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){2,}\b/gu) ?? []),
    ...(text.match(/\b[a-z]+(?:-[a-z]+){2,}\s+·\s+\d+\.\d+\.\d+\b/gu) ?? []),
    ...(text.match(/\b\w+\/\w+\.json\b/gu) ?? []),
    ...(text.match(/\/[a-z_]+\/\d+\b/gu) ?? []),
    ...(text.match(/\{\s*"[^"\\]+"\s*:/gu) ?? []),
    ...(text.match(/\b(?:UNKNOWN|ALL|WIDE|CORE|OUTSIDE|METHOD_OUTPUT|SOURCE_CONTEXT|EVIDENCE_INVENTORY|Sheet1)\b/gu) ?? []),
  ];
}

function sampleSizeIssues(html: string): string[] {
  return blocks(html).filter(block => /\btrong mẫu\b\s*(?:(?:\(\s*n\s*[=:]\s*\d+\s*\)\s*)?[:;,.!?]|(?:có|gồm)\s+|)\d/iu.test(block) &&
    !/(?:\bn\s*[=:]\s*\d+|mẫu\s+(?:gồm|có)\s+(?:n\s*[=:]\s*)?\d+|tệp\s+(?:gồm|có)\s+(?:n\s*[=:]\s*)?\d+)/iu.test(block));
}

function zeroSampleSizeIssues(html: string): string[] {
  // A Vietnamese word may end in the ASCII letter `n` (for example `sàn`).
  // Require the marker to start outside a letter/mark/number/underscore so that
  // `sàn: 0` cannot be mistaken for the real `n = 0` declaration.
  const zeroSampleCount = /(?<![\p{L}\p{M}\p{N}_])n\s*[=:]\s*0\b/iu;
  const zeroSampleCountGlobal = /(?<![\p{L}\p{M}\p{N}_])n\s*[=:]\s*0\b/giu;
  return blocks(html).filter(block => {
    if (!zeroSampleCount.test(block)) return false;
    const withoutZero = block.replace(zeroSampleCountGlobal, ' ');
    return /\b[1-9]\d*(?:[.,]\d+)*\b/gu.test(withoutZero);
  });
}

function hasSampleStatement(text: string): boolean {
  return /\bchưa có số lượng mẫu\b/iu.test(text) ||
    /\b(?:trong mẫu|mẫu|tệp)\b[^.!?]{0,160}\bn\s*=\s*\d+\b/iu.test(text) ||
    /\bn\s*=\s*\d+\s+(?:sản phẩm|dòng|bản ghi)\b/iu.test(text);
}

function tableFragments(html: string): string[] {
  return [...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/giu)].map(match => match[0] ?? '');
}

function tableRows(table: string): string[][] {
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/iu)?.[1] ?? table.replace(/<thead\b[^>]*>[\s\S]*?<\/thead>/iu, '');
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)].map(row =>
    [...(row[1] ?? '').matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/giu)].map(cell => visible(cell[1] ?? '')));
}

function tableHeadings(table: string): string[] {
  const head = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/iu)?.[1] ?? '';
  const row = head.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/iu)?.[1] ?? head;
  return [...row.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/giu)].map(cell => visible(cell[1] ?? ''));
}

function hasM12ProposalRows(html: string): boolean {
  const m12 = html.match(/<section\b[^>]*\bid=["'](?:phan-12|M12)["'][^>]*>[\s\S]*?<\/section>/iu)?.[0] ?? '';
  return tableFragments(m12).some(table => {
    const headings = tableHeadings(table);
    const option = headings.findIndex(value => /(?:việc\s*làm|phương\s*án|quick[- ]?win|option)/iu.test(value));
    const owner = headings.findIndex(value => /(?:người\s*phụ\s*trách|owner)/iu.test(value));
    const deadline = headings.findIndex(value => /(?:hạn|deadline|thời\s*hạn)/iu.test(value));
    const rows = tableRows(table);
    return option >= 0 && owner >= 0 && deadline >= 0 && rows.length === 3 && rows.every(row =>
      Boolean(row[option]?.trim()) && Boolean(row[owner]?.trim()) && Boolean(row[deadline]?.trim()) &&
      /đề xuất\s*,\s*chờ\s+chủ\s+duyệt/iu.test(row.join(' ')));
  });
}

function noteBlocks(html: string): string[] {
  const note = /<p\b(?=[^>]*\bclass=["'][^"']*\b(?:ex-note|lim)\b[^"']*["'])[^>]*>\s*<b>\s*Chú thích\s*:\s*<\/b>[\s\S]*?<\/p>/giu;
  return [...html.matchAll(note)].map(match => match[0] ?? '');
}

function noteProblems(html: string, text: string): { blocks: string[]; bad: string[] } {
  const blocksFound = noteBlocks(html);
  const withoutBlocks = blocksFound.reduce((value, block) => value.replace(block, ' '), html);
  return {
    blocks: blocksFound,
    bad: [
      ...(text.match(/Ghi chú\s*:/giu) ?? []),
      ...(visible(withoutBlocks).match(/Chú thích\s*:|Chú thích mang/giu) ?? []),
    ],
  };
}

function chartFragments(html: string): { tag: string; body: string }[] {
  return [...html.matchAll(/(<div\b(?=[^>]*\bclass=["'][^"']*\bchart\b[^"']*["'])[^>]*>)([\s\S]*?)<\/div>/giu)]
    .map(match => ({ tag: match[1] ?? '', body: match[2] ?? '' }));
}

function hasGeometry(svg: string): boolean {
  return [...svg.matchAll(/<(path|rect|circle|line)\b([^>]*)>/giu)].some(match => {
    const mark = (match[1] ?? '').toLowerCase(), attrs = match[2] ?? '';
    if (mark === 'path') return /\bd\s*=\s*["'][^"']*\S[^"']*["']/iu.test(attrs);
    if (mark === 'circle') return /\b(?:cx|cy|r)\s*=\s*["'][^"']+\S[^"']*["']/iu.test(attrs);
    if (mark === 'line') return /\b(?:x1|y1|x2|y2)\s*=\s*["'][^"']+\S[^"']*["']/iu.test(attrs);
    return /\b(?:x|y|width|height)\s*=\s*["'][^"']+\S[^"']*["']/iu.test(attrs);
  });
}

function nonEmptyPayload(value: string): boolean {
  const normalized = value.replace(/&quot;/giu, '"').replace(/&#x27;|&#39;/giu, "'").trim();
  return normalized !== '' && !/^(?:\[\s*\]|\{\s*\}|null|undefined|"?")$/iu.test(normalized);
}

function hasChartContent(tag: string, body: string): boolean {
  const svg = body.match(/<svg\b[\s\S]*?<\/svg>/iu)?.[0] ?? '';
  if (svg !== '' && hasGeometry(svg)) return true;
  const source = `${tag} ${body}`;
  return [...source.matchAll(/\bdata-(?:payload|chart-data|chart-payload|values|dataset)\s*=\s*(["'])([\s\S]*?)\1/giu)]
    .some(match => nonEmptyPayload(match[2] ?? '')) ||
    [...body.matchAll(/<script\b[^>]*\btype=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/giu)]
      .some(match => nonEmptyPayload(match[1] ?? ''));
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

const attribute = (tag: string, name: string): string | undefined => {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'iu').exec(tag);
  return match ? match[1] ?? match[2] ?? match[3] : undefined;
};

/** First header/section whose class list holds the exact token `cover`, through its matching close tag. */
function coverBlock(html: string): { open: string; block: string } {
  for (const match of html.matchAll(/<(header|section)\b[^>]*>/giu)) {
    if (!(attribute(match[0], 'class') ?? '').split(/\s+/u).includes('cover')) continue;
    const start = match.index, tags = new RegExp(`<(/?)${match[1]}\\b[^>]*>`, 'giu');
    tags.lastIndex = start + match[0].length;
    let depth = 1, end = html.length;
    for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
      depth += tag[1] ? -1 : 1;
      if (!depth) { end = tag.index + tag[0].length; break; }
    }
    return { open: match[0], block: html.slice(start, end) };
  }
  return { open: '', block: '' };
}

/**
 * Audit the owner’s fourteen Market-report rules without fetching or parsing source data.
 * `requireFlint: false` mirrors the builder's explicit test opt-out: charts may be the
 * hand-drawn SVG, but each still needs an engine marker, drawn content and the count of three.
 */
export function auditMarket14(html: string, trace?: string, options: { requireFlint?: boolean } = {}): Market14Result[] {
  const requireFlint = options.requireFlint ?? true;
  const text = visible(html);
  const gate = auditMarketReportHtml(html, { presentation: false });
  const gateResult = (rule: string): { ok: boolean; detail: string } => {
    const found = gate.find(item => item.rule === rule);
    return found === undefined ? { ok: false, detail: `${rule} result unavailable` } : found;
  };
  const glossary = glossaryText(html);
  const missingGlossary = GLOSSARY.filter(([term, explanation]) => !term.test(glossary) || !explanation.test(glossary)).map(([term]) => term.source);
  const sectionLabels = [...Array.from({ length: 12 }, (_, index) => `Phần ${index + 1}`), 'Phụ lục'].filter(label => !text.includes(label));
  const visibleCodes = text.match(/\bM(?:0[1-9]|1[0-3])\b/gu) ?? [];
  const appendixLabels = text.match(/Bảng\s+PL\.\d+/giu) ?? [];
  const notes = noteProblems(html, text);
  const { open: coverTag, block: coverHtml } = coverBlock(html);
  const coverImgs = coverHtml.match(/<img\b[^>]*>/giu) ?? [];
  const dataImg = (tag: string): boolean => /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/u.test(attribute(tag, 'src') ?? '');
  const image = /data:image\/(?:jpeg|png|webp);base64,/iu.test(coverTag) || coverImgs.some(dataImg);
  const externalCover = /url\(\s*['"]?\s*(?:https?:)?\/\//iu.test(coverTag) || coverImgs.some(tag => !dataImg(tag) && !/^data:image\/(?:jpeg|png|webp);/iu.test(attribute(tag, 'src') ?? ''));
  const aiProvenance = (tag: string): boolean => attribute(tag, 'data-cover-provenance') === 'ai-generated';
  const malformedCover = /data:image\/(?:jpeg|png|webp);(?!base64,)/iu.test(coverHtml) || coverImgs.some(tag => !dataImg(tag) && /^data:/iu.test(attribute(tag, 'src') ?? ''))
    || coverImgs.some(tag => aiProvenance(tag) && !isAiCoverJpeg(attribute(tag, 'src') ?? ''));
  const aiCover = coverImgs.some(tag => aiProvenance(tag) && isAiCoverJpeg(attribute(tag, 'src') ?? '') && (attribute(tag, 'alt') ?? '').trim() !== '');
  const licensedCover = image && Boolean(trace) && /(?:CC0|public-domain|owner-supplied|licensed|giấy phép)/iu.test(trace ?? '');
  const charts = chartFragments(html);
  const chartIssues = charts.flatMap(({ tag, body }) => {
    const engine = tag.match(/data-engine=["']([^"']*)["']/iu)?.[1];
    if (engine === undefined) return ['chart missing engine marker'];
    if (engine !== 'flint' && (requireFlint || engine !== 'svg-fallback')) return [`chart drawn by ${engine || 'an unnamed engine'}, not Flint`];
    return hasChartContent(tag, body) ? [] : ['chart has an engine marker but no drawn data or payload'];
  });
  // A Market report whose sample has product rows must carry the three required charts.
  const chartRowsMarker = html.match(/data-market-chart-rows=["'](\d+)["']/iu)?.[1];
  const chartRows = chartRowsMarker !== undefined ? Number(chartRowsMarker)
    : Math.max(0, ...[...text.matchAll(/\bn\s*=\s*(\d+)/gu)].map(match => Number(match[1])));
  if (chartRows > 0 && charts.length < 3) chartIssues.push(`only ${charts.length} of 3 required charts (concentration, revenue by platform, product ranking)`);
  const iconCounts = { shopee: (text.match(/\bShopee\b/gu) ?? []).length, tiktok: (text.match(/\bTikTok\s+Shop\b/gu) ?? []).length };
  const icons = { shopee: (html.match(/<i\b[^>]*class=["'][^"']*\bpi\s+s\b[^"']*["'][^>]*>/giu) ?? []).length,
    tiktok: (html.match(/<i\b[^>]*class=["'][^"']*\bpi\s+t\b[^"']*["'][^>]*>/giu) ?? []).length };
  const localIconCss = /data:image\/svg\+xml;base64,/iu.test(html);
  const m12Structure = hasM12ProposalRows(html);
  const sources = sourceCoverage(html);
  const sampleIssues = sampleSizeIssues(html);
  const zeroSampleIssues = zeroSampleSizeIssues(html);
  const tables = platformTableIssues(html);
  const declaredPlatforms = html.match(/data-market-platforms=["']([^"']*)["']/iu)?.[1]?.split(',').map(value => value.trim()).filter(Boolean) ?? ['shopee', 'tiktok'];
  const allPlatformsMentioned = declaredPlatforms.every(platform => platform === 'shopee' ? /\bShopee\b/iu.test(text) : /\bTikTok\s+Shop\b/iu.test(text));

  return [
    result('1', missingGlossary.length === 0, 'machine', missingGlossary.length ? `missing glossary entries: ${missingGlossary.join(', ')}` : 'plain-Vietnamese glossary is present'),
    result('2', sectionLabels.length === 0 && visibleCodes.length === 0 && appendixLabels.length > 0, 'machine', sectionLabels.length || visibleCodes.length || appendixLabels.length === 0 ? `missing labels: ${sectionLabels.join(', ')}${visibleCodes.length ? `; visible codes: ${visibleCodes.join(', ')}` : ''}${appendixLabels.length === 0 ? '; no PL.x table label' : ''}` : 'Phần/Phụ lục labels and PL.x table labels are visible; technical ids are not'),
    result('3', technicalLeaks(html).length === 0, 'machine', snippets(technicalLeaks(html))),
    result('4', gateResult('G08_PROVIDER_NAME').ok && !/\bGoogle\b/iu.test(text), 'machine', /\bGoogle\b/iu.test(text) ? 'visible provider/tool name: Google' : gateResult('G08_PROVIDER_NAME').detail),
    result('5', notes.blocks.length > 0 && notes.bad.length === 0, 'machine', notes.blocks.length === 0 ? 'missing standalone Chú thích: note block' : notes.bad.length ? snippets(notes.bad) : 'notes use their own line'),
    result('6', true, 'evidence', evidenceDetail(html, [/doanh thu|tỷ trọng|giá trung bình/iu])),
    result('7', gateResult('U32_NO_CROSS_PLATFORM_TOTAL').ok && hasSampleStatement(text) && sampleIssues.length === 0 && zeroSampleIssues.length === 0 && !/(?:thị phần|quy mô thị trường)\s+(?:là|đạt|tăng|giảm|chiếm)\s*\d/iu.test(text), 'machine', sampleIssues.length ? snippets(sampleIssues) : zeroSampleIssues.length ? snippets(zeroSampleIssues) : hasSampleStatement(text) ? gateResult('U32_NO_CROSS_PLATFORM_TOTAL').detail : 'missing n = sample statement'),
    result('8', true, 'evidence', evidenceDetail(html, [/nhận định|nhóm|doanh thu|giá/iu])),
    result('9', m12Structure, 'machine', m12Structure ? 'M12 has three labelled proposal rows, a quick-win label, owner and deadline fields' : 'M12 is missing the three-option, quick-win, owner, deadline or approval-label structure'),
    result('10', externalCover || malformedCover ? false : aiCover, externalCover || malformedCover || aiCover ? 'machine' : 'evidence', externalCover || malformedCover ? 'cover must be an embedded stored asset; external or malformed cover markup (or an AI cover that is not a bounded base64 JPEG) is not allowed' : aiCover ? 'cover image is embedded with AI-generated provenance and alt text; a generic illustration, no licence claimed' : licensedCover ? 'READ: a licensed or owner-supplied cover needs owner review; only an embedded AI-generated JPEG with alt text passes automatically' : 'READ: no embedded AI-generated JPEG cover with alt text'),
    result('11', (!iconCounts.shopee || icons.shopee >= iconCounts.shopee) && (!iconCounts.tiktok || icons.tiktok >= iconCounts.tiktok) && localIconCss && chartIssues.length === 0, 'machine', chartIssues.length ? chartIssues.join('; ') : `platform icons: ${icons.shopee}/${iconCounts.shopee} Shopee, ${icons.tiktok}/${iconCounts.tiktok} TikTok Shop`),
    result('12', allPlatformsMentioned && tables.length === 0, 'machine', tables.length ? `tables without a platform label: ${tables.length}` : allPlatformsMentioned ? 'Shopee and TikTok Shop are labelled in platform exhibits' : 'both platforms are not labelled'),
    result('13', sources.every(source => source.ok), 'machine', sources.filter(source => !source.ok).length ? `missing source labels: ${sources.filter(source => !source.ok).map(source => source.label).join(', ')}` : 'all four neutral source labels are present'),
    result('14', true, 'evidence', evidenceDetail(html, [/đánh giá|review|bình luận|300/iu])),
  ];
}

export function assertMarket14MachineRules(html: string, trace?: string, options: { requireFlint?: boolean } = {}): void {
  const audited = auditMarket14(html, trace, options);
  const failed = audited.filter(rule => rule.kind === 'machine' && !rule.ok);
  if (failed.length) throw new TypeError(`MARKET_14_RULES_FAILED:${failed.map(rule => rule.rule).join(',')}`);
}
