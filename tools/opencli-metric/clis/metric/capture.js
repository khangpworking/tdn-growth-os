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
  W12_topProducts: ['name', 'shop', 'platform', 'price', 'createdDate', 'minPrice', 'maxPrice', 'revenue', 'revenueChg', 'units', 'unitsChg', 'lifetimeRevenue', 'lifetimeUnits', 'category'],
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
  let text = clean(displayed).toLowerCase().replace(/\s+/g, '');
  text = text.replace(/[₫đ]/g, '').replace(/vnd$/i, '');
  const suffixMatch = /(billion|million|thousand|tỷ|ty|tr|triệu|trieu|k|nghìn|nghin|%)$/iu.exec(text);
  const suffix = suffixMatch?.[1]?.normalize('NFC').toLowerCase() || '';
  const numberText = suffix ? text.slice(0, -suffix.length) : text;
  const numberMatch = /^(-?)(\d[\d.,]*)$/.exec(numberText);
  if (!numberMatch) return null;

  const sign = numberMatch[1] === '-' ? -1 : 1;
  let numeric = numberMatch[2];
  const commaParts = numeric.split(',');
  const dotParts = numeric.split('.');
  let base;
  // A comma followed by one or two digits and a unit word is Metric's
  // displayed decimal form: 4,0 billion, 109,8 thousand, and so on.
  const unitWord = Boolean(suffix && suffix !== '%');
  if (commaParts.length === 2 && commaParts[1].length <= 2 && (unitWord || commaParts[0].length <= 3)) {
    const integerPart = commaParts[0].replaceAll('.', '');
    base = Number(`${integerPart}.${commaParts[1]}`);
  } else {
    // Dotted/comma-separated groups of three are thousands separators. Keep
    // decimal-dot input working when the dot is not a three-digit group.
    if (commaParts.length > 1) numeric = commaParts.every((part, index) => index === 0 || part.length === 3) ? numeric.replaceAll(',', '') : numeric.replace(',', '.');
    if (numeric.includes('.') && numeric.split('.').slice(1).some(part => part.length !== 3)) base = Number(numeric);
    else base = Number(numeric.replaceAll('.', ''));
  }
  if (!Number.isFinite(base)) return null;
  const multiplier = /^(?:billion|tỷ|ty)$/iu.test(suffix) ? 1_000_000_000
    : /^(?:million|tr|triệu|trieu)$/iu.test(suffix) ? 1_000_000
      : /^(?:thousand|k|nghìn|nghin)$/iu.test(suffix) ? 1_000
        : 1;
  const value = sign * base * multiplier;
  return Number.isFinite(value) ? value : null;
}

export const parseMetricDisplay = numberFromDisplay;

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
const IDENTITY_RESPONSE_PATH = /\/(?:users|profile|paid)(?:\/|$)/i;
const IDENTITY_HTML_MARKER = /account|avatar|profile|user(?:[-_: ]?(?:info|profile|menu|widget))/i;

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

