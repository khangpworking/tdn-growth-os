// Metric adapter for OpenCLI 1.8.8. Every command owns one ephemeral tab.
// Browser writes use OpenCLI actions; evaluate() is used only for read-back.
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
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

const BASE_URL = 'https://metric.vn/analytics';
const MAX_ROWS = 5000;
const DEFAULT_WAIT_SECONDS = 2;

function asCliError(error) {
  if (error instanceof CliError) return error;
  if (error instanceof MetricAdapterError) return new CliError(error.code, error.message);
  return new CliError('METRIC_UI_CHANGED', error instanceof Error ? error.message : String(error));
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
  const labelledSelect = label => {
    const match = labels.find(element => textOf(element) === label);
    return match?.closest('.ant-space-item')?.querySelector('.ant-select') || null;
  };
  const selectionTexts = element => {
    if (!element) return [];
    const values = [...element.querySelectorAll('.ant-select-selection-item,[aria-selected="true"]')]
      .map(textOf).filter(value => value && !/^select|placeholder/i.test(value));
    if (values.length) return [...new Set(values)];
    const placeholder = element.querySelector('.ant-select-selection-placeholder');
    return placeholder ? [] : [textOf(element)].filter(Boolean);
  };
  const inputValue = element => element?.querySelector('input')?.value?.trim() || '';
  const platformName = value => {
    const normalized = value.normalize('NFC').trim().toLowerCase();
    if (normalized === 'shopee') return 'shopee';
    if (normalized === 'tiktok' || normalized === 'tiktok shop') return 'tiktok';
    return null;
  };
  const platformSelect = labelledSelect('Platform');
  const periodSelect = labelledSelect('Time period');
  const categorySelect = labelledSelect('Product category');
  const keywordSelect = [...document.querySelectorAll('#QuerySearchBuilder .ant-select')]
    .find(element => /Enter keywords separated by commas/i.test(textOf(element)) || element.querySelector('#rc_select_4'));
  const selectedPlatforms = selectionTexts(platformSelect).map(platformName).filter(Boolean);
  const keywordValues = selectionTexts(keywordSelect).filter(value => !/enter keywords separated by commas/i.test(value));
  const typedKeyword = inputValue(keywordSelect);
  if (typedKeyword && !keywordValues.includes(typedKeyword)) keywordValues.push(typedKeyword);
  const selectedCategory = selectionTexts(categorySelect)[0] || '';
  const category = /^all$/i.test(selectedCategory) ? null : selectedCategory || null;
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
  const loginVisible = [...document.querySelectorAll('a,button,[role="button"]')]
    .some(element => visible(element) && /^(?:login|đăng nhập)$/i.test(textOf(element)));
  const captchaVisible = [...document.querySelectorAll('[id*="captcha" i],[class*="captcha" i],iframe[src*="captcha" i]')]
    .some(visible) || /captcha|verify you are human/i.test(visibleTextContent);
  const quotaText = [...document.querySelectorAll('#QuerySearchBuilder, body *')]
    .filter(element => visible(element) && element.children.length === 0 && textOf(element).length <= 240).map(textOf);
  const number = value => {
    const match = String(value ?? '').match(/\d[\d\s,.]*/);
    if (!match) return null;
    const parsed = Number(match[0].replace(/[\s,.]/g, ''));
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  };
  const analysisQuotaText = quotaText.find(value => /(?:analysis\s+)?(?:lookups?|queries?|points?|lượt phân tích|lượt).*(?:left|remaining|available|còn)|(?:left|remaining|available|còn).*(?:analysis\s+)?(?:lookups?|queries?|points?|lượt phân tích|lượt)/i.test(value));
  const downloadLabel = [...document.querySelectorAll('.row-limit')].find(element => visible(element) && /download rows|số dòng tải về/i.test(textOf(element)));
  const downloadQuotaText = downloadLabel ? textOf(downloadLabel) : null;
  const downloadMaximum = number(downloadQuotaText) ?? number([...document.querySelectorAll('select,.ant-select')]
    .filter(visible).map(textOf).find(value => /5[., ]?000/.test(value)));
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
    loginVisible, captchaVisible,
    accountState: loggedInMarker ? 'logged_in' : loginVisible ? 'logged_out' : 'unknown',
    controls, appliedFilters, rowCount, snapshot,
    quota: { analysisLookupsRemaining: number(analysisQuotaText), downloadRowsRemaining: number(downloadQuotaText) },
    download: { maximumRows: downloadMaximum },
  };
}

