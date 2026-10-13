// Metric adapter for OpenCLI 1.8.8. Every command owns one ephemeral tab.
// Browser writes use OpenCLI actions; evaluate() is used only for read-back.
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
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
import {
  assertSearchAppliedGate,
  buildMetricPlatformMap,
  extractResultsPage,
  sanitizeDomSnapshots,
  sanitizeDebugObject,
  sanitizeNetworkResponses,
  sanitizeResultsHtml,
} from './capture.js';

const BASE_URL = 'https://metric.vn/analytics';
const PRODUCT_CAP = 200;
const PAGE_CAP = 10;
const NETWORK_WAIT_TIMEOUT_MS = 30_000;
const NETWORK_POLL_SECONDS = 0.25;

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
      elementKind: String(match.tag ?? 'unknown').toLowerCase(),
      role: match.role == null ? null : String(match.role),
      classSample: diagnosticSample(match.classSample),
      reason: String(match.reason ?? 'unspecified'),
    };
    const phrase = match.phrase == null ? null : redactDiagnosticText(match.phrase);
    return diagnosticMatchIsBenign(match)
      ? { ...base, phrase: null, text: null }
      : { ...base, phrase, text: phrase };
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
  const labels = [...document.querySelectorAll('#QuerySearchBuilder .filter-label, #QuerySearchBuilder .filter-label .label')];
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
    const raw = String(value ?? '').normalize('NFC').trim();
    const normalized = raw.toLowerCase();
    if (normalized === 'shopee') return 'shopee';
    if (normalized === 'tiktok' || normalized === 'tiktok shop') return 'tiktok';
    return raw;
  };
  const platformSelect = labelledSelect('Platform');
  const periodSelect = labelledSelect('Time period');
  const categorySelect = labelledSelect('Product category');
  // Serialized by OpenCLI: keep this keyword locator self-contained. Its copy
  // in readCommittedKeywords and applyMetricSpec must stay behaviorally equal.
  const locateKeywordSelect = () => {
    const root = document.querySelector('#QuerySearchBuilder');
    if (!root) return { select: null, locatedBy: 'none' };
    const labelledControl = pattern => {
      const label = [...root.querySelectorAll('.filter-label, .filter-label .label')].find(element => pattern.test(textOf(element)));
      const container = label?.closest('.ant-space-item');
      return [...(container?.querySelectorAll('.ant-select') || [])].find(visible) || null;
    };
    const platformSelect = labelledControl(/^(?:platform|nền tảng)/i);
    const placeholderPattern = /keywords? separated by commas|từ kh(?:óa|oá)/i;
    const isKeywordCandidate = element => element.classList.contains('ant-select-multiple')
      || placeholderPattern.test(textOf(element.querySelector('.ant-select-selection-placeholder')))
      || [...element.querySelectorAll('input')].some(input => placeholderPattern.test(input.getAttribute('placeholder') || '') || placeholderPattern.test(input.getAttribute('aria-label') || ''));
    const keywordLabel = [...root.querySelectorAll('.filter-label, .filter-label .label')]
      .find(element => /^(?:keywords|từ kh(?:óa|oá))/i.test(textOf(element)));
    const labelledContainer = keywordLabel?.closest('.ant-space-item');
    const labelledSelect = [...(labelledContainer?.querySelectorAll('.ant-select') || [])]
      .find(element => visible(element) && element !== platformSelect && isKeywordCandidate(element));
    if (labelledSelect) return { select: labelledSelect, locatedBy: 'label' };
    const placeholderSelect = [...root.querySelectorAll('.ant-select')].find(element => visible(element) && (
      placeholderPattern.test(textOf(element.querySelector('.ant-select-selection-placeholder')))
      || [...element.querySelectorAll('input')].some(input => placeholderPattern.test(input.getAttribute('placeholder') || '') || placeholderPattern.test(input.getAttribute('aria-label') || ''))
    ) && element !== platformSelect);
    if (placeholderSelect) return { select: placeholderSelect, locatedBy: 'placeholder' };
    const excluded = new Set([
      platformSelect,
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
  // Keyword chips are read only from the control resolved above. Do not use
  // the generic select reader here: the platform select also renders chips.
  const keywordValues = keywordSelect ? [...keywordSelect.querySelectorAll(
    '.ant-select-selection-overflow-item:not(.ant-select-selection-overflow-item-suffix) .ant-tag.ks-chip',
  )].map(tagText).filter(Boolean) : [];
  if (!keywordValues.length && keywordSelect) {
    const chips = [...keywordSelect.querySelectorAll('.ant-select-selection-item-content,[data-value]')];
    const fallback = chips.length ? chips : [...keywordSelect.querySelectorAll('.ant-select-selection-item')];
    keywordValues.push(...fallback.map(item => item.getAttribute?.('title') || item.getAttribute?.('data-value') || textOf(item))
      .filter(value => value && !/^select|placeholder/i.test(value)));
  }
  const typedKeyword = inputValue(keywordSelect);
  if (typedKeyword && !keywordValues.includes(typedKeyword)) keywordValues.push(typedKeyword);
  const selectedCategory = selectionTexts(categorySelect)[0] || '';
  // An explicit All is the only UI state represented by null. A missing,
  // invisible, or blank control remains unobservable and is rejected by the
  // node-side form gate before a lookup can be spent.
  const category = selectedCategory ? (/^all$/i.test(selectedCategory) ? null : selectedCategory) : undefined;
  const checkedLabel = label => {
    const normalise = value => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
    const wanted = normalise(label);
    const element = [...document.querySelectorAll('#QuerySearchBuilder label,[role="checkbox"],[role="switch"]')]
      .find(candidate => normalise(textOf(candidate) || candidate.getAttribute('aria-label')).startsWith(wanted));
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
  const restrictionPhraseInPage = value => {
    const normalised = normaliseMetricTextInPage(value);
    const stripped = stripMetricDiacriticsInPage(normalised);
    const patterns = [
      /access\s+denied|denied\s+access|unauthorized|forbidden|blocked|limit\s+(?:reached|exceeded)|(?:reached|exceeded)\s+limit|session\s+expired|suspended/i,
      /quyền\s+truy\s+cập\s+bị\s+từ\s+chối|không\s+có\s+quyền|tài\s+khoản\s+bị\s+(?:tạm\s+)?khóa|tạm\s+thời\s+không\s+khả\s+dụng|phiên\s+đăng\s+nhập\s+đã\s+hết\s+hạn|hết\s+phiên|giới\s+hạn|hết\s+lượt|vượt\s+quá/i,
    ];
    for (const text of [normalised, stripped]) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[0];
      }
      const words = metricWordsInPage(text);
      for (const group of [['quyen', 'truy', 'cap', 'bi', 'tu', 'choi'], ['gioi', 'han'], ['het', 'luot'], ['vuot', 'qua'], ['phien', 'dang', 'nhap', 'het', 'han'], ['het', 'phien'], ['tai', 'khoan', 'bi', 'khoa'], ['tai', 'khoan', 'tam', 'khoa'], ['khong', 'co', 'quyen'], ['tam', 'thoi', 'khong', 'kha', 'dung']]) {
        if (group.every(word => words.has(word))) return group.join(' ');
      }
    }
    return null;
  };
  const isBareWarningInPage = value => {
    const normalised = stripMetricDiacriticsInPage(value);
    return normalised === 'warning' || normalised === 'canh bao';
  };
  const warningScopeRoots = [...document.querySelectorAll('[role="alert"],[role="dialog"],[aria-live="assertive"],[aria-live="polite"],.ant-alert,.ant-message,.ant-message-notice,.ant-notification,.ant-notification-notice,.ant-modal,.ant-modal-root,[class*="toast" i],[class*="banner" i]')]
    .filter(visible);
  const isHeaderOrAccount = element => {
    const marker = `${element?.tagName || ''} ${element?.id || ''} ${typeof element?.className === 'string' ? element.className : ''}`;
    return Boolean(element?.closest?.('header,#header,[class*="header" i],[class*="account" i],[class*="profile" i],[class*="avatar" i],[class*="user" i]'))
      || /header|account|profile|avatar|nickname|shop[-_ ]?owner|user[-_ ]?(?:info|widget|menu)?/i.test(marker);
  };
  const semanticWarningRoot = element => element?.matches?.('[role="alert"],[role="dialog"],[aria-live="assertive"],[aria-live="polite"],.ant-alert,.ant-message,.ant-message-notice,.ant-notification,.ant-notification-notice,.ant-modal,.ant-modal-root,[class*="toast" i],[class*="banner" i]');
  const inWarningScope = element => warningScopeRoots.some(root => (root === element || root.contains(element))
    && (semanticWarningRoot(root) || !isHeaderOrAccount(element)));
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
  const redactDiagnosticTextInPage = (value, element) => {
    if (isHeaderOrAccount(element)) return '[redacted-header-alert]';
    return String(value ?? '').normalize('NFC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?<!\w)\+?\d[\d\s().-]{5,}\d(?!\w)/g, '[redacted-phone]')
    .replace(/\d/g, '#').slice(0, 80);
  };
  const sample = (value, max = 80) => String(value ?? '').replace(/\d/g, '#').slice(0, max);
  const describeWarning = (element, via, reason, causesFailure) => {
    const text = textOf(element);
    const base = {
      via, tag: String(element?.tagName || 'unknown').toLowerCase(), role: element?.getAttribute?.('role') || null,
      classSample: sample(classOf(element)), reason,
    };
    return causesFailure ? {
      ...base,
      phrase: restrictionPhraseInPage(text) || (isBareWarningInPage(text) ? stripMetricDiacriticsInPage(text) : null),
      text: redactDiagnosticTextInPage(text, element),
    } : { ...base, phrase: null, text: null };
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
    if (error instanceof MetricAdapterError && (diagnose || error.details?.warningMatches)) {
      error.details = { ...(error.details || {}), warningMatches: safeWarningMatches(observation.warningMatches) };
    }
    throw error;
  }
}

function assertMetricCategoryObservation(observation) {
  const control = Array.isArray(observation?.controls)
    ? observation.controls.find(candidate => candidate?.name === 'category')
    : null;
  if (!control || control.visible !== true) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric Product category control is not visible');
  }
  const selected = Array.isArray(control.selected)
    ? control.selected.map(value => String(value ?? '').normalize('NFC').trim()).filter(Boolean)
    : [];
  if (selected.length !== 1) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric Product category selection is blank or unavailable');
  }
  if (!observation.appliedFilters || !Object.hasOwn(observation.appliedFilters, 'category') || observation.appliedFilters.category === undefined) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric Product category is not observable');
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
    const labelledControl = pattern => {
      const label = [...root.querySelectorAll('.filter-label, .filter-label .label')].find(element => pattern.test(textOf(element)));
      const container = label?.closest('.ant-space-item');
      return [...(container?.querySelectorAll('.ant-select') || [])].find(visible) || null;
    };
    const platformSelect = labelledControl(/^(?:platform|nền tảng)/i);
    const placeholderPattern = /keywords? separated by commas|từ kh(?:óa|oá)/i;
    const isKeywordCandidate = element => element.classList.contains('ant-select-multiple')
      || placeholderPattern.test(textOf(element.querySelector('.ant-select-selection-placeholder')))
      || [...element.querySelectorAll('input')].some(input => placeholderPattern.test(input.getAttribute('placeholder') || '') || placeholderPattern.test(input.getAttribute('aria-label') || ''));
    const keywordLabel = [...root.querySelectorAll('.filter-label, .filter-label .label')]
      .find(element => /^(?:keywords|từ kh(?:óa|oá))/i.test(textOf(element)));
    const labelledContainer = keywordLabel?.closest('.ant-space-item');
    const labelledSelect = [...(labelledContainer?.querySelectorAll('.ant-select') || [])]
      .find(element => visible(element) && element !== platformSelect && isKeywordCandidate(element));
    if (labelledSelect) return { select: labelledSelect, locatedBy: 'label' };
    const placeholderSelect = [...root.querySelectorAll('.ant-select')].find(element => visible(element) && (
      placeholderPattern.test(textOf(element.querySelector('.ant-select-selection-placeholder')))
      || [...element.querySelectorAll('input')].some(input => placeholderPattern.test(input.getAttribute('placeholder') || '') || placeholderPattern.test(input.getAttribute('aria-label') || ''))
    ) && element !== platformSelect);
    if (placeholderSelect) return { select: placeholderSelect, locatedBy: 'placeholder' };
    const excluded = new Set([
      platformSelect,
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
    const labelledControl = pattern => {
      const label = [...root.querySelectorAll('.filter-label, .filter-label .label')].find(element => pattern.test(textOf(element)));
      const container = label?.closest('.ant-space-item');
      return [...(container?.querySelectorAll('.ant-select') || [])].find(visible) || null;
    };
    const platformSelect = labelledControl(/^(?:platform|nền tảng)/i);
    const placeholderPattern = /keywords? separated by commas|từ kh(?:óa|oá)/i;
    const isKeywordCandidate = element => element.classList.contains('ant-select-multiple')
      || placeholderPattern.test(textOf(element.querySelector('.ant-select-selection-placeholder')))
      || [...element.querySelectorAll('input')].some(input => placeholderPattern.test(input.getAttribute('placeholder') || '') || placeholderPattern.test(input.getAttribute('aria-label') || ''));
    const keywordLabel = [...root.querySelectorAll('.filter-label, .filter-label .label')]
      .find(element => /^(?:keywords|từ kh(?:óa|oá))/i.test(textOf(element)));
    const labelledContainer = keywordLabel?.closest('.ant-space-item');
    const labelledSelect = [...(labelledContainer?.querySelectorAll('.ant-select') || [])]
      .find(element => visible(element) && element !== platformSelect && isKeywordCandidate(element));
    if (labelledSelect) return { select: labelledSelect, locatedBy: 'label' };
    const placeholderSelect = [...root.querySelectorAll('.ant-select')].find(element => visible(element) && (
      placeholderPattern.test(textOf(element.querySelector('.ant-select-selection-placeholder')))
      || [...element.querySelectorAll('input')].some(input => placeholderPattern.test(input.getAttribute('placeholder') || '') || placeholderPattern.test(input.getAttribute('aria-label') || ''))
    ) && element !== platformSelect);
    if (placeholderSelect) return { select: placeholderSelect, locatedBy: 'placeholder' };
    const excluded = new Set([
      platformSelect,
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

function formState(appliedFilters) {
  const filters = appliedFilters && typeof appliedFilters === 'object' ? appliedFilters : {};
  return {
    platforms: Array.isArray(filters.platforms) ? [...filters.platforms] : [],
    keywords: Array.isArray(filters.keywords) ? [...filters.keywords] : [],
    period: filters.period && typeof filters.period === 'object' ? { ...filters.period } : null,
    category: Object.hasOwn(filters, 'category') && filters.category !== undefined ? filters.category : null,
  };
}

function canonicalValues(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value ?? '').normalize('NFC').trim().toLowerCase()).filter(Boolean))].sort();
}

function preSubmitMismatches(spec, appliedFilters) {
  const actual = appliedFilters && typeof appliedFilters === 'object' ? appliedFilters : {};
  const mismatches = [];
  const expectedPlatforms = canonicalValues(spec.platforms);
  const actualPlatforms = canonicalValues(actual.platforms);
  const unexpectedPlatforms = actualPlatforms.filter(platform => !expectedPlatforms.includes(platform));
  if (JSON.stringify(actualPlatforms) !== JSON.stringify(expectedPlatforms)) {
    mismatches.push({ field: 'platforms', expected: spec.platforms, actual: actual.platforms ?? [], ...(unexpectedPlatforms.length ? { unexpected: unexpectedPlatforms } : {}) });
  }
  const expectedKeywords = canonicalValues(spec.keywords);
  const actualKeywords = canonicalValues(actual.keywords);
  if (JSON.stringify(actualKeywords) !== JSON.stringify(expectedKeywords)) {
    mismatches.push({ field: 'keywords', expected: spec.keywords, actual: actual.keywords ?? [] });
  }
  const expectedPeriod = { startDate: spec.period.startDate, endDate: spec.period.endDate };
  const actualPeriod = actual.period && typeof actual.period === 'object'
    ? { startDate: actual.period.startDate ?? null, endDate: actual.period.endDate ?? null }
    : null;
  if (JSON.stringify(actualPeriod) !== JSON.stringify(expectedPeriod)) {
    mismatches.push({ field: 'period', expected: expectedPeriod, actual: actualPeriod });
  }
  if (actual.category !== spec.category) {
    mismatches.push({ field: 'category', expected: spec.category, actual: actual.category ?? null });
  }
  for (const field of ['smartQuery', 'aiNormalisation', 'usefulFilters', 'advancedFilters', 'exclusions', 'ticks']) {
    if (Object.hasOwn(spec, field) && JSON.stringify(actual[field] ?? null) !== JSON.stringify(spec[field] ?? null)) {
      mismatches.push({ field, expected: spec[field] ?? null, actual: actual[field] ?? null });
    }
  }
  return mismatches;
}

function assertPreSubmitReadBack(spec, ready) {
  const mismatches = preSubmitMismatches(spec, ready?.appliedFilters);
  if (!mismatches.length) return;
  const platformMismatch = mismatches.find(mismatch => mismatch.field === 'platforms');
  if (platformMismatch) {
    throw new MetricAdapterError('METRIC_FILTER_MISMATCH', 'Metric platform selection does not match the request', {
      platformsMatchExpected: false,
      platformCount: Array.isArray(platformMismatch.actual) ? new Set(platformMismatch.actual).size : 0,
      mismatches,
    });
  }
  throw new MetricAdapterError('METRIC_FILTER_MISMATCH', 'Metric form read-back does not match the query spec', { mismatches });
}

function assertSupportedMetricPeriod(spec, startState) {
  const requestedPeriod = { startDate: spec.period.startDate, endDate: spec.period.endDate };
  const observedPeriod = startState?.period && typeof startState.period === 'object'
    ? { startDate: startState.period.startDate ?? null, endDate: startState.period.endDate ?? null }
    : null;
  if (JSON.stringify(observedPeriod) !== JSON.stringify(requestedPeriod)) {
    throw new MetricAdapterError('METRIC_PERIOD_UNSUPPORTED', 'Metric lookups currently support only the page default period', {
      observedPeriod,
      requestedPeriod,
    });
  }
}

async function prepareMetricForm(page, spec, onStartState = null) {
  const before = await readObservation(page, { includeResults: false });
  onStartState?.(before);
  assertMetricCategoryObservation(before);
  parseMetricForm(before);
  assertSupportedMetricPeriod(spec, before.appliedFilters);
  await applyMetricSpec(page, spec, before);
  await waitForKeywordCommit(page, spec.keywords);
  // This is the last gate before the real submit action. Dry-run uses this
  // function and returns before performSearch can reach clickVisibleText.
  const ready = await readObservation(page, { includeResults: false });
  assertMetricCategoryObservation(ready);
  assertPreSubmitReadBack(spec, ready);
  return { before, ready };
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

function safeDebugPart(value, fallback = 'unknown') {
  const part = String(value ?? '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
  return part || fallback;
}

function prepareDebugFullPageScreenshot() {
  const markerOf = element => `${element?.tagName || ''} ${element?.id || ''} ${typeof element?.className === 'string' ? element.className : ''}`;
  const sensitive = element => {
    const marker = markerOf(element);
    return /^(?:header|nav)$/i.test(String(element?.tagName || ''))
      || /(?:header|account|avatar|profile|nickname|shop[-_ ]?owner|user[-_ ]?(?:info|widget|menu)?|logout|sign[-_ ]?out)/i.test(marker);
  };
  let maskedCount = 0;
  for (const element of document.querySelectorAll('body *')) {
    if (!sensitive(element)) continue;
    element.setAttribute('data-metric-debug-hidden', '1');
    element.setAttribute('data-metric-debug-prev-visibility', element.style.visibility || '');
    element.style.visibility = 'hidden';
    maskedCount += 1;
  }
  return { maskedCount };
}

function restoreDebugFullPageScreenshot() {
  for (const element of document.querySelectorAll('[data-metric-debug-hidden="1"]')) {
    element.style.visibility = element.getAttribute('data-metric-debug-prev-visibility') || '';
    element.removeAttribute('data-metric-debug-hidden');
    element.removeAttribute('data-metric-debug-prev-visibility');
  }
  return true;
}

async function createDebugSession(debugDir, metadata) {
  await mkdir(debugDir, { recursive: true });
  const safeMetadata = sanitizeDebugObject(metadata);
  const state = {
    debugDir,
    metadata: safeMetadata,
    domSnapshots: [],
    domFiles: [],
    regionFiles: [],
    screenshot: null,
    screenshots: [],
    screenshotError: null,
  };
  const writeInput = async (responses = [], extra = {}) => writeJson(join(debugDir, 'input.json'), {
    contractVersion: 'metric-results-debug-v1',
    ...safeMetadata,
    ...sanitizeDebugObject(extra),
    responses: sanitizeNetworkResponses(responses),
    domSnapshots: state.domSnapshots,
  });
  await writeJson(join(debugDir, 'manifest.json'), {
    contractVersion: 'metric-results-debug-v1',
    ...safeMetadata,
    files: { input: 'input.json', domSnapshots: [], regionHtml: [], fullPageScreenshot: null },
    status: 'started',
  });
  return {
    debugDir,
    async record(page, dom, viewPlatform, pageNumber) {
      const safeView = safeDebugPart(viewPlatform, 'all');
      const base = `dom-${safeView}-page-${pageNumber}`;
      const sanitized = sanitizeDomSnapshots(dom)[0] || {};
      state.domSnapshots.push(sanitized);
      const domPath = join(debugDir, `${base}.json`);
      await writeJson(domPath, sanitized);
      state.domFiles.push(basename(domPath));
      if (sanitized.html) await writeFile(join(debugDir, `${base}.html`), sanitized.html, 'utf8');
      for (const [region, html] of Object.entries(sanitized.regionsHtml || {})) {
        const regionPath = join(debugDir, `${base}-region-${safeDebugPart(region)}.html`);
        await writeFile(regionPath, sanitizeResultsHtml(html), 'utf8');
        state.regionFiles.push(basename(regionPath));
      }
      if ((!state.screenshot || /^submit-/.test(safeView)) && typeof page.screenshot === 'function') {
        const screenshotName = /^submit-/.test(safeView) ? `${base}.png` : 'full-page.png';
        const screenshotPath = join(debugDir, screenshotName);
        let prepared = false;
        try {
          prepared = await page.evaluate(prepareDebugFullPageScreenshot);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          const shot = { path: screenshotName, maskedCount: Number(prepared?.maskedCount) || 0 };
          state.screenshots.push(shot);
          state.screenshot ||= shot;
        } catch (error) {
          state.screenshotError = String(error instanceof Error ? error.message : error);
        } finally {
          if (prepared !== false) await page.evaluate(restoreDebugFullPageScreenshot).catch(() => {});
        }
      }
      await writeInput([], { pageCount: state.domSnapshots.length });
    },
    async update(responses, extra = {}) {
      await writeInput(responses, { pageCount: state.domSnapshots.length, ...extra });
    },
    async finish(responses, extra = {}) {
      await writeInput(responses, { pageCount: state.domSnapshots.length, ...extra });
      const manifest = {
        contractVersion: 'metric-results-debug-v1',
        ...safeMetadata,
        ...sanitizeDebugObject(extra),
        files: {
          input: 'input.json', domSnapshots: state.domFiles, regionHtml: state.regionFiles,
          fullPageScreenshot: state.screenshot?.path || null,
        },
        screenshots: state.screenshots,
        screenshot: state.screenshot,
        screenshotError: state.screenshotError,
        status: extra.status || 'complete',
      };
      await writeJson(join(debugDir, 'manifest.json'), manifest);
      return manifest;
    },
  };
}

async function runSavedResultObserver(html) {
  let JSDOM;
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    try {
      ({ JSDOM } = await import(pathToFileURL(join(process.cwd(), 'node_modules/jsdom/lib/api.js')).href));
    } catch {
      throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric replay requires the local DOM parser dependency');
    }
  }
  const page = new JSDOM(String(html || ''), { url: BASE_URL });
  const previous = {
    window: globalThis.window, document: globalThis.document, location: globalThis.location, getComputedStyle: globalThis.getComputedStyle, CSS: globalThis.CSS,
  };
  const windowObject = page.window;
  const rect = { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, x: 0, y: 0, toJSON() { return this; } };
  windowObject.Element.prototype.getBoundingClientRect = () => ({ ...rect });
  windowObject.HTMLElement.prototype.getBoundingClientRect = () => ({ ...rect });
  const originalGetComputedStyle = windowObject.getComputedStyle.bind(windowObject);
  windowObject.getComputedStyle = element => ({ ...originalGetComputedStyle(element), display: element?.style?.display || 'block', visibility: element?.style?.visibility || 'visible' });
  if (!windowObject.CSS) windowObject.CSS = {};
  if (!windowObject.CSS.escape) windowObject.CSS.escape = value => String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
  windowObject.__metricWebSnapshot = null;
  globalThis.window = windowObject;
  globalThis.document = windowObject.document;
  globalThis.location = windowObject.location;
  globalThis.getComputedStyle = windowObject.getComputedStyle;
  globalThis.CSS = windowObject.CSS;
  try {
    return observeResultPage();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

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

async function clickPeriodPresetIfPresent(page, wanted) {
  const labels = [wanted];
  if (/^30 days$/i.test(wanted)) labels.push('30 ngày');
  if (/^7 days$/i.test(wanted)) labels.push('7 ngày');
  if (/^90 days$/i.test(wanted)) labels.push('90 ngày');
  for (const label of labels) {
    try {
      await clickVisibleOption(page, label);
      return true;
    } catch (error) {
      if (!(error instanceof MetricAdapterError) || error.code !== 'METRIC_UI_CHANGED') throw error;
    }
  }
  return false;
}

// This function is serialized by OpenCLI. It deliberately only inspects the
// form and returns a click descriptor; it never clicks or mutates the page.
function describeSearchSubmit() {
  const visible = element => {
    if (!element) return false;
    const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const textOf = element => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const root = document.querySelector('#QuerySearchBuilder');
  const labels = new Set(['phân tích', 'analyze', 'analytics']);
  const form = root?.closest('form,[role="form"]');
  const formContainer = form && root && form.contains(root) ? form : root;
  const relativePath = element => {
    if (!formContainer || !element || element === formContainer) return '';
    const parts = [];
    let current = element;
    while (current && current !== formContainer) {
      const parent = current.parentElement;
      if (!parent) return '';
      const index = [...parent.children].indexOf(current) + 1;
      parts.push(`${String(current.tagName || 'element').toLowerCase()}:nth-child(${index})`);
      current = parent;
    }
    return current === formContainer ? parts.reverse().join(' > ') : '';
  };
  const formSelector = formContainer?.id ? `#${CSS.escape(formContainer.id)}` : '#QuerySearchBuilder';
  const candidates = formContainer ? [...formContainer.querySelectorAll('button,[role="button"],input[type="submit"]')]
    .filter(element => visible(element) && labels.has(clean(textOf(element) || element.getAttribute('aria-label')))) : [];
  const descriptors = candidates.map((element, index) => ({
    candidateIndex: index,
    tag: String(element.tagName || '').toLowerCase(),
    classes: String(element.className || '').trim(),
    text: textOf(element) || String(element.getAttribute('aria-label') || '').trim(),
    domPath: relativePath(element),
    clickSelector: `${formSelector} ${relativePath(element)}`.trim(),
  }));
  const pageWideAnalyticsCount = [...document.querySelectorAll('a,button,[role="button"],input[type="submit"]')]
    .filter(element => visible(element) && clean(textOf(element) || element.getAttribute('aria-label')) === 'analytics').length;
  return {
    formContainer: formContainer ? {
      tag: String(formContainer.tagName || '').toLowerCase(),
      id: formContainer.id || null,
      classes: String(formContainer.className || '').trim(),
    } : null,
    candidateCount: descriptors.length,
    candidates: descriptors,
    descriptor: descriptors.length === 1 ? descriptors[0] : null,
    pageWideAnalyticsCount,
  };
}

async function inspectSearchSubmit(page) {
  return page.evaluate(describeSearchSubmit);
}

function assertSearchSubmitInspection(inspection) {
  if (!inspection || inspection.candidateCount !== 1 || !inspection.descriptor?.clickSelector) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric search submit control is not uniquely identified inside the search form', {
      candidateCount: Number(inspection?.candidateCount) || 0,
      candidates: Array.isArray(inspection?.candidates) ? inspection.candidates : [],
      pageWideAnalyticsCount: Number(inspection?.pageWideAnalyticsCount) || 0,
    });
  }
  return inspection.descriptor;
}

// Shared by dry-run and submit; never dispatches a submit event.
async function prepareSearchSubmit(page) {
  await page.pressKey('Escape');
  if (typeof page.cdp === 'function') await page.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 }).catch(() => {});
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active && document.querySelector('#QuerySearchBuilder')?.contains(active)) active.blur();
  });
  await page.wait({ time: 0.75 });
  const inspection = await inspectSearchSubmit(page);
  const descriptor = assertSearchSubmitInspection(inspection);
  const preflight = await page.evaluate(selector => {
    const button = document.querySelector(selector);
    button?.scrollIntoView({ block: 'center', inline: 'center' });
    const visible = el => {
      const style = getComputedStyle(el), rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const popups = [...document.querySelectorAll('.ant-select-dropdown,.ant-picker-dropdown,[role="listbox"],[role="dialog"],.ant-dropdown,.ant-popover,.ant-tooltip')]
      .filter(el => !String(el.className || '').includes('leave-active'))
      .filter(visible).map(el => ({ tag: el.tagName.toLowerCase(), classes: String(el.className), role: el.getAttribute('role') }));
    const rect = button?.getBoundingClientRect();
    const hitElement = rect ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
    return { popups, popupVisible: popups.length > 0,
      disabled: !button || button.disabled || button.getAttribute('aria-disabled') === 'true',
      loading: button?.classList.contains('ant-btn-loading') || false,
      hit: hitElement && (hitElement === button || button.contains(hitElement)) ? 'target' : 'other',
      hitElement: hitElement ? { tag: hitElement.tagName.toLowerCase(), classes: String(hitElement.className) } : null,

    };
  }, descriptor.clickSelector);
  if (preflight && typeof preflight === 'object') preflight.candidateCount = inspection.candidateCount;
  if (preflight && typeof preflight === 'object' && (preflight.popupVisible || preflight.disabled || preflight.loading || preflight.hit !== 'target')) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric submit preconditions failed', { preflight });
  }
  return { inspection, descriptor, preflight };
}

