import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { metaOwningFixture, metaWorkspaceId as workspaceId, metaRunId as runId } from '../helpers/meta-page-fixture.js';
import type { MetaPageSourceView } from '../../contracts/api/research-automation-meta-page-api.generated.js';
const owner = { role: 'OWNER' };
const hash = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
test('actual E11 classified source/search/L9 -> OWNER saved-page API -> inert preparation -> confirmation -> located retained reads/history/activity', async t => {
  const f = await metaOwningFixture(t); const baselineCalls = f.calls();
  const changes = () => f.db.prepare('SELECT total_changes() n').get();
  const oldOutputs = f.db.prepare('SELECT * FROM analysis_research_automation_outputs').all();
  const oldSchemas = f.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
  const originalReport = await f.service.readReport(workspaceId, runId, 'MARKET', false, f.firstPair.pairId);
  await t.test('unavailable authentic peer, stale pair, wrong source references, role and prepublication cancellation refuse without writes', async () => {
    for (const selection of [{ ...f.request.selection, peerIdentityKey: 'not-selected' }, { ...f.request.selection, pairId: f.firstPair.pairId },
      { ...f.request.selection, keywordDraftSha256: 'a'.repeat(64) }, { ...f.request.selection, searchCaptureId: 'b'.repeat(64) },
      { ...f.request.selection, searchPosition: 999 }, { ...f.request.selection, pageId: '999999' }]) {
      const before = changes(); await assert.rejects(f.service.prepareMetaPageSource(workspaceId, runId, { ...f.request, selection }, owner)); assert.deepEqual(changes(), before);
    }
    for (const [w, r] of [[randomUUID(), runId], [workspaceId, randomUUID()]]) {
      const before = changes(); await assert.rejects(f.service.prepareMetaPageSource(w!, r!, f.request, owner)); assert.deepEqual(changes(), before);
    }
    const before = changes(); await assert.rejects(f.service.prepareMetaPageSource(workspaceId, runId, f.request, { role: 'MEMBER' }));
    const signal = new AbortController(); signal.abort(); await assert.rejects(f.service.prepareMetaPageSource(workspaceId, runId, f.request, owner, signal.signal));
    assert.deepEqual(changes(), before);
  });
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as AddressInfo).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`, token = 'synthetic-owner-token-1234567890-abcdefghijklmnopqrstuvwxyz';
  const app = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin: base,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: base, actorId: 'owner:synthetic-meta' } });
  const server = http.createServer(app.handler); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await app.close(); });
  const apiRoot = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/meta-page`;
  const ownerRoot = `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/meta-page`;
  const headers = { Origin: base, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const post = (body: unknown, suffix = '', supplied = headers) => fetch(ownerRoot + suffix, { method: 'POST', headers: supplied, body: JSON.stringify(body) });
  const get = (suffix = '') => fetch(apiRoot + suffix, { headers });
  let prepared!: MetaPageSourceView, confirmed!: MetaPageSourceView;
  await t.test('HTTP role/origin/closed fields/invalid source/locator/control states cannot publish', async () => {
    assert.equal((await post(f.request, '', { ...headers, Authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await post(f.request, '', { ...headers, Origin: 'http://example.invalid' })).status, 403);
    assert.equal((await fetch(apiRoot)).status, 403);
    const before = changes();
    assert.equal((await post({ ...f.request, ownerAdmitted: true })).status, 400);
    for (const changed of [ { ...f.raw.capture, controlState: 'CAPTCHA' }, { ...f.raw.capture, pageId: '999999' },
      { ...f.raw.capture, libraryUrl: 'https://example.invalid/' }, { ...f.raw.capture, capturedAt: '2026-99-99T00:00:00Z' },
      { ...f.raw.capture, htmlSha256: 'f'.repeat(64) }, { ...f.raw.capture, ads: [{ ...f.raw.capture.ads[0]!, pageName: { value: 'forged peer name', span: f.raw.capture.ads[0]!.pageName.span } }] },
      { ...f.raw.capture, ads: [f.raw.capture.ads[0]!, { ...f.raw.capture.ads[0]!, status: f.raw.capture.ads[1]!.status }] } ]) {
      const response = await post({ ...f.request, visibleFieldsBase64: Buffer.from(JSON.stringify(changed)).toString('base64') });
      assert.equal(response.status, 400, await response.clone().text());
    }
    // A malformed calendar literal with authentic byte locator/hash still fails the closed date profile.
    const invalidDateHtml = Buffer.from(f.raw.html);
    const invalidDateCapture = structuredClone(f.raw.capture);
    const startSpan = invalidDateCapture.ads[0]!.startDate.span;
    invalidDateHtml.write('2026-02-30', startSpan.byteOffset, 'utf8');
    for (const ad of invalidDateCapture.ads) if (ad.startDate.span.byteOffset === startSpan.byteOffset) ad.startDate.value = '2026-02-30';
    invalidDateCapture.htmlSha256 = hash(invalidDateHtml);
    assert.equal((await post({ ...f.request, htmlBase64: invalidDateHtml.toString('base64'), visibleFieldsBase64: Buffer.from(JSON.stringify(invalidDateCapture)).toString('base64') })).status, 400);
    assert.deepEqual(changes(), before);
    assert.deepEqual(await (await get()).json(), []);
  });
  await t.test('actual OWNER preparation preserves first200 source text/locators/missing fields, exact L9 exclusions and duplicate evidence', async () => {
    const response = await post(f.request); assert.equal(response.status, 201, await response.clone().text()); prepared = await response.json() as MetaPageSourceView;
    assert.equal(prepared.state, 'PREPARED'); assert.equal(prepared.confirmation, null);
    assert.equal(prepared.runtimeCollector, 'UNAVAILABLE_OPENCLI_CONTRACT_MISSING');
    assert.deepEqual(prepared.capture, f.raw.capture); assert.equal(prepared.projection.observations.length, 3); assert.equal(prepared.projection.duplicateObservations, 1);
    assert.equal(prepared.projection.observations[0]!.textFirst200, Array.from(f.raw.capture.ads[0]!.text.value).slice(0, 200).join(''));
    assert.equal(prepared.projection.observations[0]!.ageDaysToCapture, 30);
    assert.equal(prepared.projection.observations[1]!.status, 'INACTIVE'); assert.equal(prepared.projection.observations[1]!.stopDate, null);
    assert.equal(prepared.projection.observations[0]!.platforms, null); assert.equal(prepared.projection.observations[0]!.spendRangeLiteral, null);
    assert.deepEqual(prepared.projection.includedLibraryIds, ['9001']); assert.deepEqual(prepared.projection.adFilter.results.map(r => r.decision), ['INCLUDED', 'EXCLUDED', 'UNCLEAR']);
    assert.equal((await f.service.readSourceActivity(workspaceId))['meta-ad-library'].dataCount, 0);
    assert.deepEqual(await (await get(`/${prepared.prepared.packageId}`)).json(), prepared);
    assert.deepEqual(await (await get()).json(), [prepared]);
  });
  const confirmation = { contractVersion: 'meta-page-confirm-v1', requestKey: randomUUID(), expectedRevision: f.current.revision, packageId: '' };
  await t.test('explicit confirmation and independent-instance exact retries make no duplicate writes/clock/provider/model calls', async () => {
    confirmation.packageId = prepared.prepared.packageId;
    const beforeWrong = changes(); assert.equal((await post({ ...confirmation, packageId: randomUUID() }, '/confirm')).status, 500); assert.deepEqual(changes(), beforeWrong);
    const response = await post(confirmation, '/confirm'); assert.equal(response.status, 201, await response.clone().text()); confirmed = await response.json() as MetaPageSourceView;
    assert.equal(confirmed.state, 'CONFIRMED'); assert.ok(confirmed.confirmation);
    assert.deepEqual(await (await get()).json(), [confirmed]);
    assert.deepEqual(await (await get(`/${confirmed.confirmation!.packageId}`)).json(), confirmed);
    const activity = await f.service.readSourceActivity(workspaceId); assert.deepEqual(activity['meta-ad-library'], { lastDataAt: f.raw.capture.capturedAt, dataCount: 1, lastUsageAt: null });
    const reread = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, metricAttachmentStore: f.staging, workspaceReader: f.workspaces,
      now: () => { throw new Error('Retry must not read clock'); } });
    const before = changes();
    assert.deepEqual(await reread.prepareMetaPageSource(workspaceId, runId, f.request, owner), prepared);
    assert.deepEqual(await reread.confirmMetaPageSource(workspaceId, runId, confirmation, owner), confirmed);
    await Promise.all([reread.prepareMetaPageSource(workspaceId, runId, f.request, owner), f.service.prepareMetaPageSource(workspaceId, runId, f.request, owner)]);
    assert.deepEqual(changes(), before); assert.deepEqual(f.calls(), baselineCalls);
    const changed = { ...f.request, visibleFieldsBase64: Buffer.from(JSON.stringify({ ...f.raw.capture, capturedAt: '2026-10-07T08:00:00.000Z' })).toString('base64') };
    assert.equal((await post(changed)).status, 409); assert.deepEqual(changes(), before);
    assert.deepEqual(await f.service.listMetaPageSources(workspaceId, runId), [confirmed]);
  });
  await t.test('cold query-only process reauthenticates original dependencies under changed config with zero writes/calls and identical located source view', async () => {
    const before = changes(); const previousPath = process.env.PATH;
    const cold = spawnSync(process.execPath, ['--import', 'tsx', 'tests/helpers/meta-page-cold-read.ts', f.databasePath, f.artifactRoot, workspaceId, runId, confirmed.confirmation!.packageId],
      { env: { ...process.env, PATH: '/no-python-or-browser' }, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(process.env.PATH, previousPath); assert.equal(cold.status, 0, cold.stderr.toString());
    const proof = JSON.parse(cold.stdout.toString()); assert.equal(proof.viewSha256, hash(JSON.stringify(confirmed))); assert.equal(proof.historySha256, hash(JSON.stringify([confirmed])));
    assert.deepEqual({ ...proof, viewSha256: '', historySha256: '' }, { viewSha256: '', historySha256: '', totalChanges: 0, casPuts: 0, clockCalls: 0, workspaceCalls: 0, modelCalls: 0, queryOnly: true });
    assert.deepEqual(changes(), before); assert.deepEqual(f.calls(), baselineCalls);
  });
  await t.test('warm read verifies every raw/schema/binding/projection/manifest/origin member and cannot repair corruption', async () => {
    const source = f.db.prepare('SELECT * FROM foundation_source_packages WHERE package_id=?').get(prepared.prepared.packageId) as Record<string, string>;
    const members = f.db.prepare('SELECT logical_path,artifact_sha256 FROM foundation_source_package_files WHERE package_id=?').all(prepared.prepared.packageId) as Array<{ logical_path: string; artifact_sha256: string }>;
    for (const row of [...members, { logical_path: 'manifest', artifact_sha256: source.manifest_artifact_sha256! }]) {
      const location = f.artifacts.pathForDigest(row.artifact_sha256), saved = await fs.readFile(location); await fs.writeFile(location, 'synthetic corruption');
      const before = changes(); await assert.rejects(f.service.readMetaPageSource(workspaceId, runId, confirmed.confirmation!.packageId), (error: unknown) => error instanceof Error, row.logical_path);
      assert.deepEqual(changes(), before); assert.equal((await fs.readFile(location)).toString(), 'synthetic corruption'); await fs.writeFile(location, saved);
      assert.deepEqual(await f.service.readMetaPageSource(workspaceId, runId, confirmed.confirmation!.packageId), confirmed);
    }
    // Immutable storage refuses an in-place origin change. An internally misbound synthetic attachment also fails selected read.
    assert.throws(() => f.db.prepare('UPDATE foundation_source_attachment_origins SET binding_sha256=? WHERE package_id=?').run('f'.repeat(64), prepared.prepared.packageId));
    const packages = new SourcePackageService({ db: f.db, artifactStore: f.artifacts, now: () => new Date('2026-10-08T12:00:00.000Z') });
    const retained = await packages.readVerified(prepared.prepared.packageId);
    const { packageId: _id, finalizedAt: _at, packageContentSha256: _sha, ...input } = retained.manifest;
    const wrongOrigin = await packages.intakeAutomationAttachment({ ...input, packageKey: `synthetic-meta-origin:${randomUUID()}` }, new Map(retained.files.map(file => [file.path, file.bytes])), 'f'.repeat(64));
    await assert.rejects(f.service.readMetaPageSource(workspaceId, runId, wrongOrigin.packageId), /META_ORIGIN_INVALID/);
    assert.deepEqual(await f.service.readMetaPageSource(workspaceId, runId, confirmed.confirmation!.packageId), confirmed);
    // Valid-schema, fully rehashed semantic mutation: Foundation verifies exact members/manifests/origin, owning resolver still rejects false peer revenue.
    const changedBinding = structuredClone(prepared.binding); changedBinding.peerMember.revenue = '999';
    const changedRequest = { ...f.request, requestKey: randomUUID() };
    const changedFiles = new Map(retained.files.map(file => [file.path, file.bytes]));
    changedFiles.set('binding/source.json', Buffer.from(canonicalJson(changedBinding)));
    changedFiles.set('request/prepare.json', Buffer.from(canonicalJson(changedRequest)));
    const semanticMutation = await packages.intakeAutomationAttachment({ ...input, packageKey: `synthetic-meta-semantic:${randomUUID()}`,
      files: retained.manifest.files.map(file => ({ ...file, sha256: hash(changedFiles.get(file.path)!), byteSize: changedFiles.get(file.path)!.length })) },
      changedFiles, hash(canonicalJson(changedBinding)));
    await packages.readVerified(semanticMutation.packageId);
    const beforeSemanticRead = changes();
    await assert.rejects(f.service.readMetaPageSource(workspaceId, runId, semanticMutation.packageId), /META_RETAINED_BINDING_INVALID/);
    assert.deepEqual(changes(), beforeSemanticRead);
  });
  await t.test('old report/current configuration/source contracts remain unchanged and retained historical peer remains readable after a newer pair', async () => {
    assert.deepEqual(f.db.prepare('SELECT * FROM analysis_research_automation_outputs').all(), oldOutputs);
    assert.deepEqual(f.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all(), oldSchemas);
    assert.deepEqual((await f.service.readReport(workspaceId, runId, 'MARKET', false, f.firstPair.pairId)).bytes, originalReport.bytes);
    assert.deepEqual((await f.service.readReport(workspaceId, runId, 'MARKET', false, f.pair.pairId)).bytes, f.report.bytes);
    await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: f.pair.pairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } }); await f.service.processNext();
    const stale = { ...f.request, requestKey: randomUUID(), expectedRevision: (await f.service.getRun(workspaceId, runId)).revision };
    await assert.rejects(f.service.prepareMetaPageSource(workspaceId, runId, stale, owner), /no longer current/);
    assert.deepEqual(await f.service.readMetaPageSource(workspaceId, runId, confirmed.confirmation!.packageId), confirmed);
    const beforeRetry = changes();
    assert.deepEqual(await f.service.prepareMetaPageSource(workspaceId, runId, f.request, owner), prepared);
    assert.deepEqual(await f.service.confirmMetaPageSource(workspaceId, runId, confirmation, owner), confirmed);
    assert.deepEqual(changes(), beforeRetry);
    // A valid source semantic variant remains literal: an unrecognized visible status is UNKNOWN, not inactive/zero.
    const variantHtml = Buffer.from(f.raw.html), variantCapture = structuredClone(f.raw.capture);
    const span = variantCapture.ads[0]!.status.span; variantHtml.write('Absent', span.byteOffset, 'utf8');
    for (const ad of variantCapture.ads) if (ad.status.span.byteOffset === span.byteOffset) ad.status.value = 'Absent';
    variantCapture.htmlSha256 = hash(variantHtml);
    const newPair = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
    const variant = await f.service.prepareMetaPageSource(workspaceId, runId, { ...f.request, requestKey: randomUUID(), expectedRevision: stale.expectedRevision,
      selection: { ...f.request.selection, pairId: newPair.pairId }, htmlBase64: variantHtml.toString('base64'), visibleFieldsBase64: Buffer.from(JSON.stringify(variantCapture)).toString('base64') }, owner);
    assert.equal(variant.projection.observations[0]!.statusLiteral, 'Absent'); assert.equal(variant.projection.observations[0]!.status, 'UNKNOWN');
    assert.equal(variant.projection.observations[0]!.stopDate, null);
    assert.deepEqual(await f.service.readMetaPageSource(workspaceId, runId, variant.prepared.packageId), variant);
    assert.equal((await f.service.readSourceActivity(workspaceId))['meta-ad-library'].dataCount, 1, 'unconfirmed semantic variant does not invent admitted data');
    assert.deepEqual(f.calls(), baselineCalls);
  });
  await t.test('OWNER HTTP rejects a lone surrogate with valid source hash/span before publication, while literal replacement and non-BMP text roundtrip unchanged', async () => {
    const pair = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
    const revision = (await f.service.getRun(workspaceId, runId)).revision;
    const literalRequest = (prefix: string, declarationPrefix = prefix) => {
      const html = Buffer.from(f.raw.html), capture = structuredClone(f.raw.capture), span = capture.ads[0]!.text.span;
      const sourceText = prefix + ' Synthetic nồi chiên';
      const padding = ' '.repeat(span.byteLength - Buffer.byteLength(sourceText, 'utf8'));
      html.fill(32, span.byteOffset, span.byteOffset + span.byteLength);
      html.write(sourceText, span.byteOffset, 'utf8');
      const declaredText = declarationPrefix + ' Synthetic nồi chiên' + padding;
      for (const ad of capture.ads) if (ad.text.span.byteOffset === span.byteOffset) ad.text.value = declaredText;
      capture.htmlSha256 = hash(html);
      return { request: { ...f.request, requestKey: randomUUID(), expectedRevision: revision, selection: { ...f.request.selection, pairId: pair.pairId },
        htmlBase64: html.toString('base64'), visibleFieldsBase64: Buffer.from(JSON.stringify(capture)).toString('base64') }, capture, declaredText };
    };
    const publications = async () => ({
      packages: f.db.prepare('SELECT * FROM foundation_source_packages ORDER BY package_id').all(),
      members: f.db.prepare('SELECT * FROM foundation_source_package_files ORDER BY package_id,logical_path').all(),
      artifactFiles: await Promise.all((await fs.readdir(f.artifactRoot, { recursive: true })).sort().map(async name => {
        const path = `${f.artifactRoot}/${name}`;
        return [name, (await fs.stat(path)).isFile() ? hash(await fs.readFile(path)) : null];
      })),
    });
    const malformed = literalRequest('\ufffd', '\ud800'), before = await publications(), beforeChanges = changes();
    const refused = await post(malformed.request);
    assert.equal(refused.status, 400, await refused.clone().text());
    assert.deepEqual(await publications(), before); assert.deepEqual(changes(), beforeChanges);
    for (const prefix of ['\ufffd', '\u{1f680}']) {
      const valid = literalRequest(prefix), response = await post(valid.request);
      assert.equal(response.status, 201, await response.clone().text());
      const view = await response.json() as MetaPageSourceView;
      assert.deepEqual(view.capture, valid.capture);
      assert.equal(view.projection.observations[0]!.textFirst200, Array.from(valid.declaredText).slice(0, 200).join(''));
      assert.deepEqual(await (await get(`/${view.prepared.packageId}`)).json(), view);
    }
    assert.deepEqual(f.calls(), baselineCalls);
  });
});
