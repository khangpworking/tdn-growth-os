import fs from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { publicScenario } from './shopee-public-scenario.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
const [root, serialized] = process.argv.slice(2);
if(!root||!serialized)throw new Error('Synthetic worker arguments required');
const options=JSON.parse(serialized);
const f=await publicScenario({after:()=>{}} as any,options,root);
const die=():never=>{writeFileSync(path.join(root,'clock.json'),JSON.stringify(f.clock.milliseconds));process.exit(75);};
const rename=fs.rename;
fs.rename=(async(from:any,to:any)=>{
  let j:any;try{if(String(to).endsWith('.json'))j=JSON.parse(await fs.readFile(from,'utf8'));}catch{}
  await rename(from,to);
  if(j&&(options.faultAt==='between-products'&&j.terminal || options.faultAt==='after-cancel-intent-before-dispatch'&&j.cancelIntent || options.faultAt==='after-request-count-before-fetch'&&j.requestCountUncertain&&j.intentAt&&j.requestCount===3))die();
}) as typeof fs.rename;
const put=ContentAddressedArtifactStore.prototype.put;
ContentAddressedArtifactStore.prototype.put=async function(bytes:Uint8Array){
  if(options.faultAt==='after-retention-before-finalization'){
    let v:any;try{v=JSON.parse(Buffer.from(bytes).toString());}catch{}
    if(v?.stepId==='COLLECTION'&&v.publicReviewAcquisition?.state==='FINAL')die();
  }
  return put.call(this,bytes);
};
const prepare=f.db.prepare.bind(f.db);
f.db.prepare=(sql:string)=>{
  const st=prepare(sql);
  if(options.faultAt==='before-base-checkpoint-commit'&&sql.includes('INSERT INTO analysis_research_automation_review_stages')) {
    const run=st.run.bind(st); st.run=(...args:any[])=>{run(...args);return die();};
  }
  return st;
};
if(options.faultAt==='job-running'||options.faultAt==='damaged-base-checkpoint')f.clock.sleep=async()=>die();
if(options.faultAt==='human-block-finalized') {
  for(const x of f.transport.exchanges)if(x.path.endsWith('/result'))(x.body as any).complete=false;
  for(const x of f.transport.exchanges)if((x.body as any)?.state==='succeeded')(x.body as any).state='needs_login';
  // Human terminal states have no post-result consistency request.
  f.transport.exchanges.splice(7,1);
  ContentAddressedArtifactStore.prototype.put=async function(bytes:Uint8Array){let v:any;try{v=JSON.parse(Buffer.from(bytes).toString());}catch{}if(v?.stepId==='COLLECTION'&&v.publicReviewAcquisition?.state==='FINAL')die();return put.call(this,bytes);};
}
if(options.faultAt==='after-cancel-intent-before-dispatch'||options.faultAt==='cancel-intent-finalized') {
  const controller=new AbortController();f.transport.exchanges[4]!.inspect=()=>controller.abort();
  await f.service.processNext(controller.signal);die();
}
await f.service.processNext();
throw new Error('Synthetic crash point not reached');