async function readMetricPlatformOptionLabels(page) {
  const selector = await page.evaluate(resolvePlatformSelector).catch(() => null);
  if (!selector) return [];
  await page.click(selector.selectSelector || selector.inputSelector).catch(() => {});
  const labels = await page.evaluate(() => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const textOf = element => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('[role="option"],.ant-select-item-option')]
      .filter(visible).map(textOf).filter(Boolean);
  }).catch(() => []);
  if (typeof page.pressKey === 'function') await page.pressKey('Escape').catch(() => {});
  return [...new Set(labels)];
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
  const target = await page.evaluate(wanted => {
    const clean = value => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
    const targetText = clean(wanted);
    const labels = [...document.querySelectorAll('#QuerySearchBuilder label,[role="checkbox"],[role="switch"]')];
    const index = labels.findIndex(element => clean(element.innerText || element.textContent || element.getAttribute('aria-label')).startsWith(targetText));
    if (index < 0) return null;
    const element = labels[index];
    const current = Boolean(element.matches(':checked,[aria-checked="true"]') || element.querySelector(':checked,[aria-checked="true"]'));
    return { selector: '#QuerySearchBuilder label,[role="checkbox"],[role="switch"]', index, current };
  }, label);
  if (!target) throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric checkbox is missing: ${label}`);
  if (target.current !== checked) await page.click(target.selector, { nth: target.index });
  const verified = await page.evaluate(({ wanted, expected }) => {
    const clean = value => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
    const targetText = clean(wanted);
    const element = [...document.querySelectorAll('#QuerySearchBuilder label,[role="checkbox"],[role="switch"]')]
      .find(candidate => clean(candidate.innerText || candidate.textContent || candidate.getAttribute('aria-label')).startsWith(targetText));
    return element ? Boolean(element.matches(':checked,[aria-checked="true"]') || element.querySelector(':checked,[aria-checked="true"]')) === expected : null;
  }, { wanted: label, expected: checked });
  if (verified !== true) throw new MetricAdapterError('METRIC_FILTER_MISMATCH', `Metric checkbox state does not match the request: ${label}`);
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
    const labelledControl = pattern => {
      const label = [...root.querySelectorAll('.filter-label, .filter-label .label')].find(element => pattern.test(textOf(element)));
      const container = label?.closest('.ant-space-item');
      return [...(container?.querySelectorAll('.ant-select') || [])].find(visible) || null;
    };
    const platformSelect = labelledControl(/^(?:platform|nền tảng)/i);
    const placeholderPattern = /keywords? separated by commas|từ kh(?:óa|oá)/i;
    const isKeywordCandidate = element => element.classList.contains('ant-select-multiple')
      || placeholderPattern.test(textOf(element.querySelector('.ant-select-selection-placeholder')))
      || [...element.querySelectorAll('input')].some(input => placeholderPattern.test(input.getAttribute('placeholder') || '') || placeholderPattern.test(input.getAttribute('aria-label') || ''));
    const keywordLabel = [...root.querySelectorAll('.filter-label, .filter-label .label')]
      .find(element => /^(?:keywords|từ kh(?:óa|oá))/i.test(textOf(element)));
    const labelledContainer = keywordLabel?.closest('.ant-space-item');
    const labelledSelect = [...(labelledContainer?.querySelectorAll('.ant-select') || [])]
      .find(element => visible(element) && element !== platformSelect && isKeywordCandidate(element));
    if (labelledSelect) return { select: labelledSelect, locatedBy: 'label' };
    const placeholderSelect = [...root.querySelectorAll('.ant-select')].find(element => visible(element) && (
      placeholderPattern.test(textOf(element.querySelector('.ant-select-selection-placeholder')))
      || [...element.querySelectorAll('input')].some(input => placeholderPattern.test(input.getAttribute('placeholder') || '') || placeholderPattern.test(input.getAttribute('aria-label') || ''))
    ) && element !== platformSelect);
    if (placeholderSelect) return { select: placeholderSelect, locatedBy: 'placeholder' };
    const excluded = new Set([
      platformSelect,
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
  const label = [...document.querySelectorAll('#QuerySearchBuilder .filter-label, #QuerySearchBuilder .filter-label .label')]
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
  const platformKey = value => {
    const normalized = clean(value);
    return normalized === 'tiktok shop' ? 'tiktok' : normalized;
  };
  const wantedKey = platformKey(wanted);
  if (!wantedKey) return null;
  const item = [...select.querySelectorAll('.ant-select-selection-item')].find(element => {
    const content = element.querySelector('.ant-select-selection-item-content');
    return platformKey(content?.getAttribute('title') || content?.textContent || element.textContent) === wantedKey;
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

function readDisplayedPeriod() {
  const toIso = value => {
    const text = String(value ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
  };
  const inputs = [...document.querySelectorAll('#QuerySearchBuilder .ant-picker input')]
    .map(input => toIso(input.value || input.getAttribute('value'))).filter(Boolean);
  return inputs.length >= 2 ? { startDate: inputs[0], endDate: inputs[inputs.length - 1] } : null;
}

function dateCellState(target) {
  const visible = element => {
    if (!element) return false;
    const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const cells = [...document.querySelectorAll('.ant-picker-dropdown .ant-picker-cell, .ant-picker-dropdown .ant-picker-cell-inner')]
    .filter(visible).map(element => ({
      element,
      title: element.getAttribute('title') || element.closest('.ant-picker-cell')?.getAttribute('title') || null,
    })).filter(cell => cell.title);
  const wanted = cells.find(cell => cell.title === target && cell.element.matches('.ant-picker-cell-inner') && cell.element.getAttribute('title') === target)
    || cells.find(cell => cell.title === target);
  if (wanted) return {
    index: cells.indexOf(wanted), direction: null,
    selector: wanted.element.matches('.ant-picker-cell-inner')
      ? `.ant-picker-dropdown .ant-picker-cell-inner[title="${target}"]`
      : `.ant-picker-dropdown .ant-picker-cell[title="${target}"]`,
    clickIndex: [...document.querySelectorAll(wanted.element.matches('.ant-picker-cell-inner')
      ? `.ant-picker-dropdown .ant-picker-cell-inner[title="${target}"]`
      : `.ant-picker-dropdown .ant-picker-cell[title="${target}"]`)].indexOf(wanted.element),
  };
  const dates = cells.map(cell => cell.title).filter(Boolean).sort();
  if (!dates.length) return { index: null, direction: null, visibleCellCount: 0, firstDate: null, lastDate: null };
  return {
    index: null,
    direction: target < dates[0] ? 'previous' : target > dates.at(-1) ? 'next' : null,
    visibleCellCount: dates.length,
    firstDate: dates[0],
    lastDate: dates.at(-1),
  };
}

async function chooseDateCell(page, target) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const state = await page.evaluate(dateCellState, target);
    if (Number.isInteger(state?.index)) {
      await page.click(state.selector || `.ant-picker-dropdown .ant-picker-cell[title="${target}"]`, Number.isInteger(state.clickIndex) ? { nth: state.clickIndex } : undefined);
      return;
    }
    if (state?.direction === 'previous') {
      await clickDateNavigation(page, 'previous');
    } else if (state?.direction === 'next') {
      await clickDateNavigation(page, 'next');
    } else if (state?.visibleCellCount === 0) {
      // The live picker can render its two panels one tick after the input
      // click. Keep the bounded loop alive for that transient empty state.
      if (typeof page.wait === 'function') await page.wait({ time: 0.25 }).catch(() => {});
    } else {
      throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric date cell is unavailable: ${target}`, {
        target,
        visibleCellCount: Number.isInteger(state?.visibleCellCount) ? state.visibleCellCount : 0,
        firstDate: state?.firstDate ?? null,
        lastDate: state?.lastDate ?? null,
      });
    }
  }
  throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric date navigation exceeded its safe limit: ${target}`);
}

async function ensureMultiplePlatformMode(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await page.evaluate(resolvePlatformSelector);
    if (current?.isMultiple === true) return current;
    const switchLabel = await page.evaluate(() => [...document.querySelectorAll('#QuerySearchBuilder button.switch-button')]
      .map(element => `${element.innerText || element.textContent || ''} ${element.getAttribute('aria-label') || ''}`)
      .find(value => /multiple\s+platform|nhiều\s+(?:nền\s+tảng|sàn)/i.test(value)) || null);
    if (!switchLabel) break;
    await page.click('#QuerySearchBuilder button.switch-button');
    for (let poll = 0; poll < 6; poll += 1) {
      if (typeof page.wait === 'function') await page.wait({ time: 0.25 }).catch(() => {});
      const switched = await page.evaluate(resolvePlatformSelector);
      if (switched?.isMultiple === true) {
        await gateCurrentMetricPage(page);
        return switched;
      }
    }
  }
  const verified = await page.evaluate(resolvePlatformSelector);
  if (verified?.isMultiple === true) return verified;
  throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric platform control did not switch to multiple mode');
}

async function clickDateNavigation(page, direction) {
  const selector = direction === 'previous'
    ? '.ant-picker-dropdown .ant-picker-header-prev-btn'
    : '.ant-picker-dropdown .ant-picker-header-next-btn';
  const nth = await page.evaluate(({ target, move }) => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const indices = [...document.querySelectorAll(target)].map((element, index) => ({ element, index })).filter(({ element }) => visible(element));
    return indices.length ? (move === 'next' ? indices.at(-1).index : indices[0].index) : 0;
  }, { target: selector, move: direction }).catch(() => 0);
  await page.click(selector, { nth });
}

async function applyCustomPeriod(page, period) {
  const pickerSelector = '#QuerySearchBuilder .ant-picker input';
  const pickerCount = await page.evaluate(() => document.querySelectorAll('#QuerySearchBuilder .ant-picker input').length);
  if (!Number.isInteger(pickerCount) || pickerCount < 2) throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric custom date controls are not visible');
  // Metric uses one open range picker with two month panels. Selecting the
  // start cell arms the same popup for the end cell; clicking the second input
  // reopens the range at the old end and can leave that end stale.
  await page.click(pickerSelector, { nth: 0 });
  await chooseDateCell(page, period.startDate);
  if (typeof page.wait === 'function') await page.wait({ time: 0.25 }).catch(() => {});
  const endPanel = await page.evaluate(dateCellState, period.endDate);
  if (!Number.isInteger(endPanel?.index)
    && (!Number.isInteger(endPanel?.visibleCellCount) || endPanel.visibleCellCount === 0)) {
    // Some live picker states close after committing the start. Reopen the
    // range through its end input so the committed start remains intact.
    await page.click(pickerSelector, { nth: 1 });
    if (typeof page.wait === 'function') await page.wait({ time: 0.25 }).catch(() => {});
  }
  await chooseDateCell(page, period.endDate);
  if (typeof page.wait === 'function') await page.wait({ time: 0.25 }).catch(() => {});
}

async function applyMetricSpec(page, spec, initialObservation) {
  const current = initialObservation.appliedFilters || {};
  const currentPlatforms = new Set(canonicalValues(current.platforms)); const wantedPlatforms = new Set(canonicalValues(spec.platforms));
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
    platformSelector = await ensureMultiplePlatformMode(page);
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
  const platformOptionLabel = platform => platform === 'tiktok' ? 'Tiktok' : platform === 'shopee' ? 'Shopee' : platform;
  if (platformSelector.isMultiple === true) {
    for (const platform of [...wantedPlatforms].filter(value => !currentPlatforms.has(value))) {
      await page.click(platformSelector.selectSelector);
      await clickVisibleOption(page, platformOptionLabel(platform), { skipSelected: true });
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
    for (const platform of [...wantedPlatforms].filter(value => !currentPlatforms.has(value))) await clickVisibleOption(page, platformOptionLabel(platform));
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
      const label = [...document.querySelectorAll('#QuerySearchBuilder .filter-label, #QuerySearchBuilder .filter-label .label')]
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
  if (!periodAlreadyApplied) {
    let presetMatched = false;
    if (spec.period.preset) {
      const periodSelector = await page.evaluate(() => {
        const visible = element => {
          if (!element) return false;
          const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const textOf = element => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
        const label = [...document.querySelectorAll('#QuerySearchBuilder .filter-label, #QuerySearchBuilder .filter-label .label')]
          .find(element => /^(?:time period|thời gian)/i.test(textOf(element)));
        const container = label?.closest('.ant-space-item');
        const select = [...(container?.querySelectorAll('.ant-select') || [])].find(visible);
        const input = select?.querySelector('input[id]');
        return input?.id ? `#${CSS.escape(input.id)}` : null;
      });
      if (periodSelector == null) throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric period select is not visible');
      await page.click(periodSelector);
      if (await clickPeriodPresetIfPresent(page, spec.period.preset)) {
        const displayed = await page.evaluate(readDisplayedPeriod);
        presetMatched = displayed?.startDate === spec.period.startDate && displayed?.endDate === spec.period.endDate;
      }
    }
    if (!presetMatched) await applyCustomPeriod(page, spec.period);
    const displayed = await page.evaluate(readDisplayedPeriod);
    if (!displayed || displayed.startDate !== spec.period.startDate || displayed.endDate !== spec.period.endDate) {
      throw new MetricAdapterError('METRIC_FILTER_MISMATCH', 'Metric displayed date range does not match the query spec', {
        expected: { startDate: spec.period.startDate, endDate: spec.period.endDate },
        displayed,
      });
    }
  }
  if (spec.smartQuery !== undefined) await setCheckbox(page, 'Smart query', Boolean(spec.smartQuery));
  if (spec.aiNormalisation !== undefined) await setCheckbox(page, 'AI chuẩn hoá dữ liệu', Boolean(spec.aiNormalisation));
  for (const [label, value] of Object.entries(spec.usefulFilters || {})) {
    const names = { fake: 'Filter fake/abnormal products', gifts: 'Exclude gifts', deleted: 'Exclude deleted products' };
    if (names[label]) await setCheckbox(page, names[label], Boolean(value));
  }
}

