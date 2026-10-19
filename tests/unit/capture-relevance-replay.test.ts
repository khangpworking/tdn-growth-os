import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { deriveReaderSource, verifyWebSnapshot, webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import type { ReaderReportInput } from '../../contracts/analysis/reader-report-input.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { AutomationMetricMethodBridge, type AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { ResearchAutomationIntegrityError } from '../../src/modules/analysis/research-automation/model.js';
import { readCaptureProductRows, assessCaptureProductRows, CAPTURE_ROW_PROFILE, captureExclusionNotice } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { readerRowsFromMetricCapture } from '../../src/modules/analysis/reader-report/metric-capture-rows.js';
import { captureRelevanceConfiguration } from '../../src/modules/analysis/research-automation/capture-relevance-cliproxy-transport.js';
import { readCaptureRelevanceRecord, type CaptureRelevanceAi, type CaptureRelevanceRecord } from '../../src/modules/analysis/research-automation/capture-relevance.js';
import { pickShopeeLinks } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { relevanceHarness, relevanceKeyword, relevancePickRows, relevanceNow, relevanceHash, type RelevanceMainFixture } from '../helpers/capture-relevance-fixture.js';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import os from 'node:os';
import path from 'node:path';

const golden = JSON.parse(await fs.readFile(new URL('../fixtures/capture-relevance-main-v2.json',import.meta.url),'utf8')) as RelevanceMainFixture;
const relevancePath = 'methods/capture-relevance.json';
const configPath = 'methods/metric-run.json';
const configuration = captureRelevanceConfiguration('synthetic-lumo-model');
function fakeAi(modelId = configuration.modelId, fails = false) {
  let calls = 0;
  const ai: CaptureRelevanceAi = {configuration:captureRelevanceConfiguration(modelId),classifier:{async classify({items}) {
    calls++; if (fails) throw new Error('invented failure');
    return items.map(({id,title}) => ({id,label:title.endsWith('rival') ? 'NOT_MAIN' : title.endsWith('uncertain') ? 'UNSURE' : 'MAIN'}));
  }}};
  return {ai,get calls() { return calls; }};
}
function bridge(f: Awaited<ReturnType<typeof relevanceHarness>>, ai?: CaptureRelevanceAi) {
  return new AutomationMetricMethodBridge({db:f.db,artifactStore:f.artifacts,workspaces:f.workspaces,now:relevanceNow,...(ai ? {captureRelevance:ai} : {})});
}
const membership = (method: AutomationMetricMethodSnapshot) => ({
  kept:method.capture!.platforms.flatMap(p => p.result.input.records.map(row => [p.platform,row.title])),
  excluded:method.capture!.excludedRows!.map(row => [row.platform,row.title,row.reason]),
});

for (const flag of [undefined,'']) test(`flag ${flag === undefined ? 'unset' : 'empty'} new method, reader and picker have main v2 byte parity`, async t => {
  const f = await relevanceHarness(t,golden);
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'synthetic-parity-config-')); t.after(() => fs.rm(root,{recursive:true,force:true}));
  const dist = path.join(root,'dist'); await fs.mkdir(dist); await fs.writeFile(path.join(dist,'index.html'),'<p>Synthetic</p>');
  const config = operatorAppConfigurationFromEnvironment({TDN_WORKSPACE_DB:path.join(root,'db.sqlite'),TDN_ARTIFACT_ROOT:path.join(root,'artifacts'),
    ...(flag === undefined ? {} : {TDN_RESEARCH_CAPTURE_RELEVANCE_AI_MODEL:flag})},{frontendDist:dist,version:'synthetic'});
  assert.equal(config.researchCaptureRelevanceAi,undefined);
  // Pin the opaque package UUID too, so the manifest and whole snapshot compare byte for byte.
  const uuid = t.mock.method(crypto,'randomUUID',() => golden.method.sourcePackage.packageId);
  syncBuiltinESMExports();
  t.after(() => { uuid.mock.restore(); syncBuiltinESMExports(); });
  const method = (await bridge(f).execute(f.input))!;
  assert.equal(JSON.stringify(method),JSON.stringify(golden.method));
  assert.deepEqual(Object.keys(method),Object.keys(golden.method));
  assert.deepEqual(Object.keys(method.capture!),Object.keys(golden.method.capture!));
  assert.equal(Object.hasOwn(method.capture!,'relevance'),false);
  assert.equal(method.capture!.rowPolicyVersion,'automation-metric-capture-v2');
  const retained = await f.packages.readVerified(method.sourcePackage.packageId);
  assert.deepEqual(retained.files.map(({path,sha256,byteSize}) => ({path,sha256,byteSize})).sort((a,b) => a.path.localeCompare(b.path)),golden.methodFiles);
  assert.equal(retained.files.some(row => row.path === relevancePath),false);
  assert.equal(JSON.stringify(readerRowsFromMetricCapture(f.archive.snapshot,['shopee','tiktok'])),golden.readerJson);
  assert.equal(JSON.stringify(pickShopeeLinks(relevancePickRows(),[relevanceKeyword])),golden.pickJson);
  assert.equal(golden.revision,'edfcfc98');
});

