"""Desktop Metric picture lifecycle through the public bridge, without storage or a browser."""
import base64
import hashlib
import io
import pathlib
import sys
import tempfile
import threading
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import tdn_shopee_app as app

RUN_ID = 'run-synthetic'
DELETE_AFTER = '2099-01-11T00:00:00Z'
PICTURE = b'synthetic picture bytes'


def signed_url(extension='webp', token='synthetic'):
    return (f'https://synthetic.r2.cloudflarestorage.com/synthetic-bucket/'
            f'metric-shots/{RUN_ID}/{hashlib.sha256(PICTURE).hexdigest()}.{extension}?X-Amz-Signature={token}')


def online(state='AVAILABLE', extension='webp', **extra):
    data = dict(format='metric-shot-view-v1', runId=RUN_ID, state=state)
    if state != 'NOT_UPLOADED':
        data.update(uploadedAt='2099-01-01T00:00:00Z', deleteAfter=DELETE_AFTER)
    if state == 'AVAILABLE':
        data.update(url=signed_url(extension), contentType='image/' + extension, byteSize=len(PICTURE))
    data.update(extra)
    return {'ok': True, 'data': data}


class MetricShotBridgeTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = pathlib.Path(temp.name)
        self.shots = self.root / 'evidence' / 'metric'
        self.shots.mkdir(parents=True)
        self.api = app.Api()
        self.threads = []
        real_thread = threading.Thread

        def tracked_thread(*args, **kwargs):
            worker = real_thread(*args, **kwargs)
            self.threads.append(worker)
            return worker

        for patch in (mock.patch.object(app, '_metric_shot_folder', return_value=self.shots),
                      mock.patch.object(app, '_config_path', return_value=self.root / 'config.json'),
                      mock.patch.object(app.threading, 'Thread', side_effect=tracked_thread)):
            patch.start()
            self.addCleanup(patch.stop)
        self.http = self.enterContext(mock.patch('urllib.request.urlopen',
            side_effect=AssertionError('unexpected HTTP')))
        self.remote = self.enterContext(mock.patch.object(self.api, '_remote',
            side_effect=AssertionError('unexpected relay call')))
        self.addCleanup(self.drain)

    def drain(self):
        for worker in self.threads:
            worker.join(5)
            self.assertFalse(worker.is_alive(), 'the synthetic upload did not finish')
        self.threads.clear()

    def local(self, extension='webp'):
        path = self.shots / f'{RUN_ID}-metric-full-page.{extension}'
        path.write_bytes(PICTURE)
        return path

    def test_upload_metric_shot_contract(self):
        digest = hashlib.sha256(PICTURE).hexdigest()
        for label, extension in (('success', 'webp'), ('success', 'png'), ('put failed', 'webp'),
                                 ('changed file', 'webp'), ('changed after rename', 'webp'),
                                 ('replaced original', 'webp'), ('already uploaded', 'webp')):
            with self.subTest(label=label, extension=extension):
                self.api = app.Api()     # each row is a different upload lifecycle
                self.remote = self.enterContext(mock.patch.object(self.api, '_remote'))
                path = self.local(extension)
                events = []
                key = f'metric-shots/{RUN_ID}/{digest}.{extension}'
                content_type = 'image/' + extension

                def relay(action, run_id=None, flags=()):
                    self.assertEqual(run_id, RUN_ID)
                    values = dict(zip(flags[::2], flags[1::2]))
                    self.assertEqual(values['--sha256'], digest)
                    self.assertEqual(values['--bytes'], str(len(PICTURE)))
                    if action == 'metricShotUploadUrl':
                        events.append('upload-url')
                        self.assertEqual(values['--content-type'], content_type)
                        if label == 'already uploaded':
                            return {'ok': False, 'error': {'code': 'METRIC_SHOT_ALREADY_UPLOADED'}}
                        return {'ok': True, 'data': dict(format='metric-shot-upload-v1', runId=RUN_ID,
                            key=key, url=signed_url(extension), contentType=content_type, expiresInSeconds=600)}
                    self.assertEqual(action, 'metricShotConfirm')
                    events.append('confirm')
                    self.assertEqual(values['--key'], key)
                    self.assertTrue(path.is_file(), 'the picture must remain until confirmation')
                    if label == 'changed file':
                        path.write_bytes(b'synthetic newer picture')
                    return {'ok': True, 'data': dict(format='metric-shot-r2-v1', runId=RUN_ID,
                        key=key, sha256=digest, byteSize=len(PICTURE), contentType=content_type,
                        uploadedAt='2099-01-01T00:00:00Z', deleteAfter=DELETE_AFTER)}

                def put(request, timeout):
                    events.append('PUT')
                    self.assertEqual(request.get_method(), 'PUT')
                    self.assertEqual(request.full_url, signed_url(extension))
                    self.assertEqual(request.get_header('Content-type'), content_type)
                    self.assertEqual(request.get_header('X-amz-content-sha256'), digest)
                    self.assertEqual(request.data, PICTURE)
                    self.assertEqual(timeout, 60)
                    self.assertTrue(path.exists())
                    if label == 'put failed':
                        raise urllib.error.URLError('synthetic PUT failure')
                    response = io.BytesIO()
                    response.status = 200
                    return response

                # Exceptions in the worker are deliberately swallowed by the app. Record assertion
                # failures outside that worker too, so a bad request cannot turn into a silent pass.
                failures = []

                def checked(call):
                    def invoke(*args, **kwargs):
                        try:
                            return call(*args, **kwargs)
                        except AssertionError as failure:
                            failures.append(str(failure))
                            raise
                    return invoke

                self.remote.side_effect, self.http.side_effect = checked(relay), checked(put)
                rename = app.os.rename

                def raced_rename(source, destination):
                    rename(source, destination)
                    if pathlib.Path(source) == path:
                        if label == 'changed after rename':
                            pathlib.Path(destination).write_bytes(b'synthetic newer picture')
                        elif label == 'replaced original':
                            path.write_bytes(b'synthetic newer picture')

                with mock.patch.object(app.os, 'rename', side_effect=raced_rename):
                    result = self.api.uploadMetricShot(RUN_ID)
                    self.assertEqual(result, {'ok': True, 'data': dict(format='metric-shot-upload-start-v1',
                        runId=RUN_ID, started=True)})
                    self.drain()
                self.assertEqual(failures, [])
                self.assertEqual(events, ['upload-url', 'confirm'] if label == 'already uploaded' else
                                 ['upload-url', 'PUT'] if label == 'put failed' else ['upload-url', 'PUT', 'confirm'])
                if label in ('put failed', 'changed file', 'changed after rename', 'replaced original'):
                    self.assertEqual(path.read_bytes(), PICTURE if label == 'put failed' else b'synthetic newer picture')
                    path.unlink()
                else:
                    self.assertFalse(path.exists())
                self.assertEqual(list(self.shots.iterdir()), [], 'no renamed upload scratch file remains')

        self.api = app.Api()
        self.remote = self.enterContext(mock.patch.object(self.api, '_remote'))
        self.http.reset_mock()
        self.local()

        def relay(action, **kwargs):
            if action == 'metricShotViewUrl':
                return online('NOT_UPLOADED')
            if action == 'm1Import':
                return {'ok': True, 'data': dict(format='metric-user-page-import-result-v1',
                    runId=RUN_ID, reused=False, gates={'entry': 'PASS', 'm1': 'PASS'})}
            if action == 'flow':
                return {'ok': True, 'data': {'format': 'detached-v1', 'runId': RUN_ID, 'pid': 1}}
            self.assertEqual(action, 'metricShotUploadUrl')
            return {'ok': False, 'error': {'code': 'SSH_TIMEOUT'}}

        self.remote.side_effect = relay
        with mock.patch.object(app.time, 'monotonic', return_value=1000) as clock:
            attempts = 0
            for at, entry, starts in ((1000, 'direct', True), (1000, 'direct', False),
                                      (1059.999, 'state', False), (1059.999, 'direct', False),
                                      (1060, 'state', True), (1060, 'direct', False),
                                      (1120, 'direct', True)):
                with self.subTest(at=at, entry=entry):
                    clock.return_value = at
                    if entry == 'direct':
                        self.assertEqual(self.api.uploadMetricShot(RUN_ID)['data']['started'], starts)
                    else:
                        self.assertTrue(self.api.metricShotState(RUN_ID)['ok'])
                    self.drain()     # a completed failed attempt still counts for the next 60 s
                    attempts += int(starts)
                    self.assertEqual(sum(c.args[0] == 'metricShotUploadUrl' for c in self.remote.call_args_list), attempts)

            # Import completion links the captured picture and permits its first upload immediately,
            # even when this run had a recent failed attempt. Use the real session's link/confirm path.
            session = app.tdn_metric_browser.MetricSession(self.root)
            captured = self.shots / 'metric-synthetic.webp'
            (self.shots / f'{RUN_ID}-metric-full-page.webp').rename(captured)
            session.pending, session.pending_shot = {'synthetic': 'import payload'}, captured
            self.api._metric = session
            clock.return_value = 1121
            with mock.patch.object(app, '_load_config', return_value={}):
                self.assertTrue(self.api.resendMetricImport()['ok'])
            self.assertTrue(self.api.uploadMetricShot(RUN_ID)['data']['started'])
            self.drain()
            self.assertEqual(sum(c.args[0] == 'metricShotUploadUrl' for c in self.remote.call_args_list), attempts + 1)
            self.assertFalse(self.api.uploadMetricShot(RUN_ID)['data']['started'])
        self.http.assert_not_called()

    def test_metric_shot_state_contract(self):
        for server_state in ('AVAILABLE', 'EXPIRED', 'NOT_UPLOADED'):
            with self.subTest(state=server_state):
                self.remote.side_effect = None
                self.remote.return_value = online(server_state)
                expected = dict(format='metric-shot-state-v1', runId=RUN_ID, local=False, state=server_state, uploading=False)
                if server_state != 'NOT_UPLOADED':
                    expected['deleteAfter'] = DELETE_AFTER
                self.assertEqual(self.api.metricShotState(RUN_ID), {'ok': True, 'data': expected})
        for code in ('SSH_TIMEOUT', 'R2_NOT_CONFIGURED'):
            with self.subTest(error=code):
                self.remote.return_value = {'ok': False, 'error': {'code': code}}
                self.assertEqual(self.api.metricShotState(RUN_ID), {'ok': True, 'data': dict(
                    format='metric-shot-state-v1', runId=RUN_ID, local=False, state=None, uploading=False)})
        self.remote.side_effect = app._BridgeFailure('SSH_TIMEOUT')
        self.assertIsNone(self.api.metricShotState(RUN_ID)['data']['state'])
        path = self.local()
        # Reach the real upload entry point on retry; its first relay call fails harmlessly offline.
        calls = []
        release = threading.Event()
        self.addCleanup(release.set)

        def retry(action, **kwargs):
            calls.append(action)
            if action == 'metricShotViewUrl':
                return online('NOT_UPLOADED')
            release.wait(5)
            return {'ok': False, 'error': {'code': 'SSH_TIMEOUT'}}

        self.remote.side_effect = retry
        self.assertEqual(self.api.metricShotState(RUN_ID), {'ok': True, 'data': dict(
            format='metric-shot-state-v1', runId=RUN_ID, local=True, state='NOT_UPLOADED', uploading=True)})
        self.assertEqual(self.api.metricShotUpload(RUN_ID), {'ok': True, 'data': dict(
            format='metric-shot-upload-status-v1', runId=RUN_ID, local=True, uploading=True)})
        release.set()
        self.drain()
        self.assertEqual(calls, ['metricShotViewUrl', 'metricShotUploadUrl'])
        self.assertEqual(path.read_bytes(), PICTURE)
        self.assertEqual(self.api.metricShotUpload(RUN_ID), {'ok': True, 'data': dict(
            format='metric-shot-upload-status-v1', runId=RUN_ID, local=True, uploading=False)})
        self.http.assert_not_called()

    def test_view_metric_shot_contract(self):
        for extension in ('webp', 'png'):
            with self.subTest(local=extension):
                path = self.local(extension)
                before = {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
                result = self.api.viewMetricShot(RUN_ID)
                self.assertEqual(result, {'ok': True, 'data': dict(format='metric-shot-open-v1', runId=RUN_ID,
                    state='LOCAL', src=f'data:image/{extension};base64,' + base64.b64encode(PICTURE).decode('ascii'))})
                self.assertEqual({str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}, before)
                self.remote.assert_not_called()
                path.unlink()
        self.remote.side_effect = None
        for server_state in ('AVAILABLE', 'EXPIRED', 'NOT_UPLOADED'):
            with self.subTest(remote=server_state):
                self.remote.return_value = online(server_state)
                expected = dict(format='metric-shot-open-v1', runId=RUN_ID, state=server_state)
                if server_state != 'NOT_UPLOADED':
                    expected['deleteAfter'] = DELETE_AFTER
                if server_state == 'AVAILABLE':
                    expected['src'] = signed_url()
                self.assertEqual(self.api.viewMetricShot(RUN_ID), {'ok': True, 'data': expected})
        self.assertEqual(list(self.root.rglob('*')), [self.root / 'evidence', self.shots])
        self.http.assert_not_called()

    def test_save_metric_shot_online_contract(self):
        out = self.root / 'chosen'
        out.mkdir()
        self.remote.side_effect = None
        for extension, payload in (('webp', PICTURE), ('png', PICTURE),
                                   ('webp', PICTURE[:-1]), ('webp', PICTURE + b'excess')):
            with self.subTest(extension=extension, length=len(payload)):
                destination = out / ('chosen.' + extension)
                destination.write_bytes(b'existing user file')
                old_url, fresh_url = signed_url(extension, 'old'), signed_url(extension, 'fresh')
                self.remote.side_effect = [online(extension=extension, url=old_url),
                                           online(extension=extension, url=fresh_url)]
                self.http.side_effect = None
                self.http.return_value = io.BytesIO(payload)
                with mock.patch.object(app, '_choose_save_path', return_value=str(destination)) as dialog, \
                        mock.patch.object(app, '_downloads_folder', return_value=str(out)):
                    result = self.api.saveMetricShot(RUN_ID, 'Synthetic picture', None, online=True)
                self.assertEqual(dialog.call_args.args[0], f'Synthetic picture-{RUN_ID}.{extension}')
                self.http.assert_called_with(fresh_url, timeout=60)
                if payload == PICTURE:
                    self.assertEqual(result, {'ok': True, 'data': dict(format='metric-shot-save-v1',
                        runId=RUN_ID, saved=True, cancelled=False, fileName=destination.name)})
                    self.assertEqual(destination.read_bytes(), PICTURE)
                else:
                    self.assertFalse(result['ok'], result)
                    self.assertEqual(result['error']['code'], 'SAVE_FAILED')
                    self.assertEqual(destination.read_bytes(), b'existing user file')
                self.assertEqual(list(out.glob('*.part')), [])
                destination.unlink()
