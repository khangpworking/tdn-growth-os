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
import { ArtifactIntegrityError } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { openDatabase } from '../../src/platform/db/index.js';
const roots:string[]=[];afterEach(async()=>Promise.all(roots.splice(0).map(root=>fsp.rm(root,{recursive:true,force:true}))));
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'tdn-source-package-'));roots.push(root);const opened=openDatabase({databasePath:path.join(root,'db.sqlite'),now:()=>new Date('2026-10-01T00:00:00Z')});const store=new ContentAddressedArtifactStore(path.join(root,'artifacts'));const packages=new SourcePackageService({db:opened.db,artifactStore:store,now:()=>new Date('2026-10-01T01:00:00Z')});return{root,db:opened.db,store,packages};}
function fixture(){const html=Buffer.from('<b>Calcium 0 mg</b>\n'),json=Buffer.from('{"calcium":"12.50"}\n');return{html,json,input:{contractVersion:'1.0.0',packageKey:'metric:synthetic-calcium',version:1,sourceAcquiredAt:null,sourceLabel:'Synthetic Metric export',files:[{path:'metric/page.html',sha256:digest(html),byteSize:html.length,mediaType:'text/html',evidenceFamily:'metric-export',representationRole:'primary',independence:'independent',providerProvenance:'synthetic',provenanceBasis:'generated fixture',period:{start:'2026-09-01T00:00:00Z',end:'2026-09-30T00:00:00Z'}},{path:'metric/data.json',sha256:digest(json),byteSize:json.length,mediaType:'application/json',evidenceFamily:'metric-export',representationRole:'structured',independence:'non_independent',providerProvenance:'provider_reported',provenanceBasis:'synthetic provider export fixture',period:{start:'2026-08-01T00:00:00Z',end:'2026-08-31T00:00:00Z'}}]}} as const;}
test('0012 applies without changing prior migration bytes and immutable exact-byte package replay/idempotency works',async()=>{const expected=['cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb','b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46','a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec','0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d','e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592','241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88','18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b','285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848','f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439','4c2b348adb776e12bf011f90b46d6e12cd17798fc3374ffe399a3ffa67ffaebb','c09dbf2e8bd8ee4046565cb6bbbd417c9c7ff3e93c25f79eff60299b58395a65'];const prior=(await fsp.readdir('migrations')).filter(x=>/^00(?:0[1-9]|1[01])_/.test(x)).sort();assert.equal(prior.length,11);assert.deepEqual(prior.map(x=>digest(fs.readFileSync(path.join('migrations',x)))),expected);const state=setup();assert.equal(state.db.pragma('user_version',{simple:true}),49n);const f=fixture();const first=await state.packages.intake(f.input,new Map([['metric/page.html',f.html],['metric/data.json',f.json]]));assert.equal(first.deduplicated,false);assert.ok(first.databaseMutations>0);const replay=await state.packages.readVerified(first.packageId);assert.deepEqual(replay.files.map(x=>x.bytes),[f.json,f.html]);assert.equal(replay.manifest.files[0]!.evidenceFamily,'metric-export');assert.equal(replay.manifest.files[0]!.independence,'non_independent');const retry=await state.packages.intake(f.input,[{path:'metric/page.html',bytes:f.html},{path:'metric/data.json',bytes:f.json}]);assert.equal(retry.deduplicated,true);assert.equal(retry.databaseMutations,0);assert.throws(()=>state.db.prepare('UPDATE foundation_source_packages SET source_label=?').run('drift'),/immutable_source_package/);state.db.close();});
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

