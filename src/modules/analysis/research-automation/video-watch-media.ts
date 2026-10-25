// Local media of the video-watch lane: one bounded yt-dlp subtitle read per candidate, else one bounded video download and one ffprobe
// read, and the 45-day sweep.
// Processes run without a shell, with a minimal environment that never carries a credential; media bytes never enter Foundation.
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { StepVideoWatchCandidate, StepVideoWatchMedia } from './model.js';
import { parseVttSubtitles, SUBTITLE_MAX_BYTES, type SubtitleSegment } from './video-watch-subtitles.js';

export const VIDEO_WATCH_MAX_SECONDS = 180;
/** 14 MiB keeps the one inline answer request body under ~19 MB. */
export const VIDEO_WATCH_MAX_BYTES = 14 * 1024 * 1024;
export const VIDEO_WATCH_DOWNLOAD_TIMEOUT_MS = 120_000;
export const VIDEO_WATCH_PROBE_TIMEOUT_MS = 30_000;
export const VIDEO_WATCH_SUBTITLE_TIMEOUT_MS = 60_000;
/** The only subtitle track read: the video's own Vietnamese subtitles (never automatic captions, never another language). */
export const VIDEO_WATCH_SUBTITLE_LANGUAGE = 'vie-VN';
export const VIDEO_WATCH_RETENTION_DAYS = 45;
const RETENTION_MS = VIDEO_WATCH_RETENTION_DAYS * 86_400_000;
const OUTPUT_BYTES = 256 * 1024;
const LEDGER = '.video-watch-downloads.json';
const LEDGER_BYTES = 1024 * 1024;
/** Marker of a run folder created by this app (folders from the first deployed version have a ledger but no marker). */
const RUN_MARKER = '.video-watch-run';
const RUN_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MEDIA_FILE = /^([1-9][0-9]{0,19})\.(mp4|webm|mkv|mov|m4v)$/;
const SUBTITLE_FILE = /^([1-9][0-9]{0,19})\.vie-VN\.vtt$/;
/** Candidate files the ledger and the sweep handle: a downloaded video or its Vietnamese subtitle file. */
const keptFile = (name: string): boolean => MEDIA_FILE.test(name) || SUBTITLE_FILE.test(name);
/** Only these containers are sent; the probed container must agree with the file extension. */
const MIME: Readonly<Record<string, { readonly mimeType: string; readonly format: string }>> = { mp4: { mimeType: 'video/mp4', format: 'mp4' }, webm: { mimeType: 'video/webm', format: 'webm' } };

export type VideoMediaSkip = 'DOWNLOAD_FAILED' | 'VIDEO_TOO_LONG' | 'VIDEO_TOO_LARGE' | 'NOT_A_VIDEO' | 'CANCELLED';
export interface ProcessResult { readonly code: number | null; readonly stdout: string; readonly stderr: string; readonly timedOut: boolean }
/** Runs one executable with argument list only (never a shell string). */
export type ProcessRunner = (bin: string, args: readonly string[], options: { readonly timeoutMs: number; readonly maxBytes: number; readonly signal?: AbortSignal }) => Promise<ProcessResult>;

/** Only what a process needs to start; no TDN_* value (and so no key) is ever passed on. */
function minimalEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const name of ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LANG', 'LC_ALL']) if (process.env[name] !== undefined) out[name] = process.env[name];
  return out;
}

/** Spawn options for every tool: no shell, stdin ignored (ffprobe/ffmpeg otherwise read an inherited stdin), minimal environment. */
export function processSpawnOptions(): SpawnOptions & { stdio: ['ignore', 'pipe', 'pipe'] } {
  return { shell: false, windowsHide: true, env: minimalEnv(), stdio: ['ignore', 'pipe', 'pipe'] };
}

/** A runner over `spawn` (injectable for tests): bounded output, own timeout, abort kills the child. */
export function createProcessRunner(spawnFn: typeof spawn = spawn): ProcessRunner {
  return (bin, args, options) => new Promise(resolve => {
    let stdout = '', stderr = '', timedOut = false, settled = false;
    const done = (code: number | null): void => { if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort);
      resolve({ code, stdout: stdout.slice(0, OUTPUT_BYTES), stderr: stderr.slice(0, OUTPUT_BYTES), timedOut }); };
    let child: ChildProcess;
    try { child = spawnFn(bin, [...args], processSpawnOptions()); } catch { resolve({ code: null, stdout: '', stderr: '', timedOut: false }); return; }
    const kill = (): void => { try { child.kill('SIGKILL'); } catch { /* already gone */ } };
    const onAbort = (): void => { kill(); done(null); };
    const timer = setTimeout(() => { timedOut = true; kill(); done(null); }, options.timeoutMs);
    if (options.signal?.aborted) { onAbort(); return; }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const take = (which: 'out' | 'err') => (chunk: Buffer | string): void => {
      const text = String(chunk);
      if (which === 'out') { if (stdout.length < options.maxBytes) stdout += text; } else if (stderr.length < options.maxBytes) stderr += text;
    };
    child.stdout?.on('data', take('out'));
    child.stderr?.on('data', take('err'));
    child.on('error', () => done(null));
    child.on('close', code => done(typeof code === 'number' ? code : null));
  });
}