function identityValuesFromHtml(html) {
  const source = String(html ?? '');
  const values = [];
  const nodePattern = /<([a-z][\w:-]*)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  for (const match of source.matchAll(nodePattern)) {
    const marker = `${match[1]} ${match[2]}`;
    if (!IDENTITY_HTML_MARKER.test(marker)) continue;
    const text = String(match[3] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length >= 3 && text.length <= 240) values.push(text);
    for (const attribute of String(match[2] || '').matchAll(/([a-z][\w:-]*)\s*=\s*(["'])(.*?)\2/gi)) {
      if (isIdentityKey(attribute[1]) && attribute[3].length >= 3 && attribute[3].length <= 240) values.push(attribute[3]);
    }
  }
  return [...new Set(values)].sort((left, right) => right.length - left.length);
}

function sanitizeText(value, identityValues = []) {
  let output = String(value)
    .replace(INLINE_TOKEN, '[REDACTED_TOKEN]')
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\b[a-f0-9]{32,}\b/gi, '[REDACTED_TOKEN]')
    .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[REDACTED_TOKEN]')
    .replace(/([?&](?:access[_-]?token|id[_-]?token|token|session|authorization)=)[^&#\s"']+/gi, '$1[REDACTED_TOKEN]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/(?:\+?84|0)\d[\d .-]{7,}\d/g, '[REDACTED_PHONE]');
  for (const identity of identityValues) {
    const escaped = String(identity).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (escaped) output = output.replace(new RegExp(escaped, 'gi'), '[REDACTED_IDENTITY]');
  }
  return output;
}

function sanitizeValue(value, key = null, identityValues = []) {
  if (key !== null && (isIdentityKey(key) || FORBIDDEN_KEY.test(String(key)))) return OMIT;
  if (typeof value === 'string') {
    if (isTokenLike(value)) return OMIT;
    return sanitizeText(value, identityValues);
  }
  if (Array.isArray(value)) return value.map(child => sanitizeValue(child, null, identityValues)).filter(child => child !== OMIT);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [childKey, child] of Object.entries(value)) {
    const sanitized = sanitizeValue(child, childKey, identityValues);
    if (sanitized !== OMIT) output[childKey] = sanitized;
  }
  return output;
}

export function sanitizeDebugObject(value) {
  const sanitized = sanitizeValue(value);
  return sanitized === OMIT ? {} : sanitized;
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
  const structuralTag = new Set(['html', 'head', 'body', 'main', 'section', 'article', 'div']).has(tag);
  return tag === 'header' || (!structuralTag && IDENTITY_HTML_MARKER.test(attributes));
}

function sanitizeHtmlTag(token, identityValues = []) {
  if (/^<!--/.test(token)) return '';
  return token
    .replace(/\s+([a-z][\w:-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (_whole, name, rawValue) => {
      const dataName = name.replace(/^data[-_:]?/i, '');
      if (isIdentityKey(name) || isIdentityKey(dataName) || /token|secret|authorization|cookie|session|credential|password/i.test(name)) return '';
      const quote = rawValue[0] === '"' || rawValue[0] === "'" ? rawValue[0] : '';
      const value = quote ? rawValue.slice(1, -1) : rawValue;
      if (isTokenLike(value)) return '';
      return ` ${name}=${quote}${sanitizeText(value, identityValues)}${quote}`;
    })
    .replace(INLINE_TOKEN, '[REDACTED_TOKEN]')
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_TOKEN]');
}

export function sanitizeResultsHtml(html, providedIdentityValues = []) {
  const source = String(html ?? '');
  const identityValues = [...new Set([...(providedIdentityValues || []), ...identityValuesFromHtml(source)])]
    .filter(value => String(value).length >= 3).sort((left, right) => String(right).length - String(left).length);
  const tokens = /<!--[\s\S]*?-->|<\/?[^>]+>/g;
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const stack = [];
  let output = '';
  let cursor = 0;
  const dropped = () => stack.some(entry => entry.drop);
  for (const match of source.matchAll(tokens)) {
    if (!dropped()) output += sanitizeText(source.slice(cursor, match.index), identityValues);
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
    if (!drop) output += sanitizeHtmlTag(token, identityValues);
    if (!selfClosing) stack.push({ tag, drop });
    cursor = match.index + token.length;
  }
  if (!dropped()) output += sanitizeText(source.slice(cursor), identityValues);
  return output;
}

export function sanitizeDomSnapshots(domSnapshots) {
  const sourceSnapshots = Array.isArray(domSnapshots) ? domSnapshots : [domSnapshots];
  const htmlValues = sourceSnapshots.flatMap(snapshot => {
    const values = [];
    if (snapshot?.html) values.push(...identityValuesFromHtml(snapshot.html));
    for (const html of Object.values(snapshot?.regionsHtml || {})) values.push(...identityValuesFromHtml(html));
    return values;
  });
  const identityValues = [...new Set(htmlValues)].sort((left, right) => String(right).length - String(left).length);
  const rewriteHtml = (value, key = null) => {
    if (key === 'html') return sanitizeResultsHtml(value, identityValues);
    if (key === 'regionsHtml' && value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([name, html]) => [name, sanitizeResultsHtml(html, identityValues)]));
    }
    if (Array.isArray(value)) return value.map(child => rewriteHtml(child));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, rewriteHtml(child, childKey)]));
    return value;
  };
  return sourceSnapshots.map(snapshot => rewriteHtml(sanitizeValue(snapshot, null, identityValues))).filter(snapshot => snapshot !== OMIT);
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

function responseOrder(entry, index) {
  return Number.isSafeInteger(entry?.responseOrder) ? entry.responseOrder : index;
}

function responseHasPath(entry, path) {
  return responsePath(entry, 0).replace(/\/$/, '') === path.replace(/\/$/, '');
}

function responseBodyForGate(entry) {
  return rawBody(entry);
}

function platformName(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized === 'tiktok shop' || normalized === 'tiktok') return 'tiktok';
  if (normalized === 'shopee') return 'shopee';
  return normalized;
}

function platformListRows(responses) {
  const entry = (Array.isArray(responses) ? responses : []).find(response => responseHasPath(response, '/market/search_basic'));
  const rows = responseBodyForGate(entry)?.data?.platforms;
  return Array.isArray(rows) ? rows : [];
}

function platformLabelFromRow(row) {
  return platformName(row?.name || row?.label || row?.platform_name || row?.platformName || row?.platform);
}

export function buildMetricPlatformMap(responses, observedLabels = []) {
  const rows = platformListRows(responses);
  const byId = {};
  const labels = Array.isArray(observedLabels) ? observedLabels.map(platformName).filter(Boolean) : [];
  rows.forEach((row, index) => {
    const id = Number(row?.platform_id);
    if (!Number.isSafeInteger(id)) return;
    const explicit = platformLabelFromRow(row);
    const observed = labels.length === rows.length ? labels[index] : '';
    const label = explicit || observed;
    if (label) byId[id] = label;
  });
  return {
    byId,
    labels,
    platformListIds: rows.map(row => Number(row?.platform_id)).filter(Number.isSafeInteger),
    platformListResponseOrder: (Array.isArray(responses) ? responses : []).findIndex(response => responseHasPath(response, '/market/search_basic')),
    source: Object.keys(byId).length ? (rows.some(row => platformLabelFromRow(row)) ? 'search_basic_named_platforms' : 'search_basic_order_with_live_form_labels') : 'unresolved',
  };
}

function platformMapById(platformMap) {
  if (platformMap?.byId && typeof platformMap.byId === 'object') return platformMap.byId;
  return platformMap && typeof platformMap === 'object' ? platformMap : DEFAULT_PLATFORM_ID_MAP;
}

