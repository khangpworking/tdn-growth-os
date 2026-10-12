import { MAX_JSON_ARTIFACT_BYTES } from './model.js';
/** Browser mechanics only. This port has no shell, argv, eval, ad-click or
 * runtime implementation. A real operator adapter needs its own documented
 * pin/extension/command contract; saved synthetic replies prove no such setup. */
export type MetaPageControlState = 'READY' | 'CAPTCHA' | 'LOGIN_REQUIRED' | 'BLOCKED' | 'UI_CHANGED';
export interface MetaPageCaptureTarget {
  readonly pageId: string;
  readonly libraryUrl: string;
  /** Digest of the owning service's authenticated peer/search/L9/run binding. */
  readonly bindingSha256: string;
}
interface MetaPageCommandReply { readonly observedUrl: string; readonly state: MetaPageControlState }
export interface MetaPageBrowserPort {
  openPageLibrary(target: Readonly<MetaPageCaptureTarget>, signal?: AbortSignal): Promise<MetaPageCommandReply>;
  readVisiblePage(target: Readonly<MetaPageCaptureTarget>, signal?: AbortSignal): Promise<MetaPageCommandReply & {
    readonly html: Uint8Array; readonly visibleFields: Uint8Array;
  }>;
}
export class MetaPageCaptureRejection extends Error {
  constructor(readonly code: string) { super(code); }
}
const refuse = (code: string): never => { throw new MetaPageCaptureRejection(code); };
export const META_PAGE_COMMAND_INTERVAL_MS = 30000;

/** Closed application target, not a witnessed Meta DOM or OpenCLI contract. */
export function checkMetaPageTarget(target: MetaPageCaptureTarget): void {
  if (!target || !/^[1-9][0-9]{0,29}$/.test(target.pageId) || !/^[0-9a-f]{64}$/.test(target.bindingSha256)) refuse('PAGE_BINDING_INVALID');
  let url: URL;
  try { url = new URL(target.libraryUrl); } catch { return refuse('PAGE_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.hostname !== 'www.facebook.com' || url.port || url.username || url.password || url.hash ||
      url.pathname !== '/ads/library/' || url.searchParams.getAll('view_all_page_id').length !== 1 ||
      url.searchParams.get('view_all_page_id') !== target.pageId || url.searchParams.getAll('country').length !== 1 ||
      url.searchParams.get('country') !== 'VN' || [...url.searchParams.keys()].some(key => !['view_all_page_id', 'country'].includes(key)))
    refuse('PAGE_DOMAIN_OR_FILTER_MISMATCH');
}

/** The owning caller authenticates retained evidence before every command.
 * One instance shares command spacing across its captures; it never retries a
 * stopped source or decides workflow/admission policy. */
export class MetaPageCapture {
  #lastCommandAt: number | null = null;
  #busy = false;
  constructor(private readonly browser: MetaPageBrowserPort, private readonly clock: {
    monotonicMs(): number; sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
  }) {}
  async capture(readBoundTarget: () => Promise<MetaPageCaptureTarget>, signal?: AbortSignal): Promise<{
    target: MetaPageCaptureTarget; html: Buffer; visibleFields: Buffer;
  }> {
    if (this.#busy) refuse('CAPTURE_ALREADY_RUNNING');
    this.#busy = true;
    try {
      signal?.throwIfAborted();
      const declared = await readBoundTarget();
      const target = { pageId: declared.pageId, libraryUrl: declared.libraryUrl, bindingSha256: declared.bindingSha256 }; checkMetaPageTarget(target);
      const signature = JSON.stringify(target);
      const authenticate = async () => {
        signal?.throwIfAborted(); const current = await readBoundTarget(); checkMetaPageTarget(current);
        if (JSON.stringify({ pageId: current.pageId, libraryUrl: current.libraryUrl, bindingSha256: current.bindingSha256 }) !== signature) refuse('SOURCE_REFERENCE_DRIFT');
      };
      await this.#beforeCommand(authenticate, signal);
      const opened = await this.browser.openPageLibrary(Object.freeze({ ...target }), signal);
      this.#checkReply(opened, target); signal?.throwIfAborted();
      await this.#beforeCommand(authenticate, signal);
      const captured = await this.browser.readVisiblePage(Object.freeze({ ...target }), signal);
      this.#checkReply(captured, target); signal?.throwIfAborted();
      await authenticate();
      if (!(captured.html instanceof Uint8Array) || !(captured.visibleFields instanceof Uint8Array)) refuse('CAPTURE_BYTES_INVALID');
      if (!captured.html.length || !captured.visibleFields.length || captured.html.length > MAX_JSON_ARTIFACT_BYTES || captured.visibleFields.length > MAX_JSON_ARTIFACT_BYTES) refuse('CAPTURE_SIZE_INVALID');
      return { target, html: Buffer.from(captured.html), visibleFields: Buffer.from(captured.visibleFields) };
    } finally { this.#busy = false; }
  }
  async #beforeCommand(authenticate: () => Promise<void>, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    let now = this.clock.monotonicMs();
    if (!Number.isFinite(now) || now < 0 || (this.#lastCommandAt !== null && now < this.#lastCommandAt)) refuse('COMMAND_CLOCK_INVALID');
    if (this.#lastCommandAt !== null && now - this.#lastCommandAt < META_PAGE_COMMAND_INTERVAL_MS) {
      await this.clock.sleep(META_PAGE_COMMAND_INTERVAL_MS - (now - this.#lastCommandAt), signal);
      signal?.throwIfAborted(); now = this.clock.monotonicMs();
      if (!Number.isFinite(now) || now - this.#lastCommandAt < META_PAGE_COMMAND_INTERVAL_MS) refuse('COMMAND_INTERVAL_NOT_REACHED');
    }
    await authenticate(); signal?.throwIfAborted();
    // Recheck after authentication: a bad injected clock cannot evade spacing.
    const actual = this.clock.monotonicMs();
    if (!Number.isFinite(actual) || actual < now || (this.#lastCommandAt !== null && actual - this.#lastCommandAt < META_PAGE_COMMAND_INTERVAL_MS)) refuse('COMMAND_CLOCK_INVALID');
    this.#lastCommandAt = actual;
  }
  #checkReply(reply: MetaPageCommandReply, target: MetaPageCaptureTarget): void {
    if (!reply || reply.state !== 'READY') refuse(reply?.state && ['CAPTCHA', 'LOGIN_REQUIRED', 'BLOCKED', 'UI_CHANGED'].includes(reply.state) ? `META_${reply.state}` : 'META_UI_CHANGED');
    if (reply.observedUrl !== target.libraryUrl) refuse('PAGE_RESPONSE_BINDING_MISMATCH');
  }
}
