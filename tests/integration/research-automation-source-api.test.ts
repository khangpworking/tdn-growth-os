import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import BetterSqlite3 from 'better-sqlite3';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService } from '../../src/modules/flow/index.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { keywordDraftConfiguration } from '../../src/modules/analysis/research-automation/keyword-cliproxy-transport.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { JSDOM } from 'jsdom';
const workspaceId='11111111-1111-4111-8111-111111111111';
const token='synthetic-owner-token-0-not-a-live-credential';
const config=keywordDraftConfiguration('synthetic-keyword-model');
for(const enabled of [false,true]) test(`real API composition freezes source version and ${enabled?'uses independently configured fake model':'withholds web evidence when no model is configured'}`,async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'tdn-source-api-'));const databasePath=path.join(root,'test.sqlite');const artifactRoot=path.join(root,'artifacts');
  const db=openDatabase({databasePath}).db;const artifacts=new ContentAddressedArtifactStore(artifactRoot);
  await new DiscoveryWorkspaceService({db,artifactStore:artifacts,uuid:()=>workspaceId}).createWorkspace({contractVersion:'1.0.0',workspaceKey:'source-api',title:'Synthetic source API'});db.close();
  const requests:Record<string,unknown>[]=[];
  const originalFetch=globalThis.fetch;
  t.mock.method(globalThis,'fetch',async (url:string|URL|Request,options?:RequestInit)=>{
    if(String(url)==='http://127.0.0.1:9876/v1/chat/completions'){
      requests.push(JSON.parse(options!.body as string));
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({keywords:['thạch dừa'],exclusions:[{term:'thạch dứa',reason:'Khác sản phẩm'}]})}}]}),{status:200});
    }
    return originalFetch(url,options);
  });
  const transport:ProviderTransport={sleep:async()=>{},now:()=>Date.parse('2026-10-02T00:00:00Z'),fetch:(async(url:string|URL|Request,options?:RequestInit)=>{
    const endpoint=new URL(String(url));let data:unknown;
    if(endpoint.pathname.endsWith('/credit/balance'))data={success:true,data:{totalRemain:100}};
    else if(endpoint.pathname.endsWith('/product/rank'))data={success:true,data:[{product_id:'12345',product_name:'Thạch dừa tên nguồn',unit_price:10000}]};
    else if(endpoint.pathname.endsWith('/product/detail'))data={success:true,data:{product_id:JSON.parse(options!.body as string).product_id,product_region:'VN',product_name:'Thạch dừa tên nguồn',product_description:[],
      revenue:10,sales_volumn:2,unit_price:10000,min_price:10000,max_price:10000,video_revenue:6,live_revenue:4,shopping_mall_revenue:0}};
    else {assert.equal(endpoint.hostname,'serpapi.com');data={organic_results:[{position:1,title:'Thạch dừa được giữ',link:'https://example.test/keep'},{position:2,title:'Thạch dừa và thạch dứa',link:'https://example.test/drop'}]};}
    return new Response(JSON.stringify(data),{status:200});
  }) as typeof fetch};
  const server=http.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let app: ReturnType<typeof openResearchAutomationApi> | undefined;
  t.after(async()=>{if(app) await app.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(root,{recursive:true,force:true});});
  app=openResearchAutomationApi({databasePath,artifactRoot,origin,providers:{kalodataSecretKey:'synthetic-sales-key',serpApiKey:'synthetic-web-key',apifyTokenConfigured:false},
    owner:{databasePath,artifactRoot,writeEnabled:true,token,actorId:'synthetic-owner',allowedOrigin:origin},
    ...(enabled?{keywordDrafting:{cliproxy:{baseUrl:'http://127.0.0.1:9876',apiKey:'synthetic-gateway-key'},configuration:config}}:{})},transport);
  server.on('request',app.handler);

  const post=async(url:string,body:unknown)=>{const response=await originalFetch(origin+url,{method:'POST',headers:{Origin:origin,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,202,await response.clone().text());return response.json() as Promise<any>;};
  const start=await post(`/owner-api/workspaces/${workspaceId}/research-automation/runs`,{contractVersion:'research-automation-start-v1',requestKey:randomUUID(),mode:'CATEGORY',keyword:'thạch dừa',requestedPeriod:{startDate:'2026-09-01',endDate:'2026-09-30'},reports:['MARKET']});
  const runId=start.run.runId as string;
  const wait=async(status:string)=>{for(let n=0;n<100;n++){const response=await originalFetch(`${origin}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`);assert.equal(response.status,200);const result=await response.json() as any;if(result.status===status)return result;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(`run did not reach ${status}`);};
  const awaiting=await wait('AWAITING_SCOPE');assert.equal(awaiting.productCards.length,1);
  await post(`/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/confirm-scope`,{contractVersion:'research-automation-confirm-v1',requestKey:randomUUID(),expectedRevision:awaiting.revision,definition:'Synthetic frozen scope',includeTerms:['thạch dừa'],excludeTerms:['thạch dứa'],selectedProductIds:[awaiting.productCards[0].productId],peerProductIds:[],exactShopeeUrls:[]});
  await wait('DRAFT_READY');
  const stored=new BetterSqlite3(databasePath,{readonly:true});t.after(()=>stored.close());
  const row=stored.prepare('SELECT start_request_sha256 startSha FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as {startSha:string};
  assert.equal(JSON.parse((await artifacts.read(row.startSha)).toString()).sourceEvidenceVersion,'automation-source-evidence-v1');
  const report=await originalFetch(`${origin}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/reports/market`);assert.equal(report.status,200);
  const html=await report.text();const dom=new JSDOM(html).window.document;assert.ok(dom.querySelector('.source-evidence'));
  assert.equal(dom.querySelectorAll('[aria-label="Kết quả tìm kiếm trên web đã lưu"] tbody tr').length,enabled?1:0);
  assert.equal(requests.length,enabled?1:0);
  if(enabled){assert.equal(requests[0]!.model,'synthetic-keyword-model');const output=stored.prepare('SELECT version_sha256 sha FROM analysis_research_automation_outputs WHERE run_id=?').get(runId) as {sha:string};
    const semantic=JSON.parse((await artifacts.read(output.sha)).toString());const draft=JSON.parse((await artifacts.read(semantic.sourceEvidence.draftDigest)).toString());
    assert.deepEqual(draft.model.configuration,config);assert.equal(draft.model.prompt,(requests[0]!.messages as {content:string}[])[0]!.content);
    assert.ok(draft.salesNameRefs.every((ref:{digest:string,locator:string})=>ref.digest.length===64&&ref.locator.includes('product_name')));
  }
  assert.equal(await (await originalFetch(`${origin}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/reports/market`)).text(),html);
});
