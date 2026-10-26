// Explicit two-window capture. Launched from the checkout; no installed adapter changes.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { sanitizeNetworkResponses } from './capture.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true });
require('ajv-formats')(ajv);
const schema = (name) =>
  JSON.parse(readFileSync(new URL(`../../../../contracts/analysis/${name}.schema.json`, import.meta.url), 'utf8'));
const validateSpec = ajv.compile(schema('metric-v3-capture-spec'));
const validateManifest = ajv.compile(schema('metric-v3-window-capture'));

const stop = (code, details) => {
  throw Object.assign(new Error(code), { code, details });
};
const equalSet = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  new Set(a).size === a.length &&
  [...a].sort().join('\0') === [...b].sort().join('\0');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = (value) => `${JSON.stringify(value, null, 2)}\n`;
const endpoints = ['search-basic', 'insight', 'products', 'shops', 'groups'];

/** Category identity must come from this live tree, including its parent and all children. */
export function resolveV3Category(preset, taxonomy) {
  if (
    !taxonomy ||
    taxonomy.id !== preset.category.id ||
    taxonomy.label !== preset.category.label ||
    preset.category.children.some(
      (child) => !taxonomy.children.some((item) => item.id === child.id && item.label === child.label),
    )
  ) {
    stop('CAPTURE_CATEGORY_NOT_SELECTABLE');
  }
  return taxonomy;
}

