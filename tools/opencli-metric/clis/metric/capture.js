// Pure results-page extraction for the Metric OpenCLI adapter.
// Network response bodies are preferred. DOM observations are a labelled fallback.

const REGION_NAMES = Object.freeze([
  'overview', 'platform-split', 'monthly', 'category', 'price', 'top10-brand', 'top10-shop',
  'brand-shop-type', 'shop-type', 'warehouse', 'top-products', 'top-shops', 'top-brands',
  'detail-history',
]);

const TABLE_COLUMNS = Object.freeze({
  W5_category: ['category', 'level', 'platform', 'revenue'],
  W6_priceLevel: ['priceLevel', 'platform', 'revenue'],
  W9_brandByShopType: ['brand', 'revenueNormal', 'revenueMall'],
  W11_location: ['location', 'share'],
  W12_topProducts: ['name', 'shop', 'price', 'createdDate', 'minPrice', 'maxPrice', 'revenue', 'revenueChg', 'units', 'unitsChg', 'lifetimeRevenue', 'lifetimeUnits', 'category'],
  W13_topShops: ['rankNew', 'rankOld', 'shop', 'platform', 'listings', 'revenue', 'revenueChg', 'units', 'unitsChg', 'lifetimeRevenue', 'lifetimeUnits'],
  W14_topBrands: ['rankNew', 'rankOld', 'brand', 'listings', 'revenue', 'revenueChg', 'units', 'unitsChg', 'lifetimeRevenue', 'lifetimeUnits'],
  W16_detailHistory: ['entityKind', 'entity', 'month', 'revenue', 'units'],
});

const VALUE_COLUMNS = Object.freeze(new Set([
  'revenue', 'revenueChg', 'units', 'unitsChg', 'lifetimeRevenue', 'lifetimeUnits', 'price',
  'minPrice', 'maxPrice', 'share', 'listings', 'rankNew', 'rankOld', 'revenueNormal', 'revenueMall',
]));
const PERCENT_COLUMNS = Object.freeze(new Set(['revenueChg', 'unitsChg', 'share']));
const COUNT_COLUMNS = Object.freeze(new Set(['units', 'unitsChg', 'lifetimeUnits', 'listings', 'rankNew', 'rankOld']));

const normaliseRegion = value => String(value ?? '').replaceAll('_', '-').replace(/\s+/g, '-').toLowerCase();
const clean = value => String(value ?? '').normalize('NFC').trim();

function numberFromDisplay(displayed) {
  const text = clean(displayed).toLowerCase().replaceAll(' ', '');
  const match = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(tỷ|triệu|nghìn|%)?$/.exec(text);
  if (!match) return null;
  const fraction = match[3] || '';
  const base = Number(`${match[2].replaceAll('.', '')}${fraction}`) / (10 ** fraction.length);
  const multiplier = match[4] === 'tỷ' ? 1_000_000_000 : match[4] === 'triệu' ? 1_000_000 : match[4] === 'nghìn' ? 1_000 : 1;
  const value = (match[1] === '-' ? -1 : 1) * base * multiplier;
  return Number.isFinite(value) ? value : null;
}

function pathFor(value, fallback) {
  const path = clean(value);
  return path || fallback;
}

function platformOf(value, fallback = 'all') {
  const platform = clean(value).toLowerCase();
  if (platform === 'tiktok shop' || platform === 'tiktok') return 'tiktok';
  if (platform === 'shopee') return 'shopee';
  return fallback;
}

const OMIT = Symbol('omit');
const IDENTITY_KEY = /^(?:user|username|email|phone|account|nickname|avatar|uid|userid|profile|userinfo|loggedinuser|owner|ownername|ownerid|shopowner|loggedinshop|accountshop)$/;
const FORBIDDEN_KEY = /authorization|cookie|token|secret|password|credential|session/i;
const INLINE_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT_TOKEN = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const HEX_TOKEN = /^[a-f0-9]{32,}$/i;
const BASE64_TOKEN = /^(?:[A-Za-z0-9+/]{40,}={0,2})$/;