export const defaultProcessRunner: ProcessRunner = createProcessRunner();

export interface VideoMediaConfig { readonly mediaDir: string; readonly ytdlpBin: string; readonly ffprobeBin: string }
export type DownloadedVideo = { readonly ok: true; readonly file: string; readonly mimeType: string; readonly media: StepVideoWatchMedia }
  | { readonly ok: false; readonly reason: VideoMediaSkip };

/** Format sort: `res` is the SMALLER side in yt-dlp, so `res:720` prefers the largest short side not above 720 (the smallest when none is);
 * `+size` then prefers the smaller file when the short side is equal. */
export const VIDEO_WATCH_FORMAT_SORT = 'res:720,+size';
/** Format choice. Every alternative needs a video stream (`vcodec!=none`), so an audio-only post downloads nothing. Short side <= 720 under
 * 14 MiB first (width for vertical, height for horizontal media), then short side <= 480, then any video format as the last resort. */
export const VIDEO_WATCH_FORMAT = ['b[vcodec!=none][width<=720][filesize<14M]', 'b[vcodec!=none][height<=720][filesize<14M]',
  'b[vcodec!=none][width<=480]', 'b[vcodec!=none][height<=480]', 'b[vcodec!=none]'].join('/');

/** The fixed yt-dlp argument list: no config file, no cookies, one video, size and length filters, short side at most 720 (falling back to 480),
 * a video stream required, restricted file names. */
export function ytdlpArgs(runDir: string, candidate: StepVideoWatchCandidate): string[] {
  return ['--ignore-config', '--no-cookies', '--no-cookies-from-browser', '--no-playlist', '--no-progress', '--no-mtime', '--restrict-filenames',
    '--max-filesize', '14M', '--match-filter', `duration<=${VIDEO_WATCH_MAX_SECONDS}`, '-S', VIDEO_WATCH_FORMAT_SORT, '-f', VIDEO_WATCH_FORMAT,
    '-o', path.join(runDir, `${candidate.videoId}.%(ext)s`), '--', candidate.url];
}
/** yt-dlp's answer when no format passes the selection; with a video stream required in every alternative this means no video at all. */
const NO_VIDEO_FORMAT = /requested format is not available|no video formats found/iu;

async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function regularFile(file: string): Promise<import('node:fs').Stats | null> {
  try { const stat = await fs.lstat(file); return stat.isFile() ? stat : null; } catch { return null; }
}

/** Removes only this candidate's own regular files in the run folder (partial downloads included); never follows a link. */
async function removeCandidateFiles(runDir: string, videoId: string): Promise<void> {
  let names: string[] = [];
  try { names = await fs.readdir(runDir); } catch { return; }
  for (const name of names) if (name.startsWith(`${videoId}.`)) {
    const file = path.join(runDir, name);
    const stat = await fs.lstat(file).catch(() => null);
    // Remove a stale link itself, never the target it points at. This also
    // prevents yt-dlp from opening a pre-existing candidate path through a
    // symlink on the next download.
    if (stat?.isFile() || stat?.isSymbolicLink()) await fs.unlink(file).catch(() => {});
  }
}

async function readLedger(runDir: string): Promise<Record<string, string>> {
  const file = path.join(runDir, LEDGER), stat = await regularFile(file);
  if (!stat || stat.size > LEDGER_BYTES) return {};
  try {
    const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => keptFile(entry[0]) && typeof entry[1] === 'string'));
  } catch { return {}; }
}
async function writeLedger(runDir: string, ledger: Record<string, string>): Promise<void> {
  const file = path.join(runDir, LEDGER);
  const prior = await fs.lstat(file).catch(() => null);
  // Never follow a ledger symlink outside the media directory. A malformed
  // or linked ledger fails the current candidate closed and is retried later.
  if (prior && !prior.isFile()) throw new Error('video-watch ledger is not a regular file');
  await fs.writeFile(file, JSON.stringify(ledger));
}

