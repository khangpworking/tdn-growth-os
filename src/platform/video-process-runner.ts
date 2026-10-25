// Video Factory process runner (ADR 0007, 055-Q7, 055-Q9).
// Copied from src/modules/analysis/research-automation/video-watch-media.ts:41-74 (minimalEnv,
// processSpawnOptions, createProcessRunner); research-automation code is unchanged. Checkpoint 1a
// adds a dedicated process group per child, group kill with reaping, and typed errors instead of
// a resolved timedOut flag. No retry anywhere (R-V10, R-V11).
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

export interface VideoProcessResult { readonly code: number | null; readonly stdout: string; readonly stderr: string }
/** Runs one executable with an argument list only (never a shell string); a time limit or abort fails only this call. */
export type VideoProcessRunner = (bin: string, args: readonly string[], options: { readonly timeoutMs: number; readonly maxBytes: number; readonly signal?: AbortSignal }) => Promise<VideoProcessResult>;

const OUTPUT_BYTES = 256 * 1024;

export type VideoProcessErrorCode = 'process_failed' | 'timeout' | 'aborted';

/** Typed failure of one outside call; safe to surface, carries no provider or machine detail. */
export class VideoProcessError extends Error {
  constructor(readonly code: VideoProcessErrorCode, message: string) {
    super(message);
    this.name = 'VideoProcessError';
  }
}

/** The per-call time limit was exceeded; the whole child group was killed and reaped first. */
export class VideoProcessTimeoutError extends VideoProcessError {
  constructor(readonly bin: string, readonly timeoutMs: number) {
    super('timeout', `${bin} exceeded its ${timeoutMs} ms time limit`);
    this.name = 'VideoProcessTimeoutError';
  }
}

/** The caller aborted the call (cancel or graceful close); the whole child group was killed and reaped first. */
export class VideoProcessAbortedError extends VideoProcessError {
  constructor(readonly bin: string) {
    super('aborted', `${bin} was aborted before it finished`);
    this.name = 'VideoProcessAbortedError';
  }
}

/** The executable could not be spawned. */
export class VideoProcessSpawnError extends VideoProcessError {
  constructor(readonly bin: string, cause: unknown) {
    super('process_failed', `${bin} could not be started`);
    this.name = 'VideoProcessSpawnError';
    this.cause = cause;
  }
}

/** Only what a process needs to start; no TDN_* value (and so no key) is ever passed on. */
function minimalEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL']) if (process.env[name] !== undefined) out[name] = process.env[name];
  return out;
}

/**
 * Spawn options for every tool: no shell, stdin ignored (ffmpeg/ffprobe otherwise read an inherited
 * stdin), minimal environment. `detached` puts each child in its own process group, so cancel and
 * timeout kill the whole group, never an unrelated process (055-Q9).
 */
export function processSpawnOptions(): SpawnOptions & { stdio: ['ignore', 'pipe', 'pipe'] } {
  return { shell: false, windowsHide: true, detached: true, env: minimalEnv(), stdio: ['ignore', 'pipe', 'pipe'] };
}

/** POSIX-only; on Windows (no process groups) this falls back to the direct child. */
function killGroup(child: ChildProcess): void {
  if (child.pid !== undefined) {
    try { process.kill(-child.pid, 'SIGKILL'); return; } catch { /* not a group leader on this platform, or already gone */ }
  }
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
}

/** A runner over `spawn` (injectable for tests): bounded output, own time limit, abort kills the child group. */
export function createVideoProcessRunner(spawnFn: typeof spawn = spawn): VideoProcessRunner {
  return (bin, args, options) => new Promise<VideoProcessResult>((resolve, reject) => {
    let stdout = '', stderr = '', settled = false, timedOut = false;
    let abortReason: VideoProcessError | undefined;
    const done = (result: VideoProcessResult | undefined, error: VideoProcessError | undefined): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve(result!);
    };
    const close = (code: number | null): void => {
      // The kill settles only through the exit event, so the group is always reaped before the caller continues.
      if (abortReason) return done(undefined, abortReason);
      if (timedOut) return done(undefined, new VideoProcessTimeoutError(bin, options.timeoutMs));
      done({ code, stdout: stdout.slice(0, OUTPUT_BYTES), stderr: stderr.slice(0, OUTPUT_BYTES) }, undefined);
    };
    const onAbort = (): void => {
      abortReason = new VideoProcessAbortedError(bin);
      killGroup(child);
    };
    const timer = setTimeout(() => { timedOut = true; killGroup(child); }, options.timeoutMs);
    if (options.signal?.aborted) return done(undefined, new VideoProcessAbortedError(bin));
    let child: ChildProcess;
    try { child = spawnFn(bin, [...args], processSpawnOptions()); }
    catch (error) { return done(undefined, new VideoProcessSpawnError(bin, error)); }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const take = (which: 'out' | 'err') => (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (which === 'out') { if (stdout.length < options.maxBytes) stdout += text; } else if (stderr.length < options.maxBytes) stderr += text;
    };
    child.stdout?.on('data', take('out'));
    child.stderr?.on('data', take('err'));
    child.on('error', error => done(undefined, new VideoProcessSpawnError(bin, error)));
    child.on('close', code => close(typeof code === 'number' ? code : null));
  });
}

export const defaultVideoProcessRunner: VideoProcessRunner = createVideoProcessRunner();

export type FakeVideoProcessOutcome = 'succeed' | 'fail' | 'timeout';
export interface FakeVideoProcessBehavior { readonly outcome: FakeVideoProcessOutcome; readonly delayMs: number }
export interface FakeVideoProcessCall { readonly bin: string; readonly args: readonly string[]; readonly timeoutMs: number; readonly signal: AbortSignal | undefined }
export interface FakeVideoProcessRunner {
  readonly runner: VideoProcessRunner;
  readonly calls: readonly FakeVideoProcessCall[];
  /** Each call waits `delayMs` or until aborted, then succeeds, fails, or times out. */
  behavior: FakeVideoProcessBehavior;
}

/** Test runner for T6/T7 (no real process, no network): waits for the given time or until aborted. */
export function createFakeVideoProcessRunner(behavior: FakeVideoProcessBehavior = { outcome: 'succeed', delayMs: 0 }): FakeVideoProcessRunner {
  const calls: FakeVideoProcessCall[] = [];
  let current = behavior;
  const runner: VideoProcessRunner = async (bin, args, options) => {
    calls.push({ bin, args, timeoutMs: options.timeoutMs, signal: options.signal });
    const settled = await new Promise<'done' | 'aborted'>(resolve => {
      const timer = setTimeout(() => { options.signal?.removeEventListener('abort', onAbort); resolve('done'); }, current.delayMs);
      const onAbort = (): void => { clearTimeout(timer); resolve('aborted'); };
      if (options.signal?.aborted) return onAbort();
      options.signal?.addEventListener('abort', onAbort, { once: true });
    });
    if (settled === 'aborted') throw new VideoProcessAbortedError(bin);
    if (current.outcome === 'timeout') throw new VideoProcessTimeoutError(bin, options.timeoutMs);
    if (current.outcome === 'fail') return { code: 1, stdout: '', stderr: 'fake process failure' };
    return { code: 0, stdout: '', stderr: '' };
  };
  return {
    runner, calls,
    get behavior(): FakeVideoProcessBehavior { return current; },
    set behavior(next: FakeVideoProcessBehavior) { current = next; },
  };
}
