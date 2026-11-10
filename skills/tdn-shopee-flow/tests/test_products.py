"""Contract tests for `add-product` and its preset round trip (R5 follow-up).

Every case owns a temp presets and runs root and calls the real command line:

    python3 shopee_flow.py add-product --stdin

These cases need the real Node builder, so they keep the real PATH instead of
the fake `node` used by the read-only module tests.
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unicodedata
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'skills' / 'tdn-shopee-flow' / 'scripts' / 'shopee_flow.py'
HEALTH = 'c2035652732'
END = '2026-11-10'


class ProductTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.base = pathlib.Path(self._tmp.name)
        self.runs = self.base / 'runs'
        self.presets = self.base / 'presets'
        for folder in (self.runs, self.presets):
            folder.mkdir(parents=True)

    def env(self):
        env = {k: v for k, v in os.environ.items()
               if not k.startswith('TDN_') and k not in ('SHOPEE_FLOW_RUNS', 'SHOPEE_FLOW_STATE',
                                                         'SHOPEE_FLOW_PRESETS')}
        env['SHOPEE_FLOW_RUNS'] = str(self.runs)
        env['SHOPEE_FLOW_STATE'] = str(self.base / 'state')
        env['SHOPEE_FLOW_PRESETS'] = str(self.presets)
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        return env

    def command(self, *args, stdin=None):
        proc = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True,
                              env=self.env(), input=stdin, timeout=120)
        payload = json.loads(proc.stdout) if proc.stdout.strip() else None
        return proc.returncode, payload, proc.stderr

    def add(self, preset_id='kem-chong-nang-abc', label='Kem chống nắng ABC',
            keyword='kem chống nắng', category=HEALTH, **extra):
        value = {'presetId': preset_id, 'label': label, 'keyword': keyword,
                 'categoryId': category, **extra}
        return self.command('add-product', '--stdin', stdin=json.dumps(value))

    def preset_files(self):
        return sorted(p.name for p in self.presets.glob('*.json'))

    def assert_product_error(self, result, code):
        rc, payload, stderr = result
        self.assertEqual(rc, 2, (payload, stderr))
        self.assertEqual(payload, {'format': 'error-v1', 'code': code, 'message': code})


class ProductSaveTests(ProductTest):
    def test_save_reloads_through_presets_and_new_run(self):
        rc, payload, stderr = self.add(
            label='  Kem chống nắng ABC  ',
            keyword2='kem chống nắng da dầu',
            principalTitles=['Kem chống nắng ABC 50ml'])
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload, {'format': 'add-product-v1',
                                   'presetId': 'kem-chong-nang-abc', 'label': 'Kem chống nắng ABC'})
        self.assertEqual(list(self.runs.iterdir()), [], 'saving a product must not create a run')

        rc, presets, stderr = self.command('presets')
        self.assertEqual(rc, 0, (presets, stderr))
        entry = presets['presets'][0]
        self.assertEqual(entry['label'], 'Kem chống nắng ABC')
        self.assertEqual(entry['keywords'], ['kem chống nắng', 'kem chống nắng da dầu'])
        self.assertEqual(entry['categoryLabel'], 'Sức Khoẻ')
        self.assertEqual(entry['source'], 'manual')

        rc, created, stderr = self.command('new-run', '--stdin', stdin=json.dumps({
            'presetId': 'kem-chong-nang-abc', 'endDate': END, 'reviewCapPerLink': 25}))
        self.assertEqual(rc, 0, (created, stderr))
        request = json.loads((self.runs / created['runId'] / 'request.json').read_text())
        self.assertEqual(request['preset']['keywords'], ['kem chống nắng', 'kem chống nắng da dầu'])
        self.assertEqual(request['principalTitles'], ['Kem chống nắng ABC 50ml'])
        self.assertEqual(request['reviewCapPerLink'], 25)
        self.assertEqual(request['captureSpec']['preset']['category']['id'], HEALTH)
        self.assertEqual([w['id'] for w in request['windows']], ['30d', '12m'])
        self.assertEqual([w['id'] for w in request['captureSpec']['windows']], ['30d', '12m'])


class ProductValidationTests(ProductTest):
    def test_duplicate_name_ignores_unicode_form_case_and_spaces(self):
        rc, payload, stderr = self.add(preset_id='sua-bot-mau', label='Sữa bột mẫu', keyword='sữa bột')
        self.assertEqual(rc, 0, (payload, stderr))
        duplicate = unicodedata.normalize('NFD', 'SỮA  BỘT MẪU')
        self.assertNotEqual(duplicate, unicodedata.normalize('NFC', duplicate))
        self.assert_product_error(
            self.add(preset_id='sua-bot-mau-2', label=duplicate, keyword='sữa bột'), 'PRESET_NAME_EXISTS')
        self.assertEqual(self.preset_files(), ['sua-bot-mau.json'])

    def test_duplicate_json_keys_are_rejected(self):
        raw = ('{"presetId":"kem","label":"Kem","keyword":"kem chống nắng",'
               '"keyword":"kem dưỡng","categoryId":"%s"}' % HEALTH)
        result = self.command('add-product', '--stdin', stdin=raw)
        self.assert_product_error(result, 'PRODUCT_INPUT_INVALID')
        self.assertEqual(self.preset_files(), [])

    def test_unknown_field_is_rejected(self):
        self.assert_product_error(self.add(brand='Không có trong hợp đồng'), 'PRODUCT_INPUT_INVALID')
        self.assertEqual(self.preset_files(), [])

    def test_unsafe_ids_are_rejected_before_writing(self):
        for preset_id in ('../escape', 'Kem', 'a/b', '-kem', 'a' * 65):
            with self.subTest(preset_id=preset_id):
                self.assert_product_error(self.add(preset_id=preset_id), 'PRODUCT_INPUT_INVALID')
        self.assertEqual(self.preset_files(), [])
        self.assertFalse((self.base / 'escape.json').exists())

    def test_only_health_top_level_category_is_accepted(self):
        self.assert_product_error(self.add(category='c407923064'), 'PRODUCT_CATEGORY_UNSUPPORTED')
        self.assertEqual(self.preset_files(), [])

    def test_keyword_with_comma_is_rejected(self):
        self.assert_product_error(self.add(keyword='kem, chống nắng'), 'PRODUCT_INPUT_INVALID')
        self.assertEqual(self.preset_files(), [])


class ProductUnicodeSizeTests(ProductTest):
    def test_schema_valid_unicode_titles_fit_the_documented_limit(self):
        titles = [f'{n:02d}' + 'ế' * 498 for n in range(30)]
        self.assertEqual(len(set(titles)), 30)
        self.assertTrue(all(len(title) == 500 for title in titles))
        raw = json.dumps({'presetId': 'kem-chong-nang-abc', 'label': 'Kem chống nắng ABC',
                          'keyword': 'kem chống nắng', 'categoryId': HEALTH,
                          'principalTitles': titles}, ensure_ascii=False, separators=(',', ':'))
        self.assertLessEqual(len(raw.encode('utf8')), 65536)
        rc, payload, stderr = self.command('add-product', '--stdin', stdin=raw)
        self.assertEqual(rc, 0, (payload, stderr))
        self.assertEqual(payload.get('format'), 'add-product-v1', (payload, stderr))
        stored = json.loads((self.presets / 'kem-chong-nang-abc.json').read_text())
        self.assertEqual(stored['principalTitles'], titles)


class ProductConcurrencyTests(ProductTest):
    def test_concurrent_saves_leave_only_complete_presets(self):
        values = [{'presetId': f'song-song-{n}', 'label': f'Sản phẩm song song {n}',
                   'keyword': f'từ khóa {n}', 'categoryId': HEALTH} for n in range(6)]
        procs = [subprocess.Popen(
            [sys.executable, str(SCRIPT), 'add-product', '--stdin'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, env=self.env()) for _ in values]
        # The CLI reads stdin to EOF, so a written request alone leaves its process
        # blocked. Close every request stream before waiting on any writer: that
        # releases all six together, so they really compete for the store lock
        # instead of saving one after another.
        for proc, value in zip(procs, values):
            proc.stdin.write(json.dumps(value))
            proc.stdin.flush()
        for proc in procs:
            proc.stdin.close()
            proc.stdin = None  # communicate() must not flush a pipe we already closed
        saved = {}
        outcomes = {}
        try:
            for proc, value in zip(procs, values):
                stdout, stderr = proc.communicate(timeout=120)
                payload = json.loads(stdout) if stdout.strip() else None
                if proc.returncode == 0:
                    self.assertEqual(payload['format'], 'add-product-v1', (payload, stderr))
                    self.assertEqual(payload['presetId'], value['presetId'], (payload, stderr))
                    self.assertEqual(payload['label'], value['label'], (payload, stderr))
                    saved[payload['presetId']] = payload['label']
                    outcomes[value['presetId']] = 'saved'
                else:
                    self.assertEqual(proc.returncode, 2, (payload, stderr))
                    self.assertEqual(payload['code'], 'PRESET_BUSY', (payload, stderr))
                    outcomes[value['presetId']] = 'busy'
        except subprocess.TimeoutExpired:
            for proc in procs:
                proc.kill()
            raise
        self.assertEqual(set(outcomes), {v['presetId'] for v in values}, outcomes)
        self.assertEqual({k for k, outcome in outcomes.items() if outcome == 'saved'},
                         set(saved), outcomes)
        self.assertIn('saved', outcomes.values(), f'no writer saved: {outcomes}')
        files = self.preset_files()
        extra = {p.name for p in self.presets.iterdir()} - set(files) - {'.presets.lock'}
        self.assertEqual(extra, set(), 'a failed save left a partial file')
        stored = {json.loads((self.presets / name).read_text())['presetId']: name for name in files}
        self.assertEqual(set(stored), set(saved))
        for preset_id, name in stored.items():
            item = json.loads((self.presets / name).read_text())
            self.assertEqual(item['label'], saved[preset_id], 'a competing writer overwrote another product')
            self.assertEqual(item['presetId'], preset_id)
            self.assertEqual(set(item), {'format', 'presetId', 'label', 'preset', 'principalTitles', 'source'})

    @unittest.skipUnless(sys.platform != 'win32', 'flock lock test is POSIX only')
    def test_save_reports_busy_when_store_is_locked(self):
        import fcntl
        lock_path = self.presets / '.presets.lock'
        with open(lock_path, 'a') as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assert_product_error(self.add(), 'PRESET_BUSY')
            self.assertEqual(self.preset_files(), [])
        rc, payload, stderr = self.add()
        self.assertEqual(rc, 0, (payload, stderr))


class ProductSymlinkTests(ProductTest):
    def test_symlinked_presets_root_is_refused(self):
        target = self.base / 'outside'
        target.mkdir()
        self.presets.rmdir()
        try:
            self.presets.symlink_to(target, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest('symlinks are unavailable')
        self.assert_product_error(self.add(), 'PRESET_WRITE_FAILED')
        self.assertEqual(list(target.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
