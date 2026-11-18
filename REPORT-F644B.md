# Report F644B — delete a run (Part F, section 2)

Branch: `feat/shopee-delete-run` (worktree `~/lanes/shopee-step1-1711/fedora-b`).
Scope: contract section 2 only. No product selection, no `tools/shopee-desktop` changes.

## Files

- `skills/tdn-shopee-flow/scripts/shopee_flow.py`
  - new `flow_run_active(run)` helper: true when `state.json` is `RUNNING`, a detached worker
    (execution ledger record `RUNNING` with a live pid) is alive, an M3 attempt or count refresh
    (`m3-custom/attempts/*/state.json`, `review-counts/*/state.json`) is `RUNNING`/`UNCERTAIN`
    with a live worker, or a step 4 worker (`m4/<sha>/state.json`) is `RUNNING` with a live pid.
    Reuses `gate_read`, `gate_path`, `module_pid_live`.
  - new `cmd_delete_run(ns)` command.
  - subcommand table: `delete-run --run <id>` registered in `main()`, plus the JSON-usage list
    in `FlowArgumentParser.error`.
  - `import shutil` for folder removal.
- `skills/tdn-shopee-flow/tests/test_delete_run.py` (new): nine contract-row tests.

## Behaviour

`python3 skills/tdn-shopee-flow/scripts/shopee_flow.py delete-run --run <id>`

- Not detached; runs once and exits.
- Refusals (printed as `{"format":"error-v1","code":...}`):
  - `READONLY_ON` (exit 20) when `TDN_SHOPEE_FLOW_READONLY=1` or the READONLY file flag is present.
  - `RUN_NOT_FOUND` (exit 2) for an id that fails the existing run-id pattern, a missing folder,
    or a run folder that is a symlink / resolves outside the runs root.
  - `RUN_ACTIVE` (exit 20) when the run's `.module.lock` is held, or `flow_run_active` still sees a
    live owner (state `RUNNING`, live detached worker, live M3 attempt / count refresh, live step 4).
  - `RUN_DELETE_FAILED` (exit 20) when `.imports` is a symlink or not a real directory, or when the
    folder rename fails; nothing is changed in either case.
- On success, holding `.imports.lock` and the run's `.module.lock` (both released before removal):
  - rename the run folder to `<runsRoot>/.deleted-<runId>-<unix time>` (same filesystem, atomic), so
    `runs` / `runs-progress` (both skip dot folders) and every starter stop seeing the run;
  - unlink every `.imports/*.json` record whose `runId` equals the deleted run id through the
    already-open `.imports` directory fd (`O_NOFOLLOW`, regular files only, directory-relative unlink).
  - remove the renamed folder; a removal failure is ignored and the leftover dot folder stays
    harmless. Nothing else is touched: no presets, no collector jobs, no other runs, no other
    `.imports` records.
- Success output: `{"format":"run-delete-v1","runId":"<id>","deleted":true}` (exit 0).
- `runs` and `runs-progress` stop listing the run because the folder is gone.

## Tests and checks

- `python3 -m unittest discover -s skills/tdn-shopee-flow/tests -p 'test_delete_run.py' -v`
  → Ran 9 tests, OK. Rows:
  1. delete a finished run (folder + matching import record gone, other run and its import record
     untouched, `runs` no longer lists it);
  2. refuse a `RUNNING` state (exit 20, `RUN_ACTIVE`, folder intact);
  3. refuse a live M3 attempt (exit 20, `RUN_ACTIVE`, folder intact);
  4. refuse an unknown id and a path-escaping id (exit 2, `RUN_NOT_FOUND`);
  5. refuse a symlinked run folder (exit 2, `RUN_NOT_FOUND`, link and target intact);
  6. read-only mode refused (exit 20, `READONLY_ON`, folder intact);
  7. refuse a held `.module.lock` while `state.json` is finished (exit 20, `RUN_ACTIVE`, folder
     intact) — the admission lock alone blocks deletion;
  8. refuse a symlinked `.imports` (exit 20, `RUN_DELETE_FAILED`, the outside record and the run
     folder intact);
  9. a rename failure (runs root made read-only) returns `RUN_DELETE_FAILED` with the run folder and
     its reservation intact.
- `python3 -m unittest discover -s skills/tdn-shopee-flow/tests -p 'test_*.py'`
  → Ran 168 tests, OK (skipped=4).
- Manual smoke: a dot folder `.deleted-<id>-<time>` with a `request.json` is absent from both
  `runs` and `runs-progress` output.