/** Marks a run folder as created by this app: an empty regular file, created exclusively (`wx` never follows or replaces a link).
 * A failed write only leaves the folder on the ledger-only rule. */
async function writeRunMarker(runDir: string): Promise<void> {
  await fs.writeFile(path.join(runDir, RUN_MARKER), '', { flag: 'wx' }).catch(() => {});
}
/** A marker counts only as a regular file; a link, folder or missing marker is "not marked". */
async function hasRunMarker(runDir: string): Promise<boolean> { return (await regularFile(path.join(runDir, RUN_MARKER))) !== null; }

/** Reads duration and stream kinds; anything that is not one readable video stream with a finite length is NOT_A_VIDEO. */
async function probe(config: VideoMediaConfig, runner: ProcessRunner, file: string, container: string, signal?: AbortSignal): Promise<number | 'NOT_A_VIDEO'> {
  const result = await runner(config.ffprobeBin, ['-v', 'error', '-show_entries', 'format=duration,format_name:stream=codec_type', '-of', 'json', file],
    { timeoutMs: VIDEO_WATCH_PROBE_TIMEOUT_MS, maxBytes: OUTPUT_BYTES, ...(signal ? { signal } : {}) });
  if (result.code !== 0 || result.timedOut) return 'NOT_A_VIDEO';
  try {
    const value = JSON.parse(result.stdout) as { format?: { duration?: unknown; format_name?: unknown }; streams?: { codec_type?: unknown }[] };
    const duration = Number(value.format?.duration);
    const formats = typeof value.format?.format_name === 'string' ? value.format.format_name.split(',') : [];
    if (!formats.includes(container)) return 'NOT_A_VIDEO';
    if (!Array.isArray(value.streams) || !value.streams.some(stream => stream?.codec_type === 'video') || !Number.isFinite(duration) || duration <= 0) return 'NOT_A_VIDEO';
    return Math.round(duration * 1000) / 1000;
  } catch { return 'NOT_A_VIDEO'; }
}

/** The run folder (created when missing); null when the media folder or the run folder is not a plain folder. */
async function prepareRunDir(config: VideoMediaConfig, runId: string): Promise<string | null> {
  const runDir = path.join(config.mediaDir, runId);
  try {
    const parent = await fs.lstat(config.mediaDir).catch(() => null);
    if (parent && !parent.isDirectory()) return null;
    await fs.mkdir(config.mediaDir, { recursive: true });
    let created = true;
    try { await fs.mkdir(runDir); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; created = false; }
    if (!(await fs.lstat(runDir)).isDirectory()) return null;
    // Only a folder this app just created gets the marker; an older or foreign folder stays on the ledger-only rule.
    if (created) await writeRunMarker(runDir);
    return runDir;
  } catch { return null; }
}

/** The fixed yt-dlp argument list of the subtitle read: same hardening and length filter as the download, no media download, only the
 * uploaded Vietnamese subtitle track in WebVTT, and one printed line `<id> <duration>` (printed only when the length filter passes). */
export function ytdlpSubtitleArgs(runDir: string, candidate: StepVideoWatchCandidate): string[] {
  return ['--ignore-config', '--no-cookies', '--no-cookies-from-browser', '--no-playlist', '--no-progress', '--no-mtime', '--restrict-filenames',
    '--match-filter', `duration<=${VIDEO_WATCH_MAX_SECONDS}`, '--skip-download', '--no-simulate', '--write-subs', '--no-write-auto-subs',
    '--sub-langs', VIDEO_WATCH_SUBTITLE_LANGUAGE, '--sub-format', 'vtt', '--print', '%(id)s %(duration)s',
    '-o', path.join(runDir, `${candidate.videoId}.%(ext)s`), '--', candidate.url];
}

export type DownloadedSubtitles = { readonly ok: true; readonly segments: readonly SubtitleSegment[]; readonly media: StepVideoWatchMedia }
  | { readonly ok: false; readonly reason: 'NO_SUBTITLES' | 'CANCELLED' };

/** The printed `<id> <duration>` line: exactly one line, the candidate's id, a length above 0 and at most 180 s. */
function printedDuration(stdout: string, videoId: string): number | null {
  const lines = stdout.split(/\r?\n/u).filter(line => line.trim() !== '');
  const match = lines.length === 1 ? /^([1-9][0-9]{0,19}) ([0-9]{1,6}(?:\.[0-9]{1,6})?)$/u.exec(lines[0]!.trim()) : null;
  if (!match || match[1] !== videoId) return null;
  const duration = Math.round(Number(match[2]) * 1000) / 1000;
  return Number.isFinite(duration) && duration > 0 && duration <= VIDEO_WATCH_MAX_SECONDS ? duration : null;
}

