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
        <button>1</button><button class="shopee-button-solid--primary">1</button><button>2</button>
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

test('a selected star whose "No ratings yet" box stays stable for 3 s (no list) is exhausted and the next star still runs', async () => {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'All', 2)}
      ${filter('with-comments', 'With Comments', 2)}
      ${filter('1', '1 Star', 1, true)}${filter('2', '2 Star', 0)}${filter('3', '3 Star', 1)}
      ${filter('4', '4 Star', 0)}${filter('5', '5 Star', 0)}
      <div class="product-ratings__list" style="opacity:1">${card('s1', 1, 'Một sao')}</div>
    </div>`);
  const window = dom.window as any;
  const root = window.document.querySelector('.product-ratings');
  const select = (key: string) => {
    for (const element of root.querySelectorAll('.product-rating-overview__filter'))
      element.classList.toggle('product-rating-overview__filter--active', element.dataset.key === key);
  };
  root.querySelector('[data-key="2"]').addEventListener('click', () => {
    select('2');
    root.querySelector('.product-ratings__list')?.remove();
    root.insertAdjacentHTML('beforeend', '<div class="product-ratings-comments-view__no-data">' +
      '<div class="product-ratings-comments-view__no-data__text">No ratings yet</div></div>');
  });
  root.querySelector('[data-key="3"]').addEventListener('click', () => {
    select('3');
    root.querySelector('.product-ratings-comments-view__no-data')?.remove();
    root.insertAdjacentHTML('beforeend', `<div class="product-ratings__list" style="opacity:1">${card('s3', 3, 'Ba sao')}</div>`);
  });
  try {
    const result = await crawl(dom, reviewPolicy({ mode: 'stars', stars: [1, 2, 3], totalPerLink: 10, allocation: 'pooled' }));
    assert.equal(result.stop_reason, 'exhausted');
    assert.equal(result.error, null);
    assert.deepEqual(json(result.records.map((row: any) => [row.review_id, row.stars])), [['s1', 1], ['s3', 3]]);
    assert.deepEqual(json(result.groups), [
      { filter: '1', stopReason: 'exhausted' }, { filter: '2', stopReason: 'exhausted' }, { filter: '3', stopReason: 'exhausted' },
    ]);
    assert.deepEqual(json(result.pages.map((page: any) => [page.filter, page.cards])), [['1', 1], ['2', 0], ['3', 1]]);
  } finally { dom.window.close(); }
});

test('a "No ratings yet" box beside a visible page controller is never an exhausted star', async () => {
  // Live 17/11: Shopee's empty state has no page controller, so a box with one is not that state.
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'Tất cả', 0)}
      ${filter('with-comments', 'Có bình luận', 0, true)}
      ${filter('1', '1 sao', 0)}${filter('2', '2 sao', 0)}${filter('3', '3 sao', 0)}
      ${filter('4', '4 sao', 0)}${filter('5', '5 sao', 0)}
      <div class="product-ratings-comments-view__no-data">
        <div class="product-ratings-comments-view__no-data__text">No ratings yet</div></div>
      <div class="shopee-page-controller"><button class="shopee-button-solid shopee-button-solid--primary">1</button></div>
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

test('a stale "No ratings yet" box whose filter loads cards after the post-click pause is not exhausted', async () => {
  // Sol repro on e1cddb26: 1 Star (0) shows the box; 2 Star still shows a stale (0) and Shopee keeps the
  // same box node until the 2-star cards arrive, 6 s after the click (after the 3.5 s post-click pause).
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'All', 1)}
      ${filter('with-comments', 'With Comments', 1)}
      ${filter('1', '1 Star', 0, true)}${filter('2', '2 Star', 0)}${filter('3', '3 Star', 0)}
      ${filter('4', '4 Star', 0)}${filter('5', '5 Star', 0)}
      <div class="product-ratings-comments-view__no-data">
        <div class="product-ratings-comments-view__no-data__text">No ratings yet</div></div>
    </div>`);
  const window = dom.window as any;
  const root = window.document.querySelector('.product-ratings');
  const two = root.querySelector('[data-key="2"]');
  const now = window.Date.now;
  let loadAt: number | null = null;
  window.Date.now = () => {
    const time = now();
    if (loadAt !== null && time >= loadAt) {
      loadAt = null;
      two.textContent = '2 Star (1)';
      root.querySelector('.product-ratings-comments-view__no-data').remove();
      root.insertAdjacentHTML('beforeend', `<div class="product-ratings__list" style="opacity:1">${card('s2', 2, 'Hai sao')}</div>`);
    }
    return time;
  };
  two.addEventListener('click', () => {
    root.querySelector('[data-key="1"]').classList.remove('product-rating-overview__filter--active');
    two.classList.add('product-rating-overview__filter--active');
    loadAt = now() + 6000; // after the 3.5 s post-click pause the stale box is still seen for about 2 s
  });
  try {
    const result = await crawl(dom, reviewPolicy({ mode: 'stars', stars: [2], totalPerLink: 10, allocation: 'pooled' }));
    assert.equal(result.error, null);
    assert.equal(result.stop_reason, 'exhausted');
    assert.deepEqual(json(result.records.map((row: any) => [row.review_id, row.stars])), [['s2', 2]]);
    assert.deepEqual(json(result.pages.map((page: any) => [page.filter, page.cards])), [['2', 1]]);
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

/** Live Shopee page controller (17/11): the next arrow looks the same on every page, the last one included. */
const controller = (active: number, total: number) => `
  <nav aria-label="" class="shopee-page-controller product-ratings__page-controller" role="navigation">
    <button class="shopee-icon-button shopee-icon-button--left"><svg></svg></button>
    ${Array.from({ length: total }, (_, i) => i + 1).map(page => page === active
      ? `<button class="shopee-button-solid shopee-button-solid--primary">${page}</button>`
      : `<button class="shopee-button-no-outline">${page}</button>`).join('')}
    ${total > 2 ? '<button class="shopee-button-no-outline shopee-button-no-outline--non-click">...</button>' : ''}
    <button class="shopee-icon-button shopee-icon-button--right"><svg></svg></button>
  </nav>`;

/** With Comments list split over pages; next only works while a higher page exists (as on Shopee). */
async function pagedCrawl(count: number, pages: string[][], totalPages = pages.length) {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'Tất cả', count)}
      ${filter('with-comments', 'Có bình luận', count, true)}
      <div class="product-ratings__list" style="opacity:1">${pages[0]!.join('')}</div>
      <div class="controller">${controller(1, totalPages)}</div>
    </div>`);
  const window = dom.window as any;
  const list = window.document.querySelector('.product-ratings__list');
  const holder = window.document.querySelector('.controller');
  let page = 1, nextClicks = 0;
  holder.addEventListener('click', (event: any) => {
    if (!event.target.closest('.shopee-icon-button--right')) return;
    nextClicks++;
    if (page >= pages.length) return; // Shopee: clicking next on the last page changes nothing.
    page++;
    list.innerHTML = pages[page - 1]!.join('');
    holder.innerHTML = controller(page, totalPages);
  });
  try {
    const result = await crawl(dom, reviewPolicy({ mode: 'with-comments', stars: [], totalPerLink: 50, allocation: 'pooled' }));
    return { result, nextClicks };
  } finally { dom.window.close(); }
}

test('the last page stops as exhausted although its next arrow stays enabled', async () => {
  // Shopee count larger than the cards, so only the last-page rule can end the list.
  const { result, nextClicks } = await pagedCrawl(40, [
    [card('p1', 5, 'Một'), card('p2', 4, 'Hai')], [card('p3', 5, 'Ba'), card('p4', 3, 'Bốn')], [card('p5', 5, 'Năm')],
  ]);
  assert.equal(result.stop_reason, 'exhausted');
  assert.equal(result.error, null);
  assert.deepEqual(json(result.groups), [{ filter: 'with-comments', stopReason: 'exhausted' }]);
  assert.deepEqual(json(result.records.map((row: any) => row.review_id)), ['p1', 'p2', 'p3', 'p4', 'p5']);
  assert.deepEqual(json(result.pages.map((p: any) => p.page)), [1, 2, 3]);
  assert.equal(nextClicks, 2, 'next is never clicked on the last page');
});

test('a displayed count already met on page 1 never stops the list while a higher page is shown', async () => {
  // Shopee shows count 2 (stale) and 2 cards on page 1, but the bar shows [1] 2; page 2 holds one more card.
  const { result, nextClicks } = await pagedCrawl(2, [
    [card('q1', 5, 'Một'), card('q2', 5, 'Hai')], [card('q3', 5, 'Ba')],
  ]);
  assert.equal(result.stop_reason, 'exhausted');
  assert.deepEqual(json(result.groups), [{ filter: 'with-comments', stopReason: 'exhausted' }]);
  assert.deepEqual(json(result.records.map((row: any) => row.review_id)), ['q1', 'q2', 'q3'], 'no review is dropped');
  assert.deepEqual(json(result.pages.map((p: any) => p.page)), [1, 2]);
  assert.equal(nextClicks, 1);
});

async function identicalFilterCrawl(change: 'fresh' | 'loading' | 'stale' | 'busy' | 'wrong-filter'): Promise<any> {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'Tất cả', 2, true)}
      ${filter('with-comments', 'Có bình luận', 2)}
      <div class="product-ratings__list" style="opacity:1">
        ${card('a1', 5, 'Một')}${card('a2', 5, 'Hai')}
      </div>
    </div>`);
  const window = dom.window as any;
  const all = window.document.querySelector('[data-key="all"].product-rating-overview__filter');
  const comments = window.document.querySelector('[data-key="with-comments"].product-rating-overview__filter');
  const list = window.document.querySelector('.product-ratings__list');
  comments.addEventListener('click', () => {
    all.classList.remove('product-rating-overview__filter--active');
    (change === 'wrong-filter' ? all : comments).classList.add('product-rating-overview__filter--active');
    if (change === 'stale') return;
    if (change === 'busy') {
      list.innerHTML = card('a1', 5, 'Một') + card('a2', 5, 'Hai');
      list.setAttribute('aria-busy', 'true');
      return;
    }
    if (change === 'fresh') {
      list.innerHTML = card('a1', 5, 'Một') + card('a2', 5, 'Hai');
      return;
    }
    list.style.opacity = '0';
    list.setAttribute('aria-busy', 'true');
    window.setTimeout(() => {
      list.style.opacity = '1';
      list.removeAttribute('aria-busy');
    }, 0);
  });
  try {
    return await crawl(dom, reviewPolicy({
      mode: 'with-comments', stars: [], totalPerLink: 20, allocation: 'pooled',
    }));
  } finally { dom.window.close(); }
}

