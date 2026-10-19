import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { appendFileSync, readFileSync } from 'node:fs';
import BetterSqlite3 from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { createShopeePrivateIntake } from '../../src/platform/collectors/shopee-private-intake.js';
import { reviewCollectionPolicy } from '../../src/modules/analysis/research-automation/review-collection-policy.js';
import { SHOPEE_ACTOR } from '../../src/platform/collectors/apify-shopee.js';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import type { TestContext } from 'node:test';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { ShopeePublicReviewCollector } from '../../src/platform/collectors/shopee-public-reviews.js';
import { ShopeeCollectionService } from '../../src/modules/foundation/shopee-collection-service.js';
import { AutomationNativeSourceReviewBridge } from '../../src/modules/analysis/research-automation/native-source-review-bridge.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { buildPublicReviewCorpus } from '../../src/modules/analysis/research-automation/public-shopee-bridge.js';
import { researchAutomationProviderConfigFromEnv } from '../../src/modules/analysis/research-automation/providers.js';
import { SOURCE_REGISTRY, buildResearchAutomationSourceStatus } from '../../src/modules/analysis/research-automation/source-status.js';
import { buildConfirmValue } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { lint } from '../../src/modules/analysis/reader-report/lint.js';
import { CitationRegistry, assertReaderSafeCitation } from '../../src/modules/analysis/citation-registry.js';
import { auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { deriveReaderSource, verifyWebSnapshot, webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import { FakeClock, FakeTransport, ORIGIN, retainedFiles, throwingSpy, type Exchange } from './shopee-public-fakes.js';
import { AT, PRODUCTS, TOKEN, IDS, READY, job, result, row } from '../fixtures/shopee-public-results.js';
import { syntheticProductSource } from './research-synthetic-sources.js';
import { captureFiles, workspaceId, drain, FakeCapture } from './autorun-harness.js';
import { sync1ReaderFixture } from './sync1-reader-fixture.js';
import { seedNativeDamiPackage } from './native-dami-package-fixture.js';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export interface ScenarioOptions { cap?:number; mode?:'STANDARD'|'TRIAL'; counts?:number[]; state?:string; attributesOnly?:boolean; faultAt?:string; native?:string; reports?:string[]; private?:boolean; policy?:boolean; productCount?:number; noPercentageEvidence?:boolean }
export async function child(command: string[], cwd = process.cwd(), extra: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env, ...extra };
  for (const key of ['TDN_CHROMIUM_PATH','TDN_RESEARCH_PDF_CHROMIUM','TDN_REQUIRE_BROWSER','TDN_BROWSER_EXECUTABLE','TDN_RESEARCH_CAPTURE_RELEVANCE_AI_MODEL']) delete env[key];
  return new Promise<{code:number|null;output:string}>((resolve,reject)=> {
    const p=spawn(process.execPath,command,{cwd,env,stdio:['ignore','pipe','pipe']}); let output='';
    const timer=setTimeout(()=>p.kill('SIGKILL'),120000);
    p.stdout.on('data',b=>{output+=b;}); p.stderr.on('data',b=>{output+=b;}); p.on('error',reject); p.on('exit',code=>{clearTimeout(timer);resolve({code,output});});
  });
}
export async function candidateBaselines(t: TestContext, env: NodeJS.ProcessEnv) {
  const output=await fs.mkdtemp(path.join(os.tmpdir(),'synthetic-parity-')); t.after(()=>fs.rm(output,{recursive:true,force:true}));
  const r=await child(['--import','tsx','tests/helpers/generate-shopee-public-main-baselines.ts',process.cwd(),output,'--candidate'],process.cwd(),env);
  assert.equal(r.code,0,r.output); return output;
}
/** HEAD is provenance metadata; every other manifest field and archive byte is evidence. */
export async function legacyBaselineBytes(root: string): Promise<Map<string, Buffer>> {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  delete manifest.revision;
  return new Map([
    ['manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n')],
    ['artifacts.json.gz', await fs.readFile(path.join(root, 'artifacts.json.gz'))],
  ]);
}
export async function assertLegacyBaselineMatches(candidate: string, reference: string): Promise<void> {
  const expected = await legacyBaselineBytes(reference);
  const actual = await legacyBaselineBytes(candidate);
  for (const [name, bytes] of expected) assert.ok(actual.get(name)?.equals(bytes), `Exact baseline bytes differ: ${name}`);
}
export async function sourceGate(which:'lint'|'citation'|'business',html:string,marker=true) {
  if(which==='citation') assertReaderSafeCitation({label:html,quote:null,locatorText:null,url:null},{publicReviewSource:marker});
  else {
    const checks=which==='lint'?lint(html,{publicReviewSource:marker}).filter(r=>r.rule.startsWith('F1 ')):auditMarketReportHtml(html,{publicReviewSource:marker}).filter(r=>r.rule==='G08_PROVIDER_NAME');
    assert.equal(checks.length,1); if(checks.some(r=>!r.ok)) throw new Error('Source label refused');
  }
}
// This capture contains positive synthetic totals and text rows, with no percentage evidence.
// It is prepared as input before the service hashes it; rendered report bytes are never rewritten.
function scenarioCaptureFiles(runId:string, noPercentageEvidence=false) {
  const files=captureFiles(runId);
  if(!noPercentageEvidence)return files;
  const snapshot=JSON.parse(files.snapshotBytes.toString());
  for(const metric of Object.values(snapshot.groups.W2_kpi) as any[])metric.changePct=null;
  for(const entry of snapshot.groups.W3_platformSplit)entry.share={...entry.share,label:'Chưa thu được tỷ trọng',displayed:'Chưa thu được',value:null};
  for(const [key,value] of Object.entries(snapshot.groups)) {
    if(!['W2_kpi','W3_platformSplit'].includes(key)&&JSON.stringify(value).includes('PERCENT'))snapshot.groups[key]={absent:true,reason:'NOT_CAPTURED'};
  }
  const snapshotBytes=Buffer.from(JSON.stringify(snapshot,null,2)+'\n');
  const manifest=JSON.parse(files.manifestBytes.toString());
  manifest.files[0]={...manifest.files[0],sha256:hash(snapshotBytes),byteSize:snapshotBytes.length};
  assert.doesNotMatch(snapshotBytes.toString(),/%/u,'synthetic input has no percentage-bearing source text');
  return {...files,snapshotBytes,manifestBytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n')};
}
function wire(options:ScenarioOptions, values?:unknown[]):Exchange[] {
  const cap=options.cap??20, count=options.productCount??3;
  return Array.from({length:count},(_,p)=>{
    const product={shopId:String(91001+p),itemId:String(92001+p),productUrl:`https://shopee.vn/product/${91001+p}/${92001+p}`};
    const id=IDS[p]??`10000000-0000-4000-8000-${String(p+1).padStart(12,'0')}`;
    const n=options.counts?.[p]??cap, state=options.state==='successful-empty'?'succeeded':options.state==='app-timeout'?'running':options.state??'succeeded';
    const j=(s:string,available=false)=>({...job(0,s,{id,request:{url:product.productUrl,max_comments:cap},result_available:available,collected:available?n:0},cap)});
    const raw=values?.[p]??result(0,Array.from({length:n},(_,i)=>row(0,{review_id:`synthetic-${i}`,source_url:product.productUrl,...(options.attributesOnly?{comment:'',attributes:['Synthetic attribute'],content_type:'attributes_only'}:{})})),{job_id:id,product_url:product.productUrl,complete:state==='succeeded'});
    const script:Exchange[]=[{method:'GET',path:'/health',body:READY},{method:'GET',path:'/jobs?limit=100',body:[]},{method:'POST',path:'/jobs',status:202,body:j('queued')},
      {method:'GET',path:`/jobs/${id}`,body:j('queued')},{method:'GET',path:`/jobs/${id}`,body:j('running')},{method:'GET',path:`/jobs/${id}`,body:j(state,true)},
      {method:'GET',path:`/jobs/${id}/result`,body:raw}];
    if(options.state==='app-timeout')return [script[0]!,script[1]!,script[2]!,{method:'GET' as const,path:`/jobs/${id}`,body:j('running')},{method:'POST' as const,path:`/jobs/${id}/cancel`,status:202,body:j('running')}];
    if(state==='succeeded')script.push({method:'GET',path:`/jobs/${id}`,body:j(state,true)});
    return script;
  }).flat();
}
export async function publicScenario(t:TestContext, options:ScenarioOptions={}, resumeRoot?:string):Promise<any> {
  if(options.faultAt&& !['between-products'].includes(options.faultAt))options={...options,productCount:1};
  const root=resumeRoot??await fs.mkdtemp(path.join(os.tmpdir(),'synthetic-scenario-'));
  const clock=new FakeClock(100);
  if(options.state==='app-timeout')clock.sleep=async ms=>{clock.sleeps.push(ms);clock.advance(2400000);};
  try{clock.milliseconds=JSON.parse(await fs.readFile(path.join(root,'clock.json'),'utf8'));}catch{} const databasePath=path.join(root,'state.sqlite'),artifactRoot=path.join(root,'artifacts'),journalRoot=path.join(root,'journal');
  let db=openDatabase({databasePath,now:clock.now}).db;
  if(!resumeRoot)t.after(async()=>{try{db.close();}catch{} await fs.rm(root,{recursive:true,force:true});});
  const artifacts=new ContentAddressedArtifactStore(artifactRoot);
  let discovery=new DiscoveryWorkspaceService({db,artifactStore:artifacts,now:clock.now,uuid:()=>workspaceId});
  if(!resumeRoot)await discovery.createWorkspace({contractVersion:'1.0.0',workspaceKey:'synthetic-public',title:'Synthetic'});
  const publicFactoryCalls:any[]=[], paidSpy=throwingSpy('paid fallback'),baseSpy=throwingSpy('repeated base'),nativeInventorySpy={calls:[] as any[]},codingSpy=throwingSpy('coding'),modelSpy=throwingSpy('model');
  let values:unknown[]|undefined, transport=new FakeTransport(wire(options),()=>clock.milliseconds), runtime={enabled:true,cap:options.cap??20}, throwBase=false;
  let seq=100, runId=resumeRoot?(db.prepare('SELECT run_id FROM analysis_research_automation_runs').get() as any).run_id:'';
  const uuid=()=>`aaaaaaaa-0000-4000-8000-${String(++seq).padStart(12,'0')}`;
  const privacy=createShopeePrivateIntake({salt:Buffer.alloc(32,7),keyId:workspaceId});
  const privateSource={contractVersion:'automation-private-shopee-source-v1' as const,profile:privacy.profile};
  const policy=options.policy?reviewCollectionPolicy({contractVersion:'automation-review-collection-policy-v1',selectionBasis:'OWNER_EXACT_URL',targetReviews:300,hardMaximum:500,comparisonTextMinimum:30,saturation:'SOURCE_BOUND_CODING_UNAVAILABLE',privateSource,collector:{actorId:SHOPEE_ACTOR,maxReviewsPerProduct:300,contentFilter:'with comments',maxChargeUsd:1}}):undefined;
  const make=()=> {
    discovery=new DiscoveryWorkspaceService({db,artifactStore:artifacts,now:clock.now});
    const base=syntheticProductSource();
    return new ResearchAutomationService({db,artifactStore:artifacts,workspaceReader:new FlowDiscoveryWorkspaceReader(discovery),now:clock.now,uuid,readerReportFlint:false,metricAttachmentStore:new RequestScopedArtifactStore(artifactRoot),
      source:throwBase?{id:'KALODATA',quickSearch:baseSpy.invoke,collect:baseSpy.invoke}:base,
      ...(runtime.enabled?{shopeePublicReviews:{maxReviewsPerProduct:runtime.cap,factory:(stage:any)=>{
        publicFactoryCalls.push(stage);const collector=new ShopeePublicReviewCollector({token:TOKEN,baseUrl:ORIGIN,journalRoot,confirmedSourceSetSha256:stage.confirmedSourceSetSha256,maxReviewsPerProduct:stage.maxReviewsPerProduct,sampleMode:stage.sampleMode,fetch:async(input,init)=>{
          if(resumeRoot)appendFileSync(path.join(root,'invocations.jsonl'),JSON.stringify({method:init?.method??'GET',url:String(input),init:{method:init?.method,...(init?.body?{body:init.body}:{})},at:clock.milliseconds})+'\n');
          return transport.fetch(input,init);},sleep:clock.sleep,clock:clock.now});
        return {collector,requestsIssued:collector.requestsIssued};}}}:{}),
      ...((options.private||options.policy)?{privateShopee:{source:privateSource,factory:paidSpy.invoke},...(policy?{reviewCollection:{policy,factory:paidSpy.invoke}}:{})}:{}),
      ...(options.mode==='TRIAL'?{autoRun:{enabled:true,testReviewCap:options.cap??20,runner:{enabledEnv:'1',captureRoot:path.join(root,'captures')},runCapture:new FakeCapture(path.join(root,'captures')).run}}:{})});
  };
  if(resumeRoot){try{const prior=(await fs.readFile(path.join(root,'invocations.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));transport.exchanges.splice(0,prior.length);transport.calls.push(...prior);}catch{}}
  let service=make(), prepared:any, readerReceipt:any, pairId:string|undefined, reportSnapshotNames:string[]|undefined;
  const journals=async()=>{try{return [...(await retainedFiles(journalRoot)).entries()].filter(([n])=>n.endsWith('.json')).map(([,b])=>JSON.parse(b.toString()));}catch{return [];}};
  const getRun=()=>service.getRun(workspaceId,runId);
  const readArtifact=async(sha:string)=>JSON.parse((await artifacts.read(sha)).toString());
  const sourceSet=async()=>{const r=db.prepare('SELECT source_set_sha256 sha FROM analysis_research_automation_source_sets WHERE run_id=?').get(runId) as any;const bytes=await artifacts.read(r.sha);const v=JSON.parse(bytes.toString());return {...v,sha256:r.sha,bytes,scope:await readArtifact(v.scopeSha256)};};
  const ensure=async()=>{
    if(runId)return;
    const r=await service.start(workspaceId,{contractVersion:'research-automation-start-v1',requestKey:uuid(),mode:'PRODUCT',keyword:'synthetic jar',requestedPeriod:{startDate:'2026-01-01',endDate:'2026-01-30'},reports:options.reports??(options.mode==='TRIAL'?['MARKET']:['MARKET','INSIGHT'])});runId=r.run.runId;
    await service.processNext();
  };
  const prepare=async()=>{
    if(prepared)return prepared;
    const files=scenarioCaptureFiles(runId,options.noPercentageEvidence); const run=await getRun();
    prepared=await service.prepareMetricCapture(workspaceId,runId,{contractVersion:'automation-metric-capture-prepare-v1',requestKey:uuid(),expectedRevision:run.revision,sourceContext:'Synthetic retained capture'},files.snapshotBytes,files.manifestBytes);
    return prepared;
  };
  const urls=Array.from({length:options.native==='RESOLVED'||options.native==='DAMAGED'||options.native==='AMBIGUOUS'?1:options.productCount??3},(_,p)=>`https://shopee.vn/product/${91001+p}/${92001+p}`);
  let confirmation:any;
  const confirm=async(overrides:any={},native:any=undefined)=>{
    await ensure();const current=await getRun();
    confirmation={contractVersion:native===undefined?'research-automation-confirm-v3':'research-automation-confirm-v2',requestKey:overrides.sameRequestKey?confirmation.requestKey:uuid(),expectedRevision:current.revision,
      definition:'Synthetic scope',includeTerms:[],excludeTerms:[],selectedProductIds:current.productCards.slice(0,1).map(c=>c.productId),peerProductIds:[],exactShopeeUrls:urls,
      sources:{metric:{decision:'ABSENT'},nativeReview:native??{decision:options.mode==='TRIAL'?'COLLECT_EXACT_TEST':'COLLECT_EXACT',providerId:'shopee-public-review',maxReviewsPerProduct:overrides.cap??options.cap??20}}};
    let trigger=false;
    if(overrides.faultAt){db.exec("CREATE TEMP TRIGGER synthetic_confirm_rollback BEFORE INSERT ON analysis_research_automation_source_sets BEGIN SELECT RAISE(ABORT,'Synthetic transaction stop'); END");trigger=true;}
    const resolve=AutomationNativeSourceReviewBridge.prototype.resolve;AutomationNativeSourceReviewBridge.prototype.resolve=function(input:any){nativeInventorySpy.calls.push(input);return resolve.call(this,input);};
    try{await service.confirmScope(workspaceId,runId,confirmation);}finally{AutomationNativeSourceReviewBridge.prototype.resolve=resolve;if(trigger)db.exec('DROP TRIGGER synthetic_confirm_rollback');}
    return sourceSet();
  };
  const finish=async()=>{await drain(service);assert.equal(transport.unlisted.length,0,'unlisted fake invocation caught by application');};
  const report=async()=>{const pairs=await service.listReportVersions(workspaceId,runId);pairId=pairs.at(-1)?.pairId;return service.readReport(workspaceId,runId,'MARKET',false,pairId);};
  const semantic=async()=>{let v=await readArtifact((await report()).versionId);if(options.reports?.includes('INSIGHT')){const r=await service.readReport(workspaceId,runId,'INSIGHT',false,pairId);v=await readArtifact(r.versionId);}const c=v.publicReviewCorpus;return {...v,reviewCorpus:v.reviewCorpus??undefined,...(c?{reviewAdmission:c.corpusState,reviewCodingState:c.codingState}:{}),...(v.publicReviewSource?.corpusSha256&&!c?{publicReviewCorpusReference:v.publicReviewSource.corpusSha256}:{}),...(v.publicReviewSource?.corpusUnavailableReason?{publicReviewCorpusFailure:v.publicReviewSource.corpusUnavailableReason}:{})};};
  const collection=async()=>{const s=db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(runId) as any;return readArtifact(s.sha);};
  const retained=async()=>{const step=await collection();return new ShopeeCollectionService(db,artifacts).readPublicExact(step.exactShopee.collectionId);};
  const context=async()=> (await semantic()).publicReviewSource;
  const corrupt=async(field:string, options:{rehashSemanticWrapper?:boolean}={})=>{
    if(options.rehashSemanticWrapper) {
      // Simulate a database/artifact tamperer who can publish a valid new semantic digest.
      // Only this temporary test database's output pointer is changed. Source verification stays real.
      const row=db.prepare("SELECT version_sha256 sha FROM analysis_research_automation_outputs WHERE run_id=? AND report_kind='MARKET'").get(runId) as any;
      const wrapper=await readArtifact(row.sha);
      const bytes=Buffer.from(canonicalJson({...wrapper,syntheticIntegrityProbe:true}));
      const ref=await artifacts.put(bytes);
      assert.notEqual(ref.sha256,row.sha);
      db.prepare("INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES (?,?,?, ?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING").run(ref.sha256,ref.byteSize,'application/json',ref.relativePath,AT,AT);
      const trigger=(db.prepare("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='analysis_research_automation_outputs_no_update'").get() as any).sql;
      db.exec('DROP TRIGGER analysis_research_automation_outputs_no_update');
      try{db.prepare("UPDATE analysis_research_automation_outputs SET version_sha256=? WHERE run_id=? AND report_kind='MARKET'").run(ref.sha256,runId);}finally{db.exec(trigger);}
      assert.equal(hash(await artifacts.read(ref.sha256)),ref.sha256);
      // The republished wrapper itself must be readable before the independent evidence corruption.
      await report();
      if(readerReceipt)await service.readReaderReport(workspaceId,runId,readerReceipt.revision.revisionId);
    }
    let digest:string;
    if(field==='source-set')digest=(await sourceSet()).sha256;
    else if(field==='step')digest=(db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(runId) as any).sha;
    else if(field==='report')digest=(await report()).versionId;
    else if(field==='reader-build')digest=(db.prepare('SELECT input_sha256 sha FROM analysis_reader_report_revisions WHERE run_id=?').get(runId) as any).sha;
    else if(field.startsWith('corpus'))digest=(await context()).corpusSha256;
    else {const s=await retained(); digest=field==='collection'?s.sha256:field==='page'?s.pages[0]!.sha256:s.packet.listings.find((r:any)=>r.resultSha256)!.resultSha256!;}
    assert.ok(digest,'retained target exists');const file=artifacts.pathForDigest(digest);const bytes=await fs.readFile(file);
    if(field==='result-digest'){const v=JSON.parse(bytes.toString());v.expectedWithComments=v.expectedWithComments===17?18:17;const changed=Buffer.from(canonicalJson(v));assert.equal(changed.length,bytes.length);assert.notEqual(hash(changed),digest);await fs.writeFile(file,changed);}
    else {bytes[bytes.length-2]=bytes[bytes.length-2]===32?33:32;await fs.writeFile(file,bytes);}
  };
  const buildReader=async(injection:any={})=>{
    await report();await prepare();const c=await context();

    const input=sync1ReaderFixture();
    const snapshot=JSON.parse(scenarioCaptureFiles(runId,options.noPercentageEvidence).snapshotBytes.toString());
    const request={source:deriveReaderSource(verifyWebSnapshot(snapshot,webSnapshotDigest(snapshot)),5000,{nullable:true}),contractVersion:'reader-report-build-v1.2',requestKey:uuid(),metricPackageId:prepared?.packageId,platforms:['shopee'],profile:injection.injectedReaderLabel?{...input.profile,product:injection.injectedReaderLabel}:input.profile,cover:null};
    const cite=CitationRegistry.prototype.cite;
    if(injection.injectedCitationLabel)CitationRegistry.prototype.cite=function(v:any){return cite.call(this,{...v,label:injection.injectedCitationLabel});};
    try{readerReceipt=await service.buildReaderReport(workspaceId,runId,request,{actorId:'owner:synthetic',role:'OWNER'});return readerReceipt;}finally{CitationRegistry.prototype.cite=cite;}
  };
  const crash=async()=>{
    const r=await child(['--import','tsx','tests/helpers/shopee-public-crash-worker.ts',root,JSON.stringify(options)]);
    assert.equal(r.code,75,r.output);
    const history=(await fs.readFile(path.join(root,'invocations.jsonl'),'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));transport.calls.push(...history);
    throw new Error('Synthetic worker process exited');
  };
  const recreate=async(o:any={})=>{
    db.close();db=openDatabase({databasePath,now:clock.now}).db;
    if(o.nowMilliseconds!==undefined)clock.milliseconds=o.nowMilliseconds;
    else try{clock.milliseconds=JSON.parse(await fs.readFile(path.join(root,'clock.json'),'utf8'));}catch{}
    const prior=await fs.readFile(path.join(root,'invocations.jsonl'),'utf8').catch(()=>'');
    const history=prior.trim()?prior.trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[...transport.calls];
    let exchanges=wire(options,values).slice(history.length);if(options.faultAt==='after-request-count-before-fetch')exchanges=[{method:'GET',path:'/jobs?limit=100',body:[job()]},...wire(options,values).slice(3)];transport=new FakeTransport(exchanges,()=>clock.milliseconds);
    if(options.faultAt==='owner-cancel-before-intent')transport.exchanges.splice(0,transport.exchanges.length,{method:'POST',path:`/jobs/${IDS[0]}/cancel`,status:202,body:job(0,'running')});
    const newPosts=transport.posts.bind(transport); if(!['damaged-base-checkpoint','human-block-finalized','cancel-intent-finalized','after-cancel-intent-before-dispatch'].includes(options.faultAt??''))transport.calls.push(...history);
    transport.posts=()=>newPosts().filter(c=>transport.calls.indexOf(c)>=(['damaged-base-checkpoint','human-block-finalized','cancel-intent-finalized','after-cancel-intent-before-dispatch'].includes(options.faultAt??'')?0:history.length));
    throwBase=Boolean(o.throwBase||o.throwAllProviders);runtime={enabled:o.runtimeEnabled??runtime.enabled,cap:runtime.cap};
    service=make();const reader=db.prepare('SELECT revision_id id FROM analysis_reader_report_revisions WHERE run_id=? ORDER BY created_at DESC').get(runId) as any;if(reader)readerReceipt={revision:{revisionId:reader.id}};return driver;
  };
  const driver:any={root,artifactRoot,journalRoot,databasePath,clock,workspaceId,publicFactoryCalls,paidSpy,baseSpy,nativeInventorySpy,codingSpy,modelSpy,logs:[],errors:[],get db(){return db;},get service(){return service;},get runId(){return runId;},get transport(){return transport;},
    processToFault:crash,recreateFromDisk:recreate,
    abortAt:async(stage:string)=>{
      if(options.faultAt==='after-cancel-intent-before-dispatch')return crash();
      const controller=new AbortController();driver.validatedRowsAtAbort=[];
      const abort=()=>{driver.abortInvocationIndex=transport.calls.length;controller.abort();};
      if(stage==='before-submit'){
        driver.abortInvocationIndex=0;await service.cancel(workspaceId,runId,{contractVersion:'research-automation-cancel-v1',requestKey:uuid(),expectedRevision:(await getRun()).revision});return;
      }
      if(stage==='post-without-id'){
        transport.exchanges.splice(3);transport.exchanges[2]!.inspect=abort;transport.exchanges[2]!.error=new DOMException('Synthetic abort','AbortError');
      }else if(stage==='sleep'){
        clock.sleep=async()=>{abort();controller.signal.throwIfAborted();};transport.exchanges.splice(4);
        transport.exchanges.push({method:'POST',path:`/jobs/${IDS[0]}/cancel`,status:202,body:job(0,'running')});
      }else if(stage==='poll'){
        transport.exchanges[3]!.inspect=abort;transport.exchanges.splice(4);transport.exchanges.push({method:'POST',path:`/jobs/${IDS[0]}/cancel`,status:202,body:job(0,'running')});
      }else{
        transport.exchanges.splice(7);transport.exchanges[6]!.response=()=>new Response(new ReadableStream({pull(stream){stream.enqueue(new TextEncoder().encode('{"records":['));abort();stream.error(new DOMException('Synthetic abort','AbortError'));}}));
      }
      await service.processNext(controller.signal);
    },
    prepareRecoveryCase:async()=>{try{await crash();}catch(e){if(!String(e).includes('Synthetic worker process exited'))throw e;}if(options.faultAt==='damaged-base-checkpoint'){const r=db.prepare('SELECT base_step_sha256 sha FROM analysis_research_automation_review_stages WHERE run_id=?').get(runId) as any;await fs.writeFile(artifacts.pathForDigest(r.sha),'{}');}},
    confirmPublic:async(o:any={})=>{
      if(options.private||options.policy){await ensure();confirmation={contractVersion:'research-automation-confirm-v3',requestKey:uuid(),expectedRevision:(await getRun()).revision,definition:'Synthetic',includeTerms:[],excludeTerms:[],selectedProductIds:[],peerProductIds:[],exactShopeeUrls:urls,sources:{metric:{decision:'ABSENT'},nativeReview:{decision:'COLLECT_EXACT',providerId:'shopee-public-review',maxReviewsPerProduct:20}}};}
      return confirm(o);
    },
    confirmLegacyAcquire:()=>confirm({},'AUTO_REUSE'),
    confirmNative:async()=>{
      await ensure();const packages=new SourcePackageService({db,artifactStore:artifacts,now:clock.now});
      if(options.native!=='SKIP') {
        const seed=await seedNativeDamiPackage(packages,{selected:PRODUCTS[0],rawRows:[{type:'review',shopid:PRODUCTS[0]!.shopId,itemid:PRODUCTS[0]!.itemId,cmtid:'synthetic-native',comment:'Synthetic',rating_star:4,review_date:AT,collected_at:AT,model_name:null}]});
        if(options.native==='AMBIGUOUS')await seedNativeDamiPackage(packages,{packageKey:'synthetic-second',selected:PRODUCTS[0],rawRows:[{type:'review',shopid:PRODUCTS[0]!.shopId,itemid:PRODUCTS[0]!.itemId,cmtid:'synthetic-native-second',comment:'Synthetic second',rating_star:4,review_date:AT,collected_at:AT,model_name:null}]});
        if(options.native==='DAMAGED')await fs.writeFile(artifacts.pathForDigest(seed.identity.manifestArtifactSha256),'{}');
      }
      return confirm({},options.native==='SKIP'?'SKIP':'AUTO_REUSE');
    },
    confirmationRows:async()=>{await ensure();return ['runs','requests','source_sets'].map(s=>db.prepare('SELECT * FROM analysis_research_automation_'+s).all());},
    status:async(o:any={})=>{
      const providers=researchAutomationProviderConfigFromEnv(o.flag==='1'?{TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED:'1',TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN:TOKEN,TDN_RESEARCH_SHOPEE_PUBLIC_MAX_COMMENTS_PER_PRODUCT:String(o.cap??options.cap??20)}:{...(o.flag===undefined?{}:{TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED:o.flag}),TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN:'\n',TDN_RESEARCH_SHOPEE_PUBLIC_BASE_URL:'invalid'});
      const value=buildResearchAutomationSourceStatus({workspaceId,checkedAt:AT,executorEnabled:o.executorEnabled??true,providers,wired:{kalodata:true,serpapi:true,apifyShopee:false,shopeePublicReviews:true},activity:{...Object.fromEntries(['metric','kalodata','kalodata-video','video-reading','world-bank','un-comtrade','official-stats','serpapi','apify-shopee','apify-tiktok-comments','meta-ad-library','tiktok-top-ads','search-ads-library','pageindex'].map(k=>[k,{lastDataAt:null,lastUsageAt:null,dataCount:0}])),serpapiOperations:[]}} as any);return {...value,sources:value.sources.map(s=>({...s,arrival:SOURCE_REGISTRY[s.source].arrival}))};
    },finish,readReport:async()=> (await report()).bytes.toString(),semantic,
    receipts:async()=> (await retained()).packet.listings,outcome:async()=> (await context()).outcome,
    corpus:async()=>{const actual=buildPublicReviewCorpus(await retained());return {...actual,counts:actual.coverage};},
    usage:async()=>db.prepare('SELECT operation,cost_state costState,cost_unit costUnit,cost_amount costAmount,request_count requestCount FROM analysis_research_automation_usage WHERE run_id=?').all(runId),
    packages:async()=>[...(await retainedFiles(artifactRoot)).values()].map(b=>b.toString()),
    setResults:async(v:unknown[])=>{values=v;transport=new FakeTransport(wire(options,values),()=>clock.milliseconds);},
    setRuntime:async(o:any)=>{runtime={enabled:o.enabled??true,cap:o.cap??runtime.cap};service=make();},
    allReportAndUsageBytes:async()=>{const files=await retainedFiles(artifactRoot);reportSnapshotNames=[...files.keys()];return {files,usage:db.prepare('SELECT * FROM analysis_research_automation_usage').all()};},
    existingReportAndUsageBytes:async()=>({files:new Map([...(await retainedFiles(artifactRoot))].filter(([n])=>reportSnapshotNames?.includes(n))),usage:db.prepare('SELECT * FROM analysis_research_automation_usage').all()}),
    reviewDependentSections:async()=> (await semantic()).sections.filter((s:any)=>/^I/u.test(s.sectionId)),
    retainedReviewContext:context,corruptRetained:corrupt,buildReader,
    readReader:async()=> (await service.readReaderReport(workspaceId,runId,readerReceipt.revision.revisionId)).bytes.toString(),
    readReaderSolelyFromBuild:async()=>driver.readReader(),
    revise:async(decision:string)=>{const pairs=await service.listReportVersions(workspaceId,runId);await service.requestReportRevision(workspaceId,runId,{contractVersion:'automation-report-revision-v1',requestKey:uuid(),previousPairId:pairs.at(-1)!.pairId,sources:{metric:{decision:'KEEP'},nativeReview:{decision}}});await finish();},
    retainedRows:async()=> (await journals()).flatMap(j=>j.snapshot?.rows??[]),
    setCorpusSizeCase:async(kind:string)=>{const cap=300;options={...options,cap};runtime.cap=cap;values=Array.from({length:3},(_,p)=>result(p,Array.from({length:cap},(_,i)=>row(p,{review_id:`synthetic-${i}`,comment:'x'.repeat(kind==='over-8MiB'?12000:3000)}))));transport=new FakeTransport(wire(options,values),()=>clock.milliseconds);service=make();},
    sanitizedCapture:retained,accounting:async()=> (await context()).accounting,
    retryPublicCollection:async()=>{
      const source=await retained(), p=source.packet;
      return new ShopeeCollectionService(db,artifacts).savePublicExact(await artifacts.read(p.requestSha256),{
        mode:p.mode,confirmedSourceSetSha256:p.confirmedSourceSetSha256,providerId:p.providerId,mappingRevision:p.mappingRevision,
        maxReviewsPerProduct:p.maxReviewsPerProduct,usageTotalUsd:0,warnings:[],pages:source.pages.map(page=>({bytes:page.bytes,offset:page.offset})),
        envelopes:source.envelopes,listings:p.listings,attemptedAt:p.attemptedAt,reused:p.reused,
      });
    },
    readerBuildRecord:async()=>{const r=db.prepare('SELECT * FROM analysis_reader_report_revisions WHERE run_id=? ORDER BY created_at DESC').get(runId) as any;const v=await readArtifact(r.input_sha256);return {...v,builderId:v.builderVersion};},
    exportReport:async()=>service.readReport(workspaceId,runId,'MARKET',false,pairId),
    baseRows:async()=>({stage:db.prepare('SELECT * FROM analysis_research_automation_review_stages WHERE run_id=?').all(runId),captures:db.prepare('SELECT * FROM analysis_research_automation_captures WHERE run_id=?').all(runId),usage:db.prepare("SELECT * FROM analysis_research_automation_usage WHERE run_id=? AND provider!='shopee-public-review'").all(runId)}),
    collectionStep:async()=>db.prepare("SELECT * FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(runId),statusCode:async()=> (await getRun()).status,
    retryBaseCheckpoint:async()=>{const before=canonicalJson(db.prepare('SELECT * FROM analysis_research_automation_review_stages WHERE run_id=?').all(runId));const moved=await service.processNext();const after=canonicalJson(db.prepare('SELECT * FROM analysis_research_automation_review_stages WHERE run_id=?').all(runId));return {exactRetry:!moved&&before===after};},
    persistBaseCheckpoint:async()=>{db.transaction(()=>{db.prepare('INSERT INTO analysis_research_automation_review_stages SELECT * FROM analysis_research_automation_review_stages WHERE run_id=?').run(runId);})()},
    reopenSettledStep:async()=>{db.prepare("UPDATE analysis_research_automation_steps SET state='RUNNING' WHERE run_id=? AND step_id='COLLECTION'").run(runId);},
    loadLegacyBaselines:async()=>{
      let enabled=false;const baseline=fileURLToPath(new URL('../fixtures/shopee-public-g-references/',import.meta.url));
      let current=await candidateBaselines(t,{TDN_TEST_PUBLIC_REPLAY:'0'});
      await assertLegacyBaselineMatches(current,baseline);
      const allBytes=async()=>legacyBaselineBytes(current);
      const allMembers=async()=>new Map<string,Buffer>(JSON.parse(gunzipSync(await fs.readFile(path.join(current,'artifacts.json.gz'))).toString()).map((row:{name:string;base64:string})=>[row.name,Buffer.from(row.base64,'base64')]));
      return {allBytes,allMembers,setRuntime:async(o:any)=>{enabled=o.enabled;},readReportsAndSources:async()=>{const next=await candidateBaselines(t,{TDN_TEST_PUBLIC_REPLAY:enabled?'1':'0'});await assertLegacyBaselineMatches(next,baseline);current=next;},transport:new FakeTransport([]),publicFactoryCalls:[]};
    },
    historicalReadOnlyWithoutStages:async()=>{
      await confirm({},'SKIP');await finish();await driver.readReport();
      db.exec('DROP TABLE analysis_research_automation_review_stages');db.close();
      db=new BetterSqlite3(databasePath,{readonly:true});db.defaultSafeIntegers(true);service=make();
      return {readReports:async()=>Buffer.from(await driver.readReport()),transport:new FakeTransport([])};
    },
    persistedDeadlines:async()=>{const j=(await journals()).find(j=>j.intentAt);return {acquisitionDeadline:Date.parse(j.acquisitionDeadline),firstIntent:Date.parse(j.intentAt)};},
    autoRunToConfirmation:async(o:any={})=>{const r=buildConfirmValue({runId:workspaceId,expectedRevision:1,keyword:'synthetic jar',includeTerms:[],principalProductIds:['synthetic-card'],exactShopeeUrls:o.emptySelection?[]:urls.slice(0,5),packageId:workspaceId,publicAcquisition:{maxReviewsPerProduct:options.cap??20},...(options.mode==='TRIAL'?{testReviewCap:options.cap??20}:{})});assert.equal(r.ok,true);return (r as any).value;},unchangedPickedUrls:urls.slice(0,5),
  };
  await ensure();
  return driver;
}
