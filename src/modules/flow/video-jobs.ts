import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

/**
 * Durable store for Video Factory jobs (ADR 0007, 055-Q2): claim, settle and sweep the
 * `flow_video_jobs` rows. Every state change is one committed transaction on the caller's
 * write connection; nothing here performs outside work and nothing retries (054 §3).
 */

export const VIDEO_PROJECT_STATES = ['stop_1', 'stop_2', 'voicing', 'rendering', 'stop_3', 'final'] as const;
export type VideoProjectState = (typeof VIDEO_PROJECT_STATES)[number];

export const VIDEO_JOB_KINDS = ['import', 'voice', 'render'] as const;
export type VideoJobKind = (typeof VIDEO_JOB_KINDS)[number];

export const VIDEO_JOB_STATES = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted'] as const;
export type VideoJobState = (typeof VIDEO_JOB_STATES)[number];

/** Safe codes only: never provider text, paths or machine details (055-Q4). */
export const VIDEO_JOB_ERROR_CODES = ['process_failed', 'timeout', 'cancelled_by_owner', 'interrupted_by_restart'] as const;
export type VideoJobErrorCode = (typeof VIDEO_JOB_ERROR_CODES)[number];
export type VideoJobFailureCode = Exclude<VideoJobErrorCode, 'cancelled_by_owner' | 'interrupted_by_restart'>;