/** Runs in the owned tab. Read only: never return account information or arbitrary app state. */
export function readV3Page({ categoryId }) {
  const root = document.querySelector('#QuerySearchBuilder');
  const visible = (e) =>
    Boolean(
      e &&
      e.getBoundingClientRect().width &&
      e.getBoundingClientRect().height &&
      getComputedStyle(e).display !== 'none' &&
      getComputedStyle(e).visibility !== 'hidden',
    );
  const txt = (e) => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').trim();
  if (location.protocol !== 'https:' || !['metric.vn', 'www.metric.vn'].includes(location.hostname))
    return { stop: 'CAPTURE_ORIGIN_CHANGED' };
  if (
    document.querySelector('input[type=password]') ||
    /\/login|\/sign-in/.test(location.pathname) ||
    (!root && /đăng nhập|log in|sign in/i.test(document.body.innerText))
  )
    return { stop: 'CAPTURE_LOGIN_REQUIRED' };
  const alerts = [
    ...document.querySelectorAll('[role=alert],.ant-modal-body,.ant-message-notice-content,.ant-notification-notice'),
  ].filter(visible);
  if (
    document.querySelector('iframe[src*="captcha"],.g-recaptcha,.h-captcha') ||
    alerts.some((e) =>
      /captcha|verify.{0,20}human|xác minh|access denied|hạn chế|hết lượt|không đủ|insufficient|quota|warning|cảnh báo/i.test(
        txt(e),
      ),
    )
  )
    return { stop: 'CAPTURE_ACCESS_RESTRICTED' };
  if (!root) return { stop: 'CAPTURE_UI_CHANGED' };
  const labels = [...root.querySelectorAll('.filter-label')];
  const select = (pattern) => labels.find((e) => pattern.test(txt(e)))?.parentElement?.querySelector('.ant-select');
  const selected = (e) =>
    [...(e?.querySelectorAll('.ant-select-selection-item-content,.ant-select-selection-item') || [])]
      .filter((n) => !n.querySelector('.ant-select-selection-item-content'))
      .map(txt);
  const check = (pattern) => {
    const e = [...root.querySelectorAll('label.ant-checkbox-wrapper')].find((e) => pattern.test(txt(e)));
    return e?.querySelector('input')?.checked ?? null;
  };
  const switches = [...root.querySelectorAll('[role=switch]')];
  const switchValue = (pattern) => {
    const e = switches.find((e) => pattern.test(txt(e.parentElement)));
    return e ? e.getAttribute('aria-checked') === 'true' : null;
  };
  let taxonomy = null,
    selectedCategoryIds = null;
  const stack = [document.querySelector('#__nuxt')?._vnode],
    seen = new Set();
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== 'object') continue;
    const c = v.component;
    if (c && !seen.has(c)) {
      seen.add(c);
      if ((c.type?.name || c.type?.__name) === 'CategorySelector') {
        selectedCategoryIds = Array.isArray(c.props.value) ? [...c.props.value] : null;
        const n = c.props.option?.options?.find((n) => n.value === categoryId);
        if (n)
          taxonomy = {
            id: n.value,
            label: n.label,
            displayLabel: n.en_label,
            children: (n.children || []).map((n) => ({ id: n.value, label: n.label, displayLabel: n.en_label })),
          };
      }
      stack.push(c.subTree);
    }
    if (Array.isArray(v.children)) stack.push(...v.children);
    if (v.suspense) stack.push(v.suspense.activeBranch);
  }
  const breadcrumb = [...document.querySelectorAll('#breadcrumb .vs-breadcrumb-link')].map(txt);
  const category =
    taxonomy &&
    selectedCategoryIds &&
    selectedCategoryIds.every((id) => taxonomy.children.some((n) => n.id === id)) &&
    [taxonomy.label, taxonomy.displayLabel].includes(breadcrumb.at(-1))
      ? {
          id: taxonomy.id,
          label: taxonomy.label,
          children: taxonomy.children
            .filter((n) => selectedCategoryIds.includes(n.id))
            .map(({ id, label }) => ({ id, label })),
        }
      : null;
  const rows = [...root.querySelectorAll('.filter-item')].map((e) => ({
    selections: [...e.querySelectorAll('.ant-select')].map((e) => txt(e.querySelector('.ant-select-selection-item'))),
    numbers: [...e.querySelectorAll('.ant-input-number-input')].map((e) => e.value),
  }));
  const active = rows.filter((row) =>
    row.selections.length === 3
      ? row.selections[0] || row.selections[2] || (row.numbers[0] && !/^1\s*x$/.test(row.numbers[0]))
      : row.selections.some(Boolean) || row.numbers.some(Boolean),
  );
  const parameter = active.length === 1 ? active[0] : null;
  const review =
    parameter &&
    /^(Total review|Tổng đánh giá)$/i.test(parameter.selections[0]) &&
    /^(Total sold|Tổng đã bán)$/i.test(parameter.selections[2])
      ? {
          firstField: 'rating_count',
          operator: parameter.selections[1],
          firstRate: 1,
          secondField: 'order_count',
          secondRate: Number(parameter.numbers[0]?.replace(/\s*x\s*$/, '')),
        }
      : null;
  const exclusionControls = [...root.querySelectorAll('.filter-label')].filter((e) =>
    /^(Exclude|Loại trừ|Brand$|Thương hiệu$)/i.test(txt(e)),
  );
  const exclusions = exclusionControls.flatMap((e) => selected(e.parentElement?.querySelector('.ant-select')));
  if (check(/^(Smart exclusion|Loại trừ thông minh)/i) === true) exclusions.push('smart-exclusion');
  const keywordControl = select(/^(Keywords|Từ kh[oó]a)/i);
  const keywords = [...(keywordControl?.querySelectorAll('.ks-chip') || [])].map((e) => {
    const n = e.cloneNode(true);
    n.querySelectorAll('.ant-tag-close-icon').forEach((x) => x.remove());
    return txt(n);
  });
  const date = (value) => {
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : value;
  };
  const dates = [...root.querySelectorAll('.ant-picker input')].map((e) => date(e.value));
  const submit = [...root.querySelectorAll('button')].find((e) => /^(Analytics|Phân tích)$/.test(txt(e)));
  const overview = [...document.querySelectorAll('.statistic-item')].find((e) =>
    /Market Overview|Tổng quan thị trường/i.test(txt(e.querySelector('.statistic-item__title'))),
  );
  const bodyText = document.body.innerText;
  const overviewText = overview
    ? txt(overview)
    : (bodyText.split(/Market Overview\n|Tổng quan thị trường\n/)[1] || '')
        .split(/Brand\/Keyword Analysis|Phân tích theo thương hiệu/)[0]
        .trim();
  const comparison = [...document.querySelectorAll('.ant-select')].find((e) =>
    /Compare with time period|So sánh với khoảng thời gian/.test(txt(e)),
  );
  return {
    taxonomy,
    selectedCategoryIds,
    advancedVisible: Boolean(root.querySelector('.category-tab__button')),
    categoryMode: txt(root.querySelector('.category-tab__button.active')),
    breadcrumb,
    multi: Boolean(select(/^(Platform|Kênh bán hàng|Nền tảng)/i)?.classList.contains('ant-select-multiple')),
    keywordInput: keywordControl?.querySelector('input')?.value ?? null,
    period: { startDate: dates[0], endDate: dates[1] },
    submitReady: Boolean(submit && !submit.disabled && !submit.querySelector('.anticon-loading')),
    submitIdle: Boolean(submit && !submit.querySelector('.anticon-loading')),
    comparisonDefault: Boolean(comparison && /Not selected|Không chọn/i.test(txt(comparison))),
    displayedKPIs: overviewText.slice(0, 700),
    appliedState: {
      keywords,
      platforms: selected(select(/^(Platform|Kênh bán hàng|Nền tảng)/i)).map((s) =>
        s.trim().toLowerCase().replace('tiktok shop', 'tiktok'),
      ),
      smartQuery: check(/^(Smart query|Tìm kiếm thông minh)/i),
      category,
      usefulFilters: {
        fake: check(/^(Filter fake\/abnormal products|Lọc sản phẩm ảo)/i),
        gifts: check(/^(Exclude gifts|Lọc sản phẩm quà tặng)/i),
        deleted: check(/^(Exclude deleted products|Lọc bỏ sản phẩm đã bị xóa)/i),
      },
      advancedFilter: review,
      shopTypes: [
        check(/^(Mall shop|Shop Chính Hãng)/i) === true ? 'mall' : null,
        check(/^(Normal shop|Shop Thông thường)/i) === true ? 'regular' : null,
      ].filter(Boolean),
      aiNormalisation: switchValue(/^AI /i),
      customizeCategory: switchValue(/Customize category|Tùy chỉnh danh mục/i),
      exclusions,
    },
  };
}

