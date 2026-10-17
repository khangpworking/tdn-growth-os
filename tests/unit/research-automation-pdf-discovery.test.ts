import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { request, RequestOptions } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { CaptureLog, type ProviderTransport } from '../../src/modules/analysis/research-automation/provider-common.js';
import { planExpandedSearch } from '../../src/modules/analysis/research-automation/expanded-search-queries.js';
import {
  PDF_DISCOVERY_MAX_BYTES, createPinnedPdfFetch, checkPdfUrl, createPdfDiscoverySource, guardedPdfDownload, isBlockedAddress, isBlockedHost, pdfCandidates,
  pdfDiscoveryDocument, pdfDiscoveryEnabled, pdfDiscoveryFailed, pdfDiscoveryUsage, validPdfDiscovery, type PdfResolver,
} from '../../src/modules/analysis/research-automation/pdf-discovery-lane.js';

const PDF = (label: string) => Buffer.from(`%PDF-1.4\n% synthetic ${label}\n%%EOF\n`, 'latin1');
const publicDns: PdfResolver = async () => ['203.0.113.10'];

type Route = (url: URL, init?: RequestInit) => Response;
function fakeTransport(route: Route) {
  const seen: { url: string; init: RequestInit | undefined }[] = [];
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      seen.push({ url: url.toString(), init });
      return route(url, init);
    }) as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse('2026-10-17T00:00:00.000Z'),
  };
  return { transport, seen };
}
const log = (transport: ProviderTransport) => new CaptureLog('PDF-DISCOVERY', transport, undefined, 2);
const pdfResponse = (bytes: Buffer) => new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'application/pdf' } });

test('flag is on only for the exact value "1"', () => {
  assert.equal(pdfDiscoveryEnabled({ TDN_RESEARCH_PDF_DISCOVERY_ENABLED: '1' }), true);
  for (const value of [undefined, '', '0', 'true', ' 1', '1 ', 'yes']) assert.equal(pdfDiscoveryEnabled({ TDN_RESEARCH_PDF_DISCOVERY_ENABLED: value }), false);
});

test('candidates: .pdf path only, https, allowed host, row order, dedup by page identity', () => {
  const rows = [
    { url: 'https://bao-cao.example/nganh/2026.pdf' },
    { url: 'https://bao-cao.example/nganh/2026.pdf#trang-2' },
    { url: 'https://bao-cao.example/nganh/trang.html' },
    { url: 'http://bao-cao.example/khong-an-toan.pdf' },
    { url: 'https://shopee.example/file/bao-cao.pdf' },
    { url: 'https://down.tiktok.example/x.pdf' },
    { url: 'https://cdn.youtube.example/a.pdf' },
    { url: 'https://10.0.0.1/a.pdf' },
    { url: 'https://thong-ke.example/so-lieu.PDF' },
  ];
  const seen = new Set<string>();
  assert.deepEqual(pdfCandidates(rows, 'RUN_ROWS', seen).map(c => [c.url, c.origin]), [
    ['https://bao-cao.example/nganh/2026.pdf', 'RUN_ROWS'],
    ['https://thong-ke.example/so-lieu.PDF', 'RUN_ROWS'],
  ]);
  assert.deepEqual(pdfCandidates([{ url: 'https://bao-cao.example/nganh/2026.pdf' }, { url: 'https://moi.example/b.pdf' }], 'PDF_SEARCH', seen).map(c => c.url),
    ['https://moi.example/b.pdf'], 'the shared set dedups across sources');
  for (const host of ['shopee.example', 'm.facebook.example', 'lazada.example', 'youtube.example', 'tiktok.example', 'shopee.example']) assert.equal(isBlockedHost(host), true, host);
  assert.equal(isBlockedHost('bao-cao.example'), false);
});

test('URL rule: https, port 443, no credentials, DNS name only', () => {
  assert.ok(checkPdfUrl('https://bao-cao.example/a.pdf'));
  assert.ok(checkPdfUrl('https://bao-cao.example:443/a.pdf'));
  for (const raw of ['http://bao-cao.example/a.pdf', 'https://bao-cao.example:8443/a.pdf', 'https://u:p@bao-cao.example/a.pdf', 'https://127.0.0.1/a.pdf',
    'https://[::1]/a.pdf', 'https://2130706433/a.pdf', 'https://localhost/a.pdf', 'https://app.localhost/a.pdf', 'https://intranet/a.pdf', 'file:///synthetic.pdf', 'not a url']) {
    assert.equal(checkPdfUrl(raw), null, raw);
  }
});

