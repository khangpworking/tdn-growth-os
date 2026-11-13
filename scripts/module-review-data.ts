import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleError, validateModuleValue } from './module-pick.js';
import { discoverModuleReviewSources, prepareReviewExport, readReviewExportBytes, validateReviewData, type ModuleReviewRow } from '../src/modules/foundation/shopee-module-review-data.js';
import { reviewDataView, saveModuleReviewData } from '../src/modules/raw-db/module-shopee-reviews.js';
import type { ReviewDataSaveInput, ReviewDataExportInput } from '../contracts/foundation/shopee-module-review-data.generated.js';

async function input():Promise<unknown> {
  const chunks:Buffer[]=[];let size=0;
  for await (const chunk of process.stdin) {const bytes=Buffer.from(chunk);size+=bytes.length;if(size>65536)throw new ModuleError('REVIEW_DATA_INVALID',2);chunks.push(bytes);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
/** Numbers only: no comment text, user name or user id is copied out of a row. */
function reviewNumbers(rows:ModuleReviewRow[]) {
  const stars=[1,2,3,4,5].map(star=>rows.filter(row=>row.ratingStar===star).length), rated=stars.reduce((a,b)=>a+b,0);
  const times=rows.flatMap(row=>typeof row.createdAt==='string'&&Number.isFinite(Date.parse(row.createdAt))?[row.createdAt]:[])
    .sort((a,b)=>Date.parse(a)-Date.parse(b));
  return {commentCount:rows.length,averageStar:rated?stars.reduce((sum,count,i)=>sum+count*(i+1),0)/rated:null,
    starCounts:{'1':stars[0]!,'2':stars[1]!,'3':stars[2]!,'4':stars[3]!,'5':stars[4]!},
    firstCommentAt:times[0]??null,lastCommentAt:times.at(-1)??null};
}
/** Comment numbers per verified step-3 result (the same sources step 3 offers), for all links and per link. */
export async function reviewStatsView(run:string):Promise<unknown> {
  const sources=(await discoverModuleReviewSources(run)).map(source=>({sourceSha256:source.sourceSha256,kind:source.kind,
    status:source.status,completedAt:source.completedAt,all:reviewNumbers(source.rows),
    links:source.links.map(link=>({shopId:link.shopId,itemId:link.itemId,url:link.url,
      ...reviewNumbers(source.rows.filter(row=>row.shopId===link.shopId&&row.itemId===link.itemId))}))}));
  const view={format:'review-stats-v1',runId:basename(run),sources};
  await validateModuleValue('review-stats-v1',view);
  return view;
}
export async function reviewDataCommand(args:string[]):Promise<unknown> {
  const [action,runArg,...extra]=args;if(!runArg)throw new ModuleError('USAGE',2);const run=resolve(runArg);
  if(action==='view'&&!extra.length)return reviewDataView(run);
  if(action==='stats'&&!extra.length)return reviewStatsView(run);
  if(action==='save'&&!extra.length){const value=validateReviewData<ReviewDataSaveInput>('saveInput',await input());return saveModuleReviewData(run,value.sourceSha256);}
  if(action==='export'&&!extra.length){const value=validateReviewData<ReviewDataExportInput>('exportInput',await input());return prepareReviewExport(run,value.sourceSha256,value.format);}
  if(action==='read'&&extra.length===1)return readReviewExportBytes(run,extra[0]!);
  throw new ModuleError('USAGE',2);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const binary=process.argv[2]==='read';
  void reviewDataCommand(process.argv.slice(2)).then(value=>{
    if(binary&&Buffer.isBuffer(value))process.stdout.write(value);
    else process.stdout.write(JSON.stringify(value)+'\n');
  }).catch(error=>{
    const code=error instanceof ModuleError?error.code:'REVIEW_DATA_FAILED';
    if(binary)process.stderr.write(code+'\n');
    else process.stdout.write(JSON.stringify({format:'error-v1',code,message:code})+'\n');
    process.exitCode=error instanceof ModuleError?error.exitCode:20;
  });
}