// Only search/filter actions in the owned page. No export, account, or private API mutation.
function formAction(action) {
  const root = document.querySelector('#QuerySearchBuilder');
  const txt = (e) => (e?.innerText || e?.textContent || '').replace(/\s+/g, ' ').trim();
  const fail = () => ({ stop: 'CAPTURE_CONTROL_NOT_SELECTABLE' });
  const click = (e) => {
    if (!e || e.disabled || e.getAttribute('aria-disabled') === 'true') return fail();
    e.click();
    return { ok: true };
  };
  const gesture = (e) => {
    if (!e) return fail();
    for (const t of ['mousedown', 'mouseup', 'click'])
      e.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
    return { ok: true };
  };
  const findSelect = (name) =>
    [...root.querySelectorAll('.filter-label')]
      .find((e) => new RegExp(name, 'i').test(txt(e)))
      ?.parentElement?.querySelector('.ant-select');
  if (action.kind === 'advanced') return click(root.querySelector('.toggle-advanced-filter-btn'));
  if (action.kind === 'multi') return click(root.querySelector('.switch-button'));
  if (action.kind === 'categoryMode')
    return click([...root.querySelectorAll('.category-tab__button')].find((e) => /^(Advanced|Nâng cao)$/.test(txt(e))));
  if (action.kind === 'openSelect') return gesture(findSelect(action.name)?.querySelector('.ant-select-selector'));
  if (action.kind === 'option') {
    const control = findSelect(action.name),
      input = control?.querySelector('input');
    const dropdown = document.getElementById(input?.getAttribute('aria-controls'))?.closest('.ant-select-dropdown');
    const choices = [...(dropdown?.querySelectorAll('.ant-select-item-option') || [])].filter((e) =>
      action.labels.includes(txt(e)),
    );
    return choices.length === 1 ? click(choices[0]) : fail();
  }
  if (action.kind === 'closePopups') {
    for (const e of root.querySelectorAll('.ant-select input,.ant-picker input'))
      e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.activeElement?.blur();
    return { ok: true };
  }
  if (action.kind === 'categoryRoot') return click(document.querySelector('#breadcrumb .vs-breadcrumb-link'));
  if (action.kind === 'categoryAll')
    return click(
      [...root.querySelectorAll('.vs-tree-text')]
        .find((e) => /^(All|Tất cả)$/.test(txt(e)))
        ?.parentElement.querySelector('input'),
    );
  if (action.kind === 'categoryParent')
    return click(
      [...root.querySelectorAll('.vs-tree-text')].find((e) => action.labels.includes(txt(e).replace(/\(\d+\)$/, ''))),
    );
  if (action.kind === 'categoryChild') {
    const n = [...root.querySelectorAll('.vs-tree-text')]
      .find((e) => action.labels.includes(txt(e)))
      ?.parentElement.querySelector('input');
    if (!n) return fail();
    return n.checked === action.checked ? { ok: true } : click(n);
  }
  if (action.kind === 'checkbox') {
    const n = [...root.querySelectorAll('label.ant-checkbox-wrapper')]
      .find((e) => new RegExp(action.label, 'i').test(txt(e)))
      ?.querySelector('input');
    if (!n) return fail();
    return n.checked === action.checked ? { ok: true } : click(n);
  }
  if (action.kind === 'switch') {
    const n = [...root.querySelectorAll('[role=switch]')].find((e) =>
      new RegExp(action.label, 'i').test(txt(e.parentElement)),
    );
    if (!n) return fail();
    return (n.getAttribute('aria-checked') === 'true') === action.checked ? { ok: true } : click(n);
  }
  if (action.kind === 'keyword' || action.kind === 'comma' || action.kind === 'keyup') {
    const n = findSelect('^(Keywords|Từ kh[oó]a)')?.querySelector('input');
    if (!n) return fail();
    n.focus();
    const key = {
      key: ',',
      code: 'Comma',
      keyCode: 188,
      which: 188,
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
    };
    if (action.kind === 'keyup') {
      n.dispatchEvent(new KeyboardEvent('keyup', key));
      return { ok: true };
    }
    if (action.kind === 'comma') {
      // Same comma-commit sequence as the existing adapter: a prevented keydown
      // already committed a chip, so inserting again would leave a stray comma.
      if (
        n.dispatchEvent(new KeyboardEvent('keydown', key)) &&
        n.dispatchEvent(new KeyboardEvent('keypress', { ...key, keyCode: 44, which: 44, charCode: 44 })) &&
        n.dispatchEvent(
          new InputEvent('beforeinput', {
            inputType: 'insertText',
            data: ',',
            bubbles: true,
            cancelable: true,
            composed: true,
          }),
        )
      ) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(n, `${n.value},`);
        n.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ',', composed: true }));
      }
    } else {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(n, action.value);
      n.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: action.value }));
    }
    return { ok: true };
  }
  if (action.kind === 'picker') return gesture([...root.querySelectorAll('.ant-picker')][action.index]);
  if (action.kind === 'date') {
    const panels = [...document.querySelectorAll('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')].filter(
      (e) =>
        e.getBoundingClientRect().height &&
        getComputedStyle(e).pointerEvents !== 'none' &&
        !e.classList.contains('ant-slide-up-leave-active'),
    );
    // A hidden/background tab can retain the other picker's leave transition.
    // Its DOM still has dimensions, but it no longer accepts pointer events.
    const panel = panels.length === 1 ? panels[0] : null;
    if (!panel) return fail();
    const cell = panel.querySelector(`td[title="${action.date}"]`);
    if (cell && !cell.classList.contains('ant-picker-cell-disabled'))
      return { ...click(cell.querySelector('.ant-picker-cell-inner')), done: true };
    const current = panel.querySelector('td.ant-picker-cell-in-view[title]')?.getAttribute('title');
    if (!current) return fail();
    return {
      ...click(
        panel.querySelector(action.date < current ? '.ant-picker-header-prev-btn' : '.ant-picker-header-next-btn'),
      ),
      done: false,
    };
  }
  if (action.kind === 'submit')
    return click([...root.querySelectorAll('button')].find((e) => /^(Analytics|Phân tích)$/.test(txt(e))));
  return fail();
}

