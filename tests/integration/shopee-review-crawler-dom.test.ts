import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { reviewPolicy } from '../../src/modules/foundation/shopee-review-sampling.js';

const crawler = await readFile(new URL('../../tools/shopee-review-service/crawler.js', import.meta.url), 'utf8');
const URL_UNDER_TEST = 'https://shopee.vn/product/100/200';
const json = (value: any) => JSON.parse(JSON.stringify(value));

const icons = (stars: number) => '<svg class="YBGCRA icon-rating-solid"></svg>'.repeat(stars);
const card = (id: string, stars: number, text: string) => `
  <div data-cmtid="${id}">
    <div class="rGdC5O">${icons(stars)}</div>
    <div class="meQyXP"><div><span>Màu: đen</span></div><div class="YNedDV">${text}</div></div>
    <div class="XYk98l">2026-11-01 09:00 | Phân loại hàng: Đen</div>
  </div>`;
const filter = (key: string, label: string, count: number, active = false) => `
  <div class="product-rating-overview__filter${active ? ' product-rating-overview__filter--active' : ''}"
       data-key="${key}">${label} (${count})</div>`;

function boot(markup: string): JSDOM {
  const dom = new JSDOM(`<body>${markup}</body>`, {
    url: URL_UNDER_TEST, runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const window = dom.window as any;
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    get(this: HTMLElement) { return this.textContent ?? ''; },
    set(this: HTMLElement, value: string) { this.textContent = value; },
    configurable: true,
  });
  window.Element.prototype.scrollIntoView = () => {};
  window.Element.prototype.getClientRects = function (this: Element) {
    return this.closest('[data-hidden]') ? [] : [{}];
  };
  const realSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = (fn: () => void) => realSetTimeout(fn, 0);
  let clock = Date.now();
  window.Date.now = () => { clock += 100; return clock; };
  return dom;
}

async function crawl(dom: JSDOM, policy: ReturnType<typeof reviewPolicy>, kind?: string): Promise<any> {
  const window = dom.window as any;
  window.__shopeeApiConfig = {
    url: URL_UNDER_TEST, maxPages: 500, kind,
    deadlineAt: 9_000_000_000_000_000,
    ...(kind === 'counts' ? {} : { sampling: { policy } }),
  };
  window.__shopeeCancel = false;
  return await window.eval(crawler);
}

test('pooled stars traverse ascending and fill the shared total low-star-first without interleaving', async () => {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'Tất cả', 6)}
      ${filter('with-comments', 'Có bình luận', 5)}
      ${filter('1', '1 sao', 4, true)}
      ${filter('2', '2 sao', 1)}
      ${filter('3', '3 sao', 1)}${filter('4', '4 sao', 0)}${filter('5', '5 sao', 0)}
      <div class="product-ratings__list" style="opacity:1">
        ${card('a1', 1, 'Một')}${card('a2', 1, 'Hai')}
      </div>
      <div class="shopee-page-controller">
        <button>1</button><button class="shopee-button-solid--primary">1</button>
        <button class="shopee-icon-button--right">›</button>
      </div>
    </div>`);
  const window = dom.window as any;
  const clicks: string[] = [];
  const list = window.document.querySelector('.product-ratings__list');
  const primary = window.document.querySelector('.shopee-page-controller .shopee-button-solid--primary');
  window.document.querySelector('.shopee-icon-button--right').addEventListener('click', () => {
    clicks.push('next');
    primary.textContent = '2';
    list.innerHTML = card('a3', 1, 'Ba') + card('a4', 1, 'Bốn');
  });
  for (const element of window.document.querySelectorAll('.product-rating-overview__filter')) {
    element.addEventListener('click', () => clicks.push(element.dataset.key));
  }
  try {
    const result = await crawl(dom, reviewPolicy({
      mode: 'stars', stars: [1, 2], totalPerLink: 3, allocation: 'pooled',
    }));
    assert.equal(result.stop_reason, 'record_limit');
    assert.deepEqual(json(result.records.map((row: any) => row.review_id)), ['a1', 'a2', 'a3']);
    assert.deepEqual(json(result.pages.map((page: any) => [page.filter, page.page])), [['1', 1], ['1', 2]]);
    assert.deepEqual(json(result.groups.map((group: any) => group.filter)), ['1', '2']);
    assert.deepEqual(json(clicks), ['next'], 'the higher selected star is never opened after the shared cap is filled');
  } finally { dom.window.close(); }
});

test('equal-stars stops each selected star at its derived quota and keeps ascending order', async () => {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'Tất cả', 4)}
      ${filter('with-comments', 'Có bình luận', 3)}
      ${filter('1', '1 sao', 2, true)}
      ${filter('2', '2 sao', 2)}
      ${filter('3', '3 sao', 0)}${filter('4', '4 sao', 0)}${filter('5', '5 sao', 0)}
      <div class="product-ratings__list" style="opacity:1">
        ${card('b1', 1, 'Một')}${card('b2', 1, 'Hai')}
      </div>
    </div>`);
  const window = dom.window as any;
  const list = window.document.querySelector('.product-ratings__list');
  const one = window.document.querySelector('[data-key="1"].product-rating-overview__filter');
  const two = window.document.querySelector('[data-key="2"].product-rating-overview__filter');
  two.addEventListener('click', () => {
    one.classList.remove('product-rating-overview__filter--active');
    two.classList.add('product-rating-overview__filter--active');
    list.innerHTML = card('c1', 2, 'Hai sao một') + card('c2', 2, 'Hai sao hai');
  });
  try {
    const result = await crawl(dom, reviewPolicy({
      mode: 'stars', stars: [1, 2], totalPerLink: 2, allocation: 'equal-stars',
    }));
    assert.deepEqual(json(result.records.map((row: any) => row.review_id)), ['b1', 'c1']);
    assert.deepEqual(json(result.records.map((row: any) => row.stars)), [1, 2]);
    assert.deepEqual(json(result.groups), [
      { filter: '1', stopReason: 'quota' }, { filter: '2', stopReason: 'quota' },
    ]);
    assert.equal(result.stop_reason, 'record_limit');
  } finally { dom.window.close(); }
});

