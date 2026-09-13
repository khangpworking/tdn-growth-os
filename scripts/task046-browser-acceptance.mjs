import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { once } from 'node:events';

const root = new URL('../', import.meta.url).pathname;
const shots = `${root}docs/handoffs/046-screenshots`;
await rm(shots, { recursive: true, force: true });
await mkdir(shots, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', '4176', '--bind', '127.0.0.1', '--directory', `${root}frontend/dist`], { stdio: ['ignore', 'ignore', 'pipe'] });
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(resolve, 500); server.once('exit', (code) => reject(new Error(`server exited ${code}`))); server.stderr.once('data', () => { clearTimeout(timer); resolve(); }); });
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await desktop.goto('http://127.0.0.1:4176/?mode=demo#/markets/calcium/products/adult/b10');
    await desktop.waitForSelector('[aria-current="page"]');
    if (await desktop.locator('aside.decision select#lane').count()) throw new Error('B8 controls leaked into B10');
    await desktop.screenshot({ path: `${shots}/desktop-b10.png`, fullPage: true });
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await mobile.goto('http://127.0.0.1:4176/?mode=demo#/markets/calcium/products/child/b9');
    await mobile.waitForSelector('[aria-current="page"]');
    if (!(await mobile.getByText('Chưa có bản nháp').count())) throw new Error('B9 not-started state missing');
    if (await mobile.locator('aside.decision select#lane').count()) throw new Error('B8 controls leaked into B9');
    const active = mobile.locator('[aria-current="page"]');
    if (!(await active.isVisible())) throw new Error('active mobile navigation is not visible');
    const box = await active.boundingBox(); if (!box || box.x < 0 || box.x + box.width > 390) throw new Error('active mobile navigation is clipped');
    await mobile.screenshot({ path: `${shots}/mobile-b9.png`, fullPage: true });

    const basket = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const writeRequests = [];
    basket.on('request', (request) => {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) writeRequests.push(`${request.method()} ${request.url()}`);
    });
    await basket.goto('http://127.0.0.1:4176/?mode=demo#/markets/calcium');
    await basket.getByRole('button', { name: 'Đóng băng rổ ứng viên', exact: true }).click();
    await basket.getByRole('checkbox').first().check();
    const submitOpener = basket.getByRole('button', { name: 'Đóng băng rổ cơ hội', exact: true });
    await submitOpener.focus();
    const submitOpenerHandle = await submitOpener.elementHandle();
    if (!submitOpenerHandle) throw new Error('basket submit opener is missing');
    await submitOpener.click();

    const dialog = basket.getByRole('dialog', { name: 'Xác nhận đóng băng rổ cơ hội', exact: true });
    await dialog.waitFor();
    const cancelButton = dialog.getByRole('button', { name: 'Hủy', exact: true });
    const confirmButton = dialog.getByRole('button', { name: 'Đóng băng rổ cơ hội', exact: true });
    const assertDialogFocus = async (expected, step) => {
      if (!(await dialog.evaluate((node) => node.contains(document.activeElement)))) throw new Error(`focus escaped basket dialog during ${step}`);
      if (!(await expected.evaluate((node) => node === document.activeElement))) throw new Error(`unexpected focused button during ${step}`);
    };
    await assertDialogFocus(cancelButton, 'initial focus');
    await basket.keyboard.press('Tab');
    await assertDialogFocus(confirmButton, 'forward traversal');
    await basket.keyboard.press('Tab');
    await assertDialogFocus(cancelButton, 'forward wrap');
    await basket.keyboard.press('Shift+Tab');
    await assertDialogFocus(confirmButton, 'reverse wrap');
    await basket.keyboard.press('Escape');
    if (await dialog.count()) throw new Error('basket confirmation dialog remained open after Escape');
    if (writeRequests.length !== 0) throw new Error(`basket cancellation issued write requests: ${writeRequests.join(', ')}`);
    if (!(await submitOpenerHandle.evaluate((node) => node === document.activeElement))) throw new Error('basket submit opener did not regain focus');
  } finally { await browser.close(); }
} finally {
  server.kill('SIGTERM');
  await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 1000))]);
}
console.log('Task046 synthetic browser acceptance: PASS');