/** Passive observation of only the five analytics response types; never reads headers/cookies. */
function installObserver() {
  if (window.__tdnV3Capture) return { ok: true };
  const state = (window.__tdnV3Capture = { responses: [], pending: 0, last: Date.now(), overflow: false });
  const pathOf = (url) => {
    try {
      const u = new URL(url, location.href);
      return /(^|\.)metric\.vn$/.test(u.hostname) &&
        /^\/v2\/market\/analytics\/(search-basic|insight|products|shops|groups)\/$/.test(u.pathname)
        ? u.pathname
        : null;
    } catch {
      return null;
    }
  };
  const keep = (path, method, status, request, text) => {
    if (state.responses.length >= 100 || (typeof text === 'string' && text.length > 12_000_000)) {
      state.overflow = true;
      return;
    }
    let body;
    try {
      body = typeof text === 'string' ? JSON.parse(text) : text;
    } catch {
      return;
    }
    try {
      request = typeof request === 'string' ? JSON.parse(request) : request;
    } catch {
      request = null;
    }
    state.responses.push({
      urlPath: path,
      method,
      status,
      requestBody: request,
      body,
      responseOrder: state.responses.length,
    });
  };
  const fetch = window.fetch;
  window.fetch = async function (...args) {
    const path = pathOf(args[0]?.url || String(args[0]));
    if (path) state.pending++;
    try {
      const response = await fetch.apply(this, args);
      if (path)
        try {
          keep(path, args[1]?.method || 'GET', response.status, args[1]?.body, await response.clone().text());
        } catch {}
      return response;
    } finally {
      if (path) {
        state.pending--;
        state.last = Date.now();
      }
    }
  };
  const open = XMLHttpRequest.prototype.open,
    send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this.__tdnV3Meta = { method, path: pathOf(url) };
    return open.call(this, method, url, ...args);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const meta = this.__tdnV3Meta;
    if (meta?.path) {
      state.pending++;
      this.addEventListener(
        'loadend',
        () => {
          try {
            keep(
              meta.path,
              meta.method,
              this.status,
              body,
              this.responseType === 'json' ? this.response : this.responseText,
            );
          } catch {
          } finally {
            state.pending--;
            state.last = Date.now();
          }
        },
        { once: true },
      );
    }
    return send.call(this, body);
  };
  return { ok: true };
}

function presetEqual(a, b) {
  return (
    a &&
    b &&
    equalSet(a.keywords, b.keywords) &&
    equalSet(a.platforms, b.platforms) &&
    equalSet(a.shopTypes, b.shopTypes) &&
    a.smartQuery === b.smartQuery &&
    a.aiNormalisation === b.aiNormalisation &&
    a.customizeCategory === b.customizeCategory &&
    a.category?.id === b.category?.id &&
    a.category?.label === b.category?.label &&
    equalSet(
      a.category?.children?.map((x) => `${x.id}:${x.label}`),
      b.category?.children?.map((x) => `${x.id}:${x.label}`),
    ) &&
    ['fake', 'gifts', 'deleted'].every((k) => a.usefulFilters?.[k] === b.usefulFilters?.[k]) &&
    ['firstField', 'operator', 'firstRate', 'secondField', 'secondRate'].every(
      (k) => a.advancedFilter?.[k] === b.advancedFilter?.[k],
    ) &&
    equalSet(a.exclusions, b.exclusions)
  );
}

/** Contract gate used before submit and again before publishing each window manifest. */
export function assertV3Applied(spec, window, observation) {
  resolveV3Category(spec.preset, observation.taxonomy);
  if (
    !presetEqual(spec.preset, observation.appliedState) ||
    observation.keywordInput !== '' ||
    !equalSet(
      observation.selectedCategoryIds,
      spec.preset.category.children.map((n) => n.id),
    ) ||
    observation.period?.startDate !== window.period.startDate ||
    observation.period?.endDate !== window.period.endDate ||
    !/^(Advanced|Nâng cao)$/.test(observation.categoryMode) ||
    !observation.multi
  )
    stop('CAPTURE_APPLIED_STATE_MISMATCH');
}

