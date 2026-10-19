import { pdfExcerptBlockHtml } from '../../src/modules/analysis/research-automation/pdf-excerpt.js';
import { sellerVideoBlockHtml } from '../../src/modules/analysis/research-automation/seller-video.js';
import { fullMarket14Input } from './market14-full-fixture.js';

export const footerProducts = ['Nimbus seed tray', 'Pebble felt lantern', 'Orbit paper wallet'] as const;
export const sectionIds = Array.from({ length: 14 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`);
const escape = (value: string): string => value.replace(/[&<>"']/gu,
  char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

// Deliberately include reader substitutions, a date, a negation and literal markup in source text.
export const quoteText = 'listing review pack/variant; 2026-01-12; chưa bằng 0; 0,5; không chứng minh nguyên nhân; & <mẫu> "giữ".';
export function pdfBlock(product: string, page = 2): string {
  return pdfExcerptBlockHtml([{ sourceSha256: 'a'.repeat(64), page,
    text: `${product}: ${quoteText}`, label: `Tài liệu mẫu, trang ${page}` }], escape,
  () => '<sup class="cite"><a href="#cite-1">[1]</a></sup>');
}
export function videoBlock(product: string, ordinal = 0): string {
  const ref = { packageId: 'synthetic-video-package', manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64) };
  return sellerVideoBlockHtml({ contractVersion: 'seller-videos-v1', sources: { tables: [], readings: [ref] }, table: null,
    readings: [{ package: ref, readingSha256: 'd'.repeat(64), voiceLabel: 'lời người làm video review',
      excerpts: [{ text: `${product}: ${quoteText}`, startSeconds: ordinal + 1.5, endSeconds: ordinal + 4 }] }], leftOut: [] }, escape);
}

export const pageHead = '<!doctype html><html><head><title>listing 2026-01-12</title></head><body><header>review 2026-01-12</header>';
export const pageFooter = '<footer class="page-footer"><p>review listing 2026-01-12</p><details><summary>page trace</summary>retained footer</details></footer></body></html>';
export interface FooterPageOptions {
  readonly excerpts?: Readonly<Record<string, readonly string[]>>;
  readonly pageFooter?: boolean;
  readonly emptyRegister?: boolean;
  readonly exhibits?: boolean;
}
export function footerPage(product: string, options: FooterPageOptions = {}): string {
  const table = (id: string): string => '<div class="table-wrap"><table'
    + (id === 'M06' ? ' data-exhibit-scope="national"' : '')
    + '><caption>Số liệu mẫu</caption><thead><tr><th>Tên</th><th>' + (id === 'M08' ? 'Giá (VND)' : 'Doanh thu (VND)')
    + `</th></tr></thead><tbody><tr><td>${escape(product)}</td><td>125000</td></tr></tbody></table></div>`;
  const figure = (id: string): string => `<figure${id === 'M06' ? ' data-exhibit-scope="national"' : ''}><svg role="img"><text>review 2026-01-12</text></svg><figcaption>Số liệu mẫu</figcaption></figure>`;
  const trace = (id: string, position: string): string => `<details data-trace="${id}-${position}"><summary>trace <sup class="cite"><a href="#cite-1">[1]</a></sup></summary><details><summary>nested</summary>hidden-${id}-${position}</details></details>`;
  const sections = sectionIds.map(id => {
    const exhibits = options.exhibits !== false && /^M(?:0[3-9]|1[01])$/u.test(id) ? table(id) + figure(id) : '';
    return `<section class="sheet" id="${id}"><header><span class="state"${id === 'M09' ? ' data-section-gap="1"' : ''}>old-${id}</span></header>`
      + trace(id, 'before') + (options.excerpts?.[id] ?? []).join('') + trace(id, 'after')
      + `<p class="reader-probe">${escape(product)}: listing review pack/variant search events; 2026-01-12; bằng 0; mẫu xuất đã lưu.</p>`
      + '<p class="sec-note">Hồ sơ phương pháp nằm ở phụ lục.</p>'
      + '<a class="method-link" href="#bounded-method-evidence">Xem hồ sơ</a>' + exhibits + '</section>';
  }).join('');
  const register = '<section class="citation-register"><h2>Nguồn</h2><ol>' + (options.emptyRegister ? ''
    : '<li id="cite-1"><p>listing review 2026-01-12</p><blockquote data-quote>review 2026-01-12</blockquote><details><summary>register trace</summary>hidden-register</details><a href="#bounded-method-evidence">Xem hồ sơ</a></li>') + '</ol></section>';
  return pageHead + `<div id="sections">${sections}</div>` + register + (options.pageFooter === false ? '</body></html>' : pageFooter);
}

export const builderControlNames = ['capture-market', 'no-capture-market', 'capture-insight', 'no-capture-insight', 'legacy-market', 'legacy-insight'] as const;
export type BuilderControlName = typeof builderControlNames[number];
let input: ReturnType<typeof fullMarket14Input> | undefined;
export async function footerBuilderControl(name: BuilderControlName) {
  const full = await (input ??= fullMarket14Input());
  const { capture: _capture, ...metricMethods } = full.metricMethods!;
  const { marketPresentation: _presentation, ...legacy } = full;
  return { input: name.startsWith('legacy-') ? legacy : name.startsWith('no-capture-') ? { ...full, metricMethods } : full,
    kind: name.endsWith('insight') ? 'INSIGHT' as const : 'MARKET' as const };
}
