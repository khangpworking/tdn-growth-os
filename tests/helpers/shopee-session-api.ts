import http from 'node:http';
import type { Socket } from 'node:net';
import { Duplex } from 'node:stream';
import type { TestContext } from 'node:test';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { publicScenario } from './shopee-public-scenario.js';
import { FakeTransport, SESSION_READY, type Exchange } from './shopee-public-fakes.js';
import { TOKEN } from '../fixtures/shopee-public-results.js';

export const ownerOrigin = 'http://127.0.0.1:43123';
export const ownerToken = 'synthetic-owner-token-abcdefghijklmnopqrstuvwxyz123456';
export async function sessionRun(t: TestContext, state = 'needs_login') {
  const f = await publicScenario(t, { reports: ['MARKET'], ...(state === 'PROVIDER_BLOCKED' ? { state: 'failed', counts: [0, 0, 0] } : {}) });
  if (!['OK', 'PROVIDER_BLOCKED'].includes(state)) f.transport.exchanges.splice(0, f.transport.exchanges.length,
    { method: 'GET', path: '/session', body: { ...SESSION_READY, authenticated: null } },
    { method: 'POST', path: '/session/check', ...(state === 'down' ? { status: 503 } : { body: { state } }) });
  await f.confirmPublic(); await f.finish(); f.transport.done();
  return f;
}

export function sessionApi(t: TestContext, f: Awaited<ReturnType<typeof sessionRun>>, script: Exchange[], ownerEnabled = true) {
  const transport = new FakeTransport(script);
  t.mock.method(globalThis, 'fetch', transport.fetch);
  const application = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin: ownerOrigin,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false,
      shopeePublicReviews: { token: TOKEN, baseUrl: 'http://127.0.0.1:8877', maxReviewsPerProduct: 20 } },
    ...(ownerEnabled ? { owner: { writeEnabled: true as const, databasePath: f.databasePath, artifactRoot: f.artifactRoot,
      token: ownerToken, allowedOrigin: ownerOrigin, actorId: 'owner:synthetic' } } : {}) });
  t.after(() => application.close());
  t.after(() => transport.done());
  function request(action: string, body?: unknown, options: {
    method?: string; prefix?: string; origin?: string | null; authorization?: string | null; workspaceId?: string; runId?: string;
  } = {}) {
    return new Promise<{ status: number; body: any; wire: string }>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const socket = new Duplex({ read() {}, write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
      const req = new http.IncomingMessage(socket as Socket);
      req.method = options.method ?? 'POST';
      req.url = `/${options.prefix ?? 'owner-api'}/workspaces/${options.workspaceId ?? f.workspaceId}/research-automation/runs/${options.runId ?? f.runId}${action ? '/' + action : ''}`;
      req.headers = { host: new URL(ownerOrigin).host, 'content-type': 'application/json',
        ...(options.origin === null ? {} : { origin: options.origin ?? ownerOrigin }),
        ...(options.authorization === null ? {} : { authorization: options.authorization ?? `Bearer ${ownerToken}` }) };
      req.httpVersion = '1.1'; req.httpVersionMajor = 1; req.httpVersionMinor = 1; req.complete = true;
      const bytes = body === undefined ? null : Buffer.from(JSON.stringify(body));
      req.headers['content-length'] = String(bytes?.length ?? 0);
      if (bytes) req.push(bytes);
      req.push(null);
      const response = new http.ServerResponse(req);
      response.assignSocket(socket as Socket);
      response.on('error', reject);
      response.on('finish', () => {
        try {
          const wire = Buffer.concat(chunks).toString();
          resolve({ status: response.statusCode, body: JSON.parse(wire.slice(wire.indexOf('\r\n\r\n') + 4)), wire });
        } catch (error) { reject(error); }
        finally { socket.destroy(); }
      });
      application.handler(req, response);
    });
  }
  return { request, transport, close: () => application.close() };
}
