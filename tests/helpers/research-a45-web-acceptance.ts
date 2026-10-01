import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fsp from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { openOperatorApp } from '../../src/api/operator-app.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { byteDigest, preparedReportFixture } from './prepared-report-fixture.js';
import { reserveLoopbackPort } from './disposable-operator-runtime.js';

// playwright-core is installed only by the Linux acceptance workflow under its
// temporary runner directory and exposed through NODE_PATH. It is intentionally
// absent from the application dependency graph and production install.
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core') as {
  chromium: {
    launch(options: Record<string, unknown>): Promise<any>;
  };
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND_DIST = path.join(ROOT, 'frontend', 'dist');
const GOOD_SOURCE = 'metric/workbook.xlsx';
const GOOD_LABELS = 'metric/labels.json';
const GOOD_METHODS = {
  descriptive: 'descriptive/input.json',
  located: 'located/input.json',
  methodPackets: 'method-packets/input.json',
} as const;
const DRIFT_METHODS = ['method-packets/input-source-drift.json', 'method-packets/input-claim-drift.json'] as const;

type MethodFamily = keyof typeof GOOD_METHODS;
type OutputSummary = {
  readonly workspaceId: string;
  readonly reportId: string;
  readonly version: number;
  readonly profile: string;
  readonly selectedMethodPaths: Record<MethodFamily, string>;
  readonly artifactNames: readonly string[];
  readonly artifactCount: number;
  readonly artifactLimit: number;
  readonly requestPostCountBeforeReload: number;
  readonly requestPostCountAfterReload: number;
  readonly browserErrors: readonly string[];
  readonly mobile: { readonly viewport: { readonly width: number; readonly height: number }; readonly scrollWidth: number; readonly innerWidth: number };
};

function outputRoot(): string {
  const value = process.env.TDN_RESEARCH_WEB_ACCEPTANCE_DIR;
  if (!value || !path.isAbsolute(value)) {
    throw new Error('TDN_RESEARCH_WEB_ACCEPTANCE_DIR must be an absolute runner-owned output directory');
  }
  return value;
}

