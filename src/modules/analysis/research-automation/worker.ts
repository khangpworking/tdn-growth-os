import type Database from 'better-sqlite3';
import { ResearchAutomationService } from './service.js';

/**
 * Minimal durable executor for the research workflow. The operator app already
 * owns the process-wide database executor lock; this guard prevents two worker
 * handles in one process from claiming the same database concurrently.
 */
export class ResearchAutomationWorker {
  static readonly #owners = new Set<string>();
  readonly #service: ResearchAutomationService;
  readonly #dbKey: string;
  #started = false;
  #closing = false;
  #wakePromise: Promise<void> | undefined;
  #wakeAgain = false;
  #lastError: unknown = undefined;

  constructor(options: { readonly service: ResearchAutomationService; readonly db: Database.Database }) {
    this.#service = options.service;
    this.#dbKey = options.db.name;
    if (ResearchAutomationWorker.#owners.has(this.#dbKey)) throw new Error('A research automation worker already owns this database.');
    ResearchAutomationWorker.#owners.add(this.#dbKey);
  }

  async start(): Promise<void> {
    if (this.#closing) throw new Error('Research automation worker is closing.');
    if (this.#started) return;
    this.#started = true;
    await this.#service.recoverOnStart();
    this.wake();
  }

  get lastError(): unknown { return this.#lastError; }

  /** Wake is intentionally non-blocking so HTTP requests never await provider work. */
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

  async close(): Promise<void> {
    if (this.#closing) { await this.#wakePromise; return; }
    this.#closing = true;
    await this.#service.interruptActive();
    await this.#wakePromise;
    this.#started = false;
    ResearchAutomationWorker.#owners.delete(this.#dbKey);
  }

  async #drain(): Promise<void> {
    if (!this.#started || this.#closing) return;
    while (!this.#closing) {
      const processed = await this.#service.processNext();
      if (!processed) return;
    }
  }
}