test('identical All to WithComments results are accepted with native loading or fresh cards', async () => {
  for (const evidence of ['loading', 'fresh'] as const) {
    const result = await identicalFilterCrawl(evidence);
    assert.deepEqual(json(result.records.map((row: any) => row.review_id)), ['a1', 'a2'], evidence);
    assert.equal(result.stop_reason, 'exhausted', evidence);
    assert.equal(result.error, null, evidence);
    assert.deepEqual(json(result.pages.map((page: any) => [page.filter, page.ids])), [
      ['with-comments', ['a1', 'a2']],
    ], evidence);
  }
});

test('an active class alone is never completion evidence for identical results', async () => {
  const cases = [
    ['stale', 'a list that never loaded'],
    ['busy', 'a list that stays busy'],
    ['wrong-filter', 'a different filter that activated'],
  ] as const;
  for (const [change, label] of cases) {
    const result = await identicalFilterCrawl(change);
    assert.equal(result.stop_reason, 'control_changed', label);
    assert.equal(result.error, 'CONTROL_CHANGED', label);
    assert.deepEqual(json(result.records ?? []), [], label);
  }
});

test('a filter that returns cards of the wrong rating still fails closed', async () => {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'Tất cả', 2)}
      ${filter('1', '1 sao', 2, true)}
      ${filter('2', '2 sao', 2)}
      ${filter('3', '3 sao', 0)}${filter('4', '4 sao', 0)}${filter('5', '5 sao', 0)}
      <div class="product-ratings__list" style="opacity:1">
        ${card('a1', 1, 'Một')}${card('a2', 1, 'Hai')}
      </div>
    </div>`);
  const window = dom.window as any;
  const one = window.document.querySelector('[data-key="1"].product-rating-overview__filter');
  const two = window.document.querySelector('[data-key="2"].product-rating-overview__filter');
  const list = window.document.querySelector('.product-ratings__list');
  two.addEventListener('click', () => {
    one.classList.remove('product-rating-overview__filter--active');
    two.classList.add('product-rating-overview__filter--active');
    list.innerHTML = card('a1', 1, 'Một') + card('a2', 1, 'Hai');
  });
  try {
    const result = await crawl(dom, reviewPolicy({
      mode: 'stars', stars: [1, 2], totalPerLink: 20, allocation: 'pooled',
    }));
    assert.equal(result.stop_reason, 'control_changed');
    assert.equal(result.error, 'CONTROL_CHANGED');
    assert.ok(!json(result.records ?? []).some((row: any) => row.source_filter === '2'));
  } finally { dom.window.close(); }
});

/** Star filters; a click on a key in `boxes` shows the «No ratings yet» box, on a key in `lists` its cards, on a key in neither nothing. */
function starPage(labels: Record<string, number>, active: string, boxes: string[], lists: Record<string, string>) {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'All', 3)}${filter('with-comments', 'With Comments', 3)}
      ${['1', '2', '3', '4', '5'].map(star => filter(star, `${star} Star`, labels[star] ?? 0, star === active)).join('')}
      <div class="product-ratings__list" style="opacity:1">${lists[active] ?? ''}</div>
    </div>`);
  const window = dom.window as any;
  const root = window.document.querySelector('.product-ratings');
  for (const element of root.querySelectorAll('.product-rating-overview__filter')) {
    const key = element.dataset.key;
    if (!boxes.includes(key) && !(key in lists)) continue;
    element.addEventListener('click', () => {
      for (const other of root.querySelectorAll('.product-rating-overview__filter'))
        other.classList.toggle('product-rating-overview__filter--active', other === element);
      root.querySelector('.product-ratings__list')?.remove();
      root.querySelector('.product-ratings-comments-view__no-data')?.remove();
      root.insertAdjacentHTML('beforeend', boxes.includes(key)
        ? '<div class="product-ratings-comments-view__no-data"><div class="product-ratings-comments-view__no-data__text">No ratings yet</div></div>'
        : `<div class="product-ratings__list" style="opacity:1">${lists[key]}</div>`);
    });
  }
  return dom;
}

