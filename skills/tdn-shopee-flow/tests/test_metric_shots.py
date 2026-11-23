"""Metric picture CLI contracts. Synthetic storage, credentials and HTTP only."""
import contextlib
import datetime as dt
import hashlib
import hmac
import importlib.util
import io
import json
import os
import pathlib
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'scripts' / 'shopee_flow.py'
RUN_ID = 'run-synthetic'
DIGEST = '0' * 64
SECRET = 'NOT_A_SECRET_SYNTHETIC_TEST_ONLY'


def expected_signature(url, method, secret, content_type=None):
    """Independent protocol oracle, checked against AWS's published answer in row 5."""
    parsed = urllib.parse.urlsplit(url)
    query = dict(urllib.parse.parse_qsl(parsed.query))
    query.pop('X-Amz-Signature', None)
    scope = query['X-Amz-Credential'].split('/', 1)[1]
    canonical_query = '&'.join(urllib.parse.quote(k, safe='-_.~') + '=' + urllib.parse.quote(v, safe='-_.~')
                               for k, v in sorted(query.items()))
    headers = (('content-type:' + content_type + '\n') if content_type else '') + 'host:' + parsed.netloc + '\n'
    signed_headers = 'content-type;host' if content_type else 'host'
    canonical = '\n'.join((method, parsed.path, canonical_query, headers, signed_headers, 'UNSIGNED-PAYLOAD'))
    text = '\n'.join(('AWS4-HMAC-SHA256', query['X-Amz-Date'], scope,
                      hashlib.sha256(canonical.encode('ascii')).hexdigest()))
    signing_key = ('AWS4' + secret).encode('ascii')
    for part in scope.split('/'):
        signing_key = hmac.digest(signing_key, part.encode('ascii'), 'sha256')
    return hmac.digest(signing_key, text.encode('ascii'), 'sha256').hex()


class MetricShotTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = pathlib.Path(temp.name)
        self.run = self.root / 'runs' / RUN_ID
        self.run.mkdir(parents=True)
        self.credentials = self.root / 'credentials.env'
        self.credentials.write_text(
            'R2_ACCOUNT_ID=synthetic\nR2_BUCKET=synthetic-bucket\n'
            'R2_ACCESS_KEY_ID=SYNTHETICKEY\nR2_SECRET_ACCESS_KEY=' + SECRET + '\n', encoding='utf-8')
        env = {k: v for k, v in os.environ.items()
               if not k.startswith('TDN_') and k not in ('SHOPEE_FLOW_RUNS', 'SHOPEE_FLOW_STATE')}
        env.update(SHOPEE_FLOW_RUNS=str(self.run.parent), SHOPEE_FLOW_STATE=str(self.root / 'state'),
                   TDN_METRIC_SHOTS_R2_FILE=str(self.credentials))
        patch = mock.patch.dict(os.environ, env, clear=True)
        patch.start()
        self.addCleanup(patch.stop)
        spec = importlib.util.spec_from_file_location('metric_shot_cli', SCRIPT)
        self.flow = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.flow)
        patch = mock.patch('urllib.request.urlopen', side_effect=AssertionError('unexpected HTTP'))
        self.http = patch.start()
        self.addCleanup(patch.stop)

    def command(self, name, run_id=RUN_ID, **flags):
        args = [str(SCRIPT), name, '--run', run_id]
        for key, value in flags.items():
            args.extend(('--' + key.replace('_', '-'), str(value)))
        stdout, stderr = io.StringIO(), io.StringIO()
        code = 0
        with mock.patch.object(sys, 'argv', args), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            try:
                self.flow.main()
            except SystemExit as exit_:
                code = exit_.code
        self.assertNotIn(SECRET, stdout.getvalue())
        self.assertEqual(stderr.getvalue(), '')
        return code, json.loads(stdout.getvalue())

    def error(self, result, code, exit_code=20):
        self.assertEqual(result, (exit_code, {'format': 'error-v1', 'code': code, 'message': code}))

    def record(self, **overrides):
        value = dict(key=f'metric-shots/{RUN_ID}/full-page.webp', sha256=DIGEST, byteSize=23,
                     contentType='image/webp', uploadedAt='2099-01-01T00:00:00Z',
                     deleteAfter='2099-01-11T00:00:00Z')
        value.update(overrides)
        path = self.run / 'm1' / 'metric-shot-r2.json'
        path.parent.mkdir(exist_ok=True)
        path.write_text(json.dumps(value), encoding='utf-8')
        return value

    def head(self, status=200, size=23):
        if status == 404:
            self.http.side_effect = urllib.error.HTTPError('https://synthetic.invalid/', 404, 'synthetic', {}, None)
        else:
            response = io.BytesIO()
            response.status, response.headers = status, {'Content-Length': str(size)}
            self.http.side_effect = None
            self.http.return_value = response

    def test_upload_url_contract(self):
        for content_type, extension in (('image/webp', 'webp'), ('image/png', 'png')):
            with self.subTest(content_type=content_type):
                code, output = self.command('metric-shot-upload-url', content_type=content_type, bytes=23, sha256=DIGEST)
                self.assertEqual(code, 0, output)
                url = output.pop('url')
                self.assertEqual(output, dict(format='metric-shot-upload-v1', runId=RUN_ID,
                    key=f'metric-shots/{RUN_ID}/full-page.{extension}', contentType=content_type, expiresInSeconds=600))
                parsed = urllib.parse.urlsplit(url)
                self.assertEqual((parsed.scheme, parsed.netloc, parsed.path), ('https',
                    'synthetic.r2.cloudflarestorage.com', f'/synthetic-bucket/metric-shots/{RUN_ID}/full-page.{extension}'))
                query = urllib.parse.parse_qs(parsed.query)
                self.assertEqual(query['X-Amz-Expires'], ['600'])
                self.assertEqual(query['X-Amz-SignedHeaders'], ['content-type;host'])
                self.assertEqual(query['X-Amz-Signature'], [expected_signature(url, 'PUT', SECRET, content_type)])
        valid = dict(content_type='image/webp', bytes=23, sha256=DIGEST)
        for bad in ({'content_type': 'image/jpeg'}, {'bytes': 0}, {'bytes': 33554433}, {'sha256': 'not-a-digest'}):
            with self.subTest(bad=bad):
                self.error(self.command('metric-shot-upload-url', **dict(valid, **bad)), 'ARG_INVALID', 2)
        self.credentials.unlink()
        self.error(self.command('metric-shot-upload-url', **valid), 'R2_NOT_CONFIGURED')
        self.record()
        self.error(self.command('metric-shot-upload-url', **valid), 'METRIC_SHOT_ALREADY_UPLOADED')
        self.error(self.command('metric-shot-upload-url', run_id='unknown-run', **valid), 'RUN_NOT_FOUND', 2)
        self.http.assert_not_called()

    def test_confirm_contract(self):
        flags = dict(key=f'metric-shots/{RUN_ID}/full-page.webp', bytes=23, sha256=DIGEST)
        path = self.run / 'm1' / 'metric-shot-r2.json'
        # Refusals also run on Windows; the durable writer below requires POSIX paths and directory fsync.
        for label, status, size, error in (('missing', 404, 23, 'METRIC_SHOT_NOT_FOUND'),
                                          ('wrong size', 200, 22, 'METRIC_SHOT_SIZE_MISMATCH')):
            with self.subTest(label=label):
                self.head(status, size)
                self.error(self.command('metric-shot-confirm', **flags), error)
                self.assertFalse(path.exists())
                request = self.http.call_args.args[0]
                self.assertEqual(request.get_method(), 'HEAD')
                self.assertEqual(urllib.parse.urlsplit(request.full_url).path,
                                 f'/synthetic-bucket/metric-shots/{RUN_ID}/full-page.webp')
        self.http.reset_mock()
        self.error(self.command('metric-shot-confirm', **dict(flags, key='metric-shots/other-run/full-page.webp')),
                   'ARG_INVALID', 2)
        self.http.assert_not_called()
        if os.name != 'posix':
            self.skipTest('confirm persistence requires Linux: gate_path and directory fsync; refusals checked above')
        self.head()
        code, confirmed = self.command('metric-shot-confirm', **flags)
        self.assertEqual(code, 0, confirmed)
        record = json.loads(path.read_text(encoding='utf-8'))
        self.assertEqual(set(record), {'key', 'sha256', 'byteSize', 'contentType', 'uploadedAt', 'deleteAfter'})
        self.assertEqual(confirmed, dict(format='metric-shot-r2-v1', runId=RUN_ID, **record))
        self.assertEqual({key: record[key] for key in ('key', 'sha256', 'byteSize', 'contentType')},
                         dict(key=flags['key'], sha256=DIGEST, byteSize=23, contentType='image/webp'))
        uploaded = dt.datetime.fromisoformat(record['uploadedAt'].replace('Z', '+00:00'))
        expires = dt.datetime.fromisoformat(record['deleteAfter'].replace('Z', '+00:00'))
        self.assertEqual(expires - uploaded, dt.timedelta(days=10))
        original = path.read_bytes()
        self.head()
        self.assertEqual(self.command('metric-shot-confirm', **flags), (0, confirmed))
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(self.http.call_count, 2, 'both successful confirmations HEAD the object')

    def test_view_url_contract(self):
        self.credentials.unlink()
        self.assertEqual(self.command('metric-shot-view-url'),
                         (0, dict(format='metric-shot-view-v1', runId=RUN_ID, state='NOT_UPLOADED')))
        self.http.assert_not_called()
        self.credentials.write_text('R2_ACCOUNT_ID=synthetic\nR2_BUCKET=synthetic-bucket\n'
            'R2_ACCESS_KEY_ID=SYNTHETICKEY\nR2_SECRET_ACCESS_KEY=' + SECRET, encoding='utf-8')
        record = self.record()
        self.head()
        code, output = self.command('metric-shot-view-url')
        self.assertEqual(code, 0, output)
        url = output.pop('url')
        self.assertEqual(output, dict(format='metric-shot-view-v1', runId=RUN_ID, state='AVAILABLE',
            contentType='image/webp', byteSize=23, uploadedAt=record['uploadedAt'], deleteAfter=record['deleteAfter']))
        parsed = urllib.parse.urlsplit(url)
        self.assertEqual(parsed.path, f'/synthetic-bucket/metric-shots/{RUN_ID}/full-page.webp')
        query = urllib.parse.parse_qs(parsed.query)
        self.assertEqual(query['X-Amz-Expires'], ['900'])
        self.assertEqual(query['X-Amz-SignedHeaders'], ['host'])
        self.assertEqual(query['X-Amz-Signature'], [expected_signature(url, 'GET', SECRET)])
        self.assertEqual(self.http.call_args.args[0].get_method(), 'HEAD')
        self.head(404)
        expected = dict(format='metric-shot-view-v1', runId=RUN_ID, state='EXPIRED',
                        uploadedAt=record['uploadedAt'], deleteAfter=record['deleteAfter'])
        self.assertEqual(self.command('metric-shot-view-url'), (0, expected))
        expired = self.record(uploadedAt='2000-01-01T00:00:00Z', deleteAfter='2000-01-11T00:00:00Z')
        self.credentials.unlink()
        self.http.reset_mock()
        expected.update(uploadedAt=expired['uploadedAt'], deleteAfter=expired['deleteAfter'])
        self.assertEqual(self.command('metric-shot-view-url'), (0, expected))
        self.http.assert_not_called()

    def test_presign_aws_published_example(self):
        # Public AWS documentation example credentials, not an account credential.
        # https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html
        # Validate an independent canonical-request oracle with AWS's fixed answer, then
        # change only the expected host, path style and region for R2. Product source is untouched.
        secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        aws_url = ('https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&'
            'X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&'
            'X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host')
        self.assertEqual(expected_signature(aws_url, 'GET', secret),
                         'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404')
        expected_url = aws_url.replace('examplebucket.s3.amazonaws.com/test.txt',
            'synthetic.r2.cloudflarestorage.com/examplebucket/test.txt').replace('us-east-1', 'auto')
        config = dict(R2_ACCOUNT_ID='synthetic', R2_BUCKET='examplebucket',
                      R2_ACCESS_KEY_ID='AKIAIOSFODNN7EXAMPLE',
                      R2_SECRET_ACCESS_KEY=secret)
        url = self.flow.r2_signed(config, 'GET', 'test.txt', expires=86400,
                                  now=dt.datetime(2013, 5, 24, tzinfo=dt.timezone.utc))
        self.assertEqual(url, expected_url + '&X-Amz-Signature=' + expected_signature(expected_url, 'GET', secret))
        self.http.assert_not_called()
