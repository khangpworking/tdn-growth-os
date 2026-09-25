/** One batch of image uploads, run file by file. The callbacks are bound to the editing session that started it. */
export interface UploadRun {
  /** Local pre-check; returns a message when the file must not be sent. */
  readonly check: (file: File) => string | null;
  /** Uploads one file and resolves with its registered SHA-256. */
  readonly upload: (file: File) => Promise<string>;
  readonly onStart: () => void;
  readonly onUploaded: (mediaSha256: string) => void;
  readonly onEnd: () => void;
  /** Shows a per-file problem to the user. */
  readonly report: (message: string) => void;
}

export async function runUploads(files: readonly File[], run: UploadRun): Promise<void> {
  run.onStart();
  try {
    for (const file of files) {
      const blocker = run.check(file);
      if (blocker) { run.report(`${file.name}: ${blocker}`); continue; }
      try {
        run.onUploaded(await run.upload(file));
      } catch (error) {
        run.report(`${file.name}: ${error instanceof Error && error.message ? error.message : 'Không thể tải ảnh lên.'}`);
      }
    }
  } finally {
    run.onEnd();
  }
}
