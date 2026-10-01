import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement, StrictMode } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';
import { loadLocalTestOwnerSession, WorkspaceDataSourceError } from '../src/data-source';

const token = 'synthetic-local-session-token-1234567890';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test('local test session uses an uncached same-origin POST and rejects malformed grants without persisting credentials', async () => {
  let request: [string, RequestInit | undefined] | undefined;
  assert.equal(await loadLocalTestOwnerSession((async (url, init) => {
    request = [String(url), init];
    return json({ contractVersion: '1.0.0', token });
  }) as typeof fetch), token);
  assert.deepEqual(request, ['/owner-api/local-test-session', {
    method: 'POST', credentials: 'omit', cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: '{}',
  }]);
  for (const response of [
    json({ contractVersion: '1.0.0', token: 'weak' }),
    json({ contractVersion: 'other', token }),
    json({ contractVersion: '1.0.0', token, extra: true }),
    new Response('not JSON'),
  ]) await assert.rejects(loadLocalTestOwnerSession((async () => response) as typeof fetch), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'integrity');
  await assert.rejects(loadLocalTestOwnerSession((async () => json({}, 403)) as typeof fetch), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'connection');
});

test('the mounted app automatically unlocks only an explicit local test runtime, reacquires on reload, and leaves demo and normal mode isolated', async () => {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const { default: App } = await tsImport('../src/App.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/App');
  const previousFetch = globalThis.fetch;
  window.scrollTo = () => undefined;
  let root = createRoot(dom.container);
  let localTest = true;
  let failGrant = false;
  let pendingGrant: ((response: Response) => void) | undefined;
  const requests: string[] = [];
  globalThis.fetch = (async (url, init) => {
    requests.push(`${init?.method ?? 'GET'} ${String(url)}`);
    if (url === '/healthz') return json({ status: 'ok', version: 'test', ownerWritesEnabled: true, localTestOwner: localTest });
    if (url === '/api/workspaces') return json({ contractVersion: '1.0.0', workspaces: [] });
    if (url === '/owner-api/local-test-session') {
      if (failGrant) return json({}, 403);
      return new Promise<Response>((resolve) => { pendingGrant = resolve; });
    }
    throw new Error(`Unexpected request: ${String(url)}`);
  }) as typeof fetch;
  const button = (label: string) => Array.from(dom.container.querySelectorAll('button')).find((item) => item.textContent === label)!;
  const render = async () => { await act(async () => { root.render(createElement(StrictMode, null, createElement(App))); await settle(); }); };
  const remount = async () => { await act(async () => root.unmount()); root = createRoot(dom.container); await render(); };
  try {
    await render();
    assert.ok(pendingGrant);
    await act(async () => { button('Create new research').click(); await settle(); });
    assert.equal(dom.container.querySelector('#owner-token'), null);
    assert.match(dom.container.textContent!, /Test local.*Đang mở quyền OWNER/);
    const title = dom.container.querySelector('input[required]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(title, 'Thị trường thử nghiệm');
      title.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    assert.equal(button('Tạo workspace trống').disabled, true);
    await act(async () => { pendingGrant!(json({ contractVersion: '1.0.0', token })); await settle(); });
    assert.equal(button('Tạo workspace trống').disabled, false);
    assert.match(dom.container.textContent!, /OWNER tự động.*Thay đổi được lưu thật/);
    assert.equal(button('Khóa'), undefined);
    assert.equal(dom.container.innerHTML.includes(token), false);
    assert.equal(window.localStorage.length, 0);
    assert.equal(window.sessionStorage.length, 0);
    assert.equal(document.cookie, '');
    assert.ok(requests.every((request) => request.startsWith('GET ') || request === 'POST /owner-api/local-test-session'), 'boot never performs business or provider writes');

    const grants = requests.filter((request) => request === 'POST /owner-api/local-test-session').length;
    await remount();
    assert.equal(requests.filter((request) => request === 'POST /owner-api/local-test-session').length, grants + 1);
    await act(async () => { pendingGrant!(json({ contractVersion: '1.0.0', token })); await settle(); });
    assert.match(dom.container.textContent!, /OWNER tự động/);

    failGrant = true;
    await remount();
    assert.match(dom.container.textContent!, /Chưa mở được quyền OWNER/);
    assert.equal(dom.container.querySelector('#owner-token'), null);
    failGrant = false;
    await act(async () => { button('Thử mở quyền lại').click(); await settle(); });
    await act(async () => { pendingGrant!(json({ contractVersion: '1.0.0', token })); await settle(); });
    assert.match(dom.container.textContent!, /OWNER tự động/);

    localTest = false;
    const beforeNormal = requests.length;
    await remount();
    assert.ok(dom.container.querySelector('#owner-token'));
    assert.ok(!requests.slice(beforeNormal).some((request) => request.startsWith('POST ')));
    const beforeDemo = requests.length;
    window.history.replaceState(null, '', '?mode=demo#/');
    await remount();
    assert.match(dom.container.textContent!, /Dữ liệu minh họa/);
    assert.equal(requests.length, beforeDemo);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    dom.cleanup();
  }
});
