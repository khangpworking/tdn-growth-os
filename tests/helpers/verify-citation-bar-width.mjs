import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
if (process.platform !== 'linux') throw new Error('Linux-only chart geometry proof');
const [directory, toolsDirectory] = process.argv.slice(2);
if (!directory?.startsWith('/') || !toolsDirectory?.startsWith('/')) throw new Error('Absolute private directories required');
const { chromium } = createRequire(path.join(toolsDirectory, 'package.json'))('playwright-core');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(pathToFileURL(path.join(directory, 'bundle/report.html')).href);
  await page.evaluate(() => document.fonts.ready);
  const chart = page.locator('#section-M03 .card').first();
  await chart.scrollIntoViewIfNeeded();
  const widths = await chart.locator('.trk i').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width));
  if (widths.length !== 3 || widths.some(width => Math.abs(width - widths[0]) > 0.1)) {
    throw new Error(`Equal synthetic values must draw equal bars: ${JSON.stringify(widths)}`);
  }
  await chart.screenshot({ path: path.join(directory, 'equal-bars-1440.png') });
  await fs.writeFile(path.join(directory, 'equal-bars-receipt.json'), JSON.stringify({ syntheticOnly: true, viewport: { width: 1440, height: 1000 }, widths }, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ widths, equal: true }));
} finally { await browser.close(); }
