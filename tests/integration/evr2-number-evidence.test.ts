import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { createChromiumPdfRenderer } from '../../src/modules/analysis/research-automation/pdf.js';
import { renderV3Report, v3Hash } from '../../src/modules/analysis/research-automation/metric-v3-report.js';
import { assertNumberEvidence, buildNumberEvidenceIndex, retainEvidencePackages, type NumberEvidenceIndex } from '../../src/modules/analysis/research-automation/metric-number-evidence.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { fixture, workspaceId, drain, autorun } from '../helpers/autorun-harness.js';
import { adapter, evidenceAdapter, capturedAt, fakeRunId, fakeEvidencePage, fakeR2, jsonBytes, model, syntheticCapture, writeCapture } from '../helpers/evr2-evidence-fixture.js';

async function temporary(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'evr2-tests-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
async function packageFixture(t: TestContext, missingProducts = false) {
  const bundle = await syntheticCapture();
  const dir = await temporary(t);
  const page = fakeEvidencePage(missingProducts);
  t.after(page.close);
  for (const window of bundle.archive.windows) {
    await evidenceAdapter.writeV3EvidencePackage(page.page, { windowDir: join(dir, window.manifest.window.id), manifest: window.manifest,
      rawBytes: bundle.files[`${window.manifest.window.id}/raw-responses.json`] });
  }
  const remote = fakeR2(); t.after(remote.close);
  const local = new Map<string, Buffer>();
  const retain = async (bytes: Buffer) => { const sha = v3Hash(bytes); local.set(sha, bytes); return sha; };
  const retainPackages = () => retainEvidencePackages({ dir, workspaceId, runId: fakeRunId, archive: bundle.archive, store: remote.store, retain });
  return { ...bundle, dir, page, remote, local, retainPackages };
}
async function published(t: TestContext, evidence = false, pdf?: ReturnType<typeof createChromiumPdfRenderer>, failUpload = false) {
  const bundle = await syntheticCapture();
  const remote = fakeR2(); t.after(remote.close);
  remote.state.fail = failUpload;
  const lanes = { v3Report: { model, ...(pdf ? { pdf } : {}) }, ...(evidence ? { metricEvidence: { store: remote.store } } : {}) };
  const f = await fixture(t, 'on', undefined, fake => async (_config, request) => {
    const dir = join(fake.captureRoot, request.runId, 'run1');
    await mkdir(dir, { recursive: true });
    await writeFile(join(fake.captureRoot, request.runId, 'spec.json'), jsonBytes(bundle.spec));
    await writeCapture(dir, bundle.files);
    if (evidence) {
      const page = fakeEvidencePage();
      try {
        for (const window of bundle.archive.windows) await evidenceAdapter.writeV3EvidencePackage(page.page, {
          windowDir: join(dir, window.manifest.window.id), manifest: window.manifest, rawBytes: bundle.files[`${window.manifest.window.id}/raw-responses.json`],
        });
      } finally { page.close(); }
    }
    return { ok: true, captureDir: dir, period: bundle.spec.windows[1].period, executorCalls: 1 };
  }, undefined, lanes);
  const receipt = await f.service.start(workspaceId, { contractVersion: 'research-automation-start-v2', requestKey: 'cccccccc-0000-4000-8000-000000000001',
    mode: 'CATEGORY', keyword: bundle.spec.preset.keywords[0], requestedPeriod: bundle.spec.windows[1].period, metricV3Preset: bundle.spec, reports: ['MARKET'] });
  await drain(f.service);
  const runId = receipt.run.runId;
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'DRAFT_READY', JSON.stringify(autorun(f.db, runId), (_key, value) => typeof value === 'bigint' ? String(value) : value));
  const revision = (await f.service.listReaderReports(workspaceId, runId)).revisions[0]!;
  const output = f.db.prepare('SELECT version_sha256 semanticSha FROM analysis_research_automation_outputs WHERE run_id=?').get(runId) as { semanticSha: string };
  const semantic = JSON.parse((await f.artifacts.read(output.semanticSha)).toString());
  return { ...f, bundle, remote, runId, revision, semantic };
}
async function serve(t: TestContext, f: Awaited<ReturnType<typeof published>>, enabled: boolean) {
  const server = http.createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const token = 'synthetic-evr2-owner-token-123456789012345';
  const api = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin: base,
    metricEvidenceEnabled: enabled, owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: base, actorId: 'synthetic-owner' } });
  server.on('request', api.handler);
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await api.close(); });
  return { base, headers: { origin: base, authorization: `Bearer ${token}` } };
}