function normalizedKey(key) {
  return String(key ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isIdentityKey(key) {
  const normalized = normalizedKey(key);
  return IDENTITY_KEY.test(normalized)
    || normalized.startsWith('user') || normalized.startsWith('account')
    || normalized.startsWith('email') || normalized.startsWith('phone')
    || normalized.startsWith('avatar') || normalized.startsWith('userprofile')
    || normalized.startsWith('loggedinaccount');
}

function isTokenLike(value) {
  const text = clean(value);
  return /^Bearer\s+/i.test(text) || JWT_TOKEN.test(text) || HEX_TOKEN.test(text) || BASE64_TOKEN.test(text);
}

function sanitizeText(value) {
  return String(value)
    .replace(INLINE_TOKEN, '[REDACTED_TOKEN]')
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[REDACTED_TOKEN]')
    .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[REDACTED_TOKEN]')
    .replace(/([?&](?:access[_-]?token|id[_-]?token|token|session|authorization)=)[^&#\s"']+/gi, '$1[REDACTED_TOKEN]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/(?:\+?84|0)\d[\d .-]{7,}\d/g, '[REDACTED_PHONE]');
}

function sanitizeValue(value, key = null) {
  if (key !== null && (isIdentityKey(key) || FORBIDDEN_KEY.test(String(key)))) return OMIT;
  if (typeof value === 'string') {
    if (isTokenLike(value)) return OMIT;
    return sanitizeText(value);
  }
  if (Array.isArray(value)) return value.map(child => sanitizeValue(child)).filter(child => child !== OMIT);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [childKey, child] of Object.entries(value)) {
    const sanitized = sanitizeValue(child, childKey);
    if (sanitized !== OMIT) output[childKey] = sanitized;
  }
  return output;
}

function htmlOpeningTag(token) {
  const match = /^<\s*\/?\s*([a-z0-9:-]+)/i.exec(token);
  return match?.[1]?.toLowerCase() || '';
}

function htmlAttributes(token) {
  return token.replace(/^<\s*[a-z0-9:-]+|\/?>$/gi, ' ');
}

function isSensitiveHtmlContainer(token, tag) {
  const attributes = htmlAttributes(token).toLowerCase();
  return tag === 'script' || tag === 'style' || tag === 'meta' || tag === 'header' || tag === 'nav'
    || /(?:account|header|navigation|user[-_ ]?info|user[-_ ]?profile|logged[-_ ]?in|logout|sign[-_ ]?out|avatar|profile|login)/i.test(attributes);
}

function sanitizeHtmlTag(token) {
  if (/^<!--/.test(token) || /^<\s*meta\b/i.test(token)) return '';
  return token
    .replace(/\s+(?:data-metric-json|data-state|data-initial-state|data-props)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+([a-z][\w:-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (_whole, name, rawValue) => {
      const dataName = name.replace(/^data[-_:]?/i, '');
      if (isIdentityKey(name) || isIdentityKey(dataName) || /token|secret|authorization|cookie|session|credential|password/i.test(name)) return '';
      const quote = rawValue[0] === '"' || rawValue[0] === "'" ? rawValue[0] : '';
      const value = quote ? rawValue.slice(1, -1) : rawValue;
      if (isTokenLike(value)) return '';
      return ` ${name}=${quote}${sanitizeText(value)}${quote}`;
    })
    .replace(INLINE_TOKEN, '[REDACTED_TOKEN]');
}

export function sanitizeResultsHtml(html) {
  const source = String(html ?? '');
  const tokens = /<!--[\s\S]*?-->|<\/?[^>]+>/g;
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const stack = [];
  let output = '';
  let cursor = 0;
  const dropped = () => stack.some(entry => entry.drop);
  for (const match of source.matchAll(tokens)) {
    if (!dropped()) output += sanitizeText(source.slice(cursor, match.index));
    const token = match[0];
    const closing = /^<\s*\//.test(token);
    const tag = htmlOpeningTag(token);
    if (/^<!--/.test(token)) { cursor = match.index + token.length; continue; }
    if (closing) {
      const entryIndex = [...stack].reverse().findIndex(entry => entry.tag === tag);
      if (entryIndex >= 0) {
        const index = stack.length - 1 - entryIndex;
        const entry = stack[index];
        stack.splice(index, 1);
        if (!entry.drop && !dropped()) output += `</${tag}>`;
      }
      cursor = match.index + token.length;
      continue;
    }
    const selfClosing = /\/\s*>$/.test(token) || voidTags.has(tag);
    const drop = dropped() || isSensitiveHtmlContainer(token, tag);
    if (!drop && !/^<\s*meta\b/i.test(token)) output += sanitizeHtmlTag(token);
    if (!selfClosing) stack.push({ tag, drop });
    cursor = match.index + token.length;
  }
  if (!dropped()) output += sanitizeText(source.slice(cursor));
  return output;
}

function sanitizeDomSnapshots(domSnapshots) {
  const sanitize = (value, key = null) => {
    if (key === 'html') return sanitizeResultsHtml(value);
    return sanitizeValue(value, key);
  };
  const snapshots = Array.isArray(domSnapshots) ? domSnapshots : [domSnapshots];
  return snapshots.map(snapshot => sanitize(snapshot)).filter(snapshot => snapshot !== OMIT);
}

function periodOf(raw, fallbackPeriod) {
  return raw && typeof raw === 'object' && clean(raw.startDate) && clean(raw.endDate)
    ? { startDate: clean(raw.startDate), endDate: clean(raw.endDate) }
    : { ...fallbackPeriod };
}

function metricValue(raw, context) {
  const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const displayed = clean(Object.hasOwn(object, 'displayed') ? object.displayed : raw);
  const rawValue = Object.hasOwn(object, 'value') ? object.value : typeof raw === 'number' ? raw : null;
  const value = typeof rawValue === 'number' && Number.isFinite(rawValue)
    ? rawValue
    : typeof rawValue === 'string' && rawValue.trim() && Number.isFinite(Number(rawValue))
      ? Number(rawValue)
      : numberFromDisplay(displayed);
  const unit = object.unit || context.unit;
  const pointer = pathFor(object.sourcePointer, context.sourcePointer);
  return {
    label: clean(object.label) || context.label,
    displayed,
    value: value === null ? null : value,
    unit,
    precision: object.precision || (typeof rawValue === 'number' || (typeof rawValue === 'string' && rawValue.trim() && Number.isFinite(Number(rawValue))) ? 'exact' : 'display_rounded'),
    platform: platformOf(object.platform, context.platform),
    period: periodOf(object.period, context.period),
    sourcePointer: pointer,
  };
}

function textValue(raw, context) {
  const object = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    label: clean(object.label) || context.label,
    text: clean(Object.hasOwn(object, 'text') ? object.text : raw),
    sourcePointer: pathFor(object.sourcePointer, context.sourcePointer),
  };
}

function isValueColumn(column) { return VALUE_COLUMNS.has(column); }

function valueUnit(column) {
  if (PERCENT_COLUMNS.has(column)) return 'PERCENT';
  if (COUNT_COLUMNS.has(column)) return column.startsWith('rank') ? 'RANK' : 'COUNT';
  return column === 'price' || column.endsWith('Price') || column.endsWith('Revenue') || column === 'revenue' || column === 'revenueNormal' || column === 'revenueMall' ? 'VND' : 'COUNT';
}

function rawBody(entry) {
  if (entry && typeof entry.body === 'object' && entry.body !== null) return entry.body;
  if (entry && typeof entry.response === 'object' && entry.response !== null) return entry.response;
  if (entry && typeof entry.data === 'object' && entry.data !== null) return entry.data;
  for (const candidate of [entry?.body, entry?.response, entry?.data, entry?.responsePreview]) {
    if (typeof candidate !== 'string') continue;
    try { return JSON.parse(candidate); } catch { /* DOM fallback remains available. */ }
  }
  return null;
}

function responsePath(entry, index) {
  const raw = clean(entry?.urlPath || entry?.path || entry?.url);
  if (!raw) return `/responses/${index}`;
  try { return new URL(raw, 'https://metric.vn').pathname; } catch { return raw.split('?')[0] || `/responses/${index}`; }
}

function flattenPayload(body, sourcePointer, platformFallback = 'all') {
  if (!body || typeof body !== 'object') return [];
  if (body.regions && typeof body.regions === 'object' && !Array.isArray(body.regions)) {
    return Object.entries(body.regions).flatMap(([region, value]) => flattenPayload(
      { ...(value && typeof value === 'object' ? value : { value }), region, platform: value?.platform ?? body.platform ?? platformFallback },
      `${sourcePointer}/regions/${region}`,
      platformFallback,
    ));
  }
  const region = normaliseRegion(body.region || body.section || body.name);
  if (!region) return [];
  return [{ payload: body, region, platform: platformOf(body.platform, platformFallback), sourcePointer }];
}

function payloadEntries(responses, domSnapshots) {
  const entries = [];
  for (const [index, response] of (Array.isArray(responses) ? responses : []).entries()) {
    const body = rawBody(response);
    const viewPlatform = platformOf(response?.viewPlatform ?? response?.platform);
    const payload = viewPlatform !== 'all' && body && typeof body === 'object'
      && (!body.platform || platformOf(body.platform) === 'all') ? { ...body, platform: viewPlatform } : body;
    entries.push(...flattenPayload(payload, `response:${responsePath(response, index)}`, viewPlatform));
  }
  const doms = Array.isArray(domSnapshots) ? domSnapshots : [domSnapshots];
  for (const [index, dom] of doms.entries()) {
    if (!dom || typeof dom !== 'object') continue;
    if (dom.snapshot && typeof dom.snapshot === 'object') entries.push(...flattenPayload({ ...dom.snapshot, region: 'normalized-snapshot' }, `dom:/window.__metricWebSnapshot`, 'all'));
    const regions = dom.regions && typeof dom.regions === 'object' ? dom.regions : {};
    for (const [region, value] of Object.entries(regions)) {
      entries.push(...flattenPayload(
        { ...(value && typeof value === 'object' ? value : { value }), region, platform: value?.platform ?? dom.platform ?? 'all' },
        `dom:${clean(value?.selector) || `region-${region}-${index}`}`,
        platformOf(value?.platform ?? dom.platform),
      ));
    }
  }
  return entries;
}

function entriesFor(entries, names) {
  const wanted = new Set(names.map(normaliseRegion));
  const matching = entries.filter(entry => wanted.has(entry.region));
  const responsePlatforms = new Map();
  for (const entry of matching.filter(entry => entry.sourcePointer.startsWith('response:'))) {
    if (!responsePlatforms.has(entry.region)) responsePlatforms.set(entry.region, new Set());
    responsePlatforms.get(entry.region).add(entry.platform);
  }
  return matching.filter(entry => {
    if (entry.sourcePointer.startsWith('response:')) return true;
    const coveredPlatforms = responsePlatforms.get(entry.region);
    return !coveredPlatforms?.has(entry.platform) && !(entry.platform === 'all' && coveredPlatforms?.has('all'));
  });
}

function preferredEntry(entries, names, platform = null) {
  const matches = entriesFor(entries, names);
  if (platform) return matches.find(entry => entry.platform === platform) || matches[0] || null;
  return matches.find(entry => entry.platform === 'all') || matches[0] || null;
}

function sourceType(entries) { return entries.some(entry => entry.sourcePointer.startsWith('response:')) ? 'response' : 'dom'; }

function makeCell(raw, column, context) {
  const sourcePointer = `${context.sourcePointer}/${column}`;
  if (isValueColumn(column)) return metricValue(raw, { ...context, label: column, unit: valueUnit(column), sourcePointer });
  return textValue(raw, { ...context, label: column, sourcePointer });
}

function rowsFrom(entry) {
  if (!entry) return [];
  const rows = Array.isArray(entry.payload.rows) ? entry.payload.rows : Array.isArray(entry.payload.items) ? entry.payload.items : [];
  return rows.map((row, index) => ({ row, index }));
}

function tableGroup(entries, group, scope) {
  const columns = TABLE_COLUMNS[group];
  const selected = entriesFor(entries, entriesForRegionNames(group));
  const rows = selected.flatMap(entry => rowsFrom(entry).map(({ row, index }) => ({ row, entry, index })));
  if (!selected.length || !rows.length) return { absent: true, reason: 'NOT_ON_PAGE' };
  return {
    columns: [...new Set(selected.flatMap(entry => Array.isArray(entry.payload.columns) ? entry.payload.columns : columns))].filter(column => columns.includes(column)),
    rows: rows.map(({ row, entry, index }) => {
      const source = `${entry.sourcePointer}/${Array.isArray(entry.payload.rows) ? 'rows' : 'items'}/${index}`;
      const platform = platformOf(row?.platform, entry.platform);
      const cells = {};
      for (const column of columns) {
        if (!Object.hasOwn(row || {}, column)) continue;
        cells[column] = makeCell(row[column], column, { scope, platform, period: scope.period, sourcePointer: source });
      }
      return { cells };
    }),
  };
}

function entriesForRegionNames(group) {
  return {
    W5_category: ['category'], W6_priceLevel: ['price'], W9_brandByShopType: ['brand-shop-type'],
    W11_location: ['warehouse', 'location'], W12_topProducts: ['top-products'], W13_topShops: ['top-shops'],
    W14_topBrands: ['top-brands'], W16_detailHistory: ['detail-history'],
  }[group] || [];
}

function absentOrValue(entry, field) {
  if (!entry || !Object.hasOwn(entry.payload, field)) return null;
  return entry.payload[field];
}

function kpiGroup(entries, scope) {
  const entry = preferredEntry(entries, ['overview']);
  const kpi = entry?.payload.kpi;
  if (!entry || !kpi || typeof kpi !== 'object') return { absent: true, reason: 'NOT_ON_PAGE' };
  const metric = (field, label, unit) => {
    const raw = kpi[field];
    if (!raw || typeof raw !== 'object') return { current: metricValue(null, { label, unit, platform: 'all', period: scope.period, sourcePointer: `${entry.sourcePointer}/kpi/${field}` }), changePct: null };
    return {
      current: metricValue(raw.current ?? raw, { label, unit, platform: 'all', period: scope.period, sourcePointer: `${entry.sourcePointer}/kpi/${field}` }),
      changePct: raw.changePct == null ? null : metricValue(raw.changePct, { label: `${label} change`, unit: 'PERCENT', platform: 'all', period: scope.period, sourcePointer: `${entry.sourcePointer}/kpi/${field}/changePct` }),
    };
  };
  return {
    revenue: metric('revenue', 'Revenue', 'VND'), units: metric('units', 'Units', 'COUNT'),
    soldListings: metric('soldListings', 'Sold listings', 'COUNT'), shops: metric('shops', 'Shops', 'COUNT'),
  };
}

function platformSplitGroup(entries, scope) {
  const selected = entriesFor(entries, ['platform-split']);
  const points = selected.flatMap(entry => {
    const rows = Array.isArray(entry.payload.items) ? entry.payload.items : Array.isArray(entry.payload.rows) ? entry.payload.rows : Array.isArray(entry.payload.platformSplit) ? entry.payload.platformSplit : [];
    return rows.map((row, index) => ({ row, entry, index }));
  });
  if (!points.length) return { absent: true, reason: 'NOT_ON_PAGE' };
  return points.map(({ row, entry, index }) => ({
    platform: platformOf(row.platform, entry.platform),
    revenue: metricValue(row.revenue, { label: 'Revenue', unit: 'VND', platform: platformOf(row.platform, entry.platform), period: scope.period, sourcePointer: `${entry.sourcePointer}/items/${index}/revenue` }),
    share: metricValue(row.share, { label: 'Share', unit: 'PERCENT', platform: platformOf(row.platform, entry.platform), period: scope.period, sourcePointer: `${entry.sourcePointer}/items/${index}/share` }),
  }));
}

function monthlyGroup(entries, scope) {
  const selected = entriesFor(entries, ['monthly']);
  const points = selected.flatMap(entry => {
    const rows = Array.isArray(entry.payload.items) ? entry.payload.items : Array.isArray(entry.payload.points) ? entry.payload.points : [];
    return rows.map((row, index) => ({ row, entry, index }));
  });
  if (!points.length) return { absent: true, reason: 'NOT_ON_PAGE' };
  return points.map(({ row, entry, index }) => ({
    platform: platformOf(row.platform, entry.platform), month: clean(row.month),
    revenue: metricValue(row.revenue, { label: 'Revenue', unit: 'VND', platform: platformOf(row.platform, entry.platform), period: scope.period, sourcePointer: `${entry.sourcePointer}/items/${index}/revenue` }),
    units: row.units == null ? null : metricValue(row.units, { label: 'Units', unit: 'COUNT', platform: platformOf(row.platform, entry.platform), period: scope.period, sourcePointer: `${entry.sourcePointer}/items/${index}/units` }),
  }));
}

function top10Group(entries, names, scope) {
  const entry = preferredEntry(entries, names);
  const raw = entry && entry.payload.top10 && Object.hasOwn(entry.payload.top10, 'top10') ? entry.payload.top10 : entry?.payload;
  if (!entry || !raw || raw.top10 == null || raw.others == null) return { absent: true, reason: 'NOT_ON_PAGE' };
  return {
    top10: metricValue(raw.top10, { label: 'Top 10', unit: 'PERCENT', platform: entry.platform, period: scope.period, sourcePointer: `${entry.sourcePointer}/top10` }),
    others: metricValue(raw.others, { label: 'Others', unit: 'PERCENT', platform: entry.platform, period: scope.period, sourcePointer: `${entry.sourcePointer}/others` }),
  };
}

function shopTypeGroup(entries, scope) {
  const selected = entriesFor(entries, ['shop-type']);
  const points = selected.flatMap(entry => {
    const rows = Array.isArray(entry.payload.items) ? entry.payload.items : Array.isArray(entry.payload.rows) ? entry.payload.rows : [];
    return rows.map((row, index) => ({ row, entry, index }));
  });
  if (!points.length) return { absent: true, reason: 'NOT_ON_PAGE' };
  return points.map(({ row, entry, index }) => ({
    shopType: clean(row.shopType || row.type).toLowerCase() === 'mall' ? 'mall' : 'normal',
    share: metricValue(row.share, { label: 'Share', unit: 'PERCENT', platform: entry.platform, period: scope.period, sourcePointer: `${entry.sourcePointer}/items/${index}/share` }),
  }));
}

function paginationFor(entries, cap) {
  const selected = entriesFor(entries, ['top-products']);
  const details = group => {
    const totals = group.map(entry => Number(entry.payload.pagination?.total ?? entry.payload.total ?? 0)).filter(Number.isSafeInteger);
    const pages = group.map(entry => Number(entry.payload.pagination?.page ?? entry.payload.page ?? 1)).filter(Number.isSafeInteger);
    const pageSize = group.map(entry => Number(entry.payload.pagination?.pageSize ?? entry.payload.pageSize ?? 0)).find(value => value > 0) || null;
    const totalShown = totals.length ? Math.max(...totals) : null;
    const pagesRead = pages.length ? new Set(pages).size : 0;
    const rowsRead = group.reduce((sum, entry) => sum + (Array.isArray(entry.payload.items) ? entry.payload.items.length : Array.isArray(entry.payload.rows) ? entry.payload.rows.length : 0), 0);
    return { cap, totalShown, pageSize, pagesRead, rowsRead, truncated: totalShown !== null && rowsRead < Math.min(totalShown, cap) };
  };
  const byPlatform = Object.fromEntries([...new Set(selected.map(entry => entry.platform))].map(platform => [platform, details(selected.filter(entry => entry.platform === platform))]));
  return { ...details(selected), byPlatform };
}

function scopeFor(scope) {
  return {
    keywords: [...scope.keywords], platforms: [...scope.platforms], period: { ...scope.period }, category: scope.category ?? null,
    ticks: Array.isArray(scope.ticks) ? [...scope.ticks] : [], advancedFilters: Array.isArray(scope.advancedFilters) ? [...scope.advancedFilters] : [],
    exclusions: Array.isArray(scope.exclusions) ? [...scope.exclusions] : [],
  };
}

function captureSourceMap(entries, scope) {
  const names = {
    W1: { source: 'dom', region: '#QuerySearchBuilder' }, W2: { names: ['overview'], region: 'Market Overview' },
    W3: { names: ['platform-split'], region: 'Platform split' }, W4: { names: ['monthly'], region: 'Monthly trend' },
    W5: { names: ['category'], region: 'Category' }, W6: { names: ['price'], region: 'Price levels' },
    W7: { names: ['top10-brand'], region: 'Top 10 brands' }, W8: { names: ['top10-shop'], region: 'Top 10 shops' },
    W9: { names: ['brand-shop-type'], region: 'Brand by shop type' }, W10: { names: ['shop-type'], region: 'Shop type' },
    W11: { names: ['warehouse', 'location'], region: 'Warehouse' }, W12: { names: ['top-products'], region: 'Top products' },
    W13: { names: ['top-shops'], region: 'Top shops' }, W14: { names: ['top-brands'], region: 'Top brands' },
    W15: { source: 'dom', region: 'Platform views' }, W16: { names: ['detail-history'], region: 'Detail history' },
  };
  return Object.fromEntries(Object.entries(names).map(([item, descriptor]) => {
    if (descriptor.source) return [item, { source: descriptor.source, region: descriptor.region }];
    const selected = entriesFor(entries, descriptor.names);
    return [item, { source: sourceType(selected), region: descriptor.region, platforms: [...new Set(selected.map(entry => entry.platform))], pointers: selected.map(entry => entry.sourcePointer) }];
  }));
}

export function sanitizeNetworkResponses(responses) {
  return (Array.isArray(responses) ? responses : []).map((response, index) => {
    const body = rawBody(response);
    const cleanResponse = { urlPath: responsePath(response, index), status: response?.status ?? null, body: sanitizeValue(body) };
    return response?.viewPlatform ? { viewPlatform: response.viewPlatform, ...cleanResponse } : cleanResponse;
  }).filter(response => response.body !== null && response.body !== OMIT);
}

export function extractResultsPage({ responses = [], dom = null, scope, captureId, specDigest, capturedAt, pageCap = 100 }) {
  const entries = payloadEntries(sanitizeNetworkResponses(responses), sanitizeDomSnapshots(dom));
  const normalizedScope = scopeFor(scope);
  const groups = {
    W2_kpi: kpiGroup(entries, normalizedScope), W3_platformSplit: platformSplitGroup(entries, normalizedScope),
    W4_monthly: monthlyGroup(entries, normalizedScope), W5_category: tableGroup(entries, 'W5_category', normalizedScope),
    W6_priceLevel: tableGroup(entries, 'W6_priceLevel', normalizedScope), W7_top10Brand: top10Group(entries, ['top10-brand'], normalizedScope),
    W8_top10Shop: top10Group(entries, ['top10-shop'], normalizedScope), W9_brandByShopType: tableGroup(entries, 'W9_brandByShopType', normalizedScope),
    W10_shopType: shopTypeGroup(entries, normalizedScope), W11_location: tableGroup(entries, 'W11_location', normalizedScope),
    W12_topProducts: tableGroup(entries, 'W12_topProducts', normalizedScope), W13_topShops: tableGroup(entries, 'W13_topShops', normalizedScope),
    W14_topBrands: tableGroup(entries, 'W14_topBrands', normalizedScope), W16_detailHistory: tableGroup(entries, 'W16_detailHistory', normalizedScope),
  };
  if (groups.W2_kpi.absent || groups.W3_platformSplit.absent) {
    const error = new Error('Metric required results regions are missing'); error.code = 'METRIC_UI_CHANGED'; throw error;
  }
  return {
    snapshot: {
      contractVersion: 'automation-metric-web-snapshot-v1', captureId, specDigest, capturedAt,
      scope: normalizedScope, groups,
    },
    sourceMap: captureSourceMap(entries, normalizedScope),
    pagination: { W12_topProducts: paginationFor(entries, pageCap) },
    views: [...new Set(entries.map(entry => entry.platform))].map(platform => ({ platform, source: sourceType(entries.filter(entry => entry.platform === platform)) })),
  };
}

export { REGION_NAMES, TABLE_COLUMNS };
