import type Database from 'better-sqlite3';
import type { VideoService } from './video-service.js';
import { VideoProcessError, VideoProcessSpawnError, VideoProcessTimeoutError, type VideoProcessRunner } from '../../platform/video-process-runner.js';

/**
 * Minimal durable executor for Video Factory (055-Q2), shaped after ResearchAutomationWorker. The
 * operator app already owns the process-wide executor lock and sweeps interrupted jobs in
 * prepareDatabase; this guard only prevents two worker handles in one process. One video job runs
 * at a time; every kind goes through the injected process runner; nothing retries (054 §3).
 */

/** Per-call wall limit for one outside call (055-Q9's 900 s render budget; tightened per kind later). */
export const VIDEO_JOB_TIMEOUT_MS = 900_000;
/** Bounded captured output per call. */
export const VIDEO_JOB_OUTPUT_BYTES = 256 * 1024;

/**
 * Checkpoint 1a placeholder commands: real import/voice/render work arrives in checkpoints 2–4
 * and replaces these entries per kind; tests inject the fake runner, which ignores them.
 */
export const VIDEO_JOB_COMMANDS: Readonly<Record<'import' | 'voice' | 'render', { readonly bin: string; readonly args: readonly string[] }>> = {
  import: { bin: 'ffmpeg', args: ['-hide_banner', '-version'] },
  voice: { bin: 'ffmpeg', args: ['-hide_banner', '-version'] },
  render: { bin: 'ffmpeg', args: ['-hide_banner', '-version'] },
};

export class VideoWorker {
  static readonly #owners = new Set<string>();
  readonly #service: VideoService;
  readonly #runner: VideoProcessRunner;
  readonly #timeoutMs: number;
  readonly #dbKey: string;
  #started = false;
  #closing = false;
  #wakePromise: Promise<void> | undefined;
  #wakeAgain = false;
  #active: AbortController | undefined;
  #lastError: unknown = undefined;

  constructor(options: { readonly service: VideoService; readonly db: Database.Database; readonly runner: VideoProcessRunner; readonly timeoutMs?: number }) {
    this.#service = options.service;
    this.#runner = options.runner;
    this.#timeoutMs = options.timeoutMs ?? VIDEO_JOB_TIMEOUT_MS;
    this.#dbKey = options.db.name;
    if (VideoWorker.#owners.has(this.#dbKey)) throw new Error('A video worker already owns this database.');
    VideoWorker.#owners.add(this.#dbKey);
  }

  async start(): Promise<void> {
    if (this.#closing) throw new Error('Video worker is closing.');
    if (this.#started) return;
    this.#started = true;
    // Startup sweeping already happened in prepareDatabase before the server serves; the worker only drains.
    this.wake();
  }

  get lastError(): unknown { return this.#lastError; }

  /** Wake is intentionally non-blocking so HTTP requests never await video work. */
  wake(): void {
    if (this.#closing) return;
    if (this.#wakePromise) { this.#wakeAgain = true; return; }
    this.#wakePromise = this.#drain().catch((error: unknown) => {
      // A storage/integrity failure must be observable to the operator without
      // becoming an unhandled rejection that tears down the Node process.
      this.#lastError = error;
    }).finally(() => {
      this.#wakePromise = undefined;
      if (this.#wakeAgain && !this.#closing) { this.#wakeAgain = false; this.wake(); }
    });
  }

  /** Aborts the running job, waits for the runner to finish and the job to settle, then returns. */
  async close(): Promise<void> {
    if (this.#closing) { await this.#wakePromise; return; }
    this.#closing = true;
    this.#active?.abort();
    await this.#wakePromise;
    this.#active = undefined;
    this.#started = false;
    VideoWorker.#owners.delete(this.#dbKey);
  }

  async #drain(): Promise<void> {
    if (!this.#started || this.#closing) return;
    while (!this.#closing) {
      const job = this.#service.claimNextJob();
      if (!job) return;
      await this.#runJob(job.jobId, job.kind);
    }
  }

  async #runJob(jobId: string, kind: 'import' | 'voice' | 'render'): Promise<void> {
    const controller = new AbortController();
    this.#active = controller;
    try {
      const command = VIDEO_JOB_COMMANDS[kind];
      await this.#runner(command.bin, command.args, { timeoutMs: this.#timeoutMs, maxBytes: VIDEO_JOB_OUTPUT_BYTES, signal: controller.signal });
      this.#service.finishJob(jobId);
    } catch (error) {
      // One failed call fails only this job; the app keeps running. No retry (R-V10, R-V11).
      try {
        if (error instanceof VideoProcessSpawnError) this.#service.failJob(jobId, 'process_failed');
        else if (error instanceof VideoProcessTimeoutError) this.#service.failJob(jobId, 'timeout');
        else if (error instanceof VideoProcessError) this.#service.cancelJob(jobId);
        else this.#service.failJob(jobId, 'process_failed');
      } catch (settleError) {
        // Settling must not mask the original failure; the row stays running for the next startup sweep.
        this.#lastError = settleError;
      }
      if (!(error instanceof VideoProcessError)) this.#lastError = error;
    } finally {
      if (this.#active === controller) this.#active = undefined;
    }
  }
}
