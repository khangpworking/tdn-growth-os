import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { SamplingJournal, SamplingJob, SamplingJobInput, SamplingResult, ReviewLink, ShopeeReviewPlan } from '../../../contracts/foundation/shopee-review-sampling.generated.js';
import { canonicalJson } from '../../modules/foundation/canonical-json.js';
import { samplingDigest, validateSampling, validateReviewPlan, validateSamplingResult, makeReviewCounts, ReviewSamplingError, validateReviewCounts } from '../../modules/foundation/shopee-review-sampling.js';
import { mapPublicReviewRows, ShopeePublicReviewSessionClient } from './shopee-public-reviews.js';

const MAX_BYTES = 16 * 1024 * 1024;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ReviewSamplingError('REVIEW_SOURCE_INVALID');
  return value as Record<string, unknown>;
};
const active = (state: string) => ['queued','running'].includes(state);
const pending = (state: string) => active(state) || ['needs_login','needs_verification'].includes(state);
const utc = (value: unknown): string => {
  if (typeof value !== 'string' || !/(?:Z|\+00:00)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new ReviewSamplingError('REVIEW_SOURCE_INVALID');
  return new Date(value).toISOString();
};
export interface SamplingCollectorOptions {
  token: string; baseUrl?: string; fetch?: typeof fetch; now?: () => Date;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<unknown>;
}
/** Dedicated versioned transport; the legacy collector/journals retain their original contract. */
export class ShopeeReviewSamplingCollector {
  readonly #base: string; readonly #fetch: typeof fetch; readonly #now: () => Date;
  readonly #sleep: NonNullable<SamplingCollectorOptions['sleep']>;
  constructor(readonly options: SamplingCollectorOptions) {
    this.#base = options.baseUrl?.replace(/\/$/,'') ?? 'http://127.0.0.1:8877';
    if (!/^http:\/\/(?:127\.0\.0\.1|\[::1\]):8877$/.test(this.#base) || !options.token || options.token.length > 512 || !/^[\x21-\x7e]+$/.test(options.token))
      throw new ReviewSamplingError('COLLECTOR_NOT_CONFIGURED');
    this.#fetch = options.fetch ?? fetch; this.#now = options.now ?? (() => new Date());
    this.#sleep = options.sleep ?? ((ms,signal) => delay(ms, undefined, {signal}));
  }
  async run(file: string, request: SamplingJobInput, link: ReviewLink, plan: ShopeeReviewPlan | null, reconcileOnly = false, signal?: AbortSignal): Promise<SamplingJournal> {
    validateSampling('jobInput',request);
    if (plan) validateReviewPlan(plan, 'sampling' in request ? request.sampling.planSha256 : undefined);
    const digest = samplingDigest(request), existing = await readSamplingJournal(file);
    if (existing && (existing.inputSha256 !== digest || canonicalJson(existing.request) !== canonicalJson(request))) throw new ReviewSamplingError('REVIEW_JOURNAL_CHANGED');
    if (!existing && reconcileOnly) throw new ReviewSamplingError('REVIEW_ATTEMPT_NOT_FOUND');
    const j: SamplingJournal = existing ?? { format:'shopee-sampling-journal-v1', inputSha256:digest, request, intentAt:null,
      deadline:new Date(this.#now().getTime() + ('sampling' in request ? 40 * 60_000 : 120_000)).toISOString(), baselineIds:[], job:null,
      result:null, resultSha256:null, terminal:false, errorCode:null, requestCount:0, requestCountUncertain:false, cancelIntent:false };
    const save = () => { j.resultSha256=j.result ? samplingDigest(j.result) : null; return writeSamplingJournal(file,j); };
    if (j.terminal) return j;
    await save();
    const left = () => Date.parse(j.deadline) - this.#now().getTime();
    let recoveryDeadline:number|null=null;
    const call = async (method: 'GET'|'POST', route: string, body?: unknown, cleanup = false, timeout = 10_000): Promise<unknown> => {
      if(reconcileOnly && method==='POST' && ['/jobs','/count-jobs'].includes(route))throw new ReviewSamplingError('REVIEW_RESUBMIT_REFUSED');
      if (!cleanup && signal?.aborted) throw new ReviewSamplingError('OWNER_ABORTED');
      if (!cleanup && left() <= 0) throw new ReviewSamplingError('DEADLINE');
      const budget=cleanup?(recoveryDeadline??=performance.now()+30_000)-performance.now():left();
      if(budget<=0)throw new ReviewSamplingError('RECOVERY_BUDGET_EXHAUSTED');
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.min(timeout,budget));
      const abort = () => controller.abort(); if (!cleanup) signal?.addEventListener('abort',abort,{once:true});
      try {
        j.requestCount++;j.requestCountUncertain=true;await save();
        if (controller.signal.aborted) throw new ReviewSamplingError('DEADLINE');
        const response = await this.#fetch(this.#base+route,{method,headers:{Authorization:`Bearer ${this.options.token}`,...(body === undefined ? {} : {'Content-Type':'application/json'})},
          ...(body === undefined ? {} : {body:canonicalJson(body)}),redirect:'error',cache:'no-store',signal:controller.signal});
        if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES) { await response.body?.cancel(); throw new ReviewSamplingError('REVIEW_SOURCE_LIMIT'); }
        const reader=response.body?.getReader(), chunks:Uint8Array[]=[];let size=0;
        try {
          if (reader) while (true) { const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_BYTES)throw new ReviewSamplingError('REVIEW_SOURCE_LIMIT');chunks.push(part.value); }
        } finally { await reader?.cancel().catch(()=>{}); }
        const text = new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
        if (text.includes(this.options.token) || text.includes(encodeURIComponent(this.options.token))) throw new ReviewSamplingError('CREDENTIAL_ECHO_REFUSED');
        j.requestCountUncertain=false;await save();
        if (!response.ok) throw new ReviewSamplingError(`REVIEW_HTTP_${response.status}`);
        const value:unknown=JSON.parse(text);
        if (canonicalJson(value).includes(this.options.token)) throw new ReviewSamplingError('CREDENTIAL_ECHO_REFUSED');
        return value;
      } catch(error) {
        if(error instanceof ReviewSamplingError)throw error;
        throw new ReviewSamplingError(signal?.aborted ? 'OWNER_ABORTED' : controller.signal.aborted ? 'DEADLINE' : 'REVIEW_TRANSPORT');
      } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    };
    const parseJob = (raw: unknown): SamplingJob => {
      const value=object(raw);
      const job=validateSampling<SamplingJob>('job',{id:value.id,request:value.request,state:value.state,created_at:utc(value.created_at),updated_at:utc(value.updated_at),result_available:value.result_available,
        ...(value.collected === undefined ? {} : {collected:value.collected})});
      if(canonicalJson(job.request)!==canonicalJson(request) || j.job && (j.job.id!==job.id || j.job.created_at!==job.created_at) ||
          Date.parse(job.created_at)>this.#now().getTime()+2000 || Date.parse(job.updated_at)<Date.parse(job.created_at))throw new ReviewSamplingError('REVIEW_JOB_CHANGED');
      return job;
    };
    const list = async (recovery=false): Promise<unknown[]> => { const value=await call('GET','/jobs?limit=100',undefined,recovery);if(!Array.isArray(value)||value.length>100)throw new ReviewSamplingError('REVIEW_SOURCE_INVALID');return value; };
    const reconcile = async () => {
      const all=await list(reconcileOnly && (left()<=0 || signal?.aborted===true));
      const candidates:SamplingJob[]=[];const lo=Date.parse(j.intentAt!)-2000,hi=Date.parse(j.intentAt!)+12000;
      let oldest=Infinity;
      for(const raw of all) {
        const row=object(raw);const req=object(row.request), at=Date.parse(utc(row.created_at));oldest=Math.min(oldest,at);
        if(j.baselineIds.includes(String(row.id)) || req.url!==link.url || at<lo || at>hi)continue;
        if(canonicalJson(req)!==canonicalJson(request))continue;
        candidates.push(parseJob(row));
      }
      if(candidates.length!==1 || all.length===100 && oldest>=lo)throw new ReviewSamplingError('SUBMISSION_UNCERTAIN');
      j.job=candidates[0]!;j.requestCountUncertain=false;await save();
    };
    const cancel = async () => {
      if(!j.job || !pending(j.job.state) || j.cancelIntent)return;
      j.cancelIntent=true;await save();
      try { await call('POST',`/jobs/${j.job.id}/cancel`,undefined,true); } catch { /* Never dispatch a second cancel. */ }
    };
    const retainResult = async (job:SamplingJob,recovery=false) => {
      if(!job.result_available)return;
      const raw=object(await call('GET',`/jobs/${job.id}/result`,undefined,recovery,30_000));
      if(raw.job_id!==job.id || raw.product_url!==link.url)throw new ReviewSamplingError('REVIEW_RESULT_CHANGED');
      if('kind' in request) {
        if(job.state==='succeeded')j.result=makeReviewCounts(link,raw.source_counts,utc(raw.source_counts_observed_at??raw.observed_at));
      } else {
        if(!plan || canonicalJson(raw.sampling)!==canonicalJson(request.sampling) || !Array.isArray(raw.records) || raw.records.length>plan.policy.totalPerLink) throw new ReviewSamplingError('REVIEW_RESULT_CHANGED');
        for(const record of raw.records){const row=object(record);if(row.source_filter!==(plan.policy.mode==='stars'?String(row.stars):plan.policy.mode))throw new ReviewSamplingError('REVIEW_RESULT_CHANGED');}
        const listing={platform:'shopee' as const,shopId:link.shopId,itemId:link.itemId,productUrl:link.url};
        const mapped=mapPublicReviewRows(raw.records,listing);
        // Checkpoints have their own explicit state and can never prove terminal publication.
        if(!active(job.state)&&raw.stop_reason==='running')throw new ReviewSamplingError('REVIEW_CHECKPOINT_INVALID');
        if(job.state==='succeeded'&&raw.complete!==true)throw new ReviewSamplingError('REVIEW_CHECKPOINT_INVALID');
        const result:SamplingResult={format:'shopee-sampled-result-v1',jobId:job.id,inputSha256:digest,sourceSha256:samplingDigest(raw),planSha256:request.sampling.planSha256,policySha256:plan.policySha256,
          link,phase:active(job.state)?'checkpoint':'terminal',rows:mapped,pages:raw.pages as SamplingResult['pages'],groups:raw.groups as SamplingResult['groups'],sourceCounts:makeReviewCounts(link,raw.source_counts,raw.source_counts_observed_at?utc(raw.source_counts_observed_at):raw.observed_at?utc(raw.observed_at):this.#now().toISOString()),
          stopReason:active(job.state)&&raw.stop_reason===undefined?'running':raw.stop_reason as SamplingResult['stopReason'],complete:!active(job.state)&&raw.complete===true};
        const next=validateSamplingResult(result,plan,request.sampling.planSha256,link,digest);
        if(j.result?.format==='shopee-sampled-result-v1'){
          const previous=j.result;
          if(next.rows.length<previous.rows.length || previous.rows.some((row,index)=>canonicalJson(row)!==canonicalJson(next.rows[index])))throw new ReviewSamplingError('REVIEW_CHECKPOINT_CHANGED');
        }
        j.result=next;
      }
      await save();
    };
    try {
      if(!j.intentAt) {
        if(reconcileOnly) {j.terminal=true;j.errorCode='STOPPED_BEFORE_SUBMIT';await save();return j;}
        const session = await new ShopeePublicReviewSessionClient({token:this.options.token,baseUrl:this.#base,now:this.#now,
          dispatch:async(method,route,timeout)=>({status:200,value:await call(method,route,undefined,false,timeout)})}).check(signal);
        if(session.state!=='READY') throw new ReviewSamplingError(session.state==='LOGIN_REQUIRED'?'HUMAN_LOGIN_REQUIRED':session.state==='VERIFICATION_REQUIRED'?'HUMAN_VERIFICATION_REQUIRED':'HEALTH_NOT_READY');
        const all=await list();
        if(all.some(raw=>active(String(object(raw).state)) || ['needs_login','needs_verification'].includes(String(object(raw).state)))) throw new ReviewSamplingError('HEALTH_NOT_READY');
        j.baselineIds=all.map(raw=>String(object(raw).id));
        j.intentAt=this.#now().toISOString();await save(); // Durable one-use submission permission.
        try { j.job=parseJob(await call('POST','kind' in request ? '/count-jobs' : '/jobs',request));await save(); }
        catch(error) {
          if(error instanceof ReviewSamplingError && /^REVIEW_HTTP_4\d\d$/.test(error.code)) { j.terminal=true;throw error; }
          throw new ReviewSamplingError('SUBMISSION_UNCERTAIN');
        }
      } else if(!j.job) await reconcile();
      // A same-attempt reconcile can read/cancel after acquisition deadline, never acquire again.
      if(signal?.aborted || left()<=0 || j.cancelIntent) {
        await cancel();
        const status=parseJob(await call('GET',`/jobs/${j.job!.id}`,undefined,true));j.job=status;
        await retainResult(status,true);
        if(!pending(status.state)) {j.terminal=true;j.errorCode=signal?.aborted||j.cancelIntent?'OWNER_ABORTED':'DEADLINE';await save();return j;}
        throw new ReviewSamplingError('CANCELLATION_UNCONFIRMED');
      }
      while(true) {
        if(signal?.aborted)throw new ReviewSamplingError('OWNER_ABORTED');
        const job=parseJob(await call('GET',`/jobs/${j.job!.id}`));j.job=job;await save();
        await retainResult(job);
        if(!active(job.state)) {
          j.terminal=!pending(job.state);j.errorCode=['succeeded','partial'].includes(job.state)?null:job.state==='needs_login'?'HUMAN_LOGIN_REQUIRED':job.state==='needs_verification'?'HUMAN_VERIFICATION_REQUIRED':job.state==='cancelled'?'OWNER_ABORTED':'SOURCE_JOB_FAILED';
          if(job.state==='succeeded'&&!j.result)j.errorCode='REVIEW_SOURCE_INVALID';
          await save();return j;
        }
        await this.#sleep(Math.min(3000,left()),signal);
      }
    } catch(error) {
      j.errorCode=error instanceof ReviewSamplingError?error.code:'REVIEW_SOURCE_INVALID';
      if(signal?.aborted||left()<=0) {j.errorCode=signal?.aborted?'OWNER_ABORTED':'DEADLINE';await cancel();}
      if(!j.intentAt || j.job && !pending(j.job.state))j.terminal=true;
      // An unresolved provider job or lost submit response stays nonterminal and blocks all policies.
      await save();return j;
    }
  }
}
export async function readSamplingJournal(file:string):Promise<SamplingJournal|null> {
  let stat;try{stat=await fs.lstat(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||stat.size>MAX_BYTES+262144)throw new ReviewSamplingError('REVIEW_JOURNAL_INVALID');
  const raw=await fs.readFile(file,'utf8'),j=validateSampling<SamplingJournal>('journal',JSON.parse(raw));
  if(canonicalJson(j)!==raw || samplingDigest(j.request)!==j.inputSha256 || j.job && canonicalJson(j.job.request)!==canonicalJson(j.request) || j.resultSha256!==(j.result?samplingDigest(j.result):null))throw new ReviewSamplingError('REVIEW_JOURNAL_CHANGED');
  if(j.result && j.result.format==='shopee-review-counts-v1')validateReviewCounts(j.result);
  return j;
}
async function writeSamplingJournal(file:string,journal:SamplingJournal):Promise<void> {
  validateSampling('journal',journal);
  const directory=path.dirname(file);await fs.mkdir(directory,{recursive:true,mode:0o700});
  let ancestor=directory;
  while(ancestor!==path.dirname(ancestor)){const stat=await fs.lstat(ancestor);if(stat.isSymbolicLink()||!stat.isDirectory())throw new ReviewSamplingError('REVIEW_JOURNAL_INVALID');ancestor=path.dirname(ancestor);}
  const previous=await readSamplingJournal(file);if(previous?.terminal&&canonicalJson(previous)!==canonicalJson(journal))throw new ReviewSamplingError('REVIEW_JOURNAL_CHANGED');
  const temp=file+'.'+randomUUID()+'.tmp',handle=await fs.open(temp,'wx',0o600);
  try{await handle.writeFile(canonicalJson(journal));await handle.sync();}finally{await handle.close();}
  await fs.rename(temp,file);const parent=await fs.open(directory,'r');try{await parent.sync();}finally{await parent.close();}
}
