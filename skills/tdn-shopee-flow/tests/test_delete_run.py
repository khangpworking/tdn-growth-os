"""Contract tests for `delete-run --run <id>` (F644 section 2).

Each test owns temp runs and state roots and calls the real command line.
Deletion is pure Python, so no node subprocess is involved.
"""
import fcntl
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import unittest
import uuid

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'shopee_flow.py'


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding='utf8')


def request_payload():
    return {'format': 'request-v1', 'preset': {'keywords': ['synthetic term']},
            'principalTitles': [], 'windows': [], 'reviewCapPerLink': 300}


def finished_state(run_id):
    return {'format': 'state-v1', 'runId': run_id, 'status': 'DONE', 'mode': 'flow', 'module': 'M3',
            'pid': None, 'startedAt': '2026-11-10T01:00:00Z', 'endedAt': '2026-11-10T02:00:00Z',
            'errorCode': None, 'failedCheck': None}


class DeleteRunTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        base = pathlib.Path(self._tmp.name)
        self.runs, self.state = base / 'runs', base / 'state'
        self.runs.mkdir()
        self.state.mkdir()
        self.base = base

    def env(self, extra=None):
        env = {k: v for k, v in os.environ.items()
               if not k.startswith('TDN_') and k not in ('SHOPEE_FLOW_RUNS', 'SHOPEE_FLOW_STATE', 'PYTHONPATH')}
        env.update({'SHOPEE_FLOW_RUNS': str(self.runs), 'SHOPEE_FLOW_STATE': str(self.state),
                    'PYTHONDONTWRITEBYTECODE': '1'})
        if extra:
            env.update(extra)
        return env

    def command(self, *args, extra_env=None):
        proc = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True,
                              env=self.env(extra_env), timeout=60)
        payload = json.loads(proc.stdout) if proc.stdout.strip() else None
        return proc.returncode, payload

    def make_run(self, run_id, state=None):
        run = self.runs / run_id
        write_json(run / 'request.json', request_payload())
        write_json(run / 'state.json', finished_state(run_id) if state is None else state)
        return run

    def test_delete_removes_the_run_folder_and_its_import_records(self):
        first = self.make_run('run-a1')
        second = self.make_run('run-b2')
        import_id, other_id = uuid.uuid4().hex, uuid.uuid4().hex
        write_json(self.runs / '.imports' / f'{import_id}.json',
                   {'format': 'metric-user-page-import-reservation-v1', 'importId': import_id,
                    'payloadSha256': 'a' * 64, 'runId': 'run-a1'})
        write_json(self.runs / '.imports' / f'{other_id}.json',
                   {'format': 'metric-user-page-import-reservation-v1', 'importId': other_id,
                    'payloadSha256': 'b' * 64, 'runId': 'run-b2'})

        rc, out = self.command('delete-run', '--run', 'run-a1')
        self.assertEqual(rc, 0, out)
        self.assertEqual(out, {'format': 'run-delete-v1', 'runId': 'run-a1', 'deleted': True})
        self.assertFalse(first.exists())
        self.assertTrue(second.exists(), 'another run must stay untouched')
        self.assertFalse((self.runs / '.imports' / f'{import_id}.json').exists())
        self.assertTrue((self.runs / '.imports' / f'{other_id}.json').exists())

        rc, out = self.command('runs')
        self.assertEqual(rc, 0, out)
        listed = {run['runId'] for run in out['runs']}
        self.assertNotIn('run-a1', listed)
        self.assertIn('run-b2', listed)

    def test_delete_refuses_a_run_whose_state_is_running(self):
        run = self.make_run('run-c3', state={**finished_state('run-c3'), 'status': 'RUNNING'})
        rc, out = self.command('delete-run', '--run', 'run-c3')
        self.assertEqual(rc, 20, out)
        self.assertEqual((out.get('code'), out.get('message')), ('RUN_ACTIVE', 'RUN_ACTIVE'))
        self.assertTrue(run.is_dir(), 'a refused delete must not remove anything')

    def test_delete_refuses_a_live_m3_attempt(self):
        run = self.make_run('run-d4')
        attempt = run / 'm3-custom' / 'attempts' / str(uuid.uuid4())
        write_json(attempt / 'state.json', {'format': 'review-attempt-state-v1', 'runId': 'run-d4',
                                            'status': 'RUNNING', 'pid': os.getpid()})
        rc, out = self.command('delete-run', '--run', 'run-d4')
        self.assertEqual(rc, 20, out)
        self.assertEqual(out.get('code'), 'RUN_ACTIVE')
        self.assertTrue(run.is_dir())

    def test_delete_refuses_an_unknown_or_escaping_run_id(self):
        for run_id in ('no-such-run', '../escape'):
            with self.subTest(run_id=run_id):
                rc, out = self.command('delete-run', '--run', run_id)
                self.assertEqual(rc, 2, out)
                self.assertEqual(out.get('code'), 'RUN_NOT_FOUND')

    def test_delete_refuses_a_symlinked_run_folder(self):
        target = self.base / 'outside'
        write_json(target / 'request.json', request_payload())
        (self.runs / 'run-e5').symlink_to(target, target_is_directory=True)
        rc, out = self.command('delete-run', '--run', 'run-e5')
        self.assertEqual(rc, 2, out)
        self.assertEqual(out.get('code'), 'RUN_NOT_FOUND')
        self.assertTrue(target.is_dir(), 'the symlink target must stay untouched')
        self.assertTrue((self.runs / 'run-e5').is_symlink())

    def test_delete_is_refused_in_read_only_mode(self):
        run = self.make_run('run-f6')
        rc, out = self.command('delete-run', '--run', 'run-f6',
                               extra_env={'TDN_SHOPEE_FLOW_READONLY': '1'})
        self.assertEqual(rc, 20, out)
        self.assertEqual(out.get('code'), 'READONLY_ON')
        self.assertTrue(run.is_dir())

    def test_delete_refuses_a_held_module_lock(self):
        run = self.make_run('run-g7')
        with open(run / '.module.lock', 'a') as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            rc, out = self.command('delete-run', '--run', 'run-g7')
        self.assertEqual(rc, 20, out)
        self.assertEqual(out.get('code'), 'RUN_ACTIVE')
        self.assertTrue(run.is_dir(), 'a run whose admission lock is held must stay intact')

    def test_delete_refuses_a_symlinked_imports_folder(self):
        run = self.make_run('run-h8')
        outside = self.base / 'outside-imports'
        outside.mkdir()
        record = outside / f'{uuid.uuid4().hex}.json'
        write_json(record, {'format': 'metric-user-page-import-reservation-v1',
                            'payloadSha256': 'c' * 64, 'runId': 'run-h8'})
        (self.runs / '.imports').symlink_to(outside, target_is_directory=True)
        rc, out = self.command('delete-run', '--run', 'run-h8')
        self.assertEqual(rc, 20, out)
        self.assertEqual(out.get('code'), 'RUN_DELETE_FAILED')
        self.assertTrue(record.exists(), 'nothing outside the runs root may be unlinked')
        self.assertTrue(run.is_dir())

    @unittest.skipIf(os.geteuid() == 0, 'directory permissions do not bind root')
    def test_delete_keeps_the_reservation_when_the_rename_fails(self):
        run = self.make_run('run-i9')
        import_id = uuid.uuid4().hex
        write_json(self.runs / '.imports' / f'{import_id}.json',
                   {'format': 'metric-user-page-import-reservation-v1',
                    'payloadSha256': 'd' * 64, 'runId': 'run-i9'})
        (self.runs / '.imports.lock').touch()
        mode = self.runs.stat().st_mode
        os.chmod(self.runs, 0o500)
        self.addCleanup(os.chmod, self.runs, mode)
        try:
            rc, out = self.command('delete-run', '--run', 'run-i9')
        finally:
            os.chmod(self.runs, mode)
        self.assertEqual(rc, 20, out)
        self.assertEqual(out.get('code'), 'RUN_DELETE_FAILED')
        self.assertTrue(run.is_dir())
        self.assertTrue((self.runs / '.imports' / f'{import_id}.json').is_file(),
                        'a failed rename must leave the reservation in place')

    def test_starter_fails_when_its_open_lock_is_no_longer_the_run_lock(self):
        run = self.make_run('run-j1')
        opened, release = self.base / 'lock-opened', self.base / 'lock-release'
        driver = (
            "import fcntl, importlib.util, os, sys, time, types\n"
            "spec = importlib.util.spec_from_file_location('shopee_flow', sys.argv[1])\n"
            "module = importlib.util.module_from_spec(spec)\n"
            "spec.loader.exec_module(module)\n"
            "real_flock, paused = fcntl.flock, []\n"
            "def flock(fd, operation):\n"
            "    if operation & fcntl.LOCK_EX and not paused:\n"
            "        paused.append(True)\n"
            "        open(sys.argv[3], 'w').close()\n"
            "        while not os.path.exists(sys.argv[4]):\n"
            "            time.sleep(0.01)\n"
            "    return real_flock(fd, operation)\n"
            "fcntl.flock = flock\n"
            "module.cmd_module(types.SimpleNamespace(cmd='run', run_id=sys.argv[2], manual=None, detach=False,\n"
            "                                        worker_lock_fd=None, worker_ready_fd=None, plan_sha256=None))\n"
        )
        starter = subprocess.Popen([sys.executable, '-c', driver, str(SCRIPT), 'run-j1', str(opened), str(release)],
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=self.env())
        self.addCleanup(starter.kill)
        deadline = time.monotonic() + 30
        while not opened.exists() and starter.poll() is None and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertTrue(opened.exists(), 'the starter did not reach its lock')

        rc, out = self.command('delete-run', '--run', 'run-j1')
        self.assertEqual(rc, 0, out)
        release.touch()
        stdout, stderr = starter.communicate(timeout=60)
        self.assertEqual(starter.returncode, 2, (stdout, stderr))
        self.assertEqual(json.loads(stdout.strip())['code'], 'RUN_NOT_FOUND')
        self.assertFalse(run.exists(), 'a starter holding a stale lock must not recreate the run folder')

    @unittest.skipIf(os.geteuid() == 0, 'directory permissions do not bind root')
    def test_failed_record_unlink_renames_the_run_back(self):
        run = self.make_run('run-k2')
        import_id = uuid.uuid4().hex
        record = self.runs / '.imports' / f'{import_id}.json'
        write_json(record, {'format': 'metric-user-page-import-reservation-v1',
                            'importId': import_id, 'payloadSha256': 'e' * 64, 'runId': 'run-k2'})
        inode = run.stat().st_ino
        mode = (self.runs / '.imports').stat().st_mode
        os.chmod(self.runs / '.imports', 0o500)
        self.addCleanup(os.chmod, self.runs / '.imports', mode)
        try:
            rc, out = self.command('delete-run', '--run', 'run-k2')
        finally:
            os.chmod(self.runs / '.imports', mode)
        self.assertEqual(rc, 20, out)
        self.assertEqual(out.get('code'), 'RUN_DELETE_FAILED')
        self.assertTrue(run.is_dir())
        self.assertEqual(run.stat().st_ino, inode, 'the same folder must be renamed back')
        self.assertEqual(json.loads(record.read_text())['runId'], 'run-k2',
                         'the reservation must stay in place')
        self.assertEqual([name for name in os.listdir(self.runs) if name.startswith('.deleted-')], [])


if __name__ == '__main__':
    unittest.main()
