import { CAPTURED_PROVIDER_NAMES, FORBIDDEN_PROVIDER_NAMES } from '../reader-report/lint.js';
import { lintVisibleReportText } from '../report-visible-text-lint.js';

export type MarketBusinessGateResult = { rule: string; ok: boolean; detail: string };

const MARKET_SECTION_IDS = Array.from({ length: 13 }, (_, index) => `M${String(index + 1).padStart(2, '0')}`);

// This is intentionally an explicit list. Do not replace it with a fuzzy
// cross-platform or arithmetic heuristic: separate platform text is allowed.
const CROSS_PLATFORM_TOTAL_PHRASES: readonly string[] = [
  'tổng hai sàn',
  'cộng hai sàn',
  'tổng cộng hai nền tảng',
  'Shopee + TikTok',
  'Shopee + TikTok Shop',
  'gộp Shopee và TikTok',
  'gộp Shopee và TikTok Shop',
  'gộp TikTok và Shopee',
  'gộp TikTok Shop và Shopee',
  'cộng Shopee và TikTok',
  'cộng Shopee và TikTok Shop',
  'cộng TikTok và Shopee',
  'cộng TikTok Shop và Shopee',
];

const PROPOSAL_TERMS = /(?:phương án|lựa chọn|\boption\b|\bproposal\b|\baction_option\b)/iu;
const E2_TERMS = /(?:Thứ tự theo doanh thu|\btop\s*3\b|xếp hạng|thị phần)/giu;
const MODEL_ID = /\b(?:gpt|claude)-[A-Za-z0-9][A-Za-z0-9._-]*\b/giu;
const TAG_NAME = /^<\/?([\w:-]+)/u;
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

type Frame = { tag: string; hidden: boolean; quote: boolean; heading: boolean; sectionId: string | null };
type TextSegment = { text: string; author: boolean; sectionId: string | null };
type Scan = { visible: string; authored: string; sections: Map<string, string>; segments: TextSegment[] };

function decodeHtml(value: string): string {
  const named: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return value.replace(/&#x([\da-f]+);?|&#(\d+);?|&([a-z]+);/giu, (all, hex?: string, dec?: string, name?: string) => {
    const code = hex ? parseInt(hex, 16) : dec ? Number(dec) : NaN;
    if (Number.isFinite(code)) return code <= 0x10ffff ? String.fromCodePoint(code) : all;
    return named[(name ?? '').toLowerCase()] ?? all;
  });
}