/** Runs `action` once when the harness clock passes `ms` from now (the clock moves 100 ms per Date.now call). */
function after(window: any, ms: number, action: () => void) {
  const now = window.Date.now, at = now() + ms;
  let done = false;
  window.Date.now = () => {
    const time = now();
    if (!done && time >= at) { done = true; action(); }
    return time;
  };
}
const NO_DATA = '<div class="product-ratings-comments-view__no-data"><div class="product-ratings-comments-view__no-data__text">No ratings yet</div></div>';
/** Replaces whatever the list area shows (list or no-data box) with these cards. */
const showCards = (root: any, cards: string, before: any = null) => {
  root.querySelector('.product-ratings__list')?.remove();
  root.querySelector('.product-ratings-comments-view__no-data')?.remove();
  const html = `<div class="product-ratings__list" style="opacity:1">${cards}</div>`;
  if (before) before.insertAdjacentHTML('beforebegin', html); else root.insertAdjacentHTML('beforeend', html);
};

test('#1 1B: a star whose label counts reviews but whose filter shows the «No ratings yet» box for the full 20 s is exhausted; the other stars are read', async () => {
  // Live 26/11 (run 6e35d532): «3 Star (1)», and the 3-star filter shows the box.
  const dom = starPage({ '1': 1, '3': 1, '5': 1 }, '1', ['3'], { '1': card('s1', 1, 'Một sao'), '5': card('s5', 5, 'Năm sao') });
  const window = dom.window as any;
  const clickedAt: Record<string, number> = {};
  for (const key of ['3', '5'])
    window.document.querySelector(`[data-key="${key}"]`).addEventListener('click', () => { clickedAt[key] = window.Date.now(); });
  try {
    const result = await crawl(dom, reviewPolicy({ mode: 'stars', stars: [1, 3, 5], totalPerLink: 10, allocation: 'pooled' }));
    assert.deepEqual([result.stop_reason, result.error], ['exhausted', null], 'the run does not fail');
    assert.deepEqual(json(result.groups), [
      { filter: '1', stopReason: 'exhausted' }, { filter: '3', stopReason: 'exhausted' }, { filter: '5', stopReason: 'exhausted' },
    ]);
    assert.deepEqual(json(result.records.map((row: any) => row.review_id)), ['s1', 's5'], 'the 3-star group has 0 rows');
    assert.ok(clickedAt['5']! - clickedAt['3']! >= 3_500 + 20_000, 'the 3-star group ends only after the full 20 s settle limit');
  } finally { dom.window.close(); }
});