function searchBasicPlatformIds(body) {
  const aggregations = Array.isArray(body?.data?.search_basic?.aggregations) ? body.data.search_basic.aggregations : [];
  return [...new Set(aggregations.flatMap(item => Object.values(item?.entity?.platforms || {})
    .map(platform => Number(platform?.platform_id)).filter(Number.isSafeInteger)))];
}

function platformSetForIds(ids, platformMap) {
  const byId = platformMapById(platformMap);
  return [...new Set(ids.map(id => byId[id] || `metric-id:${id}`))].sort();
}

function gateFailure(details) {
  const error = new Error('METRIC_SEARCH_NOT_APPLIED: Metric search-applied network gate failed');
  error.code = 'METRIC_SEARCH_NOT_APPLIED';
  error.details = details;
  throw error;
}

export function assertSearchAppliedGate({ responses = [], spec, baselineResponseOrder = -1, platformMap = null } = {}) {
  const expectedPlatforms = [...new Set((spec?.platforms || []).map(platformName).filter(Boolean))].sort();
  const ordered = (Array.isArray(responses) ? responses : [])
    .map((response, index) => ({ response, order: responseOrder(response, index), path: responsePath(response, index) }));
  const afterClick = ordered.filter(item => item.order > baselineResponseOrder);
  const searchResponses = afterClick.filter(item => item.path.replace(/\/$/, '') === '/v2/market/analytics/search-basic');
  const seenPlatformSets = searchResponses.map(item => {
    const ids = searchBasicPlatformIds(responseBodyForGate(item.response));
    return { responseOrder: item.order, platformIds: ids, platforms: platformSetForIds(ids, platformMap) };
  });
  if (!searchResponses.length) {
    return gateFailure({
      missingResponses: ['search-basic'], expectedPlatforms, baselineResponseOrder,
      platformSetsSeen: seenPlatformSets,
    });
  }
  const search = searchResponses[0];
  const ids = searchBasicPlatformIds(responseBodyForGate(search.response));
  const platforms = platformSetForIds(ids, platformMap);
  if (JSON.stringify(platforms) !== JSON.stringify(expectedPlatforms)) {
    return gateFailure({
      missingResponses: [], expectedPlatforms, baselineResponseOrder,
      searchBasicResponseOrder: search.order, searchBasicPlatformIds: ids,
      platformSetsSeen: seenPlatformSets,
    });
  }
  const products = afterClick.find(item => item.order > search.order && item.path.replace(/\/$/, '') === '/v2/market/analytics/products');
  const shops = afterClick.find(item => item.order > search.order && item.path.replace(/\/$/, '') === '/v2/market/analytics/shops');
  const missingResponses = [];
  if (!products) missingResponses.push('products');
  if (!shops) missingResponses.push('shops');
  if (missingResponses.length) {
    return gateFailure({
      missingResponses, expectedPlatforms, baselineResponseOrder,
      searchBasicResponseOrder: search.order, searchBasicPlatformIds: ids,
      platformSetsSeen: seenPlatformSets,
      productsResponseOrders: products ? [products.order] : [], shopsResponseOrders: shops ? [shops.order] : [],
    });
  }
  return {
    applied: true, baselineResponseOrder, searchBasicResponseOrder: search.order,
    searchBasicPlatformIds: ids, platformSet: platforms,
    productsResponseOrders: [products.order], shopsResponseOrders: [shops.order],
    platformSetsSeen: seenPlatformSets,
  };
}

function explicitPlatform(value) {
  const platform = platformOf(value, null);
  return platform === 'shopee' || platform === 'tiktok' ? platform : null;
}