function attributes(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of tag.matchAll(/\s([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/gu)) {
    out.set((match[1] ?? '').toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return out;
}

function scanHtml(html: string): Scan {
  const stack: Frame[] = [];
  const visible: string[] = [];
  const authored: string[] = [];
  const sections = new Map<string, string>();
  const segments: TextSegment[] = [];
  const addText = (value: string, frame: Frame | undefined): void => {
    if (!value || frame?.hidden) return;
    const text = decodeHtml(value);
    if (!text) return;
    const sectionId = [...stack].reverse().find(item => item.sectionId !== null)?.sectionId ?? null;
    visible.push(text);
    segments.push({ text, author: !stack.some(item => item.quote || item.heading), sectionId });
    if (!stack.some(item => item.quote || item.heading)) authored.push(text);
    if (sectionId) sections.set(sectionId, `${sections.get(sectionId) ?? ''} ${text}`);
  };

  for (const token of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<[^>]*>|[^<]+/gu)) {
    const value = token[0] ?? '';
    if (value.startsWith('<!--') || value.startsWith('<!')) continue;
    if (!value.startsWith('<')) {
      addText(value, stack.at(-1));
      continue;
    }
    const name = TAG_NAME.exec(value)?.[1]?.toLowerCase();
    if (!name) continue;
    const closing = /^<\//u.test(value);
    if (closing) {
      const index = stack.map(frame => frame.tag).lastIndexOf(name);
      if (index >= 0) stack.splice(index);
      continue;
    }
    const attrs = attributes(value);
    const parentHidden = stack.some(frame => frame.hidden);
    const hidden = parentHidden || ['script', 'style', 'noscript', 'template'].includes(name) || attrs.has('hidden') ||
      /^(?:true|1|hidden)$/iu.test(attrs.get('aria-hidden') ?? '') ||
      /(?:^|[;\s])(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:[;\s]|$)/iu.test(attrs.get('style') ?? '');
    const sectionId = name === 'section' && /^M(?:0[1-9]|1[0-3])$/u.test(attrs.get('id') ?? '') ? attrs.get('id')! : null;
    const frame: Frame = { tag: name, hidden, quote: stack.some(item => item.quote) || name === 'q' || name === 'blockquote' || attrs.has('data-quote'),
      heading: stack.some(item => item.heading) || /^h[1-6]$/u.test(name), sectionId: sectionId ?? [...stack].reverse().find(item => item.sectionId !== null)?.sectionId ?? null };
    if (!hidden) {
      for (const attr of ['title', 'alt', 'aria-label']) {
        const text = attrs.get(attr);
        if (text) addText(text, frame);
      }
    }
    if (!VOID_TAGS.has(name) && !/\/\s*>$/u.test(value)) stack.push(frame);
  }
  return { visible: visible.join(' '), authored: authored.join(' '), sections, segments };
}

function snippets(values: Iterable<string>): string {
  return [...new Set([...values].map(value => value.replace(/\s+/gu, ' ').trim().slice(0, 160)).filter(Boolean))].slice(0, 3).join(' | ') || 'clean';
}

function matches(text: string, pattern: RegExp): string[] {
  pattern.lastIndex = 0;
  return [...text.matchAll(pattern)].map(match => match[0] ?? '');
}

function providerMatches(text: string): string[] {
  const names = [...new Set([...FORBIDDEN_PROVIDER_NAMES, ...CAPTURED_PROVIDER_NAMES, 'Jev', 'TypeSafe', 'CLIProxy', 'OpenAI', 'Anthropic', 'GLM'])];
  const found = names.flatMap(name => matches(text, new RegExp(`(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![\\p{L}\\p{N}_])`, 'giu')));
  return [...found, ...matches(text, MODEL_ID)];
}

function privateIpv4Matches(html: string): string[] {
  return [...html.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu)].map(match => match[0]!).filter(value => {
    const octets = value.split('.').map(Number);
    return octets.every(octet => octet <= 255) && (octets[0] === 10 || octets[0] === 192 && octets[1] === 168 || octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31);
  });
}

function noLeakMatches(html: string): string[] {
  return [
    ...matches(html, /[A-Za-z]:\\[^\s<>"']+/gu),
    ...matches(html, /\/(?:home|Users)\/[^\s<>"']*/giu),
    ...matches(html, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu),
    ...matches(html, /\bBearer\s+[^\s<>"']+/giu),
    ...matches(html, /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}/gu),
    ...privateIpv4Matches(html),
  ];
}

function result(rule: string, ok: boolean, detail: string): MarketBusinessGateResult { return { rule, ok, detail }; }

export function auditMarketReportHtml(html: string): MarketBusinessGateResult[] {
  const scan = scanHtml(html);
  const provider = providerMatches(scan.visible);
  const crossPlatform = CROSS_PLATFORM_TOTAL_PHRASES.flatMap(phrase => matches(scan.visible, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'giu')));
  const e2 = matches(scan.authored, E2_TERMS);
  const counts = new Map(MARKET_SECTION_IDS.map(id => [id, 0]));
  for (const match of html.matchAll(/<section\b[^>]*\bid\s*=\s*["'](M(?:0[1-9]|1[0-3]))["'][^>]*>/giu)) counts.set(match[1]!.toUpperCase(), (counts.get(match[1]!.toUpperCase()) ?? 0) + 1);
  const missingOrDuplicate = MARKET_SECTION_IDS.filter(id => counts.get(id) !== 1).map(id => `${id}=${counts.get(id)}`);
  const m12 = scan.sections.get('M12') ?? '';
  const m12Proposal = PROPOSAL_TERMS.test(m12);
  const m12Label = /đề xuất/iu.test(m12);
  const leaks = noLeakMatches(html);
  return [
    result('G08_PROVIDER_NAME', provider.length === 0, snippets(provider)),
    result('U32_NO_CROSS_PLATFORM_TOTAL', crossPlatform.length === 0, snippets(crossPlatform)),
    result('E2_NO_REVENUE_ORDER', e2.length === 0, snippets(e2)),
    result('SECTIONS_PRESENT', missingOrDuplicate.length === 0, snippets(missingOrDuplicate)),
    result('M12_PROPOSAL_LABEL', !m12Proposal || m12Label, m12Proposal ? (m12Label ? 'proposal-label-present' : 'proposal-label-missing') : 'no-proposal-text'),
    result('NO_LEAK', leaks.length === 0, snippets(leaks)),
    ...lintVisibleReportText(html),
  ];
}
