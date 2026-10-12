import test from 'node:test';
import assert from 'node:assert/strict';
import { MetaPageCapture, MetaPageCaptureRejection, type MetaPageBrowserPort, type MetaPageCaptureTarget, type MetaPageControlState } from '../../src/modules/analysis/research-automation/meta-page-capture.js';
const target: MetaPageCaptureTarget = { pageId: '123456', libraryUrl: 'https://www.facebook.com/ads/library/?view_all_page_id=123456&country=VN', bindingSha256: '1'.repeat(64) };
function fixture(state: MetaPageControlState = 'READY') {
  let tick = 0; const commands: { kind: string; at: number }[] = [], sleeps: number[] = [];
  const browser: MetaPageBrowserPort = {
    openPageLibrary: async selected => { commands.push({ kind: 'OPEN_PAGE_LIBRARY', at: tick }); return { state, observedUrl: selected.libraryUrl }; },
    readVisiblePage: async selected => { commands.push({ kind: 'READ_VISIBLE_PAGE', at: tick }); return { state, observedUrl: selected.libraryUrl,
      html: Buffer.from('<p>Synthetic public ad page</p>'), visibleFields: Buffer.from('{}') }; },
  };
  const clock = { monotonicMs: () => tick, sleep: async (ms: number) => { sleeps.push(ms); tick += ms; } };
  return { capture: new MetaPageCapture(browser, clock), commands, sleeps, clock, browser, setTick: (value: number) => { tick = value; } };
}
test('synthetic typed page commands are spaced at least30seconds across captures with upstream reauthentication', async () => {
  const f = fixture(); let reads = 0;
  const source = async () => { reads++; return target; };
  const first = await f.capture.capture(source); const second = await f.capture.capture(source);
  assert.deepEqual(f.commands.map(command => command.kind), ['OPEN_PAGE_LIBRARY', 'READ_VISIBLE_PAGE', 'OPEN_PAGE_LIBRARY', 'READ_VISIBLE_PAGE']);
  assert.deepEqual(f.commands.map(command => command.at), [0, 30000, 60000, 90000]);
  assert.deepEqual(f.sleeps, [30000, 30000, 30000]); assert.equal(reads, 8);
  assert.deepEqual(second.html, first.html);
});
test('captcha/login/block/UI drift stop immediately without read or retry and foreign/page filters refuse before commands', async () => {
  for (const state of ['CAPTCHA', 'LOGIN_REQUIRED', 'BLOCKED', 'UI_CHANGED'] as const) {
    const f = fixture(state); await assert.rejects(f.capture.capture(async () => target), (e: unknown) => e instanceof MetaPageCaptureRejection && e.code === `META_${state}`);
    assert.equal(f.commands.length, 1); assert.equal(f.sleeps.length, 0);
  }
  for (const libraryUrl of [target.libraryUrl.replace('www.facebook.com', 'example.invalid'), target.libraryUrl.replace('123456', '999999'),
    `${target.libraryUrl}&arbitrary=command`, target.libraryUrl.replace('https:', 'http:'), `${target.libraryUrl}#fragment`]) {
    const f = fixture(); await assert.rejects(f.capture.capture(async () => ({ ...target, libraryUrl })), MetaPageCaptureRejection); assert.equal(f.commands.length, 0);
  }
});
test('missing authentic prerequisite, drift, cancellation and invalid clock prevent the next command', async () => {
  const absent = fixture(); await assert.rejects(absent.capture.capture(async () => { throw new Error('Authentic peer unavailable'); }), /Authentic peer unavailable/); assert.equal(absent.commands.length, 0);
  const drift = fixture(); let reads = 0;
  await assert.rejects(drift.capture.capture(async () => ({ ...target, bindingSha256: (++reads < 3 ? '1' : '2').repeat(64) })), /SOURCE_REFERENCE_DRIFT/);
  assert.equal(drift.commands.length, 1);
  const controller = new AbortController(), cancelled = fixture(); controller.abort();
  await assert.rejects(cancelled.capture.capture(async () => target, controller.signal)); assert.equal(cancelled.commands.length, 0);
  const badClock = fixture(); badClock.clock.sleep = async () => {};
  await assert.rejects(badClock.capture.capture(async () => target), /COMMAND_INTERVAL_NOT_REACHED/); assert.equal(badClock.commands.length, 1);
  const wrongPage = fixture(); wrongPage.browser.openPageLibrary = async () => ({ state: 'READY', observedUrl: target.libraryUrl.replace('123456', '999999') });
  await assert.rejects(wrongPage.capture.capture(async () => target), /PAGE_RESPONSE_BINDING_MISMATCH/); assert.equal(wrongPage.sleeps.length, 0);
});
