import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assertPortClosed, disposableOperatorFixture, startOperator } from './disposable-operator-runtime.js';

/*
 * Browser owner-boundary acceptance for the research dossier. This deliberately
 * uses the real operator app and a disposable database, but no provider
 * credentials or transport stubs: the unavailable-source state is part of the
 * contract this walkthrough protects.
 *
 * Authoring gate:
 * - Observable contract: editor -> owner start -> empty scope -> confirmation
 *   -> persisted separate web drafts/PDF limitation, including responsive and
 *   demo route behavior.
 * - Regression risk: a route/receipt/rendering change can pass API tests while
 *   the actual production bundle sends the wrong request, loses the run on
 *   reload, leaks demo calls, or overflows on mobile.
 * - Existing API tests own receipt, worker, and report semantics. This helper
 *   owns the independent browser routing/layout/glue boundary.
 * - No production seam or test-only mock is added; playwright-core is supplied
 *   by the Linux runner and the operator is configured with noProviders.
 */

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core') as {
  chromium: { launch(options: Record<string, unknown>): Promise<any> };
};

const output = process.env.TDN_AUTOMATION_WEB_DIR;
if (!output || !path.isAbsolute(output)) {
  throw new Error('TDN_AUTOMATION_WEB_DIR must be an absolute runner-owned output directory outside the checkout');
}
if (process.platform === 'win32') throw new Error('Run this acceptance only on Linux');

const noProviders = {
  kalodataSecretKey: null,
  serpApiKey: null,
  apifyTokenConfigured: false,
} as const;

function isoDateAddDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function waitForPopupReport(page: any, link: any, expectedPath: string): Promise<void> {
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  try {
    await popup.waitForURL((url: URL) => url.pathname === expectedPath);
    await popup.waitForLoadState('domcontentloaded');
    assert.equal(new URL(popup.url()).pathname, expectedPath);
    assert.ok((await popup.locator('body').textContent())?.trim(), `report at ${expectedPath} must contain HTML`);
  } finally {
    await popup.close();
  }
}

const fixture = await disposableOperatorFixture(true);
let app: Awaited<ReturnType<typeof startOperator>> | undefined;
let browser: any;
const requestLog: string[] = [];
const pageErrors: string[] = [];