/** One subtitle read for one candidate, before any video download. Anything other than exactly one bounded `<id>.vie-VN.vtt` file that
 * passes the strict WebVTT read and one valid printed length is NO_SUBTITLES (the lane then downloads the video as before); every file left behind is then removed. A kept file
 * goes on the ledger like a video and is swept after 45 days. */
export async function downloadSubtitles(config: VideoMediaConfig, runner: ProcessRunner, now: () => Date, runId: string, candidate: StepVideoWatchCandidate,
  signal?: AbortSignal): Promise<DownloadedSubtitles> {
  if (!RUN_DIR.test(runId) || !/^[1-9][0-9]{0,19}$/.test(candidate.videoId)) return { ok: false, reason: 'NO_SUBTITLES' };
  if (signal?.aborted) return { ok: false, reason: 'CANCELLED' };
  const runDir = await prepareRunDir(config, runId);
  if (!runDir) return { ok: false, reason: 'NO_SUBTITLES' };
  const skip = async (reason: 'NO_SUBTITLES' | 'CANCELLED'): Promise<DownloadedSubtitles> => { await removeCandidateFiles(runDir, candidate.videoId); return { ok: false, reason }; };
  await removeCandidateFiles(runDir, candidate.videoId);
  const result = await runner(config.ytdlpBin, ytdlpSubtitleArgs(runDir, candidate), { timeoutMs: VIDEO_WATCH_SUBTITLE_TIMEOUT_MS, maxBytes: OUTPUT_BYTES, ...(signal ? { signal } : {}) });
  if (signal?.aborted) return skip('CANCELLED');
  if (result.timedOut || result.code !== 0) return skip('NO_SUBTITLES');
  const durationSeconds = printedDuration(result.stdout, candidate.videoId);
  const names = (await fs.readdir(runDir).catch(() => [] as string[])).filter(name => name.startsWith(`${candidate.videoId}.`));
  const name = `${candidate.videoId}.${VIDEO_WATCH_SUBTITLE_LANGUAGE}.vtt`;
  if (durationSeconds === null || names.length !== 1 || names[0] !== name) return skip('NO_SUBTITLES');
  const file = path.join(runDir, name), stat = await regularFile(file);
  if (!stat || stat.size === 0 || stat.size > SUBTITLE_MAX_BYTES) return skip('NO_SUBTITLES');
  const downloadedAt = now().toISOString();
  try {
    const bytes = new Uint8Array(await fs.readFile(file));
    const segments = bytes.byteLength === stat.size ? parseVttSubtitles(bytes, durationSeconds) : null;
    if (!segments) return skip('NO_SUBTITLES');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const ledger = await readLedger(runDir); ledger[name] = downloadedAt; await writeLedger(runDir, ledger);
    return { ok: true, segments, media: { sha256, byteSize: bytes.byteLength, durationSeconds, downloadedAt } };
  } catch { return skip('NO_SUBTITLES'); }
}