test('manual source inventory excludes marked attachments and internal methods before its cap, but keeps unmarked look-alikes and the ordinary-package limit', async () => {
  const state = setup();
  try {
    const data = fixture();
    const supplied = new Map([['metric/page.html', data.html], ['metric/data.json', data.json]]);
    const reader = new FoundationSourcePackageReader(state.packages);
    const ordinary = await state.packages.intake(data.input, supplied);
    const nearPrefix = await state.packages.intake({ ...data.input, packageKey: 'automation-methodology:ordinary' }, supplied);
    const embeddedName = await state.packages.intake({ ...data.input, packageKey: 'manual:automation-method-ordinary' }, supplied);
    const selectedPrefix = 'automation-upload:22222222-2222-4222-8222-222222222222-';
    // No durable attachment record marks this historical package; a run-attachment-like key is not provenance.
    const unmarked = await state.packages.intake({ ...data.input, packageKey: `${selectedPrefix}historical` }, supplied);
    const selectedA = await state.packages.intakeAutomationAttachment({ ...data.input, packageKey: `${selectedPrefix}a` }, supplied,
      digest(Buffer.from('selected attachment a')));
    const selectedB = await state.packages.intakeAutomationAttachment({ ...data.input, packageKey: `${selectedPrefix}b` }, supplied,
      digest(Buffer.from('selected attachment b')));
    const unrelatedMarked = await state.packages.intakeAutomationAttachment({ ...data.input,
      packageKey: 'automation-upload:33333333-3333-4333-8333-333333333333-unrelated' }, supplied,
    digest(Buffer.from('unrelated marked attachment')));
    await fsp.writeFile(state.store.pathForDigest(unrelatedMarked.manifestArtifactSha256), 'damaged unrelated marked attachment');
    const internal = [];
    const authored = [];
    const capPrefix = 'automation-upload:11111111-1111-4111-8111-000000000000-';
    for (let index = 0; index < 101; index += 1) {
      internal.push(await state.packages.intake({
        ...data.input,
        packageKey: `automation-method:11111111-1111-4111-8111-${String(index).padStart(12, '0')}-descriptive-v1`,
      }, supplied));
      authored.push(await state.packages.intakeAutomationAttachment({
        ...data.input, packageKey: `${capPrefix}${String(index).padStart(3, '0')}`,
      }, supplied, digest(Buffer.from(`synthetic-run-binding-${index}`))));
    }

    const selected = await reader.findAutomationAttachmentPackagesByKeyPrefix(selectedPrefix);
    assert.deepEqual(selected.map(item => [item.packageKey, item.packageId]), [[`${selectedPrefix}a`, selectedA.packageId], [`${selectedPrefix}b`, selectedB.packageId]]);
    assert.equal(selected.some(item => item.packageId === unmarked.packageId), false);
    assert.equal(selected.some(item => item.packageId === unrelatedMarked.packageId), false);
    await assert.rejects(reader.findAutomationAttachmentPackagesByKeyPrefix(capPrefix), (error: unknown) =>
      error instanceof FoundationValidationError && /enumeration limit/.test(error.message));
    await assert.rejects(reader.findAutomationAttachmentPackagesByKeyPrefix(''), FoundationValidationError);
    await assert.rejects(reader.findAutomationAttachmentPackagesByKeyPrefix('x'.repeat(161)), FoundationValidationError);

    const expectedIds = [ordinary.packageId, nearPrefix.packageId, embeddedName.packageId, unmarked.packageId].sort();
    const inventory = await reader.listFinalizedSourcePackages();
    assert.deepEqual(inventory.map(item => item.packageId), expectedIds);
    assert.equal(inventory.find(item => item.packageId === unmarked.packageId)!.sourceLabel, data.input.sourceLabel);
    assert.equal((await reader.readFinalizedSourcePackage(internal[0]!.packageId)).manifest.packageKey,
      'automation-method:11111111-1111-4111-8111-000000000000-descriptive-v1');

    // An internal bundle must never be read for manual selection; direct replay
    // still rejects the same damaged retained evidence.
    const internalManifestPath = state.store.pathForDigest(internal[0]!.manifestArtifactSha256);
    const internalManifest = await fsp.readFile(internalManifestPath);
    internalManifest[internalManifest.length - 1] = 32;
    await fsp.writeFile(internalManifestPath, internalManifest);
    assert.deepEqual((await reader.listFinalizedSourcePackages()).map(item => item.packageId), expectedIds);
    await assert.rejects(reader.readFinalizedSourcePackage(internal[0]!.packageId), ArtifactIntegrityError);
    await fsp.writeFile(state.store.pathForDigest(authored[0]!.manifestArtifactSha256), 'damaged authored attachment');
    assert.deepEqual((await reader.listFinalizedSourcePackages()).map(item => item.packageId), expectedIds);
    await assert.rejects(reader.readAutomationAttachmentOrigin(authored[0]!.packageId), ArtifactIntegrityError);

    const ordinarySourcePath = state.store.pathForDigest(digest(data.html));
    const damagedSource = Buffer.from(data.html);
    damagedSource[0] = 32;
    await fsp.writeFile(ordinarySourcePath, damagedSource);
    await assert.rejects(reader.listFinalizedSourcePackages(), ArtifactIntegrityError);
    await fsp.writeFile(ordinarySourcePath, data.html);

    for (let index = 4; index < 100; index += 1) {
      await state.packages.intake({ ...data.input, packageKey: `metric:inventory-${index}` }, supplied);
    }
    assert.equal((await reader.listFinalizedSourcePackages()).length, 100);
    await state.packages.intake({ ...data.input, packageKey: 'metric:inventory-overflow' }, supplied);
    await assert.rejects(reader.listFinalizedSourcePackages(), (error: unknown) =>
      error instanceof FoundationValidationError && /enumeration limit/.test(error.message));
  } finally {
    state.db.close();
  }
});