export function buildV3WindowManifest(spec, window, observation, rawResponses, capturedAt, captureMethod = 'ui', fallbackReason) {
  assertV3Applied(spec, window, observation);
  if (!observation.comparisonDefault) stop('CAPTURE_COMPARISON_MISMATCH');
  const platformIds = { shopee: 1, lazada: 2, tiki: 3, tiktok: 8 };
  const sourceMap = {};
  for (const endpoint of endpoints) {
    const rows = rawResponses
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.urlPath === `/v2/market/analytics/${endpoint}/`);
    if (rows.length === 0) stop('CAPTURE_RESPONSE_MISSING');
    for (const found of rows) {
      if (found.r.status !== 200 || found.r.body?.status !== 'success') stop('CAPTURE_RESPONSE_MISSING');
      const q = found.r.requestBody,
        inc = q?.include_query;
      const comparisons = inc?.composite_compare_lst;
      const comparison = comparisons?.[0]?.[0];
      const expectedComparison = {
        first_field: 'rating_count',
        second_field: 'order_count',
        first_rate: 1,
        second_rate: 0.02,
        compare_condition: '>',
      };
      const comparisonMatches =
        Array.isArray(comparisons) &&
        comparisons.length === 1 &&
        Array.isArray(comparisons[0]) &&
        comparisons[0].length === 1 &&
        comparison &&
        Object.keys(comparison).length === 5 &&
        Object.entries(expectedComparison).every(([key, value]) => comparison[key] === value);
      if (
        !inc ||
        !equalSet(
          inc.platforms,
          spec.preset.platforms.map((p) => platformIds[p]),
        ) ||
        !equalSet(inc.queries, spec.preset.keywords) ||
        !equalSet(
          inc.bee_categories,
          spec.preset.category.children.map((n) => n.id),
        ) ||
        inc.is_smart_queries !== true ||
        inc.is_remove_bad_product !== true ||
        !equalSet(inc.official_types, [1, 0]) ||
        !equalSet(inc.brands, []) ||
        !equalSet(q.exclude_query?.queries, []) ||
        q.exclude_query?.is_smart_queries !== false ||
        q.use_ai_normalized !== false ||
        q.start_date !== window.period.startDate.replaceAll('-', '') ||
        q.end_date !== window.period.endDate.replaceAll('-', '') ||
        !comparisonMatches
      )
        stop('CAPTURE_REQUEST_SCOPE_MISMATCH');
      if (endpoint === 'insight') {
        if (q.interval_days !== window.intervalDays || !Array.isArray(found.r.body.data))
          stop('CAPTURE_TREND_INTERVAL_MISMATCH');
      } else if (q.is_filter_gift !== true || q.notIncludeDeletedProduct !== true) stop('CAPTURE_REQUEST_SCOPE_MISMATCH');
      if (
        ['products', 'shops', 'groups'].includes(endpoint) &&
        (!Array.isArray(found.r.body.data?.[endpoint]) ||
          q.page !== 0 ||
          q.limit < 15 ||
          !/^revenue_custom(_sum)?__desc$/.test(q.sort_by))
      )
        stop('CAPTURE_RESPONSE_MISSING');
      sourceMap[endpoint] = `raw-responses.json#/${found.i}/body/data`;
    }
  }
  const basic = rawResponses.findLast((r) => r.urlPath.endsWith('/search-basic/')).body.data.search_basic;
  const required = ['REVENUE_TOTAL_CUSTOM', 'ORDER_TOTAL_CUSTOM', 'PRODUCT_TOTAL', 'SHOP_TOTAL'];
  if (
    !required.flatMap((k) => [k, `PREVIOUS_${k}`]).every((k) => basic?.aggregations?.some((a) => a.aggregation === k))
  )
    stop('CAPTURE_RESPONSE_MISSING');
  if (
    ![
      'REVENUE__BY__PRICE_RANGE_CUSTOM',
      'ORDER_COUNT__BY__PRICE_RANGE_CUSTOM',
      'REVENUE__BY__SHOP_TYPE_CUSTOM',
      'ORDER_COUNT__BY__SHOP_TYPE_CUSTOM',
    ].every((k) => basic.aggregations.some((a) => a.aggregation === k && Array.isArray(a.entities)))
  )
    stop('CAPTURE_RESPONSE_MISSING');
  const manifest = {
    contractVersion: 'metric-v3-window-capture-v1',
    captureId: randomUUID(),
    captureMethod,
    ...(fallbackReason ? { fallbackReason } : {}),
    capturedAt,
    specDigest: digest(bytes(spec)),
    window,
    appliedState: observation.appliedState,
    selectedCategoryIds: observation.selectedCategoryIds,
    sourceMap,
    displayedKPIs: observation.displayedKPIs,
    comparison: 'source-previous-period',
    captureGate: 'PASSED',
    sourceLimitations: [
      'insight request does not carry gifts/deleted switches', 'absent platform rows are not zero',
      ...(captureMethod === 'page-request' ? ['appliedState records validated request scope, not DOM control state'] : []),
    ],
    files: [
      {
        path: 'raw-responses.json',
        sha256: digest(bytes(rawResponses)),
        byteSize: Buffer.byteLength(bytes(rawResponses)),
      },
    ],
  };
  if (!validateManifest(manifest)) stop('CAPTURE_MANIFEST_INVALID');
  return manifest;
}

