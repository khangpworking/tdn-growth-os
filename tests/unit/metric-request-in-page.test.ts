import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const metric = (name: string) => new URL('../../tools/opencli-metric/clis/metric/' + name, import.meta.url).href;
const shared = (await import(metric('request-in-page.js'))).requestV3InPage;
const viaCapture = (await import(metric('v3-capture.js'))).requestV3InPage;

const sharedFile = new URL('../../tools/opencli-metric/clis/metric/request-in-page.js', import.meta.url);

test('v3-capture.js re-exports the one shared requestV3InPage, unchanged', () => {
  assert.equal(viaCapture, shared);
  assert.equal(shared.name, 'requestV3InPage');
  assert.match(shared.toString(), /^async function requestV3InPage\(\{ urlPath, requestBody \}\)/);
});

test('the shared function is the last thing in its file, so the desktop app can evaluate it', async () => {
  const text = await readFile(sharedFile, 'utf8');
  const start = text.indexOf('export async function requestV3InPage(');
  assert.ok(start > 0);
  assert.equal(text.indexOf('export ', start + 1), -1);
  // What tdn_metric_browser.request_in_page_source() sends: the rest of the file, as one expression.
  const source = text.slice(start + 'export '.length).trim();
  const fn = new Function('return (' + source + ')')();
  assert.equal(fn.name, 'requestV3InPage');
  assert.equal(fn.constructor.name, 'AsyncFunction');
  assert.match(source, /AbortSignal\.timeout\(45000\)/);
});

test('the desktop build bundles that same file', async () => {
  const spec = await readFile(new URL('../../tools/shopee-desktop/TDN-Shopee-Flow.spec', import.meta.url), 'utf8');
  assert.match(spec, /'\.\.\/opencli-metric\/clis\/metric\/request-in-page\.js'/);
  const app = await readFile(new URL('../../tools/shopee-desktop/tdn_metric_browser.py', import.meta.url), 'utf8');
  assert.match(app, /_JS_NAME = 'request-in-page\.js'/);
  assert.match(app, /'opencli-metric' \/ 'clis' \/ 'metric' \/ _JS_NAME/);
});