async function createOutputRoot(): Promise<string> {
  const output = outputRoot();
  try {
    await fsp.stat(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await fsp.mkdir(output, { recursive: true, mode: 0o700 });
    return output;
  }
  throw new Error(`TDN_RESEARCH_WEB_ACCEPTANCE_DIR already exists; refusing to delete or overwrite ${output}`);
}

async function selectOptionContaining(selects: any, predicate: (text: string) => boolean, description: string): Promise<{ readonly text: string; readonly selectIndex: number }> {
  const candidates: { selectIndex: number; value: string; text: string }[] = [];
  const count = await selects.count();
  for (let selectIndex = 0; selectIndex < count; selectIndex += 1) {
    const options = await selects.nth(selectIndex).locator('option').evaluateAll((items: HTMLOptionElement[]) => items.map(item => ({ value: item.value, text: item.textContent?.trim() ?? '' })));
    for (const option of options) if (predicate(option.text)) candidates.push({ selectIndex, ...option });
  }
  assert.equal(candidates.length, 1, `${description} must be represented by exactly one picker option`);
  const candidate = candidates[0]!;
  await selects.nth(candidate.selectIndex).selectOption(candidate.value);
  return candidate;
}

async function waitForMethodOptions(page: any): Promise<void> {
  await page.waitForFunction((paths: readonly string[]) => paths.every(pathValue =>
    [...document.querySelectorAll('option')].some(option => (option.textContent ?? '').includes(pathValue))), Object.values(GOOD_METHODS), { timeout: 15_000 });
}

async function persistedArtifacts(state: Awaited<ReturnType<typeof preparedReportFixture>>, reportId: string): Promise<{ names: string[]; files: Map<string, Buffer> }> {
  const rows = state.db.prepare(`
    SELECT file_name fileName, artifact_sha256 sha256, byte_size byteSize
    FROM analysis_report_version_artifacts WHERE report_id = ? AND version = 1 ORDER BY file_name
  `).all(reportId) as { fileName: string; sha256: string; byteSize: bigint }[];
  assert.ok(rows.length > 0, 'the browser-created report must retain artifact membership');
  assert.ok(rows.length <= 40, 'the unchanged report artifact limit must hold');
  const store = new ContentAddressedArtifactStore(state.artifactRoot);
  const files = new Map<string, Buffer>();
  for (const row of rows) {
    const bytes = await store.read(row.sha256);
    assert.equal(byteDigest(bytes), row.sha256, row.fileName);
    assert.equal(bytes.byteLength, Number(row.byteSize), row.fileName);
    files.set(row.fileName, bytes);
  }
  assert.ok(files.has('report.html'), 'the persisted report HTML must be present');
  assert.ok(files.has('report-method-evidence.json'), 'the combined method evidence download must be present');
  assert.ok(files.has('located-insight-bundle.json'), 'the located supplement must remain a report artifact');
  assert.ok(files.has('packet.json'), 'the calculation packet must remain a report artifact');
  assert.equal(files.has('descriptive-market-input.json'), false, 'descriptive bytes must be embedded in the combined evidence artifact');
  assert.equal(files.has('descriptive-market-methods.json'), false, 'descriptive bytes must be embedded in the combined evidence artifact');
  assert.equal(files.has('descriptive-evidence-files.json'), false, 'descriptive bytes must be embedded in the combined evidence artifact');
  return { names: [...files.keys()].sort(), files };
}

async function reportEvidenceBytes(origin: string, reportId: string, fileName: string): Promise<Buffer> {
  const response = await fetch(`${origin}/api/reports/${encodeURIComponent(reportId)}/versions/1/files/${encodeURIComponent(fileName)}`);
  assert.equal(response.status, 200, `${fileName} download must be served by the read API`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Real Linux browser acceptance for the A45 happy path. The fixture and
 * operator are real production services; only the source package bytes are
 * generated synthetic test evidence. The method pickers are located by their
 * advertised candidate paths, so this test does not depend on private React
 * ids or option ordering.
 */
async function runResearchA45WebAcceptance(): Promise<OutputSummary> {
  const output = await createOutputRoot();
  const state = await preparedReportFixture(false, true, true, true);
  let application: ReturnType<typeof openOperatorApp> | undefined;
  let browser: any;
  let page: any;
  let reportPage: any;
  const reportPosts: string[] = [];
  try {
    const token = randomBytes(32).toString('hex');
    const port = await reserveLoopbackPort();
    application = openOperatorApp({
      databasePath: state.databasePath, artifactRoot: state.artifactRoot, frontendDist: FRONTEND_DIST,
      version: 'research-a45-web', host: '127.0.0.1', port, ownerWritesEnabled: true,
      ownerToken: token, ownerActorId: 'owner:research-a45-web',
    });
    application.server.listen(port, '127.0.0.1');
    await once(application.server, 'listening');
    const origin = application.origin;
    browser = await chromium.launch({ executablePath: process.env.TDN_BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome', headless: true });
    const context = await browser.newContext({ acceptDownloads: true, reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    const browserErrors: string[] = [];
    page.on('pageerror', (error: any) => browserErrors.push(error.message));
    page.on('console', (message: any) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    page.on('request', (request: any) => {
      if (request.method() === 'POST' && request.url().endsWith('/owner-api/research-generation/reports')) {
        reportPosts.push(request.postData() ?? '');
      }
    });

    await page.goto(`${origin}/#/markets/${state.sourceRequest.workspaceId}`, { waitUntil: 'networkidle' });
    assert.doesNotMatch(page.url(), /mode=demo/, 'the acceptance must use persisted real mode');
    await page.locator('#owner-token').fill(token);
    await page.getByRole('button', { name: 'Mở khóa', exact: true }).click();
    await page.getByRole('heading', { name: 'Tạo báo cáo mới', exact: true }).waitFor();
    await page.locator('select').first().waitFor();
    await page.waitForFunction((paths: readonly string[]) =>
      [...document.querySelectorAll('option')].some(option => paths.every(value => (option.textContent ?? '').includes(value))),
    [GOOD_SOURCE, GOOD_LABELS], { timeout: 15_000 });

    const selects = page.locator('select');
    await selectOptionContaining(selects, text => text.includes(GOOD_SOURCE) && text.includes(GOOD_LABELS), 'the explicit Metric source');
    await waitForMethodOptions(page);

    const methodFieldset = page.locator('fieldset.report-method-inputs');
    await methodFieldset.waitFor();
    for (const label of [
      'Phương pháp mô tả thị trường',
      'Phương pháp Insight gắn vị trí bằng chứng',
      'Gói kiểm tra điều kiện và tổng hợp',
    ]) await methodFieldset.getByRole('combobox', { name: new RegExp(`^${label}`) }).waitFor();
    const methodSelects = methodFieldset.locator('select');
    assert.equal(await methodSelects.count(), 3, 'the loaded inventory must expose three method-family pickers');
    const defaults = await methodSelects.evaluateAll((items: HTMLSelectElement[]) => items.map(item => ({ value: item.value, firstOption: item.options[0]?.textContent?.trim() ?? '' })));
    assert.deepEqual(defaults, [
      { value: '', firstOption: 'Không dùng' },
      { value: '', firstOption: 'Không dùng' },
      { value: '', firstOption: 'Không dùng' },
    ], 'method pickers must default to no selection before the operator chooses inputs');

    for (const [family, logicalPath] of Object.entries(GOOD_METHODS) as [MethodFamily, string][]) {
      await selectOptionContaining(selects, text => text.includes(logicalPath), `${family} method input`);
    }
    const optionText = await page.locator('option').allTextContents();
    for (const driftPath of DRIFT_METHODS) assert.ok(optionText.some((text: string) => text.includes(driftPath)), `${driftPath} must be visible as an explicit candidate`);
    const selectedText = await selects.evaluateAll((items: HTMLSelectElement[]) => items.map(item => item.selectedOptions[0]?.textContent?.trim() ?? ''));
    for (const logicalPath of Object.values(GOOD_METHODS)) assert.ok(selectedText.some((text: string) => text.includes(logicalPath)), `${logicalPath} must be selected explicitly`);

    await page.setViewportSize({ width: 768, height: 1000 });
    const tablet = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    await page.screenshot({ path: path.join(output, 'method-inputs-tablet.png'), fullPage: true });
    assert.ok(tablet.scrollWidth <= tablet.width + 1, `tablet navigation overflows: ${JSON.stringify(tablet)}`);
    await page.setViewportSize({ width: 360, height: 844 });
    const mobile = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll('body *')].flatMap(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > innerWidth + 1 ? [{
          tag: element.tagName, className: element.className, left: rect.left, right: rect.right,
          text: (element as HTMLElement).innerText?.slice(0, 100),
        }] : [];
      }).slice(0, 20),
      pickers: [...document.querySelectorAll('select')].map(select => {
        const rect = select.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, label: select.labels?.[0]?.textContent?.trim() ?? '' };
      }),
    }));
    assert.equal(await page.locator('#owner-token').count(), 0, 'mobile screenshot must not retain the owner token field');
    await page.screenshot({ path: path.join(output, 'method-inputs-mobile.png'), fullPage: true });
    assert.ok(mobile.scrollWidth <= mobile.width + 1, `mobile picker surface overflows: ${JSON.stringify(mobile)}`);
    assert.ok(mobile.pickers.length >= 4, 'source plus three method pickers must be visible');
    for (const picker of mobile.pickers) {
      assert.ok(picker.label.length > 0, 'each picker must have an accessible label');
      assert.ok(picker.left >= -1 && picker.right <= mobile.width + 1, `picker is clipped: ${JSON.stringify(picker)}`);
    }
    const methodTargetHeights = await methodSelects.evaluateAll((items: HTMLSelectElement[]) => items.map(item => item.getBoundingClientRect().height));
    assert.ok(methodTargetHeights.every((height: number) => height >= 44), 'new method selectors must retain 44px minimum touch targets');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('combobox', { name: /^Nguồn cho báo cáo/ }).focus();
    await page.keyboard.press('Tab');
    assert.equal(await methodSelects.first().evaluate((element: HTMLSelectElement) => element === document.activeElement), true,
      'keyboard traversal from the report source must reach its first method picker');
    assert.equal(await page.locator('#owner-token').count(), 0, 'desktop screenshot must not retain the owner token field');
    await page.screenshot({ path: path.join(output, 'method-inputs-desktop.png'), fullPage: true });

    const responsePromise = page.waitForResponse((response: any) => response.url().endsWith('/owner-api/research-generation/reports') && response.request().method() === 'POST');
    await page.getByRole('button', { name: /Tạo báo cáo mới|Tạo báo cáo/, exact: false }).click();
    const creationResponse = await responsePromise;
    assert.equal(creationResponse.status(), 201);
    const receipt = await creationResponse.json() as { reportId: string; version: number; profile: string; exactRetry: boolean; requestKey: string; workspaceId: string };
    assert.equal(receipt.workspaceId, state.sourceRequest.workspaceId);
    assert.equal(receipt.version, 1);
    assert.equal(receipt.profile, 'prepared-report-v1');
    assert.equal(receipt.exactRetry, false);
    assert.match(receipt.reportId, /^[0-9a-f-]{36}$/);
    assert.equal(reportPosts.length, 1, 'the browser journey must submit exactly one report request');
    const requestBody = JSON.parse(reportPosts[0]!) as Record<string, unknown>;
    assert.equal(requestBody.workspaceId, state.sourceRequest.workspaceId);
    assert.equal(typeof requestBody.selectionId, 'string');
    assert.equal(typeof requestBody.requestKey, 'string');
    const methodIds = requestBody.methodSelectionIds as Record<string, unknown>;
    assert.ok(methodIds && typeof methodIds === 'object');
    assert.equal(Object.keys(methodIds).sort().join(','), 'descriptiveMethods,locatedInsightMethods,methodPackets');
    assert.ok(Object.values(methodIds).every(value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)));
    for (const pathKey of ['descriptiveMethodsPath', 'locatedInsightMethodsPath', 'methodPacketsPath']) assert.equal(pathKey in requestBody, false, `request must not accept ${pathKey}`);

    const savedNotice = page.locator('[role="status"]').filter({ hasText: /Đã lưu báo cáo v1/ });
    await savedNotice.waitFor();
    const historyButton = page.getByRole('button', { name: 'Kiểm tra lịch sử', exact: true }).first();
    if (await historyButton.count()) await historyButton.click();
    const versionPicker = page.locator('select').filter({ has: page.locator('option[value="1"]') }).last();
    if (await versionPicker.count()) await versionPicker.selectOption('1');
    const reportLink = page.getByRole('link', { name: /Mở report và evidence/i }).first();
    await reportLink.waitFor();
    const popup = context.waitForEvent('page');
    await reportLink.click();
    reportPage = await popup;
    await reportPage.waitForLoadState('domcontentloaded');
    await reportPage.locator('a[href="report-method-evidence.json"]').first().waitFor({ state: 'attached' });

    const persisted = await persistedArtifacts(state, receipt.reportId);
    const evidence = JSON.parse(persisted.files.get('report-method-evidence.json')!.toString('utf8')) as {
      contractVersion: string;
      descriptor: { logicalPath: string; bytesBase64: string; sha256: string };
      embeddedSupplements: { fileName: string; bytesBase64: string; sha256: string }[];
    };
    assert.equal(evidence.contractVersion, 'report-method-evidence-v1');
    assert.equal(evidence.descriptor.logicalPath, GOOD_METHODS.methodPackets, 'method packet descriptor must be retained in the combined evidence artifact');
    assert.equal(byteDigest(Buffer.from(evidence.descriptor.bytesBase64, 'base64')), evidence.descriptor.sha256);
    for (const name of ['descriptive-market-input.json', 'descriptive-market-methods.json', 'descriptive-evidence-files.json']) {
      const embedded = evidence.embeddedSupplements.find(item => item.fileName === name);
      assert.ok(embedded, `missing embedded descriptive file ${name}`);
      assert.equal(byteDigest(Buffer.from(embedded.bytesBase64, 'base64')), embedded.sha256);
    }
    const locatedBundle = JSON.parse(persisted.files.get('located-insight-bundle.json')!.toString('utf8')) as {
      descriptor: { logicalPath: string; bytesBase64: string; sha256: string };
    };
    assert.equal(locatedBundle.descriptor.logicalPath, GOOD_METHODS.located, 'located input descriptor must be retained in its bundle');
    assert.equal(byteDigest(Buffer.from(locatedBundle.descriptor.bytesBase64, 'base64')), locatedBundle.descriptor.sha256);
    await fsp.writeFile(path.join(output, 'report.html'), persisted.files.get('report.html')!, { mode: 0o600 });
    await fsp.writeFile(path.join(output, 'report-method-evidence.json'), persisted.files.get('report-method-evidence.json')!, { mode: 0o600 });
    const downloaded = await reportEvidenceBytes(origin, receipt.reportId, 'report-method-evidence.json');
    assert.deepEqual(downloaded, persisted.files.get('report-method-evidence.json'));

    const postCountBeforeReload = reportPosts.length;
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(reportPosts.length, postCountBeforeReload, 'reload must not submit another report request');
    const afterReload = await page.locator('body').innerText();
    assert.match(afterReload, /Báo cáo nghiên cứu/);
    const reloadHistoryButton = page.getByRole('button', { name: 'Kiểm tra lịch sử', exact: true }).first();
    if (await reloadHistoryButton.count()) await reloadHistoryButton.click();
    const reloadVersionPicker = page.locator('select').filter({ has: page.locator('option[value="1"]') }).last();
    if (await reloadVersionPicker.count()) await reloadVersionPicker.selectOption('1');
    await page.getByRole('heading', { name: new RegExp(`v${receipt.version}`) }).waitFor();
    assert.equal(reportPosts.length, postCountBeforeReload);
    assert.deepEqual(browserErrors, [], `the production browser journey must not emit page or console errors: ${browserErrors.join('; ')}`);
    const reloadedToken = page.locator('#owner-token');
    if (await reloadedToken.count()) assert.equal(await reloadedToken.inputValue(), '', 'reload must clear the memory-only OWNER token');
    await page.screenshot({ path: path.join(output, 'report-reloaded.png'), fullPage: true });

    const summary: OutputSummary = {
      workspaceId: state.sourceRequest.workspaceId, reportId: receipt.reportId, version: receipt.version,
      profile: receipt.profile, selectedMethodPaths: { ...GOOD_METHODS }, artifactNames: persisted.names,
      artifactCount: persisted.names.length, artifactLimit: 40, requestPostCountBeforeReload: postCountBeforeReload,
      requestPostCountAfterReload: reportPosts.length,
      browserErrors: [...browserErrors],
      mobile: { viewport: { width: 360, height: 844 }, scrollWidth: mobile.scrollWidth, innerWidth: mobile.width },
    };
    await fsp.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
    return summary;
  } catch (error) {
    const bodyText = page ? await page.locator('body').innerText().catch(() => '') : '';
    await fsp.writeFile(path.join(output, 'failure.json'), JSON.stringify({
      message: error instanceof Error ? error.message : 'Browser acceptance failed', bodyText,
    }, null, 2), { mode: 0o600 });
    throw error;
  } finally {
    if (reportPage) await reportPage.close().catch(() => undefined);
    if (browser) await browser.close().catch(() => undefined);
    try {
      if (application) await application.close();
    } finally {
      await state.cleanup();
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const summary = await runResearchA45WebAcceptance();
  console.log(`Research A45 web acceptance passed: ${summary.reportId} v${summary.version}`);
}
