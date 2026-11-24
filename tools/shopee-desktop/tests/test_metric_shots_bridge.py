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
OLD_DIGEST = 'b' * 64       # an old run's server full-page.png
OLD_OUTPUTS = {'ok': True, 'data': {'format': 'module-outputs-v1', 'runId': RUN_ID, 'm1': {'evidence': {'fullPage': {
    'available': True, 'kind': 'full-page', 'sha256': OLD_DIGEST, 'byteSize': 4, 'mediaType': 'image/png',
    'fileName': 'full-page.png', 'errorCode': None}}}}}
NO_OLD_OUTPUTS = {'ok': True, 'data': {'format': 'module-outputs-v1', 'runId': RUN_ID, 'm1': {'evidence': {'fullPage': {
    'available': False, 'kind': 'full-page', 'sha256': None, 'byteSize': None, 'mediaType': None,
    'fileName': 'full-page.png', 'errorCode': 'EVIDENCE_FILES_MISSING'}}}}}     # a run with no server full-page.png
OUTPUTS_FAIL = {'ok': False, 'error': {'code': 'SSH_TIMEOUT', 'message': 'SSH_TIMEOUT'}}


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

    def relay(self, view, outputs=OLD_OUTPUTS):
        """The relay answers ``view`` for the online copy and ``outputs`` (default: the old picture's descriptor)
        for the step results; an exception is raised. Returns the list of relay actions, in order."""
        actions = []

        def answer(action, **_):
            actions.append(action)
            reply = outputs if action == 'moduleOutputs' else view
            if isinstance(reply, Exception):
                raise reply
            return reply
        self.remote.side_effect = answer
        return actions

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
                expected = dict(format='metric-shot-state-v1', runId=RUN_ID, local=False,
                                state=server_state, uploading=False)
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

        digest = hashlib.sha256(PICTURE).hexdigest()
        key = f'metric-shots/{RUN_ID}/{digest}.webp'
        path = self.local()
        entered, release = threading.Event(), threading.Event()
        self.addCleanup(release.set)
        calls = []

        def retry(action, **kwargs):
            calls.append(action)
            if action == 'metricShotViewUrl':
                return online('NOT_UPLOADED')
            if action == 'metricShotUploadUrl':
                return {'ok': True, 'data': dict(format='metric-shot-upload-v1', runId=RUN_ID,
                    key=key, url=signed_url(), contentType='image/webp', expiresInSeconds=600)}
            raise AssertionError('a failed PUT must not confirm')

        def failed_put(*args, **kwargs):
            entered.set()
            if not release.wait(5):
                raise AssertionError('the test did not release the synthetic PUT')
            raise urllib.error.URLError('synthetic PUT failure')

        self.remote.side_effect, self.http.side_effect = retry, failed_put
        try:
            self.assertEqual(self.api.metricShotState(RUN_ID), {'ok': True, 'data': dict(
                format='metric-shot-state-v1', runId=RUN_ID, local=True, state='NOT_UPLOADED', uploading=True)},
                'the retry decision and its uploading/local snapshot must agree')
            self.assertTrue(entered.wait(5), 'the details read must start a real PUT worker')
            self.assertEqual(calls, ['metricShotViewUrl', 'metricShotUploadUrl'])
            self.assertEqual(self.api.metricShotState(RUN_ID), {'ok': True, 'data': dict(
                format='metric-shot-state-v1', runId=RUN_ID, local=True, state='NOT_UPLOADED', uploading=True)},
                'a read during an existing upload must also report uploading')
            self.assertEqual(calls, ['metricShotViewUrl', 'metricShotUploadUrl', 'metricShotViewUrl'])
        finally:
            release.set()
            self.drain()
        self.assertEqual(path.read_bytes(), PICTURE)

        # Complete a real upload after the server captured NOT_UPLOADED, before it answers.
        self.api = app.Api()
        self.remote = self.enterContext(mock.patch.object(self.api, '_remote'))
        entered, release, confirmed = threading.Event(), threading.Event(), threading.Event()
        self.addCleanup(release.set)
        views = []

        def relay(action, **kwargs):
            if action == 'metricShotUploadUrl':
                return {'ok': True, 'data': dict(format='metric-shot-upload-v1', runId=RUN_ID,
                    key=key, url=signed_url(), contentType='image/webp', expiresInSeconds=600)}
            if action == 'metricShotConfirm':
                confirmed.set()
                return {'ok': True, 'data': dict(format='metric-shot-r2-v1', runId=RUN_ID,
                    key=key, sha256=digest, byteSize=len(PICTURE), contentType='image/webp',
                    uploadedAt='2099-01-01T00:00:00Z', deleteAfter=DELETE_AFTER)}
            if action == 'metricShotViewUrl':
                response = online('AVAILABLE' if confirmed.is_set() else 'NOT_UPLOADED')
                views.append(response['data']['state'])
                if len(views) == 1:
                    release.set()
                    self.drain()
                return response
            raise AssertionError('unexpected relay action: ' + action)

        def put(*args, **kwargs):
            entered.set()
            if not release.wait(5):
                raise AssertionError('the test did not release the synthetic PUT')
            response = io.BytesIO()
            response.status = 200
            return response

        self.remote.side_effect, self.http.side_effect = relay, put
        try:
            self.assertTrue(self.api.uploadMetricShot(RUN_ID)['data']['started'])
            self.assertTrue(entered.wait(5), 'the worker must be active before the state read')
            result = self.api.metricShotState(RUN_ID)
            self.assertTrue(confirmed.is_set(), 'the interleaving must finish confirmation')
            self.assertFalse(path.exists(), 'the real worker must delete its confirmed local picture')
            self.assertEqual(result, {'ok': True, 'data': dict(format='metric-shot-state-v1', runId=RUN_ID,
                local=False, state='AVAILABLE', uploading=False, deleteAfter=DELETE_AFTER)},
                'completion during the read must return one coherent answer')
            self.assertEqual(views, ['NOT_UPLOADED', 'AVAILABLE'], 'completion needs exactly one server re-read')
        finally:
            release.set()
            self.drain()

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
        for old_known in (True, False, None):     # None omits the flag, as an older page does
            for server_state in ('AVAILABLE', 'EXPIRED', 'NOT_UPLOADED', 'offline'):
                with self.subTest(oldKnown=old_known, remote=server_state):
                    view = OUTPUTS_FAIL if server_state == 'offline' else online(server_state)
                    # A failed outputs read must not mask the offline/local-missing answer when already known.
                    actions = self.relay(view, OUTPUTS_FAIL if old_known else NO_OLD_OUTPUTS)
                    flags = {} if old_known is None else {'oldKnown': old_known}
                    result = self.api.viewMetricShot(RUN_ID, None, **flags)
                    if server_state == 'offline':
                        self.assertFalse(result['ok'], result)
                        self.assertEqual(result['error']['code'], 'EVIDENCE_LOCAL_MISSING')
                    else:
                        expected = dict(format='metric-shot-open-v1', runId=RUN_ID, state=server_state)
                        if server_state != 'NOT_UPLOADED':
                            expected['deleteAfter'] = DELETE_AFTER
                        if server_state == 'AVAILABLE':
                            expected['src'] = signed_url()
                        self.assertEqual(result, {'ok': True, 'data': expected})
                    self.assertEqual(actions, ['metricShotViewUrl'] +
                                     ([] if old_known or server_state == 'AVAILABLE' else ['moduleOutputs']))
        for invalid in (None, 0, 1, 'true', [], {}):
            with self.subTest(invalid_oldKnown=invalid):
                self.remote.reset_mock()
                result = self.api.viewMetricShot(RUN_ID, None, oldKnown=invalid)
                self.assertFalse(result['ok'], result)
                self.assertEqual(result['error']['code'], 'ARG_INVALID')
                self.remote.assert_not_called()
        self.assertEqual(list(self.root.rglob('*')), [self.root / 'evidence', self.shots])
        self.http.assert_not_called()
        # The page sends an old run's full-page.png digest with every click: local, then online, then the old picture.
        opened, streamed = [], []
        self.enterContext(mock.patch.object(app, '_evidence_folder', return_value=self.root / 'opened'))
        self.enterContext(mock.patch.object(app, '_open_local_file', side_effect=opened.append))
        self.enterContext(mock.patch.object(self.api, '_stream_export',
            side_effect=lambda run_id, digest, size, destination, **_: streamed.append(digest) or destination))
        for label, view in (('local', None), ('online', online()), ('expired', online('EXPIRED')),
                            ('not uploaded', online('NOT_UPLOADED')), ('server cannot answer', app._BridgeFailure('SSH_TIMEOUT'))):
            with self.subTest(old_evidence=label):
                path = self.local() if label == 'local' else None
                actions = self.relay(view)
                opened.clear()
                streamed.clear()
                result = self.api.viewMetricShot(RUN_ID, OLD_DIGEST, oldKnown=True)
                if label in ('local', 'online'):
                    self.assertEqual(result['data'].get('state'), 'LOCAL' if path else 'AVAILABLE', result)
                    self.assertEqual(result['data']['src'][:5], 'data:' if path else 'https')
                    self.assertEqual((actions, streamed, opened), ([] if path else ['metricShotViewUrl'], [], []))
                else:
                    self.assertEqual(result, {'ok': True, 'data': dict(format='module-evidence-open-v1', runId=RUN_ID,
                        kind='full-page', sha256=OLD_DIGEST, opened=True)})
                    self.assertEqual((actions, streamed, opened), (['metricShotViewUrl', 'moduleOutputs'], [OLD_DIGEST],
                                                                   [self.root / 'opened' / 'full-page.png']))
                if path:
                    path.unlink()
        # No digest (the page's step results are loading or failed): the bridge looks for the old picture itself.
        for label, outputs in (('found', OLD_OUTPUTS), ('outputs read fails', OUTPUTS_FAIL)):
            with self.subTest(old_evidence_without_digest=label):
                actions = self.relay(online('NOT_UPLOADED'), outputs)
                opened.clear()
                streamed.clear()
                result = self.api.viewMetricShot(RUN_ID, None, oldKnown=False)
                self.assertEqual(actions.count('moduleOutputs'), 2 if outputs is OLD_OUTPUTS else 1)
                if outputs is OLD_OUTPUTS:
                    self.assertEqual(result, {'ok': True, 'data': dict(format='module-evidence-open-v1', runId=RUN_ID,
                        kind='full-page', sha256=OLD_DIGEST, opened=True)})
                    self.assertEqual((streamed, opened), ([OLD_DIGEST], [self.root / 'opened' / 'full-page.png']))
                else:
                    self.assertEqual(result, app._error('SSH_TIMEOUT'), 'the read error, never «không có ảnh»')
                    self.assertEqual((streamed, opened), ([], []))

    def test_save_metric_shot_online_contract(self):
        out = self.root / 'chosen'
        out.mkdir()
        for old_known in (True, False, None):
            for server_state, code in (('EXPIRED', 'METRIC_SHOT_EXPIRED'),
                                       ('NOT_UPLOADED', 'METRIC_SHOT_NOT_UPLOADED'),
                                       ('offline', 'EVIDENCE_LOCAL_MISSING')):
                with self.subTest(oldKnown=old_known, remote=server_state):
                    view = OUTPUTS_FAIL if server_state == 'offline' else online(server_state)
                    actions = self.relay(view, OUTPUTS_FAIL if old_known else NO_OLD_OUTPUTS)
                    flags = {} if old_known is None else {'oldKnown': old_known}
                    with mock.patch.object(app, '_choose_save_path') as dialog:
                        result = self.api.saveMetricShot(RUN_ID, 'Synthetic picture', None, online=True, **flags)
                    self.assertFalse(result['ok'], result)
                    self.assertEqual(result['error']['code'], code)
                    self.assertEqual(actions, ['metricShotViewUrl'] + ([] if old_known else ['moduleOutputs']))
                    dialog.assert_not_called()
        for invalid in (None, 0, 1, 'true', [], {}):
            with self.subTest(invalid_oldKnown=invalid):
                self.remote.reset_mock()
                result = self.api.saveMetricShot(RUN_ID, 'Synthetic picture', None, online=True, oldKnown=invalid)
                self.assertFalse(result['ok'], result)
                self.assertEqual(result['error']['code'], 'ARG_INVALID')
                self.remote.assert_not_called()
        self.http.assert_not_called()
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
                    result = self.api.saveMetricShot(RUN_ID, 'Synthetic picture', OLD_DIGEST, online=True, oldKnown=True)
                self.http.assert_called_with(fresh_url, timeout=60)
                self.assertEqual(dialog.call_args.args[0], f'Synthetic picture-{RUN_ID}.{extension}')
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
        streamed = []
        self.enterContext(mock.patch.object(self.api, '_stream_export',
            side_effect=lambda run_id, digest, size, destination, **_: streamed.append((digest, destination))))
        destination = out / 'old.png'
        for label, view in (('expired', online('EXPIRED')), ('not uploaded', online('NOT_UPLOADED')),
                            ('server cannot answer', app._BridgeFailure('SSH_TIMEOUT')),
                            ('server answer invalid', {'ok': True, 'data': {'format': 'unexpected', 'runId': RUN_ID}})):
            with self.subTest(old_evidence=label):
                actions = self.relay(view)
                streamed.clear()
                self.http.reset_mock()
                with mock.patch.object(app, '_choose_save_path', return_value=str(destination)),                         mock.patch.object(app, '_downloads_folder', return_value=str(out)):
                    result = self.api.saveMetricShot(RUN_ID, 'Synthetic picture', OLD_DIGEST, online=True)
                self.assertEqual(result, {'ok': True, 'data': dict(format='metric-shot-save-v1', runId=RUN_ID,
                    saved=True, cancelled=False, fileName='old.png')})
                self.assertEqual((actions, streamed), (['metricShotViewUrl', 'moduleOutputs'], [(OLD_DIGEST, destination)]))
                self.http.assert_not_called()
        # No digest (the page's step results are loading or failed): the bridge looks for the old picture itself.
        for label, outputs, expected in (('found', OLD_OUTPUTS, None), ('outputs read fails', OUTPUTS_FAIL, 'SSH_TIMEOUT'),
                                         ('none', NO_OLD_OUTPUTS, 'METRIC_SHOT_NOT_UPLOADED')):
            with self.subTest(old_evidence_without_digest=label):
                actions = self.relay(online('NOT_UPLOADED'), outputs)
                streamed.clear()
                with mock.patch.object(app, '_choose_save_path', return_value=str(destination)), \
                        mock.patch.object(app, '_downloads_folder', return_value=str(out)):
                    result = self.api.saveMetricShot(RUN_ID, 'Synthetic picture', None, online=True, oldKnown=False)
                self.assertEqual(actions.count('moduleOutputs'), 2 if outputs is OLD_OUTPUTS else 1)
                if expected is None:
                    self.assertEqual(result, {'ok': True, 'data': dict(format='metric-shot-save-v1', runId=RUN_ID,
                        saved=True, cancelled=False, fileName='old.png')})
                    self.assertEqual(streamed, [(OLD_DIGEST, destination)])
                else:
                    self.assertEqual(result, app._error(expected))
                    self.assertEqual(streamed, [])
                self.http.assert_not_called()
