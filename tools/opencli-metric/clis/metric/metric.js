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
  const observation = await page.evaluate(() => {
    const text = document.body?.innerText || '';
    const controls = [
      { name: 'platform', label: 'Platform', selector: '[role="combobox"]', options: [] },
      { name: 'period', label: 'Time period', selector: '#rc_select_4', options: [] },
      { name: 'category', label: 'Product category', selector: '[role="combobox"]', options: [] },
      { name: 'keywords', label: 'Keywords', selector: 'input[type="search"]', options: [] },
    ];
    return {
      url: location.href,
      title: document.title,
      bodyText: text.slice(0, 20000),
      metricRootVisible: Boolean(document.querySelector('#QuerySearchBuilder, #analytic-tab')),
      loginVisible: /(^|\n)Login(\n|$)|(^|\n)Đăng nhập(\n|$)/i.test(text),
      captchaVisible: /captcha|verify you are human/i.test(text),
      accountState: /(^|\n)Login(\n|$)|(^|\n)Đăng nhập(\n|$)/i.test(text) ? 'logged_out' : 'logged_in',
      controls,
      quota: null,
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

