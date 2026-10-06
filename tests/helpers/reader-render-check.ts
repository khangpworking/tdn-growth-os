import fs from 'node:fs';
import path from 'node:path';

import { chromium, type Browser, type Page } from 'playwright-core';

// Render checks for the owner-facing reader report: desktop 1280, phone 375 and
// A4 print. The page must be self-contained (no network, fonts embedded), must
// not scroll sideways, and a printed A4 page must not clip any table.

export const READER_VIEWS = [
  { name: 'desktop-1280', width: 1280, height: 900 },
  { name: 'phone-375', width: 375, height: 812 },
] as const;
/** A4 with 12 mm side margins: 186 mm of content, 703 CSS px at 96 dpi. */
export const A4 = { widthPx: 703, marginMm: 12 } as const;

/** null means no browser on this machine. */
export function readerBrowserPath(): string | undefined | null {
  const fromEnv = process.env.TDN_CHROMIUM_PATH;
  if (fromEnv) return fromEnv;
  try { if (fs.existsSync(chromium.executablePath())) return undefined; } catch { /* no bundled browser */ }
  return fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : null;
}

export async function launchReaderBrowser(): Promise<Browser> {
  const executablePath = readerBrowserPath();
  if (executablePath === null) throw new Error('No Chromium for the reader render check.');
  return chromium.launch({ headless: true, ...(executablePath === undefined ? {} : { executablePath }) });
}

export type ViewReport = {
  view: string; width: number; scrollWidth: number;
  /** Elements reaching past the viewport outside any sideways scroller. */
  overflow: string[];
  /** Tables whose scroller is narrower than the table (only checked for print). */
  clippedTables: string[];
  fontsLoaded: boolean; blockedRequests: string[]; errors: string[];
};

// Plain strings, not functions: tsx would inject helpers the page does not have.
const DESCRIBE = `const d=e=>{const id=e.id?'#'+e.id:'';const c=typeof e.className==='string'&&e.className.trim()?'.'+e.className.trim().split(/\\s+/).join('.'):'';const s=e.closest('section[id]');return (s&&s!==e?'#'+s.id+' ':'')+e.tagName.toLowerCase()+id+c};`;
const MEASURE = `(()=>{${DESCRIBE}
const W=document.documentElement.clientWidth,over=[],clipped=[];
const scrolls=e=>{for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const o=getComputedStyle(p).overflowX;if(o!=='visible')return true}return false};
for(const e of document.body.querySelectorAll('*')){const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;if((r.right>W+1||r.left<-1)&&!scrolls(e))over.push(d(e))}
for(const t of document.querySelectorAll('table')){const w=t.parentElement;if(t.getBoundingClientRect().width===0)continue;if(t.scrollWidth>w.clientWidth+1||t.getBoundingClientRect().right>W+1)clipped.push(d(t)+' '+t.scrollWidth+'>'+w.clientWidth)}
return {scrollWidth:document.documentElement.scrollWidth,width:W,overflow:[...new Set(over)].slice(0,10),clippedTables:clipped.slice(0,10),fontsLoaded:[...document.fonts].every(f=>f.status==='loaded'||f.status==='unloaded')}})()`;

async function openReader(browser: Browser, html: string, viewport: { width: number; height: number }) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  const blockedRequests: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/*', route => { blockedRequests.push(route.request().url()); return route.abort(); });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate('document.fonts.ready.then(() => true)');
  return { page, blockedRequests, errors };
}

async function measure(page: Page, view: string, blockedRequests: string[], errors: string[]): Promise<ViewReport> {
  const m = await page.evaluate(MEASURE) as Omit<ViewReport, 'view' | 'blockedRequests' | 'errors'>;
  return { view, ...m, blockedRequests, errors };
}

/** Screen views plus the A4 print; PNG and PDF files land in outDir when given. */
export async function checkReaderRender(browser: Browser, html: string, outDir?: string): Promise<{ views: ViewReport[]; pdfPages: number }> {
  const views: ViewReport[] = [];
  for (const v of READER_VIEWS) {
    const { page, blockedRequests, errors } = await openReader(browser, html, v);
    try {
      views.push(await measure(page, v.name, blockedRequests, errors));
      if (outDir) await page.screenshot({ path: path.join(outDir, `${v.name}.png`), fullPage: true });
    } finally { await page.close(); }
  }
  const { page, blockedRequests, errors } = await openReader(browser, html, { width: A4.widthPx, height: 1000 });
  try {
    await page.emulateMedia({ media: 'print' });
    // Ctrl+P fires beforeprint, which opens the full product list; do the same before measuring.
    await page.evaluate("dispatchEvent(new Event('beforeprint'))");
    views.push(await measure(page, 'print-a4', blockedRequests, errors));
    const margin = `${A4.marginMm}mm`;
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: margin, bottom: margin, left: margin, right: margin } });
    if (outDir) fs.writeFileSync(path.join(outDir, 'print-a4.pdf'), pdf);
    return { views, pdfPages: (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length };
  } finally { await page.close(); }
}