test('A1 flag OFF preserves capture files, report bytes, trace and unavailable evidence API', async t => {
  const f = await published(t);
  const baseline = JSON.parse(gunzipSync(await readFile(new URL('../fixtures/evr2/stored-v2.json.gz', import.meta.url))).toString());
  assert.equal((await f.service.readReport(workspaceId, f.runId, 'MARKET')).bytes.toString(), baseline.html);
  assert.deepEqual(f.semantic.numberTrace, baseline.trace);
  const checkOff = (semantic: Record<string, unknown>, remoteRequests: number) => {
    assert.equal('evidenceIndexSha' in semantic, false, 'OFF must not add a number-evidence sidecar');
    assert.equal(remoteRequests, 0, 'OFF must not call R2');
  };
  checkOff(f.semantic, f.remote.state.requests);
  await assert.rejects(f.service.readNumberEvidence(workspaceId, f.revision.revisionId, 'n0'), { code: 'evidence_disabled' });
  const api = await serve(t, f, false);
  const route = `${api.base}/owner-api/workspaces/${workspaceId}/research-automation/reports/${f.revision.revisionId}/numbers/n0`;
  assert.equal((await fetch(route, { headers: api.headers })).status, 404);
  // Exercise the adapter flag boundary too: screenshots must never be requested while OFF.
  const original = JSON.parse(await readFile(new URL('../fixtures/metric-v3/live-map-contract.json', import.meta.url), 'utf8'));
  const off = await temporary(t);
  const page = { evaluate: async (fn: Function, arg: any) => {
    if (fn.name === 'readV3RequestContext') return { taxonomy: original.windows[0].observation.taxonomy };
    const window = original.windows.find((w: any) => w.responses[0].requestBody.start_date === arg.requestBody.start_date);
    return window.responses.find((r: any) => r.urlPath === arg.urlPath);
  }, screenshot: async () => assert.fail('flag OFF attempted a screenshot') };
  await adapter.captureV3PageRequests(page, original.spec, off, 'CAPTURE_UI_CHANGED');
  for (const window of ['30d', '12m']) assert.deepEqual((await readdir(join(off, window))).sort(), ['manifest.json', 'raw-responses.json']);
  await t.test('A1 negative control: explicitly enabling evidence changes the sidecar/API contract', async sub => {
    const enabled = await published(sub, true);
    assert.equal(typeof enabled.semantic.evidenceIndexSha, 'string');
    assert.ok(enabled.remote.state.requests > 0);
    assert.throws(() => checkOff(enabled.semantic, enabled.remote.state.requests), assert.AssertionError);
    const on = await serve(sub, enabled, true);
    const response = await fetch(`${on.base}/owner-api/workspaces/${workspaceId}/research-automation/reports/${enabled.revision.revisionId}/numbers`, { headers: on.headers });
    assert.equal(response.status, 200);
  });
});