export async function captureV3Preset(page, spec, outputDir, progress = () => {}) {
  if (!validateSpec(spec)) stop('CAPTURE_PRESET_INVALID');
  // Nuxt may mount after document.readyState becomes complete. Authentication
  // and access stops still terminate immediately; only a missing form may wait.
  for (let i = 0; i < 60; i++) {
    const initial = await page.evaluate(readV3Page, { categoryId: spec.preset.category.id });
    if (!initial.stop) break;
    if (initial.stop !== 'CAPTURE_UI_CHANGED' || i === 59) stop(initial.stop);
    await page.wait(500);
  }
  const read = async () => {
    const state = await page.evaluate(readV3Page, { categoryId: spec.preset.category.id });
    if (state.stop) stop(state.stop);
    return state;
  };
  const act = async (action) => {
    await read();
    const result = await page.evaluate(formAction, action);
    if (result.stop) stop(result.stop, { action: action.kind });
    await page.wait(120);
    return result;
  };
  const until = async (predicate, code, limit = 120) => {
    let state;
    for (let i = 0; i < limit; i++) {
      state = await read();
      if (predicate(state)) return state;
      await page.wait(1000);
    }
    stop(code, { observation: state });
  };
  progress('Preparing search controls');
  await until((s) => s.submitIdle, 'CAPTURE_CONTROL_NOT_SELECTABLE');
  let state = await read();
  if (!state.advancedVisible) await act({ kind: 'advanced' });
  state = await read();
  if (!state.multi) await act({ kind: 'multi' });
  for (const p of spec.preset.platforms) {
    state = await read();
    if (state.appliedState.platforms.includes(p)) continue;
    await act({ kind: 'openSelect', name: '^(Platform|Kênh bán hàng|Nền tảng)' });
    await act({
      kind: 'option',
      name: '^(Platform|Kênh bán hàng|Nền tảng)',
      labels: [p === 'tiktok' ? 'Tiktok' : p[0].toUpperCase() + p.slice(1)],
    });
  }
  await act({ kind: 'closePopups' });
  state = await read();
  if (!/^(Advanced|Nâng cao)$/.test(state.categoryMode)) await act({ kind: 'categoryMode' });
  state = await read();
  const taxonomy = resolveV3Category(spec.preset, state.taxonomy);
  await act({ kind: 'categoryRoot' });
  for (let i = 0; i < 2; i++) {
    state = await read();
    if (state.selectedCategoryIds?.length === 0) break;
    await act({ kind: 'categoryAll' });
  }
  state = await read();
  if (state.selectedCategoryIds?.length !== 0) stop('CAPTURE_CATEGORY_NOT_SELECTABLE');
  await act({ kind: 'categoryParent', labels: [taxonomy.label, taxonomy.displayLabel] });
  for (const child of spec.preset.category.children) {
    const node = taxonomy.children.find((n) => n.id === child.id);
    await act({ kind: 'categoryChild', labels: [node.label, node.displayLabel], checked: true });
  }
  for (const [label, checked] of [
    ['^(Smart query|Tìm kiếm thông minh)', true],
    ['^(Filter fake/abnormal products|Lọc sản phẩm ảo)', true],
    ['^(Exclude gifts|Lọc sản phẩm quà tặng)', true],
    ['^(Exclude deleted products|Lọc bỏ sản phẩm đã bị xóa)', true],
    ['^(Mall shop|Shop Chính Hãng)', true],
    ['^(Normal shop|Shop Thông thường)', true],
    ['^(Smart exclusion|Loại trừ thông minh)', false],
  ])
    await act({ kind: 'checkbox', label, checked });
  for (const label of ['^AI ', 'Customize category|Tùy chỉnh danh mục'])
    await act({ kind: 'switch', label, checked: false });
  state = await read();
  if (state.appliedState.keywords.length) stop('CAPTURE_INITIAL_STATE_UNEXPECTED');
  for (const value of spec.preset.keywords) {
    await act({ kind: 'keyword', value });
    await act({ kind: 'comma' });
    await page.wait(300);
    await act({ kind: 'keyup' });
  }
  await until(
    (s) => equalSet(s.appliedState.keywords, spec.preset.keywords) && s.keywordInput === '',
    'CAPTURE_KEYWORDS_NOT_APPLIED',
    15,
  );
  await page.evaluate(installObserver);
  const idle = async () => {
    for (let i = 0; i < 120; i++) {
      await read();
      const n = await page.evaluate(() => ({
        pending: window.__tdnV3Capture.pending,
        quiet: Date.now() - window.__tdnV3Capture.last,
        overflow: window.__tdnV3Capture.overflow,
      }));
      if (n.overflow) stop('CAPTURE_RESPONSE_LIMIT');
      if (n.pending === 0 && n.quiet >= 1000) return;
      await page.wait(500);
    }
    stop('CAPTURE_RESPONSE_TIMEOUT');
  };
  const manifests = [];
  for (const window of spec.windows) {
    progress(`Applying ${window.id}`);
    await act({ kind: 'openSelect', name: '^(Time period|Thời gian)' });
    const days = window.id === '30d' ? 30 : 365;
    await act({ kind: 'option', name: '^(Time period|Thời gian)', labels: [`${days} days`, `Trong ${days} ngày`] });
    await act({ kind: 'closePopups' });
    for (const [index, date] of [window.period.startDate, window.period.endDate].entries()) {
      await act({ kind: 'picker', index });
      let done = false;
      for (let turn = 0; turn < 25; turn++) {
        if ((await act({ kind: 'date', date })).done) {
          done = true;
          break;
        }
      }
      if (!done) stop('CAPTURE_PERIOD_NOT_SELECTABLE');
    }
    await act({ kind: 'closePopups' });
    state = await until((s) => s.submitReady, 'CAPTURE_CONTROL_NOT_SELECTABLE');
    assertV3Applied(spec, window, state);
    await idle();
    await page.evaluate(() => {
      window.__tdnV3Capture.responses = [];
      return { ok: true };
    });
    await act({ kind: 'submit' });
    await page.wait(1000);
    await idle();
    // Wait for all five endpoints, not just the first successful headline.
    for (let i = 0; i < 90; i++) {
      const paths = await page.evaluate(() =>
        window.__tdnV3Capture.responses.filter((r) => r.status === 200).map((r) => r.urlPath),
      );
      if (endpoints.every((e) => paths.includes(`/v2/market/analytics/${e}/`))) break;
      await read();
      await page.wait(1000);
    }
    await idle();
    state = await read();
    const raw = sanitizeNetworkResponses(await page.evaluate(() => window.__tdnV3Capture.responses));
    const dir = join(outputDir, window.id);
    await mkdir(dir, { mode: 0o700 });
    // Retain diagnostics before the gate, but publish a manifest only on full success.
    await writeFile(join(dir, 'raw-responses.json'), bytes(raw), { flag: 'wx', mode: 0o600 });
    const manifest = buildV3WindowManifest(spec, window, state, raw, new Date().toISOString());
    const manifestBytes = bytes(manifest);
    await writeFile(join(dir, 'manifest.json'), manifestBytes, { flag: 'wx', mode: 0o600 });
    manifests.push({ window: window.id, path: `${window.id}/manifest.json`, sha256: digest(manifestBytes) });
    progress(`Captured ${window.id}: ${state.displayedKPIs}`);
  }
  const manifest = { contractVersion: 'metric-v3-capture-v1', specDigest: digest(bytes(spec)), windows: manifests };
  await writeFile(join(outputDir, 'manifest.json'), bytes(manifest), { flag: 'wx', mode: 0o600 });
  return manifest;
}


