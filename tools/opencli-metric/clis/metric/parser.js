// Pure parsing and guard helpers for the Metric OpenCLI adapter.
// No browser, filesystem, cookies, or network access belongs in this module.

export const METRIC_ALLOWED_HOSTS = new Set(['metric.vn', 'www.metric.vn']);
export const METRIC_FAIL_CODES = Object.freeze([
  'METRIC_LOGIN_REQUIRED',
  'METRIC_CAPTCHA',
  'METRIC_UI_CHANGED',
  'METRIC_FILTER_MISMATCH',
  'METRIC_ROW_CAP',
]);

export class MetricAdapterError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'MetricAdapterError';
    this.code = code;
  }
}

export function assertMetricUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric target is not a valid URL');
  }
  if (url.protocol !== 'https:' || !METRIC_ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'target is outside the Metric domain allowlist');
  }
  return url;
}

function clean(value) {
  return String(value ?? '').normalize('NFC').trim();
}

function setKey(values) {
  return [...new Set((values ?? []).map(clean).filter(Boolean).map(value => value.toLowerCase()))].sort().join('\u0000');
}

function platformKey(values) {
  return [...new Set((values ?? []).map(clean))].sort().join('\u0000');
}

export function normaliseSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'query spec is not an object');
  }
  const keywords = Array.isArray(spec.keywords) ? spec.keywords.map(clean).filter(Boolean) : [];
  const platforms = Array.isArray(spec.platforms) ? spec.platforms.map(clean) : [];
  const period = spec.period && typeof spec.period === 'object' ? spec.period : {};
  if (!keywords.length || !platforms.length || !platforms.every(value => value === 'shopee' || value === 'tiktok')) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'query spec has invalid keywords or platforms');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(period.startDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(clean(period.endDate))) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'query spec has invalid dates');
  }
  return {
    ...spec,
    keywords,
    platforms,
    period: { startDate: clean(period.startDate), endDate: clean(period.endDate) },
    category: spec.category == null ? null : clean(spec.category),
  };
}

export function parseMetricForm(observation) {
  if (!observation || typeof observation !== 'object' || !Array.isArray(observation.controls)) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'search form controls were not observable');
  }
  const required = ['platform', 'period', 'category', 'keywords'];
  const names = new Set(observation.controls.map(control => clean(control?.name)));
  const missing = required.filter(name => !names.has(name));
  if (missing.length) throw new MetricAdapterError('METRIC_UI_CHANGED', `search form is missing: ${missing.join(', ')}`);
  return observation.controls.map(control => ({
    name: clean(control.name),
    label: clean(control.label),
    selector: clean(control.selector),
    options: Array.isArray(control.options) ? control.options.map(clean).filter(Boolean) : [],
  }));
}

export function gateMetricPage(observation) {
  if (!observation || typeof observation !== 'object') {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric page observation is missing');
  }
  assertMetricUrl(observation.url);
  if (observation.captchaVisible === true || /captcha|verify you are human/i.test(clean(observation.bodyText))) {
    throw new MetricAdapterError('METRIC_CAPTCHA', 'captcha or human verification is visible');
  }
  if (observation.loginVisible === true || /\blogin\b|đăng nhập/i.test(clean(observation.bodyText))) {
    throw new MetricAdapterError('METRIC_LOGIN_REQUIRED', 'Metric session is not logged in');
  }
  if (observation.metricRootVisible === false) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric application root is not visible');
  }
  return observation;
}

export function parseWhoamiObservation(observation) {
  gateMetricPage(observation);
  if (!observation.accountState || typeof observation.accountState !== 'string') {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'account state is not observable');
  }
  if (observation.accountState !== 'logged_in') {
    throw new MetricAdapterError('METRIC_LOGIN_REQUIRED', 'Metric session is not logged in');
  }
  const quota = observation.quota && typeof observation.quota === 'object' ? observation.quota : {};
  return {
    status: 'READY',
    plan: clean(observation.plan) || null,
    analysisLookupsRemaining: Number.isSafeInteger(quota.analysisLookupsRemaining) ? quota.analysisLookupsRemaining : null,
    downloadRowsRemaining: Number.isSafeInteger(quota.downloadRowsRemaining) ? quota.downloadRowsRemaining : null,
  };
}

function sameScope(left, right) {
  const a = normaliseSpec(left);
  const b = normaliseSpec(right);
  return setKey(a.keywords) === setKey(b.keywords)
    && platformKey(a.platforms) === platformKey(b.platforms)
    && a.period.startDate === b.period.startDate
    && a.period.endDate === b.period.endDate
    && a.category === b.category;
}

export function parseSearchObservation(observation, spec, maxRows = 5000) {
  gateMetricPage(observation);
  const expected = normaliseSpec(spec);
  if (!observation.appliedFilters || !sameScope(observation.appliedFilters, expected)) {
    throw new MetricAdapterError('METRIC_FILTER_MISMATCH', 'Metric filters do not match the query spec');
  }
  if (!Number.isSafeInteger(observation.rowCount) || observation.rowCount < 0) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'result row count is not observable');
  }
  if (observation.rowCount > maxRows) {
    throw new MetricAdapterError('METRIC_ROW_CAP', `result row count ${observation.rowCount} exceeds cap ${maxRows}`);
  }
  if (!observation.snapshot || typeof observation.snapshot !== 'object') {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'web metrics snapshot is not observable');
  }
  return {
    appliedFilters: observation.appliedFilters,
    rowCount: observation.rowCount,
    quota: observation.quota ?? null,
    snapshot: observation.snapshot,
  };
}

