/**
 * One node process for the per-run read view: the same functions the single commands call, with one
 * verified-source discovery shared by every part. Every part starts at once and each streams one
 * JSON line as soon as it settles, so a slow part never discards the others. The Python reader owns
 * the `outputs` bound, counted from this process's launch as its single command counts it; the race
 * kept here on the same 30 s is only a backstop, so a stalled read never outlives the reader.
 */
import './lazy-validators-on.js';
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
async function bounded<T>(work:Promise<T>, code:string):Promise<T> {
  work.catch(() => {});
  let timer:NodeJS.Timeout|undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ModuleError(code, 20)), OUTPUT_TIMEOUT);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function reviewRunView(runArg:string, result:boolean, emit:(line:RunViewLine) => void = () => {}, points = false) {
  const run = resolve(runArg);
  const parts:Record<string,unknown> = {}, errors:Record<string,PartError> = {};
  let discovered:ReturnType<typeof discoverModuleReviewSources>|null = null;
  const sources = () => (discovered ??= discoverModuleReviewSources(run));
  const pending:Promise<void>[] = [];
  // Each part starts now and emits its line the moment it settles; settle order is the line order.
  const start = (name:string, fallback:string, defaultExit:number, compute:()=>Promise<unknown>|unknown) => {
    pending.push((async () => {
      try {
        const value = await compute();
        parts[name] = value;
        emit({ part:name, ok:true, value });
      } catch (error) {
        const failed = failure(error, fallback, defaultExit);
        errors[name] = failed;
        emit({ part:name, ok:false, error:{ code:failed.code, message:failed.message }, exitCode:failed.exitCode });
      }
    })());
  };
  start('sampling','REVIEW_INPUT_INVALID',2,() => reviewSamplingView(run));
  start('reviewData','REVIEW_DATA_FAILED',20,async () => reviewDataView(run, await sources()));
  start('process','REVIEW_DATA_FAILED',20,async () =>
    reviewProcessView(run, await reviewProcessSettings(), await sources()));
  if (result) {
    start('stats','REVIEW_DATA_FAILED',20,async () => reviewStatsView(run, await sources()));
    start('insights','REVIEW_DATA_FAILED',20,async () => reviewInsightsSummaryView(run, await sources(), points));
  }
  start('outputs','MODULE_OUTPUT_INVALID',20,() => bounded(moduleOutputs(run), 'MODULE_OUTPUT_TIMEOUT'));
  await Promise.all(pending);
  return { format:'review-run-view-node-v1', runId:basename(run), parts, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [runArg, ...flags] = process.argv.slice(2);
  // --points (app 1.4.0): theme summaries carry their grouped points; only with --result, where insights are read.
  const unknown = flags.filter(flag => flag !== '--result' && !(flag === '--points' && flags.includes('--result')));
  let flushed:Promise<void> = Promise.resolve();
  const write = (line:unknown) => {
    flushed = flushed.then(() => new Promise<void>((resolveWrite, rejectWrite) => {
      process.stdout.write(`${JSON.stringify(line)}\n`, error => error ? rejectWrite(error) : resolveWrite());
    }));
  };
  void (async () => {
    try {
      if (!runArg || unknown.length) throw new ModuleError('USAGE', 2);
      await reviewRunView(runArg, flags.includes('--result'), write, flags.includes('--points'));
    } catch (error) {
      const code = error instanceof ModuleError ? error.code : 'REVIEW_VIEW_FAILED';
      process.exitCode = error instanceof ModuleError ? error.exitCode : 20;
      write({ format:'error-v1', code, message:code });
    }
    // An abandoned part read (a stalled outputs file) can keep the event loop alive after every line
    // is out; exit once the printed lines are flushed so the reader never waits for that read.
    await flushed.catch(() => {});
    process.exit(process.exitCode ?? 0);
  })();
}
