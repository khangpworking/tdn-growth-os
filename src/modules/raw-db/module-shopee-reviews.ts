import BetterSqlite3 from 'better-sqlite3';
import { stat } from 'node:fs/promises';
import { isAbsolute, basename } from 'node:path';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { assertReviewDataWritable, cachedReviewExport, discoverModuleReviewSources, readModuleReviewSource,
  readRunTracking, reviewDataReadonly, validateReviewData, type VerifiedModuleReviewCollection } from '../foundation/shopee-module-review-data.js';
import type { ReviewDataView, ReviewDataSource, ReviewDataSaved } from '../../../contracts/foundation/shopee-module-review-data.generated.js';
import { assertModuleImportable, loadModuleShopeeReviewsToDbV1, moduleImportReceipt, type ModuleProductName } from './shopee-reviews-loader.js';
import { hashFile, hashFolder, ModuleError, object, pickRaw, prerequisite, readJson } from '../../../scripts/module-pick.js';

function configuration(): {databasePath:string;artifactRoot:string} | null {
  const databasePath = process.env.TDN_WORKSPACE_DB, artifactRoot = process.env.TDN_ARTIFACT_ROOT;
  return databasePath && artifactRoot && isAbsolute(databasePath) && isAbsolute(artifactRoot) ? {databasePath,artifactRoot} : null;
}
function configuredDatabase(readonly: boolean): BetterSqlite3.Database {
  const config = configuration(); if (!config) throw new ModuleError('APP_DB_NOT_CONFIGURED');
  let db: BetterSqlite3.Database;
  try { db = new BetterSqlite3(config.databasePath,{readonly,fileMustExist:true}); }
  catch { throw new ModuleError('APP_DB_NOT_CONFIGURED'); }
  try {
    db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000'); db.defaultSafeIntegers(true);
    if (readonly) db.pragma('query_only = ON');
    for (const table of ['raw_capture','product','product_name_source','review','run_review','artifact_manifests','raw_db_module_review_import'])
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) throw new ModuleError('DB_SCHEMA_REQUIRED');
    return db;
  } catch(error) { db.close(); throw error; }
}
/** Exact current verified M1 can supply names only when it still belongs to this source's frozen M2. */
export async function moduleProductNames(run: string, source: VerifiedModuleReviewCollection): Promise<Map<string,ModuleProductName>> {
  const names = new Map<string,ModuleProductName>();
  let metricInputSha256: string, raw: unknown;
  try {
    if (await hashFile(run,'m2/selection.json') !== source.m2Digest) return names;
    const selection = object(await readJson(run,'m2/selection.json')), gate = object(await readJson(run,'gates/m2.json'));
    metricInputSha256 = await prerequisite(run,'m1');
    if (selection.source !== 'auto' || selection.metricInputSha256 !== metricInputSha256 || gate.verdict !== 'PASS' || gate.inputSha256 !== metricInputSha256 || gate.outputSha256 !== source.m2Digest) return names;
    raw = await pickRaw(run);
    if (await hashFolder(run,'m1') !== metricInputSha256) throw new ModuleError('REVIEW_SOURCE_CHANGED');
  } catch(error) { if (error instanceof ModuleError && error.code === 'REVIEW_SOURCE_CHANGED') throw error; return names; }
  const bytes = Buffer.from(canonicalJson({format:'module-metric-product-names-v1',metricInputSha256,m2Digest:source.m2Digest,raw}));
  const wanted = new Set(source.links.map(link=>`1__${link.itemId}__${link.shopId}`));
  const found = new Map<string,{name:string;path:string}>();
  const stack:{value:unknown;path:string}[] = [{value:raw,path:'$.raw'}];
  while (stack.length) {
    const {value,path} = stack.pop()!;
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) { value.forEach((value,i)=>stack.push({value,path:`${path}[${i}]`})); continue; }
    const record = value as Record<string,unknown>, id = record.product_base_id, name = record.product_name;
    if (typeof id === 'string' && wanted.has(id) && typeof name === 'string' && name.trim()) {
      const previous = found.get(id);
      if (previous && previous.name !== name.trim()) throw new ModuleError('PRODUCT_NAME_AMBIGUOUS');
      found.set(id,{name:name.trim(),path:`${path}.product_name`});
    }
    for (const [key,value] of Object.entries(record)) stack.push({value,path:`${path}[${JSON.stringify(key)}]`});
  }
  for (const [id,value] of found) names.set(id,{name:value.name,bytes,jsonPath:value.path});
  return names;
}
function blocked(error: unknown): {code:string} {
  return {code:error instanceof ModuleError ? error.code : 'REVIEW_DATA_UNAVAILABLE'};
}
export async function reviewDataView(run: string): Promise<ReviewDataView> {
  const readonly = await reviewDataReadonly(), config = configuration();
  let db: BetterSqlite3.Database | undefined, databaseError: {code:string}|null = null;
  try {
    if (!config || !(await stat(config.artifactRoot)).isDirectory()) throw new ModuleError('APP_DB_NOT_CONFIGURED');
    db = configuredDatabase(true);
  } catch(error) { databaseError = error instanceof ModuleError ? blocked(error) : {code:'APP_DB_NOT_CONFIGURED'}; }
  try {
    const sources:ReviewDataSource[] = [];
    for (const source of await discoverModuleReviewSources(run)) {
      let importReceipt: ReviewDataSaved|null = null, dbBlockedBy = databaseError;
      if (db) try {
        importReceipt = moduleImportReceipt(db,source);
        if (!importReceipt) assertModuleImportable(db,source,await moduleProductNames(run,source));
      } catch(error) { dbBlockedBy = blocked(error); }
      if (readonly) dbBlockedBy ??= {code:'READONLY_ON'};
      const exportFormats = {} as ReviewDataSource['exportFormats'];
      for (const format of ['json','txt'] as const) {
        try { const receipt = await cachedReviewExport(run,source,format); exportFormats[format] = {canExport:receipt!==null||!readonly,blockedBy:receipt===null&&readonly?{code:'READONLY_ON'}:null,receipt}; }
        catch(error) { exportFormats[format]={canExport:false,blockedBy:blocked(error),receipt:null}; }
      }
      const canExport = exportFormats.json.canExport || exportFormats.txt.canExport;
      sources.push({sourceSha256:source.sourceSha256,kind:source.kind,attemptId:source.attemptId,planSha256:source.planSha256,status:source.status,
        gateVerdict:source.gateVerdict,completedAt:source.completedAt,rowBasis:source.rowBasis,rowCount:source.rows.length,links:source.links,
        canExport,exportBlockedBy:canExport?null:exportFormats.json.blockedBy,exportFormats,canSaveDb:dbBlockedBy===null,dbBlockedBy,importReceipt});
    }
    return validateReviewData<ReviewDataView>('view',{format:'review-data-view-v1',runId:basename(run),readonly,tracking:await readRunTracking(run),
      db:{configured:config!==null,schemaReady:db!==undefined,blockedBy:databaseError},sources});
  } finally { db?.close(); }
}
export async function saveModuleReviewData(run:string,sourceSha256:string):Promise<ReviewDataSaved> {
  await assertReviewDataWritable();
  const source = await readModuleReviewSource(run,sourceSha256), config = configuration();
  if (!config) throw new ModuleError('APP_DB_NOT_CONFIGURED');
  try { if (!(await stat(config.artifactRoot)).isDirectory()) throw new ModuleError('APP_DB_NOT_CONFIGURED'); }
  catch { throw new ModuleError('APP_DB_NOT_CONFIGURED'); }
  const db = configuredDatabase(false);
  try {
    const existing = moduleImportReceipt(db,source); if (existing) return existing;
    const names = await moduleProductNames(run,source); await assertReviewDataWritable();
    return await loadModuleShopeeReviewsToDbV1(db,new ContentAddressedArtifactStore(config.artifactRoot),source,names);
  } finally { db.close(); }
}