function createNetworkState() {
  return { nextResponseOrder: 0, all: [], seenResponseKeys: new Set() };
}

function networkResponseKey(response) {
  const eventId = response?.eventId ?? response?.responseId ?? response?.requestId;
  if (eventId != null) return `event:${String(eventId)}`;
  const fields = ['url', 'urlPath', 'path', 'method', 'status', 'responseStatus', 'body', 'response', 'responsePreview', 'requestBody', 'requestBodyPreview', 'request', 'requestUrl'];
  return `body:${JSON.stringify(Object.fromEntries(fields.filter(field => response?.[field] !== undefined).map(field => [field, response[field]])))}`;
}

async function readNetworkChunk(page, networkState) {
  if (typeof page.readNetworkCapture !== 'function') return [];
  const raw = await page.readNetworkCapture();
  const entries = Array.isArray(raw) ? raw : [];
  const chunk = entries.flatMap(response => {
    const key = networkResponseKey(response);
    if (networkState.seenResponseKeys?.has(key)) return [];
    networkState.seenResponseKeys?.add(key);
    const suppliedOrder = Number.isSafeInteger(response?.responseOrder) ? response.responseOrder : networkState.nextResponseOrder;
    networkState.nextResponseOrder = Math.max(networkState.nextResponseOrder, suppliedOrder + 1);
    return [{ ...response, responseOrder: suppliedOrder }];
  });
  networkState.all.push(...chunk);
  return chunk;
}