- `/home/pkhang/opt/node-v24.14.0/bin/node scripts/typecheck.mjs` → exit 0.
- Node `--import tsx --test`: no `.ts`/`.tsx` test file changed in this part, so there were none to run.

## Not done

- No push, no PR, no deploy, no live-lane/service/collector/run-directory access.
- No product-selection work and no `tools/shopee-desktop` changes.

## Round-1 fix

Finding 1 (blocker, activity check raced admission): `delete-run` now takes the run's existing
`.module.lock` non-blockingly while holding `.imports.lock` (the same lock every module, count
refresh, step 4 and review-data save takes), returns `RUN_ACTIVE` when it is held, and re-runs
`flow_run_active` under that lock. The folder is renamed away while the lock is still held, so a
detached worker cannot be live at rename time, and any starter that reaches the old path afterwards
finds no run. Test row 7.

Finding 2 (major, `.imports` symlink escaped the runs root): `.imports` is rejected with
`RUN_DELETE_FAILED` when it is a symlink or not a real directory, before anything is changed. The
records are then read and unlinked through a `O_NOFOLLOW` directory fd opened before the rename,
with directory-relative `os.unlink(name, dir_fd=...)` and regular-file-only checks. Test row 8.

Finding 3 (major, reservation lost before a failed removal): the run folder is removed by renaming
it to `<runsRoot>/.deleted-<runId>-<unix time>` inside the runs root, which is atomic and reversible
by nothing else; reservations are unlinked only after that rename succeeds, and a failed rename
leaves folder and reservation untouched (`RUN_DELETE_FAILED`). `rmtree` of the renamed folder runs
after both locks are released and its failure is ignored, so a resend cannot reuse an import id
while a run still exists. Test row 9.

`runs` and `runs-progress` were checked: both filter folder names with the run-id pattern, which
excludes leading dots, so no listing change was needed.

## Round-2 fix

Exactly the three rules in the contract's Update 18/11 block. No deletion markers and no crash
recovery were added.

- Rule 1 (blocker, stale admission lock): new `module_lock_acquire(run, lock, blocking=False)`
  helper. It takes the flock, then compares `os.fstat(lock.fileno())` device/inode with
  `os.stat(<run>/.module.lock)`. A missing lock path (or a `gate_path` symlink refusal) or a
  different inode raises `RUN_NOT_FOUND` (exit 2) before any write, so a starter that opened the
  old lock cannot recreate the deleted folder or write into a replacement run. Used by every
  starter that takes or inherits the run lock: `cmd_module` (run/m1/m2/m3), `cmd_review_sampling`
  (sampling commands and the attempt worker hand-off), `cmd_review_data` (save/export),
  `cmd_review_process` (step 4 and its worker hand-off), and `flow_initialize_run` (launch
  initializer, blocking flock). A busy lock still returns `RUN_BUSY` (exit 24).
- Rule 2 (major, reservation lost after a failed unlink): after the folder rename, any unlink
  error (or a read/stat error in that block) renames the folder back to its original path and
  returns `RUN_DELETE_FAILED` (exit 20). The reservation and the run stay as they were; if the
  rename-back itself fails, the dot folder stays as before.
- Rule 3 (major, pathname read raced the pinned directory fd): each `.imports/*.json` candidate
  is opened with `O_NOFOLLOW` relative to the pinned `.imports` fd, read from that fd, required
  to be a regular file, and its `dev/ino` is re-checked with
  `os.stat(name, dir_fd=..., follow_symlinks=False)` against the opened fd immediately before
  `os.unlink(name, dir_fd=...)`. A replaced entry fails the deletion (rule-2 rollback) instead of
  unlinking another run's record; a symlink or non-regular entry is skipped, never unlinked.

### Round-2 tests

- `test_starter_fails_when_its_open_lock_is_no_longer_the_run_lock`: a `run` starter is paused
  between opening `.module.lock` and flocking; `delete-run` removes the run; when the starter
  resumes it exits 2 with `RUN_NOT_FOUND` and the run folder is not recreated.
- `test_failed_record_unlink_renames_the_run_back`: `.imports` is readable but not writable, so
  the unlink fails; `delete-run` returns 20 `RUN_DELETE_FAILED`, the same inode is back at the
  run path, the reservation file is intact and no `.deleted-*` folder remains.

Suites (same as above): delete-run 11 tests OK; full shopee-flow discover 170 tests OK
(skipped=4); `node scripts/typecheck.mjs` exit 0.