test('DNS answer rule: private, reserved and mapped addresses are refused', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '192.0.0.1', '198.18.0.1', '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', '0000::1', '0000:0000:0000:0000:0000:ffff:7f00:1', 'fec0::1', 'fc00::1', 'fd12:3456::1', 'fe80::1%eth0', 'ff02::1', '2001:db8::1', '2001:0db8::1', '64:ff9b::a00:1', 'nonsense']) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['203.0.113.10', '198.51.100.10', '172.32.0.1', '3fff::1', '::ffff:203.0.113.10']) assert.equal(isBlockedAddress(ip), false, ip);
});

test('download: success, manual redirect, no cookie or auth header, capture recorded', async () => {
  const bytes = PDF('a');
  const { transport, seen } = fakeTransport(url => url.pathname === '/old.pdf'
    ? new Response(null, { status: 302, headers: { location: '/nganh/2026.pdf' } })
    : pdfResponse(bytes));
  const outcome = await guardedPdfDownload({ download: transport.fetch, transport, resolve: publicDns, log: log(transport), url: 'https://bao-cao.example/old.pdf' });
  assert.equal(outcome.kind, 'DOWNLOADED');
  if (outcome.kind !== 'DOWNLOADED') return;
  assert.deepEqual(outcome.bytes, bytes);
  assert.equal(outcome.capture.operation, 'pdfdiscovery.download');
  assert.deepEqual(seen.map(s => s.url), ['https://bao-cao.example/old.pdf', 'https://bao-cao.example/nganh/2026.pdf']);
  for (const { init } of seen) {
    assert.equal(init?.redirect, 'manual');
    assert.equal(init?.credentials, 'omit');
    const headers = new Headers(init?.headers);
    assert.equal(headers.has('cookie'), false);
    assert.equal(headers.has('authorization'), false);
  }
});

test('download: every redirect hop is re-checked (scheme, host, DNS answer)', async () => {
  const cases: [string, PdfResolver, string][] = [
    ['http://bao-cao.example/a.pdf', publicDns, 'URL_REFUSED'],
    ['https://169.254.169.254/latest', publicDns, 'URL_REFUSED'],
    ['https://shopee.example/a.pdf', publicDns, 'URL_REFUSED'],
    ['https://noi-bo.example/a.pdf', async host => host === 'noi-bo.example' ? ['10.0.0.5'] : ['203.0.113.10'], 'PRIVATE_ADDRESS'],
    ['https://hai-dia-chi.example/a.pdf', async host => host === 'hai-dia-chi.example' ? ['203.0.113.10', '127.0.0.1'] : ['203.0.113.10'], 'PRIVATE_ADDRESS'],
  ];
  for (const [target, resolve, reason] of cases) {
    const { transport, seen } = fakeTransport(url => url.hostname === 'bao-cao.example' && url.pathname === '/start.pdf'
      ? new Response(null, { status: 301, headers: { location: target } }) : pdfResponse(PDF('x')));
    const outcome = await guardedPdfDownload({ download: transport.fetch, transport, resolve, log: log(transport), url: 'https://bao-cao.example/start.pdf' });
    assert.deepEqual(outcome, { kind: 'FAILED', reason, requested: true }, target);
    assert.equal(seen.length, 1, `no request to ${target}`);
  }
});

test('download: refused before any request (http, IP literal, private DNS, DNS failure)', async () => {
  const { transport, seen } = fakeTransport(() => pdfResponse(PDF('x')));
  const l = log(transport);
  assert.deepEqual(await guardedPdfDownload({ download: transport.fetch, transport, resolve: publicDns, log: l, url: 'http://bao-cao.example/a.pdf' }), { kind: 'FAILED', reason: 'URL_REFUSED', requested: false });
  assert.deepEqual(await guardedPdfDownload({ download: transport.fetch, transport, resolve: publicDns, log: l, url: 'https://192.168.1.1/a.pdf' }), { kind: 'FAILED', reason: 'URL_REFUSED', requested: false });
  assert.deepEqual(await guardedPdfDownload({ download: transport.fetch, transport, resolve: async () => ['192.168.0.10'], log: l, url: 'https://bao-cao.example/a.pdf' }), { kind: 'FAILED', reason: 'PRIVATE_ADDRESS', requested: false });
  assert.deepEqual(await guardedPdfDownload({ download: transport.fetch, transport, resolve: async () => { throw new Error('ENOTFOUND'); }, log: l, url: 'https://bao-cao.example/a.pdf' }), { kind: 'FAILED', reason: 'DNS_FAILED', requested: false });
  assert.deepEqual(await guardedPdfDownload({ download: transport.fetch, transport, resolve: async () => [], log: l, url: 'https://bao-cao.example/a.pdf' }), { kind: 'FAILED', reason: 'DNS_FAILED', requested: false });
  assert.equal(seen.length, 0);
});

