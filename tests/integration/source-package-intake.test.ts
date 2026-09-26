import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { SourcePackageService, FoundationSourcePackageReader, FoundationValidationError } from '../../src/modules/foundation/index.js';
import { SourcePackageFieldAuditService, AnalysisValidationError } from '../../src/modules/analysis/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';
const roots:string[]=[];afterEach(async()=>Promise.all(roots.splice(0).map(root=>fsp.rm(root,{recursive:true,force:true}))));
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tdn-source-package-'));roots.push(root);const opened=openDatabase({databasePath:path.join(root,'db.sqlite'),now:()=>new Date('2026-10-01T00:00:00Z')});const store=new ContentAddressedArtifactStore(path.join(root,'artifacts'));const packages=new SourcePackageService({db:opened.db,artifactStore:store,now:()=>new Date('2026-10-01T01:00:00Z')});return{root,db:opened.db,store,packages};}
function fixture(){const html=Buffer.from('<b>Calcium 0 mg</b>\n'),json=Buffer.from('{"calcium":"12.50"}\n');return{html,json,input:{contractVersion:'1.0.0',packageKey:'metric:synthetic-calcium',version:1,sourceAcquiredAt:null,sourceLabel:'Synthetic Metric export',files:[{path:'metric/page.html',sha256:digest(html),byteSize:html.length,mediaType:'text/html',evidenceFamily:'metric-export',representationRole:'primary',independence:'independent',providerProvenance:'synthetic',provenanceBasis:'generated fixture',period:{start:'2026-09-01T00:00:00Z',end:'2026-09-30T00:00:00Z'}},{path:'metric/data.json',sha256:digest(json),byteSize:json.length,mediaType:'application/json',evidenceFamily:'metric-export',representationRole:'structured',independence:'non_independent',providerProvenance:'provider_reported',provenanceBasis:'synthetic provider export fixture',period:{start:'2026-08-01T00:00:00Z',end:'2026-08-31T00:00:00Z'}}]}} as const;}
test('0012 applies without changing prior migration bytes and immutable exact-byte package replay/idempotency works',async()=>{const expected=['cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb','b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46','a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec','0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d','e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592','241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88','18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b','285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848','f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439','4c2b348adb776e12bf011f90b46d6e12cd17798fc3374ffe399a3ffa67ffaebb','c09dbf2e8bd8ee4046565cb6bbbd417c9c7ff3e93c25f79eff60299b58395a65'];const prior=(await fsp.readdir('migrations')).filter(x=>/^00(?:0[1-9]|1[01])_/.test(x)).sort();assert.equal(prior.length,11);assert.deepEqual(prior.map(x=>digest(fs.readFileSync(path.join('migrations',x)))),expected);const state=setup();assert.equal(state.db.pragma('user_version',{simple:true}),24n);const f=fixture();const first=await state.packages.intake(f.input,new Map([['metric/page.html',f.html],['metric/data.json',f.json]]));assert.equal(first.deduplicated,false);assert.ok(first.databaseMutations>0);const replay=await state.packages.readVerified(first.packageId);assert.deepEqual(replay.files.map(x=>x.bytes),[f.json,f.html]);assert.equal(replay.manifest.files[0]!.evidenceFamily,'metric-export');assert.equal(replay.manifest.files[0]!.independence,'non_independent');const retry=await state.packages.intake(f.input,[{path:'metric/page.html',bytes:f.html},{path:'metric/data.json',bytes:f.json}]);assert.equal(retry.deduplicated,true);assert.equal(retry.databaseMutations,0);assert.throws(()=>state.db.prepare('UPDATE foundation_source_packages SET source_label=?').run('drift'),/immutable_source_package/);state.db.close();});
test('checksum, missing and extra fail before database writes',async()=>{for(const kind of ['checksum','missing','extra'] as const){const state=setup(),f=fixture();const supplied=new Map<string,Uint8Array>([['metric/page.html',kind==='checksum'?Buffer.from('bad'):f.html],...kind==='missing'?[]:[['metric/data.json',f.json] as [string,Buffer]],...kind==='extra'?[['extra.txt',Buffer.from('x')] as [string,Buffer]]:[]]);await assert.rejects(state.packages.intake(f.input,supplied),FoundationValidationError);assert.equal((state.db.prepare('SELECT count(*) n FROM foundation_source_packages').get() as any).n,0n);assert.equal((state.db.prepare('SELECT count(*) n FROM artifact_manifests').get() as any).n,0n);state.db.close();}});
test('field states, locators, conflicts, boundaries and immutable digest replay',async()=>{const state=setup(),f=fixture();const intake=await state.packages.intake(f.input,new Map([['metric/page.html',f.html],['metric/data.json',f.json]]));const service=new SourcePackageFieldAuditService({db:state.db,artifactStore:state.store,sourcePackages:new FoundationSourcePackageReader(state.packages),now:()=>new Date('2026-10-01T02:00:00Z')});const request={contractVersion:'1.0.0',packageKey:f.input.packageKey,version:1,observations:[{observationKey:'calcium-html',field:'calcium',state:'observed_zero',value:'0',unit:'mg',precision:'display_rounded',evidenceFamily:'metric-export',representationPath:'metric/page.html',representationSha256:digest(f.html),locator:{type:'html_text',text:'Calcium 0 mg'},notes:''},{observationKey:'calcium-json',field:'calcium',state:'observed_value',value:'12.50',unit:'mg',precision:'exact',evidenceFamily:'metric-export',representationPath:'metric/data.json',representationSha256:digest(f.json),locator:{type:'json_pointer',pointer:'/calcium'},notes:''},{observationKey:'vitamin-d',field:'vitamin_d',state:'missing',value:null,unit:null,precision:'unknown',evidenceFamily:'metric-export',representationPath:'metric/page.html',representationSha256:digest(f.html),locator:{type:'html_text',text:'nutrition panel'},notes:'not shown'}],conflicts:[{type:'representation_mismatch',observationKeys:['calcium-html','calcium-json'],resolution:'unresolved',notes:'synthetic mismatch'}],periodComparisons:[{leftObservationKey:'calcium-html',rightObservationKey:'calcium-json',compatibility:'incompatible',claim:null,notes:'different periods'}]};const execution=await service.audit(request);const replay=await service.readByDigest(execution.resultArtifactSha256);assert.equal(replay.result.observations[0]!.state,'observed_zero');assert.equal(replay.result.conflicts[0]!.resolution,'unresolved');assert.equal((await service.replay(execution.resultId)).resultArtifactSha256,execution.resultArtifactSha256);assert.throws(()=>state.db.prepare('DELETE FROM analysis_source_package_field_audit_results').run(),/immutable_source_package_field_audit/);await assert.rejects(service.audit({...request,observations:[{...request.observations[0],state:'missing',value:'0'}]}),AnalysisValidationError);void intake;state.db.close();});


