import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ShopeePublicReviewCollector, mapPublicReviewResult } from '../../src/platform/collectors/shopee-public-reviews.js';
import { buildPublicReviewCorpus, publicReviewOutcome } from '../../src/modules/analysis/research-automation/public-shopee-bridge.js';
import { classifyPublicExactShopee } from '../../src/modules/analysis/research-automation/exact-shopee-outcome.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { FakeClock, FakeTransport, ORIGIN, retainedFiles, successfulScript } from './shopee-public-fakes.js';
import { IDS, PRODUCTS, TOKEN, job } from '../fixtures/shopee-public-results.js';
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
export function verifiedProjection(envelopes: any[]): any {
  let offset = 0;
  const pages = envelopes.map(e => { const bytes = Buffer.from(canonicalJson(e.rows)), p = { bytes, sha256: sha(bytes), offset }; offset += e.rows.length; return p; });
  return { sha256: 'a'.repeat(64), packet: { collectionId: '10000000-0000-4000-8000-000000000099', requestSha256: 'c'.repeat(64), confirmedSourceSetSha256: 'd'.repeat(64),
    providerId: 'shopee-public-review', selected: envelopes.map(e => ({ platform: 'shopee', shopId: e.shopId, itemId: e.itemId, productUrl: e.productUrl })), listings: [], attemptedAt: '2026-02-01T00:00:00.000Z', reused: false }, pages, envelopes };
}
export function corpusProjection(envelopes: any[]): any {
  const actual = buildPublicReviewCorpus(verifiedProjection(envelopes));
  const { capturedReviewRecords, ...coverage } = actual.coverage;
  return { ...actual, counts: { ...coverage, admittedReviewRecords: capturedReviewRecords }, recordGroups: actual.records.map(g => {
    const e = envelopes.flatMap(e => e.rows).find(r => r.reviewId === g.identity.nativeReviewId && `shopee:${r.shopId}:${r.itemId}` === g.identity.listingKey);
    return { ...e, ...g, reviewId: g.identity.nativeReviewId, sourceRefs: g.versions.flatMap(v => v.sourceRefs), textState: g.versions[0]?.textState };
  }) };
}
export function receiptProjection(collected: any): any[] {
  const source = { ...verifiedProjection(collected.envelopes), packet: { ...verifiedProjection(collected.envelopes).packet, selected: collected.listings.map((r: any) => ({ shopId:r.shopId,itemId:r.itemId,productUrl:r.productUrl, platform: 'shopee' })), listings: collected.listings } };
  const outcome = publicReviewOutcome(source, { maxReviewsPerProduct: collected.maxReviewsPerProduct } as any);
  return collected.listings.map((r: any, i: number) => ({ ...r, stopReason: r.timedOut ? 'TIMEOUT' : r.stopCode ?? r.stopReason, admittedReviewRecords: outcome.listings[i]?.reviews ?? 0 }));
}
export function classifyProjection(receipts: any[], cap: number): any {
  const codes: Record<string,string> = { PROTOCOL_ERROR: 'SHOPEE_REVIEW_INVALID_RESPONSE', UNKNOWN_STATE: 'SHOPEE_REVIEW_INVALID_RESPONSE', RESULT_UNAVAILABLE: 'SHOPEE_REVIEW_INVALID_RESPONSE', OVERSIZE: 'SHOPEE_REVIEW_LIMIT', GET_RETRIES_EXHAUSTED: 'SHOPEE_REVIEW_HTTP_5XX', TIMEOUT: 'SHOPEE_REVIEW_TIMEOUT' };
  const mapped = receipts.map(r => ({ ...r, stopCode: r.stopCode ?? (r.appStopCode ? codes[r.appStopCode] ?? (r.appStopCode.startsWith('HTTP_') ? 'SHOPEE_REVIEW_'+r.appStopCode : r.appStopCode) : null),
    stopReason: typeof r.stopReason === 'string' && r.stopReason !== 'OTHER_OR_MISSING' ? r.stopReason.toLowerCase() : 'OTHER_OR_MISSING', timedOut: r.timedOut ?? r.appObservedTimeout ?? false }));
  const selected=receipts.map((_,i)=>PRODUCTS[i]??PRODUCTS[0]!);
  const outcome=publicReviewOutcome({packet:{selected,listings:mapped,attemptedAt:'2026-02-01T00:00:00.000Z',reused:false}} as any,{maxReviewsPerProduct:cap} as any,
    {records:receipts.flatMap((r,i)=>Array.from({length:r.admittedReviewRecords??0},()=>({disposition:'RETAINED_RAW',identity:{listingKey:`shopee:${selected[i]!.shopId}:${selected[i]!.itemId}`}})))} as any);
  assert.equal(outcome.outcome,classifyPublicExactShopee({receipts:mapped,counts:outcome.listings,maxReviewsPerProduct:cap}));
  return outcome;
}
/** Disk-write failure persists the exact prefix, then disables all subsequent writes like a dead process. */
export async function withCollectorCrash<T>(point: string | undefined, operation: (fetcher?: typeof fetch) => Promise<T>, fetcher: typeof fetch): Promise<T> {
  if (!point) return operation();
  const rename = fs.rename; let dead = false, polls = 0;
  const die = (): never => { dead = true; throw new Error('Synthetic process exit'); };
  fs.rename = (async (from: any, to: any) => {
    if (dead) die();
    let j: any; if (String(to).endsWith('.json')) { try { j = JSON.parse(await fs.readFile(from, 'utf8')); } catch {} }
    if (j && (point === 'before-intent' && j.intentAt && !j.job || point === 'after-202-before-fsync' && j.job && !j.terminal)) die();
    await rename(from,to);
    if (j && (point === 'after-intent-before-dispatch' && j.intentAt && j.requestCount === 2 || point === 'after-durable-id-before-poll' && j.job && j.requestCount === 3 || point === 'after-terminal-snapshot' && j.terminal)) die();
  }) as typeof fs.rename;
  const wrapped: typeof fetch = async (input, init) => {
    const response = await fetcher(input,init);
    if (point === 'after-accepted-before-id' && init?.method === 'POST') die();
    if (point === 'during-poll' && /\/jobs\/[^/]+$/u.test(String(input)) && init?.method === 'GET' && ++polls === 1) die();
    return response;
  };
  try { return await operation(wrapped); } finally { fs.rename = rename; }
}
export async function observeBudgets(operation: string, remaining: number) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-budget-')), clock = new FakeClock(20), abort = new AbortController();
  const full = successfulScript([20,20]);
  const script = [full[0]!,full[1]!,full[2]!,full[5]!,full[6]!,full[7]!,full[8]!,full[9]!,full[10]!,full[13]!,full[14]!,full[15]!];
  script[5]!.inspect = () => { clock.milliseconds=Date.parse('2026-02-01T00:00:00.000Z')+4800000-remaining; };
  if(operation==='cancel') {
    script[9]!.body=job(1,'running'); script[9]!.inspect=()=>abort.abort();
    script.splice(10,2,{method:'POST',path:`/jobs/${IDS[1]}/cancel`,status:202,body:job(1,'running')});
  }
  let latest = 0, observed = 0;
  const set = globalThis.setTimeout;
  globalThis.setTimeout = ((handler: any, ms: number, ...args: any[]) => { latest = ms; return set(handler,ms,...args); }) as typeof setTimeout;
  const transport = new FakeTransport(script);
  const target = operation === 'health' ? '/health' : operation === 'list' ? '/jobs?limit=100' : operation === 'submit' ? '/jobs' : `/jobs/${IDS[1]}${operation === 'result' ? '/result' : operation === 'cancel' ? '/cancel' : ''}`;
  const fetcher: typeof fetch = async (input,init) => { if (transport.posts().length >= (operation === 'submit' ? 1 : 2) || operation === 'health' || operation === 'list') if (String(input) === ORIGIN+target) observed = latest; return transport.fetch(input,init); };
  try { await new ShopeePublicReviewCollector({ token:TOKEN, baseUrl:ORIGIN,journalRoot:root,confirmedSourceSetSha256:'a'.repeat(64),maxReviewsPerProduct:20,fetch:fetcher,clock:clock.now,sleep:clock.sleep }).collect(PRODUCTS.slice(0,2).map(p=>({...p,platform:'shopee' as const})),'b'.repeat(64),'synthetic-budget',abort.signal);
    assert.ok(observed, 'target request timer observed'); return { request:observed, body:observed, sleep:Math.max(0,...clock.sleeps.filter(ms=>ms<=remaining)) };
  } finally { globalThis.setTimeout = set; await fs.rm(root,{recursive:true,force:true}); }
}
export async function journalProjection(root: string) {
  const journals = [...(await retainedFiles(root)).values()].filter(b => b.toString().startsWith('{')).map(b=>JSON.parse(b.toString()));
  const j = journals.find(j=>j.intentAt); assert.ok(j);
  return { ...j, deadlineAt:j.deadline, acquisitionDeadlineAt:j.acquisitionDeadline, firstIntentAt:j.intentAt };
}
export const sanitizeProjection = (value: unknown, p=0): any => mapPublicReviewResult(value,job(p) as any,{...PRODUCTS[p]!,platform:'shopee'},20);
