"""Transport and file-safety regressions for the review-data bridge routes.

The fake remote only records argv/stdin or emits a synthetic export byte stream.
No run, source call, database import or real save dialog is used.
"""
import hashlib
import json
import os
import pathlib
import stat
import sys
import tempfile
import types
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
APP_DIR = HERE.parent

sys.path.insert(0, str(APP_DIR))
import tdn_shopee_app  # noqa: E402

SOURCE = 'a' * 64
BODY = ('{"format":"module-review-archive-v1","rows":[{"comment":"Tiếng Việt"}]}').encode('utf-8')
DIGEST = hashlib.sha256(BODY).hexdigest()

FAKE_REMOTE = r'''#!/usr/bin/env python3
import hashlib, json, os, sys
BODY = __BODY__.encode('utf-8')
SHA = hashlib.sha256(BODY).hexdigest()
args = sys.argv[1:]
payload = None
if '--stdin' in args:
    try:
        payload = json.loads(sys.stdin.read())
    except ValueError:
        payload = None
with open(os.environ['BRIDGE_LOG'], 'a', encoding='utf-8') as handle:
    handle.write(json.dumps({'args': args, 'payload': payload}, sort_keys=True) + '\n')

def arg(name):
    return next((args[i + 1] for i, item in enumerate(args) if item == name), None)

action = args[0]
run = arg('--run')
if action == 'review-data':
    out = {
        'format': 'review-data-view-v1', 'runId': run, 'readonly': False,
        'tracking': {'primaryKeyword': 'kem', 'firstRunAt': '2026-11-11T04:26:00.000Z',
                     'timeBasis': 'recorded-first-accepted', 'displayTimezone': 'Asia/Ho_Chi_Minh',
                     'lastKnownStartedAt': None},
        'db': {'configured': True, 'schemaReady': True, 'blockedBy': None}, 'sources': [],
    }
    print(json.dumps(out))
    raise SystemExit(0)
if action == 'save-review-data':
    out = {
        'format': 'review-data-saved-v1', 'runId': run, 'sourceSha256': payload['sourceSha256'],
        'datasetId': 'dataset-1', 'importPolicyVersion': 'module-m3-s05-v1',
        'importedAt': '2026-11-11T04:30:00.000Z', 'rowCount': 12, 'reviewsInserted': 10,
        'reviewsAlreadyPresent': 2, 'runReviewsInserted': 12, 'firstVersionDiffers': 0, 'reused': False,
    }
    print(json.dumps(out))
    raise SystemExit(0)
if action == 'export-review-data' and payload['format'] == os.environ.get('BRIDGE_FAIL_FORMAT'):
    print(json.dumps({'format': 'error-v1', 'code': 'EXPORT_BLOCKED', 'message': 'EXPORT_BLOCKED'}))
    raise SystemExit(2)
if action == 'export-review-data':
    out = {
        'format': 'review-data-export-v1', 'runId': run, 'sourceSha256': payload['sourceSha256'],
        'exportFormat': payload['format'], 'exportVersion': 'module-review-export-v1',
        'exportSha256': SHA, 'byteSize': len(BODY),
        'fileName': 'shopee-' + run + '.' + payload['format'], 'rowCount': 3, 'reused': False,
    }
    print(json.dumps(out))
    raise SystemExit(0)
if action == 'read-review-export':
    mode = os.environ.get('BRIDGE_RAW_MODE', '')
    if mode == 'error':
        print('EXPORT_SOURCE_CHANGED', file=sys.stderr)
        raise SystemExit(3)
    if mode == 'huge_stderr':
        sys.stderr.write('x' * (2 * 1024 * 1024))
        sys.stderr.write('\nEXPORT_SOURCE_CHANGED\n')
        raise SystemExit(3)
    if mode == 'wrong_hash':
        altered = bytearray(BODY)
        altered[-1] = ord('!')
        sys.stdout.buffer.write(bytes(altered))
    elif mode == 'truncate':
        sys.stdout.buffer.write(BODY[:-3])
    else:
        sys.stdout.buffer.write(BODY)
    sys.stdout.buffer.flush()
    raise SystemExit(0)

print(json.dumps({'format': 'error-v1', 'code': 'UNEXPECTED', 'message': 'UNEXPECTED'}))
raise SystemExit(2)
'''.replace('__BODY__', repr(BODY.decode('utf-8')))


class ReviewDataBridgeTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.base = pathlib.Path(self._tmp.name)
        self.runs, self.presets, self.state = (self.base / name for name in ('runs', 'presets', 'state'))
        for folder in (self.runs, self.presets, self.state):
            folder.mkdir()
        self.exports = self.base / 'exports'
        self.exports.mkdir()
        self.destination = self.exports / 'shopee.json'
        self.log = self.base / 'bridge.jsonl'
        remote = self.base / 'fake-remote.py'
        remote.write_text(FAKE_REMOTE, encoding='utf-8')
        remote.chmod(remote.stat().st_mode | stat.S_IXUSR)
        config = self.base / 'config.json'
        config.write_text(json.dumps({
            'sshCommand': ['bash', '-s'],
            'remoteScript': str(remote),
            'runsRoot': str(self.runs),
            'presetsRoot': str(self.presets),
            'timeoutSeconds': 30,
        }), encoding='utf-8')
        patch = mock.patch.dict(os.environ, {
            'TDN_SHOPEE_APP_CONFIG': str(config),
            'SHOPEE_FLOW_STATE': str(self.state),
            'BRIDGE_LOG': str(self.log),
            'PYTHONDONTWRITEBYTECODE': '1',
        })
        patch.start()
        self.addCleanup(patch.stop)
        for name in ('BRIDGE_RAW_MODE', 'BRIDGE_FAIL_FORMAT'):
            self.addCleanup(os.environ.pop, name, None)
            os.environ.pop(name, None)
        self.api = tdn_shopee_app.Api()

    def calls(self):
        if not self.log.exists():
            return []
        return [json.loads(line) for line in self.log.read_text(encoding='utf-8').splitlines()]

    def choose_path(self, value):
        patch = mock.patch.object(tdn_shopee_app, '_choose_save_path', return_value=value)
        patch.start()
        self.addCleanup(patch.stop)

    def assert_no_temp(self):
        self.assertEqual(sorted(self.exports.iterdir()), [self.destination])

    def test_review_data_route_keeps_the_canonical_tracking_shape(self):
        result = self.api.reviewData('run-1')
        self.assertTrue(result['ok'])
        self.assertEqual(result['data']['tracking']['timeBasis'], 'recorded-first-accepted')
        self.assertEqual(self.calls()[-1], {'args': ['review-data', '--run', 'run-1'], 'payload': None})

    def test_save_sends_only_the_source_digest_and_accepts_the_receipt(self):
        result = self.api.saveReviewData('run-1', {'sourceSha256': SOURCE})
        self.assertTrue(result['ok'])
        self.assertEqual(result['data']['format'], 'review-data-saved-v1')
        self.assertEqual(self.calls()[-1], {
            'args': ['save-review-data', '--run', 'run-1', '--stdin'],
            'payload': {'sourceSha256': SOURCE},
        })

    def test_invalid_inputs_never_reach_the_remote(self):
        bad_saves = (
            None, {}, {'sourceSha256': SOURCE, 'extra': 1}, {'sourceSha256': SOURCE.upper()},
            {'sourceSha256': SOURCE[:-1]}, {'sourceSha256': 1},
        )
        bad_exports = (
            None, {'sourceSha256': SOURCE}, {'sourceSha256': SOURCE, 'format': 'csv'},
            {'sourceSha256': SOURCE, 'format': 'json', 'extra': 1},
            {'sourceSha256': SOURCE[:-1], 'format': 'json'},
        )
        for value in bad_saves:
            with self.subTest(save=value):
                self.assertEqual(self.api.saveReviewData('run-1', value), {
                    'ok': False, 'error': {'code': 'ARG_INVALID', 'message': 'ARG_INVALID'}})
        for value in bad_exports:
            with self.subTest(export=value):
                self.assertEqual(self.api.exportReviewData('run-1', value), {
                    'ok': False, 'error': {'code': 'ARG_INVALID', 'message': 'ARG_INVALID'}})
        self.assertEqual(self.calls(), [])

    def test_export_writes_the_exact_verified_bytes_for_each_format(self):
        for export_format in ('json', 'txt'):
            with self.subTest(export_format=export_format):
                self.destination = self.exports / ('shopee.' + export_format)
                self.destination.write_bytes(b'old')
                self.choose_path(str(self.destination))
                result = self.api.exportReviewData('run-1', {
                    'sourceSha256': SOURCE, 'format': export_format,
                })
                self.assertTrue(result['ok'])
                self.assertEqual(result['data']['saved'], True)
                self.assertEqual(result['data']['cancelled'], False)
                self.assertEqual(self.destination.read_bytes(), BODY)
                self.assertNotIn(str(self.exports), json.dumps(result))
                export_call = self.calls()[-2]
                read_call = self.calls()[-1]
                self.assertEqual(export_call, {
                    'args': ['export-review-data', '--run', 'run-1', '--stdin'],
                    'payload': {'sourceSha256': SOURCE, 'format': export_format},
                })
                self.assertEqual(read_call, {
                    'args': ['read-review-export', '--run', 'run-1', '--export-sha256', DIGEST],
                    'payload': None,
                })
                self.assertEqual([path for path in self.exports.iterdir() if path.name.endswith('.part')], [])

    def test_cancel_before_transfer_keeps_the_destination_and_returns_success(self):
        self.destination.write_bytes(b'old')
        self.choose_path(None)
        result = self.api.exportReviewData('run-1', {'sourceSha256': SOURCE, 'format': 'json'})
        self.assertTrue(result['ok'])
        self.assertEqual(result['data'], {
            'receipt': mock.ANY, 'fileName': 'shopee-run-1.json',
            'saved': False, 'cancelled': True,
        })
        self.assertEqual(self.destination.read_bytes(), b'old')
        self.assertEqual([call['args'][0] for call in self.calls()], ['export-review-data'])
        self.assert_no_temp()

    def test_mismatched_or_truncated_downloads_never_replace_the_destination(self):
        for mode, code in (('wrong_hash', 'EXPORT_DIGEST_MISMATCH'),
                           ('truncate', 'EXPORT_SIZE_MISMATCH')):
            with self.subTest(mode=mode):
                self.destination.write_bytes(b'old')
                os.environ['BRIDGE_RAW_MODE'] = mode
                self.choose_path(str(self.destination))
                result = self.api.exportReviewData('run-1', {'sourceSha256': SOURCE, 'format': 'json'})
                self.assertEqual(result, {'ok': False, 'error': {'code': code, 'message': code}})
                self.assertEqual(self.destination.read_bytes(), b'old')
                self.assert_no_temp()

    def test_remote_static_error_is_reported_after_a_bounded_stderr_read(self):
        self.destination.write_bytes(b'old')
        os.environ['BRIDGE_RAW_MODE'] = 'error'
        self.choose_path(str(self.destination))
        result = self.api.exportReviewData('run-1', {'sourceSha256': SOURCE, 'format': 'json'})
        self.assertEqual(result, {
            'ok': False, 'error': {'code': 'EXPORT_SOURCE_CHANGED', 'message': 'EXPORT_SOURCE_CHANGED'}})
        self.assertEqual(self.destination.read_bytes(), b'old')
        self.assert_no_temp()

        os.environ['BRIDGE_RAW_MODE'] = 'huge_stderr'
        result = self.api.exportReviewData('run-1', {'sourceSha256': SOURCE, 'format': 'json'})
        self.assertEqual(result, {
            'ok': False, 'error': {'code': 'REMOTE_OUTPUT_INVALID', 'message': 'REMOTE_OUTPUT_INVALID'}})
        self.assertEqual(self.destination.read_bytes(), b'old')
        self.assert_no_temp()

    def test_spawn_failure_closes_the_partial_file_and_preserves_the_destination(self):
        self.destination.write_bytes(b'old')
        with mock.patch.object(tdn_shopee_app.subprocess, 'Popen', side_effect=OSError('spawn')):
            with self.assertRaises(tdn_shopee_app._BridgeFailure) as caught:
                self.api._stream_export('run-1', DIGEST, len(BODY), self.destination)
        self.assertEqual(caught.exception.code, 'SSH_FAILED')
        self.assertEqual(self.destination.read_bytes(), b'old')
        self.assert_no_temp()

    def test_early_stdin_failure_also_cleans_the_partial_file(self):
        self.destination.write_bytes(b'old')
        process = mock.Mock()
        process.stdin.write.side_effect = OSError('broken pipe')
        process.stdout = None
        process.poll.return_value = None
        with mock.patch.object(tdn_shopee_app.subprocess, 'Popen', return_value=process):
            with self.assertRaises(tdn_shopee_app._BridgeFailure) as caught:
                self.api._stream_export('run-1', DIGEST, len(BODY), self.destination)
        self.assertEqual(caught.exception.code, 'SSH_FAILED')
        self.assertEqual(self.destination.read_bytes(), b'old')
        self.assert_no_temp()

    def choose_folder(self, value):
        patch = mock.patch.object(tdn_shopee_app, '_choose_save_folder', return_value=value)
        dialog = patch.start()
        self.addCleanup(patch.stop)
        return dialog

    def test_one_download_writes_every_format_after_a_single_folder_dialog(self):
        dialog = self.choose_folder(str(self.exports))
        result = self.api.exportReviewFiles('run-1', {'sourceSha256': SOURCE, 'formats': ['json', 'txt']})
        self.assertEqual(result, {'ok': True, 'data': {'cancelled': False, 'files': [
            {'format': 'json', 'saved': True, 'fileName': 'shopee-run-1.json', 'errorCode': None},
            {'format': 'txt', 'saved': True, 'fileName': 'shopee-run-1.txt', 'errorCode': None},
        ]}})
        dialog.assert_called_once_with()
        self.assertEqual((self.exports / 'shopee-run-1.json').read_bytes(), BODY)
        self.assertEqual((self.exports / 'shopee-run-1.txt').read_bytes(), BODY)
        self.assertEqual([call['args'][0] for call in self.calls()],
                         ['export-review-data', 'export-review-data', 'read-review-export', 'read-review-export'])
        self.assertEqual([call['payload'] for call in self.calls()[:2]], [
            {'sourceSha256': SOURCE, 'format': 'json'}, {'sourceSha256': SOURCE, 'format': 'txt'}])

    def test_one_download_reports_a_failed_format_without_writing_it(self):
        self.choose_folder(str(self.exports))
        os.environ['BRIDGE_RAW_MODE'] = 'error'
        result = self.api.exportReviewFiles('run-1', {'sourceSha256': SOURCE, 'formats': ['txt']})
        self.assertEqual(result['data']['files'], [
            {'format': 'txt', 'saved': False, 'fileName': None, 'errorCode': 'EXPORT_SOURCE_CHANGED'}])
        self.assertEqual(sorted(self.exports.iterdir()), [])

    def test_one_download_keeps_existing_files_and_saves_under_a_numbered_name(self):
        self.choose_folder(str(self.exports))
        (self.exports / 'shopee-run-1.json').write_bytes(b'old')
        (self.exports / 'shopee-run-1 (1).json').write_bytes(b'older')
        result = self.api.exportReviewFiles('run-1', {'sourceSha256': SOURCE, 'formats': ['json']})
        self.assertEqual(result, {'ok': True, 'data': {'cancelled': False, 'files': [
            {'format': 'json', 'saved': True, 'fileName': 'shopee-run-1 (2).json', 'errorCode': None}]}})
        self.assertEqual((self.exports / 'shopee-run-1.json').read_bytes(), b'old')
        self.assertEqual((self.exports / 'shopee-run-1 (1).json').read_bytes(), b'older')
        self.assertEqual((self.exports / 'shopee-run-1 (2).json').read_bytes(), BODY)
        self.assertEqual(sorted(path.name for path in self.exports.iterdir()),
                         ['shopee-run-1 (1).json', 'shopee-run-1 (2).json', 'shopee-run-1.json'])

    def test_one_download_never_replaces_a_file_that_appears_while_saving(self):
        self.choose_folder(str(self.exports))
        raced = self.exports / 'shopee-run-1.json'
        real_open = open

        def open_after_another_writer(path, mode='r', *args, **kwargs):
            if mode == 'xb' and pathlib.Path(path) == raced and not raced.exists():
                raced.write_bytes(b'other')
            return real_open(path, mode, *args, **kwargs)

        with mock.patch.object(tdn_shopee_app, 'open', side_effect=open_after_another_writer, create=True):
            result = self.api.exportReviewFiles('run-1', {'sourceSha256': SOURCE, 'formats': ['json']})
        self.assertEqual(result['data']['files'], [
            {'format': 'json', 'saved': True, 'fileName': 'shopee-run-1 (1).json', 'errorCode': None}])
        self.assertEqual(raced.read_bytes(), b'other')
        self.assertEqual((self.exports / 'shopee-run-1 (1).json').read_bytes(), BODY)
        self.assertEqual(sorted(path.name for path in self.exports.iterdir()),
                         ['shopee-run-1 (1).json', 'shopee-run-1.json'])

    def test_one_download_saves_json_and_reports_txt_when_only_txt_fails(self):
        self.choose_folder(str(self.exports))
        os.environ['BRIDGE_FAIL_FORMAT'] = 'txt'
        result = self.api.exportReviewFiles('run-1', {'sourceSha256': SOURCE, 'formats': ['json', 'txt']})
        self.assertEqual(result, {'ok': True, 'data': {'cancelled': False, 'files': [
            {'format': 'json', 'saved': True, 'fileName': 'shopee-run-1.json', 'errorCode': None},
            {'format': 'txt', 'saved': False, 'fileName': None, 'errorCode': 'EXPORT_BLOCKED'},
        ]}})
        self.assertEqual(sorted(path.name for path in self.exports.iterdir()), ['shopee-run-1.json'])
        self.assertEqual((self.exports / 'shopee-run-1.json').read_bytes(), BODY)

    def test_one_download_cancel_writes_nothing(self):
        dialog = self.choose_folder(None)
        result = self.api.exportReviewFiles('run-1', {'sourceSha256': SOURCE, 'formats': ['json', 'txt']})
        self.assertEqual(result, {'ok': True, 'data': {'cancelled': True, 'files': []}})
        dialog.assert_called_once_with()
        self.assertEqual(sorted(self.exports.iterdir()), [])
        self.assertNotIn('read-review-export', [call['args'][0] for call in self.calls()])

    def test_one_download_rejects_bad_format_lists_before_the_remote(self):
        dialog = self.choose_folder(str(self.exports))
        for value in (None, {'sourceSha256': SOURCE}, {'sourceSha256': SOURCE, 'formats': []},
                      {'sourceSha256': SOURCE, 'formats': 'json'}, {'sourceSha256': SOURCE, 'formats': ['csv']},
                      {'sourceSha256': SOURCE, 'formats': ['json', 'json']},
                      {'sourceSha256': SOURCE[:-1], 'formats': ['json']},
                      {'sourceSha256': SOURCE, 'formats': ['json'], 'extra': 1}):
            with self.subTest(value=value):
                self.assertEqual(self.api.exportReviewFiles('run-1', value), {
                    'ok': False, 'error': {'code': 'ARG_INVALID', 'message': 'ARG_INVALID'}})
        self.assertEqual(self.calls(), [])
        dialog.assert_not_called()

    def test_native_folder_dialog_is_used_once_and_cancel_returns_no_path(self):
        for chosen, expected in (((r'C:\Users\Test\Downloads',), r'C:\Users\Test\Downloads'), (None, None)):
            with self.subTest(chosen=chosen):
                window = mock.Mock()
                window.create_file_dialog.return_value = chosen
                webview = types.ModuleType('webview')
                webview.FOLDER_DIALOG = 'folder'
                webview.windows = [window]
                with mock.patch.dict(sys.modules, {'webview': webview}):
                    self.assertEqual(tdn_shopee_app._choose_save_folder(), expected)
                window.create_file_dialog.assert_called_once_with('folder')

    def test_safe_filename_removes_paths_reserved_names_and_excess_length(self):
        self.assertEqual(tdn_shopee_app._safe_filename('../../evil.json', 'json'), 'evil.json')
        self.assertEqual(tdn_shopee_app._safe_filename(r'..\..\CON.JSON', 'json'), '_CON.JSON')
        self.assertEqual(tdn_shopee_app._safe_filename('report.txt', 'json'), 'report.txt.json')
        self.assertEqual(len(tdn_shopee_app._safe_filename('a' * 300 + '.json', 'json')), 120)
        self.assertEqual(tdn_shopee_app._safe_filename(None, 'txt'), 'shopee-reviews.txt')

    def test_native_save_dialog_receives_only_the_suggested_file_name(self):
        window = mock.Mock()
        window.create_file_dialog.return_value = r'C:\Users\Test\shopee.json'
        webview = types.ModuleType('webview')
        webview.SAVE_DIALOG = 'save'
        webview.windows = [window]
        with mock.patch.dict(sys.modules, {'webview': webview}):
            selected = tdn_shopee_app._choose_save_path('shopee.json')
        self.assertEqual(selected, r'C:\Users\Test\shopee.json')
        window.create_file_dialog.assert_called_once_with('save', save_filename='shopee.json')

    def test_native_save_dialog_cancel_returns_no_path(self):
        window = mock.Mock()
        window.create_file_dialog.return_value = None
        webview = types.ModuleType('webview')
        webview.SAVE_DIALOG = 'save'
        webview.windows = [window]
        with mock.patch.dict(sys.modules, {'webview': webview}):
            self.assertIsNone(tdn_shopee_app._choose_save_path('shopee.json'))


if __name__ == '__main__':
    unittest.main()
