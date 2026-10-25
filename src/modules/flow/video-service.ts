import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { createVideoJobStore, type VideoJobKind, type VideoJobRecord, type VideoJobStore, type VideoProjectRecord, type VideoProjectState } from './video-jobs.js';

/**
 * Workflow state and policy over the video job store (ADR 0007): projects, job starts, owner retry
 * and owner cancel. The worker claims through this service; nothing here re-runs a job by itself
 * (054 §3) — a retry always enqueues a new queued job for the same step.
 */

export class VideoProjectNotFoundError extends Error {
  constructor(readonly projectId: string) {
    super(`Video project ${projectId} is missing`);
    this.name = 'VideoProjectNotFoundError';
  }
}

export class VideoJobNotFoundError extends Error {
  constructor(readonly jobId: string) {
    super(`Video job ${jobId} is missing`);
    this.name = 'VideoJobNotFoundError';
  }
}

/** The project already has queued or running work, or the job cannot be retried. */
export class VideoJobConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoJobConflictError';
  }
}

/** Project state while a job of this kind runs; import leaves the project state unchanged. */
const RUNNING_STATE: Readonly<Record<VideoJobKind, VideoProjectState | undefined>> = { import: undefined, voice: 'voicing', render: 'rendering' };

export interface VideoService {
  createProject(input: { readonly title: string }): VideoProjectRecord;
  getProject(projectId: string): VideoProjectRecord | undefined;
  getJob(jobId: string): VideoJobRecord | undefined;
  listJobs(projectId: string): readonly VideoJobRecord[];
  /** Enqueues one job for the project and moves it to its running state (055-Q1). */
  startJob(projectId: string, kind: VideoJobKind): VideoJobRecord;
  /** Owner retry: a new queued job for the same step, never an automatic one (054 §3). */
  retryJob(jobId: string): VideoJobRecord;
  cancelJob(jobId: string): VideoJobRecord;
  /** Shutdown path: the running job becomes interrupted, never owner-cancelled (055-Q1). */
  interruptJob(jobId: string): VideoJobRecord;
  /** Worker entry point: claims the oldest queued job (queued → running, committed before outside work). */
  claimNextJob(): VideoJobRecord | undefined;
  finishJob(jobId: string): VideoJobRecord;
  failJob(jobId: string, errorCode: 'process_failed' | 'timeout'): VideoJobRecord;
}

export function createVideoService(options: { readonly db: Database.Database; readonly clock?: () => Date; readonly newId?: () => string; readonly onWake?: () => void; readonly onCancel?: (jobId: string) => void }): VideoService {
  const jobs: VideoJobStore = createVideoJobStore(options);
  const newId = options.newId ?? randomUUID;
  const now = options.clock ?? ((): Date => new Date());
  const db = options.db;
  // The worker is created after this service, so both callbacks read it lazily.
  const wake = options.onWake ?? (() => undefined);
  const onCancel = options.onCancel ?? (() => undefined);

  return {
    createProject(input) {
      const projectId = newId();
      const createdAt = now().toISOString();
      db.prepare(`INSERT INTO flow_video_projects(project_id, title, state, version, hidden, created_at, updated_at) VALUES (?, ?, 'stop_1', 1, 0, ?, ?)`)
        .run(projectId, input.title, createdAt, createdAt);
      return jobs.getProject(projectId)!;
    },
    getProject(projectId) { return jobs.getProject(projectId); },
    getJob(jobId) { return jobs.getJob(jobId); },
    listJobs(projectId) { return jobs.listJobsByProject(projectId); },
    startJob(projectId, kind) {
      const project = jobs.getProject(projectId);
      if (!project) throw new VideoProjectNotFoundError(projectId);
      if (project.hidden) throw new VideoJobConflictError(`Video project ${projectId} is hidden; restore it before starting work`);
      if (jobs.listJobsByProject(projectId).some(job => job.state === 'queued' || job.state === 'running')) {
        throw new VideoJobConflictError(`Video project ${projectId} already has queued or running work`);
      }
      const job = jobs.enqueue(projectId, kind, project.state);
      const runningState = RUNNING_STATE[kind];
      if (runningState) jobs.updateProjectState(projectId, runningState);
      wake();
      return job;
    },
    retryJob(jobId) {
      const previous = jobs.getJob(jobId);
      if (!previous) throw new VideoJobNotFoundError(jobId);
      if (previous.state !== 'failed' && previous.state !== 'cancelled' && previous.state !== 'interrupted') {
        throw new VideoJobConflictError(`Video job ${jobId} is ${previous.state}; only a closed job can be retried`);
      }
      const project = jobs.getProject(previous.projectId);
      if (!project) throw new VideoProjectNotFoundError(previous.projectId);
      if (project.hidden) throw new VideoJobConflictError(`Video project ${project.projectId} is hidden; restore it before retrying`);
      if (jobs.listJobsByProject(project.projectId).some(job => job.state === 'queued' || job.state === 'running')) {
        throw new VideoJobConflictError(`Video project ${project.projectId} already has queued or running work`);
      }
      const job = jobs.enqueue(previous.projectId, previous.kind, previous.entryState);
      const runningState = RUNNING_STATE[previous.kind];
      if (runningState) jobs.updateProjectState(previous.projectId, runningState);
      wake();
      return job;
    },
    cancelJob(jobId) {
      const before = jobs.getJob(jobId);
      const job = jobs.cancel(jobId);
      if (!job) throw new VideoJobNotFoundError(jobId);
      // Only a real transition stops outside work; a closed job was already settled.
      if (before && before.state !== job.state) onCancel(jobId);
      return job;
    },
    interruptJob(jobId) {
      const job = jobs.interrupt(jobId);
      if (!job) throw new VideoJobNotFoundError(jobId);
      return job;
    },
    claimNextJob() { return jobs.claimOldestQueued(); },
    finishJob(jobId) { return jobs.finish(jobId); },
    failJob(jobId, errorCode) { return jobs.fail(jobId, errorCode); },
  };
}