test('authored attachment origin is immutable exact-retry metadata, never inferred or added to an existing manual source', async () => {
  const state = setup();
  try {
    const data = fixture();
    const supplied = new Map([['metric/page.html', data.html], ['metric/data.json', data.json]]);
    const binding = digest(Buffer.from('Synthetic confirmed run and scope'));
    const request = { ...data.input, packageKey: 'source-upload:owned-origin' };
    const created = await state.packages.intakeAutomationAttachment(request, supplied, binding);
    const origin = await new FoundationSourcePackageReader(state.packages).readAutomationAttachmentOrigin(created.packageId);
    assert.deepEqual(origin, { packageId: created.packageId, originKind: 'AUTOMATION_ATTACHMENT', bindingSha256: binding,
      manifestArtifactSha256: created.manifestArtifactSha256, markedAt: '2026-10-01T01:00:00.000Z' });
    const before = state.db.prepare('SELECT total_changes() n').get();
    const later = new SourcePackageService({ db: state.db, artifactStore: state.store, now: () => new Date('2026-10-03T00:00:00Z') });
    assert.deepEqual(await later.intakeAutomationAttachment(request, supplied, binding), { ...created, deduplicated: true, databaseMutations: 0 });
    await assert.rejects(later.intakeAutomationAttachment(request, supplied, digest(Buffer.from('Different run'))), /Attachment origin differs/);
    assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), before);
    assert.deepEqual(await later.readAutomationAttachmentOrigin(created.packageId), origin);
    assert.throws(() => state.db.prepare('UPDATE foundation_source_attachment_origins SET binding_sha256=? WHERE package_id=?')
      .run(digest(Buffer.from('drift')), created.packageId), /immutable_source_attachment_origin/);
    assert.throws(() => state.db.prepare('DELETE FROM foundation_source_attachment_origins WHERE package_id=?').run(created.packageId), /immutable_source_attachment_origin/);

    const manual = await state.packages.intake(data.input, supplied);
    await assert.rejects(state.packages.intakeAutomationAttachment(data.input, supplied, binding), /Attachment origin differs/);
    assert.equal(await state.packages.readAutomationAttachmentOrigin(manual.packageId), undefined);
    assert.throws(() => state.db.prepare(`INSERT INTO foundation_source_attachment_origins VALUES (?,'AUTOMATION_ATTACHMENT',?,?,?)`)
      .run(manual.packageId, binding, manual.manifestArtifactSha256, '2026-10-03T00:00:00.000Z'), /source_attachment_origin_requires_original_intake/);
    assert.deepEqual((await state.packages.listFinalizedSourcePackages()).map(row => row.packageId), [manual.packageId]);
    await assert.rejects(state.packages.intakeAutomationAttachment({ ...request, packageKey: 'source-upload:invalid-origin' }, supplied, 'not-a-binding'), FoundationValidationError);
    assert.equal((state.db.prepare('SELECT count(*) n FROM foundation_source_attachment_origins').get() as { n: bigint }).n, 1n);
  } finally { state.db.close(); }
});