/** «With Comments (count)»: pages of cards; next goes one page further while `pages` has one, and the bar shows `barPages`.
 *  An empty page shows an empty loaded list or, for `emptyAs: 'box'`, only the «No ratings yet» box.
 *  `onPage` runs after the pager moved. Returns the harness time of each next click and of the crawl end. */
async function hiddenReviewsCrawl(count: number, pages: string[][], barPages: number, emptyAs: 'list' | 'box' = 'list',
    onPage?: (page: number, window: any, root: any, holder: any) => void) {
  const dom = boot(`
    <div class="product-ratings">
      ${filter('all', 'All', count)}
      ${filter('with-comments', 'With Comments', count, true)}
      <div class="product-ratings__list" style="opacity:1">${pages[0]!.join('')}</div>
      <div class="controller">${controller(1, barPages)}</div>
    </div>`);
  const window = dom.window as any;
  const root = window.document.querySelector('.product-ratings');
  const holder = window.document.querySelector('.controller');
  let page = 1, nextClicks = 0;
  const clickedAt: number[] = [];
  holder.addEventListener('click', (event: any) => {
    if (!event.target.closest('.shopee-icon-button--right')) return;
    nextClicks++;
    clickedAt.push(window.Date.now());
    if (page >= pages.length) return; // the pager does not move
    page++;
    const cards = pages[page - 1]!;
    if (!cards.length && emptyAs === 'box') {
      root.querySelector('.product-ratings__list')?.remove();
      holder.insertAdjacentHTML('beforebegin', NO_DATA);
    } else showCards(root, cards.join(''), holder);
    holder.innerHTML = controller(page, barPages);
    onPage?.(page, window, root, holder);
  });
  try {
    const result = await crawl(dom, reviewPolicy({ mode: 'with-comments', stars: [], totalPerLink: 50, allocation: 'pooled' }));
    return { result, nextClicks, clickedAt, endedAt: window.Date.now() };
  } finally { dom.window.close(); }
}
const seventeen = [0, 1, 2].map(p => Array.from({ length: p === 2 ? 5 : 6 }, (_, i) => card(`h${p * 6 + i + 1}`, 5, `Bình luận ${p * 6 + i + 1}`)));
const ids = (count: number) => Array.from({ length: count }, (_, i) => `h${i + 1}`);