try {
  await fs.mkdir(output, { recursive: true, mode: 0o700 });
  app = await startOperator({
    ...fixture.configuration,
    localTestOwner: true,
    researchProviders: noProviders,
  });
  const appOrigin = new URL(app.origin);
  browser = await chromium.launch({
    executablePath: process.env.TDN_BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', (error: Error) => pageErrors.push(error.message));
  page.on('console', (message: any) => { if (message.type() === 'error') pageErrors.push(message.text()); });
  page.on('request', (request: any) => {
    const url = new URL(request.url());
    if (url.host === appOrigin.host) requestLog.push(`${request.method()} ${url.pathname}`);
    else if (['http:', 'https:'].includes(url.protocol)) requestLog.push(`EXTERNAL ${request.method()} ${url.href}`);
  });

  await page.goto(app.origin);
  await page.getByText('Test local · OWNER tự động · Thay đổi được lưu thật', { exact: true }).waitFor();
  assert.equal(await page.locator('#owner-token').count(), 0);
  await page.getByRole('button', { name: 'Create new research', exact: true }).click();
  await page.getByLabel('Tên thị trường hoặc cơ hội').fill('Synthetic research automation acceptance');
  await page.getByRole('button', { name: 'Tạo workspace trống', exact: true }).click();
  await page.getByRole('heading', { name: 'Synthetic research automation acceptance', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Nghiên cứu tự động', exact: true }).click();
  await page.getByRole('heading', { name: 'Nghiên cứu tự động', exact: true }).waitFor();
  await page.locator('#ra-keyword').fill('wireless earbuds');

  // Exercise both modes before submitting the one CATEGORY run.
  const productMode = page.getByRole('button', { name: 'Sản phẩm cụ thể', exact: true });
  const categoryMode = page.getByRole('button', { name: 'Khám phá ngành', exact: true });
  await productMode.click();
  assert.equal(await productMode.getAttribute('aria-pressed'), 'true');
  await page.locator('#ra-description').fill('Tai nghe không dây cho người đi làm, giá vừa phải.');
  await categoryMode.click();
  assert.equal(await categoryMode.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#ra-description').count(), 0);
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
  const unknownButtons = page.getByRole('button', { name: 'Không biết', exact: true });
  const unknownCount = await unknownButtons.count();
  assert.ok(unknownCount > 0, 'CATEGORY mode must expose interview questions');
  for (let index = 0; index < unknownCount; index += 1) await unknownButtons.nth(index).click();
  await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();

  const periodPreset = page.locator('#ra-period-preset');
  assert.equal(await periodPreset.inputValue(), 'D365');
  await page.getByText(/365 ngày, tính cả ngày đầu và ngày cuối/, { exact: false }).waitFor();
  await page.screenshot({ path: path.join(output, 'research-editor-desktop.png'), fullPage: true });

  const vietnamToday = await page.evaluate(() => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()));
  await periodPreset.selectOption('CUSTOM');
  await page.locator('#ra-start').fill(isoDateAddDays(vietnamToday, -359));
  await page.locator('#ra-end').fill(vietnamToday);
  await page.getByText('360 ngày, tính cả ngày đầu và ngày cuối', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Bắt đầu tìm nhanh', exact: true }).click();
  await page.waitForFunction(() => /^#\/markets\/[^/]+\/research\/[0-9a-f-]{36}$/i.test(window.location.hash));
  const runMatch = /\/research\/([0-9a-f-]{36})$/i.exec(new URL(page.url()).hash);
  assert.ok(runMatch, `start must navigate to a UUID run route; got ${page.url()}`);
  const runId = runMatch[1]!;
  const workspaceId = new URL(page.url()).hash.split('/')[2];
  assert.ok(workspaceId, 'start route must retain the created workspace');
  assert.equal(requestLog.filter(item => item.startsWith('POST /owner-api/workspaces/') && item.endsWith('/research-automation/runs')).length, 1);

  await page.getByText('Tìm nhanh chưa trả về sản phẩm nào.', { exact: true }).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: path.join(output, 'research-scope-empty-desktop.png'), fullPage: true });
  const noneButton = page.getByRole('button', { name: 'Không cái nào giống ý tôi', exact: true });
  await noneButton.click();
  assert.equal(await noneButton.getAttribute('aria-pressed'), 'true');
  await page.locator('#ra-definition').fill('Tai nghe không dây bán tại Việt Nam cho người đi làm.');
  await page.getByRole('button', { name: 'Duyệt định nghĩa', exact: true }).click();
  const scopeDialog = page.getByRole('dialog', { name: 'Xác nhận phạm vi và bắt đầu thu thập?', exact: true });
  await scopeDialog.waitFor();
  assert.match(await scopeDialog.textContent(), /Không thẻ nào/);
  await scopeDialog.getByRole('button', { name: 'Xác nhận và bắt đầu', exact: true }).click();

  const marketLink = page.getByRole('link', { name: /^Mở bản web Báo cáo Thị trường/ });
  const insightLink = page.getByRole('link', { name: /^Mở bản web Báo cáo Insight/ });
  await marketLink.waitFor({ timeout: 60_000 });
  await insightLink.waitFor({ timeout: 60_000 });
  assert.equal(await page.getByText('Bản nháp, chưa duyệt', { exact: true }).count(), 2);
  const marketHref = await marketLink.getAttribute('href');
  const insightHref = await insightLink.getAttribute('href');
  assert.equal(new URL(marketHref!, app.origin).pathname, `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/reports/market`);
  assert.equal(new URL(insightHref!, app.origin).pathname, `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/reports/insight`);
  await waitForPopupReport(page, marketLink, new URL(marketHref!, app.origin).pathname);
  await waitForPopupReport(page, insightLink, new URL(insightHref!, app.origin).pathname);
  assert.equal(await page.getByRole('link', { name: /Tải PDF/ }).count(), 0);
  assert.equal(await page.locator('.ra-output').filter({ hasText: 'PDF chưa xuất được: Máy này chưa có bộ xuất PDF.' }).count(), 2);

  await page.reload();
  await page.getByRole('link', { name: /^Mở bản web Báo cáo Thị trường/ }).waitFor({ timeout: 15_000 });
  assert.equal(await page.getByText('Bản nháp, chưa duyệt', { exact: true }).count(), 2, 'persisted run must retain both outputs after reload');
  await page.setViewportSize({ width: 390, height: 844 });
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))) {
    await page.screenshot({ path: path.join(output, 'research-run-mobile-overflow.png'), fullPage: true });
    console.error(await page.evaluate(() => ({ viewport: window.innerWidth, scroll: document.documentElement.scrollWidth, offenders: Array.from(document.querySelectorAll('body *')).filter(node => !node.closest('.ra-steps-nav') && node.getBoundingClientRect().right > window.innerWidth).slice(0, 20).map(node => ({ tag: node.tagName, id: node.id, class: node.className, right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width })) })));
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'research run must fit the mobile viewport');
  await page.screenshot({ path: path.join(output, 'research-run-mobile.png'), fullPage: true });

  const demoStart = requestLog.length;
  await page.goto(`${app.origin}/?mode=demo#/markets/${workspaceId}/research`);
  await page.getByText('Demo · không gọi nguồn', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Nghiên cứu tự động', exact: true }).waitFor();
  await page.getByText('Demo không tạo phiên hay kết quả giả.', { exact: false }).waitFor();
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.deepEqual(requestLog.slice(demoStart).filter(item => /^(?:GET|POST|PUT|PATCH|DELETE) \/(?:api|owner-api)(?:\/|$)/.test(item)), [], 'demo research must not read or write the operator API');
  await page.screenshot({ path: path.join(output, 'research-demo-mobile.png'), fullPage: true });

  assert.deepEqual(requestLog.filter(item => item.startsWith('EXTERNAL ')), [], 'browser acceptance must not contact external providers');
  assert.deepEqual(pageErrors, [], 'production bundle must not emit browser errors');
  await fs.writeFile(path.join(output, 'acceptance.json'), JSON.stringify({
    status: 'PASS',
    workspaceId,
    runId,
    outputs: { marketWeb: marketHref, insightWeb: insightHref, pdf: 'unavailable without renderer' },
    screenshots: ['research-editor-desktop.png', 'research-scope-empty-desktop.png', 'research-run-mobile.png', 'research-demo-mobile.png'],
    checks: [
      'synthetic no-provider operator', 'PRODUCT and CATEGORY editor modes', '365-day default and custom 360-day inclusive period',
      'owner start to empty real scope', 'explicit no-card scope confirmation', 'separate Market and Insight web reports',
      'honest PDF unavailable state', 'reload retains persisted run and outputs', 'mobile research run has no horizontal overflow',
      'demo research route makes no API request', 'no external provider request',
    ],
  }, null, 2), { mode: 0o600 });
} finally {
  await browser?.close();
  await app?.close();
  await assertPortClosed(fixture.port);
  await fs.rm(fixture.root, { recursive: true, force: true });
}
