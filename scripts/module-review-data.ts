import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleError } from './module-pick.js';
import { prepareReviewExport, readReviewExportBytes, validateReviewData } from '../src/modules/foundation/shopee-module-review-data.js';
import { reviewDataView, saveModuleReviewData } from '../src/modules/raw-db/module-shopee-reviews.js';
import type { ReviewDataSaveInput, ReviewDataExportInput } from '../contracts/foundation/shopee-module-review-data.generated.js';

async function input():Promise<unknown> {
  const chunks:Buffer[]=[];let size=0;
  for await (const chunk of process.stdin) {const bytes=Buffer.from(chunk);size+=bytes.length;if(size>65536)throw new ModuleError('REVIEW_DATA_INVALID',2);chunks.push(bytes);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function reviewDataCommand(args:string[]):Promise<unknown> {
  const [action,runArg,...extra]=args;if(!runArg)throw new ModuleError('USAGE',2);const run=resolve(runArg);
  if(action==='view'&&!extra.length)return reviewDataView(run);
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