function requestPlatform(response) {
  const candidates = [
    response?.request?.params?.platform,
    response?.request?.query?.platform,
    response?.requestParams?.platform,
    response?.params?.platform,
    response?.query?.platform,
  ];
  for (const candidate of candidates) {
    const platform = explicitPlatform(candidate);
    if (platform) return platform;
  }
  const rawUrl = clean(response?.request?.url || response?.requestUrl || response?.url);
  if (rawUrl) {
    try {
      const platform = explicitPlatform(new URL(rawUrl, 'https://metric.vn').searchParams.get('platform'));
      if (platform) return platform;
    } catch { /* malformed request URLs remain unlabelled */ }
  }
  return 'all';
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

const DEFAULT_PLATFORM_ID_MAP = Object.freeze({ 1: 'shopee', 2: 'tiktok' });

function metricPlatformId(value, platformIdMap = DEFAULT_PLATFORM_ID_MAP) {
  const id = Number(value);
  return platformIdMap?.[id] || null;
}

function platformValues(value) {
  return Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : [];
}

function malformedPlatformEntry(sourcePointer, aggregation, index, item) {
  return { sourcePointer, aggregation, index, reason: item && typeof item === 'object' ? 'unknown-platform-id' : 'entry-is-not-an-object' };
}

function metricApiPayloads(body, sourcePointer, platformIdMap, requestedPlatformCount = 0) {
  const data = body?.data;
  const searchBasic = data?.search_basic;
  const aggregations = Array.isArray(searchBasic?.aggregations) ? searchBasic.aggregations : [];
  const byAggregation = new Map(aggregations.map(item => [clean(item?.aggregation).toUpperCase(), item]));
  const payloads = [];
  const malformed = [];
  const platformRows = (raw, name, pointer) => {
    if (raw != null && !Array.isArray(raw) && typeof raw !== 'object') malformed.push({ sourcePointer: pointer, aggregation: name, reason: 'platforms-is-not-an-object' });
    // An entry with no known platform is an error; a known platform with no value stays missing, never zero.
    return platformValues(raw)
      .map((item, index) => {
        const platform = metricPlatformId(item?.platform_id, platformIdMap);
        if (!platform) malformed.push(malformedPlatformEntry(pointer, name, index, item));
        return { platform, value: item?.value ?? null };
      })
      .filter(item => item.platform);
  };
  const entityRows = name => (byAggregation.get(name)?.entities || []).flatMap((item, index) =>
    platformRows(item?.platforms, name, `${sourcePointer}/data/search_basic/aggregations/${name}/entities/${index}/platforms`).map(platform => ({
      platform: platform.platform, value: platform.value,
      key: item?.key, from: item?.from, to: item?.to, index,
    })));
  if (aggregations.length) {
    const names = ['REVENUE_TOTAL_CUSTOM', 'ORDER_TOTAL_CUSTOM', 'PRODUCT_TOTAL', 'SHOP_TOTAL'];
    const headlineValues = name => platformRows(byAggregation.get(name)?.entity?.platforms, name, `${sourcePointer}/data/search_basic/aggregations/${name}/entity/platforms`);
    const current = Object.fromEntries(names.map(name => [name, headlineValues(name)]));
    const previous = Object.fromEntries(names.map(name => [name, headlineValues(`PREVIOUS_${name}`)]));
    const platforms = new Set(Object.values(current).flat().map(row => row.platform));
    const headlineRows = [...platforms].map(platform => ({
      platform, revenue: current.REVENUE_TOTAL_CUSTOM.find(item => item.platform === platform)?.value ?? null,
      units: current.ORDER_TOTAL_CUSTOM.find(item => item.platform === platform)?.value ?? null,
      soldListings: current.PRODUCT_TOTAL.find(item => item.platform === platform)?.value ?? null,
      shops: current.SHOP_TOTAL.find(item => item.platform === platform)?.value ?? null,
      previousRevenue: previous.REVENUE_TOTAL_CUSTOM.find(item => item.platform === platform)?.value ?? null,
      previousUnits: previous.ORDER_TOTAL_CUSTOM.find(item => item.platform === platform)?.value ?? null,
      previousSoldListings: previous.PRODUCT_TOTAL.find(item => item.platform === platform)?.value ?? null,
      previousShops: previous.SHOP_TOTAL.find(item => item.platform === platform)?.value ?? null,
    }));
    if (headlineRows.length) {
      // W2 remains a valid additive contract: when the source only provides
      // platform rows, null combined KPIs make the no-summing boundary explicit.
      const first = requestedPlatformCount <= 1 && headlineRows.length === 1 ? headlineRows[0] : {};
      payloads.push({ region: 'overview', kpi: {
        revenue: first.revenue ?? null, units: first.units ?? null, soldListings: first.soldListings ?? null, shops: first.shops ?? null,
      }, headlineByPlatform: headlineRows });
      payloads.push({ region: 'platform-split', items: headlineRows.map(row => ({ platform: row.platform, revenue: row.revenue, units: row.units })) });
    }
    const breakdown = (aggregation, region, makeRow) => {
      const rows = entityRows(aggregation); if (rows.length) payloads.push({ region, rows: rows.map(makeRow) });
    };
    breakdown('REVENUE__BY__PRICE_RANGE_CUSTOM', 'price', row => ({ platform: row.platform, priceLevel: `${row.from ?? ''}-${row.to ?? ''}`, revenue: row.value }));
    breakdown('REVENUE__BY__LOCATION_CUSTOM', 'warehouse', row => ({ platform: row.platform, location: row.key, revenue: row.value }));
    breakdown('REVENUE__BY__SHOP_TYPE_CUSTOM', 'shop-type', row => ({ platform: row.platform, shopType: row.key === '1' ? 'mall' : 'normal', revenue: row.value }));
    breakdown('REVENUE__BY__CATEGORIES_CUSTOM', 'category', row => ({ platform: row.platform, category: row.key, revenue: row.value }));
  }
  if (malformed.length) {
    const error = new Error('METRIC_PLATFORM_ENTRY_MALFORMED: Metric platform entry is malformed');
    error.code = 'METRIC_PLATFORM_ENTRY_MALFORMED';
    error.details = { entries: malformed };
    throw error;
  }
  const platformFromProduct = product => metricPlatformId(product?.platform_id, platformIdMap)
    || metricPlatformId(String(product?.product_base_id || '').split('__')[0], platformIdMap) || 'unknown';
  const isProductsResponse = /\/analytics\/products\/?$/i.test(sourcePointer);
  const isShopsResponse = /\/analytics\/shops\/?$/i.test(sourcePointer);
  const isGroupsResponse = /\/analytics\/groups\/?$/i.test(sourcePointer);
  const products = isProductsResponse && Array.isArray(data?.products) ? data.products : [];
  if (products.length) payloads.push({ region: 'top-products', items: products.map(product => ({
    name: product.product_name, shop: product.shop_name, platform: platformFromProduct(product), brand: product.final_brand || product.brand,
    price: product.price, minPrice: product.price_min, maxPrice: product.price_max,
    revenue: product.revenue_custom ?? product.revenue, units: product.order_custom ?? product.order_count,
    revenueChg: product.revenue_growth, unitsChg: product.order_growth, previousRevenue: product.previous_revenue_custom, previousUnits: product.previous_order_custom,
    createdDate: product.platform_created_at, category: product.final_categories?.at?.(-1)?.name || product.categories?.at?.(-1)?.name,
  })) });
  const shops = isShopsResponse && Array.isArray(data?.shops) ? data.shops : [];
  if (shops.length) payloads.push({ region: 'top-shops', items: shops.map(shop => ({
    rankNew: shop.ranking, rankOld: shop.previous_ranking, shop: shop.shop_name, brand: shop.top_brand,
    platform: metricPlatformId(shop.platform_id, platformIdMap) || 'unknown', listings: shop.product_total,
    revenue: shop.revenue_custom_sum, units: shop.order_custom_sum, price: shop.avg_price,
    previousRevenue: shop.previous_revenue_custom_sum, previousUnits: shop.previous_order_custom_sum,
  })) });
  const groups = isGroupsResponse && Array.isArray(data?.groups) ? data.groups : [];
  if (groups.length) payloads.push({ region: 'top-brands', items: groups.flatMap(group => {
    const details = Array.isArray(group.details_by_platforms) && group.details_by_platforms.length ? group.details_by_platforms : [group];
    return details.map(detail => ({ rankNew: group.ranking, rankOld: group.previous_ranking, brand: group.brand,
      platform: metricPlatformId(detail.platform_id, platformIdMap) || 'unknown', listings: detail.product_total,
      revenue: detail.revenue_custom_sum, units: detail.order_custom_sum,
      previousRevenue: detail.previous_revenue_custom_sum ?? group.previous_revenue_custom_sum,
      previousUnits: detail.previous_order_custom_sum ?? group.previous_order_custom_sum,
    }));
  }) });
  const insights = /\/analytics\/shops-insight\/?$/i.test(sourcePointer) && Array.isArray(data?.shops) ? data.shops : [];
  const trendRows = insights.flatMap(shop => (shop.order_revenue_intervals || []).map(interval => ({
    platform: metricPlatformId(shop.platform_id, platformIdMap) || 'unknown', shop: shop.shop_name,
    startDate: interval.start_date, endDate: interval.end_date, revenue: interval.revenue_custom_sum, units: interval.order_custom_sum,
  })));
  if (trendRows.length) payloads.push({ region: 'trend', items: trendRows });
  return payloads.map((payload, index) => ({ payload, region: payload.region, platform: 'all', sourcePointer: `${sourcePointer}/derived/${payload.region}/${index}` }));
}

function payloadEntries(responses, domSnapshots, platformIdMap, requestedPlatformCount = 0) {
  const entries = [];
  for (const [index, response] of (Array.isArray(responses) ? responses : []).entries()) {
    const body = rawBody(response);
    // The selected tab is observation metadata only. It is never an
    // attribution label for a response body that does not name a platform.
    const responsePlatform = body && typeof body === 'object' && Object.hasOwn(body, 'platform')
      ? platformOf(body.platform, 'all')
      : requestPlatform(response);
    entries.push(...flattenPayload(body, `response:${responsePath(response, index)}`, responsePlatform));
    entries.push(...metricApiPayloads(body, `response:${responsePath(response, index)}`, platformIdMap, requestedPlatformCount));
  }
  const doms = Array.isArray(domSnapshots) ? domSnapshots : [domSnapshots];
  for (const [index, dom] of doms.entries()) {
    if (!dom || typeof dom !== 'object') continue;
    if (dom.snapshot && typeof dom.snapshot === 'object') entries.push(...flattenPayload({ ...dom.snapshot, region: 'normalized-snapshot' }, `dom:/window.__metricWebSnapshot`, 'all'));
    const regions = dom.regions && typeof dom.regions === 'object' ? dom.regions : {};
    for (const [region, value] of Object.entries(regions)) {
      entries.push(...flattenPayload(
        { ...(value && typeof value === 'object' ? value : { value }), region, platform: value?.platform ?? 'all' },
        `dom:${clean(value?.selector) || `region-${region}-${index}`}`,
        platformOf(value?.platform),
      ));
    }
  }
  return entries;
}

function entriesFor(entries, names) {
  const wanted = new Set(names.map(normaliseRegion));
  const matching = entries.filter(entry => wanted.has(entry.region));
  const responsePlatforms = new Map();
  const domIconRegions = new Set();
  for (const entry of matching.filter(entry => entry.sourcePointer.startsWith('response:'))) {
    if (!responsePlatforms.has(entry.region)) responsePlatforms.set(entry.region, new Set());
    responsePlatforms.get(entry.region).add(entry.platform);
  }
  for (const entry of matching.filter(entry => entry.sourcePointer.startsWith('dom:') && ['top-products', 'top-shops'].includes(entry.region))) {
    const rows = Array.isArray(entry.payload.rows) ? entry.payload.rows : Array.isArray(entry.payload.items) ? entry.payload.items : [];
    if (rows.some(row => ['shopee', 'tiktok'].includes(clean(row?.platform).toLowerCase()))) domIconRegions.add(entry.region);
  }
  return matching.filter(entry => {
    if (entry.sourcePointer.startsWith('response:')) return true;
    const coveredPlatforms = responsePlatforms.get(entry.region);
    if (domIconRegions.has(entry.region) && entry.sourcePointer.startsWith('dom:')) return true;
    return !coveredPlatforms?.has(entry.platform) && !(entry.platform === 'all' && coveredPlatforms?.has('all'));
  }).filter(entry => !(domIconRegions.has(entry.region) && entry.sourcePointer.startsWith('response:') && entry.platform === 'all'));
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

function rowPlatform(row, fallback) {
  if (row && Object.hasOwn(row, 'platform')) {
    const raw = clean(row.platform).toLowerCase();
    return platformOf(raw, raw || 'unknown');
  }
  return fallback;
}

function rowIdentity(group, row) {
  const fields = group === 'W12_topProducts' ? ['name', 'shop', 'platform']
    : group === 'W13_topShops' ? ['shop', 'platform']
      : group === 'W14_topBrands' ? ['brand', 'platform'] : null;
  if (fields) {
    const identity = fields.map(field => clean(row?.[field])).join('\u0000');
    if (identity.replaceAll('\u0000', '')) return `${group}:${identity}`;
  }
  return `${group}:${JSON.stringify(row)}`;
}

function tableGroup(entries, group, scope) {
  const columns = TABLE_COLUMNS[group];
  const selected = entriesFor(entries, entriesForRegionNames(group));
  const seen = new Set();
  const rows = selected.flatMap(entry => rowsFrom(entry).map(({ row, index }) => ({ row, entry, index })))
    .filter(({ row }) => {
      const key = rowIdentity(group, row);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
  });
  if (!selected.length || !rows.length) return { absent: true, reason: 'NOT_ON_PAGE' };
  const declaredColumns = new Set(selected.flatMap(entry => Array.isArray(entry.payload.columns) ? entry.payload.columns : columns).filter(column => columns.includes(column)));
  if (['W12_topProducts', 'W13_topShops'].includes(group) && rows.some(({ row }) => Object.hasOwn(row || {}, 'platform'))) declaredColumns.add('platform');
  return {
    columns: [...declaredColumns],
    rows: rows.map(({ row, entry, index }) => {
      const source = `${entry.sourcePointer}/${Array.isArray(entry.payload.rows) ? 'rows' : 'items'}/${index}`;
      const platform = rowPlatform(row, entry.platform);
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
    // Every emitted KPI card must have been observed. In particular, do not
    // turn a missing overview/card into a synthetic null metric.
    if (!Object.hasOwn(kpi, field)) {
      const error = new Error(`METRIC_UI_CHANGED: Metric KPI card is missing: ${field}`); error.code = 'METRIC_UI_CHANGED'; throw error;
    }
    const raw = kpi[field];
    if (raw == null) return { current: metricValue(null, { label, unit, platform: 'all', period: scope.period, sourcePointer: `${entry.sourcePointer}/kpi/${field}` }), changePct: null };
    const current = raw && typeof raw === 'object' && Object.hasOwn(raw, 'current') ? raw.current : raw;
    return {
      current: metricValue(current, { label, unit, platform: 'all', period: scope.period, sourcePointer: `${entry.sourcePointer}/kpi/${field}` }),
      changePct: raw && typeof raw === 'object' && raw.changePct != null ? metricValue(raw.changePct, { label: `${label} change`, unit: 'PERCENT', platform: 'all', period: scope.period, sourcePointer: `${entry.sourcePointer}/kpi/${field}/changePct` }) : null,
    };
  };
  return {
    revenue: metric('revenue', 'Revenue', 'VND'), units: metric('units', 'Units', 'COUNT'),
    soldListings: metric('soldListings', 'Sold listings', 'COUNT'), shops: metric('shops', 'Shops', 'COUNT'),
  };
}

function platformSplitGroup(entries, scope) {
  const selected = entriesFor(entries, ['platform-split']);
  const seen = new Set();
  const points = selected.flatMap(entry => {
    const rows = Array.isArray(entry.payload.items) ? entry.payload.items : Array.isArray(entry.payload.rows) ? entry.payload.rows : Array.isArray(entry.payload.platformSplit) ? entry.payload.platformSplit : [];
    return rows.map((row, index) => ({ row, entry, index }));
  }).filter(({ row }) => {
    const key = clean(row?.platform).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const requested = [...new Set((scope.platforms || []).map(platformOf).filter(platform => platform === 'shopee' || platform === 'tiktok'))];
  const byPlatform = new Map(points.map(point => [rowPlatform(point.row, point.entry.platform), point]));
  if (!requested.length && !points.length) return { absent: true, reason: 'NOT_ON_PAGE' };
  const platforms = requested.length ? requested : [...byPlatform.keys()];
  return platforms.map(platform => {
    const point = byPlatform.get(platform);
    if (!point) {
      const sourcePointer = `scope:platforms/${platform}`;
      return {
        platform,
        revenue: metricValue(null, { label: 'Revenue', unit: 'VND', platform, period: scope.period, sourcePointer: `${sourcePointer}/revenue` }),
        units: null,
        share: metricValue(null, { label: 'Share', unit: 'PERCENT', platform, period: scope.period, sourcePointer: `${sourcePointer}/share` }),
      };
    }
    const { row, entry, index } = point;
    return {
      platform,
      revenue: metricValue(row.revenue, { label: 'Revenue', unit: 'VND', platform, period: scope.period, sourcePointer: `${entry.sourcePointer}/items/${index}/revenue` }),
      units: row.units == null ? null : metricValue(row.units, { label: 'Units', unit: 'COUNT', platform, period: scope.period, sourcePointer: `${entry.sourcePointer}/items/${index}/units` }),
      share: metricValue(row.share, { label: 'Share', unit: 'PERCENT', platform, period: scope.period, sourcePointer: `${entry.sourcePointer}/items/${index}/share` }),
    };
  });
}

function monthlyGroup(entries, scope) {
  const selected = entriesFor(entries, ['monthly']);
  const points = selected.flatMap(entry => {
    const rows = Array.isArray(entry.payload.items) ? entry.payload.items : Array.isArray(entry.payload.points) ? entry.payload.points : [];
    return rows.map((row, index) => ({ row, entry, index }));
  });
  if (!points.length) {
    const unavailable = selected.find(entry => entry.payload.unavailable === true || entry.payload.reason)?.payload.reason;
    return { absent: true, reason: clean(unavailable) || 'DOM_CHART_DATA_UNAVAILABLE' };
  }
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
  const seen = new Set();
  return points.filter(({ row }) => {
    const type = clean(row.shopType || row.type).toLowerCase() === 'mall' ? 'mall' : 'normal';
    if (seen.has(type)) return false; seen.add(type); return true;
  }).slice(0, 2).map(({ row, entry, index }) => ({
    shopType: clean(row.shopType || row.type).toLowerCase() === 'mall' ? 'mall' : 'normal',
    share: metricValue(row.share ?? row.revenue, { label: 'Share', unit: row.share == null ? 'VND' : 'PERCENT', platform: entry.platform, period: scope.period, sourcePointer: `${entry.sourcePointer}/items/${index}/share` }),
  }));
}

function paginationFor(entries, cap) {
  const selected = entriesFor(entries, ['top-products']);
  const details = group => {
    const totals = group.map(entry => {
      const raw = entry.payload.pagination?.total ?? entry.payload.total;
      if (raw === null || raw === undefined || clean(raw) === '') return null;
      const value = Number(raw);
      return Number.isSafeInteger(value) ? value : null;
    }).filter(value => value !== null);
    const pages = group.map(entry => Number(entry.payload.pagination?.page ?? entry.payload.page ?? 1)).filter(Number.isSafeInteger);
    const pageSize = group.map(entry => Number(entry.payload.pagination?.pageSize ?? entry.payload.pageSize ?? 0)).find(value => value > 0) || null;
    const totalShown = totals.length ? Math.max(...totals) : null;
    const pagesRead = pages.length ? new Set(pages).size : 0;
    const seenRows = new Set();
    const rowsRead = group.reduce((sum, entry) => sum + rowsFrom(entry).filter(({ row }) => {
      const key = rowIdentity('W12_topProducts', row);
      if (seenRows.has(key)) return false;
      seenRows.add(key);
      return true;
    }).length, 0);
    return { cap, totalShown, pageSize, pagesRead, rowsRead, truncated: totalShown !== null && rowsRead < Math.min(totalShown, cap) };
  };
  const byPlatform = Object.fromEntries([...new Set(selected.map(entry => entry.platform))].map(platform => [platform, details(selected.filter(entry => entry.platform === platform))]));
  return { ...details(selected), byPlatform };
}

function scopeFor(scope) {
  return {
    keywords: [...scope.keywords], platforms: [...scope.platforms], period: { startDate: scope.period.startDate, endDate: scope.period.endDate }, category: scope.category ?? null,
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
    W15: { source: 'dom', region: 'Combined result view' }, W16: { names: ['detail-history'], region: 'Detail history' },
  };
  return Object.fromEntries(Object.entries(names).map(([item, descriptor]) => {
    if (descriptor.source) return [item, { source: descriptor.source, region: descriptor.region }];
    const selected = entriesFor(entries, descriptor.names);
    return [item, { source: sourceType(selected), region: descriptor.region, platforms: [...new Set(selected.map(entry => entry.platform))], pointers: selected.map(entry => entry.sourcePointer) }];
  }));
}

export function sanitizeNetworkResponses(responses) {
  return (Array.isArray(responses) ? responses : []).map((response, index) => {
    const urlPath = responsePath(response, index);
    const order = responseOrder(response, index);
    if (IDENTITY_RESPONSE_PATH.test(urlPath)) {
      return { urlPath, responseOrder: order, dropped: 'identity_response_body' };
    }
    const body = rawBody(response);
    const cleanResponse = { urlPath, responseOrder: order, status: response?.status ?? response?.responseStatus ?? null, body: sanitizeValue(body) };
    if (response?.method != null) cleanResponse.method = String(response.method);
    if (response?.timestamp != null) cleanResponse.timestamp = response.timestamp;
    if (response?.durationMs != null) cleanResponse.durationMs = response.durationMs;
    if (response?.requestBodyPreview != null || response?.requestBody != null) cleanResponse.requestBody = sanitizeValue(response.requestBodyPreview ?? response.requestBody);
    const requestLabel = requestPlatform(response);
    if (requestLabel !== 'all') cleanResponse.request = { params: { platform: requestLabel } };
    return response?.viewPlatform ? { observedInView: response.viewPlatform, ...cleanResponse } : cleanResponse;
  });
}

function chartSeriesFromResponses(responses, platformIdMap) {
  const rows = [];
  for (const [index, response] of (Array.isArray(responses) ? responses : []).entries()) {
    const body = rawBody(response); const path = responsePath(response, index); const data = body?.data || {};
    const aggs = data.search_basic?.aggregations || []; const by = new Map(aggs.map(item => [clean(item.aggregation).toUpperCase(), item]));
    const id = value => metricPlatformId(value, platformIdMap) || 'unknown';
    const entities = name => (by.get(name)?.entities || []).flatMap(item => platformValues(item?.platforms).map(p => ({ ...item, platform: id(p.platform_id), value: p.value })));
    for (const [name, series] of [['REVENUE__BY__PRICE_RANGE_CUSTOM','priceRange'],['REVENUE__BY__LOCATION_CUSTOM','province'],['REVENUE__BY__SHOP_TYPE_CUSTOM','shopType'],['REVENUE__BY__CATEGORIES_CUSTOM','category']]) {
      for (const row of entities(name)) rows.push({ series, platform: row.platform, label: row.key ?? `${row.from ?? ''}-${row.to ?? ''}`, value: row.value, source: `response:${path}` });
    }
    const headline = Object.fromEntries(['REVENUE_TOTAL_CUSTOM','ORDER_TOTAL_CUSTOM','PRODUCT_TOTAL','SHOP_TOTAL'].map(name => [name, platformValues(by.get(name)?.entity?.platforms).map(p => ({ platform: id(p.platform_id), value: p.value }))]));
    for (const platform of new Set(Object.values(headline).flat().map(x => x.platform))) {
      rows.push({ series:'headline', platform, revenue: headline.REVENUE_TOTAL_CUSTOM.find(x=>x.platform===platform)?.value ?? null, units: headline.ORDER_TOTAL_CUSTOM.find(x=>x.platform===platform)?.value ?? null, previousRevenue: platformValues(by.get('PREVIOUS_REVENUE_TOTAL_CUSTOM')?.entity?.platforms).find(x=>id(x.platform_id)===platform)?.value ?? null, previousUnits: platformValues(by.get('PREVIOUS_ORDER_TOTAL_CUSTOM')?.entity?.platforms).find(x=>id(x.platform_id)===platform)?.value ?? null, source:`response:${path}` });
    }
    if (/\/analytics\/(products|shops|groups|shops-insight)\/?$/i.test(path)) {
      const list = data.products || data.shops || data.groups || [];
      for (const item of list) {
        if (data.products) rows.push({series:'topProducts',platform:id(item.platform_id || String(item.product_base_id||'').split('__')[0]),name:item.product_name,revenue:item.revenue_custom ?? item.revenue,units:item.order_custom ?? item.order_count,source:`response:${path}`});
        else if (data.shops) rows.push({series:'topShops',platform:id(item.platform_id),name:item.shop_name,revenue:item.revenue_custom_sum,units:item.order_custom_sum,previousRevenue:item.previous_revenue_custom_sum,previousUnits:item.previous_order_custom_sum,source:`response:${path}`});
        else { const details = Array.isArray(item.details_by_platforms) && item.details_by_platforms.length ? item.details_by_platforms : [item]; for (const detail of details) rows.push({series:'topBrands',platform:id(detail.platform_id),name:item.brand,revenue:detail.revenue_custom_sum,units:detail.order_custom_sum,previousRevenue:detail.previous_revenue_custom_sum ?? item.previous_revenue_custom_sum,previousUnits:detail.previous_order_custom_sum ?? item.previous_order_custom_sum,source:`response:${path}`}); }
      }
    }
    if (/\/analytics\/shops-insight\/?$/i.test(path)) for (const shop of data.shops || []) for (const interval of shop.order_revenue_intervals || []) rows.push({series:'trend',platform:id(shop.platform_id),shop:shop.shop_name,startDate:interval.start_date,endDate:interval.end_date,revenue:interval.revenue_custom_sum,units:interval.order_custom_sum,source:`response:${path}`});
  }
  return { contractVersion:'metric-results-data-v2', series: rows, trendOffered: rows.some(row=>row.series==='trend'), trendNote: rows.some(row=>row.series==='trend') ? null : 'not offered by the source' };
}

export function extractResultsPage({ responses = [], dom = null, scope, captureId, specDigest, capturedAt, pageCap = 100, platformIdMap = null }) {
  const normalizedScope = scopeFor(scope);
  const entries = payloadEntries(sanitizeNetworkResponses(responses), sanitizeDomSnapshots(dom), platformMapById(platformIdMap), normalizedScope.platforms.length);
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
    const error = new Error('METRIC_UI_CHANGED: Metric required results regions are missing'); error.code = 'METRIC_UI_CHANGED'; throw error;
  }
  return {
    snapshot: {
      contractVersion: 'automation-metric-web-snapshot-v1', captureId, specDigest, capturedAt,
      scope: normalizedScope, groups,
    },
    sourceMap: captureSourceMap(entries, normalizedScope),
    chartSeries: chartSeriesFromResponses(responses, platformMapById(platformIdMap)),
    pagination: { W12_topProducts: paginationFor(entries, pageCap) },
    views: [...new Set(entries.map(entry => entry.platform))].map(platform => ({ platform, source: sourceType(entries.filter(entry => entry.platform === platform)) })),
  };
}

export { REGION_NAMES, TABLE_COLUMNS };