test('a scoped native observed zero with a loaded empty list is a genuine verified empty result', async () => {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'Tất cả', 0)}
      ${filter('with-comments', 'Có bình luận', 0, true)}
      ${filter('1', '1 sao', 0)}${filter('2', '2 sao', 0)}${filter('3', '3 sao', 0)}
      ${filter('4', '4 sao', 0)}${filter('5', '5 sao', 0)}
      <div class="product-ratings__list" style="opacity:1"></div>
    </div>`);
  try {
    const result = await crawl(dom, reviewPolicy({
      mode: 'with-comments', stars: [], totalPerLink: 20, allocation: 'pooled',
    }));
    assert.equal(result.stop_reason, 'exhausted');
    assert.deepEqual(json(result.records), []);
    assert.deepEqual(json(result.pages), [{
      filter: 'with-comments', page: 1, cards: 0, collected: 0, ids: [],
    }]);
    assert.deepEqual(json(result.groups), [{ filter: 'with-comments', stopReason: 'exhausted' }]);
  } finally { dom.window.close(); }
});

test('a still-loading empty list is not treated as exhaustion', async () => {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'Tất cả', 0)}
      ${filter('with-comments', 'Có bình luận', 0, true)}
      ${filter('1', '1 sao', 0)}${filter('2', '2 sao', 0)}${filter('3', '3 sao', 0)}
      ${filter('4', '4 sao', 0)}${filter('5', '5 sao', 0)}
      <div class="product-ratings__list" style="opacity:0"></div>
    </div>`);
  try {
    const result = await crawl(dom, reviewPolicy({
      mode: 'with-comments', stars: [], totalPerLink: 20, allocation: 'pooled',
    }));
    assert.equal(result.stop_reason, 'control_changed');
    assert.equal(result.error, 'CONTROL_CHANGED');
    assert.deepEqual(json(result.records ?? []), []);
  } finally { dom.window.close(); }
});

test('a missing review list is not treated as an observed empty list', async () => {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'Tất cả', 0)}
      ${filter('with-comments', 'Có bình luận', 0, true)}
      ${filter('1', '1 sao', 0)}${filter('2', '2 sao', 0)}${filter('3', '3 sao', 0)}
      ${filter('4', '4 sao', 0)}${filter('5', '5 sao', 0)}
    </div>`);
  try {
    const result = await crawl(dom, reviewPolicy({
      mode: 'with-comments', stars: [], totalPerLink: 20, allocation: 'pooled',
    }));
    assert.equal(result.stop_reason, 'control_changed');
    assert.equal(result.error, 'CONTROL_CHANGED');
  } finally { dom.window.close(); }
});

test('an unobserved rating stays null and is never reported as zero stars', async () => {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'Tất cả', 2, true)}
      ${filter('with-comments', 'Có bình luận', 2)}
      ${filter('1', '1 sao', 0)}${filter('2', '2 sao', 0)}${filter('3', '3 sao', 0)}
      ${filter('4', '4 sao', 0)}${filter('5', '5 sao', 0)}
      <div class="product-ratings__list" style="opacity:1">
        ${card('d1', 5, 'Năm sao')}${card('d2', 0, 'Chưa rõ số sao')}
      </div>
    </div>`);
  try {
    const result = await crawl(dom, reviewPolicy({
      mode: 'all', stars: [], totalPerLink: 20, allocation: 'pooled',
    }));
    assert.deepEqual(json(result.records.map((row: any) => [row.review_id, row.stars])), [
      ['d1', 5], ['d2', null],
    ]);
    assert.equal(result.stop_reason, 'exhausted');
  } finally { dom.window.close(); }
});

test('missing native filter controls fail closed', async () => {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'Tất cả', 1, true)}
      <div class="product-ratings__list" style="opacity:1">${card('e1', 1, 'Một')}</div>
    </div>`);
  try {
    await assert.rejects(() => crawl(dom, reviewPolicy({
      mode: 'stars', stars: [1], totalPerLink: 1, allocation: 'pooled',
    })), /CONTROL_CHANGED/);
  } finally { dom.window.close(); }
});
