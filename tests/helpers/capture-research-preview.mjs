// Linux CI visual evidence for the synthetic export, not a live operator test.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.env.TDN_RESEARCH_PREVIEW_DIR;
if (process.platform !== 'linux' || !process.env.CI || !root || !path.isAbsolute(root)) {
  throw new Error('This capture helper runs only for an explicit Linux CI preview directory');
}
const relativeReport = process.env.TDN_RESEARCH_PREVIEW_REPORT ?? 'source-backed-report-fixture/report.html';
const report = path.resolve(root, relativeReport);
if (!report.startsWith(path.resolve(root) + path.sep) || path.extname(report) !== '.html') {
  throw new Error('Preview report must be an HTML file inside the explicit preview directory');
}
await fs.access(report);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-research-chrome-'));
const browser = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'],
{ stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '', socket, nextId = 0, launchError;
const pending = new Map();
const pageErrors = [];
const downloadEvents = [];
browser.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
browser.on('error', error => { launchError = error; });
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const waitForBrowserClose = timeout => new Promise(resolve => {
  if (browser.exitCode !== null) { resolve(true); return; }
  let settled = false;
  let timer;
  const finish = result => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    browser.off('close', closed);
    resolve(result);
  };
  const closed = () => finish(true);
  browser.once('close', closed);
  // Close can land between the initial state check and listener registration.
  if (browser.exitCode !== null) { finish(true); return; }
  timer = setTimeout(() => finish(false), timeout);
});
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
  pending.set(id, { resolve, reject, timeout });
  socket.send(JSON.stringify({ id, method, params }));
});
try {
  let port;
  const startupDeadline = Date.now() + 30_000;
  while (Date.now() < startupDeadline) {
    if (launchError) throw launchError;
    if (browser.exitCode !== null) throw new Error(`Chrome exited: ${stderr}`);
    try {
      const candidate = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      if (Number.isInteger(candidate) && candidate > 0 && candidate <= 65535) { port = candidate; break; }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await pause(100);
  }
  if (!port) throw new Error(`Chrome did not start: ${stderr}`);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)), item = pending.get(message.id);
    if (message.method?.includes('download')) downloadEvents.push(message);
    if (message.method === 'Runtime.exceptionThrown' ||
        (message.method === 'Log.entryAdded' && message.params.entry.level === 'error')) pageErrors.push(message);
    if (!item) return;
    clearTimeout(item.timeout); pending.delete(message.id);
    if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
  });
  await call('Page.enable');
  await call('Page.bringToFront');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Runtime.enable');
  await call('Log.enable');
  const downloadsDirectory = path.join(profile, 'downloads');
  await fs.mkdir(downloadsDirectory, { mode: 0o700 });
  await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadsDirectory, eventsEnabled: true });
  await call('Page.navigate', { url: pathToFileURL(report).href });
  let loaded = false;
  for (let i = 0; i < 100; i++) {
    const ready = await call('Runtime.evaluate', { expression: 'document.readyState === "complete" && !!document.querySelector("main a[download]")', returnByValue: true });
    if (ready.result.value === true) { loaded = true; break; }
    await pause(50);
  }
  if (!loaded) throw new Error('Synthetic report never reached the expected loaded state');
  await call('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true, returnByValue: true });
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, returnByValue: true });
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const click = async selector => {
    const point = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing interaction target');
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS' && !(element.tagName === 'SUMMARY' && parent === element.parentElement)) parent.open = true;
      }
      element.scrollIntoView({block:'center'});
      // A wrapped inline link has several hit regions. The center of their
      // combined bounding box can be whitespace outside every text fragment.
      for (const rect of element.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        const point = {x:rect.x + rect.width / 2,y:rect.y + rect.height / 2};
        const hit = document.elementFromPoint(point.x,point.y);
        if (hit && (hit === element || element.contains(hit))) return point;
      }
      throw new Error('Occluded interaction: ' + element.outerHTML);
    })()`);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  // One browser boundary owns native disclosure, navigation and keyboard proof.
  // Screenshot dimensions alone cannot detect dead evidence links or disclosures.
  const interactionEvidence = [];
  const evidence = [];
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const layout = await call('Runtime.evaluate', { expression: 'JSON.stringify({width:innerWidth,scroll:document.documentElement.scrollWidth,title:document.title,links:document.querySelectorAll("a.value").length})', returnByValue: true });
    const state = JSON.parse(layout.result.value);
    if (state.scroll > state.width) {
      const offenders = await evaluate(`Array.from(document.querySelectorAll('body *')).filter(element => {
        const rect = element.getBoundingClientRect();
        return element.checkVisibility() && (rect.right > innerWidth || rect.left < 0) && !element.closest('.table-wrap');
      }).slice(0,40).map(element => ({tag:element.tagName,id:element.id,className:element.className,text:element.textContent.slice(0,100),width:element.getBoundingClientRect().width,right:element.getBoundingClientRect().right}))`);
      await fs.writeFile(path.join(root, `${name}-overflow.json`), JSON.stringify({ ...state, offenders }, null, 2), { mode: 0o600 });
    }
    const metrics = await call('Page.getLayoutMetrics');
    const capturedHeight = Math.min(8000, Math.ceil(metrics.cssContentSize.height));
    evidence.push({ name, ...state, height: metrics.cssContentSize.height, capturedHeight });
    await fs.writeFile(path.join(root, 'visual-evidence.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 });
    const first = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.writeFile(path.join(root, `${name}-first.png`), Buffer.from(first.data, 'base64'), { mode: 0o600 });
    // Bound raster height for a thirty-section report. All controls are still
    // exercised below; selected lower sections have separate viewport captures.
    const capture = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height: capturedHeight, scale: 1 } });
    await fs.writeFile(path.join(root, `${name}.png`), Buffer.from(capture.data, 'base64'), { mode: 0o600 });
    for (const id of ['section-M02', 'section-M03', 'section-M05', 'section-M07', 'section-M08', 'insight', 'section-I03', 'status']) {
      const found = await evaluate(`(() => { const section = document.getElementById(${JSON.stringify(id)}); if (!section) return false; section.scrollIntoView({block:'start'}); return true; })()`);
      if (!found) continue;
      const sectionCapture = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await fs.writeFile(path.join(root, `${name}-${id}.png`), Buffer.from(sectionCapture.data, 'base64'), { mode: 0o600 });
    }
    await evaluate('window.scrollTo(0,0)');
    const assembly = await evaluate(`(() => {
      const panel = document.getElementById('assembly');
      if (!panel) return null;
      const rect = panel.getBoundingClientRect();
      return {x:rect.x + scrollX,y:rect.y + scrollY,width:rect.width,height:Math.min(8000,rect.height),scale:1};
    })()`);
    if (assembly) {
      const panel = await call('Page.captureScreenshot', {format:'png',captureBeyondViewport:true,clip:assembly});
      await fs.writeFile(path.join(root, `${name}-assembly.png`), Buffer.from(panel.data, 'base64'), {mode:0o600});
    }
    if (state.scroll > state.width) throw new Error(`Horizontal overflow at ${width}: ${JSON.stringify(state)}`);
  }
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await evaluate('window.scrollTo(0,0)');
    const originalOpen = await evaluate('Array.from(document.querySelectorAll("details"), item => item.open)');
    const controls = await evaluate(`(() => {
      const controls = [...document.querySelectorAll('summary,a')];
      return controls.map((item,index) => {
        item.dataset.previewControl = String(index);
        return {index,tag:item.tagName,text:item.textContent.trim(),href:item.getAttribute('href'),download:item.hasAttribute('download'),skip:item.classList.contains('skip')};
      });
    })()`);
    const actions = [];
    for (const control of controls) {
      const selector = `[data-preview-control="${control.index}"]`;
      if (control.tag === 'SUMMARY') {
        // Ensure the tested action opens this disclosure, including nested ones.
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).parentElement.open = false`);
        await click(selector);
        if (!await evaluate(`document.querySelector(${JSON.stringify(selector)}).parentElement.open`)) throw new Error(`Disclosure failed: ${control.text}`);
        actions.push({ text: control.text, action: 'opened' });
      } else if (control.href.startsWith('#')) {
        const id = decodeURIComponent(control.href.slice(1));
        if (id.startsWith('claim-') || id.startsWith('members-')) {
          await evaluate(`document.getElementById(${JSON.stringify(id)}).closest('details').open = false`);
        }
        // Skip link is intentionally offscreen until keyboard focus.
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
        if (control.skip) {
          await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
          await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        } else await click(selector);
        let target;
        for (let attempt = 0; attempt < 20; attempt++) {
          target = await evaluate(`(() => {
            const target = document.getElementById(${JSON.stringify(id)});
            return {hash:decodeURIComponent(location.hash.slice(1)),exists:!!target,visible:!!target?.checkVisibility()};
          })()`);
          if (target.exists && target.visible && target.hash === id) break;
          await pause(50);
        }
        if (!target.exists || !target.visible || target.hash !== id) throw new Error(`Evidence navigation failed: ${JSON.stringify({control,target})}`);
        actions.push({ text: control.text, action: 'navigated', target: control.href });
      } else if (control.download) {
        const file = path.resolve(path.dirname(report), control.href);
        if (path.dirname(file) !== path.dirname(report) || !(await fs.stat(file)).isFile()) throw new Error(`Invalid download: ${control.href}`);
        const downloaded = path.join(downloadsDirectory, path.basename(file));
        await fs.unlink(downloaded).catch(error => { if (error.code !== 'ENOENT') throw error; });
        await click(selector);
        let received, opened = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          try { received = await fs.readFile(downloaded); break; }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
          // Chromium may open a local JSON file instead of honoring download.
          // Verify its visible source text, then restore the report. Local
          // file responses are not reliably retained by the CDP resource cache.
          if (await evaluate('location.href') === pathToFileURL(file).href) {
            const visibleText = await evaluate('document.readyState === "complete" ? document.querySelector("pre")?.textContent ?? null : null');
            if (visibleText !== null) {
              received = Buffer.from(visibleText, 'utf8');
              opened = true;
              break;
            }
          }
          await pause(50);
        }
        if (!received || !received.equals(await fs.readFile(file))) throw new Error(`Download failed: ${JSON.stringify({href:control.href,bytes:received?.length,files:await fs.readdir(downloadsDirectory),url:await evaluate('location.href'),events:downloadEvents,errors:pageErrors})}`);
        actions.push({ text: control.text, action: opened ? 'opened-exact-file-bytes' : 'downloaded-exact-bytes', target: control.href });
        if (opened) {
          await call('Page.navigate', { url: pathToFileURL(report).href });
          let restored = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            restored = await evaluate('document.readyState === "complete" && !!document.querySelector("main a[download]")');
            if (restored) break;
            await pause(50);
          }
          if (!restored) throw new Error('Could not return from source file to report');
          await evaluate(`document.querySelectorAll('summary,a').forEach((item,index) => item.dataset.previewControl = String(index))`);
        }
      } else throw new Error(`Unowned interaction: ${control.href}`);
    }
    await evaluate('document.querySelector("details").open = false; document.querySelector("summary").focus()');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    if (!await evaluate('document.querySelector("details").open')) throw new Error(`Keyboard disclosure failed: ${JSON.stringify(await evaluate('({focused:document.activeElement.outerHTML,hasFocus:document.hasFocus(),url:location.href})'))}`);
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const focused = await evaluate('({tag:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineStyle})');
    if (!['A', 'SUMMARY', 'DIV'].includes(focused.tag) || focused.outline === 'none') throw new Error('Keyboard focus is not visible');
    const contrast = await evaluate(`(() => {
      const rgb = text => text.match(/[\\d.]+/g).map(Number);
      const luminance = channels => channels.slice(0,3).map(value => {
        value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
      }).reduce((sum,value,index) => sum + value * [.2126,.7152,.0722][index],0);
      const pairs = new Map();
      const paintedSurfaces = new Map();
      for (const element of document.querySelectorAll('p,li,summary,th,td,dt,dd,a,h1,h2,h3,figcaption,small,code,.meta span')) {
        if (!element.checkVisibility()) continue;
        const style = getComputedStyle(element);
        let background = 'rgb(255,255,255)';
        let paintedSurface = null;
        for (let parent = element; parent; parent = parent.parentElement) {
          const parentStyle = getComputedStyle(parent);
          // The solid-color sampler cannot resolve gradients or full-surface
          // pseudo paint. Retain these for screenshot review, not a false AA pass.
          const fullPseudo = ['::before','::after'].some(pseudo => {
            const paint = getComputedStyle(parent,pseudo);
            return paint.display !== 'none' && paint.content !== 'none' && paint.position === 'absolute' &&
              paint.top === '0px' && paint.bottom === '0px' && paint.left === '0px' && paint.right === '0px';
          });
          if (parentStyle.backgroundImage !== 'none' || fullPseudo) { paintedSurface = parent; break; }
          const candidate = parentStyle.backgroundColor;
          const channels = rgb(candidate);
          if (channels.length === 3 || channels[3] === 1) { background = candidate; break; }
          if (channels[3] !== 0) throw new Error('Unmodeled alpha background');
        }
        if (paintedSurface) {
          const key = paintedSurface.className + '/' + style.color;
          paintedSurfaces.set(key,{status:'REQUIRES_VISUAL_REVIEW',surface:paintedSurface.className,foreground:style.color,text:element.textContent.slice(0,80)});
          continue;
        }
        const foreground = luminance(rgb(style.color)), back = luminance(rgb(background));
        const ratio = (Math.max(foreground,back) + .05) / (Math.min(foreground,back) + .05);
        const size = parseFloat(style.fontSize), weight = Number(style.fontWeight);
        const required = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
        if (ratio < required) throw new Error('Low contrast: ' + element.textContent.slice(0,80) + ' ratio=' + ratio);
        pairs.set(style.color + '/' + background,{foreground:style.color,background,ratio});
      }
      return {solidPairs:Array.from(pairs.values()),paintedSurfaces:Array.from(paintedSurfaces.values())};
    })()`);
    interactionEvidence.push({ name, actions, contrast, keyboard: 'Enter opens; Tab advances with visible outline' });
    await evaluate(`document.querySelectorAll('details').forEach((item,index) => item.open = ${JSON.stringify(originalOpen)}[index]); history.replaceState(null,'',location.pathname); document.activeElement.blur(); window.scrollTo(0,0)`);
  }
  if (pageErrors.length) throw new Error(`Browser errors: ${JSON.stringify(pageErrors)}`);
  // Expand native disclosures for PDF so evidence is not silently omitted.
  await call('Runtime.evaluate', { expression: 'document.querySelectorAll("details").forEach(element => element.open = true)' });
  const pdf = await call('Page.printToPDF', { printBackground: true, preferCSSPageSize: true,
    paperWidth: 8.27, paperHeight: 11.69, marginTop: .4, marginBottom: .4, marginLeft: .4, marginRight: .4 });
  await fs.writeFile(path.join(root, 'synthetic-report.pdf'), Buffer.from(pdf.data, 'base64'), { mode: 0o600 });
  await fs.writeFile(path.join(root, 'visual-evidence.json'), JSON.stringify(evidence, null, 2), { mode: 0o600 });
  await fs.writeFile(path.join(root, 'interaction-evidence.json'), JSON.stringify({ viewports: interactionEvidence, pageErrors }, null, 2), { mode: 0o600 });
} finally {
  socket?.close();
  for (const item of pending.values()) clearTimeout(item.timeout);
  if (browser.exitCode === null) browser.kill('SIGTERM');
  if (!await waitForBrowserClose(4_000)) {
    browser.kill('SIGKILL');
    await waitForBrowserClose(2_000);
  }
  // Chrome may finish removing profile files immediately after its process
  // closes. fs.rm retries only that request-owned temporary directory.
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
