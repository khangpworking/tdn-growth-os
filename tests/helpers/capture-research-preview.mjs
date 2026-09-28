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
const report = path.join(root, 'source-backed-report-fixture', 'report.html');
await fs.access(report);
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-research-chrome-'));
const browser = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu',
  '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'],
{ stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '', socket, nextId = 0, launchError;
const pending = new Map();
const pageErrors = [];
browser.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
browser.on('error', error => { launchError = error; });
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
  pending.set(id, { resolve, reject, timeout });
  socket.send(JSON.stringify({ id, method, params }));
});
try {
  let port;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    if (browser.exitCode !== null) throw new Error(`Chrome exited: ${stderr}`);
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await pause(100); }
  }
  if (!port) throw new Error(`Chrome did not start: ${stderr}`);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data)), item = pending.get(message.id);
    if (message.method === 'Runtime.exceptionThrown' ||
        (message.method === 'Log.entryAdded' && message.params.entry.level === 'error')) pageErrors.push(message);
    if (!item) return;
    clearTimeout(item.timeout); pending.delete(message.id);
    if (message.error) item.reject(new Error(JSON.stringify(message.error))); else item.resolve(message.result);
  });
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Log.enable');
  await call('Page.navigate', { url: pathToFileURL(report).href });
  let loaded = false;
  for (let i = 0; i < 100; i++) {
    const ready = await call('Runtime.evaluate', { expression: 'document.readyState === "complete" && !!document.querySelector("a.value")', returnByValue: true });
    if (ready.result.value === true) { loaded = true; break; }
    await pause(50);
  }
  if (!loaded) throw new Error('Synthetic report never reached the expected loaded state');
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
      const rect = element.getBoundingClientRect();
      const point = {x:rect.x + rect.width / 2,y:rect.y + rect.height / 2};
      const hit = document.elementFromPoint(point.x,point.y);
      if (!hit || !(hit === element || element.contains(hit))) throw new Error('Occluded interaction: ' + element.outerHTML + ' hit=' + hit?.outerHTML);
      return point;
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
    if (state.scroll > state.width) throw new Error(`Horizontal overflow at ${width}: ${JSON.stringify(state)}`);
    const metrics = await call('Page.getLayoutMetrics');
    const capture = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 } });
    await fs.writeFile(path.join(root, `${name}.png`), Buffer.from(capture.data, 'base64'), { mode: 0o600 });
    const first = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await fs.writeFile(path.join(root, `${name}-first.png`), Buffer.from(first.data, 'base64'), { mode: 0o600 });
    evidence.push({ name, ...state, height: metrics.cssContentSize.height });
    const originalOpen = await evaluate('Array.from(document.querySelectorAll("details"), item => item.open)');
    const controls = await evaluate(`(() => {
      const controls = [...document.querySelectorAll('summary,a')];
      return controls.map((item,index) => {
        item.dataset.previewControl = String(index);
        return {index,tag:item.tagName,text:item.textContent.trim(),href:item.getAttribute('href'),download:item.hasAttribute('download')};
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
        // Skip link is intentionally offscreen until keyboard focus.
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
        await click(selector);
        const id = decodeURIComponent(control.href.slice(1));
        let target;
        for (let attempt = 0; attempt < 20; attempt++) {
          target = await evaluate(`({hash:decodeURIComponent(location.hash.slice(1)),exists:!!document.getElementById(${JSON.stringify(id)})})`);
          if (target.exists && target.hash === id) break;
          await pause(50);
        }
        if (!target.exists || target.hash !== id) throw new Error(`Evidence navigation failed: ${JSON.stringify({control,target})}`);
        actions.push({ text: control.text, action: 'navigated', target: control.href });
      } else if (control.download) {
        // The bundle owns exact file bytes. Check the browser link resolves to
        // that retained local file without starting duplicate downloads in CI.
        const file = path.resolve(path.dirname(report), control.href);
        if (path.dirname(file) !== path.dirname(report) || !(await fs.stat(file)).isFile()) throw new Error(`Invalid download: ${control.href}`);
        actions.push({ text: control.text, action: 'download-target-verified', target: control.href });
      } else throw new Error(`Unowned interaction: ${control.href}`);
    }
    await evaluate('document.querySelector("details").open = false; document.querySelector("summary").focus()');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    if (!await evaluate('document.querySelector("details").open')) throw new Error('Keyboard disclosure failed');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const focused = await evaluate('({tag:document.activeElement.tagName,outline:getComputedStyle(document.activeElement).outlineStyle})');
    if (!['A', 'SUMMARY', 'DIV'].includes(focused.tag) || focused.outline === 'none') throw new Error('Keyboard focus is not visible');
    interactionEvidence.push({ name, actions, keyboard: 'Enter opens; Tab advances with visible outline' });
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
  browser.kill('SIGTERM');
  for (let i = 0; i < 40 && browser.exitCode === null && browser.signalCode === null; i++) await pause(100);
  if (browser.exitCode === null && browser.signalCode === null) { browser.kill('SIGKILL'); await pause(200); }
  await fs.rm(profile, { recursive: true, force: true });
}