async function waitForSearchApplied(page, spec, networkState, baselineResponseOrder, platformMap, submitClickedAt, descriptor) {
  let lastError = null;
  const deadline = Date.now() + NETWORK_WAIT_TIMEOUT_MS;
  while (Date.now() <= deadline) {
    await readNetworkChunk(page, networkState);
    try {
      const gate = assertSearchAppliedGate({ responses: networkState.all, spec, baselineResponseOrder, platformMap });
      const resultRegionVisible = await page.evaluate(selector => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      }, '#main-content #analytic-tab').catch(() => false);
      if (resultRegionVisible) {
        return {
          ...gate,
          clickedAt: submitClickedAt,
          submitDescriptor: descriptor,
          baselineResponseOrder,
          responseOrder: {
            searchBasic: gate.searchBasicResponseOrder,
            products: gate.productsResponseOrders,
            shops: gate.shopsResponseOrders,
          },
          platformMap,
        };
      }
      lastError = new MetricAdapterError('METRIC_SEARCH_NOT_APPLIED', 'Metric result region did not become visible after the applied search responses', {
        missingResponses: [], resultRegionVisible: false, baselineResponseOrder,
        searchBasicResponseOrder: gate.searchBasicResponseOrder,
        productsResponseOrders: gate.productsResponseOrders, shopsResponseOrders: gate.shopsResponseOrders,
      });
    } catch (error) {
      lastError = error;
      // A new search-basic response with a wrong platform set is conclusive;
      // waiting longer cannot repair a search that was submitted incorrectly.
      if (error?.details?.searchBasicResponseOrder !== undefined
        && Array.isArray(error?.details?.missingResponses) && error.details.missingResponses.length === 0) throw error;
    }
    if (typeof page.wait === 'function') await page.wait({ time: NETWORK_POLL_SECONDS }).catch(() => {});
  }
  if (lastError) throw lastError;
  assertSearchAppliedGate({ responses: networkState.all, spec, baselineResponseOrder, platformMap });
}