test('final package retains the exact canonical record and reuses it without calls after model change or removal', async t => {
  const f = await relevanceHarness(t,golden); const fake = fakeAi();
  const method = (await bridge(f,fake.ai).execute(f.input))!;
  assert.equal(fake.calls,1);
  const retained = await f.packages.readVerified(method.sourcePackage.packageId);
  const record = method.capture!.relevance!;
  assert.equal(record.contractVersion,'capture-relevance-record-v1'); assert.equal(record.promptVersion,'capture-relevance-prompt-v1');
  assert.equal(record.modelIdentity,'cliproxy:synthetic-lumo-model'); assert.deepEqual(record.configuration,configuration);
  assert.deepEqual(record.methodNotes,{batches:1,retriedBatches:0,failedBatches:0,cappedTitles:0});
  assert.equal(retained.files.find(row => row.path === relevancePath)!.bytes.toString(),canonicalJson(record));
  assert.equal(record.decisions.length,7, 'cross-platform duplicate title has one retained decision');
  for (const decision of record.decisions) assert.deepEqual(Object.keys(decision).sort(),['keyword','label','titleSha256']);
  for (const selected of [undefined,fakeAi('synthetic-replacement-model',true)]) {
    const replay = bridge(f,selected?.ai); const before = f.db.prepare('SELECT total_changes() n').get();
    assert.deepEqual(await replay.execute(f.input),method); assert.deepEqual(await replay.verify(method,f.input),method);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(),before); if (selected) assert.equal(selected.calls,0);
  }
  assert.equal(fake.calls,1);
  assert.deepEqual(method.capture!.platforms.map(p => [p.platform,p.result.input.records.length]),[['shopee',2],['tiktok',2]]);
  assert.deepEqual(method.capture!.platforms.map(p => p.result.input.records.map(row => row.revenue.value)),[['100','100'],['9000','9000']]);
});

for (const replacement of ['disabled','changed'] as const) test(`checkpoint precedes calculation and retries with model ${replacement} make zero classifier calls`, async t => {
  const f = await relevanceHarness(t,golden); const fake = fakeAi();
  const original = fs.readFile.bind(fs); let checkpoint: CaptureRelevanceRecord | undefined; let failed = false;
  const mock = t.mock.method(fs,'readFile',async (...args: Parameters<typeof fs.readFile>) => {
    if (!failed && String(args[0]).endsWith('/docs/research/report-section-catalog-v1.json')) {
      failed = true;
      const rows = f.db.prepare("SELECT package_id FROM foundation_source_packages WHERE package_key LIKE '%-capture-relevance' AND finalized_at IS NOT NULL").all() as {package_id:string}[];
      assert.equal(rows.length,1,'checkpoint exists before calculator inputs are read');
      const saved = await f.packages.readVerified(rows[0]!.package_id);
      assert.deepEqual(saved.files.map(row => row.path).sort(),[relevancePath,configPath].sort());
      checkpoint = JSON.parse(saved.files.find(row => row.path === relevancePath)!.bytes.toString());
      throw new Error('synthetic failure after checkpoint before calculation');
    }
    return original(...args);
  });
  await assert.rejects(bridge(f,fake.ai).execute(f.input),/synthetic failure after checkpoint/);
  mock.mock.restore(); assert.ok(checkpoint); assert.equal(fake.calls,1);
  const retry = replacement === 'disabled' ? undefined : fakeAi('synthetic-new-model',true);
  const method = (await bridge(f,retry?.ai).execute(f.input))!;
  assert.deepEqual(method.capture!.relevance,checkpoint); assert.equal(fake.calls,1); if (retry) assert.equal(retry.calls,0);
  const expected = assessCaptureProductRows(f.archive.snapshot,CAPTURE_ROW_PROFILE,checkpoint);
  assert.deepEqual(method.capture!.excludedRows!.map(row => [row.rowIndex,row.reason]),[...expected.exclusions]);
  const again = (await bridge(f,retry?.ai).execute(f.input))!; assert.deepEqual(membership(again),membership(method));
});

