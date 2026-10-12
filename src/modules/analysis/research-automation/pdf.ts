import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { MAX_HTML_BYTES, MAX_PDF_BYTES } from './model.js';

export interface AutomationPdfRenderer {
  render(html: Buffer, signal?: AbortSignal): Promise<Buffer>;
  close(): Promise<void>;
}
type Reply = { data?: string; base64Encoded?: boolean; eof?: boolean; stream?: string; frameTree?: { frame: { id: string } } };

/** Local Chromium prints the retained HTML, without scripts or external requests. No provider call. */
export function createChromiumPdfRenderer(config: { executablePath: string }): AutomationPdfRenderer {
  if (!path.isAbsolute(config.executablePath)) throw new TypeError('PDF executable must be an absolute path');
  let closed = false;
  const active = new Map<AbortController, Promise<Buffer>>();
  return {
    render(html, signal) {
      if (closed || html.length > MAX_HTML_BYTES) return Promise.reject(new Error('PDF renderer unavailable'));
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      const job = print(html, config.executablePath, controller.signal).finally(() => {
        active.delete(controller); signal?.removeEventListener('abort', abort);
      });
      active.set(controller, job);
      return job;
    },
    async close() {
      closed = true;
      for (const controller of active.keys()) controller.abort();
      await Promise.allSettled([...active.values()]);
    },
  };
}