test('#1 1B: a page that the pager reached and that stays empty for the full 20 s ends the group with the reviews already read', async () => {
  // Live 27/11 (runs 8d61990a): «With Comments (24)», 17 reviews on pages 1–3, next still enabled, page 4 empty.
  for (const emptyAs of ['list', 'box'] as const) {
    const { result, nextClicks, clickedAt, endedAt } = await hiddenReviewsCrawl(24, [...seventeen, []], 5, emptyAs);
    assert.deepEqual([result.stop_reason, result.error], ['exhausted', null], emptyAs);
    assert.deepEqual(json(result.groups), [{ filter: 'with-comments', stopReason: 'exhausted' }], emptyAs);
    assert.deepEqual(json(result.records.map((row: any) => row.review_id)), ids(17), `${emptyAs}: the 17 rows are kept`);
    assert.equal(nextClicks, 3, emptyAs);
    assert.ok(endedAt - clickedAt[2]! >= 3_500 + 20_000, `${emptyAs}: page 4 ends the group only after the full 20 s settle limit`);
  }
});

test('#1 1B: cards that arrive at 7 s or 15 s are read normally, never ended early as empty', async () => {
  for (const delay of [7_000, 15_000]) {
    // A star filter that shows the no-data box first («3 Star (1)»).
    const dom = starPage({ '1': 1, '3': 1 }, '1', ['3'], { '1': card('s1', 1, 'Một sao') });
    const window = dom.window as any, root = window.document.querySelector('.product-ratings');
    root.querySelector('[data-key="3"]').addEventListener('click', () => after(window, delay, () => showCards(root, card('s3', 3, 'Ba sao'))));
    try {
      const star = await crawl(dom, reviewPolicy({ mode: 'stars', stars: [1, 3], totalPerLink: 10, allocation: 'pooled' }));
      assert.deepEqual([star.stop_reason, star.error], ['exhausted', null], `star filter, ${delay} ms`);
      assert.deepEqual(json(star.records.map((row: any) => row.review_id)), ['s1', 's3'], `star filter, ${delay} ms: the late card is read`);
    } finally { dom.window.close(); }

    // A later page that the pager reached, empty first.
    const { result: later } = await hiddenReviewsCrawl(24, [...seventeen, []], 4, 'box', (page, pageWindow, pageRoot, holder) => {
      if (page === 4) after(pageWindow, delay, () => showCards(pageRoot, card('h18', 5, 'Bình luận 18'), holder));
    });
    assert.deepEqual([later.stop_reason, later.error], ['exhausted', null], `later page, ${delay} ms`);
    assert.deepEqual(json(later.records.map((row: any) => row.review_id)), ids(18), `later page, ${delay} ms: the late card is read`);

    // A first page that is active from the start and loads late.
    const first = boot(`
      <div class="product-ratings">
        ${filter('all', 'All', 1)}${filter('with-comments', 'With Comments', 1, true)}
        ${NO_DATA}
      </div>`);
    const firstWindow = first.window as any, firstRoot = firstWindow.document.querySelector('.product-ratings');
    after(firstWindow, delay, () => showCards(firstRoot, card('f1', 5, 'Đến muộn')));
    try {
      const loaded = await crawl(first, reviewPolicy({ mode: 'with-comments', stars: [], totalPerLink: 10, allocation: 'pooled' }));
      assert.deepEqual([loaded.stop_reason, loaded.error], ['exhausted', null], `first page, ${delay} ms`);
      assert.deepEqual(json(loaded.records.map((row: any) => row.review_id)), ['f1'], `first page, ${delay} ms: the late card is read`);
    } finally { first.window.close(); }
  }
});

