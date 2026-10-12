// Metric adapter for OpenCLI 1.8.8. Every command owns one ephemeral tab.
// Browser writes use OpenCLI actions; evaluate() is used only for read-back.
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { CliError } from '@jackwener/opencli/errors';
import {
  MetricAdapterError,
  assertMetricUrl,
  gateMetricPage,
  normaliseSpec,
  parseMetricForm,
  parseSearchObservation,
  parseWhoamiObservation,
} from './parser.js';
import { extractResultsPage, sanitizeNetworkResponses, sanitizeResultsHtml } from './capture.js';

const BASE_URL = 'https://metric.vn/analytics';
const PRODUCT_CAP = 200;
const PAGE_CAP = 10;
const DEFAULT_WAIT_SECONDS = 2;

function asCliError(error) {
  if (error instanceof CliError) return error;
  if (error instanceof MetricAdapterError) {
    const matches = error.details?.warningMatches;
    const detail = Array.isArray(matches)
      ? `; warningMatches=${JSON.stringify(matches.slice(0, 10))}`
      : error.details === undefined ? '' : `; details=${JSON.stringify(error.details)}`;
    const cliError = new CliError(error.code, `${error.message}${detail}`);
    if (error.details !== undefined) cliError.details = error.details;
    return cliError;
  }
  return new CliError('METRIC_UI_CHANGED', error instanceof Error ? error.message : String(error));
}

const diagnosticTextLimit = 80;

function diagnosticSample(value) {
  return String(value ?? '').replace(/\d/g, '#').slice(0, diagnosticTextLimit);
}

function redactDiagnosticText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?<!\w)\+?\d[\d\s().-]{5,}\d(?!\w)/g, '[redacted-phone]')
    .replace(/\d/g, '#')
    .slice(0, diagnosticTextLimit);
}

function isHeaderOrAccountDiagnostic(match) {
  const marker = `${match?.tag ?? ''} ${match?.classSample ?? ''}`;
  return /^(?:header)$/i.test(String(match?.tag ?? ''))
    || /header|account|profile|avatar|user[-_ ]?(?:info|widget|menu)?|nickname|shop[-_ ]?owner/i.test(marker);
}

function diagnosticMatchIsBenign(match) {
  const reason = String(match?.reason ?? '');
  if (['title-announcer', 'info-alert', 'success-alert', 'icon-or-badge', 'alert-like'].includes(reason)) return true;
  if (/^(?:warning|error)-class$|^(?:restriction-text|bare-warning-text|alert-role)$/.test(reason)) return false;
  const classes = String(match?.classSample ?? '');
  if (/(?:^|[-_\s])(?:info|success)(?:$|[-_\s])/i.test(classes)) return true;
  return String(match?.role ?? '').toLowerCase() !== 'alert' && !/warning|error/i.test(classes);
}

function safeWarningMatches(matches) {
  if (!Array.isArray(matches)) return [];
  return matches.filter(match => match && typeof match === 'object' && !isHeaderOrAccountDiagnostic(match)).map(match => {
    const base = {
      via: String(match.via ?? 'unknown'),
      tag: String(match.tag ?? 'unknown').toLowerCase(),
      role: match.role == null ? null : String(match.role),
      classSample: diagnosticSample(match.classSample),
      reason: String(match.reason ?? 'unspecified'),
    };
    return diagnosticMatchIsBenign(match)
      ? { ...base, text: null }
      : { ...base, text: redactDiagnosticText(match.text) };
  });
}

async function withMetricTab(page, task) {
  let target;
  let taskError;
  try {
    if (typeof page.newTab !== 'function' || typeof page.closeTab !== 'function') {
      throw new CliError('METRIC_UI_CHANGED', 'OpenCLI tab lifecycle is unavailable');
    }
    target = await page.newTab(BASE_URL);
    if (!target) throw new CliError('METRIC_UI_CHANGED', 'OpenCLI did not create a Metric tab');
    await page.selectTab(target);
    return await task(page);
  } catch (error) {
    taskError = error;
    throw asCliError(error);
  } finally {
    if (target) {
      try {
        await page.closeTab(target);
      } catch (error) {
        const closeError = asCliError(error);
        if (taskError) closeError.message = `${closeError.message}; command also failed: ${taskError instanceof Error ? taskError.message : String(taskError)}`;
        throw closeError;
      }
    }
  }
}