async function stopChild(child: ChildProcess): Promise<void> {
  // Chromium's renderer/zygote children share this dedicated process group.
  const signal = (value: NodeJS.Signals) => {
    if (process.platform === 'linux' && child.pid !== undefined) {
      try { process.kill(-child.pid, value); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    } else child.kill(value);
  };
  signal('SIGTERM');
  const alive = () => {
    if (process.platform !== 'linux' || child.pid === undefined) return child.exitCode === null && child.signalCode === null;
    try { process.kill(-child.pid, 0); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
  };
  // The leader can exit before its renderers: wait on the owned group, not only
  // ChildProcess.close, and terminate surviving descendants after the grace period.
  const deadline = Date.now() + 1500;
  while (alive() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  if (alive()) {
    signal('SIGKILL');
    const reapDeadline = Date.now() + 1000;
    while (alive() && Date.now() < reapDeadline) await new Promise(resolve => setTimeout(resolve, 25));
  }
}

async function print(html: Buffer, executable: string, signal: AbortSignal): Promise<Buffer> {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-automation-pdf-'));
  await fs.chmod(profile, 0o700);
  let child: ChildProcess | undefined;
  let socket: WebSocket | undefined;
  let nextId = 0;
  let launchFailed = false;
  const pending = new Map<number, { resolve: (reply: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const deadline = Date.now() + 60_000;
  const assertActive = () => { if (signal.aborted || Date.now() >= deadline) throw new Error('PDF rendering stopped'); };
  const rejectPending = () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('PDF rendering stopped')); } pending.clear(); };
  const abort = () => { rejectPending(); socket?.close(); if (child) child.kill('SIGTERM'); };
  signal.addEventListener('abort', abort, { once: true });
  const call = (method: string, params: object = {}): Promise<Reply> => {
    assertActive();
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('PDF rendering timed out')); }, Math.min(15_000, deadline - Date.now()));
      pending.set(id, { resolve, reject, timer });
      try { socket!.send(JSON.stringify({ id, method, params })); } catch { clearTimeout(timer); pending.delete(id); reject(new Error('PDF browser unavailable')); }
    });
  };
  try {
    assertActive();
    child = spawn(executable, ['--headless=new', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', detached: process.platform === 'linux' });
    child.on('error', () => { launchFailed = true; rejectPending(); });
    let port = 0;
    while (!port) {
      assertActive();
      if (launchFailed || child.exitCode !== null || child.signalCode !== null) throw new Error('PDF browser unavailable');
      try {
        const raw = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
        const value = Number(raw);
        if (Number.isInteger(value) && value > 0 && value <= 65535) port = value;
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (!port) await new Promise(resolve => setTimeout(resolve, 50));
    }
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.any([signal, AbortSignal.timeout(Math.min(5000, deadline - Date.now()))]) });
    const pages = await response.json() as { type?: string; webSocketDebuggerUrl?: string }[];
    const address = pages.find(page => page.type === 'page')?.webSocketDebuggerUrl;
    if (!address || new URL(address).host !== `127.0.0.1:${port}` || new URL(address).protocol !== 'ws:') throw new Error('PDF browser endpoint invalid');
    socket = new WebSocket(address);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PDF browser connection timed out')), 5000);
      socket!.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket!.addEventListener('error', () => { clearTimeout(timer); reject(new Error('PDF browser unavailable')); }, { once: true });
    });
    socket.addEventListener('close', rejectPending);
    socket.addEventListener('message', event => {
      let reply: { id?: number; error?: unknown; result?: Reply };
      try { reply = JSON.parse(String(event.data)) as typeof reply; } catch { rejectPending(); return; }
      if (reply.id === undefined) return;
      const item = pending.get(reply.id);
      if (!item) return;
      clearTimeout(item.timer); pending.delete(reply.id);
      if (reply.error) item.reject(new Error('PDF browser command failed')); else item.resolve(reply.result ?? {});
    });
    await call('Page.enable');
    await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'file://*', 'ftp://*'] });
    await call('Page.setDownloadBehavior', { behavior: 'deny' });
    await call('Emulation.setScriptExecutionDisabled', { value: true });
    const tree = await call('Page.getFrameTree');
    if (!tree.frameTree?.frame.id) throw new Error('PDF browser frame unavailable');
    await call('Page.setDocumentContent', { frameId: tree.frameTree.frame.id, html: html.toString('utf8') });
    // Bundled data-URL fonts: wait for layout readiness without executing document scripts.
    await call('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true, returnByValue: true });
    // Paper has no disclosure control; print the retained context and pending evidence too.
    await call('Runtime.evaluate', { expression: 'document.querySelectorAll("details").forEach(item => { item.open = true; })' });
    // Paper has no clickable links: expose retained citation-register URLs as visible text (P1-09).
    // Print-only DOM preparation scoped to register anchors: empty, internal (#) and already-visible
    // URLs are skipped so pdf-format registers never double-print; quotes and body links untouched.
    await call('Runtime.evaluate', { expression: `(() => {
      for (const anchor of document.querySelectorAll('.citation-register a[href]')) {
        const href = anchor.getAttribute('href') ?? '';
        if (!href || href.startsWith('#') || (anchor.textContent ?? '').includes(href)) continue;
        anchor.append(' (' + href + ')');
      }
      const style = document.createElement('style');
      style.textContent = '.citation-register a{overflow-wrap:anywhere;word-break:break-all}';
      document.head.appendChild(style);
    })()` });
    const result = await call('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, transferMode: 'ReturnAsStream' });
    if (!result.stream) throw new Error('PDF stream unavailable');
    const chunks: Buffer[] = [];
    let length = 0;
    try {
      while (true) {
        const chunk = await call('IO.read', { handle: result.stream, size: 65536 });
        const bytes = Buffer.from(chunk.data ?? '', chunk.base64Encoded ? 'base64' : 'utf8');
        length += bytes.length;
        if (length > MAX_PDF_BYTES) throw new Error('PDF exceeds output bound');
        chunks.push(bytes);
        if (chunk.eof) break;
      }
    } finally { await call('IO.close', { handle: result.stream }).catch(() => undefined); }
    const pdf = Buffer.concat(chunks);
    if (pdf.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('PDF output invalid');
    return pdf;
  } finally {
    signal.removeEventListener('abort', abort);
    rejectPending(); socket?.close();
    if (child) await stopChild(child);
    // profile is the exact directory returned by mkdtemp, never a caller-supplied root.
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
