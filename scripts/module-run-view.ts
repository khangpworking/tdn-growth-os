/**
 * One node process for the per-run read view: the same functions the single commands call, with one
 * verified-source discovery shared by every part. Each part is streamed as one JSON line as soon as
 * it is done, so a slow or failing part never discards the parts already received. Output
 * verification runs in this process under its own 30 s bound.
 */
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleError } from './module-pick.js';
import { ReviewSamplingError } from '../src/modules/foundation/shopee-review-sampling.js';
import { discoverModuleReviewSources } from '../src/modules/foundation/shopee-module-review-data.js';
import { reviewDataView } from '../src/modules/raw-db/module-shopee-reviews.js';
import { reviewProcessSettings, reviewProcessView } from '../src/modules/raw-db/module-review-process.js';
import { moduleOutputs } from './module-metric-output.js';
import { reviewSamplingView } from './module-review-sampling.js';
import { reviewInsightsSummaryView, reviewStatsView } from './module-review-data.js';

type PartError = { code:string; message:string; exitCode:number };
export type RunViewLine = { part:string; ok:true; value:unknown } |
  { part:string; ok:false; error:{ code:string; message:string }; exitCode:number };
const OUTPUT_TIMEOUT = 30_000;
const failure = (error:unknown, fallback:string, defaultExit:number):PartError => {
  const code = error instanceof ModuleError || error instanceof ReviewSamplingError ? error.code : fallback;
  return { code, message:code, exitCode:error instanceof ModuleError ? error.exitCode : defaultExit };
};
/** The abandoned work may settle after its bound; a no-op handler keeps that from crashing the run. */
export async function boundedPart<T>(work:Promise<T>, code:string, ms = OUTPUT_TIMEOUT):Promise<T> {
  work.catch(() => {});
  let timer:NodeJS.Timeout|undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ModuleError(code, 20)), ms);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function reviewRunView(runArg:string, result:boolean, emit:(line:RunViewLine) => void = () => {}) {
  const run = resolve(runArg);
  const parts:Record<string,unknown> = {}, errors:Record<string,PartError> = {};
  let discovered:ReturnType<typeof discoverModuleReviewSources>|null = null;
  const sources = () => (discovered ??= discoverModuleReviewSources(run));
  const capture = async (name:string, fallback:string, defaultExit:number, compute:()=>Promise<unknown>|unknown) => {
    try {
      const value = await compute();
      parts[name] = value;
      emit({ part:name, ok:true, value });
    } catch (error) {
      const failed = failure(error, fallback, defaultExit);
      errors[name] = failed;
      emit({ part:name, ok:false, error:{ code:failed.code, message:failed.message }, exitCode:failed.exitCode });
    }
  };
  await capture('sampling','REVIEW_INPUT_INVALID',2,() => reviewSamplingView(run));
  await capture('reviewData','REVIEW_DATA_FAILED',20,async () => reviewDataView(run, await sources()));
  await capture('process','REVIEW_DATA_FAILED',20,async () =>
    reviewProcessView(run, await reviewProcessSettings(), await sources()));
  if (result) {
    await capture('stats','REVIEW_DATA_FAILED',20,async () => reviewStatsView(run, await sources()));
    await capture('insights','REVIEW_DATA_FAILED',20,async () => reviewInsightsSummaryView(run, await sources()));
  }
  await capture('outputs','MODULE_OUTPUT_INVALID',20,() => boundedPart(moduleOutputs(run), 'MODULE_OUTPUT_TIMEOUT'));
  return { format:'review-run-view-node-v1', runId:basename(run), parts, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [runArg, ...flags] = process.argv.slice(2);
  const unknown = flags.filter(flag => flag !== '--result');
  const write = (line:RunViewLine) => { process.stdout.write(`${JSON.stringify(line)}\n`); };
  void (!runArg || unknown.length
    ? Promise.reject(new ModuleError('USAGE', 2))
    : reviewRunView(runArg, flags.includes('--result'), write))
    .catch(error => {
      const code = error instanceof ModuleError ? error.code : 'REVIEW_VIEW_FAILED';
      process.stdout.write(`${JSON.stringify({ format:'error-v1', code, message:code })}\n`);
      process.exitCode = error instanceof ModuleError ? error.exitCode : 20;
    });
}