/** UI breakage only: data, authentication, scope and category failures must stop. */
const fallbackCodes = new Set([
  'CAPTURE_UI_CHANGED', 'CAPTURE_CONTROL_NOT_SELECTABLE', 'CAPTURE_PERIOD_NOT_SELECTABLE',
  'CAPTURE_KEYWORDS_NOT_APPLIED', 'CAPTURE_BRIDGE_TIMEOUT', 'CAPTURE_SELECTOR_TIMEOUT',
]);
const errorCode = (error) => /^CAPTURE_[A-Z_]+$/.test(error?.message) ? error.message : 'CAPTURE_FAILED';

/** Builds every request from the validated preset; never replays recorded request bodies. */
export function buildV3PageRequests(spec, window) {
  if (!validateSpec(spec)) stop('CAPTURE_PRESET_INVALID');
  const p = spec.preset;
  const ids = { shopee: 1, lazada: 2, tiki: 3, tiktok: 8 };
  const base = {
    start_date: window.period.startDate.replaceAll('-', ''),
    end_date: window.period.endDate.replaceAll('-', ''),
    include_query: {
      queries: [...p.keywords], is_smart_queries: p.smartQuery,
      bee_categories: p.category.children.map((c) => c.id),
      platforms: p.platforms.map((v) => ids[v]),
      official_types: p.shopTypes.map((v) => v === 'mall' ? 1 : 0),
      brands: [], is_remove_bad_product: p.usefulFilters.fake,
      composite_compare_lst: [[{
        first_field: p.advancedFilter.firstField, second_field: p.advancedFilter.secondField,
        first_rate: p.advancedFilter.firstRate, second_rate: p.advancedFilter.secondRate,
        compare_condition: p.advancedFilter.operator,
      }]],
    },
    exclude_query: { queries: [...p.exclusions], is_smart_queries: false },
    use_ai_normalized: p.aiNormalisation,
  };
  return endpoints.map((endpoint) => ({
    urlPath: `/v2/market/analytics/${endpoint}/`,
    requestBody: {
      ...structuredClone(base),
      ...(endpoint === 'insight' ? { interval_days: window.intervalDays } : {
        is_filter_gift: p.usefulFilters.gifts, notIncludeDeletedProduct: p.usefulFilters.deleted,
        page: 0, limit: 20,
        sort_by: ['shops', 'groups'].includes(endpoint) ? 'revenue_custom_sum__desc' : 'revenue_custom__desc',
        ...(endpoint === 'search-basic' ? {} : { fields: null }),
      }),
    },
  }));
}

/** Runs in the logged-in page. No credentials or headers cross the bridge. */
export async function requestV3InPage({ urlPath, requestBody }) {
  if (location.protocol !== 'https:' || !['metric.vn', 'www.metric.vn'].includes(location.hostname))
    return { stop: 'CAPTURE_ORIGIN_CHANGED' };
  if (document.querySelector('input[type=password]') || /\/login|\/sign-in/.test(location.pathname))
    return { stop: 'CAPTURE_LOGIN_REQUIRED' };
  if (!/^\/v2\/market\/analytics\/(search-basic|insight|products|shops|groups)\/$/.test(urlPath))
    return { stop: 'CAPTURE_REQUEST_SCOPE_MISMATCH' };
  try {
    // Reuse the page's read-only header builder. Do not use its HTTP client:
    // that client's 401 handler clears credentials and reloads the page.
    const script = [...document.scripts].map((s) => s.src).find((src) => {
      const u = new URL(src, location.href);
      return u.origin === location.origin && /^\/metric_nuxt\/[^/]+\.js$/.test(u.pathname);
    });
    if (!script) return { stop: 'CAPTURE_PAGE_SESSION_UNAVAILABLE' };
    const module = await import(script);
    const builders = Object.values(module).filter((value) => typeof value === 'function' &&
      ['X-D-CR', 'PlatformId', 'VisitorId'].every((key) => value.toString().includes(key)));
    if (builders.length !== 1) return { stop: 'CAPTURE_PAGE_SESSION_UNAVAILABLE' };
    const headers = await builders[0]();
    if (!headers.Token) return { stop: 'CAPTURE_LOGIN_REQUIRED' };
    const response = await fetch(`https://apiv4.metric.vn${urlPath}`, {
      method: 'POST', credentials: 'include',
      headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(45000),
    });
    if (response.status === 401) return { stop: 'CAPTURE_LOGIN_REQUIRED' };
    if (response.status === 403) return { stop: 'CAPTURE_ACCESS_RESTRICTED' };
    const text = await response.text();
    if (text.length > 12000000) return { stop: 'CAPTURE_RESPONSE_LIMIT' };
    let body;
    try { body = JSON.parse(text); } catch { return { stop: 'CAPTURE_PROVIDER_DATA_ERROR' }; }
    if (response.status !== 200 || body?.status !== 'success') return { stop: 'CAPTURE_PROVIDER_DATA_ERROR' };
    return { urlPath, method: 'POST', status: response.status, requestBody, body };
  } catch { return { stop: 'CAPTURE_PAGE_REQUEST_FAILED' }; }
}

