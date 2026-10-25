// Collection lanes that attempt and store inside the save step (c1 PR3): the video readings, after the other lanes stored
// their captures and before the Meta and TikTok reads, and the report PDFs, after the service's L9 admission step. Like the
// lanes in collection-lanes.ts, each keeps its own Source port; this file owns the gate, the lane's capture order and
// indexes, its document with its own failed document, and its usage rows. The service keeps the admission step, the
// capture closure (PDF retention, M1), the publish side effects under its mutex (M2) and the single final transaction.
import { createHash } from 'node:crypto';
import type { CollectInput, CollectResult, ProviderRawCapture } from './providers.js';
import { toWebResults } from './source-binding.js';
import { filterSerpApiResults } from './serpapi-l9-filter.js';
import { httpsUrl } from './provider-common.js';
import { pdfDocumentTitle } from './pdf-excerpt.js';
import { MARKET_CAPTURE_READ_BUDGET_BYTES } from './market-method-bridge.js';
import { MAX_CAPTURE_ENVELOPE_BYTES, MAX_CAPTURES_PER_STEP, type CaptureRecord, type SourceStepId, type StepPdfDiscovery, type StepResultDocument, type StepWebResult } from './model.js';
import { videoWatchCandidates, videoWatchDocument, videoWatchFailed, videoWatchUsage, VIDEO_WATCH_USAGE_ORDINAL, type PreparedAutomatedVideoReading, type VideoWatchAttempt, type VideoWatchBinding, type VideoWatchLane, type VideoWatchPlan, type VideoWatchRef } from './video-watch-lane.js';
import { VIDEO_WATCH_PROVIDER } from './video-watch-gemini.js';
import { isPdfPath, pdfCandidates, pdfDiscoveryDocument, pdfDiscoveryFailed, pdfDiscoveryUsage, PDF_DISCOVERY_DOWNLOAD_USAGE_ORDINAL, PDF_DISCOVERY_MAX_FILES, PDF_DISCOVERY_SEARCH_USAGE_ORDINAL, type PdfCandidate, type PdfDiscoverySource, type PdfDownloadRun, type PdfSearchAttempt } from './pdf-discovery-lane.js';
import type { LaneCheck, LaneUsageRow } from './collection-lanes.js';

/** One raw capture with its bounded stored envelope. */
export type CaptureEnvelope = { readonly capture: ProviderRawCapture; readonly body: Buffer };

/** The step's capture list as the service keeps it; ordinal = position. */
export interface SaveStepCaptures {
  /** Bounded envelopes of the captures; null when one cannot be stored. */
  readonly envelopes: (values: readonly ProviderRawCapture[]) => CaptureEnvelope[] | null;
  /** Appends in order through the service's capture closure; `retainPdf: false` skips its `%PDF-` retention. */
  readonly put: (envelopes: readonly CaptureEnvelope[], retainPdf?: boolean) => Promise<void>;
  readonly rows: () => readonly CaptureRecord[];
  /** Cuts the list back to an earlier length: a lane whose capture write failed keeps none of its captures (owner c1 Q3). */
  readonly truncate?: (length: number) => void;
  /** Stored bytes of the captures so far. */
  readonly byteSize: () => number;
}

/** What the save step hands these lanes beside each lane's own facts. */
export interface SaveStepContext {
  readonly stepId: SourceStepId;
  readonly signal: AbortSignal | undefined;
  readonly captures: SaveStepCaptures;
  readonly check: LaneCheck;
}

export interface SaveStepLaneResult {
  readonly step: StepResultDocument;
  /** Usage rows for the service's final transaction, in the lane's order. */
  readonly usage: LaneUsageRow[];
}

export interface SaveStepLane<F> {
  readonly name: 'video' | 'pdfDiscovery';
  /** `step` is the step document as the earlier lanes (and, for the report PDFs, the admission step) left it. */
  readonly run: (step: StepResultDocument, context: SaveStepContext, facts: F) => Promise<SaveStepLaneResult>;
}

/** COLLECTION only (QUICK_SEARCH runs none); a lane whose source is off leaves the step as it is. */
export async function runSaveStepLane<F>(lane: SaveStepLane<F> | undefined, step: StepResultDocument, context: SaveStepContext, facts: () => F): Promise<SaveStepLaneResult> {
  if (context.stepId !== 'COLLECTION' || !lane) return { step, usage: [] };
  return lane.run(step, context, facts());
}

