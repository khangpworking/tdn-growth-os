import assert from 'node:assert/strict';
import type { JSDOM } from 'jsdom';

export const fText = (node: Node | null | undefined): string => (node?.textContent ?? '').replace(/\s+/gu, ' ').trim();
export const fCells = (row: Element): string[] => [...row.querySelectorAll('th,td')].map(fText);
export const fSampleTables = (doc: Document): HTMLTableElement[] => [...doc.querySelectorAll<HTMLTableElement>('#M03 table')]
  .filter(table => /số liệu từ bảng kết quả tìm kiếm đã lưu/u.test(fText(table.querySelector('caption')) + table.getAttribute('aria-label')));
export const fFigure = (doc: Document, kind: 'ranking' | 'revenue' | 'concentration' | 'search'): Element | undefined => {
  const selector = kind === 'ranking' ? '#M07 figure,#phan-7 figure' : kind === 'search' ? '#M05 figure,#phan-5 figure' : '#M04 figure,#phan-4 figure';
  const phrase = kind === 'ranking' ? /Sản phẩm có doanh thu/u : kind === 'revenue' ? /Doanh thu trong mẫu/u
    : kind === 'concentration' ? /[Tt]ập trung doanh thu/u : /[Qq]uan tâm tìm kiếm/u;
  return [...doc.querySelectorAll(selector)].find(figure => phrase.test(fText(figure.querySelector('.ext,figcaption'))));
};
export function fNeedFigure(doc: Document, kind: Parameters<typeof fFigure>[1]): Element {
  const found = fFigure(doc, kind); assert.ok(found, `missing ${kind} figure`); return found;
}
export function fWithoutCites(node: Element): string {
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll('sup.cite').forEach(child => child.remove());
  return fText(copy);
}

/** Compare rendered identities independently of citation/exhibit renumbering.
 * Kind, label, retained locator, URL and date distinguish the visible targets.
 */
export function fCitationTarget(doc: Document, mark: Element) {
  const number = /\[(\d+)\]/u.exec(fText(mark))?.[1];
  const target = doc.getElementById(`cite-${number}`);
  assert.ok(target, `citation ${number} must resolve`);
  return {
    id: target.id,
    label: fText(target.querySelector('.cite-label')),
    family: fText(target.querySelector('.cite-family')).replace(/ · mục nguồn \d+$/u, ''),
    locator: fText(target.querySelector('.cite-locator')),
    date: fText(target.querySelector('.cite-date')),
    url: target.querySelector('a[href]')?.getAttribute('href') ?? null,
  };
}
export function fSampleEvidence(doc: Document) {
  return fSampleTables(doc).map(table => ({
    platform: /TikTok Shop/u.test(fText(table.querySelector('caption')) + table.getAttribute('aria-label')) ? 'tiktok' : 'shopee',
    rows: [...table.querySelectorAll('tbody tr')].map(row => ({
      title: fText(row.querySelector('q,[data-quote]')),
      sources: [...row.querySelectorAll('sup.cite')].map(mark => fCitationTarget(doc, mark)),
    })),
  }));
}
export function fAdsEvidence(doc: Document) {
  const table = [...doc.querySelectorAll<HTMLTableElement>('#M07 table')]
    .find(node => /Trạng thái kiểm tra/u.test(fText(node.querySelector('thead'))));
  assert.ok(table, 'main ads table');
  const wrapper = table.closest('.table-wrap')!;
  return {
    header: fCells(table.querySelector('thead tr')!),
    rows: [...table.querySelectorAll('tbody tr')].map(row => ({
      cells: [...row.querySelectorAll('td')].map(fWithoutCites),
      sources: [...row.querySelectorAll('sup.cite')].map(mark => fCitationTarget(doc, mark)),
    })),
    note: fText(wrapper.querySelector('p.lim')),
    source: fText(wrapper.querySelector('p.ex-src')),
  };
}
export function fQuotes(dom: JSDOM) {
  const doc = dom.window.document;
  return Object.fromEntries(['g-q', 'g-block', 'g-data', 'g-nested', 'g-svg-axis', 'g-svg-legend', 'g-authored']
    .map(id => [id, doc.getElementById(id)?.innerHTML ?? null]));
}