/** Taxonomy read independently of selectors so a missing form can use page requests. */
export function readV3RequestContext({ categoryId }) {
  if (location.protocol !== 'https:' || !['metric.vn', 'www.metric.vn'].includes(location.hostname))
    return { stop: 'CAPTURE_ORIGIN_CHANGED' };
  if (document.querySelector('input[type=password]') || /\/login|\/sign-in/.test(location.pathname) ||
      (!document.querySelector('#QuerySearchBuilder') && /đăng nhập|log in|sign in/i.test(document.body.innerText)))
    return { stop: 'CAPTURE_LOGIN_REQUIRED' };
  const stack = [document.querySelector('#__nuxt')?._vnode], seen = new Set();
  while (stack.length) {
    const v = stack.pop();
    if (!v || typeof v !== 'object') continue;
    const c = v.component;
    if (c && !seen.has(c)) {
      seen.add(c);
      if ((c.type?.name || c.type?.__name) === 'CategorySelector') {
        const n = c.props.option?.options?.find((n) => n.value === categoryId);
        if (n) return { taxonomy: {
          id: n.value, label: n.label,
          children: (n.children || []).map((n) => ({ id: n.value, label: n.label })),
        } };
      }
      stack.push(c.subTree);
    }
    if (Array.isArray(v.children)) stack.push(...v.children);
    if (v.suspense) stack.push(v.suspense.activeBranch);
  }
  return { taxonomy: null };
}

export async function captureV3PageRequests(page, spec, outputDir, fallbackReason) {
  if (!validateSpec(spec)) stop('CAPTURE_PRESET_INVALID');
  const observed = await page.evaluate(readV3RequestContext, { categoryId: spec.preset.category.id });
  if (observed.stop) stop(observed.stop);
  resolveV3Category(spec.preset, observed.taxonomy);
  const manifests = [];
  for (const window of spec.windows) {
    const raw = [];
    for (const request of buildV3PageRequests(spec, window)) {
      const result = await page.evaluate(requestV3InPage, request);
      if (result.stop) stop(result.stop);
      raw.push({ ...result, responseOrder: raw.length });
    }
    const sanitized = sanitizeNetworkResponses(raw);
    // This state describes the request applied to the provider, not DOM controls.
    // The same publication gate independently checks every retained request.
    const observation = {
      taxonomy: observed.taxonomy, appliedState: structuredClone(spec.preset),
      selectedCategoryIds: spec.preset.category.children.map((c) => c.id),
      keywordInput: '', period: window.period, categoryMode: 'Advanced', multi: true,
      comparisonDefault: true, displayedKPIs: 'Page-request capture; see raw source values.',
    };
    const manifest = buildV3WindowManifest(spec, window, observation, sanitized, new Date().toISOString(), 'page-request', fallbackReason);
    const dir = join(outputDir, window.id);
    await mkdir(dir, { mode: 0o700 });
    await writeFile(join(dir, 'raw-responses.json'), bytes(sanitized), { flag: 'wx', mode: 0o600 });
    const manifestBytes = bytes(manifest);
    await writeFile(join(dir, 'manifest.json'), manifestBytes, { flag: 'wx', mode: 0o600 });
    manifests.push({ window: window.id, path: `${window.id}/manifest.json`, sha256: digest(manifestBytes) });
  }
  const manifest = { contractVersion: 'metric-v3-capture-v1', specDigest: digest(bytes(spec)), windows: manifests };
  await writeFile(join(outputDir, 'manifest.json'), bytes(manifest), { flag: 'wx', mode: 0o600 });
  return manifest;
}

/** Runner policy: OpenCLI UI first, then one complete request capture after UI breakage. */
export async function captureV3WithFallback(page, spec, outputDir) {
  try { return await captureV3Preset(page, spec, outputDir); }
  catch (uiError) {
    const uiCode = errorCode(uiError);
    if (!fallbackCodes.has(uiCode)) throw uiError;
    const diagnostics = join(outputDir, 'ui-failed');
    await mkdir(diagnostics, { mode: 0o700 });
    for (const name of [...spec.windows.map((w) => w.id), 'manifest.json']) {
      try { await rename(join(outputDir, name), join(diagnostics, name)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await writeFile(join(diagnostics, 'stopped.json'), bytes({ code: uiCode }), { flag: 'wx', mode: 0o600 });
    try { return await captureV3PageRequests(page, spec, outputDir, uiCode); }
    catch (requestError) {
      const pageRequestCode = errorCode(requestError);
      stop(pageRequestCode === 'CAPTURE_LOGIN_REQUIRED' ? pageRequestCode : 'CAPTURE_FALLBACK_FAILED',
        { uiCode, pageRequestCode });
    }
  }
}
