import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { registerHooks, syncBuiltinESMExports } from 'node:module';

// Usage: node --import tsx tests/helpers/generate-shopee-public-main-baselines.ts ROOT OUTPUT
// ROOT is the independent main checkout. Neither its source nor its fixtures are modified.
const [rootArg, outputArg, candidate] = process.argv.slice(2);
assert.ok(rootArg && outputArg, 'ROOT and OUTPUT arguments required');
const root = path.resolve(rootArg), output = path.resolve(outputArg);
// Candidate evidence is independent of checkout identity; only real baseline runs pin HEAD.
let revision = 'candidate';
if (candidate !== '--candidate') {
  const gitEntry = path.join(root, '.git');
  const gitDirectory = (await fs.stat(gitEntry)).isDirectory() ? gitEntry
    : path.resolve(root, (await fs.readFile(gitEntry, 'utf8')).trim().replace(/^gitdir: /u, ''));
  revision = (await fs.readFile(path.join(gitDirectory, 'HEAD'), 'utf8')).trim();
  assert.equal(revision, 'e10c7a720c655489e2abaa65633e133b279eba8e');
}
assert.ok(!output.startsWith(root + path.sep), 'baseline output must not modify main');
for (const key of ['TDN_CHROMIUM_PATH', 'TDN_RESEARCH_PDF_CHROMIUM', 'TDN_REQUIRE_BROWSER', 'TDN_BROWSER_EXECUTABLE', 'TDN_RESEARCH_CAPTURE_RELEVANCE_AI_MODEL']) assert.equal(process.env[key], undefined, `${key} must be unset`);
globalThis.fetch = async () => { throw new Error('Network forbidden in baseline generator'); };
registerHooks({ resolve(specifier, context, next) {
  assert.doesNotMatch(specifier, /playwright|chromium/iu, 'browser module forbidden');
  return next(specifier, context);
} });
const RealDate = Date;
const at = '2026-02-01T00:00:00.000Z';
class FixedDate extends RealDate {
  constructor(value?: string | number) { super(value ?? '2026-10-19T00:00:00.000Z'); }
  static override now() { return RealDate.parse('2026-10-19T00:00:00.000Z'); }
}
globalThis.Date = FixedDate as DateConstructor;
let serial = 0;
crypto.randomUUID = () => `bbbbbbbb-0000-4000-8000-${String(++serial).padStart(12, '0')}`;
syncBuiltinESMExports();
const load = async (relative: string): Promise<any> => import(pathToFileURL(path.join(root, relative)).href);
const { fixture, drain, workspaceId, captureFiles } = await load('tests/helpers/autorun-harness.ts');
const { researchAutomationProviderConfigFromEnv: config } = await load('src/modules/analysis/research-automation/providers.ts');
const { buildConfirmValue } = await load('src/modules/analysis/research-automation/autorun-derive.ts');
const { FixtureShopeeCollector, shopeeActorInputSha256 } = await load('src/platform/collectors/apify-shopee.ts');
const { buildResearchAutomationSourceStatus } = await load('src/modules/analysis/research-automation/source-status.ts');
const { ResearchAutomationService } = await load('src/modules/analysis/research-automation/service.ts');
const { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } = await load('src/modules/flow/index.ts');
const { SOURCE_BOARD_ORDER } = await load('src/modules/analysis/research-automation/source-status.ts');
const { packageAReaderFixture } = await load('tests/helpers/package-a-reader-fixture.ts');
const { SourcePackageService } = await load('src/modules/foundation/source-package-service.ts');
const { ContentAddressedArtifactStore } = await load('src/platform/artifacts/artifact-store.ts');
const { seedNativeDamiPackage } = await load('tests/helpers/native-dami-package-fixture.ts');
const { sync1ReaderFixture } = await load('tests/helpers/sync1-reader-fixture.ts');
const { deriveReaderSource, verifyWebSnapshot, webSnapshotDigest } = await load('src/modules/analysis/reader-report/web-facts.ts');
const { privateReaderFixture } = await load('tests/helpers/insight-reader-private-fixture.ts');
const { reviewPolicyFixture } = await load('tests/helpers/review-policy-fixture.ts');
const files = new Map<string, Buffer>();
// The phase-1 capture inventory is fixed: a new empty schema table is not a produced package member.
const referenceManifest=JSON.parse(await fs.readFile(new URL('../fixtures/shopee-public-main/manifest.json',import.meta.url),'utf8'));
const baselineTables=new Set<string>(referenceManifest.files.flatMap((f: {name:string})=>f.name.includes('/records/')?[path.basename(f.name,'.json')]:[]));
const put = (name: string, value: unknown) => files.set(name, Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n'));
const paidEnv = { TDN_APIFY_TOKEN: 'synthetic-token', TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD: '1', TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT: '20' };
const invalidCompanions = { TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN: '\n', TDN_RESEARCH_SHOPEE_PUBLIC_BASE_URL: 'invalid', TDN_RESEARCH_SHOPEE_PUBLIC_MAX_COMMENTS_PER_PRODUCT: '01' };
const configurations = { absent: config({}), unconfigured: config({ TDN_APIFY_TOKEN: 'synthetic-token' }), paid: config(paidEnv),
  trial: config({ ...paidEnv, TDN_RESEARCH_AUTORUN_TEST_REVIEWS: '1' }), ignored: config(invalidCompanions) };
for (const [name, providers] of Object.entries(configurations)) {
  // Keep tokens out of baseline serialization; the real status/confirmation outputs are safe.
  const activity = Object.fromEntries(['kalodata', 'serpapi', 'apify-shopee', 'metric', 'kalodata-video', 'apify-tiktok-comments', 'video-reading', 'meta-ad-library', 'tiktok-top-ads', 'official-stats', 'world-bank', 'un-comtrade', 'search-ads-library', 'pageindex'].map(key => [key, { lastDataAt: null, dataCount: 0, lastUsageAt: null }]));
  put(`${name}/source-status.json`, buildResearchAutomationSourceStatus({ workspaceId, checkedAt: at, executorEnabled: true, providers,
    wired: { kalodata: true, serpapi: true, apifyShopee: name === 'paid' || name === 'trial' }, activity: { ...activity, serpapiOperations: [] } }));
  put(`${name}/confirmation.json`, buildConfirmValue({ runId: workspaceId, expectedRevision: 1, keyword: 'synthetic jar', includeTerms: ['synthetic jar'], principalProductIds: [],
    exactShopeeUrls: ['https://shopee.vn/product/91001/92001'], packageId: workspaceId, ...((providers as any).autorunTestReviewCap ? { testReviewCap: (providers as any).autorunTestReviewCap } : {}) }));
}
assert.equal(SOURCE_BOARD_ORDER.length, 14);
async function runScenario(name: string, auto: 'on' | 'off' | 'absent', reviewMode: 'none' | 'exact' | 'trial' | 'native') {
  const cleanup: Array<() => any> = [];
  const t = { after(fn: () => any) { cleanup.push(fn); } };
  const cap = 20;
  const factory = () => ({ requestsIssued: () => 1, collector: { mode: 'live', maxReviewsPerProduct: cap, async collect(selected: any[], requestSha: string, runKey: string, signal?: AbortSignal) {
    const rows = selected.flatMap(listing => Array.from({ length: cap }, (_, n) => ({ shopId: listing.shopId, itemId: listing.itemId, reviewId: `synthetic-${n}`, comment: 'Synthetic retained text', ratingStar: 4 })));
    const collected = await new FixtureShopeeCollector(Buffer.from(JSON.stringify(rows))).collect(selected, requestSha, runKey, signal);
    return { ...collected, mode: 'live', actor: { ...collected.actor, runId: 'SYNTHETIC_RUN', datasetId: 'SYNTHETIC_DATASET', status: 'SUCCEEDED', retrievedAt: at,
      settings: { ...collected.actor.settings, maxReviewsPerProduct: cap, maxChargeUsd: 1 }, inputSha256: shopeeActorInputSha256(selected, cap), stopReason: 'collection_limit_reached' } };
  } } });
  const f = await fixture(t, auto, undefined, undefined, reviewMode === 'trial' ? { cap, factory } : reviewMode === 'exact' ? { factory } : undefined);
  try {
    if (reviewMode === 'native') await seedNativeDamiPackage(new SourcePackageService({ db: f.db, artifactStore: new ContentAddressedArtifactStore(f.artifactRoot), now: () => new Date(at) }),
      { selected: { shopId: '91001', itemId: '92001' }, rawRows: [{ type: 'review', shopid: '91001', itemid: '92001', cmtid: 'synthetic-native', comment: 'Synthetic native text', rating_star: 4, review_date: at, collected_at: at, model_name: null }] });
    const started = await f.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333', mode: 'CATEGORY', keyword: 'synthetic jar',
      requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: auto === 'on' ? ['MARKET'] : ['MARKET', 'INSIGHT'] });
    const runId = started.run.runId;
    if (auto !== 'on') {
      await f.service.processNext();
      const run = await f.service.getRun(workspaceId, runId);
      await f.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: '44444444-4444-4444-8444-444444444444', expectedRevision: run.revision,
        definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
        exactShopeeUrls: reviewMode === 'none' ? [] : ['https://shopee.vn/product/91001/92001'], sources: { metric: { decision: 'SKIPPED' }, nativeReview: reviewMode === 'none' ? 'SKIP' : 'AUTO_REUSE' } });
    }
    await drain(f.service);
    const pairs = await f.service.listReportVersions(workspaceId, runId);
    assert.ok(pairs.length > 0, `${name} must produce reports`);
    for (const kind of (auto === 'on' ? ['MARKET'] : ['MARKET', 'INSIGHT'])) {
      const report = await f.service.readReport(workspaceId, runId, kind, false, pairs.at(-1).pairId);
      if(process.env.TDN_TEST_PUBLIC_REPLAY==='1'){
        let factoryCalls=0;const artifacts=new ContentAddressedArtifactStore(f.artifactRoot);
        const replay=new ResearchAutomationService({db:f.db,artifactStore:artifacts,workspaceReader:new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({db:f.db,artifactStore:artifacts})),now:()=>new Date(at),readerReportFlint:false,shopeePublicReviews:{maxReviewsPerProduct:300,factory:()=>{factoryCalls++;throw new Error('Unexpected public replay factory');}}});
        assert.deepEqual((await replay.readReport(workspaceId,runId,kind,false,pairs.at(-1).pairId)).bytes,report.bytes);assert.equal(factoryCalls,0);
      }
      put(`${name}/${kind.toLowerCase()}.html`, report.bytes);
      assert.deepEqual((await f.make().readReport(workspaceId, runId, kind, false, pairs.at(-1).pairId)).bytes, report.bytes);
    }
    if (auto === 'on') {
      const body = f.service.confirms[0];
      const snapshot = JSON.parse(captureFiles(runId).snapshotBytes.toString());
      const request = { contractVersion: 'reader-report-build-v1.2', requestKey: '55555555-5555-4555-8555-555555555555', metricPackageId: body.sources.metric.packageId,
        platforms: ['shopee'], profile: sync1ReaderFixture().profile, cover: null, source: deriveReaderSource(verifyWebSnapshot(snapshot, webSnapshotDigest(snapshot)), 5000, { nullable: true }) };
      const built = await f.service.buildReaderReport(workspaceId, runId, request, { actorId: 'owner:synthetic', role: 'OWNER' });
      const reader = await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId);
      put(`${name}/reader.html`, reader.bytes);
      assert.deepEqual((await f.make().readReaderReport(workspaceId, runId, built.revision.revisionId)).bytes, reader.bytes);
    }
    for (const entry of await fs.readdir(f.artifactRoot, { recursive: true, withFileTypes: true })) if (entry.isFile()) {
      const full = path.join(entry.parentPath, entry.name);
      put(`${name}/artifacts/${path.relative(f.artifactRoot, full)}`, await fs.readFile(full));
    }
    const tables = f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'analysis_research_automation_%' OR name LIKE 'analysis_reader_report_%' OR name LIKE 'foundation_shopee_%') ORDER BY name").all();
    for (const { name: table } of tables.filter((t: {name:string})=>baselineTables.has(t.name))) put(`${name}/records/${table}.json`, f.db.prepare(`SELECT * FROM "${table}"`).all());
    put(`${name}/run.json`, await f.service.getRun(workspaceId, runId));
  } finally { for (const fn of cleanup.reverse()) await fn(); }
}
await runScenario('absent-run', 'absent', 'none');
await runScenario('unconfigured-run', 'off', 'none');
await runScenario('exact-run', 'off', 'exact');
await runScenario('trial-run', 'on', 'trial');
await runScenario('native-run', 'off', 'native');
for (const name of ['private', 'policy']) {
  const cleanup: Array<() => any> = [];
  const t = { after(fn: () => any) { cleanup.push(fn); } };
  try {
    const f = name === 'private' ? await privateReaderFixture(t, false) : await reviewPolicyFixture(t, [30, 300], 0);
    if (name === 'private') {
      put(`${name}/insight.html`, f.report.bytes);
      assert.deepEqual((await f.service.readReport('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'INSIGHT', false, f.pair.pairId)).bytes, f.report.bytes);
    } else {
      const attempt = await f.bridge.collect(f.input, undefined, () => new Date(at));
      put(`${name}/attempt.json`, attempt);
      const ref = attempt.privateReference;
      assert.ok(ref, 'policy fixture must retain private source');
      put(`${name}/corpus.json`, await f.bridge.privateCorpus(ref, f.input, f.binding));
      put(`${name}/sample.json`, await f.bridge.reviewSample(ref, f.input, f.binding));
    }
    const artifactRoot = path.join(f.root, 'artifacts');
    for (const entry of await fs.readdir(artifactRoot, { recursive: true, withFileTypes: true })) if (entry.isFile()) {
      const full = path.join(entry.parentPath, entry.name);
      put(`${name}/artifacts/${path.relative(artifactRoot, full)}`, await fs.readFile(full));
    }
  } finally { for (const fn of cleanup.reverse()) await fn(); }
}
for (const policy of ['automation-metric-capture-v1', 'automation-metric-capture-v2']) {
  const reader = await packageAReaderFixture(policy);
  put(`reader-${policy}/reader.html`, reader.html); put(`reader-${policy}/reader-rows.json`, reader.readerJson);
}
const manifest = [...files].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => ({ name, byteSize: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }));
await fs.mkdir(output, { recursive: true });
// Lossless container keeps historical technical names in opaque fixture bytes.
// Tests decode and compare original bytes; no content is stripped or normalized.
const archive = manifest.map(({ name }) => ({ name, base64: files.get(name)!.toString('base64') }));
await fs.writeFile(path.join(output, 'artifacts.json.gz'), gzipSync(Buffer.from(JSON.stringify(archive)), { level: 9 }));
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ revision, files: manifest }, null, 2) + '\n');
process.stdout.write(`${manifest.length} baseline files\n`);