test('request-owned attachment retry re-stages only exact missing artifacts after commit', async () => {
  const state = setup();
  try {
    const data = fixture();
    const supplied = new Map([['metric/page.html', data.html], ['metric/data.json', data.json]]);
    const scoped = new RequestScopedArtifactStore(path.join(state.root, 'artifacts'));
    const packages = new SourcePackageService({ db: state.db, artifactStore: scoped, now: () => new Date('2026-10-01T01:00:00Z') });
    const request = { ...data.input, packageKey: 'source-upload:interrupted-publication' };
    const binding = digest(Buffer.from('confirmed run and scope'));

    // The database transaction commits, but the caller exits ownership before
    // publication. The staged files are discarded and canonical paths remain absent.
    const created = await scoped.withOwnership(() => packages.intakeAutomationAttachment(request, supplied, binding));
    for (const file of data.input.files) assert.equal(fs.existsSync(scoped.pathForDigest(file.sha256)), false);
    assert.equal(fs.existsSync(scoped.pathForDigest(created.manifestArtifactSha256)), false);
    const unrelated = await state.store.put(Buffer.from('unrelated canonical artifact'));
    const unrelatedBytes = await fsp.readFile(unrelated.absolutePath);
    const beforeRetry = (state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n;

    await assert.rejects(packages.intakeAutomationAttachment(request, supplied, binding), /No request-scoped artifact operation is active/);
    assert.equal(fs.existsSync(scoped.pathForDigest(created.manifestArtifactSha256)), false);
    assert.equal((state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n, beforeRetry);

    const replay = await scoped.withOwnership(async () => {
      const result = await packages.intakeAutomationAttachment(request, supplied, binding);
      await scoped.publishOwned();
      return result;
    });
    assert.deepEqual(replay, { ...created, deduplicated: true, databaseMutations: 0 });
    assert.equal((state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n, beforeRetry);
    assert.deepEqual(await fsp.readFile(unrelated.absolutePath), unrelatedBytes);
    for (const file of data.input.files) assert.equal(fs.existsSync(scoped.pathForDigest(file.sha256)), true);
    assert.equal(fs.existsSync(scoped.pathForDigest(created.manifestArtifactSha256)), true);

    // A later package can lose only its publication while sharing raw artifacts
    // acquired earlier. Recovery verifies, but must not re-date those artifacts.
    const later = new SourcePackageService({ db: state.db, artifactStore: scoped, now: () => new Date('2026-10-03T02:00:00.000Z') });
    const laterRequest = { ...request, packageKey: 'source-upload:later-interrupted-publication' };
    const laterCreated = await scoped.withOwnership(() => later.intakeAutomationAttachment(laterRequest, supplied, binding));
    assert.equal(fs.existsSync(scoped.pathForDigest(laterCreated.manifestArtifactSha256)), false);
    const beforeLaterRetry = state.db.prepare('SELECT total_changes() n').get();
    await scoped.withOwnership(async () => {
      assert.deepEqual(await later.intakeAutomationAttachment(laterRequest, supplied, binding), { ...laterCreated, deduplicated: true, databaseMutations: 0 });
      const verified = await later.readVerified(laterCreated.packageId);
      for (const sha of new Set([verified.manifestArtifactSha256, ...verified.files.map(file => file.sha256)])) await scoped.publishOwned(sha);
    });
    assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), beforeLaterRetry);
    for (const file of data.input.files) assert.equal((state.db.prepare('SELECT acquired_at FROM artifact_manifests WHERE sha256=?').get(file.sha256) as { acquired_at: string }).acquired_at,
      '2026-10-01T01:00:00.000Z');
    assert.equal((await later.readVerified(laterCreated.packageId)).manifest.finalizedAt, '2026-10-03T02:00:00.000Z');

    const damagedPath = scoped.pathForDigest(data.input.files[0]!.sha256);
    await fsp.writeFile(damagedPath, Buffer.from('canonical corruption'));
    const beforeCorruption = (state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n;
    await assert.rejects(scoped.withOwnership(() => packages.intakeAutomationAttachment(request, supplied, binding)), ArtifactIntegrityError);
    assert.equal((state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n, beforeCorruption);
    assert.deepEqual(await fsp.readFile(unrelated.absolutePath), unrelatedBytes);

    const beforeWrongRequest = (state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n;
    await assert.rejects(scoped.withOwnership(() => packages.intakeAutomationAttachment({ ...request, sourceLabel: 'wrong request' }, supplied, binding)), /byte drift/);
    assert.equal((state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n, beforeWrongRequest);

    state.db.prepare('UPDATE artifact_manifests SET media_type=? WHERE sha256=?').run('application/octet-stream', data.input.files[0]!.sha256);
    const beforeMetadataRetry = (state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n;
    await assert.rejects(scoped.withOwnership(() => packages.intakeAutomationAttachment(request, supplied, binding)), /Artifact manifest exact metadata conflict/);
    assert.equal((state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n, beforeMetadataRetry);
    assert.deepEqual(await fsp.readFile(unrelated.absolutePath), unrelatedBytes);
  } finally { state.db.close(); }
});

test('failed finalization rolls back authored origin and package registration together', async () => {
  const state = setup();
  try {
    const data = fixture();
    const supplied = new Map([['metric/page.html', data.html], ['metric/data.json', data.json]]);
    state.db.exec(`CREATE TRIGGER synthetic_finalization_failure BEFORE UPDATE OF finalized_at ON foundation_source_packages
      WHEN NEW.package_key='source-upload:fail-finalization' BEGIN SELECT RAISE(ABORT,'synthetic finalization failure'); END;`);
    await assert.rejects(state.packages.intakeAutomationAttachment({ ...data.input, packageKey: 'source-upload:fail-finalization' }, supplied,
      digest(Buffer.from('Synthetic failed request'))), /synthetic finalization failure/);
    for (const table of ['foundation_source_packages', 'foundation_source_attachment_origins', 'artifact_manifests'])
      assert.equal((state.db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: bigint }).n, 0n);
  } finally { state.db.close(); }
});