async function performSearch(page, spec, debug = null) {
  const networkState = createNetworkState();
  const searchGate = { clickResult: null, clickedAt: null };
  try {
    await prepareMetricForm(page, spec);
    const platformLabels = await readMetricPlatformOptionLabels(page);
    const { descriptor, preflight } = await prepareSearchSubmit(page);
    Object.assign(searchGate, { submitDescriptor: descriptor, preflight });
    await readNetworkChunk(page, networkState);
    const platformMap = buildMetricPlatformMap(networkState.all, platformLabels);
    if (!spec.platforms.every(platform => Object.values(platformMap.byId || {}).includes(platform))) {
      throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric platform ids could not be mapped from the live platform list', { platformMap });
    }
    if (debug) await debug.record(page, await page.evaluate(observeResultPage), 'submit-before', 0);
    // Masking/screenshot actions may alter focus/scroll; repeat the same preconditions.
    await prepareSearchSubmit(page);
    const baselineResponseOrder = networkState.nextResponseOrder - 1;
    Object.assign(searchGate, { baselineResponseOrder, platformMap, clickedAt: new Date().toISOString() });
    let clickError = null;
    try {
      searchGate.clickResult = await page.click(descriptor.clickSelector);
      if (searchGate.clickResult?.click_method !== 'cdp' || searchGate.clickResult?.hit !== 'target') {
        throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric submit did not prove a native target click', { clickResult: searchGate.clickResult });
      }
    } catch (error) { clickError = error; }
    for (const seconds of [3, 15]) {
      const remaining = seconds - (Date.now() - Date.parse(searchGate.clickedAt)) / 1000;
      if (remaining > 0) await page.wait({ time: remaining });
      await readNetworkChunk(page, networkState);
      if (debug) {
        await debug.record(page, await page.evaluate(observeResultPage), `submit-after-${seconds}s`, 0);
        await debug.update(networkState.all, { searchGate });
      }
      await readObservation(page, { includeResults: false });
    }
    if (clickError) throw clickError;
    Object.assign(searchGate, await waitForSearchApplied(page, spec, networkState, baselineResponseOrder, platformMap, searchGate.clickedAt, descriptor));
    const observation = await readObservation(page, { includeResults: true });
    return Object.assign(observation, { searchGate, networkState });
  } catch (error) {
    await readNetworkChunk(page, networkState).catch(() => {});
    if (debug && !searchGate.clickedAt) await debug.record(page, await page.evaluate(observeResultPage), 'submit-precondition-failure', 0).catch(() => {});
    error.networkState = networkState;
    error.searchGate = searchGate;
    throw error;
  }
}

async function runDryRun(page, spec) {
  let startState = null;
  let appliedReadBack = null;
  let submitDescriptor = null;
  let pageWideAnalyticsCount = null;
  let preflight = null;
  try {
    const prepared = await prepareMetricForm(page, spec, before => { startState = formState(before.appliedFilters); });
    appliedReadBack = prepared.ready.appliedFilters ?? null;
    const preparedSubmit = await prepareSearchSubmit(page);
    const { inspection } = preparedSubmit;
    preflight = preparedSubmit.preflight;
    pageWideAnalyticsCount = Number(inspection?.pageWideAnalyticsCount) || 0;
    submitDescriptor = inspection?.descriptor || null;
    const descriptor = assertSearchSubmitInspection(inspection);
    return { outcome: 'DRY_RUN_OK', preflight, startState, appliedReadBack, submitDescriptor: descriptor, pageWideAnalyticsCount, mismatches: [] };
  } catch (error) {
    const details = error?.details && typeof error.details === 'object' ? error.details : {};
    const safeDetails = Object.fromEntries(Object.entries(details).filter(([key]) => [
      'expected', 'displayed', 'target', 'visibleCellCount', 'firstDate', 'lastDate', 'locatedBy', 'chipCount', 'inputFound', 'inputValueMatchesExpected', 'committedMatchesExpected', 'warningMatches', 'observedPeriod', 'requestedPeriod', 'candidateCount', 'candidates', 'pageWideAnalyticsCount', 'preflight',
    ].includes(key)));
    return {
      outcome: typeof error?.code === 'string' ? error.code : 'METRIC_UI_CHANGED',
      startState,
      appliedReadBack,
      ...(submitDescriptor ? { submitDescriptor } : {}),
      ...(pageWideAnalyticsCount !== null ? { pageWideAnalyticsCount } : {}),
      ...(preflight ? { preflight } : {}),
      mismatches: Array.isArray(details.mismatches) ? details.mismatches : [{
        field: '$error',
        code: typeof error?.code === 'string' ? error.code : 'METRIC_UI_CHANGED',
        message: String(error?.message ?? 'dry-run failed').replace(/\s+/g, ' ').slice(0, 200),
        ...(Object.keys(safeDetails).length ? { details: safeDetails } : {}),
      }],
    };
  }
}

async function runSearch(page, spec, maxRows, debug = null) {
  const observation = await performSearch(page, spec, debug);
  return { observation, parsed: parseSearchObservation(observation, spec, maxRows), searchGate: observation.searchGate, networkState: observation.networkState };
}

