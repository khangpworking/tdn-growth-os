import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){if(/playwright|chromium/iu.test(specifier))throw new Error('Browser import forbidden');return next(specifier,context);}});
globalThis.fetch=async()=>{throw new Error('Network forbidden in synthetic public tests');};
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { AT, IDS, PRODUCTS, READY, job, result, row } from '../fixtures/shopee-public-results.js';

export const ORIGIN = 'http://127.0.0.1:8877';
export interface Invocation { method: string; url: string; init: RequestInit; at: number }
export interface Exchange { method: 'GET' | 'POST'; path: string; status?: number; body?: unknown; response?: () => Response | Promise<Response>; inspect?: (call: Invocation) => void; error?: Error }
/** Exact ordered expectations; an accidental real fetch can never occur. */
export class FakeTransport {
  readonly calls: Invocation[] = [];
  readonly unlisted: Array<{ method: string; url: string }> = [];
  constructor(readonly exchanges: Exchange[], readonly time = () => Date.parse(AT), readonly origin = ORIGIN) {}
  readonly fetch: typeof fetch = async (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const call = { method, url, init, at: this.time() };
    this.calls.push(call);
    const next = this.exchanges.shift();
    if (!next || url !== this.origin + next.path || method !== next.method) this.unlisted.push({ method, url });
    assert.ok(next, `Unlisted transport invocation ${method} ${new URL(url).pathname}`);
    assert.equal(url, this.origin + next.path, 'unlisted URL');
    assert.equal(method, next.method, 'unlisted method');
    next.inspect?.(call);
    if (next.error) throw next.error;
    return next.response ? next.response() : Response.json(next.body ?? {}, { status: next.status ?? 200 });
  };
  done() {
    assert.equal(this.unlisted.length, 0, 'unlisted invocation was caught by application code');
    assert.equal(this.exchanges.length, 0, 'expected transport invocations left unused');
  }
  posts() { return this.calls.filter(c => c.method === 'POST' && new URL(c.url).pathname === '/jobs'); }
}
export class FakeClock {
  milliseconds = Date.parse(AT);
  readonly sleeps: number[] = [];
  constructor(readonly maxSleeps = 12) {}
  readonly now = () => new Date(this.milliseconds);
  sleep = async (milliseconds: number, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    assert.ok(Number.isFinite(milliseconds) && milliseconds >= 0);
    assert.ok(this.sleeps.length < this.maxSleeps, 'fake loop exceeded its bound');
    this.sleeps.push(milliseconds); this.milliseconds += milliseconds;
    signal?.throwIfAborted();
  };
  advance(milliseconds: number) { this.milliseconds += milliseconds; }
}
export function successfulScript(counts: readonly number[] = [20], cap = 20): Exchange[] {
  return counts.flatMap((count, p) => {
    const terminal = job(p, 'succeeded', { result_available: true, collected: count }, cap);
    return [
      { method: 'GET', path: '/health', body: READY }, { method: 'GET', path: '/jobs?limit=100', body: [] },
      { method: 'POST', path: '/jobs', status: 202, body: job(p, 'queued', {}, cap), inspect(call) {
        assert.deepEqual(JSON.parse(String(call.init.body)), { url: PRODUCTS[p]!.productUrl, max_comments: cap });
      } },
      { method: 'GET', path: `/jobs/${IDS[p]}`, body: job(p, 'queued', {}, cap) },
      { method: 'GET', path: `/jobs/${IDS[p]}`, body: job(p, 'running', {}, cap) },
      { method: 'GET', path: `/jobs/${IDS[p]}`, body: terminal },
      { method: 'GET', path: `/jobs/${IDS[p]}/result`, body: result(p, Array.from({ length: count }, (_, n) => row(p, { review_id: `synthetic-${n}` }))) },
      { method: 'GET', path: `/jobs/${IDS[p]}`, body: terminal },
    ] satisfies Exchange[];
  });
}
export async function temporaryPublicStore(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-public-'));
  await fs.chmod(root, 0o700);
  const databasePath = path.join(root, 'state.sqlite');
  const journalRoot = path.join(root, 'research-automation-shopee-public-journal');
  const artifactRoot = path.join(root, 'artifacts');
  let db = openDatabase({ databasePath, now: () => new Date(AT) }).db;
  t.after(async () => { try { db.close(); } catch {} await fs.rm(root, { recursive: true, force: true }); });
  return { root, databasePath, journalRoot, artifactRoot, get db() { return db; }, reopen() { db.close(); db = openDatabase({ databasePath, now: () => new Date(AT) }).db; return db; } };
}
export async function retainedFiles(root: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  for (const entry of await fs.readdir(root, { recursive: true, withFileTypes: true })) {
    const full = path.join(entry.parentPath, entry.name);
    assert.equal(entry.isSymbolicLink(), false, 'unexpected symlink in retained evidence');
    if (entry.isFile()) files.set(path.relative(root, full), await fs.readFile(full));
  }
  return files;
}
export async function assertNoRawLeak(root: string, sentinels: readonly string[], extra: readonly unknown[] = []) {
  for (const [name, bytes] of await retainedFiles(root)) for (const sentinel of sentinels) assert.equal(bytes.includes(Buffer.from(sentinel)), false, `raw sentinel in ${name}`);
  for (const value of extra) for (const sentinel of sentinels) assert.equal(String(typeof value === 'string' ? value : JSON.stringify(value)).includes(sentinel), false);
}
export function throwingSpy(label: string) {
  const calls: unknown[][] = [];
  const invoke = (...args: unknown[]): never => { calls.push(args); throw new Error(`Unexpected ${label} invocation`); };
  return { calls, invoke };
}
/** A finite stream with a cancellation witness, independent of Content-Length. */
export function streamedResponse(chunks: Uint8Array[], headers: HeadersInit = {}) {
  let cancelled = false;
  let read = 0;
  const response = new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (read === chunks.length) controller.close(); else controller.enqueue(chunks[read++]!);
  }, cancel() { cancelled = true; } }, {highWaterMark:0}), { headers });
  return { response, get cancelled() { return cancelled; }, get chunksRead() { return read; } };
}