test('A2 fake-page capture packages preserve settings, PNGs and raw bytes through verified fake R2 upload', async t => {
  const f = await packageFixture(t);
  const packages = await f.retainPackages();
  assert.equal(packages.length, 2);
  for (const [i, pkg] of packages.entries()) {
    const window = f.archive.windows[i]!;
    const m = pkg.manifest;
    assert.equal(pkg.status, 'UPLOADED'); assert.equal(pkg.code, null);
    assert.equal(m.status, 'COMPLETE'); assert.equal(m.captureId, window.manifest.captureId); assert.equal(m.capturedAt, capturedAt);
    assert.deepEqual({ keywords: m.keywords, category: m.category, platforms: m.platforms, smartQuery: m.smartQuery }, {
      keywords: ['synthetic zinc', 'synthetic zinc capsule'], category: f.spec.preset.category, platforms: ['shopee', 'lazada', 'tiki', 'tiktok'], smartQuery: true });
    assert.deepEqual(m.period, f.spec.windows[i].period); assert.equal(m.windowId, i ? '12m' : '30d');
    assert.equal(m.captureMethod, 'ui'); assert.equal(m.adapterVersion.contract, 'metric-v3-window-capture-v2');
    assert.equal(m.adapterVersion.sourceSha256, v3Hash(await readFile(new URL('../../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url))));
    assert.equal(m.maskedCount, 1); assert.deepEqual(m.missingSections, []);
    assert.deepEqual(m.sections.map((s: any) => s.sectionKey).sort(), ['kpi', 'platform-share', 'price-bands', 'search-settings', 'shop-types', 'top-brands', 'top-products', 'top-shops', 'trend-chart']);
    const expectedFiles = ['manifest.json', 'raw-responses.json', 'full-page.png', ...m.sections.map((s: any) => s.path)];
    assert.deepEqual(Object.keys(pkg.files).sort(), expectedFiles.sort());
    for (const file of expectedFiles) {
      const stored = f.remote.objects.get(`/tdn-media/metric-evidence/${workspaceId}/${fakeRunId}/${pkg.captureId}/${file}`)!;
      assert.ok(stored, `missing fake R2 member ${file}`);
      assert.deepEqual(stored.bytes, f.local.get(pkg.files[file]!));
      assert.equal(stored.type, file.endsWith('.png') ? 'image/png' : 'application/json');
    }
    assert.deepEqual(f.local.get(pkg.files['raw-responses.json']!), f.files[`${m.windowId}/raw-responses.json`]);
    assert.deepEqual(f.local.get(pkg.files['full-page.png']!), f.page.png);
    const crop = f.local.get(pkg.files['sections/top-products.png']!)!;
    assert.equal(crop.readUInt32BE(16), 100); assert.equal(crop.readUInt32BE(20), 10);
    assert.equal((f.page.dom.window.document.querySelector('.account-menu') as HTMLElement).style.visibility, '');
  }
  assert.equal(f.remote.objects.size, 24);
  await t.test('A2 negative controls: upload/read-back corruption and missing sections stay explicit', async sub => {
    f.remote.state.fail = true;
    for (const pkg of await f.retainPackages()) { assert.equal(pkg.status, 'LOCAL_ONLY'); assert.equal(pkg.code, 'EVIDENCE_UPLOAD_FAILED'); }
    f.remote.state.fail = false; f.remote.state.corruptRead = true;
    for (const pkg of await f.retainPackages()) { assert.equal(pkg.status, 'LOCAL_ONLY'); assert.equal(pkg.code, 'EVIDENCE_UPLOAD_FAILED'); }
    const partial = await packageFixture(sub, true);
    for (const pkg of await partial.retainPackages()) {
      assert.equal(pkg.manifest.status, 'PARTIAL'); assert.equal(pkg.code, 'EVIDENCE_SECTIONS_MISSING');
      assert.deepEqual(pkg.manifest.missingSections, [{ sectionKey: 'top-products', reason: 'SECTION_NOT_FOUND' }]);
    }
    // Byte drift reaches the local package hash guard before any upload.
    const before = f.remote.state.requests;
    await writeFile(join(f.dir, '30d/evidence/raw-responses.json'), '[]');
    const invalid = (await f.retainPackages())[0]!;
    assert.equal(invalid.status, 'FAILED'); assert.equal(invalid.code, 'EVIDENCE_PACKAGE_INVALID_OR_MISSING');
    assert.equal(f.remote.state.requests - before, 2, 'only the untouched second package attempts a conditional PUT and verification GET');
    const report = await published(sub, true, undefined, true);
    const index = JSON.parse((await report.artifacts.read(report.semantic.evidenceIndexSha)).toString()) as NumberEvidenceIndex;
    for (const pkg of index.packages) { assert.equal(pkg.status, 'LOCAL_ONLY'); assert.equal(pkg.code, 'EVIDENCE_UPLOAD_FAILED'); }
    assert.match((await report.service.readReport(workspaceId, report.runId, 'MARKET')).bytes.toString(), /Synthetic zinc/);
  });
});

test('A3 every number in the synthetic zinc v3 report has an exact capture/section/source reference', async t => {
  const f = await packageFixture(t);
  const built = await renderV3Report(f.archive, model);
  const index = buildNumberEvidenceIndex(f.archive, built.trace, await f.retainPackages());
  assert.equal(built.gate.ok, true); assert.equal(built.gate.coveredUntraced, 0);
  assert.equal(index.numbers.length, 496, 'number count frozen from the pre-EVR2 synthetic zinc report');
  for (const [i, number] of index.numbers.entries()) {
    assert.equal(number.numberRef, `n${i}`); assert.equal(number.token, built.trace.entries[i]!.token); assert.ok(number.refs.length);
    for (const ref of number.refs) {
      const window = f.archive.windows.find(w => w.manifest.captureId === ref.captureId)!;
      assert.ok(window); assert.match(ref.jsonPath, /^\//); assert.match(ref.sectionKey, /^(search-settings|kpi|platform-share|trend-chart|shop-types|price-bands|top-brands|top-shops|top-products)$/);
      if (ref.source === 'raw-responses') {
        const value = ref.jsonPath.split('/').slice(1).reduce((v: any, k) => v[k.replaceAll('~1', '/').replaceAll('~0', '~')], window.raw);
        assert.notEqual(value, undefined);
        assert.notEqual(ref.sectionKey, 'search-settings');
      } else assert.equal(ref.sectionKey, 'search-settings');
    }
  }
  await t.test('A3 negative control: removing one evidence ref blocks P5 with its explicit code', () => {
    const changed = structuredClone(index);
    changed.numbers.find(n => n.refs[0]!.source === 'raw-responses')!.refs.pop();
    assert.throws(() => assertNumberEvidence(changed, built.trace, f.archive), { message: 'V3_NUMBER_EVIDENCE_MISSING' });
  });
});

test('A4 old stored builders v1 and v2 still read and download frozen HTML/trace/PDF bytes with evidence ON', async t => {
  for (const version of ['v1', 'v2']) await t.test(`A4 stored ${version}`, async sub => {
    const f = await published(sub);
    const saved = JSON.parse(gunzipSync(await readFile(new URL(`../fixtures/evr2/stored-${version}.json.gz`, import.meta.url))).toString());
    async function retain(bytes: Buffer, type: string) {
      const file = await f.artifacts.put(bytes);
      f.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
        VALUES (?,?,?,?,'2026-02-01T00:00:00.000Z','1.0.0','active','2026-02-01T00:00:00.000Z') ON CONFLICT DO NOTHING`).run(file.sha256, file.byteSize, type, file.relativePath);
      return file.sha256;
    }
    const pdf = await readFile(new URL('../../tools/mcp-market/tests/fixtures/sample-report.pdf', import.meta.url));
    const htmlSha = await retain(Buffer.from(saved.html), 'text/html; charset=utf-8');
    const pdfSha = await retain(pdf, 'application/pdf');
    const semantic = { ...f.semantic, rendererVersion: `metric-v3-report-${version}`, htmlSha, opening: saved.opening, numberTrace: saved.trace, numberTraceGate: saved.gate };
    const semanticSha = await retain(Buffer.from(canonicalJson(semantic)), 'application/json');
    const traceSha = await retain(jsonBytes(saved.trace), 'application/json');
    const row = f.db.prepare('SELECT input_sha256 inputSha FROM analysis_reader_report_revisions WHERE revision_id=?').get(f.revision.revisionId) as { inputSha: string };
    const input = JSON.parse((await f.artifacts.read(row.inputSha)).toString());
    const inputSha = await retain(jsonBytes({ ...input, semanticSha256: semanticSha, htmlSha256: htmlSha }), 'application/json');
    // Install historical state in this disposable synthetic DB, preserving bound capture identities.
    f.db.exec('DROP TRIGGER analysis_research_automation_outputs_no_update; DROP TRIGGER analysis_reader_report_revisions_no_update');
    f.db.prepare('UPDATE analysis_research_automation_outputs SET version_sha256=?,html_sha256=?,pdf_sha256=?,pdf_unavailable_code=NULL WHERE run_id=?').run(semanticSha, htmlSha, pdfSha, f.runId);
    f.db.prepare('UPDATE analysis_reader_report_revisions SET builder_version=?,request_sha256=?,draft_pair_id=?,input_sha256=?,html_sha256=?,metrics_sha256=? WHERE revision_id=?')
      .run(`metric-v3-report-${version}`, semanticSha, semanticSha, inputSha, htmlSha, traceSha, f.revision.revisionId);
    const fresh = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
      workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts })), metricEvidence: { store: f.remote.store } });
    assert.equal((await fresh.readReport(workspaceId, f.runId, 'MARKET')).bytes.toString(), saved.html);
    assert.deepEqual((await fresh.readReport(workspaceId, f.runId, 'MARKET', true)).bytes, pdf);
    assert.equal((await fresh.readReaderReport(workspaceId, f.runId, f.revision.revisionId)).bytes.toString(), saved.html);
    assert.deepEqual(JSON.parse((await f.artifacts.read(traceSha)).toString()), saved.trace);
    await assert.rejects(fresh.readNumberEvidence(workspaceId, f.revision.revisionId, 'n0'), { code: 'evidence_not_available' });
    const api = await serve(sub, f, true);
    const root = `${api.base}/api/workspaces/${workspaceId}/research-automation/runs/${f.runId}`;
    for (const [path, expected] of [[`reader-reports/${f.revision.revisionId}/html`, Buffer.from(saved.html)], ['reports/market', Buffer.from(saved.html)], ['reports/market/pdf', pdf]] as const) {
      const response = await fetch(`${root}/${path}`);
      assert.equal(response.status, 200, path); assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected, path);
    }
    await sub.test(`A4 negative control ${version}: digest-valid HTML drift fails stored replay`, async () => {
      const changed = await retain(Buffer.from(saved.html.replace('Synthetic zinc item 1', 'Tampered zinc item 1')), 'text/html; charset=utf-8');
      assert.notEqual(changed, htmlSha);
      const changedSemantic = await retain(Buffer.from(canonicalJson({ ...semantic, htmlSha: changed })), 'application/json');
      f.db.prepare('UPDATE analysis_research_automation_outputs SET version_sha256=?,html_sha256=? WHERE run_id=?').run(changedSemantic, changed, f.runId);
      await assert.rejects(fresh.readReport(workspaceId, f.runId, 'MARKET'), /Stored v3 report differs from retained evidence/);
    });
  });
});

test('A5 app resolves the stored number to settings and two private 24h links before MCP forwarding', async t => {
  const f = await published(t, true);
  const index = JSON.parse((await f.artifacts.read(f.semantic.evidenceIndexSha)).toString()) as NumberEvidenceIndex;
  const number = index.numbers.find(n => n.refs.length === 1 && n.refs[0]!.sectionKey === 'top-products' && n.refs[0]!.source === 'raw-responses')!;
  const before = Date.now();
  const result = await f.service.readNumberEvidence(workspaceId, f.revision.revisionId, number.numberRef) as any;
  assert.equal(result.numberRef, number.numberRef); assert.equal(result.sectionName, 'Sản phẩm bán chạy nhất'); assert.equal(result.capturedAt, capturedAt);
  assert.equal(result.evidenceStatus, 'UPLOADED'); assert.equal(result.code, null);
  assert.deepEqual(result.settings, { keywords: ['synthetic zinc', 'synthetic zinc capsule'], category: f.bundle.spec.preset.category,
    platforms: ['shopee', 'lazada', 'tiki', 'tiktok'], period: f.bundle.spec.windows[0].period, smartQuery: true, windowId: '30d', captureMethod: 'ui', adapterVersion: evidenceAdapter.V3_ADAPTER_VERSION });
  assert.deepEqual(Object.keys(result.urls).sort(), ['fullPage', 'section']);
  const captureId = number.refs[0]!.captureId;
  for (const [name, file] of [['section', 'sections/top-products.png'], ['fullPage', 'full-page.png']]) {
    const link = result.urls[name!];
    const url = new URL(link.url);
    assert.equal(url.protocol, 'https:'); assert.equal(url.hostname, `${'a'.repeat(32)}.r2.cloudflarestorage.com`);
    assert.equal(url.pathname, `/tdn-media/metric-evidence/${workspaceId}/${f.runId}/${captureId}/${file}`);
    assert.equal(url.searchParams.get('X-Amz-Expires'), '86400'); assert.match(url.searchParams.get('X-Amz-Signature')!, /^[0-9a-f]{64}$/);
    assert.ok(Date.parse(link.expiresAt) >= before + 86400000 && Date.parse(link.expiresAt) <= Date.now() + 86400000);
  }
  // Fixed GET signing vector independently computed with Python hashlib/hmac and
  // urllib RFC3986 encoding, using only the fake credentials in the shared fixture.
  const key = `metric-evidence/${workspaceId}/${fakeRunId}/eeeeeeee-0000-4000-8000-000000000001/sections/top-products.png`;
  const vector = f.remote.store.presignGet(key, undefined, new Date(capturedAt));
  assert.equal(new URL(vector.url).searchParams.get('X-Amz-Signature'), 'ab90a54a48ac815f2bc1ea333d5059517b482896c8fd1188f138c03d3bdf9131');
  assert.equal(vector.expiresAt, '2026-10-27T07:00:00.000Z');
  assert.equal(new URL(f.remote.store.presignGet(key, 9999999, new Date(capturedAt)).url).searchParams.get('X-Amz-Expires'), '604800');
  const changes = f.db.prepare('SELECT total_changes() n').get();
  const listed = await f.service.readNumberEvidence(workspaceId, f.revision.revisionId) as any;
  assert.deepEqual(listed.numbers, index.numbers); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  await t.test('A5 negative controls: another workspace, unknown ref and unauthorized OWNER reads are refused', async () => {
    await assert.rejects(f.service.readNumberEvidence('99999999-9999-4999-8999-999999999999', f.revision.revisionId, number.numberRef), { code: 'report_not_available' });
    await assert.rejects(f.service.readNumberEvidence(workspaceId, f.revision.revisionId, 'n999999'), { code: 'number_ref_unknown' });
    const api = await serve(t, f, true);
    const root = `${api.base}/owner-api/workspaces/${workspaceId}/research-automation/reports/${f.revision.revisionId}/numbers`;
    assert.equal((await fetch(root, { headers: { origin: api.base } })).status, 401);
    assert.equal((await fetch(root, { headers: { ...api.headers, origin: 'http://wrong-origin.invalid' } })).status, 403);
    for (const [url, code] of [[`${root}/n999999`, 'number_ref_unknown'], [root.replace(workspaceId, '99999999-9999-4999-8999-999999999999'), 'report_not_available']]) {
      const response = await fetch(url!, { headers: api.headers });
      assert.equal(response.status, 404); assert.equal((await response.json() as any).error.code, code);
    }
  });
});

const chromium = process.env.TDN_RESEARCH_PDF_CHROMIUM;
test('A6 evidence-enabled report HTML and rendered PDF exclude provider names', { skip: !chromium }, async t => {
  const renderer = createChromiumPdfRenderer({ executablePath: chromium! }); t.after(() => renderer.close());
  const f = await published(t, true, renderer);
  const html = (await f.service.readReport(workspaceId, f.runId, 'MARKET')).bytes;
  const pdf = (await f.service.readReport(workspaceId, f.runId, 'MARKET', true)).bytes;
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const dir = await temporary(t);
  const pdfPath = join(dir, 'synthetic.pdf'); await writeFile(pdfPath, pdf);
  const text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
  assert.match(text, /Synthetic zinc/); assert.match(text, /Shopee/);
  const check = (s: string) => assert.doesNotMatch(s, /\b(?:Metric|Kalodata|TradeInt|Dami)\b/iu);
  check(html.toString()); check(text);
  assert.doesNotMatch(html.toString(), /metric-evidence\/|X-Amz-Signature|full-page\.png|sections\/top-products\.png/);
  await t.test('A6 negative control: a provider name in a captured product blocks report publication', async () => {
    const changed = structuredClone(f.bundle.archive);
    changed.windows[0]!.raw.find((r: any) => r.body.data?.products).body.data.products[0].product_name = 'Metric synthetic product';
    await assert.rejects(renderV3Report(changed, model), { message: 'V3_REPORT_PROVIDER_NAME' });
    assert.throws(() => check(`${text}\nMetric`), assert.AssertionError);
  });
});