function hashBytes(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function fileEntry(role, path, mediaType) {
  const bytes = await readFile(path); const details = await stat(path);
  return { role, path: basename(path), mediaType, byteSize: details.size, sha256: hashBytes(bytes) };
}

function observeResultPage() {
  const visible = element => {
    if (!element) return false;
    const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const textOf = element => (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
  const parseJson = value => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
  const normalise = value => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
  const findTitleRegion = title => [...document.querySelectorAll('.statistic-item')].find(element => {
    const heading = element.querySelector('.statistic-item__title');
    return visible(element) && normalise(heading?.innerText || heading?.textContent) === normalise(title);
  });
  const selectors = {
    overview: '[data-metric-region="overview"], [data-region="overview"], [data-testid="market-overview"], .market-overview-section, .market-overview',
    'platform-split': '[data-metric-region="platform-split"], [data-region="platform-split"], [data-testid="platform-split"], .platforms-table .platform-table, .platforms-table, .main-statistic',
    monthly: '[data-metric-region="monthly"], [data-region="monthly"], [data-testid="monthly-trend"], #growth-detail-chart',
    category: '[data-metric-region="category"], [data-region="category"], [data-testid="category-chart"]',
    price: '[data-metric-region="price"], [data-region="price"], [data-testid="price-chart"]',
    'top10-brand': '[data-metric-region="top10-brand"], [data-region="top10-brand"], [data-testid="top10-brand"]',
    'top10-shop': '[data-metric-region="top10-shop"], [data-region="top10-shop"], [data-testid="top10-shop"]',
    'brand-shop-type': '[data-metric-region="brand-shop-type"], [data-region="brand-shop-type"], [data-testid="brand-shop-type"]',
    'shop-type': '[data-metric-region="shop-type"], [data-region="shop-type"], [data-testid="shop-type"]',
    warehouse: '[data-metric-region="warehouse"], [data-region="warehouse"], [data-testid="warehouse"]',
    'top-products': '[data-metric-region="top-products"], [data-region="top-products"], [data-testid="top-products"], .products-list-container, .ProductTable',
    'top-shops': '[data-metric-region="top-shops"], [data-region="top-shops"], [data-testid="top-shops"], .shop-list-container, .ShopTable',
    'top-brands': '[data-metric-region="top-brands"], [data-region="top-brands"], [data-testid="top-brands"], .brand-list-container, .BrandTable',
    'detail-history': '[data-metric-region="detail-history"], [data-region="detail-history"], [data-testid="detail-history"]',
  };
  const titleNames = {
    category: 'Category', price: 'Price range', 'top10-brand': 'Top 10 Brands', 'top10-shop': 'Top 10 Shops',
    'brand-shop-type': 'Top 10 brand by shop type', 'shop-type': 'Shop type',
    'top-products': 'Top Products', 'top-shops': 'Top Shops', 'top-brands': 'Top Brands',
  };
  const platformFromIcon = row => {
    const knownPlatform = icon => {
      const marker = normalise(`${icon.getAttribute('alt') || ''} ${icon.getAttribute('src') || ''}`);
      if (marker.includes('shopee')) return 'shopee';
      if (marker.includes('tiktok')) return 'tiktok';
      return null;
    };
    // Platform-specific selectors have precedence over every generic image.
    const preferred = [...(row?.querySelectorAll('img.img-platform, .shop-platform-icon img') || [])]
      .map(knownPlatform).find(Boolean);
    if (preferred) return preferred;
    // A generic image is usable only when its own alt/src identifies a known
    // platform; unrelated images must never win by document order.
    return [...(row?.querySelectorAll('img[alt]') || [])].map(knownPlatform).find(Boolean) || null;
  };
  const canonicalHeader = (value, index) => {
    const header = normalise(value);
    if (/^platform$/.test(header)) return 'platform';
    if (/^product$/.test(header)) return 'name';
    if (/^shop(?: name)?$/.test(header)) return 'shop';
    if (/^brand name$/.test(header)) return 'brand';
    if (/^brand$/.test(header)) return 'brand';
    if (/^category$/.test(header)) return 'category';
    if (/^price$|^avg price$/.test(header)) return 'price';
    if (/^revenue$/.test(header)) return 'revenue';
    if (/^sold products$|^units$/.test(header)) return 'units';
    if (/price in product variant/.test(header)) return 'minPrice';
    if (/revenue in time period/.test(header)) return 'revenue';
    if (/sold products in time period|units sold/.test(header)) return 'units';
    if (/^total revenue$/.test(header)) return 'lifetimeRevenue';
    if (/^total sales$/.test(header)) return 'lifetimeUnits';
    if (/number of products with sales/.test(header)) return 'listings';
    if (/^hạng$|^rank/.test(header)) return 'rankNew';
    if (/top brands/.test(header)) return 'brand';
    if (/created date/.test(header)) return 'createdDate';
    return `column${index + 1}`;
  };
  const tableData = (element, regionName = '') => {
    const headerTable = element?.querySelector('.ant-table-header table') || element?.querySelector('table');
    const bodyTable = element?.querySelector('.ant-table-body table') || headerTable;
    if (!headerTable || !bodyTable) return null;
    const rawHeaders = [...headerTable.querySelectorAll('thead th')].map(textOf);
    const headers = rawHeaders.map(canonicalHeader);
    const rows = [...bodyTable.querySelectorAll('tbody tr')].map(row => {
      const cells = [...row.querySelectorAll('td')].map(textOf);
      const values = Object.fromEntries(cells.map((value, index) => [headers[index] || `column${index + 1}`, value]));
      const iconPlatform = platformFromIcon(row);
      if (iconPlatform) values.platform = iconPlatform;
      else if (regionName === 'top-products' || regionName === 'top-shops') values.platform = 'unknown';
      return values;
    });
    return { columns: headers, rows };
  };
  const kpiData = element => {
    const kpi = {};
    const cards = [...element.querySelectorAll('.statistic-card')];
    if (cards.length) {
      for (const card of cards) {
        const classes = String(card.className || '').toLowerCase();
        const value = textOf(card.querySelector('.statistic-card__value') || card.lastElementChild || card);
        if (/statistic-card--revenue/.test(classes)) kpi.revenue = { displayed: value, label: 'Revenue' };
        else if (/statistic-card--order/.test(classes)) kpi.units = { displayed: value, label: 'Units' };
        else if (/statistic-card--product/.test(classes)) kpi.soldListings = { displayed: value, label: 'Sold listings' };
        else if (/statistic-card--shop/.test(classes)) kpi.shops = { displayed: value, label: 'Shops' };
      }
      return kpi;
    }
    for (const card of [...element.querySelectorAll('.statistic-item')]) {
      const title = normalise(card.querySelector('.statistic-item__title')?.textContent || card.getAttribute('title'));
      const value = textOf(card.querySelector('.statistic-card__value'));
      if (!title) continue;
      if (/revenue/.test(title)) kpi.revenue = { displayed: value, label: 'Revenue' };
      else if (/units sold|sold products/.test(title)) kpi.units = { displayed: value, label: 'Units' };
      else if (/^products?$/.test(title)) kpi.soldListings = { displayed: value, label: 'Sold listings' };
      else if (/^shops?$/.test(title)) kpi.shops = { displayed: value, label: 'Shops' };
    }
    return kpi;
  };
  const regions = {};
  const screenshotRegions = {};
  const regionsHtml = {};
  for (const [name, selector] of Object.entries(selectors)) {
    const titleElement = titleNames[name] ? findTitleRegion(titleNames[name]) : null;
    const element = titleElement || [...document.querySelectorAll(selector)].find(visible);
    if (!element) continue;
    const json = parseJson(element.getAttribute('data-metric-json'));
    const table = tableData(element, name);
    let payload = json && typeof json === 'object' ? json : table || { text: textOf(element) };
    if (name === 'overview' && !json) payload = { kpi: kpiData(element), text: textOf(element) };
    if (name === 'monthly' && !json && !table) payload = { unavailable: true, reason: 'DOM_CHART_DATA_UNAVAILABLE', text: textOf(element) };
    regions[name] = { ...payload, selector };
    screenshotRegions[name] = selector;
    regionsHtml[name] = element.outerHTML;
  }
  const platformChart = document.querySelector('.platforms-chart');
  if (platformChart && visible(platformChart)) {
    regions['platform-chart'] = { text: textOf(platformChart), selector: '.platforms-chart' };
    screenshotRegions['platform-chart'] = '.platforms-chart';
    regionsHtml['platform-chart'] = platformChart.outerHTML;
  }
  const topProductsElement = findTitleRegion('Top Products') || [...document.querySelectorAll(selectors['top-products'])].find(visible);
  const paginationElement = topProductsElement?.querySelector('.ant-pagination,[data-metric-pagination]') || [...document.querySelectorAll('[data-metric-pagination]')].find(visible);
  const totalText = paginationElement ? textOf(paginationElement) : '';
  // The page-number <ul> is a sibling of the total label. In DOM replay its
  // text can be concatenated without whitespace (`...of 2` + `1`), so parse
  // a label/span first and only fall back to the whole pager when needed.
  const totalLabel = paginationElement
    ? [...paginationElement.querySelectorAll('.ant-pagination-total-text,[class*="total" i],span')]
      .map(textOf)
      .find(value => /\d[\d.,\s]*\s*(?:-|–|to)\s*\d[\d.,\s]*\s*(?:of|trên|total)\s*\d[\d.,\s]*/i.test(value)
        || /(?:of|trên|total)\s+\d[\d.,\s]*/i.test(value)) || totalText
    : '';
  const totalMatch = totalLabel.match(/(?:of|trên|total)\s+(\d[\d.,\s]*)/i);
  const current = Number(paginationElement?.querySelector('.ant-pagination-item-active')?.textContent || 1);
  const pageSizeMatch = totalText.match(/(\d+)\s+(?:products?|sản phẩm)\s*\/\s*page/i);
  const next = paginationElement?.querySelector('li.ant-pagination-next .ant-pagination-item-link, li.ant-pagination-next button, [aria-label="Next Page"]');
  const nextItem = paginationElement?.querySelector('li.ant-pagination-next');
  if (paginationElement) regions['top-products'] = {
    ...(regions['top-products'] || {}), pagination: {
      page: current, total: totalMatch ? Number(totalMatch[1].replace(/[.,\s]/g, '')) : null,
      pageSize: pageSizeMatch ? Number(pageSizeMatch[1]) : regions['top-products']?.items?.length || regions['top-products']?.rows?.length || null,
      nextAvailable: Boolean(next && !next.disabled && next.getAttribute('aria-disabled') !== 'true' && !nextItem?.classList.contains('ant-pagination-disabled') && nextItem?.getAttribute('aria-disabled') !== 'true'),
      nextSelector: 'li.ant-pagination-next .ant-pagination-item-link',
    },
  };
  const mainStatisticButtons = [...document.querySelectorAll('.main-statistic button')].filter(visible);
  const resultToggles = mainStatisticButtons.map(button => textOf(button)).filter(Boolean);
  const currentToggle = mainStatisticButtons.find(button => button.getAttribute('aria-pressed') === 'true' || button.classList.contains('ant-btn-primary') || button.classList.contains('active'));
  const platformViews = [...document.querySelectorAll('[data-metric-platform-view],[data-platform-view]')]
    .filter(visible).map((element, index) => ({ label: textOf(element), selected: element.getAttribute('aria-selected') === 'true' || element.classList.contains('active'), selector: '[data-metric-platform-view],[data-platform-view]', index }));
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
  const restrictionPhraseInPage = value => {
    const normalised = normaliseMetricTextInPage(value);
    const stripped = stripMetricDiacriticsInPage(normalised);
    const patterns = [
      /access\s+denied|denied\s+access|unauthorized|forbidden|blocked|limit\s+(?:reached|exceeded)|(?:reached|exceeded)\s+limit|session\s+expired|suspended/i,
      /quyền\s+truy\s+cập\s+bị\s+từ\s+chối|không\s+có\s+quyền|tài\s+khoản\s+bị\s+(?:tạm\s+)?khóa|tạm\s+thời\s+không\s+khả\s+dụng|phiên\s+đăng\s+nhập\s+đã\s+hết\s+hạn|hết\s+phiên|giới\s+hạn|hết\s+lượt|vượt\s+quá/i,
    ];
    for (const text of [normalised, stripped]) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[0];
      }
      const words = metricWordsInPage(text);
      for (const group of [['quyen', 'truy', 'cap', 'bi', 'tu', 'choi'], ['gioi', 'han'], ['het', 'luot'], ['vuot', 'qua'], ['phien', 'dang', 'nhap', 'het', 'han'], ['het', 'phien'], ['tai', 'khoan', 'bi', 'khoa'], ['tai', 'khoan', 'tam', 'khoa'], ['khong', 'co', 'quyen'], ['tam', 'thoi', 'khong', 'kha', 'dung']]) {
        if (group.every(word => words.has(word))) return group.join(' ');
      }
    }
    return null;
  };
  const isBareWarningInPage = value => {
    const normalised = stripMetricDiacriticsInPage(value);
    return normalised === 'warning' || normalised === 'canh bao';
  };
  const warningScopeRoots = [...document.querySelectorAll('[role="alert"],[role="dialog"],[aria-live="assertive"],[aria-live="polite"],.ant-alert,.ant-message,.ant-message-notice,.ant-notification,.ant-notification-notice,.ant-modal,.ant-modal-root,[class*="toast" i],[class*="banner" i]')]
    .filter(visible);
  const isHeaderOrAccount = element => {
    const marker = `${element?.tagName || ''} ${element?.id || ''} ${typeof element?.className === 'string' ? element.className : ''}`;
    return Boolean(element?.closest?.('header,#header,[class*="header" i],[class*="account" i],[class*="profile" i],[class*="avatar" i],[class*="user" i]'))
      || /header|account|profile|avatar|nickname|shop[-_ ]?owner|user[-_ ]?(?:info|widget|menu)?/i.test(marker);
  };
  const semanticWarningRoot = element => element?.matches?.('[role="alert"],[role="dialog"],[aria-live="assertive"],[aria-live="polite"],.ant-alert,.ant-message,.ant-message-notice,.ant-notification,.ant-notification-notice,.ant-modal,.ant-modal-root,[class*="toast" i],[class*="banner" i]');
  const inWarningScope = element => warningScopeRoots.some(root => (root === element || root.contains(element))
    && (semanticWarningRoot(root) || !isHeaderOrAccount(element)));
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
  const redactDiagnosticTextInPage = (value, element) => {
    if (isHeaderOrAccount(element)) return '[redacted-header-alert]';
    return String(value ?? '').normalize('NFC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?<!\w)\+?\d[\d\s().-]{5,}\d(?!\w)/g, '[redacted-phone]')
    .replace(/\d/g, '#').slice(0, 80);
  };
  const sample = (value, max = 80) => String(value ?? '').replace(/\d/g, '#').slice(0, max);
  const describeWarning = (element, via, reason, causesFailure) => {
    const text = textOf(element);
    const base = {
      via, tag: String(element?.tagName || 'unknown').toLowerCase(), role: element?.getAttribute?.('role') || null,
      classSample: sample(classOf(element)), reason,
    };
    return causesFailure ? {
      ...base,
      phrase: restrictionPhraseInPage(text) || (isBareWarningInPage(text) ? stripMetricDiacriticsInPage(text) : null),
      text: redactDiagnosticTextInPage(text, element),
    } : { ...base, phrase: null, text: null };
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
    resultToggles, currentToggle: textOf(currentToggle),
    snapshot: window.__metricWebSnapshot || window.__METRIC_WEB_SNAPSHOT__ || null,
  };
}

async function waitForMatchingResult(page, networkState, baselineResponseOrder, paths, regionSelector) {
  const wantedPaths = (Array.isArray(paths) ? paths : [paths]).map(path => String(path).replace(/\/$/, ''));
  const deadline = Date.now() + NETWORK_WAIT_TIMEOUT_MS;
  let lastChunk = [];
  while (Date.now() <= deadline) {
    lastChunk = await readNetworkChunk(page, networkState);
    const responseSeen = networkState.all.some((response, index) => {
      const order = Number.isSafeInteger(response?.responseOrder) ? response.responseOrder : index;
      let path = String(response?.urlPath || response?.path || response?.url || '').split('?')[0].replace(/\/$/, '');
      try { path = new URL(path, BASE_URL).pathname.replace(/\/$/, ''); } catch { /* keep the path sample */ }
      return order > baselineResponseOrder && wantedPaths.includes(path);
    });
    const regionVisible = await page.evaluate(selector => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }, regionSelector).catch(() => false);
    if (responseSeen && regionVisible) return lastChunk;
    if (typeof page.wait === 'function') await page.wait({ time: NETWORK_POLL_SECONDS }).catch(() => {});
  }
  const error = new MetricAdapterError('METRIC_SEARCH_NOT_APPLIED', 'Metric result network response or visible result region was not observed after the UI change', {
    missingResponses: wantedPaths, baselineResponseOrder, regionSelector,
    responseOrdersSeen: networkState.all.map((response, index) => Number.isSafeInteger(response?.responseOrder) ? response.responseOrder : index),
  });
  throw error;
}

async function gateCurrentMetricPage(page) {
  const observation = await page.evaluate(observeMetricPage, false);
  gateMetricPage(observation);
  return observation;
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

async function readResultPage(page, { debug = null, viewPlatform = 'all', pageNumber = 1, networkState = null } = {}) {
  // The gate is deliberately a separate page evaluation. This keeps redirects,
  // login/captcha screens and warnings out of both DOM and network archives.
  const before = await page.evaluate(observeMetricPage, false);
  gateMetricPage(before);
  const dom = await page.evaluate(observeResultPage);
  // Persist the result DOM before the second page gate, network read, or any
  // downstream extraction can fail. The debug copy is sanitized at rest.
  if (debug) await debug.record(page, dom, viewPlatform, pageNumber);
  gateMetricPage({ ...before, ...dom, url: dom.url || before.url, metricRootVisible: dom.metricRootVisible ?? before.metricRootVisible });
  await gateCurrentMetricPage(page);
  const responses = networkState ? await readNetworkChunk(page, networkState)
    : typeof page.readNetworkCapture === 'function' ? await page.readNetworkCapture() : [];
  return { dom, responses: Array.isArray(responses) ? responses : [] };
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

function resultToggleIndex(wanted) {
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const target = clean(wanted);
  const visible = element => {
    if (!element) return false;
    const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  return [...document.querySelectorAll('.main-statistic button')].filter(visible)
    .findIndex(button => clean(button.innerText || button.textContent) === target);
}

async function clickResultToggle(page, wanted, networkState) {
  const index = await page.evaluate(resultToggleIndex, wanted);
  if (!Number.isInteger(index) || index < 0) throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric result toggle is missing: ${wanted}`);
  const baselineResponseOrder = networkState.nextResponseOrder - 1;
  await page.click('#main-content #analytic-tab .main-statistic button', { nth: index });
  await gateCurrentMetricPage(page);
  await waitForMatchingResult(page, networkState, baselineResponseOrder, '/v2/market/analytics/search-basic/', '#main-content #analytic-tab');
  await gateCurrentMetricPage(page);
}

function mergePlatformUnits(revenueDom, soldDom) {
  const revenue = revenueDom?.regions?.['platform-split'];
  const sold = soldDom?.regions?.['platform-split'];
  if (!revenue || !sold || !Array.isArray(revenue.rows) || !Array.isArray(sold.rows)) return revenueDom;
  const key = row => String(row?.platform ?? '').normalize('NFC').trim().toLowerCase();
  const units = new Map(sold.rows.map(row => [key(row), row.units]).filter(([platform, value]) => platform && value != null));
  if (!units.size) return revenueDom;
  return {
    ...revenueDom,
    regions: {
      ...revenueDom.regions,
      'platform-split': { ...revenue, rows: revenue.rows.map(row => units.has(key(row)) ? { ...row, units: units.get(key(row)) } : row) },
    },
  };
}

async function collectResultPages(page, productCap, initial = null, viewPlatform = 'all', screenshotDir = null, seenScreenshots = new Set(), screenshots = [], screenshotSkips = [], debug = null, networkState = createNetworkState()) {
  const responses = []; const domSnapshots = []; const seenPages = new Set(); const seenRows = new Set();
  let lastDom = null; let pagesRead = 0;
  for (let iteration = 0; iteration < PAGE_CAP; iteration += 1) {
    const current = initial || await readResultPage(page, { debug, viewPlatform, pageNumber: pagesRead + 1, networkState }); initial = null;
    const productRegion = current.dom.regions?.['top-products'] || {};
    const items = productRegion.items || productRegion.rows || [];
    const pageNumber = current.dom.pagination?.page ?? iteration + 1;
    const itemKey = `${pageNumber}:${JSON.stringify(items[0] ?? null)}`;
    if (seenPages.has(itemKey)) break;
    seenPages.add(itemKey);
    const uniqueItems = items.filter(item => {
      const key = JSON.stringify(item);
      if (seenRows.has(key)) return false;
      seenRows.add(key);
      return true;
    });
    const dom = { ...current.dom, observedInView: viewPlatform, regions: { ...current.dom.regions } };
    if (current.dom.regions?.['top-products']) {
      const region = current.dom.regions['top-products'];
      dom.regions['top-products'] = { ...region, ...(Array.isArray(region.items) ? { items: uniqueItems } : { rows: uniqueItems }) };
    }
    lastDom = dom; pagesRead += 1;
    responses.push(...current.responses.map(response => ({ ...response, viewPlatform })));
    domSnapshots.push(dom);
    if (screenshotDir) await saveViewRegionScreenshots(page, dom, screenshotDir, viewPlatform, seenScreenshots, screenshots, screenshotSkips);
    const pagination = dom.pagination;
    const observedRows = domSnapshots.reduce((sum, snapshot) => {
      const region = snapshot.regions?.['top-products'] || {};
      return sum + (region.items?.length || region.rows?.length || 0);
    }, 0);
    if (!pagination?.nextAvailable || observedRows >= productCap) break;
    if (!pagination.nextSelector || typeof page.click !== 'function') break;
    const baselineResponseOrder = networkState.nextResponseOrder - 1;
    await page.click(pagination.nextSelector, { nth: 0 });
    await gateCurrentMetricPage(page);
    await waitForMatchingResult(page, networkState, baselineResponseOrder, '/v2/market/analytics/products/', '#main-content #analytic-tab');
    await gateCurrentMetricPage(page);
  }
  return { responses, domSnapshots, lastDom, pagesRead, screenshots, screenshotSkips };
}

async function collectResults(page, spec, productCap, screenshotDir, debug = null, networkState = createNetworkState()) {
  await gateCurrentMetricPage(page);
  let first = await readResultPage(page, { debug, viewPlatform: 'all', pageNumber: 1, networkState });
  const resultToggles = Array.isArray(first.dom.resultToggles) ? first.dom.resultToggles : [];
  const hasRevenueToggle = resultToggles.some(label => /^revenue$/i.test(String(label).trim()));
  const hasSoldToggle = resultToggles.some(label => /sold products/i.test(label));
  if (hasRevenueToggle && !/^revenue$/i.test(String(first.dom.currentToggle || '').trim())) {
    await clickResultToggle(page, 'Revenue', networkState);
    first = await readResultPage(page, { debug, viewPlatform: 'all', pageNumber: 1, networkState });
  }
  const platformRegion = first.dom.regions?.['platform-split'];
  const platformRows = platformRegion?.rows || platformRegion?.items || [];
  if (hasRevenueToggle && hasSoldToggle && platformRows.length && !platformRows.some(row => row.units != null)) {
    let sold;
    try {
      await clickResultToggle(page, 'Sold products', networkState);
      sold = await readResultPage(page, { debug, viewPlatform: 'sold-products', pageNumber: 1, networkState });
    } finally {
      await clickResultToggle(page, 'Revenue', networkState);
    }
    const restored = await readResultPage(page, { debug, viewPlatform: 'all', pageNumber: 1, networkState });
    first = { ...restored, dom: mergePlatformUnits(restored.dom, sold?.dom) };
  }
  const screenshots = []; const screenshotSkips = []; const seenScreenshots = new Set();
  const batches = [{ platform: 'all', ...(await collectResultPages(page, productCap, first, 'all', screenshotDir, seenScreenshots, screenshots, screenshotSkips, debug, networkState)) }];
  const responses = [...new Map(networkState.all.map(response => [JSON.stringify([response.url, response.urlPath, response.responsePreview, response.body, response.status, response.responseOrder]), response])).values()];
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

function withDebugFolder(error, debugDir) {
  const code = typeof error?.code === 'string' ? error.code : 'METRIC_UI_CHANGED';
  const details = error?.details && typeof error.details === 'object' ? { ...error.details, debugDir } : { debugDir };
  const message = String(error?.message ?? error).replace(/; debug folder: .*$/i, '');
  return new MetricAdapterError(code, `${message}; debug folder: ${debugDir}`, details);
}

async function archiveCollectedResults(out, spec, parsed, productCap, collected, { captureId, specDigest, capturedAt, platformIdMap = null, captureGate = { cleared: false, status: 'REPLAY' } } = {}) {
  const destination = ensureExternalCapturePath(out);
  const scope = { ...parsed.appliedFilters, ticks: parsed.appliedFilters.ticks || [], advancedFilters: parsed.appliedFilters.advancedFilters || [], exclusions: parsed.appliedFilters.exclusions || [] };
  const baseline = Number.isSafeInteger(collected.baselineResponseOrder) ? collected.baselineResponseOrder : -1;
  const archiveResponses = collected.responses.filter((response, index) => (Number.isSafeInteger(response?.responseOrder) ? response.responseOrder : index) > baseline);
  const extracted = extractResultsPage({ responses: archiveResponses.length ? archiveResponses : collected.responses, dom: collected.domSnapshots, scope, captureId, specDigest, capturedAt, pageCap: productCap, platformIdMap });
  await mkdir(destination, { recursive: true });
  const rawPath = join(destination, 'raw-responses.json'); await writeJson(rawPath, sanitizeNetworkResponses(collected.responses));
  const htmlPath = join(destination, 'results.html');
  const regionHtml = collected.domSnapshots.flatMap(snapshot => Object.values(snapshot?.regionsHtml || {})).filter(Boolean);
  const html = regionHtml.length ? `<main data-metric-archive="results">${regionHtml.join('\n')}</main>` : collected.domSnapshots.map(snapshot => snapshot?.html).filter(Boolean).join('\n');
  await writeFile(htmlPath, sanitizeResultsHtml(html), 'utf8');
  const snapshotPath = join(destination, 'snapshot.json'); await writeJson(snapshotPath, extracted.snapshot);
  const screenshotFiles = [];
  for (const screenshot of collected.screenshots || []) {
    const targetPath = join(destination, basename(screenshot.path));
    await copyFile(screenshot.path, targetPath);
    screenshotFiles.push(await fileEntry(`screenshot:${screenshot.platform}:${screenshot.region}`, targetPath, 'image/png'));
  }
  const files = [await fileEntry('raw-responses', rawPath, 'application/json'), await fileEntry('snapshot', snapshotPath, 'application/json'), await fileEntry('results-html', htmlPath, 'text/html'), ...screenshotFiles];
  const manifest = {
    contractVersion: 'metric-results-capture-v1', captureId, specDigest, appliedFilters: scope, resultCount: parsed.rowCount,
    productPagination: extracted.pagination.W12_topProducts, views: collected.views, sourceMap: extracted.sourceMap, metricDataVersion: extracted.chartSeries?.contractVersion || 'metric-results-data-v2', chartSeries: extracted.chartSeries || { contractVersion: 'metric-results-data-v2', series: [], trendOffered: false, trendNote: 'not offered by the source' }, files,
    screenshotSkips: collected.screenshotSkips || [],
    archive: { rawResponses: 'raw-responses.json', normalizedSnapshot: 'snapshot.json', resultsHtml: 'results.html', screenshots: screenshotFiles.map(file => file.path) },
    noReportFileRequested: true,
    // Only a live capture that passed the search gate is cleared; a replay is never a run's sales source.
    captureGate,
  };
  const manifestPath = join(destination, 'manifest.json'); await writeJson(manifestPath, manifest);
  return { manifestPath, rowCount: parsed.rowCount, snapshot: extracted.snapshot, captureId };
}

async function archiveResultsPage(page, out, spec, observation, parsed, productCap, options = {}) {
  if (!Number.isSafeInteger(productCap) || productCap <= 0 || productCap > PRODUCT_CAP) throw new MetricAdapterError('METRIC_ROW_CAP', `product pagination cap must be between 1 and ${PRODUCT_CAP}`);
  const destination = ensureExternalCapturePath(out);
  const captureId = options.captureId || `metric-${Date.now()}`;
  const specDigest = hashBytes(Buffer.from(JSON.stringify(spec), 'utf8'));
  const debugDir = join(destination, 'debug');
  const debug = options.debug || await createDebugSession(debugDir, {
    captureId, specDigest, appliedFilters: parsed.appliedFilters, resultCount: parsed.rowCount, productCap,
  });
  const staging = await mkdtemp(join(tmpdir(), 'metric-capture-'));
  let collected = null;
  try {
    collected = await collectResults(page, spec, productCap, staging, debug, options.networkState || observation.networkState || createNetworkState());
    collected.baselineResponseOrder = options.searchGate?.baselineResponseOrder ?? observation.searchGate?.baselineResponseOrder ?? -1;
    await debug.update(collected.responses, { appliedFilters: parsed.appliedFilters, resultCount: parsed.rowCount, views: collected.views, screenshotSkips: collected.screenshotSkips || [], searchGate: options.searchGate || observation.searchGate || null });
    await gateCurrentMetricPage(page);
    if (collected.screenshots.length === 0) {
      const reasons = collected.screenshotSkips?.map(skip => `${skip.platform}/${skip.region}:${skip.reason}`).join(', ') || 'none recorded';
      throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric result-region screenshots are unavailable (${reasons})`);
    }
    const archive = await archiveCollectedResults(out, spec, parsed, productCap, collected, {
      captureId, specDigest, capturedAt: new Date().toISOString(), platformIdMap: (options.searchGate || observation.searchGate)?.platformMap, captureGate: { cleared: true },
    });
    await debug.finish(collected.responses, { appliedFilters: parsed.appliedFilters, resultCount: parsed.rowCount, views: collected.views, screenshotSkips: collected.screenshotSkips || [], searchGate: options.searchGate || observation.searchGate || null, status: 'archived' });
    return archive;
  } catch (error) {
    await debug.finish(collected?.responses || [], {
      views: collected?.views || [], screenshotSkips: collected?.screenshotSkips || [], status: 'failed',
      error: { code: error?.code || 'METRIC_UI_CHANGED', message: String(error?.message ?? error).slice(0, 500) },
    }).catch(() => {});
    throw withDebugFolder(error, debugDir);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function replayResultsPage(replayDirArg, outArg, spec, productCapArg) {
  const replayDir = ensureExternalCapturePath(replayDirArg);
  const manifestPath = join(replayDir, 'manifest.json');
  const debugManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (debugManifest?.contractVersion !== 'metric-results-debug-v1') {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric replay debug manifest is not recognized');
  }
  const input = JSON.parse(await readFile(join(replayDir, debugManifest.files?.input || 'input.json'), 'utf8'));
  const productCap = Number(productCapArg ?? input.productCap ?? PRODUCT_CAP);
  if (!Number.isSafeInteger(productCap) || productCap <= 0 || productCap > PRODUCT_CAP) {
    throw new MetricAdapterError('METRIC_ROW_CAP', `product pagination cap must be between 1 and ${PRODUCT_CAP}`);
  }
  const replayResponses = Array.isArray(input.responses) ? input.responses : [];
  const replayGate = input.searchGate || debugManifest.searchGate || null;
  const replayBaseline = Number.isSafeInteger(replayGate?.baselineResponseOrder)
    ? replayGate.baselineResponseOrder : Number.MAX_SAFE_INTEGER;
  assertSearchAppliedGate({
    responses: replayResponses,
    spec,
    baselineResponseOrder: replayBaseline,
    platformMap: replayGate?.platformMap || null,
  });
  const debugSnapshots = Array.isArray(input.domSnapshots) ? input.domSnapshots : [];
  if (!debugSnapshots.length) throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric replay debug DOM snapshots are missing');
  const domSnapshots = [];
  for (const snapshot of debugSnapshots) {
    const html = snapshot?.html && /<(?:body|main)\b/i.test(snapshot.html)
      ? snapshot.html
      : `<main id="main-content"><div id="analytic-tab">${Object.values(snapshot?.regionsHtml || {}).join('\n')}</div></main>`;
    if (html) domSnapshots.push(await runSavedResultObserver(html));
    else domSnapshots.push(snapshot);
  }
  const appliedFilters = input.appliedFilters || debugManifest.appliedFilters;
  const rowCount = input.resultCount ?? debugManifest.resultCount;
  const parsed = parseSearchObservation({
    url: BASE_URL, bodyText: '', metricRootVisible: true, appliedFilters, rowCount, snapshot: {},
  }, spec, Number.MAX_SAFE_INTEGER);
  const screenshotName = debugManifest.files?.fullPageScreenshot;
  const screenshots = screenshotName && await stat(join(replayDir, screenshotName)).then(() => true).catch(() => false)
    ? [{ path: join(replayDir, screenshotName), platform: 'all', region: 'full-page', maskedCount: debugManifest.screenshot?.maskedCount || 0 }]
    : [];
  const collected = {
    responses: replayResponses, baselineResponseOrder: replayBaseline, domSnapshots, screenshots, screenshotSkips: [],
    views: Array.isArray(input.views) ? input.views : [{ platform: 'all', pagesRead: domSnapshots.length }],
  };
  const output = outArg ? ensureExternalCapturePath(outArg) : join(replayDir, 'replay');
  const captureId = `${input.captureId || debugManifest.captureId || 'metric-replay'}-replay`;
  const specDigest = hashBytes(Buffer.from(JSON.stringify(spec), 'utf8'));
  const archive = await archiveCollectedResults(output, spec, parsed, productCap, collected, {
    captureId, specDigest, capturedAt: input.capturedAt || new Date().toISOString(), platformIdMap: replayGate?.platformMap,
  });
  return { status: 'READY', rowCount: archive.rowCount, manifestPath: archive.manifestPath, replay: true };
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
  func: async (page, args) => withMetricTab(page, async target => { const spec = await readSpec(args.spec); await target.startNetworkCapture?.(); const { parsed } = await runSearch(target, spec, Number.MAX_SAFE_INTEGER); await writeJson(args.out, parsed.snapshot); return [{ status: 'READY', rowCount: parsed.rowCount, snapshotPath: String(args.out) }]; }),
});

export const captureCommand = cli({
  site: 'metric', name: 'capture', access: 'read', description: 'Run one Metric analysis lookup and archive the results page', domain: 'metric.vn', strategy: Strategy.UI, browser: true, navigateBefore: false, siteSession: 'ephemeral',
  args: [{ name: 'spec', type: 'string', required: true, help: 'Path to metric-query-spec-v1 JSON' }, { name: 'out', type: 'string', required: false, help: 'Absolute output directory outside the repository (required without --dry-run)' }, { name: 'replay', type: 'string', required: false, help: 'Replay a saved Metric debug directory without browser or network access' }, { name: 'product-cap', type: 'int', default: PRODUCT_CAP, help: 'Maximum product rows to read through pagination per platform view' }, { name: 'dry-run', type: 'boolean', default: false, help: 'Apply and verify the form without clicking Search' }], columns: ['status', 'rowCount', 'manifestPath', 'outcome', 'startState', 'appliedReadBack', 'mismatches'],
  func: async (page, args) => {
    const spec = await readSpec(args.spec);
    if (args.replay) {
      if (Boolean(args['dry-run'])) throw new CliError('METRIC_UI_CHANGED', '--replay cannot be combined with --dry-run');
      return [await replayResultsPage(args.replay, args.out, spec, args['product-cap'])];
    }
    return withMetricTab(page, async target => {
      if (Boolean(args['dry-run'])) return [await runDryRun(target, spec)];
      if (!args.out) throw new CliError('METRIC_UI_CHANGED', 'capture output directory is required unless --dry-run is used');
      const destination = ensureExternalCapturePath(args.out);
      const captureId = `metric-${Date.now()}`;
      const specDigest = hashBytes(Buffer.from(JSON.stringify(spec), 'utf8'));
      const debugDir = join(destination, 'debug');
      const debug = await createDebugSession(debugDir, {
        captureId, specDigest, appliedFilters: spec, resultCount: null, productCap: Number(args['product-cap'] ?? PRODUCT_CAP),
      });
      let networkState = createNetworkState();
      try {
        await target.startNetworkCapture?.();
        const result = await runSearch(target, spec, Number.MAX_SAFE_INTEGER, debug);
        networkState = result.networkState;
        const archive = await archiveResultsPage(target, args.out, spec, result.observation, result.parsed, Number(args['product-cap'] ?? PRODUCT_CAP), {
          debug, captureId, networkState, searchGate: result.searchGate,
        });
        return [{ status: 'READY', rowCount: archive.rowCount, manifestPath: archive.manifestPath }];
      } catch (error) {
        networkState = error?.networkState || networkState;
        await debug.finish(networkState.all, {
          searchGate: error?.searchGate || null, status: 'failed',
          error: { code: error?.code || 'METRIC_UI_CHANGED', message: String(error?.message ?? error).slice(0, 500) },
        }).catch(() => {});
        throw withDebugFolder(error, debugDir);
      }
    });
  },
});

export {
  asCliError, withMetricTab, readObservation, applyMetricSpec, performSearch, runDryRun,
  prepareMetricForm, waitForKeywordCommit, observeMetricPage, observeResultPage,
  collectResultPages, archiveResultsPage, replayResultsPage, readCommittedKeywords,
  describeSearchSubmit, assertSearchSubmitInspection, createNetworkState, readNetworkChunk,
};
export { assertMetricUrl, parseMetricForm };