test('failed-batch nulls are frozen at checkpoint and final package rather than reclassified', async t => {
  const f = await relevanceHarness(t,golden); const fake = fakeAi(configuration.modelId,true);
  const method = (await bridge(f,fake.ai).execute(f.input))!; assert.equal(fake.calls,2);
  assert.deepEqual(method.capture!.relevance!.methodNotes,{batches:1,retriedBatches:1,failedBatches:1,cappedTitles:0});
  assert.ok(method.capture!.relevance!.decisions.every(row => row.label === null));
  const working = fakeAi(); assert.deepEqual(await bridge(f,working.ai).execute(f.input),method); assert.equal(working.calls,0);
});

test('v2 final package freezes absence when a model is later enabled', async t => {
  const f = await relevanceHarness(t,golden);
  const original = (await bridge(f).execute(f.input))!;
  const fake = fakeAi(); const replay = (await bridge(f,fake.ai).execute(f.input))!;
  assert.equal(fake.calls,0); assert.deepEqual(replay,original);
  assert.equal(replay.capture!.rowPolicyVersion,'automation-metric-capture-v2'); assert.equal(Object.hasOwn(replay.capture!,'relevance'),false);
});

const tampers: Record<string,(record:CaptureRelevanceRecord) => void> = {
  'duplicate title hash': r => { r.decisions[1] = {...r.decisions[0]!}; },
  'missing title hash': r => { r.decisions.pop(); },
  'foreign title hash': r => { r.decisions[0]!.titleSha256 = 'f'.repeat(64); },
  'inconsistent model identity': r => { r.modelIdentity = 'cliproxy:synthetic-other-model'; },
  'inconsistent model configuration': r => { r.configuration.modelId = 'synthetic-other-model'; },
  'invalid configuration bounds': r => { r.configuration.timeoutMs = 1; },
};
for (const [name,mutate] of Object.entries(tampers)) for (const stage of ['checkpoint','final'] as const) test(`${stage} tamper ${name} is an integrity error with zero model fallback`, async t => {
  const f = await relevanceHarness(t,golden); const fake = fakeAi();
  const method = (await bridge(f,fake.ai).execute(f.input))!;
  const checkpointRow = f.db.prepare("SELECT package_id FROM foundation_source_packages WHERE package_key LIKE '%-capture-relevance'").get() as {package_id:string};
  const targetId = stage === 'final' ? method.sourcePackage.packageId : checkpointRow.package_id;
  const read = FoundationSourcePackageReader.prototype.readFinalizedSourcePackage;
  if (stage === 'checkpoint') {
    // Hide only the final package at the lookup port to exercise checkpoint validation.
    const lookup = FoundationSourcePackageReader.prototype.findFinalizedSourcePackagesByKey;
    t.mock.method(FoundationSourcePackageReader.prototype,'findFinalizedSourcePackagesByKey',async function(this:FoundationSourcePackageReader,key:string) {
      return key.endsWith('-capture-relevance') ? lookup.call(this,key) : key.startsWith('automation-method:') ? [] : lookup.call(this,key);
    });
  }
  t.mock.method(FoundationSourcePackageReader.prototype,'readFinalizedSourcePackage',async function(this:FoundationSourcePackageReader,...args:Parameters<typeof read>) {
    const retained = await read.apply(this,args);
    if (retained.packageId !== targetId) return retained;
    const altered = structuredClone(method.capture!.relevance!); mutate(altered);
    // Preserve valid derived metadata so the failure reaches the record boundary.
    const files = retained.files.map(file => file.path !== relevancePath ? file : (() => {const bytes = Buffer.from(canonicalJson(altered)); return {...file,bytes,sha256:relevanceHash(bytes),byteSize:bytes.length};})());
    return {...retained,files};
  });
  const retry = fakeAi('synthetic-new-model');
  await assert.rejects(bridge(f,retry.ai).execute(f.input),error => error instanceof ResearchAutomationIntegrityError && /relevance record is invalid/i.test(error.message));
  assert.equal(retry.calls,0); assert.equal(fake.calls,1);
  assert.throws(() => {const value = structuredClone(method.capture!.relevance!); mutate(value); readCaptureRelevanceRecord(value,readCaptureProductRows(f.archive.snapshot),f.archive.snapshot.scope.keywords);},TypeError);
});

