import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

// Step 1 card of the desktop app: the user's own Chrome on Metric. Fake bridge only.
const html = await readFile(new URL('../../tools/shopee-desktop/index.html', import.meta.url), 'utf8');

const SEEN = { chromeOpen: true, listening: true, seen: true, busy: false, pending: null };
const IDLE = { chromeOpen: false, listening: false, seen: false, busy: false, pending: null };

async function waitFor(check: () => boolean, label: string, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for ' + label);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function page(views: any[], take?: (input: any) => Promise<any>, lastSelection: any = null) {
  const calls: { method: string; args: any[] }[] = [];
  let view = 0;
  const record = (method: string, answer: (...args: any[]) => any) => async (...args: any[]) => {
    calls.push({ method, args: JSON.parse(JSON.stringify(args)) });
    return answer(...args);
  };
  const api = {
    connection: record('connection', () => ({ ok: true, data: { connected: true, readonly: false, runsRoot: '/synthetic' } })),
    presets: record('presets', () => ({ ok: true, data: { format: 'presets-v1', presets: [] } })),
    listRuns: record('listRuns', () => ({ ok: true, data: { format: 'runs-v1', runs: [] } })),
    runsProgress: record('runsProgress', () => ({ ok: true, data: { format: 'runs-progress-v1', runs: [] } })),
    metricBrowserState: record('metricBrowserState', () => ({ ok: true, data: views[Math.min(view++, views.length - 1)] })),
    openMetric: record('openMetric', () => ({ ok: true, data: { reused: false, browserName: 'Google Chrome', navigated: true } })),
    takeMetricReviews: record('takeMetricReviews', (input: any) => (take ? take(input) : { ok: false, error: { code: 'X', message: 'X' } })),
    resendMetricImport: record('resendMetricImport', () => ({ ok: true, data: { runId: 'a1b2c3d4', reused: true, step2: { ok: true } } })),
    discardMetricImport: record('discardMetricImport', () => ({ ok: true, data: { pending: null } })),
    lastProductSelection: record('lastProductSelection', () => ({ ok: true, data: { productSelection: lastSelection } })),
    newRun: record('newRun', () => ({ ok: false, error: { code: 'NO', message: 'NO' } })),
    runFlow: record('runFlow', () => ({ ok: false, error: { code: 'NO', message: 'NO' } })),
    runModule: record('runModule', () => ({ ok: false, error: { code: 'NO', message: 'NO' } })),
  };
  const dom = new JSDOM(html, {
    url: 'file:///shopee-desktop/index.html', runScripts: 'dangerously',
    beforeParse(window) { (window as any).pywebview = { api }; },
  });
  const doc = dom.window.document;
  const $ = (id: string) => doc.getElementById(id) as HTMLElement & HTMLButtonElement & HTMLInputElement;
  return { dom, doc, $, calls, names: () => calls.map((c) => c.method) };
}

test('step 1 shows the Metric card and hides the old preset form, run button and date check', async () => {
  const p = page([IDLE]);
  try {
    await waitFor(() => p.names().includes('metricBrowserState') && p.names().includes('connection'), 'boot');
    assert.equal(p.$('metricCard').hidden, false);
    assert.equal(p.$('legacyNewRun').hidden, true);      // product, period, Metric filters
    assert.equal(p.$('legacyNewCommit').hidden, true);   // «Tạo lượt», «Bắt đầu lấy dữ liệu»
    assert.equal(p.$('legacyNewHead').hidden, true);
    assert.ok(p.$('legacyNewCommit').contains(p.$('btnFlow')));
    assert.ok(p.$('legacyNewRun').contains(p.$('endDate')));
    assert.equal(p.$('newPolicySummary').closest('[hidden]'), null); // the policy form stays
    assert.match(p.$('chromeState').textContent!, /Chrome chưa mở/);
    assert.equal(p.$('btnTakeReviews').disabled, true);
    // The owner removed the last-filter line and the typed name box: the name comes from Metric's search box.
    assert.equal(p.$('metricFilterLine'), null);
    assert.equal(p.$('metricKeywordField'), null);
    assert.ok(!p.$('metricCard').textContent!.includes('Bộ lọc lần xem cuối'));
    const copy = p.$('metricCard').textContent! + p.$('metricTake').textContent!;
    for (const word of ['CDP', 'JSON', 'postData', 'API', 'request', 'tab ']) assert.ok(!copy.includes(word), word);
    assert.ok(!p.names().includes('metricDateAvailability'));
  } finally {
    p.dom.window.close();
  }
});

