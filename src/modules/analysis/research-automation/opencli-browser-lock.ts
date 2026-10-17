// One shared in-process lock for every lane that drives the local browser CLI
// (Metric capture and the Meta ad library auto-read). A promise chain whose
// links never reject, so a failed holder never blocks the next one.

let browserChain: Promise<void> = Promise.resolve();

async function waitTurn(previous: Promise<void>, signal?: AbortSignal): Promise<boolean> {
  if (!signal) { await previous; return true; }
  if (signal.aborted) return false;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<boolean>(resolve => { onAbort = () => resolve(false); signal.addEventListener('abort', onAbort, { once: true }); });
  try { return await Promise.race([previous.then(() => true), aborted]); }
  finally { if (onAbort) signal.removeEventListener('abort', onAbort); }
}

/** Runs `work` once every earlier holder has released; `onAbort` when the signal fires while waiting. */
export async function withOpenCliBrowserLock<T>(signal: AbortSignal | undefined, work: () => Promise<T>, onAbort: () => T): Promise<T> {
  const previous = browserChain;
  let release!: () => void;
  const mine = new Promise<void>(resolve => { release = resolve; });
  browserChain = previous.then(() => mine);
  try {
    if (!(await waitTurn(previous, signal))) return onAbort();
    return await work();
  } finally {
    release();
  }
}