test('download: more than 3 redirects is refused', async () => {
  const { transport, seen } = fakeTransport(url => new Response(null, { status: 302, headers: { location: `/hop-${Number(url.pathname.replace(/\D/gu, '') || 0) + 1}.pdf` } }));
  const outcome = await guardedPdfDownload({ download: transport.fetch, transport, resolve: publicDns, log: log(transport), url: 'https://bao-cao.example/hop-0.pdf' });
  assert.deepEqual(outcome, { kind: 'FAILED', reason: 'TOO_MANY_REDIRECTS', requested: true });
  assert.equal(seen.length, 4, 'the first request plus 3 redirects');
});

test('download: size cap by header and while streaming, signature check, HTTP error', async () => {
  const big = fakeTransport(() => new Response(PDF('a'), { status: 200, headers: { 'content-length': String(PDF_DISCOVERY_MAX_BYTES + 1) } }));
  assert.deepEqual(await guardedPdfDownload({ download: big.transport.fetch, transport: big.transport, resolve: publicDns, log: log(big.transport), url: 'https://bao-cao.example/a.pdf' }),
    { kind: 'FAILED', reason: 'FILE_SIZE_LIMIT', requested: true });
  const streamed = fakeTransport(() => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(PDF('a'))); c.enqueue(new Uint8Array(64)); c.close(); } }), { status: 200 }));
  assert.deepEqual(await guardedPdfDownload({ download: streamed.transport.fetch, transport: streamed.transport, resolve: publicDns, log: log(streamed.transport), url: 'https://bao-cao.example/a.pdf', maxBytes: 40 }),
    { kind: 'FAILED', reason: 'FILE_SIZE_LIMIT', requested: true });
  const html = fakeTransport(() => new Response('<html>not a report</html>', { status: 200 }));
  assert.deepEqual(await guardedPdfDownload({ download: html.transport.fetch, transport: html.transport, resolve: publicDns, log: log(html.transport), url: 'https://bao-cao.example/a.pdf' }),
    { kind: 'FAILED', reason: 'NOT_A_PDF', requested: true });
  const missing = fakeTransport(() => new Response('gone', { status: 404 }));
  assert.deepEqual(await guardedPdfDownload({ download: missing.transport.fetch, transport: missing.transport, resolve: publicDns, log: log(missing.transport), url: 'https://bao-cao.example/a.pdf' }),
    { kind: 'FAILED', reason: 'HTTP_ERROR', requested: true });
});