test('later package versions safely reuse raw artifacts acquired at the first finalization time',async()=>{
  const state=setup(),f=fixture();
  const finalizedAtA='2026-10-01T01:00:00.000Z',finalizedAtB='2026-10-02T01:00:00.000Z';
  const supplied=new Map([['metric/page.html',f.html],['metric/data.json',f.json]]);
  const v1=await state.packages.intake(f.input,supplied);
  const packagesAtB=new SourcePackageService({db:state.db,artifactStore:state.store,now:()=>new Date(finalizedAtB)});
  const inputV2={...f.input,version:2} as const;
  const v2=await packagesAtB.intake(inputV2,supplied);

  assert.notEqual(v2.packageId,v1.packageId);
  assert.notEqual(v2.manifestArtifactSha256,v1.manifestArtifactSha256);
  const manifestV1Bytes=await state.store.read(v1.manifestArtifactSha256);
  const manifestV2Bytes=await state.store.read(v2.manifestArtifactSha256);
  assert.notDeepEqual(manifestV2Bytes,manifestV1Bytes);
  assert.equal(digest(manifestV1Bytes),v1.manifestArtifactSha256);
  assert.equal(digest(manifestV2Bytes),v2.manifestArtifactSha256);

  const replayV2=await packagesAtB.readVerified(v2.packageId);
  assert.equal(replayV2.manifest.version,2);
  assert.deepEqual(replayV2.files.map(file=>file.bytes),[f.json,f.html]);
  const packageTimes=state.db.prepare('SELECT version,finalized_at AS finalizedAt FROM foundation_source_packages ORDER BY version').all() as {version:bigint;finalizedAt:string}[];
  assert.deepEqual(packageTimes,[{version:1n,finalizedAt:finalizedAtA},{version:2n,finalizedAt:finalizedAtB}]);
  const sharedRawArtifact=state.db.prepare('SELECT count(*) AS rowCount,min(acquired_at) AS acquiredAt FROM artifact_manifests WHERE sha256=?').get(digest(f.html)) as {rowCount:bigint;acquiredAt:string};
  assert.deepEqual(sharedRawArtifact,{rowCount:1n,acquiredAt:finalizedAtA});

  const retry=await packagesAtB.intake(inputV2,[{path:'metric/page.html',bytes:f.html},{path:'metric/data.json',bytes:f.json}]);
  assert.deepEqual(retry,{...v2,deduplicated:true,databaseMutations:0});
  assert.equal((state.db.prepare('SELECT count(*) AS count FROM foundation_source_packages').get() as {count:bigint}).count,2n);
  assert.equal((state.db.prepare('SELECT count(*) AS count FROM artifact_manifests').get() as {count:bigint}).count,4n);
  state.db.close();
});
