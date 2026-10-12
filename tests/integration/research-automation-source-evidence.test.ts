import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService, type ResearchAutomationServiceOptions } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const organic = [
  { position: 1,title:'Thạch dừa trong mẫu',link:'https://example.test/included',snippet:'Nguồn mẫu' },
  { position: 2,title:'Thạch dừa và thạch dứa',link:'https://example.test/excluded',snippet:'Nguồn khác nghĩa' },
  { position: 3,title:'thach dua',link:'https://example.test/unclear',snippet:'Chưa rõ nghĩa' },
];
function salesSource(authentic: boolean): AutomationSourcePort {
  const source = syntheticProductSource();
  const quickSearch: AutomationSourcePort['quickSearch'] = async (input,options) => {
    const result = await source.quickSearch(input,options);
    if (!authentic) return result;
    const bytes = Buffer.from(JSON.stringify({ data:[{product_id:'12345',product_name:'Thạch dừa từ nguồn bán hàng'}] }));
    return { ...result,result:{ ...result.result,captures:result.result.captures.map(c => ({ ...c,responseBytes:bytes,
      responseSha256:createHash('sha256').update(bytes).digest('hex'),responseByteLength:bytes.length })) } };
  };
  // Avoid the old synthetic helper's deliberately non-authentic second sales capture.
  return { ...source,quickSearch,collect:async (input,options) => {
    const result = await source.collect(input,options);
    return { ...result,result:{ ...result.result,captures:[] } };
  } };
}
async function fixture(t:TestContext, sourceEvidence:ResearchAutomationServiceOptions['sourceEvidence'], authentic=true, selected=true, signal?: AbortSignal) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'tdn-source-evidence-'));
  const db = openDatabase({ databasePath:path.join(root,'test.sqlite'),now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root,'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db,artifactStore:artifacts,uuid:() => workspaceId,now });
  await discovery.createWorkspace({ contractVersion:'1.0.0',workspaceKey:'source-evidence',title:'Synthetic source evidence' });
  const make = () => new ResearchAutomationService({ db,artifactStore:artifacts,workspaceReader:new FlowDiscoveryWorkspaceReader(discovery),uuid:() => runId,now,
    source:salesSource(authentic),webSource:syntheticWebSource(() => {},organic),...(sourceEvidence ? {sourceEvidence} : {}),renderer:buildResearchAutomationReport });
  const service=make();t.after(async()=>{ db.close();await fs.rm(root,{recursive:true,force:true}); });
  await service.start(workspaceId,{contractVersion:'research-automation-start-v1',requestKey:'33333333-3333-4333-8333-333333333333',mode:'CATEGORY',keyword:'thạch dừa',
    requestedPeriod:{startDate:'2025-10-01',endDate:'2026-09-30'},reports:['MARKET','INSIGHT']});
  await service.processNext();const awaiting=await service.getRun(workspaceId,runId);
  await service.confirmScope(workspaceId,runId,{contractVersion:'research-automation-confirm-v1',requestKey:'44444444-4444-4444-8444-444444444444',expectedRevision:awaiting.revision,
    definition:'Synthetic frozen scope',includeTerms:['thạch dừa'],excludeTerms:['thạch dứa'],selectedProductIds:selected ? [SYNTHETIC_CARD_ID] : [],peerProductIds:[],exactShopeeUrls:[]});
  await service.processNext(signal);
  const row=db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(runId) as {sha:string|null};
  const collection=row.sha ? JSON.parse((await artifacts.read(row.sha)).toString()) as StepResultDocument : undefined!;
  await service.processNext();
  assert.equal((await service.getRun(workspaceId,runId)).status,signal?.aborted ? 'CANCELLED' : 'DRAFT_READY');
  return {root,db,artifacts,service,make,collection};
}
test('actual collection drafts from byte-verified sales, retains full prompt and admits only L9 included web rows in both reports',async t=>{
  const calls:unknown[]=[];
  const f=await fixture(t,{modelIdentity:'synthetic-model',promptVersion:'prompt-v1',transport:{draftLists:async input=>{
    calls.push(input);assert.deepEqual(input.productNames,['Thạch dừa từ nguồn bán hàng']);assert.deepEqual(input.includeTerms,['thạch dừa']);assert.match(input.prompt!,/retained sales names/);
    return {keywords:['thạch dừa'],exclusions:[{term:'thạch dứa',reason:'Khác nghĩa'}]};
  }}});
  assert.equal(calls.length,1);
  const packet=f.collection.sourceEvidence!;
  assert.deepEqual(packet.admission!.result.results.map(r=>r.decision),['INCLUDED','EXCLUDED','UNCLEAR']);
  assert.equal(f.collection.webResults!.length,3,'raw evidence retained in provider order');
  assert.deepEqual(packet.admission!.result.accounting,{included:1,excluded:1,unclear:1,byReason:{EXCLUDED_TERM:1,UNRESOLVED_UNDIACRITICIZED:1}});
  const record=await f.service.readSourceKeywordDraft(workspaceId,runId,packet.draftDigest!);
  assert.equal(record.model.prompt,(calls[0] as {prompt:string}).prompt);
  assert.deepEqual(record.seeds.excludeTerms,['thạch dứa']);
  const reread=f.make();assert.deepEqual(await reread.readSourceEvidence(workspaceId,runId),packet);assert.equal(calls.length,1,'replay never calls model');
  for(const kind of ['MARKET','INSIGHT'] as const){
    const saved=await reread.readReport(workspaceId,runId,kind);const doc=new JSDOM(saved.bytes.toString()).window.document;
    const rows=doc.querySelectorAll('[aria-label="Kết quả tìm kiếm trên web đã lưu"] tbody tr');assert.equal(rows.length,1);
    assert.ok(doc.querySelector('.source-evidence'));assert.match(doc.querySelector('.source-evidence')!.textContent!,/Có từ thuộc danh sách loại trừ: 1/);
    assert.equal(doc.querySelectorAll('.citation-register a[href="https://example.test/excluded"]').length,0);
    assert.deepEqual((await reread.readReport(workspaceId,runId,kind)).bytes,saved.bytes);
    const semantic=JSON.parse((await f.artifacts.read(saved.versionId)).toString());assert.equal(semantic.rendererVersion,'automation-report-kit-v18');
    assert.deepEqual(semantic.sourceEvidence,packet);
  }
  assert.ok(record.contractVersion === 'l9-keyword-list-draft-record-v2');
  const sourceFile=path.join(f.root,'artifacts','sha256',record.salesNameRefs[0].digest.slice(0,2),record.salesNameRefs[0].digest);
  await fs.writeFile(sourceFile,'changed raw evidence');
  await assert.rejects(reread.readSourceKeywordDraft(workspaceId,runId,packet.draftDigest!));
  await assert.rejects(reread.readReport(workspaceId,runId,'MARKET'));
});
test('missing model and unauthentic sales evidence retain raw results but fail closed for new report admission',async t=>{
  for(const authentic of [true,false]){
    const config:ResearchAutomationServiceOptions['sourceEvidence']=authentic?{modelIdentity:'synthetic',promptVersion:'v1'}:
      {modelIdentity:'synthetic',promptVersion:'v1',transport:{draftLists:async()=>{throw new Error('must not use unverifiable names');}}};
    const f=await fixture(t,config,authentic);
    assert.equal(f.collection.webResults!.length,3);
    assert.equal(f.collection.sourceEvidence!.draftDigest,null);assert.equal(f.collection.sourceEvidence!.admission,null);
    assert.equal(f.collection.sourceEvidence!.unavailableReason,authentic?'MODEL_NOT_CONFIGURED':'DRAFT_FAILED');
    const saved=await f.service.readReport(workspaceId,runId,'MARKET');const doc=new JSDOM(saved.bytes.toString()).window.document;
    assert.equal(doc.querySelectorAll('[aria-label="Kết quả tìm kiếm trên web đã lưu"] tbody tr').length,0);
    assert.match(doc.querySelector('.source-evidence')!.textContent!,/chưa dùng để đếm hoặc trích/i);
  }
});
test('marker-free historical starts retain old unfiltered report semantics and replay bytes',async t=>{
  const f=await fixture(t,undefined);
  assert.equal(f.collection.sourceEvidence,undefined);
  const saved=await f.service.readReport(workspaceId,runId,'MARKET');const doc=new JSDOM(saved.bytes.toString()).window.document;
  assert.equal(doc.querySelectorAll('[aria-label="Kết quả tìm kiếm trên web đã lưu"] tbody tr').length,3);
  assert.equal(doc.querySelector('.source-evidence'),null);assert.deepEqual((await f.make().readReport(workspaceId,runId,'MARKET')).bytes,saved.bytes);
});

test('new source policy produces a replayable unavailable appendix when collection has no selected product refs', async t => {
  const f = await fixture(t, { modelIdentity: 'synthetic', promptVersion: 'v1' }, true, false);
  assert.equal(f.collection, undefined);
  for (const kind of ['MARKET', 'INSIGHT'] as const) {
    const saved = await f.service.readReport(workspaceId, runId, kind);
    const semantic = JSON.parse((await f.artifacts.read(saved.versionId)).toString());
    assert.equal(semantic.sourceEvidence.unavailableReason, 'SALES_NAMES_UNAVAILABLE');
    assert.deepEqual(semantic.sourceEvidence.sourceAppendix.rows, []);
    assert.deepEqual((await f.make().readReport(workspaceId, runId, kind)).bytes, saved.bytes);
  }
});

test('cancellation during keyword model dispatch cannot commit a successful collection or reopen reports', async t => {
  const controller = new AbortController();
  const f = await fixture(t, { modelIdentity: 'synthetic', promptVersion: 'v1', transport: { draftLists: async input => {
    assert.ok(input.signal);
    controller.abort();
    assert.equal(input.signal.aborted, true);
    return { keywords: ['thạch dừa'], exclusions: [] };
  } } }, true, true, controller.signal);
  assert.equal(f.collection.sourceEvidence!.draftDigest, null);
  assert.equal(f.collection.sourceEvidence!.unavailableReason, 'DRAFT_FAILED');
  const steps = (await f.service.getRun(workspaceId, runId)).steps;
  assert.equal(steps.find(row => row.stepId === 'COLLECTION')!.state, 'CANCELLED');
  assert.equal(steps.find(row => row.stepId === 'REPORTS')!.state, 'SKIPPED');
  assert.deepEqual(await f.make().readSourceEvidence(workspaceId, runId), f.collection.sourceEvidence);
});