async function readObservation(page, { includeResults = true } = {}) {
  await page.wait({ selector: '#QuerySearchBuilder', timeout: 15 }).catch(() => {});
  await page.wait({ selector: '#main-content #analytic-tab', timeout: 15 }).catch(() => {});
  const observation = await page.evaluate(observeMetricPage, includeResults);
  return gateMetricPage(observation);
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

async function visibleOptionIndex(page, wanted) {
  const index = await page.evaluate(label => {
    const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const target = clean(label);
    return [...document.querySelectorAll('[role="option"],.ant-select-item-option')].findIndex(element => {
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
        && clean(element.innerText || element.textContent) === target;
    });
  }, wanted);
  if (!Number.isInteger(index) || index < 0) throw new MetricAdapterError('METRIC_UI_CHANGED', `Metric option is missing: ${wanted}`);
  return index;
}

async function clickVisibleOption(page, wanted) {
  await page.click('[role="option"],.ant-select-item-option', { nth: await visibleOptionIndex(page, wanted) });
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

async function applyMetricSpec(page, spec, initialObservation) {
  const current = initialObservation.appliedFilters || {};
  const currentPlatforms = new Set(current.platforms || []); const wantedPlatforms = new Set(spec.platforms);
  if (typeof page.click !== 'function' || typeof page.fillText !== 'function' || typeof page.pressKey !== 'function') {
    throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric form actions are unavailable');
  }
  if (wantedPlatforms.size > 1) {
    const platformMode = await page.evaluate(() => {
      const button = [...document.querySelectorAll('#QuerySearchBuilder button.switch-button')]
        .find(element => /multiple platforms|single platform/i.test(element.innerText || element.textContent || ''));
      return button ? (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim() : null;
    });
    if (platformMode && /multiple platforms/i.test(platformMode)) await page.click('button.switch-button');
  }
  const platformSelector = await page.evaluate(() => {
    const label = [...document.querySelectorAll('#QuerySearchBuilder .filter-label .label')]
      .find(element => (element.innerText || element.textContent || '').trim() === 'Platform');
    const input = label?.closest('.ant-space-item')?.querySelector('input[id]');
    return input?.id ? `#${CSS.escape(input.id)}` : '#rc_select_1';
  });
  if (wantedPlatforms.size > 1) {
    // In multi-platform mode the page uses a new, visible search input (for
    // example rc_select_13). The old single-platform input is hidden, and
    // clicking it makes the live form reject the option lookup. Selecting by
    // text and Enter also works with the virtualised option list.
    for (const platform of [...wantedPlatforms].filter(value => !currentPlatforms.has(value))) {
      await page.fillText(platformSelector, platform === 'tiktok' ? 'Tiktok' : 'Shopee');
      await page.pressKey('Enter');
    }
    // Remove an accidentally retained platform only when the form exposes a
    // removable tag for that platform. The approved capture starts with
    // Shopee selected and adds Tiktok, so this path is not needed there.
    for (const platform of [...currentPlatforms].filter(value => !wantedPlatforms.has(value))) {
      const tagIndex = await page.evaluate(({ selector, wanted }) => {
        const input = document.querySelector(selector);
        const select = input?.closest('.ant-select');
        if (!select) return -1;
        const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
        return [...select.querySelectorAll('.ant-select-selection-item')]
          .findIndex(element => clean(element.innerText || element.textContent) === clean(wanted === 'tiktok' ? 'Tiktok' : 'Shopee'));
      }, { selector: platformSelector, wanted: platform });
      if (Number.isInteger(tagIndex) && tagIndex >= 0) {
        await page.click(`${platformSelector} ~ .ant-select-selection-item-remove`, { nth: tagIndex });
      }
    }
  } else {
    await page.click(platformSelector);
    for (const platform of [...currentPlatforms].filter(value => !wantedPlatforms.has(value))) await clickVisibleOption(page, platform === 'tiktok' ? 'Tiktok' : 'Shopee');
    for (const platform of [...wantedPlatforms].filter(value => !currentPlatforms.has(value))) await clickVisibleOption(page, platform === 'tiktok' ? 'Tiktok' : 'Shopee');
    await page.pressKey('Escape').catch(() => {});
  }
  const currentKeywords = new Set(current.keywords || []);
  const keywordSelector = await page.evaluate(() => {
    const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
    const select = [...document.querySelectorAll('#QuerySearchBuilder .ant-select')]
      .find(element => /Enter keywords separated by commas/i.test(clean(element.innerText || element.textContent)) || element.querySelector('input[id="rc_select_4"]'));
    const input = select?.querySelector('input[id]');
    return input?.id ? `#${CSS.escape(input.id)}` : '#rc_select_4';
  });
  for (const keyword of [...currentKeywords].filter(value => !spec.keywords.includes(value))) await page.pressKey('Backspace');
  for (const keyword of spec.keywords.filter(value => !currentKeywords.has(value))) {
    await page.fillText(keywordSelector, keyword); await page.pressKey('Enter');
  }
  await page.pressKey('Escape').catch(() => {});
  if (spec.category !== undefined && spec.category !== current.category) {
    await page.click('#rc_select_3'); await clickVisibleOption(page, spec.category === null ? 'All' : spec.category);
  }
  const periodAlreadyApplied = current.period?.startDate === spec.period.startDate && current.period?.endDate === spec.period.endDate;
  if (spec.period.preset && !periodAlreadyApplied) { await page.click('#rc_select_2'); await clickVisibleOption(page, spec.period.preset); }
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

async function saveDownload(page, out, role) {
  if (typeof page.waitForDownload !== 'function') throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric download observation is unavailable');
  const downloadPromise = page.waitForDownload('', 60_000);
  await clickVisibleText(page, role === 'xlsx' ? ['Tải về ngay', 'Download now'] : ['Print', 'In']);
  const download = await downloadPromise;
  if (!download?.downloaded || !download.filename) throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric did not complete the requested download');
  const source = download.path || join(homedir(), 'Downloads', download.filename); const destination = join(out, download.filename);
  try { await copyFile(source, destination); } catch (error) {
    throw new MetricAdapterError('METRIC_UI_CHANGED', `downloaded file could not be saved: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { path: destination, filename: download.filename };
}

async function exportXlsx(page, out, maximumRows) {
  if (!Number.isSafeInteger(maximumRows) || maximumRows <= 0 || maximumRows > MAX_ROWS) throw new MetricAdapterError('METRIC_ROW_CAP', 'Metric export row maximum is not observable or exceeds the adapter cap');
  await clickVisibleText(page, ['Deep data download', 'Tải dữ liệu chi tiết', 'Download list']); await page.wait({ time: 0.5 }).catch(() => {});
  const exportState = await page.evaluate(() => {
    const visible = element => {
      if (!element) return false;
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const input = [...document.querySelectorAll('.row-limit input.ant-input')].find(visible);
    const format = [...document.querySelectorAll('.ant-select')].find(element => visible(element) && /excel|xlsx|csv/i.test(element.innerText || element.textContent || ''));
    const number = value => {
      const match = String(value ?? '').match(/\d[\d.,\s]*/);
      if (!match) return null;
      const parsed = Number(match[0].replace(/[\s.,]/g, ''));
      return Number.isSafeInteger(parsed) ? parsed : null;
    };
    return {
      shownMaximum: number(input?.value),
      currentFormat: (format?.innerText || format?.textContent || '').replace(/\s+/g, ' ').trim(),
      formatSelector: format?.querySelector('input[id]')?.id ? `#${CSS.escape(format.querySelector('input[id]').id)}` : null,
    };
  });
  const shownMaximum = exportState?.shownMaximum ?? 0;
  const rows = Math.min(maximumRows, shownMaximum || maximumRows);
  if (rows <= 0 || rows > MAX_ROWS) throw new MetricAdapterError('METRIC_ROW_CAP', 'Metric export row count is not usable');
  if (shownMaximum !== rows) {
    await page.fillText('.row-limit input.ant-input', String(rows));
    await page.pressKey('Enter').catch(() => {});
  }
  if (!/excel|xlsx/i.test(exportState?.currentFormat || '')) {
    if (!exportState?.formatSelector) throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric export format is not observable');
    await page.click(exportState.formatSelector);
    await clickVisibleOption(page, 'Excel').catch(async () => clickVisibleOption(page, 'XLSX'));
  }
  return saveDownload(page, out, 'xlsx');
}

async function printPdf(page, out) {
  if (typeof page.cdp !== 'function') throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric PDF printing is unavailable');
  const result = await page.cdp('Page.printToPDF', { paperWidth: 8.5, paperHeight: 11, landscape: false, printBackground: true, displayHeaderFooter: true, preferCSSPageSize: false });
  if (!result || typeof result.data !== 'string' || !result.data) throw new MetricAdapterError('METRIC_UI_CHANGED', 'Metric PDF response is empty');
  const path = join(out, 'results.pdf'); await writeFile(path, Buffer.from(result.data, 'base64')); return { path, filename: 'results.pdf' };
}

async function saveRawResponses(page, out) {
  if (typeof page.readNetworkCapture !== 'function') return null;
  const responses = await page.readNetworkCapture(); if (!Array.isArray(responses) || responses.length === 0) return null;
  const path = join(out, 'raw-responses.json'); await writeJson(path, responses); return { path, filename: 'raw-responses.json' };
}

export const whoamiCommand = cli({
  site: 'metric', name: 'whoami', access: 'read', description: 'Read Metric login and displayed quota state', domain: 'metric.vn', strategy: Strategy.UI, browser: true, navigateBefore: false, siteSession: 'ephemeral', columns: ['status', 'plan', 'analysisLookupsRemaining', 'downloadRowsRemaining'],
  func: async page => withMetricTab(page, async target => [parseWhoamiObservation(await readObservation(target, { includeResults: false }))]),
});

export const searchCommand = cli({
  site: 'metric', name: 'search', access: 'read', description: 'Run one Metric analysis lookup and save its web snapshot', domain: 'metric.vn', strategy: Strategy.UI, browser: true, navigateBefore: false, siteSession: 'ephemeral',
  args: [{ name: 'spec', type: 'string', required: true, help: 'Path to metric-query-spec-v1 JSON' }, { name: 'out', type: 'string', required: true, help: 'Output path for the snapshot JSON' }, { name: 'max-rows', type: 'int', default: MAX_ROWS, help: 'Fail closed above this result row cap' }], columns: ['status', 'rowCount', 'snapshotPath'],
  func: async (page, args) => withMetricTab(page, async target => { const spec = await readSpec(args.spec); const { parsed } = await runSearch(target, spec, Number(args['max-rows'] ?? MAX_ROWS)); await writeJson(args.out, parsed.snapshot); return [{ status: 'READY', rowCount: parsed.rowCount, snapshotPath: String(args.out) }]; }),
});

export const captureCommand = cli({
  site: 'metric', name: 'capture', access: 'read', description: 'Run one Metric lookup and capture its native artifacts', domain: 'metric.vn', strategy: Strategy.UI, browser: true, navigateBefore: false, siteSession: 'ephemeral',
  args: [{ name: 'spec', type: 'string', required: true, help: 'Path to metric-query-spec-v1 JSON' }, { name: 'out', type: 'string', required: true, help: 'Output directory for capture artifacts' }, { name: 'export', type: 'boolean', default: false, help: 'Download the native xlsx export' }, { name: 'pdf', type: 'boolean', default: false, help: 'Print the results page to PDF' }, { name: 'max-rows', type: 'int', default: MAX_ROWS, help: 'Fail closed above this result row cap' }], columns: ['status', 'rowCount', 'manifestPath'],
  func: async (page, args) => withMetricTab(page, async target => {
    const spec = await readSpec(args.spec); await mkdir(args.out, { recursive: true }); await target.startNetworkCapture?.();
    const { observation, parsed } = await runSearch(target, spec, Number(args['max-rows'] ?? MAX_ROWS));
    const snapshotPath = join(args.out, 'snapshot.json'); await writeJson(snapshotPath, parsed.snapshot);
    const files = [await fileEntry('snapshot', snapshotPath, 'application/json')];
    if (Boolean(args.export)) { const file = await exportXlsx(target, args.out, observation.download?.maximumRows ?? MAX_ROWS); files.push(await fileEntry('xlsx', file.path, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')); }
    if (Boolean(args.pdf)) { const file = await printPdf(target, args.out); files.push(await fileEntry('pdf', file.path, 'application/pdf')); }
    const raw = await saveRawResponses(target, args.out); if (raw) files.push(await fileEntry('raw-responses', raw.path, 'application/json'));
    const manifest = { spec, appliedFilters: parsed.appliedFilters, rowCount: parsed.rowCount, exportRows: files.some(file => file.role === 'xlsx') ? observation.download?.maximumRows ?? null : null, files, exportRequested: Boolean(args.export), pdfRequested: Boolean(args.pdf) };
    const manifestPath = join(args.out, 'manifest.json'); await writeJson(manifestPath, manifest); return [{ status: 'READY', rowCount: parsed.rowCount, manifestPath }];
  }),
});

export const __test__ = { withMetricTab, readObservation, applyMetricSpec, performSearch, exportXlsx, printPdf };
export { assertMetricUrl, parseMetricForm };
