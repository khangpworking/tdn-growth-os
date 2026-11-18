/**
 * One node process for the per-run read view: the same functions the single commands call, with one
 * verified-source discovery shared by every part. A failing part reports {code,message} and never
 * stops the others.
 */
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModuleError } from './module-pick.js';
import { ReviewSamplingError } from '../src/modules/foundation/shopee-review-sampling.js';
import { discoverModuleReviewSources } from '../src/modules/foundation/shopee-module-review-data.js';
import { reviewDataView } from '../src/modules/raw-db/module-shopee-reviews.js';
import { reviewProcessSettings, reviewProcessView } from '../src/modules/raw-db/module-review-process.js';
import { reviewSamplingView } from './module-review-sampling.js';
import { moduleOutputs } from './module-metric-output.js';
import { reviewInsightsSummaryView, reviewStatsView } from './module-review-data.js';
import { ProductPickError } from './module-product-pick.js';

type PartError = { code:string; message:string };
const failure = (error:unknown, fallback:string, productPick = false):PartError => {
  const code = error instanceof ModuleError || error instanceof ReviewSamplingError ? error.code
    : productPick && error instanceof ProductPickError ? error.message : fallback;
  return { code, message:code };
};

export async function reviewRunView(runArg:string, result:boolean) {
  const run = resolve(runArg);
  const parts:Record<string,unknown> = {}, errors:Record<string,PartError> = {};
  let discovered:ReturnType<typeof discoverModuleReviewSources>|null = null;
  const sources = () => (discovered ??= discoverModuleReviewSources(run));
  const capture = async (name:string, fallback:string, productPick:boolean, compute:()=>Promise<unknown>|unknown) => {
    try { parts[name] = await compute(); }
    catch (error) { errors[name] = failure(error, fallback, productPick); }
  };
  await capture('sampling','REVIEW_INPUT_INVALID',false,() => reviewSamplingView(run));
  await capture('reviewData','REVIEW_DATA_FAILED',false,async () => reviewDataView(run, await sources()));
  await capture('outputs','MODULE_OUTPUT_INVALID',true,() => moduleOutputs(run));
  await capture('process','REVIEW_DATA_FAILED',false,async () =>
    reviewProcessView(run, await reviewProcessSettings(), await sources()));
  if (result) {
    await capture('stats','REVIEW_DATA_FAILED',false,async () => reviewStatsView(run, await sources()));
    await capture('insights','REVIEW_DATA_FAILED',false,async () => reviewInsightsSummaryView(run, await sources()));
  }
  return { format:'review-run-view-node-v1', runId:basename(run), parts, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [runArg, ...flags] = process.argv.slice(2);
  const unknown = flags.filter(flag => flag !== '--result');
  void (!runArg || unknown.length
    ? Promise.reject(new ModuleError('USAGE', 2))
    : reviewRunView(runArg, flags.includes('--result')))
    .then(value => { process.stdout.write(`${JSON.stringify(value)}\n`); })
    .catch(error => {
      const code = error instanceof ModuleError ? error.code : 'REVIEW_VIEW_FAILED';
      process.stdout.write(`${JSON.stringify({ format:'error-v1', code, message:code })}\n`);
      process.exitCode = error instanceof ModuleError ? error.exitCode : 20;
    });
}
