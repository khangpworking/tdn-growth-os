"""F654: the app's version, the newest one on the server, and the closed «Có bản mới» banner, in the bridge."""

import json
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import tdn_shopee_app  # noqa: E402


class AppVersionTest(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        env = mock.patch.dict(os.environ, {'TDN_SHOPEE_APP_CONFIG': str(pathlib.Path(folder.name) / 'config.json')})
        env.start()
        self.addCleanup(env.stop)

    def test_dismissed_version_is_kept(self):
        """| call                                         | result                                            |
        |----------------------------------------------|---------------------------------------------------|
        | appVersion (from source)                     | the VERSION file; nothing closed yet              |
        | dismissAppUpdate('1.10.0'), then a new app   | appVersion gives dismissed 1.10.0 (in %APPDATA%)  |
        | dismissAppUpdate('1.10') / None              | ARG_INVALID, the kept value unchanged             |
        """
        version = (HERE.parent / 'VERSION').read_text(encoding='utf-8').strip()
        self.assertEqual(tdn_shopee_app.Api().appVersion(),
                         {'ok': True, 'data': {'version': version, 'commit': None, 'dismissed': None}})
        self.assertTrue(tdn_shopee_app.Api().dismissAppUpdate('1.10.0')['ok'])
        self.assertEqual(tdn_shopee_app.Api().appVersion()['data']['dismissed'], '1.10.0')
        for bad in ('1.10', None):
            self.assertEqual(tdn_shopee_app.Api().dismissAppUpdate(bad)['error']['code'], 'ARG_INVALID')
        self.assertEqual(tdn_shopee_app.Api().appVersion()['data']['dismissed'], '1.10.0')

    def test_app_latest_reply_checked(self):
        """| app-latest prints                                  | appLatest gives               |
        |---------------------------------------------------|-------------------------------|
        | {"format":"app-latest-v1","version":"1.10.0"/null} | that reply                    |
        | the same + "minimumVersion":"1.3.5" (#3)           | that reply                    |
        | a non-semver version or minimumVersion / an extra  | REMOTE_OUTPUT_INVALID         |
        | minimumVersion above version, or with no version   | REMOTE_OUTPUT_INVALID         |
        | key / another form                                 |                               |
        """
        api = tdn_shopee_app.Api()
        for data, code in (({'format': 'app-latest-v1', 'version': '1.10.0'}, None),
                           ({'format': 'app-latest-v1', 'version': None}, None),
                           ({'format': 'app-latest-v1', 'version': '1.10.0', 'minimumVersion': '1.3.5'}, None),
                           ({'format': 'app-latest-v1', 'version': '1.10.0', 'minimumVersion': None},
                            'REMOTE_OUTPUT_INVALID'),
                           ({'format': 'app-latest-v1', 'version': '1.10.0', 'minimumVersion': '1.3'},
                            'REMOTE_OUTPUT_INVALID'),
                           ({'format': 'app-latest-v1', 'version': '1.3.4', 'minimumVersion': '1.3.5'},
                            'REMOTE_OUTPUT_INVALID'),
                           ({'format': 'app-latest-v1', 'version': None, 'minimumVersion': '1.3.5'},
                            'REMOTE_OUTPUT_INVALID'),
                           ({'format': 'app-latest-v1', 'version': 'v1.10.0'}, 'REMOTE_OUTPUT_INVALID'),
                           ({'format': 'app-latest-v1', 'version': '1.0.0', 'url': 'x'}, 'REMOTE_OUTPUT_INVALID'),
                           ({'format': 'app-latest-v2', 'version': '1.0.0'}, 'REMOTE_OUTPUT_INVALID')):
            with self.subTest(json.dumps(data)), \
                    mock.patch.object(api, '_remote', return_value={'ok': True, 'data': data}):
                result = api.appLatest()
                self.assertEqual(result if code is None else result['error']['code'],
                                 {'ok': True, 'data': data} if code is None else code)


if __name__ == '__main__':
    unittest.main()
