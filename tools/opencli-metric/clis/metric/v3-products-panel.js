// Owned-tab native controls and retained panel coverage. No network requests or pagination here.
export function inspectV3ProductsPanel({ action = 'read', index, labels, candidates = [] } = {}) {
  if (location.protocol !== 'https:' || !['metric.vn', 'www.metric.vn'].includes(location.hostname))
    return { stop: 'CAPTURE_ORIGIN_CHANGED' };
  const text = e => (e?.innerText || e?.textContent || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  const visible = e => {
    const r = e?.getBoundingClientRect();
    return Boolean(r?.width && r.height && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden');
  };
  const panels = [...document.querySelectorAll('.statistic-item')].filter(e => visible(e) &&
    /^(Top Products|Top sản phẩm|Sản phẩm bán chạy)$/i.test(text(e.querySelector('.statistic-item__title'))));
  if (panels.length !== 1) return { stop: 'EVIDENCE_PRODUCTS_PANEL_MISSING' };
  const panel = panels[0], rect = panel.getBoundingClientRect();
  const controls = [...panel.querySelectorAll('.ant-select')].filter(visible);
  if (controls.length !== 2) return { stop: 'EVIDENCE_PRODUCTS_CONTROLS_MISSING' };
  const values = controls.map(e => text(e.querySelector('.ant-select-selection-item') || e));
  if (action === 'open') {
    if (![0, 1].includes(index)) return { stop: 'CAPTURE_CONTROL_NOT_SELECTABLE' };
    const target = controls[index].querySelector('.ant-select-selector') || controls[index];
    target.click();
    return { ok: true };
  }
  if (action === 'option') {
    const options = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')]
      .filter(e => visible(e) && labels?.includes(text(e)) && e.getAttribute('aria-disabled') !== 'true' &&
        !e.classList.contains('ant-select-item-option-disabled'));
    if (options.length !== 1) return { stop: 'CAPTURE_CONTROL_NOT_SELECTABLE' };
    options[0].click();
    return { ok: true };
  }
  const sorted = /^(Revenue in time period|Revenue|Doanh số trong kỳ|Doanh số)$/i.test(values[0]) &&
    /^(Descending|Giảm dần)$/i.test(values[1]);
  if (!sorted) return { stop: 'EVIDENCE_PRODUCTS_SORT_MISMATCH', values };
  // Data admission reads native controls only. A scrolling/clipped list is an image
  // limitation; the strict default read below still refuses to claim panel coverage.
  if (action === 'sort') return { values };
  if (panel.querySelector('.ant-spin-spinning,.ant-skeleton-active,[aria-busy=true]')) return { stop: 'EVIDENCE_PRODUCTS_LOADING' };
  const contained = e => {
    const r = e.getBoundingClientRect();
    if (!visible(e) || r.left < rect.left - 1 || r.right > rect.right + 1 || r.top < rect.top - 1 || r.bottom > rect.bottom + 1) return false;
    for (let p = e.parentElement; p && p !== panel; p = p.parentElement) {
      const style = getComputedStyle(p), b = p.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (r.top < b.top - 1 || r.bottom > b.bottom + 1)) return false;
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (r.left < b.left - 1 || r.right > b.right + 1)) return false;
    }
    return true;
  };
  const heading = panel.querySelector('.statistic-item__title');
  if (![heading, ...controls].every(contained)) return { stop: 'EVIDENCE_PRODUCTS_PANEL_CLIPPED' };
  // Source identities must be present in actual DOM attributes/links. Never infer a rank from
  // the number of cards or recreate a source picture from raw JSON/title matching.
  const nodes = [...panel.querySelectorAll('[data-row-key],[data-product-base-id],[data-product-id],a[href]')];
  for (const e of panel.querySelectorAll('*')) {
    const style = getComputedStyle(e);
    if ((/(auto|scroll)/.test(style.overflowY) && e.scrollHeight > e.clientHeight + 1) ||
        (/(auto|scroll)/.test(style.overflowX) && e.scrollWidth > e.clientWidth + 1))
      return { stop: 'EVIDENCE_PRODUCTS_PANEL_CLIPPED' };
  }
  const covered = [];
  let previous = null;
  for (const [i, candidate] of candidates.entries()) {
    const id = candidate.product_base_id;
    if (typeof id !== 'string' || !/^[1238]__[1-9][0-9]{0,19}__[1-9][0-9]{0,19}$/.test(id))
      continue;
    const matching = nodes.filter(n => ['data-row-key', 'data-product-base-id', 'data-product-id', 'href']
      .some(a => (n.getAttribute(a) || '').split(/[^A-Za-z0-9_]+/).includes(id)));
    if (!matching.length) continue;
    const node = matching.find(contained);
    if (!node) return { stop: 'EVIDENCE_PRODUCTS_PANEL_CLIPPED' };
    const row = node.closest('.ant-table-row,.product-item,.product-card,.ProductItem,li') || node;
    if (!contained(row)) return { stop: 'EVIDENCE_PRODUCTS_PANEL_CLIPPED' };
    const position = row.getBoundingClientRect();
    if (previous && (position.top < previous.top - 1 || (Math.abs(position.top - previous.top) <= 1 && position.left <= previous.left)))
      return { stop: 'EVIDENCE_PRODUCTS_ORDER_MISMATCH' };
    previous = { top: position.top, left: position.left };
    covered.push({ sourceRank: i + 1, productBaseId: id });
  }
  if (candidates.length && !covered.length) return { stop: 'EVIDENCE_PRODUCTS_ID_UNAVAILABLE' };
  return { title: text(heading), metricLabel: values[0], orderLabel: values[1], candidates: covered,
    rect: { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height } };
}

/** Apply the actual two source dropdowns; the later captured request still verifies exact sort. */
export async function selectV3ProductsOrder(page, waitForIdle = async () => {}) {
  const choices = [['Revenue in time period', 'Revenue', 'Doanh số trong kỳ', 'Doanh số'], ['Descending', 'Giảm dần']];
  let changed = false;
  let state = await page.evaluate(inspectV3ProductsPanel, { action: 'sort' });
  if (!state.stop) return { changed };
  if (state.stop !== 'EVIDENCE_PRODUCTS_SORT_MISMATCH') throw Object.assign(new Error('CAPTURE_PRODUCT_SORT_UNAVAILABLE'), { code: 'CAPTURE_PRODUCT_SORT_UNAVAILABLE' });
  for (const index of [0, 1]) {
    state = await page.evaluate(inspectV3ProductsPanel, { action: 'sort' });
    if (!state.stop) return { changed };
    if (choices[index].includes(state.values?.[index])) continue;
    for (const args of [{ action: 'open', index }, { action: 'option', labels: choices[index] }]) {
      const result = await page.evaluate(inspectV3ProductsPanel, args);
      if (result.stop) throw Object.assign(new Error('CAPTURE_PRODUCT_SORT_UNAVAILABLE'), { code: 'CAPTURE_PRODUCT_SORT_UNAVAILABLE' });
      await page.wait(250);
    }
    changed = true;
    await waitForIdle();
  }
  state = await page.evaluate(inspectV3ProductsPanel, { action: 'sort' });
  if (state.stop) throw Object.assign(new Error('CAPTURE_PRODUCT_SORT_UNAVAILABLE'), { code: 'CAPTURE_PRODUCT_SORT_UNAVAILABLE' });
  return { changed };
}