export interface VideoProjectRecord {
  readonly projectId: string;
  readonly title: string;
  readonly state: VideoProjectState;
  readonly version: number;
  readonly hidden: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VideoJobRecord {
  readonly jobId: string;
  readonly projectId: string;
  readonly kind: VideoJobKind;
  readonly state: VideoJobState;
  readonly progress: number | null;
  readonly errorCode: VideoJobErrorCode | null;
  readonly entryState: VideoProjectState;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export interface VideoJobStore {
  /** Queued → running for the oldest queued job, in one committed transaction. */
  claimOldestQueued(): VideoJobRecord | undefined;
  /** Startup check only (read-only handles included): how many jobs are still running. */
  countRunning(): number;
  /** Running → succeeded with progress 100. */
  finish(jobId: string): VideoJobRecord;
  /** Running → failed with a safe code; the project returns to the job's entry state. */
  fail(jobId: string, errorCode: VideoJobFailureCode): VideoJobRecord;
  /** Queued/running → cancelled; the project returns to the job's entry state. A closed job is left unchanged. */
  cancel(jobId: string): VideoJobRecord | undefined;
  /** Every running job → interrupted with the restart reason; the projects return to their entry states. */
  sweepInterrupted(): number;
  /** Running → running with a higher progress value (055-Q23). */
  setProgress(jobId: string, progress: number): void;
  getJob(jobId: string): VideoJobRecord | undefined;
  listJobsByProject(projectId: string): readonly VideoJobRecord[];
  /** Queues a new job for a project; the caller owns project-state policy. */
  enqueue(projectId: string, kind: VideoJobKind, entryState: VideoProjectState): VideoJobRecord;
  getProject(projectId: string): VideoProjectRecord | undefined;
  updateProjectState(projectId: string, state: VideoProjectState): void;
}

interface JobRow {
  readonly job_id: string;
  readonly project_id: string;
  readonly kind: VideoJobKind;
  readonly state: VideoJobState;
  readonly progress: number | null;
  readonly error_code: VideoJobErrorCode | null;
  readonly entry_state: VideoProjectState;
  readonly created_at: string;
  readonly started_at: string | null;
  readonly finished_at: string | null;
}

interface ProjectRow {
  readonly project_id: string;
  readonly title: string;
  readonly state: VideoProjectState;
  readonly version: number;
  readonly hidden: number;
  readonly created_at: string;
  readonly updated_at: string;
}

const toJob = (row: JobRow): VideoJobRecord => ({
  jobId: row.job_id, projectId: row.project_id, kind: row.kind, state: row.state, progress: row.progress,
  errorCode: row.error_code, entryState: row.entry_state, createdAt: row.created_at, startedAt: row.started_at, finishedAt: row.finished_at,
});

const toProject = (row: ProjectRow): VideoProjectRecord => ({
  projectId: row.project_id, title: row.title, state: row.state, version: row.version, hidden: row.hidden === 1, createdAt: row.created_at, updatedAt: row.updated_at,
});

export function createVideoJobStore(options: { readonly db: Database.Database; readonly clock?: () => Date; readonly newId?: () => string }): VideoJobStore {
  const { db } = options;
  const clock = options.clock ?? (() => new Date());
  const newId = options.newId ?? randomUUID;
  const now = (): string => clock().toISOString();
  const getJobStmt = db.prepare('SELECT * FROM flow_video_jobs WHERE job_id = ?');
  const getProjectStmt = db.prepare('SELECT * FROM flow_video_projects WHERE project_id = ?');

  return {
    enqueue(projectId, kind, entryState) {
      const jobId = newId();
      const createdAt = now();
      db.prepare(`INSERT INTO flow_video_jobs(job_id, project_id, kind, state, entry_state, created_at) VALUES (?, ?, ?, 'queued', ?, ?)`)
        .run(jobId, projectId, kind, entryState, createdAt);
      return toJob(getJobStmt.get(jobId) as JobRow);
    },
    claimOldestQueued() {
      return db.transaction((): VideoJobRecord | undefined => {
        const row = db.prepare(`SELECT job_id, created_at FROM flow_video_jobs WHERE state = 'queued' ORDER BY created_at, job_id LIMIT 1`).get() as { job_id: string; created_at: string } | undefined;
        if (!row) return undefined;
        // A backwards clock must not violate started_at >= created_at.
        const current = now();
        const startedAt = current < row.created_at ? row.created_at : current;
        db.prepare(`UPDATE flow_video_jobs SET state = 'running', started_at = ? WHERE job_id = ? AND state = 'queued'`).run(startedAt, row.job_id);
        return toJob(getJobStmt.get(row.job_id) as JobRow);
      })();
    },
    countRunning() {
      return (db.prepare(`SELECT COUNT(*) AS count FROM flow_video_jobs WHERE state = 'running'`).get() as { count: number }).count;
    },
    finish(jobId) {
      db.transaction(() => {
        const row = getJobStmt.get(jobId) as JobRow | undefined;
        if (!row) throw new Error(`Video job ${jobId} is missing`);
        // A backwards clock must not violate finished_at >= created_at.
        const current = now();
        const finishedAt = current < row.created_at ? row.created_at : current;
        const result = db.prepare(`UPDATE flow_video_jobs SET state = 'succeeded', progress = 100, finished_at = ? WHERE job_id = ? AND state = 'running'`).run(finishedAt, jobId);
        if (result.changes !== 1) throw new Error(`Video job ${jobId} is not running`);
      })();
      return toJob(getJobStmt.get(jobId) as JobRow);
    },
    fail(jobId, errorCode) {
      db.transaction(() => {
        const row = getJobStmt.get(jobId) as JobRow | undefined;
        if (!row) throw new Error(`Video job ${jobId} is missing`);
        const current = now();
        const finishedAt = current < row.created_at ? row.created_at : current;
        const result = db.prepare(`UPDATE flow_video_jobs SET state = 'failed', error_code = ?, finished_at = ? WHERE job_id = ? AND state = 'running'`).run(errorCode, finishedAt, jobId);
        if (result.changes !== 1) throw new Error(`Video job ${jobId} is not running`);
        db.prepare(`UPDATE flow_video_projects SET state = ?, updated_at = ? WHERE project_id = ?`).run(row.entry_state, finishedAt, row.project_id);
      })();
      return toJob(getJobStmt.get(jobId) as JobRow);
    },
    cancel(jobId) {
      db.transaction(() => {
        const row = getJobStmt.get(jobId) as JobRow | undefined;
        if (!row || (row.state !== 'queued' && row.state !== 'running')) return;
        const current = now();
        const finishedAt = current < row.created_at ? row.created_at : current;
        const result = db.prepare(`UPDATE flow_video_jobs SET state = 'cancelled', error_code = 'cancelled_by_owner', finished_at = ? WHERE job_id = ? AND state IN ('queued', 'running')`).run(finishedAt, jobId);
        if (result.changes !== 1) throw new Error(`Video job ${jobId} changed state concurrently`);
        db.prepare(`UPDATE flow_video_projects SET state = ?, updated_at = ? WHERE project_id = ?`).run(row.entry_state, finishedAt, row.project_id);
      })();
      const row = getJobStmt.get(jobId) as JobRow | undefined;
      return row ? toJob(row) : undefined;
    },
    sweepInterrupted() {
      return db.transaction((): number => {
        const at = now();
        const running = db.prepare(`SELECT job_id, project_id, entry_state, created_at FROM flow_video_jobs WHERE state = 'running'`).all() as Array<{ job_id: string; project_id: string; entry_state: VideoProjectState; created_at: string }>;
        for (const row of running) {
          const finishedAt = at < row.created_at ? row.created_at : at;
          db.prepare(`UPDATE flow_video_jobs SET state = 'interrupted', error_code = 'interrupted_by_restart', finished_at = ? WHERE job_id = ? AND state = 'running'`).run(finishedAt, row.job_id);
          db.prepare(`UPDATE flow_video_projects SET state = ?, updated_at = ? WHERE project_id = ?`).run(row.entry_state, finishedAt, row.project_id);
        }
        return running.length;
      })();
    },
    setProgress(jobId, progress) {
      const result = db.prepare(`UPDATE flow_video_jobs SET progress = ? WHERE job_id = ? AND state = 'running'`).run(progress, jobId);
      if (result.changes !== 1) throw new Error(`Video job ${jobId} is not running`);
    },
    getJob(jobId) {
      const row = getJobStmt.get(jobId) as JobRow | undefined;
      return row ? toJob(row) : undefined;
    },
    listJobsByProject(projectId) {
      return (db.prepare('SELECT * FROM flow_video_jobs WHERE project_id = ? ORDER BY created_at, job_id').all(projectId) as JobRow[]).map(toJob);
    },
    getProject(projectId) {
      const row = getProjectStmt.get(projectId) as ProjectRow | undefined;
      return row ? toProject(row) : undefined;
    },
    updateProjectState(projectId, state) {
      const result = db.prepare('UPDATE flow_video_projects SET state = ?, updated_at = ? WHERE project_id = ?').run(state, now(), projectId);
      if (result.changes !== 1) throw new Error(`Video project ${projectId} is missing`);
    },
  };
}
