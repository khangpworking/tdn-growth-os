"""F651 rank 1 and 2: the run-view disk copy and the prefetch of settled rows, in the bridge."""

import json
import os
import pathlib
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import tdn_shopee_app  # noqa: E402

TOKEN = 'synthetic-token-f651'
INSIGHTS = {'format': 'review-insights-v2', 'runId': None, 'codebookVersion': 'v1', 'sources': []}


def parts(run_id, status='DONE', state='IDLE', revision=3):
    return {
        'info': {'format': 'run-info-v1', 'runId': run_id, 'modules': [], 'state': {'status': state},
                 'execution': {'status': status, 'revision': revision}},
        'sampling': {'format': 'review-sampling-view-v1', 'runId': run_id},
        'reviewData': {'format': 'review-data-view-v1', 'runId': run_id, 'readonly': False, 'tracking': {}, 'db': {},
                       'sources': []},
        'outputs': {'format': 'module-outputs-v1', 'runId': run_id},
        'process': {'format': 'review-process-view-v1', 'runId': run_id, 'autoRun': False, 'labelUnresolved': False,
                    'sources': []},
        'stats': {'format': 'review-stats-v1', 'runId': run_id, 'sources': []},
        'insights': dict(INSIGHTS, runId=run_id),
    }


def server_view(run_id, values, errors=None):
    return {'ok': True, 'data': {'format': 'run-view-v1', 'runId': run_id, 'parts': values, 'errors': errors or {}}}


class RunViewCopyTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = pathlib.Path(folder.name)
        config = self.root / 'config.json'
        config.write_text(json.dumps({
            'sshCommand': ['C:\\TDN\\tdn-tunnel-client.exe', '--url', 'https://relay.example:8443', '--token', TOKEN],
            'remoteScript': '$HOME/tdn/shopee_flow.py', 'runsRoot': '/srv/runs', 'timeoutSeconds': 5}), encoding='utf-8')
        env = mock.patch.dict(os.environ, {'TDN_SHOPEE_APP_CONFIG': str(config)})
        env.start()
        self.addCleanup(env.stop)
        self.api = tdn_shopee_app.Api()
        self.calls = []
        self.answers = {}           # (command, runId or None) -> reply, or a callable giving it
        invoke = mock.patch.object(self.api, '_invoke_now', self.fake_invoke)
        invoke.start()
        self.addCleanup(invoke.stop)

    def fake_invoke(self, action, config, lines, argv, token=None, timeout=None):
        words = lines[-1].split()
        run_id = words[words.index('--run') + 1] if '--run' in words else None
        self.calls.append((action, run_id, '--result' in words, threading.current_thread().name))
        answer = self.answers.get((action, run_id), self.answers.get((action, None)))
        return answer() if callable(answer) else answer

    def files(self):
        return sorted(path.relative_to(self.root).as_posix() for path in self.root.glob('run-view-cache/*/*.json'))

    def save(self, run_id, **kind):
        self.answers[('runView', run_id)] = server_view(run_id, parts(run_id, **kind))
        result = self.api.runView(run_id, True)
        self.assertTrue(result['ok'], result)
        return result

    def run_views(self):
        return [call for call in self.calls if call[0] == 'runView']

    def wait_prefetch(self):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            with self.api._prefetch:
                if not self.api._prefetch_running:
                    return
            time.sleep(0.01)
        self.fail('the prefetch did not end')

    def test_copy_saved_or_not(self):
        """| fresh read                                                   | disk copy                                   |
        |--------------------------------------------------------------|---------------------------------------------|
        | --result, every part ok, execution DONE                      | saved at run-view-cache/<16 hex>/<runId>.json;|
        |                                                              | runViewCached gives it with no remote call; |
        |                                                              | the token is in neither the path nor the file|
        | no --result / a part error / execution RUNNING / state       | not saved                                   |
        | UNCERTAIN / an older server (USAGE)                          |                                             |
        """
        with self.subTest('saved'):
            fresh = self.save('run-1')
            self.assertEqual(len(self.files()), 1)
            path = self.files()[0]
            self.assertRegex(path, r'^run-view-cache/[0-9a-f]{16}/run-1\.json$')
            text = (self.root / path).read_text(encoding='utf-8')
            self.assertNotIn(TOKEN, path + text)
            before = len(self.calls)
            self.assertEqual(self.api.runViewCached('run-1'), {'ok': True, 'data': fresh['data']})
            self.assertEqual(len(self.calls), before, 'no remote call')
        cases = {
            'no --result': lambda: self.api.runView('run-2', False),
            'a part error': lambda: self.api.runView('run-3', True),
            'running': lambda: self.api.runView('run-4', True),
            'uncertain': lambda: self.api.runView('run-5', True),
            'older server': lambda: self.api.runView('run-6', True),
        }
        values = parts('run-3')
        del values['stats']
        self.answers.update({
            ('runView', 'run-2'): server_view('run-2', {name: value for name, value in parts('run-2').items()
                                                        if name not in ('stats', 'insights')}),
            ('runView', 'run-3'): server_view('run-3', values, {'stats': {'code': 'STATS_FAILED', 'message': 'x'}}),
            ('runView', 'run-4'): server_view('run-4', parts('run-4', status='RUNNING')),
            ('runView', 'run-5'): server_view('run-5', parts('run-5', state='UNCERTAIN')),
            ('runView', 'run-6'): {'ok': False, 'error': {'code': 'USAGE', 'message': 'USAGE'}},
        })
        for name, call in cases.items():
            with self.subTest(name):
                call()
                self.assertEqual(len(self.files()), 1, name)

    def test_copy_removed(self):
        """| event                                                       | disk copy                                   |
        |--------------------------------------------------------------|---------------------------------------------|
        | the run deleted (deleteRun ok)                               | removed                                     |
        | the fresh read answers RUN_NOT_FOUND                         | removed                                     |
        | the newest run list does not have the run                    | removed (a listed run keeps its copy)       |
        | the copy was saved by another app version / fails a check   | not given, removed                          |
        | more than 300 files                                          | the oldest removed                          |
        """
        with self.subTest('deleted'):
            self.save('run-1')
            self.answers[('deleteRun', 'run-1')] = {'ok': True, 'data': {'format': 'run-delete-v1', 'runId': 'run-1',
                                                                          'deleted': True}}
            with mock.patch.object(self.api, '_local_metric_shot', return_value=None):
                self.assertTrue(self.api.deleteRun('run-1')['ok'])
            self.assertEqual(self.files(), [])
        with self.subTest('RUN_NOT_FOUND'):
            self.save('run-1')
            self.answers[('runView', 'run-1')] = {'ok': False, 'error': {'code': 'RUN_NOT_FOUND', 'message': 'x'}}
            self.api.runView('run-1', True)
            self.assertEqual(self.files(), [])
        with self.subTest('not listed'):
            self.save('run-1')
            self.save('run-2')
            self.answers[('runs', None)] = {'ok': True, 'data': {'format': 'runs-v1', 'runs': [{'runId': 'run-2'}]}}
            self.api.listRuns()
            self.assertEqual([path.rsplit('/', 1)[1] for path in self.files()], ['run-2.json'])
        with self.subTest('another app version'):
            self.save('run-1')
            with mock.patch.object(tdn_shopee_app, '_app_version', return_value='another-build'):
                self.assertEqual(self.api.runViewCached('run-1'), {'ok': True, 'data': None})
            self.assertNotIn('run-1.json', ' '.join(self.files()))
        with self.subTest('fails a check'):
            self.save('run-1')
            path = next(self.root.glob('run-view-cache/*/run-1.json'))
            record = json.loads(path.read_text(encoding='utf-8'))
            record['view']['parts']['outputs']['data']['runId'] = 'run-other'
            path.write_text(json.dumps(record), encoding='utf-8')
            self.assertEqual(self.api.runViewCached('run-1'), {'ok': True, 'data': None})
            self.assertFalse(path.exists())
        with self.subTest('limit'), mock.patch.object(tdn_shopee_app, 'RUN_VIEW_COPY_MAX_FILES', 2):
            for path in self.root.glob('run-view-cache/*/*.json'):
                path.unlink()
            for index, run_id in enumerate(('run-a', 'run-b', 'run-c')):
                self.save(run_id)
                path = next(self.root.glob('run-view-cache/*/%s.json' % run_id))
                os.utime(path, (1_700_000_000 + index, 1_700_000_000 + index))
            self.save('run-d')
            self.assertEqual([path.rsplit('/', 1)[1] for path in self.files()], ['run-c.json', 'run-d.json'])

    def test_prefetch(self):
        """| situation                                                   | expected                                    |
        |--------------------------------------------------------------|---------------------------------------------|
        | a row whose copy has the same status:revision                | skipped (no read)                           |
        | a row without a copy                                         | one --result read, saved                    |
        | a click (runView --result) on the row being prefetched       | joins that read: no second read             |
        | a page call is out                                           | no prefetch read until it ends              |
        """
        with self.subTest('skip and read'):
            self.save('run-1')
            self.answers[('runView', 'run-2')] = server_view('run-2', parts('run-2'))
            before = len(self.run_views())
            self.api.prefetchRunViews([{'runId': 'run-1', 'sig': 'DONE:3'}, {'runId': 'run-2', 'sig': 'DONE:3'}])
            self.wait_prefetch()
            self.assertEqual([call[:3] for call in self.run_views()[before:]], [('runView', 'run-2', True)])
            self.assertIn('run-2.json', ' '.join(self.files()))
        with self.subTest('a click joins'):
            started, release = threading.Event(), threading.Event()

            def slow():
                started.set()
                release.wait(5)
                return server_view('run-3', parts('run-3'))
            self.answers[('runView', 'run-3')] = slow
            before = len(self.run_views())
            self.api.prefetchRunViews([{'runId': 'run-3', 'sig': 'DONE:3'}])
            self.assertTrue(started.wait(5))
            clicked = {}
            user = threading.Thread(target=lambda: clicked.update(self.api.runView('run-3', True, True)))
            user.start()
            time.sleep(0.1)
            self.assertTrue(user.is_alive(), 'the click waits for the prefetch read')
            release.set()
            user.join(5)
            self.wait_prefetch()
            self.assertTrue(clicked.get('ok'), clicked)
            self.assertEqual(len(self.run_views()) - before, 1, 'one read for both')
        with self.subTest('not while a page call is out'):
            out, done = threading.Event(), threading.Event()

            def held():
                out.set()
                done.wait(5)
                return {'ok': True, 'data': {'format': 'runs-v1', 'runs': [{'runId': 'run-1'}, {'runId': 'run-2'},
                                                                           {'runId': 'run-3'}, {'runId': 'run-4'}]}}
            self.answers[('runs', None)] = held
            self.answers[('runView', 'run-4')] = server_view('run-4', parts('run-4'))
            page = threading.Thread(target=self.api.listRuns)
            page.start()
            self.assertTrue(out.wait(5))
            before = len(self.run_views())
            self.api.prefetchRunViews([{'runId': 'run-4', 'sig': 'DONE:3'}])
            time.sleep(0.2)
            self.assertEqual(len(self.run_views()), before, 'no prefetch read while the page call is out')
            done.set()
            page.join(5)
            self.wait_prefetch()
            self.assertEqual([call[:3] for call in self.run_views()[before:]], [('runView', 'run-4', True)])


    def held_prefetch(self, run_id):
        """A prefetch read of run_id that waits on the prefetch thread only; returns (started, release)."""
        started, release = threading.Event(), threading.Event()

        def answer():
            if threading.current_thread().name == 'tdn-run-view-prefetch':
                started.set()
                release.wait(5)
            return server_view(run_id, parts(run_id))
        self.answers[('runView', run_id)] = answer
        self.api.prefetchRunViews([{'runId': run_id, 'sig': 'DONE:3'}])
        self.assertTrue(started.wait(5))
        return release

    def test_prefetch_is_never_taken_stale(self):
        """| situation                                                   | expected                                    |
        |--------------------------------------------------------------|---------------------------------------------|
        | a read that is not a row open (no `join`), prefetch out      | its own read, at once                       |
        | a row open (`join`) after a write/start sent since the       | its own read, not the prefetch's            |
        | prefetch read started                                        |                                             |
        | the run deleted while its prefetch read is out               | the late read saves no copy                 |
        """
        with self.subTest('no join'):
            release = self.held_prefetch('run-5')
            before = len(self.run_views())
            self.assertTrue(self.api.runView('run-5', True)['ok'])
            self.assertEqual(len(self.run_views()) - before, 1, 'its own read while the prefetch is still out')
            release.set()
            self.wait_prefetch()
        with self.subTest('a write since'):
            release = self.held_prefetch('run-6')
            self.answers[('flow', 'run-6')] = {'ok': True, 'data': {'format': 'run-result-v1'}}
            self.api._remote('flow', run_id='run-6')
            before = len(self.run_views())
            self.assertTrue(self.api.runView('run-6', True, True)['ok'])
            self.assertEqual(len(self.run_views()) - before, 1, 'its own read, not the older prefetch read')
            release.set()
            self.wait_prefetch()
        with self.subTest('deleted while out'):
            release = self.held_prefetch('run-7')
            self.answers[('deleteRun', 'run-7')] = {'ok': True, 'data': {'format': 'run-delete-v1', 'runId': 'run-7',
                                                                          'deleted': True}}
            with mock.patch.object(self.api, '_local_metric_shot', return_value=None):
                self.assertTrue(self.api.deleteRun('run-7')['ok'])
            release.set()
            self.wait_prefetch()
            self.assertNotIn('run-7.json', ' '.join(self.files()))


if __name__ == '__main__':
    unittest.main()