type VideoRunContext = { readonly binding: Omit<VideoWatchBinding, 'candidatesSha256'>; readonly productKeyword: string;
  readonly selectionVideos: readonly { readonly url: string }[]; readonly topSellingVideos: readonly { readonly url: string }[]; readonly topSellingGap: boolean };

export interface VideoLaneFacts {
  /** The run asks for the Market report: only Market reads the video readings today, so an Insight-only run makes none. */
  readonly market: boolean;
  /** The run's binding, stored selection and top-selling videos for the step as the earlier lanes left it (M5). */
  readonly context: (step: StepResultDocument) => Promise<VideoRunContext>;
  /** Publishes one reading under the database mutex, refused once the run stopped or the signal aborted (M2). */
  readonly publish: (binding: VideoWatchBinding, prepared: PreparedAutomatedVideoReading) => Promise<VideoWatchRef>;
}

// Video readings, Market runs only: candidates are the run's stored selection and the stored TikTok search rows (no new search). There is
// no abort gate: the lane skips each video as CANCELLED itself. Each attempt's model-answer captures follow the earlier
// lanes' captures and the attempt points at its last one. A skipped video keeps a reason code only and never changes the
// step outcome, coverage or run blockers.
export function videoLane(source: VideoWatchLane): SaveStepLane<VideoLaneFacts> {
  return {
    name: 'video',
    async run(step, { signal, captures, check }, facts) {
      if (!facts.market) return { step, usage: [] };
      let plan: VideoWatchPlan = videoWatchCandidates([], undefined);
      let attempts: VideoWatchAttempt[] | undefined;
      try {
        const context = await facts.context(step);
        if (context.topSellingGap) step = { ...step, limitations: [...step.limitations, { code: 'TOP_SELLING_VIDEO_LOCATORS_UNAVAILABLE', provider: null,
          message: 'Dữ liệu sản phẩm đã chọn còn thiếu đường dẫn video bán chạy dùng được.' }] };
        plan = videoWatchCandidates(context.selectionVideos, step.expandedSearch?.queries, context.topSellingVideos);
        const binding = { ...context.binding, candidatesSha256: plan.candidatesSha256 };
        attempts = await source.run({ binding, productKeyword: context.productKeyword, candidates: plan.candidates, ...(signal ? { signal } : {}),
          publish: prepared => facts.publish(binding, prepared) });
      } catch { /* thrown: one UNKNOWN row below */ }
      const indexes: (number | null)[] = [];
      const start = captures.rows().length;
      let writeFailed = false;
      try {
        for (const attempt of attempts ?? []) {
          const envelopes = attempt.captures.length ? captures.envelopes(attempt.captures) : null;
          if (!envelopes?.length) { indexes.push(null); continue; }
          await captures.put(envelopes);
          indexes.push(captures.rows().length - 1);
        }
      } catch {
        // A failed capture write fails only this lane (owner c1 Q3): none of its captures are kept, it gets the document a
        // thrown run gives, its usage stays as the readings made it, and the save goes on.
        writeFailed = true;
        captures.truncate?.(start);
      }
      const probe = { ...step, videoWatch: attempts && !writeFailed ? videoWatchDocument(plan, attempts, indexes) : videoWatchFailed(plan, 'PROVIDER_FAILED') };
      try {
        check(probe);
        step = probe;
      } catch { step = { ...step, videoWatch: videoWatchFailed(plan, 'DOCUMENT_INVALID') }; }
      const usage: LaneUsageRow[] = attempts?.some(item => item.requests > 0) ? [{ kind: 'USAGE', ordinal: VIDEO_WATCH_USAGE_ORDINAL, result: videoWatchUsage(attempts) }]
        : !attempts ? [{ kind: 'UNSETTLED', ordinal: VIDEO_WATCH_USAGE_ORDINAL, provider: VIDEO_WATCH_PROVIDER.toLowerCase() }] : [];
      return { step, usage };
    },
  };
}