/** One download for one candidate. Every failure is a skip code; a skip never fails the run, and a skipped file is removed. */
export async function downloadVideo(config: VideoMediaConfig, runner: ProcessRunner, now: () => Date, runId: string, candidate: StepVideoWatchCandidate,
  signal?: AbortSignal): Promise<DownloadedVideo> {
  if (!RUN_DIR.test(runId) || !/^[1-9][0-9]{0,19}$/.test(candidate.videoId)) return { ok: false, reason: 'DOWNLOAD_FAILED' };
  if (signal?.aborted) return { ok: false, reason: 'CANCELLED' };
  const runDir = await prepareRunDir(config, runId);
  if (!runDir) return { ok: false, reason: 'DOWNLOAD_FAILED' };
  const skip = async (reason: VideoMediaSkip): Promise<DownloadedVideo> => { await removeCandidateFiles(runDir, candidate.videoId); return { ok: false, reason }; };
  await removeCandidateFiles(runDir, candidate.videoId);
  const result = await runner(config.ytdlpBin, ytdlpArgs(runDir, candidate), { timeoutMs: VIDEO_WATCH_DOWNLOAD_TIMEOUT_MS, maxBytes: OUTPUT_BYTES, ...(signal ? { signal } : {}) });
  if (signal?.aborted) return skip('CANCELLED');
  const said = `${result.stdout}\n${result.stderr}`;
  if (!result.timedOut && result.code !== 0 && NO_VIDEO_FORMAT.test(said)) return skip('NOT_A_VIDEO');
  if (result.timedOut || result.code !== 0) return skip('DOWNLOAD_FAILED');
  const names = (await fs.readdir(runDir).catch(() => [] as string[])).filter(name => name.startsWith(`${candidate.videoId}.`));
  if (names.length === 0) return skip(/does not pass filter/i.test(said) ? 'VIDEO_TOO_LONG' : /max-filesize|larger than/i.test(said) ? 'VIDEO_TOO_LARGE' : 'DOWNLOAD_FAILED');
  const match = names.length === 1 ? MEDIA_FILE.exec(names[0]!) : null;
  if (!match || match[1] !== candidate.videoId) return skip('NOT_A_VIDEO');
  const file = path.join(runDir, names[0]!), stat = await regularFile(file);
  if (!stat || stat.size === 0) return skip('NOT_A_VIDEO');
  if (stat.size > VIDEO_WATCH_MAX_BYTES) return skip('VIDEO_TOO_LARGE');
  const container = MIME[match[2]!];
  if (!container) return skip('NOT_A_VIDEO');
  const duration = await probe(config, runner, file, container.format, signal);
  if (signal?.aborted) return skip('CANCELLED');
  if (duration === 'NOT_A_VIDEO') return skip('NOT_A_VIDEO');
  if (duration > VIDEO_WATCH_MAX_SECONDS) return skip('VIDEO_TOO_LONG');
  const downloadedAt = now().toISOString();
  try {
    const sha256 = await sha256File(file);
    const ledger = await readLedger(runDir); ledger[names[0]!] = downloadedAt; await writeLedger(runDir, ledger);
    return { ok: true, file, mimeType: container.mimeType, media: { sha256, byteSize: stat.size, durationSeconds: duration, downloadedAt } };
  } catch { return skip('DOWNLOAD_FAILED'); }
}

/** Deletes media older than 45 days. Only regular `<runId>/<videoId>.<ext>` and `<runId>/<videoId>.vie-VN.vtt` files are touched and links are never followed:
 * - a file with a valid ledger entry goes by its recorded download time (any folder, as before);
 * - in a folder with the app's marker, a file with no valid entry (missing, corrupt or linked ledger) goes by its file time;
 * - in a folder without the marker (foreign, or made by the first deployed version) such a file is kept: it may be operator data.
 * A run folder left with only the ledger and the marker is removed. */
export async function sweepVideoMedia(mediaDir: string, now: Date): Promise<{ readonly deleted: number; readonly removedDirs: number }> {
  let deleted = 0, removedDirs = 0;
  const root = await fs.lstat(mediaDir).catch(() => null);
  if (!root || !root.isDirectory()) return { deleted, removedDirs };
  for (const entry of await fs.readdir(mediaDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || !RUN_DIR.test(entry.name)) continue;
    const runDir = path.join(mediaDir, entry.name);
    const dirStat = await fs.lstat(runDir).catch(() => null);
    if (!dirStat || !dirStat.isDirectory()) continue;
    const ledger = await readLedger(runDir);
    const marked = await hasRunMarker(runDir);
    let changed = false;
    const children = await fs.readdir(runDir, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      if (!child.isFile() || !keptFile(child.name)) continue;
      const file = path.join(runDir, child.name), stat = await regularFile(file);
      if (!stat) continue;
      const recorded = Object.hasOwn(ledger, child.name) ? Date.parse(ledger[child.name]!) : Number.NaN;
      // yt-dlp runs with --no-mtime, so the file time is the download time.
      const at = Number.isFinite(recorded) ? recorded : marked ? stat.mtimeMs : Number.NaN;
      if (!Number.isFinite(at) || now.getTime() - at <= RETENTION_MS) continue;
      try { await fs.unlink(file); deleted++; if (Object.hasOwn(ledger, child.name)) { delete ledger[child.name]; changed = true; } } catch { /* left for the next sweep */ }
    }
    const left = await fs.readdir(runDir).catch(() => null);
    if (!left) continue;
    if (left.every(name => name === LEDGER || name === RUN_MARKER)) {
      for (const name of left) if (await regularFile(path.join(runDir, name))) await fs.unlink(path.join(runDir, name)).catch(() => {});
      try { await fs.rmdir(runDir); removedDirs++; } catch { /* not empty after all (a linked ledger or marker is never removed) */ }
    } else if (changed) await writeLedger(runDir, ledger).catch(() => {});
  }
  return { deleted, removedDirs };
}
