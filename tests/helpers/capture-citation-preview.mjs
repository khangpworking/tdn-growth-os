import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

if (process.platform !== 'linux') throw new Error('Linux-only browser acceptance');
const [directory, toolsDirectory] = process.argv.slice(2);
if (!directory?.startsWith('/') || !toolsDirectory?.startsWith('/')) throw new Error('Absolute private directories required');
const require = createRequire(path.join(toolsDirectory, 'package.json'));
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const url = pathToFileURL(path.join(directory, 'bundle/report.html')).href;
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  const receipt = { syntheticOnly: true, viewports: [], pageErrors: errors };
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(url);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(directory, `cover-${viewport.width}.png`) });
    for (const [name, selector] of [['kpi', '.kpis'], ['chart', '#section-M03 .card'],
      ['blocked', '#section-M01'], ['insight', '#section-I01']]) {
      const region = page.locator(selector).first();
      await region.scrollIntoViewIfNeeded();
      await region.screenshot({ path: path.join(directory, `${name}-${viewport.width}.png`) });
    }
    const badge = page.locator('.citation-badge').first();
    await badge.scrollIntoViewIfNeeded();
    await badge.focus();
    await page.screenshot({ path: path.join(directory, `badge-focus-${viewport.width}.png`) });
    await page.keyboard.press('Enter');
    const state = await page.evaluate(() => {
      const target = document.querySelector(location.hash);
      return { hash: location.hash, targetExists: !!target, sourceDownloadExists: !!target?.querySelector('a[download]'),
        fontsLoaded: document.fonts.status, horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        citationFaces: [...document.fonts].map(font => ({ family: font.family, weight: font.weight, style: font.style, status: font.status })) };
    });
    if (!state.targetExists || !state.sourceDownloadExists || state.horizontalOverflow) throw new Error(JSON.stringify(state));
    await page.screenshot({ path: path.join(directory, `citation-${viewport.width}.png`) });
    const source = page.locator('.citation-record').last();
    await source.scrollIntoViewIfNeeded();
    await source.screenshot({ path: path.join(directory, `source-${viewport.width}.png`) });
    receipt.viewports.push({ ...viewport, ...state, keyboard: 'Tab focus / Enter source navigation' });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  await fs.writeFile(path.join(directory, 'browser-receipt.json'), JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify(receipt));
} finally { await browser.close(); }