export interface PdfLaneFacts {
  /** The frozen collection input of the extra search; undefined runs no report-PDF lane. */
  readonly input: CollectInput | undefined;
  /** The run asks for the Market report. */
  readonly market: boolean;
  /** The run was aborted before the save step. */
  readonly aborted: boolean;
  readonly readerOn: () => boolean;
  /** Question slots left for automatic run PDFs. */
  readonly remainingPdfSlots: () => number;
  /** This run's web rows admitted by the service's L9 admission step (empty without source evidence). */
  readonly admittedRows: () => Promise<readonly StepWebResult[]>;
  /** The admitted keyword draft's L9 filter, or null when nothing was admitted. */
  readonly keywordFilter: Parameters<typeof filterSerpApiResults>[0]['filter'] | null;
  readonly readArtifact: (sha256: string, maxBytes: number) => Promise<Buffer>;
  readonly pageCheck: (bytes: Uint8Array) => Promise<'OK' | 'PAGE_LIMIT' | 'DOCUMENT_INVALID'>;
  /** sha256 of the run PDFs already retained. */
  readonly runPdfShas: () => string[];
  readonly retainPdf: (fileName: string, bytes: Uint8Array, title: string | null) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

// Report PDFs (S25 AUTO), Market runs only, never after an abort: candidates are admitted rows of this run, then at most
// one extra search whose rows pass the same draft's L9 filter, then at most two guarded downloads. Each stored file is an
// ordinary COLLECTION capture starting with `%PDF-`, retained as a run PDF. Every capture keeps within the step's capture
// budget. A failure (including a failed capture write) keeps a reason code only and never changes the step.
export function pdfLane(source: PdfDiscoverySource): SaveStepLane<PdfLaneFacts> {
  return {
    name: 'pdfDiscovery',
    async run(step, { signal, captures, check }, facts) {
      const pdfInput = facts.input;
      if (!facts.market || !pdfInput || facts.aborted || signal?.aborted) return { step, usage: [] };
      let pdfSearchResult: CollectResult | null = null;
      let pdfSearchThrown = false;
      let pdfDownloads: PdfDownloadRun | null = null;
      let search: StepPdfDiscovery['search'] = { status: 'FAILED', reason: 'SEARCH_FAILED', captureIndex: null, retrievedAt: null };
      try {
        // All optional envelopes, including the extra search, share the bridge's exact capture budget.
        // Owner uploads remain in their existing packages and do not consume this inventory.
        const fits = (values: readonly CaptureEnvelope[]): boolean =>
          captures.rows().length + values.length <= MAX_CAPTURES_PER_STEP &&
          captures.byteSize() + values.reduce((sum, value) => sum + value.body.byteLength, 0) <= MARKET_CAPTURE_READ_BUDGET_BYTES;
        const seen = new Set<string>();
        // Search projections truncate text before this lane. Vet the exact retained search title,
        // so truncation cannot hide a file extension, provider name or other unsafe suffix.
        const candidatesForRows = async (rows: readonly StepWebResult[], origin: PdfCandidate['origin']): Promise<PdfCandidate[]> => {
          const titled: StepWebResult[] = [];
          const payloads = new Map<string, unknown>();
          for (const row of rows) {
            let title = '';
            try {
              const capture = captures.rows().find(c => c.ordinal === row.captureIndex);
              if (capture?.provider === 'serpapi' && capture.operation === 'serpapi.google.search') {
                if (!payloads.has(capture.artifactSha256)) {
                  // These content-addressed bytes are retained already; their manifests commit with the step below.
                  const envelope = JSON.parse((await facts.readArtifact(capture.artifactSha256, MAX_CAPTURE_ENVELOPE_BYTES)).toString('utf8')) as Record<string, unknown>;
                  if (envelope.outcome !== 'OK' || typeof envelope.responseBytesBase64 !== 'string') throw new Error('Missing search bytes');
                  const bytes = Buffer.from(envelope.responseBytesBase64, 'base64');
                  if (createHash('sha256').update(bytes).digest('hex') !== envelope.responseSha256) throw new Error('Search byte mismatch');
                  payloads.set(capture.artifactSha256, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
                }
                const payload = payloads.get(capture.artifactSha256);
                const matches = isRecord(payload) && Array.isArray(payload.organic_results) ? payload.organic_results.filter((raw: unknown, index: number) =>
                  isRecord(raw) && (typeof raw.position === 'number' && Number.isSafeInteger(raw.position) && raw.position > 0 ? raw.position : index + 1) === row.position &&
                  httpsUrl(raw.link, 2048) === row.url) : [];
                if (matches.length === 1 && isRecord(matches[0])) title = pdfDocumentTitle(matches[0].title) ?? '';
              }
            } catch { /* No authentic usable search title: embedded metadata or the ordinal remains available. */ }
            titled.push({ ...row, title });
          }
          return pdfCandidates(titled, origin, seen);
        };
        let candidates: PdfCandidate[] = [];
        // The M09 excerpt block shows only stored reader quotes: with the document reader off an automatic PDF adds nothing,
        // so neither the extra search nor any download is made. With it on, owner uploads planned first may already fill the
        // question cap: then an automatic PDF could never be asked either. Later uploads stay first by ordering.
        const readerOff = !facts.readerOn();
        const downloadSlots = Math.min(PDF_DISCOVERY_MAX_FILES, facts.remainingPdfSlots());
        const noQuestionBudget = !readerOff && downloadSlots === 0;
        if (!readerOff && !noQuestionBudget) try {
          candidates = await candidatesForRows(await facts.admittedRows(), 'RUN_ROWS');
        } catch { candidates = []; }
        if (readerOff) search = { status: 'SKIPPED', reason: 'SKIPPED_READER_OFF', captureIndex: null, retrievedAt: null };
        else if (noQuestionBudget) search ={ status: 'SKIPPED', reason: 'SKIPPED_NO_QUESTION_BUDGET', captureIndex: null, retrievedAt: null };
        else if (candidates.length >= downloadSlots) search = { status: 'SKIPPED', reason: 'SEARCH_SKIPPED_ENOUGH', captureIndex: null, retrievedAt: null };
        else if (!facts.keywordFilter) search = { status: 'SKIPPED', reason: 'SEARCH_NO_ADMISSION', captureIndex: null, retrievedAt: null };
        else {
          const filter = facts.keywordFilter;
          let attempt: PdfSearchAttempt;
          try { attempt = await source.search(pdfInput, signal ? { signal } : {}); } catch { attempt = { state: 'THROWN' }; }
          const offset = captures.rows().length;
          const envelopes = attempt.state === 'CALLED' ? captures.envelopes(attempt.result.captures) : null;
          if (attempt.state === 'CALLED') pdfSearchResult = attempt.result; else pdfSearchThrown = true;
          if (envelopes?.length && fits(envelopes)) await captures.put(envelopes);
          const stored = captures.rows().length > offset ? captures.rows()[offset]! : null;
          if (attempt.state === 'CALLED' && stored && stored.provider === 'serpapi' && stored.operation === 'serpapi.google.search') {
            search = { status: 'CALLED', reason: attempt.result.status === 'SUCCEEDED' ? null : 'SEARCH_FAILED', captureIndex: offset, retrievedAt: stored.retrievedAt };
            if (attempt.result.status === 'SUCCEEDED') {
              try {
                const rows = toWebResults(attempt.result).filter(row => row.captureIndex === 0).map(row => ({ ...row, captureIndex: offset }));
                const admitted = new Set(filterSerpApiResults({ results: rows.map(row => ({ captureId: stored.artifactSha256, position: row.position, title: row.title, snippet: row.snippet })),
                  filter }).includedRecordIds);
                const found = await candidatesForRows(rows.filter(row => admitted.has(`${stored.artifactSha256}#${row.position}`)), 'PDF_SEARCH');
                if (!found.length && rows.some(row => isPdfPath(row.url))) search = { ...search, reason: 'NOT_ADMITTED' };
                candidates = [...candidates, ...found];
              } catch { search = { ...search, reason: 'SEARCH_FAILED' }; }
            }
          } else search = { status: 'FAILED', reason: envelopes?.length && !fits(envelopes) ? 'BRIDGE_BUDGET_LIMIT' : 'SEARCH_FAILED', captureIndex: null, retrievedAt: null };
        }
        const fileIndexes: (number | null)[] = [];
        if (candidates.length && !signal?.aborted) {
          pdfDownloads = { requests: 0, items: [] };
          const items: PdfDownloadRun['items'][number][] = [];
          const knownPdfs = new Set(facts.runPdfShas());
          // Download sequentially: a duplicate or refused file consumes an attempt, not a question slot.
          // Never try beyond the original two candidates, and stop before fetching a file that cannot be asked.
          // A thrown download falls to the outer catch (TRANSPORT) and records no UNKNOWN row (M3): downloads are plain
          // unpaid GETs, so the thrown-lane cost rule (owner c1 Q1) does not apply to them.
          for (const candidate of candidates.slice(0, PDF_DISCOVERY_MAX_FILES)) {
            if (signal?.aborted || facts.remainingPdfSlots() === 0) break;
            const downloaded = await source.download([candidate], signal ? { signal } : {});
            pdfDownloads = { requests: pdfDownloads.requests + downloaded.requests, items: [...pdfDownloads.items, ...downloaded.items] };
            const item = downloaded.items[0];
            if (!item) continue;
            const envelopes = item.kind === 'DOWNLOADED' ? captures.envelopes([item.capture]) : null;
            if (!envelopes?.length) { fileIndexes.push(null); items.push(item); continue; }
            if (item.kind === 'DOWNLOADED' && knownPdfs.has(item.sha256)) {
              fileIndexes.push(null);
              items.push({ candidate: item.candidate, kind: 'FAILED', reason: 'DUPLICATE', requested: true });
              continue;
            }
            // Page cap before any persistence: an over-cap file is neither stored as a capture nor retained, so it is
            // never indexed and never cited as a file the report cannot read.
            const pageCheck = item.kind === 'DOWNLOADED' ? await facts.pageCheck(item.bytes) : 'OK';
            if (pageCheck !== 'OK') {
              fileIndexes.push(null);
              items.push({ candidate: item.candidate, kind: 'FAILED', reason: pageCheck, requested: true });
              continue;
            }
            if (!fits(envelopes)) {
              fileIndexes.push(null);
              items.push({ candidate: item.candidate, kind: 'FAILED', reason: 'BRIDGE_BUDGET_LIMIT', requested: true });
              continue;
            }
            // Persist the capture before reader retention so a failed optional write cannot leave an uncited run PDF.
            const index = captures.rows().length;
            try { await captures.put(envelopes, false); }
            catch {
              fileIndexes.push(null);
              items.push({ candidate: item.candidate, kind: 'FAILED', reason: 'TRANSPORT', requested: true });
              continue;
            }
            if (item.kind === 'DOWNLOADED') {
              try { await facts.retainPdf(`source-${captures.rows().length}.pdf`, item.bytes, item.candidate.title ?? null); }
              catch {
                // Indexing may fail after source retention; that follows the upload path's existing reader state.
                if (!facts.runPdfShas().includes(item.sha256)) {
                  fileIndexes.push(null);
                  items.push({ candidate: item.candidate, kind: 'FAILED', reason: 'DOCUMENT_INVALID', requested: true });
                  continue;
                }
              }
              knownPdfs.add(item.sha256);
            }
            fileIndexes.push(index);
            items.push(item);
            step = { ...step, pdfDiscovery: pdfDiscoveryDocument(search, { ...pdfDownloads, items }, fileIndexes, search.reason ?? 'NO_CANDIDATE') };
          }
          pdfDownloads = { ...pdfDownloads, items };
        }
        const probe = { ...step, pdfDiscovery: pdfDiscoveryDocument(search, pdfDownloads, fileIndexes, search.reason ?? 'NO_CANDIDATE') };
        try {
          check(probe);
          step = probe;
        } catch { step = { ...step, pdfDiscovery: { ...pdfDiscoveryFailed('DOCUMENT_INVALID'), search } }; }
      } catch { step = { ...step, pdfDiscovery: step.pdfDiscovery ?? { ...pdfDiscoveryFailed('TRANSPORT'), search } }; }
      const usage: LaneUsageRow[] = [
        ...(pdfSearchResult?.captures.length ? [{ kind: 'USAGE' as const, ordinal: PDF_DISCOVERY_SEARCH_USAGE_ORDINAL, result: pdfSearchResult }]
          : pdfSearchThrown ? [{ kind: 'UNSETTLED' as const, ordinal: PDF_DISCOVERY_SEARCH_USAGE_ORDINAL, provider: 'serpapi' }] : []),
        ...(pdfDownloads && pdfDownloads.requests > 0 ? [{ kind: 'USAGE' as const, ordinal: PDF_DISCOVERY_DOWNLOAD_USAGE_ORDINAL, result: pdfDiscoveryUsage(pdfDownloads.requests) }] : []),
      ];
      return { step, usage };
    },
  };
}