test('public reader kept and excluded membership equals the bridge retained assessment; Market Phần 2 and notices have clean copy', async t => {
  const f = await relevanceHarness(t,golden); const fake = fakeAi(); const method = (await bridge(f,fake.ai).execute(f.input))!;
  const record = method.capture!.relevance!;
  const rows = readerRowsFromMetricCapture(f.archive.snapshot,['shopee','tiktok'],CAPTURE_ROW_PROFILE,record);
  assert.deepEqual(rows.rows.map(row => [row.platform,row.title]),membership(method).kept);
  assert.deepEqual(rows.excluded.map(row => [row.platform,row.title,row.reason]),membership(method).excluded);
  const base = sync1ReaderFixture();
  const rendered = await buildMarketReport(computeReaderReportData({...base,rows:rows.rows}),{builtOn:'01/02/2026',flint:false,captureSource:true,captureRowPolicy:CAPTURE_ROW_PROFILE,captureExcludedRows:rows.excluded,limitations:[]});
  const dom = new JSDOM(rendered.html);
  const section = dom.window.document.querySelector('#phan-2'); assert.ok(section,'Market Phần 2 rendered');
  const banned = /synthetic-lumo-model|cliproxy|OpenAI|Anthropic|Gemini|Metric|Kalodata|Apify|SerpApi|PageIndex|Google|%|(?<![\d.,])0(?![\d.,])/iu;
  assert.doesNotMatch(section.textContent!,banned);
  for (const platform of ['shopee','tiktok']) {
    const notice = captureExclusionNotice(rows.excluded,platform,CAPTURE_ROW_PROFILE);
    assert.doesNotMatch(notice,banned); if (platform === 'shopee') assert.ok(notice);
  }
  dom.window.close(); assert.equal(fake.calls,1);
});


