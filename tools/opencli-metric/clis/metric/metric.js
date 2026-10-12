// Metric adapter for OpenCLI 1.8.8. The command opens and closes its own tab.
// Search/capture are intentionally not run during P6-209 recon.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

function asCliError(error) {
  if (error instanceof CliError) return error;
  if (error instanceof MetricAdapterError) return new CliError(error.code, error.message);
  return new CliError('METRIC_UI_CHANGED', error instanceof Error ? error.message : String(error));
}

async function withMetricTab(page, task) {
  let target;
  try {
    target = await page.newTab(BASE_URL);
    if (!target) throw new CliError('METRIC_UI_CHANGED', 'OpenCLI did not create a Metric tab');
    await page.selectTab(target);
    return await task(target);
  } catch (error) {
    throw asCliError(error);
  } finally {
    if (target) await page.closeTab(target).catch(() => {});
  }
}

async function readObservation(page) {
  await page.wait({ selector: '#main-content #analytic-tab', timeout: 15 }).catch(() => {});
  const observation = await page.evaluate(() => {
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
    const labelledSelect = label => {
      const labels = [...document.querySelectorAll('#QuerySearchBuilder .filter-label .label')];
      const match = labels.find(element => textOf(element) === label);
      return match?.closest('.ant-space-item')?.querySelector('.ant-select') || null;
    };
    const controls = [
      ['platform', 'Platform', labelledSelect('Platform')],
      ['period', 'Time period', labelledSelect('Time period')],
      ['category', 'Product category', labelledSelect('Product category')],
      ['keywords', 'Keywords', [...document.querySelectorAll('#QuerySearchBuilder .ant-select')]
        .find(element => /Enter keywords separated by commas/i.test(textOf(element)))],
    ].map(([name, label, element]) => ({
      name,
      label,
      selector: element?.querySelector('input[id]')?.id ? `#${CSS.escape(element.querySelector('input[id]').id)}` : selectorFor(element),
      options: [],
      visible: visible(element),
    }));
    const visibleText = [...document.querySelectorAll('#header, #QuerySearchBuilder, [data-v-50902570]')]
      .filter(visible)
      .map(textOf)
      .filter(Boolean)
      .join('\n');
    const loginVisible = [...document.querySelectorAll('a,button,[role="button"]')]
      .some(element => visible(element) && /^(?:login|đăng nhập)$/i.test(textOf(element)));
    const captchaVisible = [...document.querySelectorAll('[id*="captcha" i],[class*="captcha" i],iframe[src*="captcha" i]')]
      .some(visible) || /captcha|verify you are human/i.test(visibleText);
    const quotaText = [...document.querySelectorAll('#QuerySearchBuilder, body *')]
      .filter(element => visible(element) && element.children.length === 0 && textOf(element).length <= 240)
      .map(textOf);
    const number = value => {
      const match = String(value ?? '').match(/\d[\d\s,.]*/);
      if (!match) return null;
      const parsed = Number(match[0].replace(/[\s,.]/g, ''));
      return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
    };
    const analysisQuotaText = quotaText.find(value => /(?:analysis\s+)?(?:lookups?|queries?|points?|lượt phân tích|lượt).*(?:left|remaining|available|còn)|(?:left|remaining|available|còn).*(?:analysis\s+)?(?:lookups?|queries?|points?|lượt phân tích|lượt)/i.test(value));
    const downloadLabel = [...document.querySelectorAll('.row-limit')].find(element => visible(element) && /download rows/i.test(textOf(element)));
    const downloadQuotaText = downloadLabel ? textOf(downloadLabel) : null;
    const loggedInMarker = visible(document.querySelector('#header .user-profile-btn-wrapper'));
    return {
      url: location.href,
      title: document.title,
      bodyText: visibleText,
      metricRootVisible: visible(document.querySelector('#main-content #analytic-tab')),
      loginVisible,
      captchaVisible,
      accountState: loggedInMarker ? 'logged_in' : loginVisible ? 'logged_out' : 'unknown',
      controls,
      quota: {
        analysisLookupsRemaining: number(analysisQuotaText),
        downloadRowsRemaining: number(downloadQuotaText),
      },
    };
  });
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

function writeJson(path, value) {
  return writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export const whoamiCommand = cli({
  site: 'metric', name: 'whoami', access: 'read', description: 'Read Metric login and displayed quota state',
  domain: 'metric.vn', strategy: Strategy.UI, browser: true, navigateBefore: false, siteSession: 'ephemeral',
  columns: ['status', 'plan', 'analysisLookupsRemaining', 'downloadRowsRemaining'],
  func: async page => withMetricTab(page, async () => {
    const observation = await readObservation(page);
    const result = parseWhoamiObservation(observation);
    return [result];
  }),
});

export const searchCommand = cli({
  site: 'metric', name: 'search', access: 'read', description: 'Read a Metric results page without downloading export rows',
  domain: 'metric.vn', strategy: Strategy.UI, browser: true, navigateBefore: false, siteSession: 'ephemeral',
  args: [
    { name: 'spec', type: 'string', required: true, help: 'Path to metric-query-spec-v1 JSON' },
    { name: 'out', type: 'string', required: true, help: 'Output path for the snapshot JSON' },
    { name: 'max-rows', type: 'int', default: MAX_ROWS, help: 'Fail closed above this result row cap' },
  ],
  columns: ['status', 'rowCount', 'snapshotPath'],
  func: async (page, args) => withMetricTab(page, async () => {
    const spec = await readSpec(args.spec);
    const observation = await readObservation(page);
    // The live UI action is deliberately a later, owner-authorized round.
    const parsed = parseSearchObservation(observation, spec, Number(args['max-rows'] ?? MAX_ROWS));
    await writeJson(args.out, parsed.snapshot);
    return [{ status: 'READY', rowCount: parsed.rowCount, snapshotPath: String(args.out) }];
  }),
});

export const captureCommand = cli({
  site: 'metric', name: 'capture', access: 'read', description: 'Capture Metric snapshot and native artifacts',
  domain: 'metric.vn', strategy: Strategy.UI, browser: true, navigateBefore: false, siteSession: 'ephemeral',
  args: [
    { name: 'spec', type: 'string', required: true, help: 'Path to metric-query-spec-v1 JSON' },
    { name: 'out', type: 'string', required: true, help: 'Output directory for capture artifacts' },
    { name: 'export', type: 'boolean', default: false, help: 'Download the native xlsx export' },
    { name: 'pdf', type: 'boolean', default: false, help: 'Print the results page to PDF' },
    { name: 'max-rows', type: 'int', default: MAX_ROWS, help: 'Fail closed above this result row cap' },
  ],
  columns: ['status', 'rowCount', 'manifestPath'],
  func: async (page, args) => withMetricTab(page, async () => {
    const spec = await readSpec(args.spec);
    const observation = await readObservation(page);
    const parsed = parseSearchObservation(observation, spec, Number(args['max-rows'] ?? MAX_ROWS));
    await mkdir(args.out, { recursive: true });
    const snapshotPath = `${args.out}/snapshot.json`;
    await writeJson(snapshotPath, parsed.snapshot);
    const manifest = {
      spec,
      appliedFilters: parsed.appliedFilters,
      rowCount: parsed.rowCount,
      files: [{ role: 'snapshot', path: 'snapshot.json', sha256: createHash('sha256').update(JSON.stringify(parsed.snapshot)).digest('hex') }],
      exportRequested: Boolean(args.export),
      pdfRequested: Boolean(args.pdf),
    };
    const manifestPath = `${args.out}/manifest.json`;
    await writeJson(manifestPath, manifest);
    return [{ status: 'READY', rowCount: parsed.rowCount, manifestPath }];
  }),
});

// Keep the parser import live for OpenCLI's adapter discovery and convention audit.
export { assertMetricUrl, parseMetricForm };