test('download: timeout and cancel', async t => {
  const alive = setInterval(() => {}, 1000); t.after(() => clearInterval(alive));
  const hang: ProviderTransport = {
    fetch: ((_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as typeof fetch,
    sleep: async () => {}, now: () => Date.parse('2026-10-17T00:00:00.000Z'),
  };
  assert.deepEqual(await guardedPdfDownload({ download: hang.fetch, transport: hang, resolve: publicDns, log: log(hang), url: 'https://bao-cao.example/a.pdf', timeoutMs: 20 }),
    { kind: 'FAILED', reason: 'TIMEOUT', requested: true });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10);
  assert.deepEqual(await guardedPdfDownload({ download: hang.fetch, transport: hang, resolve: publicDns, log: log(hang), url: 'https://bao-cao.example/a.pdf', signal: controller.signal }),
    { kind: 'FAILED', reason: 'CANCELLED', requested: true });
  assert.deepEqual(await guardedPdfDownload({ download: hang.fetch, transport: hang, resolve: publicDns, log: log(hang), url: 'https://bao-cao.example/a.pdf', signal: AbortSignal.abort() }),
    { kind: 'FAILED', reason: 'CANCELLED', requested: false });
});

test('source download: sequential, deduplicated by bytes, at most 2 requests', async () => {
  const same = PDF('same');
  const { transport, seen } = fakeTransport(url => url.pathname === '/c.pdf' ? pdfResponse(PDF('c')) : pdfResponse(same));
  const source = createPdfDiscoverySource('synthetic-serp-key', transport, publicDns, transport.fetch);
  const run = await source.download([
    { url: 'https://bao-cao.example/a.pdf', origin: 'RUN_ROWS' },
    { url: 'https://ban-sao.example/a.pdf', origin: 'RUN_ROWS' },
    { url: 'https://bao-cao.example/c.pdf', origin: 'PDF_SEARCH' },
  ]);
  assert.equal(run.requests, 2);
  assert.deepEqual(run.items.map(i => i.kind === 'FAILED' ? i.reason : i.kind), ['DOWNLOADED', 'DUPLICATE']);
  assert.equal(seen.length, 2, 'the request cap stops the third candidate');
  const two = fakeTransport(url => pdfResponse(PDF(url.pathname)));
  const kept = await createPdfDiscoverySource('k', two.transport, publicDns, two.transport.fetch).download(['/1.pdf', '/2.pdf', '/3.pdf'].map(p => ({ url: `https://bao-cao.example${p}`, origin: 'RUN_ROWS' as const })));
  assert.deepEqual(kept.items.map(i => i.kind), ['DOWNLOADED', 'DOWNLOADED']);
  assert.equal(two.seen.length, 2);
  const refused = await createPdfDiscoverySource('k', two.transport, async () => ['10.0.0.1'], two.transport.fetch).download([{ url: 'https://bao-cao.example/x.pdf', origin: 'RUN_ROWS' }]);
  assert.equal(refused.requests, 0, 'a refusal before the request is not counted');
});

test('source search: one call with the fixed PDF query, no retry', async () => {
  const { transport, seen } = fakeTransport(() => new Response('upstream busy', { status: 503 }));
  const source = createPdfDiscoverySource('synthetic-serp-key', transport, publicDns, transport.fetch);
  const input = { runId: '22222222-2222-4222-8222-222222222222', mode: 'CATEGORY' as const, keyword: 'thạch dừa', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, country: 'VN' as const, selectedProductRefs: [], peerProductRefs: [] };
  const attempt = await source.search(input);
  assert.equal(seen.length, 1, 'one call, never retried');
  assert.equal(new URL(seen[0]!.url).searchParams.get('q'), 'thạch dừa báo cáo filetype:pdf');
  assert.ok(attempt.state === 'CALLED' || attempt.state === 'THROWN');
});

test('query plan: file type appends the fixed words and needs the exact keyword', () => {
  const [plan] = planExpandedSearch({ version: 'expanded-search-request-v1', confirmedProducts: [], confirmedBrands: [], requestedWindow: null, siteDomain: null, exactKeyword: 'thạch dừa', fileType: 'pdf' });
  assert.equal(plan!.parameters.q, 'thạch dừa báo cáo filetype:pdf');
  assert.throws(() => planExpandedSearch({ version: 'expanded-search-request-v1', confirmedProducts: ['a'], confirmedBrands: [], requestedWindow: null, siteDomain: null, fileType: 'pdf' }));
  assert.throws(() => planExpandedSearch({ version: 'expanded-search-request-v1', confirmedProducts: [], confirmedBrands: [], requestedWindow: null, siteDomain: null, exactKeyword: 'a filetype:exe' }));
});

test('stored field: valid shapes, refusals, usage', () => {
  assert.equal(validPdfDiscovery(pdfDiscoveryFailed('SEARCH_FAILED')), true);
  const skipped = { status: 'SKIPPED' as const, reason: 'SEARCH_SKIPPED_ENOUGH' as const, captureIndex: null, retrievedAt: null };
  const ok = {
    search: skipped, reason: null,
    files: [{ origin: 'RUN_ROWS', url: 'https://bao-cao.example/a.pdf', status: 'DOWNLOADED', reason: null, captureIndex: 4, retrievedAt: '2026-10-17T00:00:00.000Z', sourceSha256: 'a'.repeat(64), byteSize: 10 },
      { origin: 'PDF_SEARCH', url: 'https://bao-cao.example/b.pdf', status: 'FAILED', reason: 'NOT_A_PDF', captureIndex: null, retrievedAt: null, sourceSha256: null, byteSize: null }],
  };
  assert.equal(validPdfDiscovery(ok), true);
  assert.equal(validPdfDiscovery({ ...ok, files: [{ ...ok.files[0]!, url: 'http://bao-cao.example/a.pdf' }] }), false);
  assert.equal(validPdfDiscovery({ ...ok, files: [{ ...ok.files[1]!, reason: null }] }), false);
  assert.equal(validPdfDiscovery({ ...ok, files: [{ ...ok.files[0]!, byteSize: PDF_DISCOVERY_MAX_BYTES + 1 }] }), false);
  assert.equal(validPdfDiscovery({ ...ok, search: { ...skipped, status: 'CALLED' } }), false, 'a called search names its capture');
  assert.equal(validPdfDiscovery({ ...ok, reason: 'SOMETHING' }), false);
  assert.equal(validPdfDiscovery(null), false);
  const empty = pdfDiscoveryDocument(skipped, null, [], 'NO_CANDIDATE');
  assert.deepEqual(empty, { search: skipped, files: [], reason: 'NO_CANDIDATE' });
  assert.deepEqual(pdfDiscoveryUsage(2), { provider: 'PDF-DISCOVERY', usage: { requestsIssued: 2, paidRequestsIssued: 0, ambiguousPaidRequests: 0, credits: { status: 'NONE_USED' } } });
});


test('pinned socket uses only checked addresses on every redirect, preserves TLS hostname and sends no credentials', async () => {
  const sockets: { host: string; addresses: unknown }[] = [];
  const requestStub = ((url: URL, options: RequestOptions, reply: (response: IncomingMessage) => void) => {
    assert.equal(options.agent, false, 'a fresh connection cannot reuse an unvalidated socket');
    assert.deepEqual(options.headers, { accept: 'application/pdf' });
    assert.equal(options.auth, undefined);
    assert.equal(options.rejectUnauthorized, undefined, 'normal TLS certificate validation stays enabled');
    const req = new EventEmitter() as EventEmitter & { end(): void };
    req.end = () => {
      const lookup = options.lookup!;
      lookup(url.hostname, { all: true }, (error: Error | null, addresses: unknown) => {
        assert.equal(error, null);
        sockets.push({ host: url.hostname, addresses });
        const response = Readable.from([PDF('pinned')]) as IncomingMessage;
        Object.assign(response, { statusCode: sockets.length === 1 ? 302 : 200,
          headers: sockets.length === 1 ? { location: 'https://redirect.example/a.pdf' } : {} });
        reply(response);
      });
    };
    return req;
  }) as unknown as typeof request;
  let resolutions = 0;
  const { transport } = fakeTransport(() => { throw new Error('generic fetch must never download'); });
  const outcome = await guardedPdfDownload({ transport, download: createPinnedPdfFetch(requestStub),
    resolve: async () => { resolutions++; return [resolutions === 1 ? '203.0.113.10' : '198.51.100.10']; },
    log: log(transport), url: 'https://report.example/a.pdf' });
  assert.equal(outcome.kind, 'DOWNLOADED');
  assert.equal(resolutions, 2, 'one guard resolution per hop, no connect-time re-resolution');
  assert.deepEqual(sockets, [
    { host: 'report.example', addresses: [{ address: '203.0.113.10', family: 4 }] },
    { host: 'redirect.example', addresses: [{ address: '198.51.100.10', family: 4 }] },
  ]);
});

test('whole-file timeout bounds stalled DNS, response headers and response bodies', async t => {
  const alive = setInterval(() => {}, 1000); t.after(() => clearInterval(alive));
  const { transport } = fakeTransport(() => pdfResponse(PDF('unused')));
  const common = { transport, log: log(transport), url: 'https://report.example/a.pdf', timeoutMs: 10 };
  assert.deepEqual(await guardedPdfDownload({ ...common, download: transport.fetch, resolve: () => new Promise(() => {}) }),
    { kind: 'FAILED', reason: 'TIMEOUT', requested: false });
  assert.deepEqual(await guardedPdfDownload({ ...common, resolve: publicDns, download: () => new Promise(() => {}) }),
    { kind: 'FAILED', reason: 'TIMEOUT', requested: true });
  let cancelled = false;
  assert.deepEqual(await guardedPdfDownload({ ...common, resolve: publicDns,
    download: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })) }),
    { kind: 'FAILED', reason: 'TIMEOUT', requested: true });
  assert.equal(cancelled, true);
});


test('response cancellation cannot extend the whole-file deadline', async t => {
  const alive = setInterval(() => {}, 1000); t.after(() => clearInterval(alive));
  const { transport } = fakeTransport(() => { throw new Error('unused'); });
  const outcome = await guardedPdfDownload({ transport, resolve: publicDns, log: log(transport),
    url: 'https://report.example/a.pdf', timeoutMs: 10,
    download: async () => new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }), { status: 302, headers: { location: '/next.pdf' } }) });
  assert.equal(outcome.kind, 'FAILED');
  if (outcome.kind === 'FAILED') assert.equal(outcome.reason, 'TIMEOUT');
});