// This function is serialized by OpenCLI and runs in the page. It deliberately
// does not click, type, submit, navigate, or mutate any page state.
function observeMetricPage(includeResults = true) {
  const visible = element => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const textOf = element => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  const selectorFor = element => {
    const input = element?.querySelector('input[id]');
    return input?.id ? `#${CSS.escape(input.id)}` : '.ant-select';
  };
  const labels = [...document.querySelectorAll('#QuerySearchBuilder .filter-label .label')];
  const tagText = element => {
    const clone = element?.cloneNode?.(true);
    if (clone) clone.querySelectorAll('.ant-tag-close-icon').forEach(icon => icon.remove());
    return textOf(clone || element);
  };
  const labelledSelect = label => {
    const match = labels.find(element => textOf(element) === label);
    const container = match?.closest('.ant-space-item');
    return [...(container?.querySelectorAll('.ant-select') || [])].find(visible) || null;
  };
  const selectionTexts = element => {
    if (!element) return [];
    const tagChips = element === keywordSelect ? [...element.querySelectorAll('.ant-select-selection-overflow-item:not(.ant-select-selection-overflow-item-suffix) .ant-tag.ks-chip')]
      .map(tagText).filter(Boolean) : [];
    if (tagChips.length) return [...new Set(tagChips)];
    const chips = [...element.querySelectorAll('.ant-select-selection-item-content,[data-value]')];
    const values = (chips.length ? chips : [...element.querySelectorAll('.ant-select-selection-item,[aria-selected="true"]')])
      .map(item => item.getAttribute?.('title') || textOf(item)).filter(value => value && !/^select|placeholder/i.test(value));
    if (values.length) return [...new Set(values)];
    const placeholder = element.querySelector('.ant-select-selection-placeholder');
    return placeholder ? [] : [textOf(element)].filter(Boolean);
  };
  const inputValue = element => element?.querySelector('input[id]')?.value?.trim() || '';
  const platformName = value => {
    const normalized = value.normalize('NFC').trim().toLowerCase();
    if (normalized === 'shopee') return 'shopee';
    if (normalized === 'tiktok' || normalized === 'tiktok shop') return 'tiktok';
    return null;
  };
  const platformSelect = labelledSelect('Platform');
  const periodSelect = labelledSelect('Time period');
  const categorySelect = labelledSelect('Product category');
  // Serialized by OpenCLI: keep this keyword locator self-contained. Its copy
  // in readCommittedKeywords and applyMetricSpec must stay behaviorally equal.
  const locateKeywordSelect = () => {
    const root = document.querySelector('#QuerySearchBuilder');
    if (!root) return { select: null, locatedBy: 'none' };
    const keywordLabel = [...root.querySelectorAll('.filter-label .label')]
      .find(element => /^(?:keywords|từ kh(?:óa|oá))/i.test(textOf(element)));
    const labelledContainer = keywordLabel?.closest('.ant-space-item');
    const labelledSelect = [...(labelledContainer?.querySelectorAll('.ant-select') || [])].find(visible);
    if (labelledSelect) return { select: labelledSelect, locatedBy: 'label' };
    const placeholderPattern = /keywords? separated by commas|từ kh(?:óa|oá)/i;
    const placeholderSelect = [...root.querySelectorAll('.ant-select')].find(element => visible(element) && (
      placeholderPattern.test(textOf(element.querySelector('.ant-select-selection-placeholder')))
      || [...element.querySelectorAll('input')].some(input => placeholderPattern.test(input.getAttribute('placeholder') || '') || placeholderPattern.test(input.getAttribute('aria-label') || ''))
    ));
    if (placeholderSelect) return { select: placeholderSelect, locatedBy: 'placeholder' };
    const labelledControl = pattern => {
      const label = [...root.querySelectorAll('.filter-label .label')].find(element => pattern.test(textOf(element)));
      const container = label?.closest('.ant-space-item');
      return [...(container?.querySelectorAll('.ant-select') || [])].find(visible) || null;
    };
    const excluded = new Set([
      labelledControl(/^(?:platform|nền tảng)/i),
      labelledControl(/^(?:time period|thời gian)/i),
      labelledControl(/^(?:product category|danh mục)/i),
    ].filter(Boolean));
    const structuralCandidates = [...root.querySelectorAll('.ant-select-multiple')]
      .filter(element => visible(element) && !excluded.has(element));
    return structuralCandidates.length === 1
      ? { select: structuralCandidates[0], locatedBy: 'structure' }
      : { select: null, locatedBy: 'none' };
  };
  const keywordSelect = locateKeywordSelect().select;
  const selectedPlatforms = selectionTexts(platformSelect).map(platformName).filter(Boolean);
  const keywordValues = selectionTexts(keywordSelect).filter(value => !/enter keywords separated by commas/i.test(value));
  const typedKeyword = inputValue(keywordSelect);
  if (typedKeyword && !keywordValues.includes(typedKeyword)) keywordValues.push(typedKeyword);
  const selectedCategory = selectionTexts(categorySelect)[0] || '';
  const category = /^all$/i.test(selectedCategory) ? null : selectedCategory || null;
  const checkedLabel = label => {
    const element = [...document.querySelectorAll('#QuerySearchBuilder label,[role="checkbox"],[role="switch"]')]
      .find(candidate => textOf(candidate).toLowerCase() === label.toLowerCase());
    return Boolean(element?.matches(':checked,[aria-checked="true"]') || element?.querySelector(':checked,[aria-checked="true"]'));
  };
  const dateValues = [...document.querySelectorAll('#QuerySearchBuilder input')]
    .map(input => input.value?.trim() || '')
    .map(value => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
      const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
      return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
    }).filter(Boolean);
  const period = dateValues.length >= 2 ? { startDate: dateValues[0], endDate: dateValues[dateValues.length - 1] } : null;
  const appliedFilters = {
    keywords: [...new Set(keywordValues)],
    platforms: [...new Set(selectedPlatforms)],
    period,
    category,
    smartQuery: checkedLabel('Smart query'),
    aiNormalisation: checkedLabel('AI chuẩn hoá dữ liệu'),
    usefulFilters: {
      fake: checkedLabel('Filter fake/abnormal products'), gifts: checkedLabel('Exclude gifts'), deleted: checkedLabel('Exclude deleted products'),
    },
    ticks: [...document.querySelectorAll('#QuerySearchBuilder input[type="checkbox"]:checked,[role="checkbox"][aria-checked="true"],[role="switch"][aria-checked="true"]')]
      .map(element => textOf(element.closest('label') || element)).filter(Boolean),
    advancedFilters: [],
    exclusions: [],
  };
  const controls = [
    ['platform', 'Platform', platformSelect],
    ['period', 'Time period', periodSelect],
    ['category', 'Product category', categorySelect],
    ['keywords', 'Keywords', keywordSelect],
  ].map(([name, label, element]) => ({
    name,
    label,
    selector: element?.querySelector('input[id]')?.id ? `#${CSS.escape(element.querySelector('input[id]').id)}` : selectorFor(element),
    options: [],
    visible: visible(element),
    selected: selectionTexts(element),
  }));
  const visibleTextContent = [...document.querySelectorAll('#header, #QuerySearchBuilder, #main-content #analytic-tab, [data-v-50902570]')]
    .filter(visible).map(textOf).filter(Boolean).join('\n');
  const normaliseMetricTextInPage = value => String(value ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const stripMetricDiacriticsInPage = value => normaliseMetricTextInPage(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const metricWordsInPage = value => new Set(value.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const hasRestrictionInPage = value => {
    const normalised = normaliseMetricTextInPage(value);
    const stripped = stripMetricDiacriticsInPage(normalised);
    const matches = text => /(?:access\s+denied|denied\s+access|unauthorized|forbidden|blocked|limit\s+(?:reached|exceeded)|(?:reached|exceeded)\s+limit|session\s+expired|suspended)/i.test(text)
      || [['quyen', 'truy', 'cap', 'bi', 'tu', 'choi'], ['gioi', 'han'], ['het', 'luot'], ['vuot', 'qua'], ['phien', 'dang', 'nhap', 'het', 'han'], ['het', 'phien'], ['tai', 'khoan', 'bi', 'khoa'], ['tai', 'khoan', 'tam', 'khoa'], ['khong', 'co', 'quyen'], ['tam', 'thoi', 'khong', 'kha', 'dung'], ['access', 'denied'], ['denied', 'access'], ['limit', 'reached'], ['reached', 'limit'], ['limit', 'exceeded'], ['exceeded', 'limit'], ['session', 'expired']]
        .some(words => words.every(word => metricWordsInPage(text).has(word)));
    return matches(normalised) || matches(stripped);
  };
  const isBareWarningInPage = value => {
    const normalised = stripMetricDiacriticsInPage(value);
    return normalised === 'warning' || normalised === 'canh bao';
  };
  const warningScopeRoots = [...document.querySelectorAll('#main-content, main, [role="main"], [role="dialog"], .ant-modal, .ant-modal-root')]
    .filter(visible);
  const isHeaderOrAccount = element => {
    const marker = `${element?.tagName || ''} ${element?.id || ''} ${typeof element?.className === 'string' ? element.className : ''}`;
    return Boolean(element?.closest?.('header,#header,[class*="header" i],[class*="account" i],[class*="profile" i],[class*="avatar" i],[class*="user" i]'))
      || /header|account|profile|avatar|nickname|shop[-_ ]?owner|user[-_ ]?(?:info|widget|menu)?/i.test(marker);
  };
  const inWarningScope = element => warningScopeRoots.some(root => root === element || root.contains(element)) && !isHeaderOrAccount(element);
  const scopedElements = [...document.querySelectorAll('body *')].filter(element => visible(element) && inWarningScope(element));
  const classOf = element => String(element?.getAttribute?.('class') ?? (typeof element?.className === 'string' ? element.className : ''));
  const isAlertContainer = element => element?.getAttribute?.('role') === 'alert'
    || /(?:^|\s)ant-(?:alert|message-notice|message-custom-content|notification-notice)(?:-(?:warning|error))?(?:\s|$)|(?:^|\s)ant-(?:alert|message|notification(?:-notice)?)-(?:warning|error)(?:\s|$)/i.test(classOf(element));
  const isIconOrBadge = element => !isAlertContainer(element)
    && (['i', 'svg', 'img', 'path', 'use'].includes(String(element?.tagName || '').toLowerCase())
      || /(?:^|[-_\s])(?:icon|anticon|badge|dot|count)(?:$|[-_\s])/i.test(classOf(element)));
  const explicitAlertKind = element => {
    const marker = `${classOf(element)} ${element?.getAttribute?.('type') || ''} ${element?.getAttribute?.('status') || ''}`;
    if (/(?:^|[-_\s])info(?:$|[-_\s])/i.test(marker)) return 'info-alert';
    if (/(?:^|[-_\s])success(?:$|[-_\s])/i.test(marker)) return 'success-alert';
    return null;
  };
  const titleAnnouncer = element => {
    const text = normaliseMetricTextInPage(textOf(element)); const title = normaliseMetricTextInPage(document.title);
    return !text || Boolean(title && title.startsWith(text));
  };
  const redactDiagnosticTextInPage = value => String(value ?? '').normalize('NFC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?<!\w)\+?\d[\d\s().-]{5,}\d(?!\w)/g, '[redacted-phone]')
    .replace(/\d/g, '#').slice(0, 80);
  const sample = (value, max = 80) => String(value ?? '').replace(/\d/g, '#').slice(0, max);
  const describeWarning = (element, via, reason, causesFailure) => {
    const base = {
      via, tag: String(element?.tagName || 'unknown').toLowerCase(), role: element?.getAttribute?.('role') || null,
      classSample: sample(classOf(element)), reason,
    };
    return causesFailure ? { ...base, text: redactDiagnosticTextInPage(textOf(element)) } : { ...base, text: null };
  };
  const warningMatchesByElement = new Map();
  const addWarning = (element, via, reason, causesFailure) => {
    if (!warningMatchesByElement.has(element)) warningMatchesByElement.set(element, describeWarning(element, via, reason, causesFailure));
  };
  for (const element of scopedElements.filter(candidate => candidate.matches('[role="alert"],[class*="warning" i],[class*="error" i],[class*="alert" i]'))) {
    const className = classOf(element);
    if (isIconOrBadge(element) && !hasRestrictionInPage(textOf(element))) addWarning(element, 'selector', 'icon-or-badge', false);
    else if (/warning/i.test(className)) addWarning(element, 'selector', 'warning-class', true);
    else if (/error/i.test(className)) addWarning(element, 'selector', 'error-class', true);
    else if (element.getAttribute('role') === 'alert' && titleAnnouncer(element)) addWarning(element, 'selector', 'title-announcer', false);
    else if (element.getAttribute('role') === 'alert' && explicitAlertKind(element)) addWarning(element, 'selector', explicitAlertKind(element), false);
    else if (element.getAttribute('role') === 'alert') addWarning(element, 'selector', 'alert-role', true);
    else if (explicitAlertKind(element)) addWarning(element, 'selector', explicitAlertKind(element), false);
    else addWarning(element, 'selector', 'alert-like', false);
  }
  for (const element of scopedElements.filter(candidate => {
    const text = textOf(candidate);
    if (!text || (!hasRestrictionInPage(text) && !isBareWarningInPage(text))) return false;
    return ![...candidate.children].some(child => hasRestrictionInPage(textOf(child)) || isBareWarningInPage(textOf(child)));
  })) {
    if (!hasRestrictionInPage(textOf(element)) && isIconOrBadge(element)) addWarning(element, 'text', 'icon-or-badge', false);
    else addWarning(element, 'text', isBareWarningInPage(textOf(element)) ? 'bare-warning-text' : 'restriction-text', true);
  }
  const warningMatches = [...warningMatchesByElement.values()].slice(0, 20);
  const loginVisible = [...document.querySelectorAll('a,button,[role="button"]')]
    .some(element => visible(element) && /^(?:login|đăng nhập)$/i.test(textOf(element)));
  const captchaVisible = [...document.querySelectorAll('[id*="captcha" i],[class*="captcha" i],iframe[src*="captcha" i]')]
    .some(visible) || /captcha|verify you are human/i.test(visibleTextContent);
  const logoutVisible = /(?:logged\s*out|signed\s*out|session\s+expired|đã\s+đăng\s+xuất|phiên.*hết\s+hạn)/i.test(visibleTextContent);
  const scopedWarningText = scopedElements.filter(element => element.children.length === 0).map(textOf).filter(Boolean).join('\n');
  const warningVisible = [...warningMatchesByElement.entries()].some(([, match]) => ['warning-class', 'error-class', 'alert-role', 'restriction-text', 'bare-warning-text'].includes(match.reason));
  const quotaText = [...document.querySelectorAll('#QuerySearchBuilder, body *')]
    .filter(element => visible(element) && element.children.length === 0 && textOf(element).length <= 240).map(textOf);
  const number = value => {
    const match = String(value ?? '').match(/\d[\d\s,.]*/);
    if (!match) return null;
    const parsed = Number(match[0].replace(/[\s,.]/g, ''));
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  const analysisQuotaText = quotaText.find(value => /(?:analysis\s+)?(?:lookups?|queries?|points?|lượt phân tích|lượt).*(?:left|remaining|available|còn)|(?:left|remaining|available|còn).*(?:analysis\s+)?(?:lookups?|queries?|points?|lượt phân tích|lượt)/i.test(value));
  const totalText = [...document.querySelectorAll('.ant-pagination-total-text,[class*="total" i]')]
    .filter(visible).map(textOf).find(Boolean) || visibleTextContent;
  const countMatches = [...String(totalText).matchAll(/(?:of|trên|total|tổng số|found|kết quả|sản phẩm)\D{0,24}(\d[\d.,\s]*)/gi)];
  const rangeMatches = [...String(totalText).matchAll(/\d[\d.,\s]*\s*(?:-|–|to)\s*\d[\d.,\s]*\s*(?:of|trên)\s*(\d[\d.,\s]*)/gi)];
  const count = rangeMatches.at(-1)?.[1] || countMatches.at(-1)?.[1];
  const rowCount = includeResults && count ? number(count) : null;
  const pageSnapshot = window.__metricWebSnapshot || window.__METRIC_WEB_SNAPSHOT__ || null;
  const snapshot = includeResults ? (pageSnapshot && typeof pageSnapshot === 'object' ? pageSnapshot : {
    contractVersion: 'automation-metric-web-snapshot-v1', capturedAt: new Date().toISOString(),
    scope: appliedFilters, groups: {}, source: 'Metric results DOM; detailed widget map unavailable',
  }) : null;
  const loggedInMarker = visible(document.querySelector('#header .user-profile-btn-wrapper'));
  return {
    url: location.href, title: document.title, bodyText: visibleTextContent,
    metricRootVisible: visible(document.querySelector('#main-content #analytic-tab')),
    loginVisible, captchaVisible, logoutVisible, warningVisible, warningMatches, warningText: scopedWarningText,
    accountState: loggedInMarker ? 'logged_in' : loginVisible ? 'logged_out' : 'unknown',
    controls, appliedFilters, rowCount, snapshot,
    quota: { analysisLookupsRemaining: number(analysisQuotaText) },
  };
}

async function readObservation(page, { includeResults = true, diagnose = false } = {}) {
  await page.wait({ selector: '#QuerySearchBuilder', timeout: 15 }).catch(() => {});
  await page.wait({ selector: '#main-content #analytic-tab', timeout: 15 }).catch(() => {});
  const observation = await page.evaluate(observeMetricPage, includeResults);
  try {
    return gateMetricPage(observation);
  } catch (error) {
    if (error instanceof MetricAdapterError && diagnose) {
      error.details = { warningMatches: safeWarningMatches(observation.warningMatches) };
    }
    throw error;
  }
}

function readCommittedKeywords() {
  const visible = element => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const textOf = element => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  // Serialized by OpenCLI: keep this keyword locator self-contained. Its copy
  // in observeMetricPage and applyMetricSpec must stay behaviorally equal.
  const locateKeywordSelect = () => {
    const root = document.querySelector('#QuerySearchBuilder');
    if (!root) return { select: null, locatedBy: 'none' };
    const keywordLabel = [...root.querySelectorAll('.filter-label .label')]
      .find(element => /^(?:keywords|từ kh(?:óa|oá))/i.test(textOf(element)));
    const labelledContainer = keywordLabel?.closest('.ant-space-item');
    const labelledSelect = [...(labelledContainer?.querySelectorAll('.ant-select') || [])].find(visible);
    if (labelledSelect) return { select: labelledSelect, locatedBy: 'label' };
    const placeholderPattern = /keywords? separated by commas|từ kh(?:óa|oá)/i;
    const placeholderSelect = [...root.querySelectorAll('.ant-select')].find(element => visible(element) && (
      placeholderPattern.test(textOf(element.querySelector('.ant-select-selection-placeholder')))
      || [...element.querySelectorAll('input')].some(input => placeholderPattern.test(input.getAttribute('placeholder') || '') || placeholderPattern.test(input.getAttribute('aria-label') || ''))
    ));
    if (placeholderSelect) return { select: placeholderSelect, locatedBy: 'placeholder' };
    const labelledControl = pattern => {
      const label = [...root.querySelectorAll('.filter-label .label')].find(element => pattern.test(textOf(element)));
      const container = label?.closest('.ant-space-item');
      return [...(container?.querySelectorAll('.ant-select') || [])].find(visible) || null;
    };
    const excluded = new Set([
      labelledControl(/^(?:platform|nền tảng)/i),
      labelledControl(/^(?:time period|thời gian)/i),
      labelledControl(/^(?:product category|danh mục)/i),
    ].filter(Boolean));
    const structuralCandidates = [...root.querySelectorAll('.ant-select-multiple')]
      .filter(element => visible(element) && !excluded.has(element));
    return structuralCandidates.length === 1
      ? { select: structuralCandidates[0], locatedBy: 'structure' }
      : { select: null, locatedBy: 'none' };
  };
  const located = locateKeywordSelect();
  const select = located.select;
  const tagText = element => {
    const clone = element?.cloneNode?.(true);
    if (clone) clone.querySelectorAll('.ant-tag-close-icon').forEach(icon => icon.remove());
    return textOf(clone || element);
  };
  const tagChips = select ? [...select.querySelectorAll('.ant-select-selection-overflow-item:not(.ant-select-selection-overflow-item-suffix) .ant-tag.ks-chip')] : [];
  const chips = select ? [...select.querySelectorAll('.ant-select-selection-item-content,[data-value]')] : [];
  const fallbackChips = select ? [...select.querySelectorAll('.ant-select-selection-item')] : [];
  const chipElements = tagChips.length ? tagChips : (chips.length ? chips : fallbackChips);
  const values = chipElements
    .map(element => tagChips.length ? tagText(element) : (element.getAttribute('title') || element.getAttribute('data-value') || textOf(element)))
    .map(value => String(value).replace(/\s+/g, ' ').trim()).filter(Boolean);
  // Only rendered chips count as committed; uncommitted input text never does.
  return [...new Set(values)];
}

// Serialized by OpenCLI: keep this diagnostic locator self-contained and
// behaviorally equal to the keyword locator used by readCommittedKeywords.
function readKeywordCommitDiagnostics(expectedKeywords = []) {
  const visible = element => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const textOf = element => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  const tagText = element => {
    const clone = element?.cloneNode?.(true);
    if (clone) clone.querySelectorAll('.ant-tag-close-icon').forEach(icon => icon.remove());
    return textOf(clone || element);
  };
  const locateKeywordSelect = () => {
    const root = document.querySelector('#QuerySearchBuilder');
    if (!root) return { select: null, locatedBy: 'none' };
    const keywordLabel = [...root.querySelectorAll('.filter-label .label')]
      .find(element => /^(?:keywords|từ kh(?:óa|oá))/i.test(textOf(element)));
    const labelledContainer = keywordLabel?.closest('.ant-space-item');
    const labelledSelect = [...(labelledContainer?.querySelectorAll('.ant-select') || [])].find(visible);
    if (labelledSelect) return { select: labelledSelect, locatedBy: 'label' };
    const placeholderPattern = /keywords? separated by commas|từ kh(?:óa|oá)/i;
    const placeholderSelect = [...root.querySelectorAll('.ant-select')].find(element => visible(element) && (
      placeholderPattern.test(textOf(element.querySelector('.ant-select-selection-placeholder')))
      || [...element.querySelectorAll('input')].some(input => placeholderPattern.test(input.getAttribute('placeholder') || '') || placeholderPattern.test(input.getAttribute('aria-label') || ''))
    ));
    if (placeholderSelect) return { select: placeholderSelect, locatedBy: 'placeholder' };
    const labelledControl = pattern => {
      const label = [...root.querySelectorAll('.filter-label .label')].find(element => pattern.test(textOf(element)));
      const container = label?.closest('.ant-space-item');
      return [...(container?.querySelectorAll('.ant-select') || [])].find(visible) || null;
    };
    const excluded = new Set([
      labelledControl(/^(?:platform|nền tảng)/i),
      labelledControl(/^(?:time period|thời gian)/i),
      labelledControl(/^(?:product category|danh mục)/i),
    ].filter(Boolean));
    const structuralCandidates = [...root.querySelectorAll('.ant-select-multiple')]
      .filter(element => visible(element) && !excluded.has(element));
    return structuralCandidates.length === 1
      ? { select: structuralCandidates[0], locatedBy: 'structure' }
      : { select: null, locatedBy: 'none' };
  };
  const located = locateKeywordSelect();
  const select = located.select;
  const tagChips = select ? [...select.querySelectorAll('.ant-select-selection-overflow-item:not(.ant-select-selection-overflow-item-suffix) .ant-tag.ks-chip')] : [];
  const chips = select ? [...select.querySelectorAll('.ant-select-selection-item-content,[data-value]')] : [];
  const fallbackChips = select ? [...select.querySelectorAll('.ant-select-selection-item')] : [];
  const chipElements = tagChips.length ? tagChips : (chips.length ? chips : fallbackChips);
  const values = chipElements
    .map(element => tagChips.length ? tagText(element) : (element.getAttribute('title') || element.getAttribute('data-value') || textOf(element)))
    .map(value => String(value).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const input = select?.querySelector('input[id]');
  const inputValue = input?.value?.trim() || '';
  if (inputValue) values.push(inputValue);
  const expected = expectedKeywords.map(value => String(value).normalize('NFC').trim());
  const normalizedValues = [...new Set(values)].map(value => value.normalize('NFC'));
  const normalizedInput = inputValue.normalize('NFC');
  return {
    locatedBy: located.locatedBy,
    chipCount: chipElements.length,
    inputFound: Boolean(input),
    inputValueMatchesExpected: expected.length > 0 && (expected.length === 1
      ? normalizedInput === expected[0]
      : expected.every(value => normalizedInput.includes(value))),
    committedMatchesExpected: expected.every(value => normalizedValues.includes(value)),
  };
}

async function waitForKeywordCommit(page, keywords) {
  const expected = keywords.map(value => String(value).normalize('NFC').trim());
  let committedMatchesExpected = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const actual = await page.evaluate(readCommittedKeywords);
    const normalized = Array.isArray(actual) ? actual.map(value => String(value).normalize('NFC').trim()) : [];
    committedMatchesExpected = expected.every(value => normalized.includes(value));
    if (committedMatchesExpected) return;
    await page.wait({ time: 0.25 }).catch(() => {});
  }
  const diagnostic = await page.evaluate(readKeywordCommitDiagnostics, expected).catch(() => ({
    locatedBy: 'none', chipCount: 0, inputFound: false,
    inputValueMatchesExpected: false, committedMatchesExpected,
  }));
  throw new MetricAdapterError('METRIC_FILTER_MISMATCH', 'Metric keyword was not committed to the visible search control', {
    locatedBy: ['label', 'placeholder', 'structure', 'none'].includes(diagnostic?.locatedBy) ? diagnostic.locatedBy : 'none',
    chipCount: Number.isInteger(diagnostic?.chipCount) && diagnostic.chipCount >= 0 ? diagnostic.chipCount : 0,
    inputFound: diagnostic?.inputFound === true,
    inputValueMatchesExpected: diagnostic?.inputValueMatchesExpected === true,
    committedMatchesExpected: diagnostic?.committedMatchesExpected === true || committedMatchesExpected,
  });
}

async function readSpec(path) {
  try {
    return normaliseSpec(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if (error instanceof MetricAdapterError) throw error;
    throw new CliError('METRIC_UI_CHANGED', `query spec could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function writeJson(path, value) { return writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }

async function visibleOptionIndex(page, wanted, { skipSelected = false } = {}) {
  const index = await page.evaluate(({ label, skipSelected: shouldSkipSelected }) => {
    const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const target = clean(label);
    const options = [...document.querySelectorAll('[role="option"],.ant-select-item-option')];
    const optionIndex = options.findIndex(element => {
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        && clean(element.innerText || element.textContent) === target;
    });
    if (optionIndex < 0) return null;
    const element = options[optionIndex];
    return shouldSkipSelected && (element.classList.contains('ant-select-item-option-selected') || element.getAttribute('aria-selected') === 'true')
      ? -1
      : optionIndex;
  }, { label: wanted, skipSelected });
  if (!Number.isInteger(index) || index < -1) throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric option is missing: ${wanted}`);
  return index;
}

async function clickVisibleOption(page, wanted, { skipSelected = false } = {}) {
  const index = await visibleOptionIndex(page, wanted, { skipSelected });
  if (index === -1) return;
  await page.click('[role="option"],.ant-select-item-option', { nth: index });
}

async function clickVisibleText(page, labels) {
  const wanted = Array.isArray(labels) ? labels : [labels];
  const index = await page.evaluate(values => {
    const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const targets = values.map(clean);
    const candidates = [...document.querySelectorAll('button,[role="button"]')].filter(element => {
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    return candidates.findIndex(element => targets.includes(clean(element.innerText || element.textContent)));
  }, wanted);
  if (!Number.isInteger(index) || index < 0) throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric action is missing: ${wanted.join(' / ')}`);
  await page.click('button,[role="button"]', { nth: index });
}

async function setCheckbox(page, label, checked) {
  if (typeof page.setChecked !== 'function') throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric checkbox action is unavailable');
  const target = await page.evaluate(wanted => {
    const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const targetText = clean(wanted);
    const labels = [...document.querySelectorAll('#QuerySearchBuilder label,[role="checkbox"],[role="switch"]')];
    const index = labels.findIndex(element => clean(element.innerText || element.textContent || element.getAttribute('aria-label')) === targetText);
    return index < 0 ? null : { selector: '#QuerySearchBuilder label,[role="checkbox"],[role="switch"]', index };
  }, label);
  if (!target) throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric checkbox is missing: ${label}`);
  await page.setChecked(target.selector, checked, { nth: target.index });
}

// Serialized by OpenCLI: keep this keyword locator self-contained. Its copy
// in observeMetricPage and readCommittedKeywords must stay behaviorally equal.
function resolveKeywordSelector() {
  const visible = element => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const textOf = element => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  const locateKeywordSelect = () => {
    const root = document.querySelector('#QuerySearchBuilder');
    if (!root) return { select: null, locatedBy: 'none' };
    const keywordLabel = [...root.querySelectorAll('.filter-label .label')]
      .find(element => /^(?:keywords|từ kh(?:óa|oá))/i.test(textOf(element)));
    const labelledContainer = keywordLabel?.closest('.ant-space-item');
    const labelledSelect = [...(labelledContainer?.querySelectorAll('.ant-select') || [])].find(visible);
    if (labelledSelect) return { select: labelledSelect, locatedBy: 'label' };
    const placeholderPattern = /keywords? separated by commas|từ kh(?:óa|oá)/i;
    const placeholderSelect = [...root.querySelectorAll('.ant-select')].find(element => visible(element) && (
      placeholderPattern.test(textOf(element.querySelector('.ant-select-selection-placeholder')))
      || [...element.querySelectorAll('input')].some(input => placeholderPattern.test(input.getAttribute('placeholder') || '') || placeholderPattern.test(input.getAttribute('aria-label') || ''))
    ));
    if (placeholderSelect) return { select: placeholderSelect, locatedBy: 'placeholder' };
    const labelledControl = pattern => {
      const label = [...root.querySelectorAll('.filter-label .label')].find(element => pattern.test(textOf(element)));
      const container = label?.closest('.ant-space-item');
      return [...(container?.querySelectorAll('.ant-select') || [])].find(visible) || null;
    };
    const excluded = new Set([
      labelledControl(/^(?:platform|nền tảng)/i),
      labelledControl(/^(?:time period|thời gian)/i),
      labelledControl(/^(?:product category|danh mục)/i),
    ].filter(Boolean));
    const structuralCandidates = [...root.querySelectorAll('.ant-select-multiple')]
      .filter(element => visible(element) && !excluded.has(element));
    return structuralCandidates.length === 1
      ? { select: structuralCandidates[0], locatedBy: 'structure' }
      : { select: null, locatedBy: 'none' };
  };
  const select = locateKeywordSelect().select;
  const input = select?.querySelector('input[id]');
  if (!input?.id || !select?.querySelector('.ant-select-selector')) return null;
  const inputSelector = `#${CSS.escape(input.id)}`;
  return {
    inputSelector,
    selectSelector: `#QuerySearchBuilder .ant-select:has(${inputSelector}) > .ant-select-selector`,
  };
}

function resolvePlatformSelector() {
  const visible = element => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const label = [...document.querySelectorAll('#QuerySearchBuilder .filter-label .label')]
    .find(element => (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim() === 'Platform');
  const container = label?.closest('.ant-space-item');
  const select = [...(container?.querySelectorAll('.ant-select') || [])].find(visible);
  const input = select?.querySelector('input[id]');
  if (!input?.id || !select) return null;
  const inputSelector = `#${CSS.escape(input.id)}`;
  const rootSelector = `#QuerySearchBuilder .ant-select:has(${inputSelector})`;
  return {
    inputSelector,
    rootSelector,
    selectSelector: `${rootSelector} > .ant-select-selector`,
    isMultiple: select.classList.contains('ant-select-multiple') && !select.classList.contains('ant-select-single'),
  };
}

function platformRemoveIndex({ inputSelector, wanted }) {
  const input = document.querySelector(inputSelector);
  const select = input?.closest('.ant-select');
  if (!select) return null;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const wantedText = { shopee: 'Shopee', tiktok: 'Tiktok', lazada: 'Lazada', tiki: 'Tiki' }[wanted];
  if (!wantedText) return null;
  const item = [...select.querySelectorAll('.ant-select-selection-item')].find(element => {
    const content = element.querySelector('.ant-select-selection-item-content');
    return clean(content?.getAttribute('title') || content?.textContent || element.textContent) === clean(wantedText);
  });
  const remove = item?.querySelector('.ant-select-selection-item-remove');
  if (!remove) return null;
  const removes = [...select.querySelectorAll('.ant-select-selection-item-remove')];
  const index = removes.indexOf(remove);
  return index >= 0 ? index : null;
}

async function pressTrustedComma(page, selector) {
  if (typeof page.cdp !== 'function') {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric trusted comma input path is unavailable');
  }
  const focused = await page.evaluate(inputSelector => {
    const input = document.querySelector(inputSelector);
    return Boolean(input && document.activeElement === input);
  }, selector);
  if (focused !== true) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric keyword input is not focused for comma commit');
  }
  const comma = { key: ',', code: 'Comma', windowsVirtualKeyCode: 188, nativeVirtualKeyCode: 188, text: ',' };
  try {
    await page.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...comma });
    await page.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...comma });
  } catch (error) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric trusted comma input path failed');
  }
}

async function removeKeywordByCloseIcon(page, selectors, keyword) {
  const target = await page.evaluate(({ inputSelector, wanted }) => {
    const input = document.querySelector(inputSelector);
    const select = input?.closest('.ant-select');
    if (!select) return null;
    const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const chip = [...select.querySelectorAll('.ant-select-selection-overflow-item:not(.ant-select-selection-overflow-item-suffix) .ant-tag.ks-chip')]
      .find(element => {
        const clone = element.cloneNode(true);
        clone.querySelectorAll('.ant-tag-close-icon').forEach(icon => icon.remove());
        return clean(clone.textContent) === clean(wanted);
      });
    const icon = chip?.querySelector('.ant-tag-close-icon');
    if (!icon) return null;
    const icons = [...select.querySelectorAll('.ant-tag-close-icon')];
    const index = icons.indexOf(icon);
    return index >= 0 ? { index } : null;
  }, { inputSelector: selectors.inputSelector, wanted: keyword });
  if (!target) throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric keyword remove control is unavailable for ${keyword}`);
  await page.click(`${selectors.selectSelector} .ant-tag-close-icon`, { nth: target.index });
}

async function fillVerified(page, selector, text) {
  const result = await page.fillText(selector, text);
  if (result && typeof result === 'object' && result.verified === false) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric search text did not land in the form input', {
      filled: result.filled === true, verified: false,
    });
  }
}

async function applyMetricSpec(page, spec, initialObservation) {
  const current = initialObservation.appliedFilters || {};
  const currentPlatforms = new Set(current.platforms || []); const wantedPlatforms = new Set(spec.platforms);
  if (typeof page.click !== 'function' || typeof page.fillText !== 'function' || typeof page.pressKey !== 'function') {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric form actions are unavailable');
  }
  const currentKeywords = new Set(current.keywords || []);
  const needsKeywordCommit = spec.keywords.some(keyword => !currentKeywords.has(keyword));
  if (needsKeywordCommit && typeof page.cdp !== 'function') {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric trusted comma input path is unavailable');
  }
  let platformSelector = null;
  if (wantedPlatforms.size > 1) {
    const platformMode = await page.evaluate(() => {
      const button = [...document.querySelectorAll('#QuerySearchBuilder button.switch-button')]
        .find(element => /multiple platforms|single platform/i.test(element.innerText || element.textContent || ''));
      return button ? (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim() : null;
    });
    if (platformMode && /multiple platforms/i.test(platformMode)) {
      await page.click('#QuerySearchBuilder button.switch-button');
      await gateCurrentMetricPage(page);
    }
    platformSelector = await page.evaluate(resolvePlatformSelector);
    if (platformSelector == null) throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric platform search input is not visible');
    if (platformSelector.isMultiple !== true) {
      throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric platform control did not switch to multiple mode');
    }
  }
  // Fail closed before any platform typing or option click when the keyword
  // control cannot be located. It is resolved again after the platform step.
  if (await page.evaluate(resolveKeywordSelector) == null) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric keyword search input is not visible');
  }
  platformSelector ||= await page.evaluate(resolvePlatformSelector);
  if (platformSelector == null) throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric platform search input is not visible');
  if (wantedPlatforms.size > 1 && platformSelector.isMultiple !== true) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric platform control did not switch to multiple mode');
  }
  if (wantedPlatforms.size > 1) {
    for (const platform of [...wantedPlatforms].filter(value => !currentPlatforms.has(value))) {
      await page.click(platformSelector.selectSelector);
      await clickVisibleOption(page, platform === 'tiktok' ? 'Tiktok' : 'Shopee', { skipSelected: true });
    }
    for (const platform of [...currentPlatforms].filter(value => !wantedPlatforms.has(value))) {
      const removeIndex = await page.evaluate(platformRemoveIndex, { inputSelector: platformSelector.inputSelector, wanted: platform });
      if (!Number.isInteger(removeIndex) || removeIndex < 0) {
        throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric platform remove control is unavailable for ${platform}`);
      }
      await page.click(`${platformSelector.rootSelector} .ant-select-selection-item-remove`, { nth: removeIndex });
    }
  } else {
    await page.click(platformSelector.inputSelector);
    for (const platform of [...currentPlatforms].filter(value => !wantedPlatforms.has(value))) await clickVisibleOption(page, platform === 'tiktok' ? 'Tiktok' : 'Shopee');
    for (const platform of [...wantedPlatforms].filter(value => !currentPlatforms.has(value))) await clickVisibleOption(page, platform === 'tiktok' ? 'Tiktok' : 'Shopee');
  }
  // Close either platform dropdown, including the re-rendered multi-platform
  // control, before the keyword input is focused.
  await page.pressKey('Escape').catch(() => {});
  // Re-resolve after the platform step: the multi-platform switch can
  // re-render the form and change the generated input ids.
  const keywordSelector = await page.evaluate(resolveKeywordSelector);
  if (keywordSelector == null) throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric keyword search input is not visible');
  for (const keyword of [...currentKeywords].filter(value => !spec.keywords.includes(value))) {
    await removeKeywordByCloseIcon(page, keywordSelector, keyword);
  }
  for (const keyword of spec.keywords.filter(value => !currentKeywords.has(value))) {
    await page.click(keywordSelector.selectSelector);
    await fillVerified(page, keywordSelector.inputSelector, keyword);
    await pressTrustedComma(page, keywordSelector.inputSelector);
  }
  if (spec.category !== undefined && spec.category !== current.category) {
    const categorySelector = await page.evaluate(() => {
      const visible = element => {
        if (!element) return false;
        const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const textOf = element => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
      const label = [...document.querySelectorAll('#QuerySearchBuilder .filter-label .label')]
        .find(element => /^(?:product category|danh mục)/i.test(textOf(element)));
      const container = label?.closest('.ant-space-item');
      const select = [...(container?.querySelectorAll('.ant-select') || [])].find(visible);
      const input = select?.querySelector('input[id]');
      return input?.id ? `#${CSS.escape(input.id)}` : null;
    });
    if (categorySelector == null) throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric category select is not visible');
    await page.click(categorySelector); await clickVisibleOption(page, spec.category === null ? 'All' : spec.category);
  }
  const periodAlreadyApplied = current.period?.startDate === spec.period.startDate && current.period?.endDate === spec.period.endDate;
  if (spec.period.preset && !periodAlreadyApplied) {
    const periodSelector = await page.evaluate(() => {
      const visible = element => {
        if (!element) return false;
        const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const textOf = element => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
      const label = [...document.querySelectorAll('#QuerySearchBuilder .filter-label .label')]
        .find(element => /^(?:time period|thời gian)/i.test(textOf(element)));
      const container = label?.closest('.ant-space-item');
      const select = [...(container?.querySelectorAll('.ant-select') || [])].find(visible);
      const input = select?.querySelector('input[id]');
      return input?.id ? `#${CSS.escape(input.id)}` : null;
    });
    if (periodSelector == null) throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric period select is not visible');
    await page.click(periodSelector); await clickVisibleOption(page, spec.period.preset);
  }
  if (spec.smartQuery !== undefined) await setCheckbox(page, 'Smart query', Boolean(spec.smartQuery));
  if (spec.aiNormalisation !== undefined) await setCheckbox(page, 'AI chuẩn hoá dữ liệu', Boolean(spec.aiNormalisation));
  for (const [label, value] of Object.entries(spec.usefulFilters || {})) {
    const names = { fake: 'Filter fake/abnormal products', gifts: 'Exclude gifts', deleted: 'Exclude deleted products' };
    if (names[label]) await setCheckbox(page, names[label], Boolean(value));
  }
}

async function performSearch(page, spec) {
  const before = await readObservation(page, { includeResults: false });
  parseMetricForm(before); await applyMetricSpec(page, spec, before);
  await waitForKeywordCommit(page, spec.keywords);
  // Re-read the form before submit: a lookup is spent only when the visible
  // platform selection matches the request.
  const ready = await readObservation(page, { includeResults: false });
  const appliedPlatforms = new Set(ready?.appliedFilters?.platforms || []);
  const wantedPlatforms = [...new Set(spec.platforms)];
  if (appliedPlatforms.size !== wantedPlatforms.length || !wantedPlatforms.every(platform => appliedPlatforms.has(platform))) {
    throw new MetricAdapterError('METRIC_FILTER_MISMATCH', 'Metric platform selection does not match the request', {
      platformsMatchExpected: false, platformCount: appliedPlatforms.size,
    });
  }
  await clickVisibleText(page, ['Phân tích', 'Analyze', 'Analytics']); await page.wait({ time: DEFAULT_WAIT_SECONDS }).catch(() => {});
  return readObservation(page, { includeResults: true });
}

async function runSearch(page, spec, maxRows) {
  const observation = await performSearch(page, spec);
  return { observation, parsed: parseSearchObservation(observation, spec, maxRows) };
}

function hashBytes(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function fileEntry(role, path, mediaType) {
  const bytes = await readFile(path); const details = await stat(path);
  return { role, path: path.split('/').at(-1), mediaType, byteSize: details.size, sha256: hashBytes(bytes) };
}

function observeResultPage() {
  const visible = element => {
    if (!element) return false;
    const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const textOf = element => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  const parseJson = value => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
  const selectors = {
    overview: '[data-metric-region="overview"], [data-region="overview"], [data-testid="market-overview"], .market-overview',
    'platform-split': '[data-metric-region="platform-split"], [data-region="platform-split"], [data-testid="platform-split"]',
    monthly: '[data-metric-region="monthly"], [data-region="monthly"], [data-testid="monthly-trend"]',
    category: '[data-metric-region="category"], [data-region="category"], [data-testid="category-chart"]',
    price: '[data-metric-region="price"], [data-region="price"], [data-testid="price-chart"]',
    'top10-brand': '[data-metric-region="top10-brand"], [data-region="top10-brand"], [data-testid="top10-brand"]',
    'top10-shop': '[data-metric-region="top10-shop"], [data-region="top10-shop"], [data-testid="top10-shop"]',
    'brand-shop-type': '[data-metric-region="brand-shop-type"], [data-region="brand-shop-type"], [data-testid="brand-shop-type"]',
    'shop-type': '[data-metric-region="shop-type"], [data-region="shop-type"], [data-testid="shop-type"]',
    warehouse: '[data-metric-region="warehouse"], [data-region="warehouse"], [data-testid="warehouse"]',
    'top-products': '[data-metric-region="top-products"], [data-region="top-products"], [data-testid="top-products"]',
    'top-shops': '[data-metric-region="top-shops"], [data-region="top-shops"], [data-testid="top-shops"]',
    'top-brands': '[data-metric-region="top-brands"], [data-region="top-brands"], [data-testid="top-brands"]',
    'detail-history': '[data-metric-region="detail-history"], [data-region="detail-history"], [data-testid="detail-history"]',
  };
  const tableData = element => {
    const table = element?.querySelector('table');
    if (!table) return null;
    const headers = [...table.querySelectorAll('thead th')].map(textOf).filter(Boolean);
    const rows = [...table.querySelectorAll('tbody tr')].map(row => {
      const cells = [...row.querySelectorAll('td')].map(textOf);
      return Object.fromEntries(cells.map((value, index) => [headers[index] || `column${index + 1}`, value]));
    });
    return { columns: headers, rows };
  };
  const regions = {};
  const screenshotRegions = {};
  const regionsHtml = {};
  for (const [name, selector] of Object.entries(selectors)) {
    const element = [...document.querySelectorAll(selector)].find(visible);
    if (!element) continue;
    const json = parseJson(element.getAttribute('data-metric-json'));
    const table = tableData(element);
    regions[name] = { ...(json && typeof json === 'object' ? json : table || { text: textOf(element) }), selector };
    screenshotRegions[name] = selector;
    regionsHtml[name] = element.outerHTML;
  }
  const paginationElement = [...document.querySelectorAll('.ant-pagination,[data-metric-pagination]')].find(visible);
  const totalText = paginationElement ? textOf(paginationElement) : '';
  const totalMatch = totalText.match(/(?:of|trên|total)\s+(\d[\d.,\s]*)/i);
  const current = Number(paginationElement?.querySelector('.ant-pagination-item-active')?.textContent || 1);
  const next = paginationElement?.querySelector('button.ant-pagination-next,[aria-label="Next Page"]');
  if (paginationElement) regions['top-products'] = {
    ...(regions['top-products'] || {}), pagination: { page: current, total: totalMatch ? Number(totalMatch[1].replace(/[.,\s]/g, '')) : null, pageSize: regions['top-products']?.items?.length || regions['top-products']?.rows?.length || null, nextAvailable: Boolean(next && !next.disabled), nextSelector: 'button.ant-pagination-next,[aria-label="Next Page"]' },
  };
  const platformViews = [...document.querySelectorAll('[data-metric-platform-view],[data-platform-view],[role="tab"]')]
    .filter(visible).map((element, index) => ({ label: textOf(element), selected: element.getAttribute('aria-selected') === 'true' || element.classList.contains('active'), selector: '[data-metric-platform-view],[data-platform-view],[role="tab"]', index }));
  const normaliseMetricTextInPage = value => String(value ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  const stripMetricDiacriticsInPage = value => normaliseMetricTextInPage(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const metricWordsInPage = value => new Set(value.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const hasRestrictionInPage = value => {
    const normalised = normaliseMetricTextInPage(value);
    const stripped = stripMetricDiacriticsInPage(normalised);
    const matches = text => /(?:access\s+denied|denied\s+access|unauthorized|forbidden|blocked|limit\s+(?:reached|exceeded)|(?:reached|exceeded)\s+limit|session\s+expired|suspended)/i.test(text)
      || [['quyen', 'truy', 'cap', 'bi', 'tu', 'choi'], ['gioi', 'han'], ['het', 'luot'], ['vuot', 'qua'], ['phien', 'dang', 'nhap', 'het', 'han'], ['het', 'phien'], ['tai', 'khoan', 'bi', 'khoa'], ['tai', 'khoan', 'tam', 'khoa'], ['khong', 'co', 'quyen'], ['tam', 'thoi', 'khong', 'kha', 'dung'], ['access', 'denied'], ['denied', 'access'], ['limit', 'reached'], ['reached', 'limit'], ['limit', 'exceeded'], ['exceeded', 'limit'], ['session', 'expired']]
        .some(words => words.every(word => metricWordsInPage(text).has(word)));
    return matches(normalised) || matches(stripped);
  };
  const isBareWarningInPage = value => {
    const normalised = stripMetricDiacriticsInPage(value);
    return normalised === 'warning' || normalised === 'canh bao';
  };
  const warningScopeRoots = [...document.querySelectorAll('#main-content, main, [role="main"], [role="dialog"], .ant-modal, .ant-modal-root')]
    .filter(visible);
  const isHeaderOrAccount = element => {
    const marker = `${element?.tagName || ''} ${element?.id || ''} ${typeof element?.className === 'string' ? element.className : ''}`;
    return Boolean(element?.closest?.('header,#header,[class*="header" i],[class*="account" i],[class*="profile" i],[class*="avatar" i],[class*="user" i]'))
      || /header|account|profile|avatar|nickname|shop[-_ ]?owner|user[-_ ]?(?:info|widget|menu)?/i.test(marker);
  };
  const inWarningScope = element => warningScopeRoots.some(root => root === element || root.contains(element)) && !isHeaderOrAccount(element);
  const scopedElements = [...document.querySelectorAll('body *')].filter(element => visible(element) && inWarningScope(element));
  const classOf = element => String(element?.getAttribute?.('class') ?? (typeof element?.className === 'string' ? element.className : ''));
  const isAlertContainer = element => element?.getAttribute?.('role') === 'alert'
    || /(?:^|\s)ant-(?:alert|message-notice|message-custom-content|notification-notice)(?:-(?:warning|error))?(?:\s|$)|(?:^|\s)ant-(?:alert|message|notification(?:-notice)?)-(?:warning|error)(?:\s|$)/i.test(classOf(element));
  const isIconOrBadge = element => !isAlertContainer(element)
    && (['i', 'svg', 'img', 'path', 'use'].includes(String(element?.tagName || '').toLowerCase())
      || /(?:^|[-_\s])(?:icon|anticon|badge|dot|count)(?:$|[-_\s])/i.test(classOf(element)));
  const explicitAlertKind = element => {
    const marker = `${classOf(element)} ${element?.getAttribute?.('type') || ''} ${element?.getAttribute?.('status') || ''}`;
    if (/(?:^|[-_\s])info(?:$|[-_\s])/i.test(marker)) return 'info-alert';
    if (/(?:^|[-_\s])success(?:$|[-_\s])/i.test(marker)) return 'success-alert';
    return null;
  };
  const titleAnnouncer = element => {
    const text = normaliseMetricTextInPage(textOf(element)); const title = normaliseMetricTextInPage(document.title);
    return !text || Boolean(title && title.startsWith(text));
  };
  const redactDiagnosticTextInPage = value => String(value ?? '').normalize('NFC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?<!\w)\+?\d[\d\s().-]{5,}\d(?!\w)/g, '[redacted-phone]')
    .replace(/\d/g, '#').slice(0, 80);
  const sample = (value, max = 80) => String(value ?? '').replace(/\d/g, '#').slice(0, max);
  const describeWarning = (element, via, reason, causesFailure) => {
    const base = {
      via, tag: String(element?.tagName || 'unknown').toLowerCase(), role: element?.getAttribute?.('role') || null,
      classSample: sample(classOf(element)), reason,
    };
    return causesFailure ? { ...base, text: redactDiagnosticTextInPage(textOf(element)) } : { ...base, text: null };
  };
  const warningMatchesByElement = new Map();
  const addWarning = (element, via, reason, causesFailure) => {
    if (!warningMatchesByElement.has(element)) warningMatchesByElement.set(element, describeWarning(element, via, reason, causesFailure));
  };
  for (const element of scopedElements.filter(candidate => candidate.matches('[role="alert"],[class*="warning" i],[class*="error" i],[class*="alert" i]'))) {
    const className = classOf(element);
    if (isIconOrBadge(element) && !hasRestrictionInPage(textOf(element))) addWarning(element, 'selector', 'icon-or-badge', false);
    else if (/warning/i.test(className)) addWarning(element, 'selector', 'warning-class', true);
    else if (/error/i.test(className)) addWarning(element, 'selector', 'error-class', true);
    else if (element.getAttribute('role') === 'alert' && titleAnnouncer(element)) addWarning(element, 'selector', 'title-announcer', false);
    else if (element.getAttribute('role') === 'alert' && explicitAlertKind(element)) addWarning(element, 'selector', explicitAlertKind(element), false);
    else if (element.getAttribute('role') === 'alert') addWarning(element, 'selector', 'alert-role', true);
    else if (explicitAlertKind(element)) addWarning(element, 'selector', explicitAlertKind(element), false);
    else addWarning(element, 'selector', 'alert-like', false);
  }
  for (const element of scopedElements.filter(candidate => {
    const text = textOf(candidate);
    if (!text || (!hasRestrictionInPage(text) && !isBareWarningInPage(text))) return false;
    return ![...candidate.children].some(child => hasRestrictionInPage(textOf(child)) || isBareWarningInPage(textOf(child)));
  })) {
    if (!hasRestrictionInPage(textOf(element)) && isIconOrBadge(element)) addWarning(element, 'text', 'icon-or-badge', false);
    else addWarning(element, 'text', isBareWarningInPage(textOf(element)) ? 'bare-warning-text' : 'restriction-text', true);
  }
  const warningMatches = [...warningMatchesByElement.values()].slice(0, 20);
  const scopedWarningText = scopedElements.filter(element => element.children.length === 0).map(textOf).filter(Boolean).join('\n');
  return {
    url: location.href, title: document.title, html: document.documentElement.outerHTML,
    bodyText: textOf(document.body), metricRootVisible: visible(document.querySelector('#main-content #analytic-tab')),
    loginVisible: [...document.querySelectorAll('a,button,[role="button"]')].some(element => visible(element) && /^(?:login|đăng nhập)$/i.test(textOf(element))),
    captchaVisible: [...document.querySelectorAll('[id*="captcha" i],[class*="captcha" i],iframe[src*="captcha" i]')].some(visible) || /captcha|verify you are human/i.test(textOf(document.body)),
    logoutVisible: /(?:logged\s*out|signed\s*out|session\s+expired|đã\s+đăng\s+xuất|phiên.*hết\s+hạn)/i.test(textOf(document.body)),
    warningMatches, warningVisible: [...warningMatchesByElement.entries()].some(([, match]) => ['warning-class', 'error-class', 'alert-role', 'restriction-text', 'bare-warning-text'].includes(match.reason)), warningText: scopedWarningText,
    regions, regionsHtml, screenshotRegions, pagination: regions['top-products']?.pagination || null, platformViews,
    snapshot: window.__metricWebSnapshot || window.__METRIC_WEB_SNAPSHOT__ || null,
  };
}

async function waitForResultsSettle(page) {
  await page.wait({ selector: '#main-content #analytic-tab', timeout: 30 }).catch(() => {});
  await page.wait({ time: DEFAULT_WAIT_SECONDS }).catch(() => {});
}

async function gateCurrentMetricPage(page) {
  const observation = await page.evaluate(observeMetricPage, false);
  return gateMetricPage(observation);
}

// These functions run in the page. A screenshot is publishable only when a
// visible result region has a finite bounding box. The account/header mask is
// applied before capture and restored immediately afterwards.
function prepareScreenshotClip(selector) {
  const region = document.querySelector(selector);
  if (!region) return { clip: null, reason: 'RESULT_REGION_NOT_FOUND' };
  const rect = region.getBoundingClientRect();
  if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) {
    return { clip: null, reason: 'RESULT_REGION_BOUNDS_UNAVAILABLE' };
  }
  const clip = { x: Math.max(0, rect.left), y: Math.max(0, rect.top), width: rect.width, height: rect.height };
  const intersects = other => {
    const candidate = other.getBoundingClientRect();
    return candidate.width > 0 && candidate.height > 0
      && candidate.left < rect.right && candidate.right > rect.left
      && candidate.top < rect.bottom && candidate.bottom > rect.top;
  };
  const sensitive = element => {
    if (element === region || region.contains(element)) return false;
    const marker = `${element.tagName || ''} ${element.id || ''} ${element.className || ''}`;
    const style = getComputedStyle(element);
    return /(?:header|account|avatar|profile|nickname|shop[-_ ]?owner|user[-_ ]?info|logout|sign[-_ ]?out)/i.test(marker)
      || ((style.position === 'fixed' || style.position === 'sticky') && intersects(element));
  };
  let maskedCount = 0;
  for (const element of document.querySelectorAll('body *')) {
    if (!sensitive(element)) continue;
    element.setAttribute('data-metric-screenshot-hidden', '1');
    element.setAttribute('data-metric-screenshot-prev-visibility', element.style.visibility || '');
    element.style.visibility = 'hidden';
    maskedCount += 1;
  }
  return { clip, maskedCount };
}

function restoreScreenshotMask() {
  for (const element of document.querySelectorAll('[data-metric-screenshot-hidden="1"]')) {
    element.style.visibility = element.getAttribute('data-metric-screenshot-prev-visibility') || '';
    element.removeAttribute('data-metric-screenshot-hidden');
    element.removeAttribute('data-metric-screenshot-prev-visibility');
  }
  return true;
}

async function readResultPage(page) {
  // The gate is deliberately a separate page evaluation. This keeps redirects,
  // login/captcha screens and warnings out of both DOM and network archives.
  const before = await page.evaluate(observeMetricPage, false);
  gateMetricPage(before);
  const dom = await page.evaluate(observeResultPage);
  gateMetricPage({ ...before, ...dom, url: dom.url || before.url, metricRootVisible: dom.metricRootVisible ?? before.metricRootVisible });
  await gateCurrentMetricPage(page);
  const responses = typeof page.readNetworkCapture === 'function' ? await page.readNetworkCapture() : [];
  return { dom, responses: Array.isArray(responses) ? responses : [] };
}

function platformLabel(value) {
  const normalized = String(value ?? '').normalize('NFC').trim().toLowerCase();
  return normalized === 'tiktok' || normalized === 'tiktok shop' ? 'tiktok' : normalized === 'shopee' ? 'shopee' : null;
}

function isCombinedPlatformLabel(value) {
  return /^(?:all|all platforms|total|tất cả|tất cả nền tảng)$/i.test(String(value ?? '').normalize('NFC').trim());
}

async function saveViewRegionScreenshots(page, dom, screenshotDir, viewPlatform, seenScreenshots, screenshots, screenshotSkips) {
  if (!dom?.screenshotRegions || typeof page.screenshot !== 'function') return;
  for (const [region, selector] of Object.entries(dom.screenshotRegions)) {
    const key = `${viewPlatform}:${region}`;
    if (seenScreenshots.has(key)) continue;
    await gateCurrentMetricPage(page);
    await page.evaluate((targetSelector) => {
      const element = document.querySelector(targetSelector);
      element?.scrollIntoView({ block: 'start', inline: 'nearest' });
      return Boolean(element);
    }, selector).catch(() => false);
    await gateCurrentMetricPage(page);
    const prepared = await page.evaluate(prepareScreenshotClip, selector).catch(() => ({ clip: null, reason: 'SCREENSHOT_CLIP_FAILED' }));
    if (!prepared?.clip) {
      screenshotSkips.push({ platform: viewPlatform, region, reason: prepared?.reason || 'SCREENSHOT_CLIP_UNAVAILABLE' });
      continue;
    }
    const safeView = String(viewPlatform).replace(/[^a-z0-9_-]+/gi, '-');
    const safeRegion = String(region).replace(/[^a-z0-9_-]+/gi, '-');
    const path = join(screenshotDir, `platform-${safeView}-region-${safeRegion}.png`);
    try {
      await page.screenshot({ path, fullPage: false, clip: prepared.clip });
      seenScreenshots.add(key);
      screenshots.push({ platform: viewPlatform, region, path, maskedCount: prepared.maskedCount || 0 });
    } finally {
      await page.evaluate(restoreScreenshotMask).catch(() => {});
    }
  }
}

async function collectResultPages(page, productCap, initial = null, viewPlatform = 'all', screenshotDir = null, seenScreenshots = new Set(), screenshots = [], screenshotSkips = []) {
  const responses = []; const domSnapshots = []; const seenPages = new Set();
  let lastDom = null; let pagesRead = 0;
  for (let iteration = 0; iteration < PAGE_CAP; iteration += 1) {
    const current = initial || await readResultPage(page); initial = null; current.dom.observedInView = viewPlatform; lastDom = current.dom; pagesRead += 1;
    responses.push(...current.responses.map(response => ({ ...response, viewPlatform })));
    domSnapshots.push(current.dom);
    if (screenshotDir) await saveViewRegionScreenshots(page, current.dom, screenshotDir, viewPlatform, seenScreenshots, screenshots, screenshotSkips);
    const pagination = current.dom.pagination;
    const productRegion = current.dom.regions?.['top-products'] || {};
    const items = productRegion.items || productRegion.rows;
    const pageNumber = pagination?.page ?? iteration + 1;
    const itemKey = `${pageNumber}:${JSON.stringify(items?.[0] ?? null)}`;
    if (seenPages.has(itemKey)) break;
    seenPages.add(itemKey);
    const observedRows = domSnapshots.reduce((sum, snapshot) => {
      const region = snapshot.regions?.['top-products'] || {};
      return sum + (region.items?.length || region.rows?.length || 0);
    }, 0);
    if (!pagination?.nextAvailable || observedRows >= productCap) break;
    if (!pagination.nextSelector || typeof page.click !== 'function') break;
    await page.click(pagination.nextSelector, { nth: 0 });
    await gateCurrentMetricPage(page);
    await waitForResultsSettle(page);
    await gateCurrentMetricPage(page);
  }
  return { responses, domSnapshots, lastDom, pagesRead, screenshots, screenshotSkips };
}

async function collectResults(page, spec, productCap, screenshotDir) {
  await waitForResultsSettle(page);
  await gateCurrentMetricPage(page);
  const first = await readResultPage(page);
  const platformViews = Array.isArray(first.dom.platformViews) ? first.dom.platformViews : [];
  const requested = [...new Set(spec.platforms)];
  const recognizedViews = platformViews.filter(view => platformLabel(view.label) || isCombinedPlatformLabel(view.label));
  const combined = recognizedViews.find(view => isCombinedPlatformLabel(view.label));
  const batches = [];
  const screenshots = []; const screenshotSkips = []; const seenScreenshots = new Set();
  const selectedView = (dom, wanted) => (Array.isArray(dom?.platformViews) ? dom.platformViews : [])
    .find(view => view.selected && (wanted === 'all' ? isCombinedPlatformLabel(view.label) : platformLabel(view.label) === wanted));
  const requireSelectedView = (dom, wanted) => {
    if (!selectedView(dom, wanted)) throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric result view is not selected: ${wanted}`);
    return dom;
  };
  const switchAndRead = async (target, wanted) => {
    if (typeof page.click !== 'function') throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric platform result view is unavailable: ${wanted}`);
    await page.click(target.selector, { nth: target.index });
    await gateCurrentMetricPage(page);
    await waitForResultsSettle(page);
    await gateCurrentMetricPage(page);
    const switched = await readResultPage(page);
    requireSelectedView(switched.dom, wanted);
    return switched;
  };
  if (recognizedViews.length === 0 || combined) {
    let combinedPage = first;
    if (combined) {
      combinedPage = combined.selected ? first : await switchAndRead(combined, 'all');
      requireSelectedView(combinedPage.dom, 'all');
    }
    batches.push({ platform: 'all', ...(await collectResultPages(page, productCap, combinedPage, 'all', screenshotDir, seenScreenshots, screenshots, screenshotSkips)) });
  }
  if (recognizedViews.length >= 2) {
    for (const wanted of requested) {
      const target = recognizedViews.find(view => platformLabel(view.label) === wanted);
      if (!target) throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric platform result view is missing: ${wanted}`);
      // Re-read after the previous batch (and after every switch); the
      // initial target.selected value is stale once another tab is active.
      let current = await readResultPage(page);
      if (!selectedView(current.dom, wanted)) current = await switchAndRead(target, wanted);
      requireSelectedView(current.dom, wanted);
      batches.push({ platform: wanted, ...(await collectResultPages(page, productCap, current, wanted, screenshotDir, seenScreenshots, screenshots, screenshotSkips)) });
    }
  } else if (recognizedViews.length === 1 && !combined) {
    const solePlatform = platformLabel(recognizedViews[0].label);
    if (!solePlatform || requested.some(platform => platform !== solePlatform)) {
      throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric result page does not expose every requested platform view');
    }
    requireSelectedView(first.dom, solePlatform);
    batches.push({ platform: solePlatform, ...(await collectResultPages(page, productCap, first, solePlatform, screenshotDir, seenScreenshots, screenshots, screenshotSkips)) });
  }
  const allResponses = batches.flatMap(batch => batch.responses);
  const responses = [...new Map(allResponses.map(response => [JSON.stringify([response.viewPlatform, response.url, response.urlPath, response.responsePreview, response.body, response.status]), response])).values()];
  return {
    responses, domSnapshots: batches.flatMap(batch => batch.domSnapshots),
    lastDom: batches.at(-1)?.lastDom || first.dom, screenshots, screenshotSkips,
    views: batches.map(batch => ({ platform: batch.platform, pagesRead: batch.pagesRead })),
  };
}

function ensureExternalCapturePath(path) {
  if (!isAbsolute(path)) throw new MetricAdapterError('METRIC_UI_CHANGED', 'capture output must be an absolute path outside the repository');
  const candidate = resolve(path); const workspace = resolve(process.cwd()); const relation = relative(workspace, candidate);
  if (!relation || (!relation.startsWith(`..${sep}`) && relation !== '..')) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'capture output must be outside the repository');
  }
  return candidate;
}

async function archiveResultsPage(page, out, spec, observation, parsed, productCap) {
  if (!Number.isSafeInteger(productCap) || productCap <= 0 || productCap > PRODUCT_CAP) throw new MetricAdapterError('METRIC_ROW_CAP', `product pagination cap must be between 1 and ${PRODUCT_CAP}`);
  const destination = ensureExternalCapturePath(out);
  const staging = await mkdtemp(join(tmpdir(), 'metric-capture-'));
  try {
    const collected = await collectResults(page, spec, productCap, staging);
    await gateCurrentMetricPage(page);
    if (collected.screenshots.length === 0) {
      const reasons = collected.screenshotSkips?.map(skip => `${skip.platform}/${skip.region}:${skip.reason}`).join(', ') || 'none recorded';
      throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric result-region screenshots are unavailable (${reasons})`);
    }
    const captureId = `metric-${Date.now()}`;
    const specDigest = hashBytes(Buffer.from(JSON.stringify(spec), 'utf8'));
    const scope = { ...parsed.appliedFilters, ticks: parsed.appliedFilters.ticks || [], advancedFilters: parsed.appliedFilters.advancedFilters || [], exclusions: parsed.appliedFilters.exclusions || [] };
    const extracted = extractResultsPage({ responses: collected.responses, dom: collected.domSnapshots, scope, captureId, specDigest, capturedAt: new Date().toISOString(), pageCap: productCap });
    await mkdir(destination, { recursive: true });
    const rawPath = join(destination, 'raw-responses.json'); await writeJson(rawPath, sanitizeNetworkResponses(collected.responses));
    const htmlPath = join(destination, 'results.html');
    const regionHtml = collected.domSnapshots.flatMap(snapshot => Object.values(snapshot?.regionsHtml || {})).filter(Boolean);
    const html = regionHtml.length ? `<main data-metric-archive="results">${regionHtml.join('\n')}</main>` : collected.domSnapshots.map(snapshot => snapshot?.html).filter(Boolean).join('\n');
    await writeFile(htmlPath, sanitizeResultsHtml(html), 'utf8');
    const snapshotPath = join(destination, 'snapshot.json'); await writeJson(snapshotPath, extracted.snapshot);
    const screenshotFiles = [];
    for (const screenshot of collected.screenshots) {
      const targetPath = join(destination, screenshot.path.split('/').at(-1));
      await copyFile(screenshot.path, targetPath);
      screenshotFiles.push(await fileEntry(`screenshot:${screenshot.platform}:${screenshot.region}`, targetPath, 'image/png'));
    }
    const files = [await fileEntry('raw-responses', rawPath, 'application/json'), await fileEntry('snapshot', snapshotPath, 'application/json'), await fileEntry('results-html', htmlPath, 'text/html'), ...screenshotFiles];
    const manifest = {
      contractVersion: 'metric-results-capture-v1', captureId, specDigest, appliedFilters: scope, resultCount: parsed.rowCount,
      productPagination: extracted.pagination.W12_topProducts, views: collected.views, sourceMap: extracted.sourceMap, files,
      screenshotSkips: collected.screenshotSkips,
      archive: { rawResponses: 'raw-responses.json', normalizedSnapshot: 'snapshot.json', resultsHtml: 'results.html', screenshots: screenshotFiles.map(file => file.path) },
      noReportFileRequested: true,
    };
    const manifestPath = join(destination, 'manifest.json'); await writeJson(manifestPath, manifest);
    return { manifestPath, rowCount: parsed.rowCount, snapshot: extracted.snapshot, captureId };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export const whoamiCommand = cli({
  site: 'metric', name: 'whoami', access: 'read', description: 'Read Metric login and displayed analysis quota state', domain: 'metric.vn', strategy: Strategy.UI, browser: true, navigateBefore: false, siteSession: 'ephemeral', args: [{ name: 'diagnose', type: 'boolean', default: false, help: 'Include warning-match diagnostics' }], columns: ['status', 'plan', 'analysisLookupsRemaining'],
  func: async (page, args = {}) => withMetricTab(page, async target => {
    const observation = await readObservation(target, { includeResults: false, diagnose: Boolean(args.diagnose) });
    const result = parseWhoamiObservation(observation);
    return [args.diagnose ? { ...result, warningMatches: safeWarningMatches(observation.warningMatches) } : result];
  }),
});

export const searchCommand = cli({
  site: 'metric', name: 'search', access: 'read', description: 'Run one Metric analysis lookup and save its web snapshot', domain: 'metric.vn', strategy: Strategy.UI, browser: true, navigateBefore: false, siteSession: 'ephemeral',
  args: [{ name: 'spec', type: 'string', required: true, help: 'Path to metric-query-spec-v1 JSON' }, { name: 'out', type: 'string', required: true, help: 'Output path for the snapshot JSON' }], columns: ['status', 'rowCount', 'snapshotPath'],
  func: async (page, args) => withMetricTab(page, async target => { const spec = await readSpec(args.spec); const { parsed } = await runSearch(target, spec, Number.MAX_SAFE_INTEGER); await writeJson(args.out, parsed.snapshot); return [{ status: 'READY', rowCount: parsed.rowCount, snapshotPath: String(args.out) }]; }),
});

export const captureCommand = cli({
  site: 'metric', name: 'capture', access: 'read', description: 'Run one Metric analysis lookup and archive the results page', domain: 'metric.vn', strategy: Strategy.UI, browser: true, navigateBefore: false, siteSession: 'ephemeral',
  args: [{ name: 'spec', type: 'string', required: true, help: 'Path to metric-query-spec-v1 JSON' }, { name: 'out', type: 'string', required: true, help: 'Absolute output directory outside the repository' }, { name: 'product-cap', type: 'int', default: PRODUCT_CAP, help: 'Maximum product rows to read through pagination per platform view' }], columns: ['status', 'rowCount', 'manifestPath'],
  func: async (page, args) => withMetricTab(page, async target => {
    const spec = await readSpec(args.spec); await target.startNetworkCapture?.(); await target.readNetworkCapture?.();
    const { observation, parsed } = await runSearch(target, spec, Number.MAX_SAFE_INTEGER);
    const archive = await archiveResultsPage(target, args.out, spec, observation, parsed, Number(args['product-cap'] ?? PRODUCT_CAP));
    return [{ status: 'READY', rowCount: archive.rowCount, manifestPath: archive.manifestPath }];
  }),
});

export const __test__ = { asCliError, withMetricTab, readObservation, applyMetricSpec, performSearch, waitForKeywordCommit, observeMetricPage, observeResultPage, collectResultPages, archiveResultsPage, readCommittedKeywords };
export { assertMetricUrl, parseMetricForm };
