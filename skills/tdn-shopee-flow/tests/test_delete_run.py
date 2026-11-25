"""Contract tests for `delete-run --run <id>` (F644 section 2).

Each test owns temp runs and state roots and calls the real command line.
Deletion is pure Python, so no node subprocess is involved.
"""
import fcntl
import hashlib
import contextlib
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import uuid
from unittest import mock

from test_sampling import sampling_child

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
        self._tmp = tempfile.TemporaryDirectory(dir=SCRIPT.parents[3])
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

        # R2 cleanup is part of this deletion contract; it cannot change the receipt above.
        # Execute in-process so the actual urllib HTTP layer is replaced, including on failure.
        cases = [(case, where) for case in ('deleted', 'http failure', 'not configured')
                 for where in ('new', 'old', 'damaged new + old')]
        for case, where in cases:
            with self.subTest(r2=case, record=where):
                run_id = 'run-r2'
                run = self.make_run(run_id)
                if where == 'damaged new + old':
                    write_json(run / 'metric-shot-r2.json', {  # every field, wrong type: must not stop the fallback
                        'key': f'metric-shots/{run_id}/{"0" * 64}.webp', 'sha256': '0' * 64, 'byteSize': 23,
                        'contentType': ['image/webp'], 'uploadedAt': '2099-01-01T00:00:00Z',
                        'deleteAfter': '2099-01-11T00:00:00Z'})
                # new: <run>/metric-shot-r2.json; old: <run>/m1/ (runs of 24–25/11)
                write_json(run / 'metric-shot-r2.json' if where == 'new' else run / 'm1' / 'metric-shot-r2.json', {
                    'key': f'metric-shots/{run_id}/{"0" * 64}.webp', 'sha256': '0' * 64, 'byteSize': 23,
                    'contentType': 'image/webp', 'uploadedAt': '2099-01-01T00:00:00Z',
                    'deleteAfter': '2099-01-11T00:00:00Z'})
                credentials = self.base / 'synthetic-r2.env'
                credentials.write_text('R2_ACCOUNT_ID=synthetic\nR2_BUCKET=synthetic-bucket\n'
                    'R2_ACCESS_KEY_ID=SYNTHETICKEY\nR2_SECRET_ACCESS_KEY=NOT_A_SECRET_SYNTHETIC_TEST_ONLY\n',
                    encoding='utf-8')
                if case == 'not configured':
                    credentials.unlink()
                response = io.BytesIO()
                response.status, response.headers = 204, {}
                failure = urllib.error.URLError('synthetic storage failure') if case == 'http failure' else None
                output = io.StringIO()
                with mock.patch.dict(os.environ, self.env({'TDN_METRIC_SHOTS_R2_FILE': str(credentials)}), clear=True):
                    spec = importlib.util.spec_from_file_location('delete_run_r2', SCRIPT)
                    flow = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(flow)
                    with mock.patch('urllib.request.urlopen', return_value=response, side_effect=failure) as http, \
                            mock.patch.object(sys, 'argv', [str(SCRIPT), 'delete-run', '--run', run_id]), \
                            contextlib.redirect_stdout(output):
                        flow.main()
                self.assertEqual(json.loads(output.getvalue()), {'format': 'run-delete-v1', 'runId': run_id, 'deleted': True})
                self.assertFalse(run.exists())
                if case == 'not configured':
                    http.assert_not_called()
                else:
                    self.assertEqual(http.call_count, 1)
                    request = http.call_args.args[0]
                    self.assertEqual(request.get_method(), 'DELETE')
                    self.assertEqual(request.full_url, f'https://synthetic.r2.cloudflarestorage.com/'
                        f'synthetic-bucket/metric-shots/{run_id}/{"0" * 64}.webp')

    def test_delete_refuses_a_run_whose_state_is_running(self):
        with subprocess.Popen([sys.executable, '-c', 'pass'], env=self.env()) as child:
            self.assertEqual(child.wait(timeout=10), 0)
        for worker, pid in (('live', os.getpid()), ('dead', child.pid), ('null', None)):
            with self.subTest(worker=worker):
                run_id = f'run-c3-{worker}'
                run = self.make_run(run_id, state={**finished_state(run_id), 'status': 'RUNNING',
                                                   'pid': pid, 'endedAt': None})
                state_bytes = (run / 'state.json').read_bytes()
                rc, out = self.command('delete-run', '--run', run_id)
                if worker == 'live':
                    self.assertEqual(rc, 20, out)
                    self.assertEqual((out.get('code'), out.get('message')), ('RUN_ACTIVE', 'RUN_ACTIVE'))
                    self.assertTrue(run.is_dir(), 'a refused delete must not remove anything')
                    self.assertEqual((run / 'state.json').read_bytes(), state_bytes)
                else:
                    self.assertEqual(rc, 0, out)
                    self.assertEqual(out, {'format': 'run-delete-v1', 'runId': run_id, 'deleted': True})
                    self.assertFalse(run.exists(), 'a stale RUNNING state must not block deletion')

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

        # The collector has not published its PID: every durable owner still names Python.
        write_json(run / 'm2' / 'selection.json', {'format': 'selection-v1', 'runId': run.name})
        digest = hashlib.sha256((run / 'm2' / 'selection.json').read_bytes()).hexdigest()
        write_json(run / 'gates' / 'm2.json', {'format': 'handoff-v1', 'module': 'M2',
                   'runId': run.name, 'verdict': 'PASS', 'outputSha256': digest})
        with sampling_child(run, self.base, self.env()) as child:
            child.parent.kill()
            child.parent.wait(timeout=10)
            self.assertEqual(child.info['parentPid'], child.parent.pid)
            marks = [run / 'state.json', *sorted((run / 'executions').glob('*.json')),
                     *sorted((run / 'm3-custom' / 'attempts').glob('*/state.json'))]
            self.assertEqual(len(marks), 3, 'run, execution and attempt owners must all exist')
            before = {path: path.read_bytes() for path in marks}
            for path in marks:
                self.assertEqual(json.loads(before[path])['pid'], child.parent.pid)
            os.kill(child.info['pid'], 0)
            rc, out = self.command('delete-run', '--run', run.name)
            self.assertEqual((rc, out.get('code')), (20, 'RUN_ACTIVE'), out)
            self.assertEqual({path: path.read_bytes() for path in marks}, before)
            child.finish()
            rc, out = self.command('delete-run', '--run', run.name)
            self.assertEqual(rc, 0, out)
            self.assertEqual(out, {'format': 'run-delete-v1', 'runId': run.name, 'deleted': True})
            self.assertFalse(run.exists())

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
    def test_failed_record_move_renames_the_run_back(self):
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

    @unittest.skipIf(os.geteuid() == 0, 'file permissions do not bind root')
    def test_unreadable_import_record_renames_the_run_back(self):
        run = self.make_run('run-l3')
        import_id = uuid.uuid4().hex
        record = self.runs / '.imports' / f'{import_id}.json'
        write_json(record, {'format': 'metric-user-page-import-reservation-v1',
                            'importId': import_id, 'payloadSha256': 'f' * 64, 'runId': 'run-l3'})
        inode = run.stat().st_ino
        os.chmod(record, 0o000)
        self.addCleanup(os.chmod, record, 0o600)
        rc, out = self.command('delete-run', '--run', 'run-l3')
        self.assertEqual(rc, 20, out)
        self.assertEqual(out.get('code'), 'RUN_DELETE_FAILED')
        self.assertTrue(run.is_dir())
        self.assertEqual(run.stat().st_ino, inode, 'the same folder must be renamed back')
        self.assertTrue(record.is_file(), 'an unreadable reservation must not be dropped')
        self.assertEqual([name for name in os.listdir(self.runs) if name.startswith('.deleted-')], [])

    def test_move_failure_after_one_record_puts_every_record_back(self):
        run = self.make_run('run-p7')
        records = {}
        for index in range(2):
            import_id = uuid.uuid4().hex
            path = self.runs / '.imports' / f'{import_id}.json'
            write_json(path, {'format': 'metric-user-page-import-reservation-v1', 'importId': import_id,
                              'payloadSha256': str(index) * 64, 'runId': 'run-p7'})
            records[path.name] = (path.read_bytes(), path.stat().st_ino)
        inode = run.stat().st_ino
        driver = (
            "import importlib.util, os, sys, types\n"
            "spec = importlib.util.spec_from_file_location('shopee_flow', sys.argv[1])\n"
            "module = importlib.util.module_from_spec(spec)\n"
            "spec.loader.exec_module(module)\n"
            "real, moves = os.rename, []\n"
            "def rename(src, dst, *args, **kwargs):\n"
            "    if kwargs.get('src_dir_fd') is not None and kwargs.get('dst_dir_fd') is not None:\n"
            "        moves.append(src)\n"
            "        if len(moves) == 2:\n"
            "            raise PermissionError('synthetic move failure')\n"
            "    return real(src, dst, *args, **kwargs)\n"
            "os.rename = rename\n"
            "module.cmd_delete_run(types.SimpleNamespace(run_id='run-p7'))\n"
        )
        proc = subprocess.run([sys.executable, '-c', driver, str(SCRIPT)], capture_output=True,
                              text=True, env=self.env(), timeout=60)
        out = json.loads(proc.stdout.strip())
        self.assertEqual(proc.returncode, 20, out)
        self.assertEqual(out.get('code'), 'RUN_DELETE_FAILED')
        self.assertTrue(run.is_dir())
        self.assertEqual(run.stat().st_ino, inode, 'the same folder must be renamed back')
        self.assertEqual({path.name: (path.read_bytes(), path.stat().st_ino)
                          for path in (self.runs / '.imports').iterdir()}, records,
                         'both records must be back under their names with their inodes')
        self.assertEqual([name for name in os.listdir(self.runs) if name.startswith('.deleted-')], [])

    def test_failed_rollback_keeps_the_run_hidden_and_finishes_the_delete(self):
        run = self.make_run('run-q8')
        records = []
        for index in range(2):
            import_id = uuid.uuid4().hex
            path = self.runs / '.imports' / f'{import_id}.json'
            write_json(path, {'format': 'metric-user-page-import-reservation-v1', 'importId': import_id,
                              'payloadSha256': str(index) * 64, 'runId': 'run-q8'})
            records.append(path)
        driver = (
            "import importlib.util, os, sys, types\n"
            "spec = importlib.util.spec_from_file_location('shopee_flow', sys.argv[1])\n"
            "module = importlib.util.module_from_spec(spec)\n"
            "spec.loader.exec_module(module)\n"
            "real, moves = os.rename, []\n"
            "def rename(src, dst, *args, **kwargs):\n"
            "    if kwargs.get('src_dir_fd') is not None and kwargs.get('dst_dir_fd') is not None:\n"
            "        moves.append(src)\n"
            "        if len(moves) in (2, 3):\n"
            "            raise OSError('synthetic move failure')\n"
            "    return real(src, dst, *args, **kwargs)\n"
            "os.rename = rename\n"
            "module.cmd_delete_run(types.SimpleNamespace(run_id='run-q8'))\n"
        )
        proc = subprocess.run([sys.executable, '-c', driver, str(SCRIPT)], capture_output=True,
                              text=True, env=self.env(), timeout=60)
        out = json.loads(proc.stdout.strip())
        self.assertEqual(proc.returncode, 0, out)
        self.assertEqual(out, {'format': 'run-delete-v1', 'runId': 'run-q8', 'deleted': True,
                               'leftover': True})
        self.assertFalse(run.exists(), 'a failed rollback must not restore the run')
        self.assertEqual([path.name for path in records if path.exists()], [],
                         'no reservation for this run may stay in .imports')
        hidden = [name for name in os.listdir(self.runs) if name.startswith('.deleted-')]
        self.assertEqual(len(hidden), 1, 'the hidden folder with the staged records must stay')

    def test_delete_sweeps_a_leftover_even_when_the_run_is_unknown(self):
        write_json(self.runs / '.deleted-run-gone-1' / 'request.json', request_payload())
        import_id = uuid.uuid4().hex
        record = self.runs / '.imports' / f'{import_id}.json'
        write_json(record, {'format': 'metric-user-page-import-reservation-v1',
                            'payloadSha256': 'a' * 64, 'runId': 'run-gone'})
        rc, out = self.command('delete-run', '--run', 'no-such-run')
        self.assertEqual(rc, 2, out)
        self.assertEqual(out.get('code'), 'RUN_NOT_FOUND')
        self.assertFalse((self.runs / '.deleted-run-gone-1').exists(),
                         'the sweep must run before the run existence check')
        self.assertTrue(record.is_file(), 'a sweeping retry must not touch import records')

    @unittest.skipIf(os.geteuid() == 0, 'directory permissions do not bind root')
    def test_failed_cleanup_reports_a_leftover_folder(self):
        run = self.make_run('run-m4')
        locked = run / 'nested'
        locked.mkdir()
        (locked / 'data.txt').write_text('x', encoding='utf8')
        os.chmod(locked, 0o500)

        def restore():
            for parent, folders, _ in os.walk(self.runs):
                for name in folders:
                    try:
                        os.chmod(os.path.join(parent, name), 0o700)
                    except OSError:
                        pass
        self.addCleanup(restore)

        rc, out = self.command('delete-run', '--run', 'run-m4')
        self.assertEqual(rc, 0, out)
        self.assertEqual(out, {'format': 'run-delete-v1', 'runId': 'run-m4', 'deleted': True,
                               'leftover': True})
        self.assertFalse(run.exists())
        self.assertTrue(any(name.startswith('.deleted-') for name in os.listdir(self.runs)),
                        'the folder that could not be removed must stay as a leftover')

    def test_delete_removes_a_previous_leftover_folder(self):
        write_json(self.runs / '.deleted-run-old-1' / 'request.json', request_payload())
        write_json(self.runs / '.imports' / f'{uuid.uuid4().hex}.json',
                   {'format': 'metric-user-page-import-reservation-v1',
                    'payloadSha256': 'a' * 64, 'runId': 'run-old'})
        self.make_run('run-n5')
        self.make_run('run-o6')

        rc, out = self.command('delete-run', '--run', 'run-n5')
        self.assertEqual(rc, 0, out)
        self.assertEqual(out.get('leftover'), None, 'a clean delete reports no leftover')
        self.assertFalse((self.runs / '.deleted-run-old-1').exists(),
                         'every delete-run call first removes leftover folders')
        self.assertTrue((self.runs / 'run-o6').is_dir(), 'other runs must stay untouched')
        self.assertTrue((self.runs / '.imports').is_dir(), 'the .imports folder must stay')


if __name__ == '__main__':
    unittest.main()
