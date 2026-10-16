// Local media of the video-watch lane: one bounded yt-dlp download per candidate, one ffprobe read, and the 45-day sweep.
// Processes run without a shell, with a minimal environment that never carries a credential; media bytes never enter Foundation.
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { StepVideoWatchCandidate, StepVideoWatchMedia } from './model.js';

export const VIDEO_WATCH_MAX_SECONDS = 180;
/** 14 MiB keeps the one inline answer request body under ~19 MB. */
export const VIDEO_WATCH_MAX_BYTES = 14 * 1024 * 1024;
export const VIDEO_WATCH_DOWNLOAD_TIMEOUT_MS = 120_000;
export const VIDEO_WATCH_PROBE_TIMEOUT_MS = 30_000;
export const VIDEO_WATCH_RETENTION_DAYS = 45;
const RETENTION_MS = VIDEO_WATCH_RETENTION_DAYS * 86_400_000;
const OUTPUT_BYTES = 256 * 1024;
const LEDGER = '.video-watch-downloads.json';
const LEDGER_BYTES = 1024 * 1024;
const RUN_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MEDIA_FILE = /^([1-9][0-9]{0,19})\.(mp4|webm|mkv|mov|m4v)$/;
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

/** The fixed yt-dlp argument list: no config file, no cookies, one video, size and length filters, at most 720p (falling back to 480p), restricted file names. */
export function ytdlpArgs(runDir: string, candidate: StepVideoWatchCandidate): string[] {
  return ['--ignore-config', '--no-cookies', '--no-cookies-from-browser', '--no-playlist', '--no-progress', '--no-mtime', '--restrict-filenames',
    '--max-filesize', '14M', '--match-filter', `duration<=${VIDEO_WATCH_MAX_SECONDS}`, '-f', 'b[height<=720][filesize<14M]/b[height<=480]/b',
    '-o', path.join(runDir, `${candidate.videoId}.%(ext)s`), '--', candidate.url];
}

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
  for (const name of names) if (name.startsWith(`${videoId}.`) && await regularFile(path.join(runDir, name))) await fs.unlink(path.join(runDir, name)).catch(() => {});
}

async function readLedger(runDir: string): Promise<Record<string, string>> {
  const file = path.join(runDir, LEDGER), stat = await regularFile(file);
  if (!stat || stat.size > LEDGER_BYTES) return {};
  try {
    const value: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => MEDIA_FILE.test(entry[0]) && typeof entry[1] === 'string'));
  } catch { return {}; }
}
async function writeLedger(runDir: string, ledger: Record<string, string>): Promise<void> {
  await fs.writeFile(path.join(runDir, LEDGER), JSON.stringify(ledger));
}

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

/** One download for one candidate. Every failure is a skip code; a skip never fails the run, and a skipped file is removed. */
export async function downloadVideo(config: VideoMediaConfig, runner: ProcessRunner, now: () => Date, runId: string, candidate: StepVideoWatchCandidate,
  signal?: AbortSignal): Promise<DownloadedVideo> {
  if (!RUN_DIR.test(runId) || !/^[1-9][0-9]{0,19}$/.test(candidate.videoId)) return { ok: false, reason: 'DOWNLOAD_FAILED' };
  if (signal?.aborted) return { ok: false, reason: 'CANCELLED' };
  const runDir = path.join(config.mediaDir, runId);
  try {
    const parent = await fs.lstat(config.mediaDir).catch(() => null);
    if (parent && !parent.isDirectory()) return { ok: false, reason: 'DOWNLOAD_FAILED' };
    await fs.mkdir(runDir, { recursive: true });
    if (!(await fs.lstat(runDir)).isDirectory()) return { ok: false, reason: 'DOWNLOAD_FAILED' };
  } catch { return { ok: false, reason: 'DOWNLOAD_FAILED' }; }
  const skip = async (reason: VideoMediaSkip): Promise<DownloadedVideo> => { await removeCandidateFiles(runDir, candidate.videoId); return { ok: false, reason }; };
  await removeCandidateFiles(runDir, candidate.videoId);
  const result = await runner(config.ytdlpBin, ytdlpArgs(runDir, candidate), { timeoutMs: VIDEO_WATCH_DOWNLOAD_TIMEOUT_MS, maxBytes: OUTPUT_BYTES, ...(signal ? { signal } : {}) });
  if (signal?.aborted) return skip('CANCELLED');
  const said = `${result.stdout}\n${result.stderr}`;
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

/** Deletes media older than 45 days by recorded download time (file time when unrecorded). Only regular `<runId>/<videoId>.<ext>` files are
 * touched; links are never followed; a run folder left with no media is removed. */
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
    let changed = false;
    const children = await fs.readdir(runDir, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      if (!child.isFile() || !MEDIA_FILE.test(child.name)) continue;
      const file = path.join(runDir, child.name), stat = await regularFile(file);
      if (!stat) continue;
      const recorded = ledger[child.name] !== undefined ? Date.parse(ledger[child.name]!) : Number.NaN;
      const at = Number.isFinite(recorded) ? recorded : stat.mtimeMs;
      if (now.getTime() - at <= RETENTION_MS) continue;
      try { await fs.unlink(file); deleted++; if (ledger[child.name] !== undefined) { delete ledger[child.name]; changed = true; } } catch { /* left for the next sweep */ }
    }
    const left = await fs.readdir(runDir).catch(() => null);
    if (!left) continue;
    if (left.every(name => name === LEDGER)) {
      if (left.length && await regularFile(path.join(runDir, LEDGER))) await fs.unlink(path.join(runDir, LEDGER)).catch(() => {});
      try { await fs.rmdir(runDir); removedDirs++; } catch { /* not empty after all */ }
    } else if (changed) await writeLedger(runDir, ledger).catch(() => {});
  }
  return { deleted, removedDirs };
}