test('the open pill and one click send the frozen policy once, then step 2 is reported', async () => {
  let release!: (value: any) => void;
  const gate = new Promise((resolve) => { release = resolve; });
  const p = page([SEEN], async () => { await gate; return { ok: true, data: { runId: 'a1b2c3d4', reused: false, step2: { ok: true } } }; });
  try {
    await waitFor(() => p.$('btnTakeReviews').disabled === false, 'take enabled');
    assert.match(p.$('chromeState').textContent!, /Chrome đang mở/);
    p.$('btnTakeReviews').click();
    p.$('btnTakeReviews').click();
    await waitFor(() => p.$('btnTakeReviews').disabled, 'blocked while busy');
    release(null);
    await waitFor(() => !p.$('metricNotice').hidden, 'notice');
    const takes = p.calls.filter((c) => c.method === 'takeMetricReviews');
    assert.equal(takes.length, 1);
    assert.deepEqual(takes[0]!.args, [{ collectionPolicy: { mode: 'with-comments', stars: [], totalPerLink: 300, allocation: 'pooled' },
      productSelection: { mode: 'top', count: 5 } }]);
    assert.match(p.$('metricNotice').textContent!, /Đã tạo lượt a1b2c3d4 từ số liệu Metric\. App đang chạy bước 2 \(chọn link Shopee\), rồi tự chạy bước 3 và bước 4/);
    assert.equal(p.$('metricDone').hidden, false);
    for (const name of ['newRun', 'runFlow', 'runModule']) assert.ok(!p.names().includes(name), name);
  } finally {
    p.dom.window.close();
  }
});

test('fewer Shopee products than needed is a yellow warning, nothing sent, and the button works again', async () => {
  let answer: any = { ok: false, error: { code: 'METRIC_TOO_FEW_SHOPEE', message: 'METRIC_TOO_FEW_SHOPEE', detail: { shopeeProducts: 3, needed: 5 } } };
  const p = page([SEEN], async () => answer);
  try {
    await waitFor(() => p.$('btnTakeReviews').disabled === false, 'take enabled');
    p.$('btnTakeReviews').click();
    await waitFor(() => !p.$('metricWarn').hidden, 'warning');
    assert.equal(p.$('metricWarn').className, 'warnbar');
    assert.equal(p.$('metricWarn').textContent, 'Bộ lọc chỉ có 3 sản phẩm Shopee, cần ít nhất 5.');
    assert.equal(p.$('metricErr').hidden, true);
    assert.equal(p.$('btnResendImport').hidden, true);
    await waitFor(() => p.$('btnTakeReviews').disabled === false, 'can click again');
    answer = { ok: false, error: { code: 'METRIC_TOO_FEW_SHOPEE', message: 'METRIC_TOO_FEW_SHOPEE', detail: { shopeeProducts: 0, needed: 1 } } };
    p.$('btnTakeReviews').click();
    await waitFor(() => p.$('metricWarn').textContent === 'Bộ lọc chỉ có 0 sản phẩm Shopee, cần ít nhất 1.', 'all, 0');
    answer = { ok: true, data: { runId: 'a1b2c3d4', reused: false, step2: { ok: true } } };
    await waitFor(() => p.$('btnTakeReviews').disabled === false, 'enabled again');
    p.$('btnTakeReviews').click();
    await waitFor(() => !p.$('metricNotice').hidden, 'run created');
    assert.equal(p.$('metricWarn').hidden, true);
  } finally {
    p.dom.window.close();
  }
});