test('public service reader build carries the exact saved relevance decisions into kept and excluded rows', async t => {
  const f = await relevanceHarness(t); const fake = fakeAi();
  const service = new ResearchAutomationService({db:f.db,artifactStore:f.artifacts,workspaceReader:f.workspaces,
    metricAttachmentStore:new RequestScopedArtifactStore(path.join(f.root,'artifacts')),uuid:() => '99999999-9999-4999-8999-999999999999',now:relevanceNow,readerReportFlint:false,captureRelevance:fake.ai});
  const workspaceId = f.input.start.workspaceId, runId = '99999999-9999-4999-8999-999999999999';
  await service.start(workspaceId,{contractVersion:'research-automation-start-v1',requestKey:'55555555-5555-4555-8555-555555555555',mode:'CATEGORY',keyword:relevanceKeyword,
    requestedPeriod:{startDate:'2026-01-01',endDate:'2026-01-30'},reports:['MARKET']});
  await service.processNext();
  const prepared = await service.prepareMetricCapture(workspaceId,runId,{contractVersion:'automation-metric-capture-prepare-v1',requestKey:'66666666-6666-4666-8666-666666666666',
    expectedRevision:(await service.getRun(workspaceId,runId)).revision,sourceContext:'Synthetic lumoware'},f.archive.snapshotBytes,f.archive.manifestBytes);
  await service.confirmScope(workspaceId,runId,{contractVersion:'research-automation-confirm-v2',requestKey:'77777777-7777-4777-8777-777777777777',
    expectedRevision:(await service.getRun(workspaceId,runId)).revision,definition:'Synthetic lumoware',includeTerms:[relevanceKeyword],excludeTerms:[],selectedProductIds:[],peerProductIds:[],
    sources:{metric:{decision:'USE_PREPARED',packageId:prepared.packageId},nativeReview:'SKIP'}});
  for(let i=0;i<20 && await service.processNext();i++);
  assert.equal((await service.getRun(workspaceId,runId)).status,'DRAFT_READY');
  const report = await service.readReport(workspaceId,runId,'MARKET',false);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString()) as {metricMethods:AutomationMetricMethodSnapshot};
  const method = semantic.metricMethods;
  assert.ok(method.capture!.relevance); assert.equal(fake.calls,1);
  const expected = readerRowsFromMetricCapture(f.archive.snapshot,['shopee','tiktok'],CAPTURE_ROW_PROFILE,method.capture!.relevance);
  const built = await service.buildReaderReport(workspaceId,runId,{contractVersion:'reader-report-build-v1.2',requestKey:'88888888-8888-4888-8888-888888888888',metricPackageId:prepared.packageId,
    platforms:['shopee','tiktok'],profile:sync1ReaderFixture().profile,cover:null,
    source:deriveReaderSource(verifyWebSnapshot(f.archive.snapshot,webSnapshotDigest(f.archive.snapshot)),5000,{nullable:true})},{actorId:'owner:synthetic',role:'OWNER'});
  const saved = f.db.prepare('SELECT input_sha256 sha FROM analysis_reader_report_revisions WHERE revision_id=?').get(built.revision.revisionId) as {sha:string};
  const reader = JSON.parse((await f.artifacts.read(saved.sha)).toString()) as {input:ReaderReportInput;captureRowPolicy:string;captureExcludedRows:unknown};
  assert.equal(reader.captureRowPolicy,CAPTURE_ROW_PROFILE);
  assert.deepEqual(reader.input.rows.map(row => [row.platform,row.title]),membership(method).kept);
  assert.deepEqual(reader.input.rows,expected.rows); assert.deepEqual(reader.captureExcludedRows,expected.excluded);
  const publicReader = await service.readReaderReport(workspaceId,runId,built.revision.revisionId);
  const dom = new JSDOM(publicReader.bytes.toString());
  assert.doesNotMatch(dom.window.document.querySelector('#phan-2')!.textContent!,/synthetic-lumo-model|cliproxy|OpenAI|Anthropic|Gemini|Metric|Kalodata|Apify|SerpApi|PageIndex|Google|%|(?<![\d.,])0(?![\d.,])/iu);
  dom.window.close(); assert.equal(fake.calls,1,'reader build and replay do not call classifier');
});

for (const operation of ['verify','execute'] as const) test(`earlier unreleased v3 package fails closed on ${operation}, with no classifier call or membership rewrite`, async t => {
  // Actual HEAD^ output from an unreleased branch definition, not a deployed policy.
  const prior = JSON.parse(await fs.readFile(new URL('../fixtures/capture-relevance-retained-v3.json',import.meta.url),'utf8')) as RelevanceMainFixture;
  assert.equal(prior.revision,'221eb307');
  assert.match(prior.provenance!, /Unreleased branch definition/u);
  assert.equal(prior.method.capture!.rowPolicyVersion,CAPTURE_ROW_PROFILE);
  assert.equal(Object.hasOwn(prior.method.capture!,'relevance'),false);
  assert.ok(prior.method.capture!.excludedRows!.some(row => row.title === 'Motor lumo pod invented' && row.reason === 'NOT_MAIN_PRODUCT'));
  const f = await relevanceHarness(t,prior); const fake = fakeAi();
  const replay = bridge(f,fake.ai);
  const before = await f.packages.readVerified(prior.method.sourcePackage.packageId);
  const savedMethod = canonicalJson(prior.method);
  await assert.rejects(
    operation === 'verify' ? replay.verify(prior.method,prior.input) : replay.execute(prior.input),
    { constructor: ResearchAutomationIntegrityError, message: 'Capture rows differ from the frozen row policy.' },
  );
  assert.equal(fake.calls,0,'an incompatible final package never triggers classification');
  assert.deepEqual(await f.packages.readVerified(prior.method.sourcePackage.packageId),before,'retained bytes and package membership are unchanged');
  assert.equal(canonicalJson(prior.method),savedMethod,'rejection does not reinterpret the supplied snapshot');
});
