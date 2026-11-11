import { access, lstat, mkdir, open, readFile, readdir, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AutomaticReviewBinding, ReviewSamplingAttempt, ReviewSamplingAttemptState, SamplingJournal, SamplingResult, SamplingJobInput } from '../contracts/foundation/shopee-review-sampling.generated.js';
import { reviewPolicy, samplingDigest, validateReviewPlan, validateSampling, validateReviewCounts, validateSamplingResult, starTargets, ReviewSamplingError,
  type ReviewLink, type ShopeeReviewPlan, type ReviewCounts } from '../src/modules/foundation/shopee-review-sampling.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';
import { ShopeeReviewSamplingCollector, readSamplingJournal } from '../src/platform/collectors/shopee-review-sampling.js';
import { shopeePublicReviewConfigFromEnv } from '../src/modules/analysis/research-automation/providers.js';
import { atomicJson, hashFile, hashFolder, ModuleError, object, prerequisite, readJson, readRequest, safePath, validateModuleValue } from './module-pick.js';

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const hex = /^[a-f0-9]{64}$/;
type Kind = 'counts'|'custom';
const attemptRoot = (kind:Kind) => kind === 'counts' ? 'review-counts' : 'm3-custom/attempts';
function attemptPath(kind:Kind,id:string):string {if(!uuid.test(id))throw new ModuleError('REVIEW_ATTEMPT_INVALID',2);return `${attemptRoot(kind)}/${id}`;}
async function children(run:string,relative:string):Promise<string[]> {
  try {const entries=await readdir(await safePath(run,relative),{withFileTypes:true});if(entries.some(e=>e.isSymbolicLink()))throw new ModuleError('MODULE_PATH_INVALID');return entries.map(e=>e.name).sort();}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
}
async function optional(run:string,name:string):Promise<unknown|null> {try{return await readJson(run,name);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}}
export async function samplingContext(run:string) {
  const m2Digest=await prerequisite(run,'m2');await readRequest(run);
  const tracking=await optional(run,'run-tracking.json');
  if(tracking!==null&&object(tracking).requestSha256!==await hashFile(run,'request.json'))throw new ModuleError('RUN_TRACKING_CHANGED',23);
  const selection=object(await readJson(run,'m2/selection.json'));await validateModuleValue('selection-v1',selection);
  if(selection.runId!==basename(run))throw new ModuleError('MODULE_INPUT_INVALID');
  const links:ReviewLink[]=(selection.links as unknown[]).map(value=>{const link=object(value);if(link.url!==`https://shopee.vn/product/${link.shopId}/${link.itemId}` || link.productBaseId!==`1__${link.itemId}__${link.shopId}`)throw new ModuleError('MODULE_INPUT_INVALID');return {shopId:link.shopId as string,itemId:link.itemId as string,url:link.url as string};});
  return {m2Digest,requestSha256:await hashFile(run,'request.json'),links};
}
async function writable() {
  const root=process.env.SHOPEE_FLOW_STATE??join(homedir(),'.local/state/tdn-growth-os');
  if(process.env.TDN_SHOPEE_FLOW_READONLY==='1')throw new ModuleError('READONLY_ON');
  try{await access(join(root,'shopee-flow/READONLY'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
  throw new ModuleError('READONLY_ON');
}
async function readonly():Promise<boolean>{try{await writable();return false;}catch(error){if(error instanceof ModuleError&&error.code==='READONLY_ON')return true;throw error;}}
async function exclusive(run:string,name:string,value:unknown):Promise<void>{
  const file=await safePath(run,name);await mkdir(resolve(file,'..'),{recursive:true,mode:0o700});
  const temporary=`${file}.${randomUUID()}.tmp`,handle=await open(temporary,'wx',0o600);
  try {
    await handle.writeFile(canonicalJson(value));await handle.sync();
    // Publish only complete immutable bytes, refusing an existing destination.
    await link(temporary,file);
    const parent=await open(resolve(file,'..'),'r');try{await parent.sync();}finally{await parent.close();}
  } finally {await handle.close();await unlink(temporary).catch(()=>{});}
}
async function planFor(run:string,digest:string):Promise<ShopeeReviewPlan>{
  if(!hex.test(digest))throw new ModuleError('REVIEW_PLAN_INVALID',2);
  const plan=validateReviewPlan(await readJson(run,`m3-custom/plans/${digest}.json`),digest),context=await samplingContext(run);
  if(plan.runId!==basename(run)||plan.m2Digest!==context.m2Digest||plan.requestSha256!==context.requestSha256||canonicalJson(plan.links)!==canonicalJson(context.links))throw new ModuleError('REVIEW_PLAN_CHANGED',23);
  return plan;
}
export async function frozenAttemptProof(run:string,kind:Kind,id:string){
  const attempt=await metadata(run,kind,id);
  const plan=attempt.planSha256?validateReviewPlan(await readJson(run,`m3-custom/plans/${attempt.planSha256}.json`),attempt.planSha256):null;
  if(plan&&(plan.runId!==attempt.runId||plan.m2Digest!==attempt.m2Digest||plan.requestSha256!==attempt.requestSha256||canonicalJson(plan.links)!==canonicalJson(attempt.links)))throw new ModuleError('REVIEW_ATTEMPT_CHANGED');
  if(new Set(attempt.links.map(link=>link.url)).size!==attempt.links.length||attempt.links.some(link=>link.url!==`https://shopee.vn/product/${link.shopId}/${link.itemId}`))throw new ModuleError('REVIEW_ATTEMPT_CHANGED');
  const journals=await journalsFor(run,attempt);
  for(let index=0;index<journals.length;index++){
    const journal=journals[index],link=attempt.links[index]!;if(!journal)continue;
    const expected:SamplingJobInput=plan?{url:link.url,max_comments:plan.policy.totalPerLink,sampling:{attemptId:attempt.attemptId,planSha256:attempt.planSha256!,policySha256:plan.policySha256,policy:plan.policy}}:{kind:'counts',url:link.url,request_key:attempt.attemptId};
    if(canonicalJson(journal.request)!==canonicalJson(expected))throw new ModuleError('REVIEW_JOURNAL_CHANGED');
    if(journal.result?.format==='shopee-sampled-result-v1')validateSamplingResult(journal.result,plan!,attempt.planSha256!,link,samplingDigest(expected));
  }
  return {attempt,plan};
}
async function currentInputsMatch(run:string,attempt:ReviewSamplingAttempt):Promise<boolean>{
  try{const context=await samplingContext(run);return context.m2Digest===attempt.m2Digest&&context.requestSha256===attempt.requestSha256&&canonicalJson(context.links)===canonicalJson(attempt.links);}catch{return false;}
}
export async function saveReviewPlan(run:string,input:unknown){
  const context=await samplingContext(run),policy=reviewPolicy(input);
  const plan:ShopeeReviewPlan={format:'shopee-review-plan-v1',runId:basename(run),...context,policy,policySha256:samplingDigest(policy),targets:starTargets(policy)};
  validateReviewPlan(plan);const planSha256=samplingDigest(plan),name=`m3-custom/plans/${planSha256}.json`;
  try{await exclusive(run,name,plan);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;await planFor(run,planSha256);}
  return {format:'review-plan-saved-v1',runId:basename(run),planSha256,plan};
}
async function metadata(run:string,kind:Kind,id:string):Promise<ReviewSamplingAttempt>{
  const value=await optional(run,`${attemptPath(kind,id)}/attempt.json`);
  if(value===null)throw new ModuleError('REVIEW_RESERVATION_INCOMPLETE');
  const attempt=validateSampling<ReviewSamplingAttempt>('attempt',value);
  if(attempt.attemptId!==id||attempt.kind!==kind||attempt.runId!==basename(run)||kind==='custom'&&!attempt.planSha256||kind==='counts'&&attempt.planSha256!==null)throw new ModuleError('REVIEW_ATTEMPT_CHANGED');
  return attempt;
}
export async function stateFor(run:string,kind:Kind,id:string):Promise<ReviewSamplingAttemptState>{
  const saved=await optional(run,`${attemptPath(kind,id)}/state.json`);
  const state=validateSampling<ReviewSamplingAttemptState>('attemptState',saved??{format:'shopee-review-attempt-state-v1',attemptSha256:samplingDigest(await metadata(run,kind,id)),status:'UNCERTAIN',pid:null,errorCode:'RESERVATION_INCOMPLETE',outputSha256:null});
  if(state.attemptSha256!==samplingDigest(await metadata(run,kind,id)))throw new ModuleError('REVIEW_ATTEMPT_CHANGED');return state;
}
async function pidLive(pid:number|null):Promise<boolean>{
  if(pid===null)return false;
  try{process.kill(pid,0);try{const stat=await readFile(`/proc/${pid}/stat`,'utf8');if(['Z','X'].includes(stat.slice(stat.lastIndexOf(')')+2).split(' ')[0]!))return false;}catch{/* Non-Linux: kill(0) remains conservative. */}return true;}catch{return false;}
}
export async function journalsFor(run:string,attempt:ReviewSamplingAttempt):Promise<(SamplingJournal|null)[]>{
  const base=attemptPath(attempt.kind,attempt.attemptId);
  return Promise.all(attempt.links.map(link=>readSamplingJournal(join(run,`${base}/journal/${samplingDigest(link)}.json`))));
}
async function attemptUnresolved(run:string,attempt:ReviewSamplingAttempt,state:ReviewSamplingAttemptState):Promise<boolean>{
  if(state.status==='RUNNING'||state.status==='UNCERTAIN')return true;
  return (await journalsFor(run,attempt)).some(j=>j!==null&&(!j.terminal||j.job&&['queued','running','needs_login','needs_verification'].includes(j.job.state)));
}
export async function assertSamplingIdle(run:string,exclude?:{kind:Kind,id:string},checkLegacy=true):Promise<void>{
  const automatic=await automaticBinding(run);
  if(automatic&&!(exclude?.kind==='custom'&&exclude.id===automatic.attemptId))await metadata(run,'custom',automatic.attemptId);
  for(const kind of ['counts','custom'] as const)for(const id of await children(run,attemptRoot(kind))){
    if(!uuid.test(id))throw new ModuleError('REVIEW_ATTEMPT_INVALID');if(kind===exclude?.kind&&id===exclude.id)continue;
    if(await attemptUnresolved(run,await metadata(run,kind,id),await stateFor(run,kind,id)))throw new ModuleError('SUBMISSION_UNCERTAIN');
  }
  // Read only the legacy run's own journals; do not alter their format or bytes.
  async function scan(relative:string):Promise<void>{for(const name of await children(run,relative)){const file=`${relative}/${name}`,stat=await lstat(await safePath(run,file));if(stat.isDirectory())await scan(file);else if(name.endsWith('.json')){
    const j=object(await readJson(run,file)),job=j.job===null?null:object(j.job);
    if(j.intentAt&&!j.terminal||job&&['queued','running','needs_login','needs_verification'].includes(String(job.state)))throw new ModuleError('SUBMISSION_UNCERTAIN');
  }}}
  if(checkLegacy)await scan('m3-journal');
}
export interface ExecutionIdentity {executionId:string;sequence:number}
function executionIdentity(value:ExecutionIdentity|undefined):ExecutionIdentity|undefined {
  if(value&&(!uuid.test(value.executionId)||!Number.isSafeInteger(value.sequence)||value.sequence<1))throw new ModuleError('EXECUTION_IDENTITY_INVALID');
  return value;
}
async function publishReservation(run:string,kind:Kind,context:Awaited<ReturnType<typeof samplingContext>>,planSha256:string|undefined,identity?:ExecutionIdentity,attemptId=randomUUID()){
  const base=attemptPath(kind,attemptId);
  const attempt:ReviewSamplingAttempt={format:'shopee-review-attempt-v1',kind,attemptId,runId:basename(run),createdAt:new Date().toISOString(),...context,planSha256:kind==='custom'?planSha256!:null,...executionIdentity(identity)};
  await exclusive(run,`${base}/attempt.json`,attempt);
  await atomicJson(run,`${base}/state.json`,{format:'shopee-review-attempt-state-v1',attemptSha256:samplingDigest(attempt),status:'RUNNING',pid:process.ppid,errorCode:null,outputSha256:null});
  return {format:kind==='counts'?'review-counts-start-v1':'review-attempt-start-v1',runId:basename(run),attemptId,...(kind==='custom'?{planSha256}:{}),...identity,status:'RUNNING',pid:process.ppid};
}
export async function reserveAttempt(run:string,kind:Kind,planSha256?:string,identity?:ExecutionIdentity){
  await writable();const context=await samplingContext(run);await assertSamplingIdle(run);
  if(kind==='custom')await planFor(run,planSha256??'');
  return publishReservation(run,kind,context,planSha256,identity);
}
async function automaticBinding(run:string):Promise<AutomaticReviewBinding|null>{
  const value=await optional(run,'m3-custom/automatic.json');if(value===null)return null;
  const binding=validateSampling<AutomaticReviewBinding>('automatic',value);
  if(binding.runId!==basename(run))throw new ModuleError('REVIEW_PLAN_CHANGED');return binding;
}
export async function reserveConfiguredAttempt(run:string,identity:ExecutionIdentity){
  await writable();executionIdentity(identity);
  const request=await readRequest(run);if(!request.collectionPolicy)throw new ModuleError('CONFIGURED_POLICY_MISSING');
  const context=await samplingContext(run),policy=request.collectionPolicy,existing=await automaticBinding(run);
  if(existing){
    if(existing.requestSha256!==context.requestSha256||existing.m2Digest!==context.m2Digest||existing.policySha256!==samplingDigest(policy))throw new ModuleError('REVIEW_PLAN_CHANGED',23);
    await planFor(run,existing.planSha256);await frozenAttemptProof(run,'custom',existing.attemptId);
    throw new ModuleError('AUTOMATIC_COLLECTION_EXISTS');
  }
  await assertSamplingIdle(run);
  const saved=await saveReviewPlan(run,{mode:policy.mode,stars:policy.stars,totalPerLink:policy.totalPerLink,allocation:policy.allocation});
  const attemptId=randomUUID(),binding:AutomaticReviewBinding={format:'shopee-automatic-review-binding-v1',runId:basename(run),requestSha256:context.requestSha256,m2Digest:context.m2Digest,policySha256:samplingDigest(policy),planSha256:saved.planSha256,attemptId,...identity,createdAt:new Date().toISOString()};
  validateSampling('automatic',binding);
  // The immutable identity/plan binding precedes all attempt material and dispatch.
  await exclusive(run,'m3-custom/automatic.json',binding);
  return publishReservation(run,'custom',context,saved.planSha256,identity,attemptId);
}
export async function stopReviewAttempt(run:string,kind:Kind,id:string){
  const attempt=await metadata(run,kind,id),state=await stateFor(run,kind,id);
  if(!await attemptUnresolved(run,attempt,state))return {format:'review-attempt-control-v1',runId:basename(run),kind,attemptId:id,status:state.status,pid:null,errorCode:state.errorCode};
  const name=`${attemptPath(kind,id)}/stop.json`;
  try{await exclusive(run,name,{format:'shopee-review-attempt-stop-v1',attemptId:id});}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
  return {format:'review-attempt-control-v1',runId:basename(run),kind,attemptId:id,status:'STOP_REQUESTED',pid:null,errorCode:null};
}
function summarizeLink(link:ReviewLink,plan:ShopeeReviewPlan|null,journal:SamplingJournal|null){
  const result=journal?.result?.format==='shopee-sampled-result-v1'?journal.result:null;
  const actual=result&&result.pages.length>0?result.rows.length:null,requested=plan?.policy.totalPerLink??0;
  return {shopId:link.shopId,itemId:link.itemId,requested,actual,shortfall:actual===null?null:requested-actual,stopReason:result?.stopReason??(journal?.errorCode??'not_started'),
    stars:plan?.policy.mode==='stars'?plan.policy.stars.map(star=>{const target=plan.targets.find(q=>q.star===star)?.target??null;
      const groupObserved=result?.pages.some(page=>page.filter===String(star))??false;
      const got=groupObserved?result!.rows.filter(row=>row.ratingStar===star).length:null;
      return {star,target,actual:got,shortfall:target===null||got===null?null:target-got};}):[]};
}
export async function reviewSamplingView(run:string){
  let context:Awaited<ReturnType<typeof samplingContext>>|null=null,blockedBy:{code:string}|null=null;
  try{context=await samplingContext(run);}catch(error){blockedBy={code:error instanceof ModuleError?error.code:'REVIEW_INPUT_INVALID'};}
  const plans=[];for(const name of await children(run,'m3-custom/plans')){if(/^[a-f0-9]{64}\.json\.[a-f0-9-]{36}\.tmp$/.test(name))continue;if(!/^[a-f0-9]{64}\.json$/.test(name))throw new ModuleError('REVIEW_PLAN_INVALID');const plan=validateReviewPlan(await readJson(run,`m3-custom/plans/${name}`),name.slice(0,64));if(context&&plan.m2Digest===context.m2Digest&&plan.requestSha256===context.requestSha256)plans.push({planSha256:name.slice(0,64),plan});}
  const attempts:Record<string,unknown>[]=[],countAttempts:Record<string,unknown>[]=[],counts=new Map<string,ReviewCounts>();
  const automatic=await automaticBinding(run);
  if(automatic){
    const plan=validateReviewPlan(await readJson(run,`m3-custom/plans/${automatic.planSha256}.json`),automatic.planSha256);
    if(plan.runId!==automatic.runId||plan.requestSha256!==automatic.requestSha256||plan.m2Digest!==automatic.m2Digest||plan.policySha256!==automatic.policySha256)throw new ModuleError('REVIEW_PLAN_CHANGED');
  }
  for(const kind of ['counts','custom'] as const)for(const id of await children(run,attemptRoot(kind))){
    if(!uuid.test(id))throw new ModuleError('REVIEW_ATTEMPT_INVALID');
    const binding=kind==='custom'&&automatic?.attemptId===id?automatic:null;
    if(await optional(run,`${attemptPath(kind,id)}/attempt.json`)===null){
      (kind==='custom'?attempts:countAttempts).push({attemptId:id,automatic:binding!==null,executionId:binding?.executionId??null,sequence:binding?.sequence??null,createdAt:binding?.createdAt??null,planSha256:binding?.planSha256??null,requestSha256:binding?.requestSha256??null,m2Digest:binding?.m2Digest??null,status:'UNCERTAIN',errorCode:'REVIEW_RESERVATION_INCOMPLETE',gate:null,links:[],receiptMatchesCurrentInputs:false,stopRequested:false,reconcilable:false});
      blockedBy??={code:'REVIEW_RESERVATION_INCOMPLETE'};continue;
    }
    const attempt=await metadata(run,kind,id),stored=await stateFor(run,kind,id),js=await journalsFor(run,attempt);
    if(binding&&(attempt.executionId!==binding.executionId||attempt.sequence!==binding.sequence||attempt.planSha256!==binding.planSha256||attempt.requestSha256!==binding.requestSha256||attempt.m2Digest!==binding.m2Digest))throw new ModuleError('REVIEW_ATTEMPT_CHANGED');
    const unresolved=await attemptUnresolved(run,attempt,stored),live=stored.status==='RUNNING'&&await pidLive(stored.pid);
    const status=stored.status==='RUNNING'&&!live?'UNCERTAIN':unresolved&&stored.status!=='RUNNING'?'UNCERTAIN':stored.status;
    const stopRequested=await optional(run,`${attemptPath(kind,id)}/stop.json`)!==null;
    if(unresolved)blockedBy??={code:status==='RUNNING'?'RUN_BUSY':'SUBMISSION_UNCERTAIN'};
    const plan=attempt.planSha256?validateReviewPlan(await readJson(run,`m3-custom/plans/${attempt.planSha256}.json`),attempt.planSha256):null;
    if(plan&&(plan.m2Digest!==attempt.m2Digest||plan.requestSha256!==attempt.requestSha256||canonicalJson(plan.links)!==canonicalJson(attempt.links)))throw new ModuleError('REVIEW_ATTEMPT_CHANGED');
    for(let index=0;index<js.length;index++){
      const journal=js[index],link=attempt.links[index]!;
      if(!journal)continue;
      const expected:SamplingJobInput=plan?{url:link.url,max_comments:plan.policy.totalPerLink,sampling:{attemptId:attempt.attemptId,planSha256:attempt.planSha256!,policySha256:plan.policySha256,policy:plan.policy}}:{kind:'counts',url:link.url,request_key:attempt.attemptId};
      if(canonicalJson(journal.request)!==canonicalJson(expected))throw new ModuleError('REVIEW_JOURNAL_CHANGED');
      if(journal.result?.format==='shopee-sampled-result-v1')validateSamplingResult(journal.result,plan!,attempt.planSha256!,link,samplingDigest(expected));
    }
    if(!unresolved&&stored.outputSha256){
      if(kind==='custom'){
        if(stored.outputSha256!==await hashFolder(run,`${attemptPath(kind,id)}/output`))throw new ModuleError('REVIEW_RESULT_CHANGED');
        const gate=object(await readJson(run,`${attemptPath(kind,id)}/gate.json`));
        if(gate.format!=='handoff-v1'||gate.module!=='M3'||gate.runId!==basename(run)||gate.inputSha256!==attempt.planSha256||gate.outputSha256!==stored.outputSha256||
          stored.status==='FAILED'&&gate.verdict==='PASS'||stored.status==='SUCCEEDED'&&(stored.errorCode!==null||gate.verdict!=='PASS'||gate.errorCode!==null||!Array.isArray(gate.checks)||gate.checks.some(c=>{const check=object(c);return !check.ok&&check.level!=='warn';})))throw new ModuleError('REVIEW_RESULT_CHANGED');
      }else if(stored.outputSha256!==samplingDigest(js.map(j=>j?.result??null)))throw new ModuleError('REVIEW_COUNTS_CHANGED');
    }
    if(!unresolved&&stored.status==='SUCCEEDED'&&!stored.outputSha256)throw new ModuleError('REVIEW_RESULT_CHANGED');
    const summary={attemptId:id,automatic:binding!==null,executionId:attempt.executionId??null,sequence:attempt.sequence??null,requestSha256:attempt.requestSha256,m2Digest:attempt.m2Digest,receiptMatchesCurrentInputs:!unresolved&&stored.outputSha256!==null&&context!==null&&context.requestSha256===attempt.requestSha256&&context.m2Digest===attempt.m2Digest,planSha256:attempt.planSha256,createdAt:attempt.createdAt,status,errorCode:stored.errorCode,stopRequested,reconcilable:!live,
      gate:await optional(run,`${attemptPath(kind,id)}/gate.json`),links:attempt.links.map((link,index)=>summarizeLink(link,plan,js[index]??null))};
    if(context&&attempt.m2Digest===context.m2Digest)for(const j of js){const count=j?.result?.format==='shopee-review-counts-v1'?j.result:j?.result?.sourceCounts;if(count){validateReviewCounts(count);if(!counts.has(count.url)||counts.get(count.url)!.observedAt<count.observedAt)counts.set(count.url,count);}}
    (kind==='custom'?attempts:countAttempts).push(summary);
  }
  if(automatic&&!attempts.some(a=>a.attemptId===automatic.attemptId)){
    attempts.push({attemptId:automatic.attemptId,automatic:true,executionId:automatic.executionId,sequence:automatic.sequence,createdAt:automatic.createdAt,planSha256:automatic.planSha256,requestSha256:automatic.requestSha256,m2Digest:automatic.m2Digest,status:'UNCERTAIN',errorCode:'REVIEW_RESERVATION_INCOMPLETE',gate:null,links:[],receiptMatchesCurrentInputs:false,stopRequested:false,reconcilable:false});
    blockedBy??={code:'REVIEW_RESERVATION_INCOMPLETE'};
  }
  const sort=(a:Record<string,unknown>,b:Record<string,unknown>)=>String(a.createdAt).localeCompare(String(b.createdAt))||String(a.attemptId).localeCompare(String(b.attemptId));
  attempts.sort(sort);countAttempts.sort(sort);
  const ro=await readonly();if(ro)blockedBy??={code:'READONLY_ON'};
  return {format:'review-sampling-view-v1',runId:basename(run),readonly:ro,m2Digest:context?.m2Digest??null,links:context?.links??[],defaultInput:{mode:'with-comments',stars:[],totalPerLink:300,allocation:'pooled'},plans,
    counts:context?.links.flatMap(link=>counts.has(link.url)?[counts.get(link.url)!]:[])??[],countRefresh:countAttempts.at(-1)??null,attempts,blockedBy};
}
export interface SamplingExecutionDependencies {
  runDir:string;kind:Kind;attemptId:string;reconcileOnly?:boolean;
  collector?:Pick<ShopeeReviewSamplingCollector,'run'>;
}
export async function executeSamplingAttempt(deps:SamplingExecutionDependencies){
  const run=resolve(deps.runDir),{attempt,plan}=await frozenAttemptProof(run,deps.kind,deps.attemptId),base=attemptPath(deps.kind,deps.attemptId),prior=await stateFor(run,deps.kind,deps.attemptId);
  if(prior.status!=='RUNNING'&&prior.status!=='UNCERTAIN')return {format:'review-attempt-control-v1',runId:basename(run),kind:deps.kind,attemptId:deps.attemptId,status:prior.status,pid:null,errorCode:prior.errorCode};
  if(prior.status==='UNCERTAIN'&&!deps.reconcileOnly)throw new ModuleError('SUBMISSION_UNCERTAIN');
  await writable();let inputsChanged=!await currentInputsMatch(run,attempt);
  if(inputsChanged&&!deps.reconcileOnly)throw new ModuleError('REVIEW_PLAN_CHANGED',23);
  await assertSamplingIdle(run,{kind:deps.kind,id:deps.attemptId});
  const controller=new AbortController(),onStop=()=>controller.abort();process.once('SIGTERM',onStop);process.once('SIGINT',onStop);
  const stopped=async()=>{
    try{if(await hashFile(run,'request.json')!==attempt.requestSha256||await hashFile(run,'m2/selection.json')!==attempt.m2Digest)inputsChanged=true;}catch{inputsChanged=true;}
    if(inputsChanged||await optional(run,`${base}/stop.json`)!==null||await readonly())controller.abort();
  };
  await stopped();const timer=setInterval(()=>{void stopped().catch(()=>controller.abort());},500);
  const journals:(SamplingJournal|null)[]=attempt.links.map(()=>null);
  let errorCode:string|null=null;
  try {
    await atomicJson(run,`${base}/state.json`,{...prior,status:'RUNNING',pid:process.pid,errorCode:null});
    let collector=deps.collector;
    if(!collector){const config=shopeePublicReviewConfigFromEnv(process.env);if(!config)throw new ModuleError('COLLECTOR_NOT_CONFIGURED');collector=new ShopeeReviewSamplingCollector({token:config.token,baseUrl:config.baseUrl});}
    for(let index=0;index<attempt.links.length;index++){
      const link=attempt.links[index]!,file=await safePath(run,`${base}/journal/${samplingDigest(link)}.json`);
      if(deps.reconcileOnly&&await readSamplingJournal(file)===null)continue;
      const request:SamplingJobInput=plan?{url:link.url,max_comments:plan.policy.totalPerLink,sampling:{attemptId:attempt.attemptId,planSha256:attempt.planSha256!,policySha256:plan.policySha256,policy:plan.policy}}:{kind:'counts',url:link.url,request_key:attempt.attemptId};
      journals[index]=await collector.run(file,request,link,plan,deps.reconcileOnly,controller.signal);
      if(journals[index]!.errorCode){errorCode=journals[index]!.errorCode;break;}
    }
  }catch(error){errorCode=error instanceof ModuleError||error instanceof ReviewSamplingError?error.code:'REVIEW_ATTEMPT_FAILED';}
  finally{clearInterval(timer);process.removeListener('SIGTERM',onStop);process.removeListener('SIGINT',onStop);}
  // Include prior terminal journals on exact-attempt reconciliation; never synthesize missing observations.
  for(let index=0;index<attempt.links.length;index++)journals[index]??=await readSamplingJournal(await safePath(run,`${base}/journal/${samplingDigest(attempt.links[index]!)}.json`));
  const unresolved=journals.some(j=>j!==null&&(!j.terminal||j.job&&['queued','running','needs_login','needs_verification'].includes(j.job.state)));
  const summaries=attempt.links.map((link,index)=>summarizeLink(link,plan,journals[index]??null));
  // Cleanup remains possible after upstream drift, but changed inputs never publish.
  inputsChanged ||= !await currentInputsMatch(run,attempt);
  if(inputsChanged)errorCode='REVIEW_PLAN_CHANGED';
  let gate:Record<string,unknown>|null=null;
  if(plan){
    const results=journals.flatMap(j=>j?.result?.format==='shopee-sampled-result-v1'?[j.result]:[]);
    for(const result of results){const link=attempt.links.find(l=>l.url===result.link.url);if(!link)throw new ModuleError('REVIEW_RESULT_CHANGED');const request={url:link.url,max_comments:plan.policy.totalPerLink,sampling:{attemptId:attempt.attemptId,planSha256:attempt.planSha256!,policySha256:plan.policySha256,policy:plan.policy}};validateSamplingResult(result,plan,attempt.planSha256!,link,samplingDigest(request));}
    const rows=results.flatMap(result=>result.rows),ids=rows.map(row=>row.reviewId);
    const checks=[{id:'verdict_ok',ok:!errorCode&&!unresolved&&results.length===attempt.links.length&&results.every(r=>r.phase==='terminal'&&['record_limit','exhausted','page_limit'].includes(r.stopReason))},
      {id:'min_reviews_per_link',ok:summaries.every(s=>s.actual!==null&&s.actual>=1)},{id:'cap_not_exceeded',ok:summaries.every(s=>s.actual!==null&&s.actual<=plan.policy.totalPerLink)},
      {id:'no_duplicate_review_ids',ok:ids.every(Boolean)&&new Set(ids).size===ids.length},{id:'product_ids_match_m2',ok:results.every(r=>attempt.links.some(link=>canonicalJson(link)===canonicalJson(r.link)))},
      {id:'shape_shopee_public_rows',ok:true},{id:'links_below_cap',level:'warn',ok:summaries.every(s=>s.shortfall===0)}];
    const pass=checks.every(check=>check.ok||check.level==='warn');
    await atomicJson(run,`${base}/output/reviews.json`,pass?rows:[]);
    await atomicJson(run,`${base}/output/outcome.json`,{format:'m3-custom-outcome-v1',planSha256:attempt.planSha256,verdict:pass?(summaries.some(s=>s.shortfall!==0)?'PARTIAL_LISTINGS':'OK'):'FAILED',errorCode:pass?null:errorCode??'M3_GATE_FAILED',links:summaries});
    gate={format:'handoff-v1',module:'M3',runId:basename(run),skillVersion:'custom-review-sampling-v1',verdict:pass?'PASS':['HUMAN_LOGIN_REQUIRED','HUMAN_VERIFICATION_REQUIRED'].includes(errorCode??'')?'WAIT_OWNER':'FAIL',inputSha256:attempt.planSha256,outputSha256:await hashFolder(run,`${base}/output`),checks,errorCode:pass?null:errorCode??'M3_GATE_FAILED',next:null};
    await atomicJson(run,`${base}/gate.json`,gate);
    if(!pass)errorCode??='M3_GATE_FAILED';
  }else if(journals.some(j=>!j?.result||j.result.format!=='shopee-review-counts-v1'))errorCode??='REVIEW_COUNTS_INCOMPLETE';
  const status=unresolved?'UNCERTAIN':errorCode?'FAILED':'SUCCEEDED';
  const outputSha256=gate?.outputSha256??samplingDigest(journals.map(j=>j?.result??null));
  await atomicJson(run,`${base}/state.json`,{format:'shopee-review-attempt-state-v1',attemptSha256:prior.attemptSha256,status,pid:null,errorCode,outputSha256});
  return {format:'review-attempt-control-v1',runId:basename(run),kind:deps.kind,attemptId:deps.attemptId,status,pid:null,errorCode};
}
async function inputJson():Promise<unknown>{let value='';for await(const part of process.stdin){value+=String(part);if(Buffer.byteLength(value)>65536)throw new ModuleError('REVIEW_INPUT_INVALID',2);}return JSON.parse(value);}
export async function reviewSamplingCommand(args:string[]){
  const [action,runArg,...rest]=args;if(!runArg)throw new ModuleError('USAGE',2);const run=resolve(runArg);
  if(action==='view')return reviewSamplingView(run);
  if(action==='configured-reserve')return reserveConfiguredAttempt(run,{executionId:rest[0]??'',sequence:Number(rest[1])});
  if(action==='save')return saveReviewPlan(run,await inputJson());
  if(action==='idle'){await assertSamplingIdle(run,undefined,false);return {format:'review-idle-v1'};}
  const kind=rest[0];if(kind!=='counts'&&kind!=='custom')throw new ModuleError('USAGE',2);
  if(action==='reserve')return reserveAttempt(run,kind,rest[1],rest[2]?{executionId:rest[2],sequence:Number(rest[3])}:undefined);
  if(action==='stop')return stopReviewAttempt(run,kind,rest[1]??'');
  if(action==='execute')return executeSamplingAttempt({runDir:run,kind,attemptId:rest[1]??'',reconcileOnly:rest[2]==='reconcile'});
  if(action==='reconcile-check'){
    await writable();const {attempt}=await frozenAttemptProof(run,kind,rest[1]??'');await assertSamplingIdle(run,{kind,id:rest[1]??''});
    const state=await stateFor(run,kind,rest[1]??'');if(state.status==='RUNNING'&&await pidLive(state.pid))throw new ModuleError('RUN_BUSY',24);
    if(!await attemptUnresolved(run,attempt,state))return {format:'review-attempt-control-v1',runId:basename(run),kind,attemptId:rest[1],status:state.status,pid:null,errorCode:state.errorCode};
    return {format:'review-attempt-control-v1',runId:basename(run),kind,attemptId:rest[1],status:'RUNNING',pid:null,errorCode:null};
  }
  throw new ModuleError('USAGE',2);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))void reviewSamplingCommand(process.argv.slice(2)).then(result=>{process.stdout.write(`${JSON.stringify(result)}\n`);}).catch(error=>{
  const code=error instanceof ModuleError||error instanceof ReviewSamplingError?error.code:'REVIEW_INPUT_INVALID';
  process.stdout.write(`${JSON.stringify({format:'error-v1',code,message:code})}\n`);process.exitCode=error instanceof ModuleError?error.exitCode:2;
});
