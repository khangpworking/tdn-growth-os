import { readerReportFontCss, readerReportPlatformIcons, type PlatformIcons } from './assets.js';
import { esc } from './format.js';
import { CSS, CSS_COVER, CSS_KIT } from './theme.js';

// Page frame ported from the approved golden reader report. Callers pass
// already-safe HTML for bodies; titles and labels are escaped here.
export const hlNum = (t: string): string => String(t).split(/(<[^>]+>)/)
  .map(p => p.startsWith('<') ? p : p.replace(/~?\d[\d.,/]*(?:\s?%|\s(?:tỷ|triệu)(?:\sđồng)?|đ(?!\p{L}))?/gu, m => `<em class="n">${m}</em>`)).join('');
export const n = (x: unknown): string => `<span class="n">${x}</span>`;
export const PLATFORM_LABEL: Record<string, string> = { shopee: 'Shopee', tiktok: 'TikTok Shop' };
export const plat = (p: string): string => `<span class="plat ${esc(p)}">${esc(PLATFORM_LABEL[p] ?? p)}</span>`;

export function exHead(kind: string, no: string, title: string, unit: string): string {
  return `<div class="exh"><span class="exn">${kind} ${no}</span><span class="ext">${title}</span>${unit ? `<span class="exu">Đơn vị: ${unit}</span>` : ''}</div>`;
}
export function table(head: readonly string[], rows: readonly (readonly unknown[])[], cls = ''): string {
  return `<div class="tw"><table class="${cls}"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export type FigureOptions = { fact?: string; src?: string; note?: string };
export type TableOptions = { src?: string; note?: string; cls?: string };
/** Figure/table builders that always carry "Nguồn:" and keep "Chú thích:" on its own line. */
export function makeExhibits(defaultSource: string) {
  const fig = (no: string, title: string, unit: string, svg: string, { fact, src = defaultSource, note }: FigureOptions = {}): string =>
    `<figure class="ex">${exHead('Hình', no, title, unit)}<div class="chart flint">${svg}</div>${note ? `<p class="ex-note"><b>Chú thích:</b> ${note}</p>` : ''}<p class="ex-src">Nguồn: ${src}</p></figure>${fact ? `<p class="fact"><b>Nhận định</b><span>${hlNum(fact)}</span></p>` : ''}`;
  const tbl = (no: string, title: string, unit: string, head: readonly string[], rows: readonly (readonly unknown[])[], { src = defaultSource, note, cls = '' }: TableOptions = {}): string =>
    `<div class="ex">${exHead('Bảng', no, title, unit)}${table(head, rows, cls)}${note ? `<p class="ex-note"><b>Chú thích:</b> ${note}</p>` : ''}<p class="ex-src">Nguồn: ${src}</p></div>`;
  return { fig, tbl };
}

// Section ids M01–M12 render as "Phần 1–12"; M13 is the appendix.
const LBL = new Map<string, [string, string]>([
  ...Array.from({ length: 12 }, (_, i) => ['M' + String(i + 1).padStart(2, '0'), ['phan-' + (i + 1), 'Phần ' + (i + 1)]] as [string, [string, string]]),
  ['M13', ['phu-luc', 'Phụ lục']],
]);
export const anc = (id: string): string => LBL.get(id)?.[0] ?? id;
export const lbl = (id: string): string => LBL.get(id)?.[1] ?? id;
export const READER_SECTION_ANCHORS: readonly string[] = [...LBL.values()].map(x => x[0]);

export function section(id: string, title: string, headline: string, body: string, limits?: string): string {
  return `<section id="${anc(id)}"><div class="sh"><span class="sid">${lbl(id)}</span><h2>${esc(title)}</h2></div>\n<p class="ans">${headline}</p>${body}${limits ? `<p class="lim"><b>Ghi chú:</b> ${limits}</p>` : ''}</section>`;
}

/**
 * Wraps visible "Shopee"/"TikTok" words in <i class="pi s|t"> so CSS draws the
 * marketplace mark in front. Skips head, script, style, svg, select and tag attributes.
 */
export function platIcons(html: string, col: { shopee: string; tiktok: string }, icons: PlatformIcons = readerReportPlatformIcons()): { html: string; count: number } {
  const uri = (svg: string) => `url("data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}")`;
  const css = `.pi{font-style:inherit;white-space:nowrap}.pi::before{content:"";display:inline-block;width:.92em;height:.92em;margin-right:.24em;vertical-align:-.11em;-webkit-mask:var(--m) center/contain no-repeat;mask:var(--m) center/contain no-repeat;background:var(--c)}`
    + `.pi.s{--m:${uri(icons.shopee)};--c:${col.shopee}}.pi.t{--m:${uri(icons.tiktok)};--c:${col.tiktok}}.plat .pi,.cover .pi{--c:currentColor}`;
  let count = 0;
  const body = html.split(/(<head[\s\S]*?<\/head>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>|<select[\s\S]*?<\/select>|<[^>]+>)/)
    .map((s, i) => i % 2 ? s : s.replace(/\b(Shopee|TikTok)\b/g, w => (count++, `<i class="pi ${w === 'Shopee' ? 's' : 't'}">${w}</i>`))).join('');
  return { html: body.replace('</style>', css + '</style>'), count };
}

export type CoverImage = { bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' | 'image/webp' };
/** Cover: kicker, main word, sub line; meta items split on " · ". No counts, badges or photo credit (lint F8). */
export function cover(image: CoverImage | null, sub: string, parts: readonly [string, string, string]): string {
  const img = image ? `data:${image.mime};base64,${Buffer.from(image.bytes).toString('base64')}` : '';
  return `<header class="cover"${img ? ` style="background-image:url('${img}')"` : ''}><div class="cover-in"><div class="cover-rule" aria-hidden="true"></div>\n<h1><span class="cv-k">${esc(parts[0])}</span><span class="cv-m">${esc(parts[1])}</span><span class="cv-p">${esc(parts[2])}</span></h1><ul class="cover-meta">${sub.split(' · ').map(s => `<li>${s}</li>`).join('')}</ul>\n<div></div></div></header>`;
}

export type PageInput = {
  title: string; coverHtml: string; intro: string; toc: readonly (readonly [string, string])[]; sections: readonly string[]; foot: string;
  /** Defaults to the bundled Be Vietnam Pro faces. */
  fontCss?: string;
  /** Opt-in styles for retained Insight method bodies; historical pages add nothing. */
  extraCss?: string;
};
export function page({ title, coverHtml, intro, toc, sections, foot, fontCss = readerReportFontCss(), extraCss = '' }: PageInput): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<title>${esc(title)}</title><style>${fontCss}${CSS}${CSS_COVER}${CSS_KIT}${extraCss}</style></head>\n<body class="mk">${coverHtml}\n<main>\n${intro}<nav class="toc">${toc.map(([id, t]) => `<a href="#${anc(id)}"><b>${lbl(id)}</b> ${esc(t)}</a>`).join('')}</nav>\n${sections.join('\n')}<footer>${foot}</footer></main></body></html>`;
}