test('a payload not yet confirmed offers «Gửi lại» and the take button stays blocked', async () => {
  const pending = { ...SEEN, pending: { keyword: 'canxi', period: '01/10/2026 – 31/10/2026' } };
  const p = page([pending]);
  try {
    await waitFor(() => p.$('btnResendImport').hidden === false, 'resend shown');
    assert.equal(p.$('btnTakeReviews').disabled, true);
    assert.match(p.$('metricTakeHint').textContent!, /chưa gửi xong lên máy chủ\. Bấm «Gửi lại»/);
    p.$('btnResendImport').click();
    await waitFor(() => !p.$('metricNotice').hidden, 'resent');
    assert.ok(p.names().includes('resendMetricImport'));
    assert.ok(!p.names().includes('takeMetricReviews'));
    assert.match(p.$('metricNotice').textContent!, /Lượt a1b2c3d4 đã có từ lần gửi trước/);
  } finally {
    p.dom.window.close();
  }
});

test('a Metric error is told in plain words; «Mở Metric» reports the browser it opened', async () => {
  const p = page([SEEN], async () => ({ ok: false, error: { code: 'CAPTURE_LOGIN_REQUIRED', message: 'CAPTURE_LOGIN_REQUIRED', detail: { screenshotSaved: true } } }));
  try {
    await waitFor(() => p.$('btnTakeReviews').disabled === false, 'take enabled');
    p.$('btnOpenMetric').click();
    await waitFor(() => /Đã mở Google Chrome/.test(p.$('metricOpenMsg').textContent!), 'opened');
    p.$('btnTakeReviews').click();
    await waitFor(() => !p.$('metricErr').hidden, 'error');
    assert.equal(p.$('metricErr').textContent,
      'Metric chưa đăng nhập hoặc đã hết phiên. Đăng nhập lại trên Chrome rồi bấm lại. App đã lưu ảnh trang Metric lúc lỗi để người quản trị xem.');
  } finally {
    p.dom.window.close();
  }
});

// «Sản phẩm bán chạy» (F644 §5), one row each:
// | form                                  | sent productSelection     | take button |
// |---------------------------------------|---------------------------|-------------|
// | opens with the last choice (top 8)    | {mode: top, count: 8}     | enabled     |
// | Top 0 or 101                          | –                         | disabled    |
// | «Tất cả»                              | {mode: all}               | enabled     |
test('«Sản phẩm bán chạy» sends Top N or all, opens with the last choice, and refuses Top outside 1–100', async () => {
  const p = page([SEEN], async () => ({ ok: true, data: { runId: 'a1b2c3d4', reused: false, step2: { ok: true } } }),
    { mode: 'top', count: 8 });
  try {
    await waitFor(() => p.$('btnTakeReviews').disabled === false && p.$('newTopCount').value === '8', 'last choice');
    const group = p.$('newSelectionGroup');
    assert.equal(group.querySelector('legend')!.textContent, 'Sản phẩm bán chạy');
    assert.deepEqual([...group.querySelectorAll('.chip')].map((c) => c.textContent), ['Lọc trùng', 'Không lọc trùng']);
    p.$('btnTakeReviews').click();
    await waitFor(() => p.calls.filter((c) => c.method === 'takeMetricReviews').length === 1, 'top 8 sent');
    assert.deepEqual(p.calls.find((c) => c.method === 'takeMetricReviews')!.args[0].productSelection, { mode: 'top', count: 8 });
    await waitFor(() => !p.$('metricNotice').hidden, 'done');
    for (const bad of ['0', '101']) {
      p.$('newTopCount').value = bad;
      p.$('newTopCount').dispatchEvent(new p.dom.window.Event('input', { bubbles: true }));
      assert.equal(p.$('btnTakeReviews').disabled, true, bad);
      assert.equal(p.$('metricTakeHint').textContent, 'Top từ 1 đến 100.', bad);
    }
    const all = group.querySelector<HTMLInputElement>('input[value="all"]')!;
    all.checked = true;
    all.dispatchEvent(new p.dom.window.Event('change', { bubbles: true }));
    assert.equal(p.$('btnTakeReviews').disabled, false);
    p.$('btnTakeReviews').click();
    await waitFor(() => p.calls.filter((c) => c.method === 'takeMetricReviews').length === 2, 'all sent');
    assert.deepEqual(p.calls.filter((c) => c.method === 'takeMetricReviews')[1]!.args[0].productSelection, { mode: 'all' });
  } finally {
    p.dom.window.close();
  }
});