test('#1 1B guards: a pager that does not move after next, or a filter that never becomes active, still fails closed', async () => {
  const { result, nextClicks } = await hiddenReviewsCrawl(24, seventeen, 5);
  assert.deepEqual([result.stop_reason, result.error, nextClicks], ['control_changed', 'CONTROL_CHANGED', 3], 'the active page stays 3');
  // A click on 3 Star changes nothing: the 1-star filter stays active.
  const dom = starPage({ '1': 1, '3': 1 }, '1', [], { '1': card('s1', 1, 'Một sao') });
  try {
    const stuck = await crawl(dom, reviewPolicy({ mode: 'stars', stars: [1, 3], totalPerLink: 10, allocation: 'pooled' }));
    assert.deepEqual([stuck.stop_reason, stuck.error], ['control_changed', 'CONTROL_CHANGED'], 'a filter that never becomes active');
  } finally { dom.window.close(); }
});

test('#1 1B: a count job still reads only the labels, also when a star shows the no-data box', async () => {
  const dom = starPage({ '1': 1, '3': 1 }, '3', [], {});
  const root = (dom.window as any).document.querySelector('.product-ratings');
  root.querySelector('.product-ratings__list').remove();
  root.insertAdjacentHTML('beforeend', '<div class="product-ratings-comments-view__no-data"><div class="product-ratings-comments-view__no-data__text">No ratings yet</div></div>');
  try {
    const result = await crawl(dom, reviewPolicy({ mode: 'with-comments', stars: [], totalPerLink: 10, allocation: 'pooled' }), 'counts');
    const observed = (value: number) => ({ status: 'observed', value });
    assert.deepEqual(json({ kind: result.kind, counts: result.source_counts }), { kind: 'counts', counts: {
      stars: { '1': observed(1), '2': observed(0), '3': observed(1), '4': observed(0), '5': observed(0) }, withComments: observed(3),
    } });
    assert.deepEqual(Object.keys(result).sort(), ['kind', 'source_counts', 'source_counts_observed_at']);
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
