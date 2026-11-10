"""Contract tests for the offline B1 gates of shopee_flow.py.

Each test owns a temp run folder and calls the real command line:
python3 shopee_flow.py gate <gate> --run <id>
"""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
SCRIPT = ROOT / 'skills' / 'tdn-shopee-flow' / 'scripts' / 'shopee_flow.py'
MODULES = json.loads((ROOT / 'skills' / 'tdn-shopee-flow' / 'modules.json').read_bytes())
M2_RULE = next(m['ruleVersion'] for m in MODULES['modules'] if m['id'] == 'M2')
RUN_ID = 'run-synthetic-001'

PERIODS = {
    '30d': {'startDate': '2026-10-11', 'endDate': '2026-11-10'},
    '12m': {'startDate': '2025-11-11', 'endDate': '2026-11-10'},
}
OK_OUTCOME = {'format': 'm3-outcome-v1', 'verdict': 'OK', 'errorCode': None}


def sha_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha_folder(folder):
    names = sorted(p.relative_to(folder).as_posix() for p in folder.rglob('*') if p.is_file())
    text = ''.join(f'{name}\t{sha_file(folder / name)}\n' for name in names)
    return hashlib.sha256(text.encode('utf8')).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding='utf8')


def request_payload(cap=300, keywords=None, windows=None, capture_spec='absent'):
    value = {
        'format': 'request-v1',
        'preset': {'keywords': ['kem chống nắng'] if keywords is None else keywords},
        'principalTitles': [],
        'windows': [{'id': wid, 'period': dict(period)} for wid, period in PERIODS.items()] if windows is None else windows,
        'reviewCapPerLink': cap,
    }
    if capture_spec != 'absent':
        value['captureSpec'] = capture_spec
    return value


def shopee_link(rank=1, item='11111111111', shop='222222222', **over):
    link = {
        'rank': rank,
        'productBaseId': f'1__{item}__{shop}',
        'shopId': shop,
        'itemId': item,
        'url': f'https://shopee.vn/product/{shop}/{item}',
        'brand': 'Synthetic brand',
        'revenue': 1000 * rank,
        'reason': f'Hạng {rank}, doanh thu kỳ 1.000, thương hiệu Synthetic brand',
    }
    link.update(over)
    return link


def review_row(review_id, shop='222222222', item='11111111111'):
    return {
        'reviewId': review_id,
        'shopId': shop,
        'itemId': item,
        'postedAtLocal': '2026-11-01 10:00',
        'createdAt': '2026-11-01T10:00:00+07:00',
        'variation': None,
        'ratingStar': 5,
        'ratingState': 'VALID',
        'comment': 'Synthetic review text for tests.',
        'attributes': [],
        'contentType': 'COMMENT',
        'sourcePage': 1,
        'sourceUrl': f'https://shopee.vn/product/{shop}/{item}',
        'sourceRow': 0,
        'admissionReasons': [],
    }


class GateTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        base = pathlib.Path(self._tmp.name)
        self.runs = base / 'runs'
        self.state = base / 'state'
        self.runs.mkdir()
        self.run = self.runs / RUN_ID
        self.run.mkdir()

    def env(self):
        env = {k: v for k, v in os.environ.items()
               if not k.startswith('TDN_') and k not in ('SHOPEE_FLOW_RUNS', 'SHOPEE_FLOW_STATE')}
        env['SHOPEE_FLOW_RUNS'] = str(self.runs)
        env['SHOPEE_FLOW_STATE'] = str(self.state)
        return env

    def gate(self, name, run_id=RUN_ID):
        proc = subprocess.run([sys.executable, str(SCRIPT), 'gate', name, '--run', run_id],
                              capture_output=True, text=True, env=self.env(), timeout=60)
        slip_file = self.runs / run_id / 'gates' / f'{name}.json'
        slip = json.loads(slip_file.read_text()) if slip_file.is_file() else None
        return proc.returncode, slip

    def checks(self, slip):
        return {c['id']: c for c in slip['checks']}

    def write_request(self, **kw):
        write_json(self.run / 'request.json', request_payload(**kw))

    def entry_pass(self, **kw):
        self.write_request(**kw)
        code, slip = self.gate('entry')
        self.assertEqual(code, 0, slip)
        self.assertEqual(slip['verdict'], 'PASS', slip)
        return slip

    def m1_windows(self, rows=None):
        rows = [{'product_base_id': shopee_link()['productBaseId']}] if rows is None else rows
        base = self.run / 'm1'
        base.mkdir(parents=True, exist_ok=True)
        refs = []
        for wid, period in PERIODS.items():
            folder = base / wid
            folder.mkdir()
            write_json(folder / 'manifest.json', {
                'contractVersion': 'metric-v3-window-capture-v2',
                'captureGate': 'PASSED',
                'window': {'id': wid, 'period': dict(period)},
            })
            write_json(folder / 'raw-responses.json', {'rows': rows})
            refs.append({'window': wid, 'path': f'{wid}/manifest.json',
                         'sha256': sha_file(folder / 'manifest.json')})
        write_json(base / 'manifest.json', {'contractVersion': 'metric-v3-capture-v1', 'windows': refs})

    def m1_pass(self, rows=None, **request_kw):
        self.entry_pass(**request_kw)
        self.m1_windows(rows)
        code, slip = self.gate('m1')
        self.assertEqual(code, 0, slip)
        return slip

    def selection(self, links, counts=None, **over):
        value = {
            'format': 'selection-v1',
            'runId': RUN_ID,
            'source': 'auto',
            'pickRuleVersion': M2_RULE,
            'metricInputSha256': sha_folder(self.run / 'm1'),
            'links': links,
            'counts': {'walked': 9, 'deleted': 0, 'notIncluded': 3, 'tokenGuardRejected': 0,
                       'eligible': 6, 'picked': len(links), 'maskedRows': 0, 'maskedAboveLowestPick': 0}
                      if counts is None else counts,
        }
        value.update(over)
        write_json(self.run / 'm2' / 'selection.json', value)
        return value

    def m2_pass(self, links=None, cap=300):
        links = [shopee_link()] if links is None else links
        self.m1_pass(rows=[{'product_base_id': link['productBaseId']} for link in links], cap=cap)
        self.selection(links)
        code, slip = self.gate('m2')
        self.assertEqual(code, 0, slip)
        return slip

    def m3_files(self, rows, outcome):
        write_json(self.run / 'm3' / 'reviews.json', rows)
        if outcome is not None:
            write_json(self.run / 'm3' / 'outcome.json', outcome)


class ExitCodeTests(GateTest):
    def test_exit_0_pass(self):
        slip = self.entry_pass()
        self.assertEqual(slip['verdict'], 'PASS')
        self.assertEqual(slip['next'], 'M1')

    def test_exit_20_fail(self):
        self.write_request(keywords=[])
        code, slip = self.gate('entry')
        self.assertEqual(code, 20)
        self.assertEqual(slip['verdict'], 'FAIL')
        self.assertFalse(self.checks(slip)['product_text']['ok'])

    def test_exit_21_wait_owner(self):
        self.entry_pass()
        self.m1_windows()
        manifest_path = self.run / 'm1' / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        manifest['errorCode'] = 'CAPTURE_LOGIN_REQUIRED'
        write_json(manifest_path, manifest)
        code, slip = self.gate('m1')
        self.assertEqual(code, 21)
        self.assertEqual(slip['verdict'], 'WAIT_OWNER')
        self.assertEqual(slip['errorCode'], 'CAPTURE_LOGIN_REQUIRED')
        self.assertIsNone(slip['next'])

    def test_exit_22_gate_not_passed_when_previous_slip_missing(self):
        self.write_request()
        self.m1_windows()
        code, slip = self.gate('m1')
        self.assertEqual(code, 22)
        self.assertEqual(slip['errorCode'], 'GATE_NOT_PASSED')
        self.assertEqual(slip['checks'], [])

    def test_exit_23_gate_input_changed(self):
        self.entry_pass()
        self.m1_windows()
        self.write_request(cap=200)
        code, slip = self.gate('m1')
        self.assertEqual(code, 23)
        self.assertEqual(slip['errorCode'], 'GATE_INPUT_CHANGED')
        self.assertEqual(slip['checks'], [])

    def test_usage_exit_2(self):
        code, slip = self.gate('entry', run_id='../escape')
        self.assertEqual(code, 2)
        self.assertIsNone(slip)
        code, slip = self.gate('entry', run_id='missing-run')
        self.assertEqual(code, 2)
        self.assertIsNone(slip)

    def test_blocking_failing_previous_slip(self):
        self.write_request(keywords=[])
        code, _ = self.gate('entry')
        self.assertEqual(code, 20)
        self.m1_windows()
        code, slip = self.gate('m1')
        self.assertEqual(code, 22)
        self.assertEqual(slip['errorCode'], 'GATE_NOT_PASSED')


class EntryCheckTests(GateTest):
    def test_product_text(self):
        self.write_request(keywords=['   '])
        code, slip = self.gate('entry')
        checks = self.checks(slip)
        self.assertEqual(code, 20)
        self.assertFalse(checks['product_text']['ok'])
        self.assertTrue(checks['period_dates']['ok'])
        self.assertTrue(checks['review_cap_1_300']['ok'])
        self.assertTrue(checks['readonly_off']['ok'])

    def test_period_dates(self):
        windows = [{'id': wid, 'period': dict(period)} for wid, period in PERIODS.items()]
        windows[0]['period'] = {'startDate': '2026-11-10', 'endDate': '2026-10-11'}
        self.write_request(windows=windows)
        code, slip = self.gate('entry')
        self.assertEqual(code, 20)
        self.assertFalse(self.checks(slip)['period_dates']['ok'])

    def test_review_cap_1_300(self):
        self.write_request(cap=301)
        code, slip = self.gate('entry')
        checks = self.checks(slip)
        self.assertEqual(code, 20)
        self.assertFalse(checks['review_cap_1_300']['ok'])
        self.assertEqual(checks['review_cap_1_300']['got'], 301)

    def test_readonly_off(self):
        guard = self.state / 'shopee-flow' / 'READONLY'
        guard.parent.mkdir(parents=True)
        guard.write_text('on')
        self.write_request()
        code, slip = self.gate('entry')
        checks = self.checks(slip)
        self.assertEqual(code, 20)
        self.assertFalse(checks['readonly_off']['ok'])
        self.assertTrue(checks['product_text']['ok'])

    def test_capture_spec_absent_is_a_warning(self):
        self.write_request()
        code, slip = self.gate('entry')
        checks = self.checks(slip)
        self.assertEqual(code, 0, slip)
        self.assertEqual(slip['verdict'], 'PASS')
        warning = checks['capture_spec_present']
        self.assertFalse(warning['ok'])
        self.assertEqual(warning['got'], 'absent')
        self.assertEqual(warning['level'], 'warn')
        self.assertEqual(slip['next'], 'M1')

    def test_capture_spec_invalid_fails(self):
        self.write_request(capture_spec={'windows': 'not-a-list'})
        code, slip = self.gate('entry')
        checks = self.checks(slip)
        self.assertEqual(code, 20, slip)
        self.assertEqual(slip['verdict'], 'FAIL')
        self.assertFalse(checks['capture_spec_present']['ok'])
        self.assertNotEqual(checks['capture_spec_present'].get('level'), 'warn')


class M2CheckTests(GateTest):
    def test_more_than_five_links(self):
        links = [shopee_link(rank=i, item=f'1000000000{i}', shop=f'2000000000{i}') for i in range(1, 7)]
        self.m1_pass(rows=[{'product_base_id': link['productBaseId']} for link in links])
        self.selection(links)
        code, slip = self.gate('m2')
        checks = self.checks(slip)
        self.assertEqual(code, 20)
        self.assertFalse(checks['links_1_to_5']['ok'])
        self.assertTrue(checks['links_in_m1']['ok'])

    def test_ids_numeric(self):
        good = shopee_link()
        bad = shopee_link(rank=2, item='12a', shop='333333333')
        self.m1_pass(rows=[{'product_base_id': good['productBaseId']},
                           {'product_base_id': bad['productBaseId']}])
        self.selection([good, bad])
        code, slip = self.gate('m2')
        self.assertEqual(code, 20)
        self.assertFalse(self.checks(slip)['ids_numeric']['ok'])

    def test_no_duplicate_shop(self):
        first = shopee_link(rank=1, item='11111111111', shop='222222222')
        second = shopee_link(rank=2, item='33333333333', shop='222222222')
        self.m1_pass(rows=[{'product_base_id': first['productBaseId']},
                           {'product_base_id': second['productBaseId']}])
        self.selection([first, second])
        code, slip = self.gate('m2')
        self.assertEqual(code, 20)
        self.assertFalse(self.checks(slip)['no_duplicate_shop']['ok'])

    def test_no_masked_above_lowest_pick(self):
        link = shopee_link()
        self.m1_pass(rows=[{'product_base_id': link['productBaseId']}])
        counts = {'walked': 1, 'deleted': 0, 'notIncluded': 0, 'tokenGuardRejected': 0,
                  'eligible': 1, 'picked': 1, 'maskedRows': 2, 'maskedAboveLowestPick': 1}
        self.selection([link], counts=counts)
        code, slip = self.gate('m2')
        checks = self.checks(slip)
        self.assertEqual(code, 20)
        self.assertFalse(checks['no_masked_above_lowest_pick']['ok'])
        self.assertEqual(checks['no_masked_above_lowest_pick']['got'], 1)

    def test_no_masked_above_lowest_pick_zero_passes(self):
        link = shopee_link()
        self.m1_pass(rows=[{'product_base_id': link['productBaseId']}])
        counts = {'walked': 1, 'deleted': 0, 'notIncluded': 0, 'tokenGuardRejected': 0,
                  'eligible': 1, 'picked': 1, 'maskedRows': 3, 'maskedAboveLowestPick': 0}
        self.selection([link], counts=counts)
        code, slip = self.gate('m2')
        checks = self.checks(slip)
        self.assertEqual(code, 0, slip)
        self.assertEqual(slip['verdict'], 'PASS')
        self.assertTrue(checks['no_masked_above_lowest_pick']['ok'])
        self.assertEqual(checks['no_masked_above_lowest_pick']['got'], 0)

    def test_links_in_m1(self):
        chosen = shopee_link()
        other = shopee_link(rank=2, item='33333333333', shop='444444444')
        self.m1_pass(rows=[{'product_base_id': chosen['productBaseId']}])
        self.selection([other])
        code, slip = self.gate('m2')
        self.assertEqual(code, 20)
        self.assertFalse(self.checks(slip)['links_in_m1']['ok'])

    def test_pick_rule_version(self):
        link = shopee_link()
        self.m1_pass(rows=[{'product_base_id': link['productBaseId']}])
        self.selection([link], pickRuleVersion='autorun-pick-v2')
        code, slip = self.gate('m2')
        self.assertEqual(code, 20)
        self.assertFalse(self.checks(slip)['pick_rule_version']['ok'])

    def test_pick_reason_present(self):
        link = shopee_link(reason='   ')
        self.m1_pass(rows=[{'product_base_id': link['productBaseId']}])
        self.selection([link])
        code, slip = self.gate('m2')
        self.assertEqual(code, 20)
        self.assertFalse(self.checks(slip)['pick_reason_present']['ok'])

    def test_manual_marks_three_checks_warn(self):
        write_json(self.run / 'm2' / 'selection.json', {
            'format': 'selection-v1', 'runId': RUN_ID, 'source': 'manual',
            'pickRuleVersion': 'manual', 'metricInputSha256': None,
            'links': [shopee_link()], 'counts': {'maskedAboveLowestPick': 9},
        })
        code, slip = self.gate('m2')
        self.assertEqual(code, 0, slip)
        checks = self.checks(slip)
        for name in ('no_masked_above_lowest_pick', 'links_in_m1', 'pick_rule_version'):
            self.assertTrue(checks[name]['ok'], name)
            self.assertEqual(checks[name]['got'], 'manual', name)
            self.assertEqual(checks[name]['level'], 'warn', name)
        self.assertIsNone(slip['inputSha256'])


class M3CheckTests(GateTest):
    def test_min_reviews_per_link(self):
        self.m2_pass()
        self.m3_files([], OK_OUTCOME)
        code, slip = self.gate('m3')
        checks = self.checks(slip)
        self.assertEqual(code, 20)
        self.assertTrue(checks['verdict_ok']['ok'])
        self.assertFalse(checks['min_reviews_per_link']['ok'])

    def test_cap_not_exceeded(self):
        self.m2_pass(cap=2)
        self.m3_files([review_row('rv-1'), review_row('rv-2'), review_row('rv-3')], OK_OUTCOME)
        code, slip = self.gate('m3')
        checks = self.checks(slip)
        self.assertEqual(code, 20)
        self.assertTrue(checks['min_reviews_per_link']['ok'])
        self.assertFalse(checks['cap_not_exceeded']['ok'])

    def test_no_duplicate_review_ids(self):
        self.m2_pass()
        self.m3_files([review_row('rv-1'), review_row('rv-1')], OK_OUTCOME)
        code, slip = self.gate('m3')
        self.assertEqual(code, 20)
        self.assertFalse(self.checks(slip)['no_duplicate_review_ids']['ok'])

    def test_product_ids_match_m2(self):
        self.m2_pass()
        self.m3_files([review_row('rv-1', item='99999999999', shop='888888888')], OK_OUTCOME)
        code, slip = self.gate('m3')
        self.assertEqual(code, 20)
        self.assertFalse(self.checks(slip)['product_ids_match_m2']['ok'])

    def test_verdict_ok_missing_outcome(self):
        self.m2_pass()
        self.m3_files([review_row('rv-1')], None)
        code, slip = self.gate('m3')
        checks = self.checks(slip)
        self.assertEqual(code, 20)
        self.assertFalse(checks['verdict_ok']['ok'])
        self.assertEqual(checks['verdict_ok']['got'], 'MISSING_OR_INVALID')
        self.assertIsNone(slip['errorCode'])

    def test_verdict_ok_provider_blocked(self):
        self.m2_pass()
        self.m3_files([], {'format': 'm3-outcome-v1', 'verdict': 'PROVIDER_BLOCKED',
                           'errorCode': 'PROVIDER_BLOCKED'})
        code, slip = self.gate('m3')
        self.assertEqual(code, 20)
        self.assertEqual(slip['verdict'], 'FAIL')
        self.assertFalse(self.checks(slip)['verdict_ok']['ok'])
        self.assertEqual(self.checks(slip)['verdict_ok']['got'], 'PROVIDER_BLOCKED')
        self.assertEqual(slip['errorCode'], 'PROVIDER_BLOCKED')

    def test_partial_listings_below_cap_passes_with_warning(self):
        links = [shopee_link(rank=1, item='11111111111', shop='222222222'),
                 shopee_link(rank=2, item='33333333333', shop='444444444')]
        self.m2_pass(links=links, cap=5)
        rows = [review_row(f'rv-1-{i}') for i in range(5)]
        rows += [review_row(f'rv-2-{i}', shop='444444444', item='33333333333') for i in range(2)]
        self.m3_files(rows, {'format': 'm3-outcome-v1', 'verdict': 'PARTIAL_LISTINGS', 'errorCode': None})
        code, slip = self.gate('m3')
        self.assertEqual(code, 0, slip)
        self.assertEqual(slip['verdict'], 'PASS')
        checks = self.checks(slip)
        self.assertTrue(checks['verdict_ok']['ok'])
        self.assertEqual(checks['verdict_ok']['got'], 'PARTIAL_LISTINGS')
        self.assertTrue(checks['min_reviews_per_link']['ok'])
        self.assertEqual(checks['min_reviews_per_link']['got'], [5, 2])
        warning = checks['links_below_cap']
        self.assertFalse(warning['ok'])
        self.assertEqual(warning['level'], 'warn')
        self.assertEqual(warning['got'], {'belowCap': 1, 'cap': 5})
        self.assertIsNone(slip['errorCode'])
        self.assertIsNone(slip['next'])

    def test_partial_listings_zero_link_fails_min_reviews(self):
        links = [shopee_link(rank=1, item='11111111111', shop='222222222'),
                 shopee_link(rank=2, item='33333333333', shop='444444444')]
        self.m2_pass(links=links, cap=5)
        rows = [review_row(f'rv-1-{i}') for i in range(5)]
        self.m3_files(rows, {'format': 'm3-outcome-v1', 'verdict': 'PARTIAL_LISTINGS', 'errorCode': None})
        code, slip = self.gate('m3')
        checks = self.checks(slip)
        self.assertEqual(code, 20, slip)
        self.assertEqual(slip['verdict'], 'FAIL')
        self.assertTrue(checks['verdict_ok']['ok'])
        self.assertFalse(checks['min_reviews_per_link']['ok'])
        self.assertEqual(checks['min_reviews_per_link']['got'], [5, 0])

    def test_verdict_ok_all_links_at_cap(self):
        links = [shopee_link(rank=1, item='11111111111', shop='222222222'),
                 shopee_link(rank=2, item='33333333333', shop='444444444')]
        self.m2_pass(links=links, cap=2)
        rows = [review_row(f'rv-1-{i}') for i in range(2)]
        rows += [review_row(f'rv-2-{i}', shop='444444444', item='33333333333') for i in range(2)]
        self.m3_files(rows, OK_OUTCOME)
        code, slip = self.gate('m3')
        checks = self.checks(slip)
        self.assertEqual(code, 0, slip)
        self.assertEqual(slip['verdict'], 'PASS')
        self.assertTrue(checks['links_below_cap']['ok'])
        self.assertEqual(checks['links_below_cap']['got'], {'belowCap': 0, 'cap': 2})

    def test_handover_code_wait_owner(self):
        self.m2_pass()
        self.m3_files([], {'format': 'm3-outcome-v1', 'verdict': 'SHOPEE_LOGIN_REQUIRED',
                           'errorCode': None})
        code, slip = self.gate('m3')
        self.assertEqual(code, 21)
        self.assertEqual(slip['verdict'], 'WAIT_OWNER')
        self.assertEqual(slip['errorCode'], 'SHOPEE_LOGIN_REQUIRED')


class SlipTests(GateTest):
    def test_all_handoff_keys(self):
        slip = self.entry_pass()
        self.assertEqual(set(slip), {'format', 'module', 'runId', 'skillVersion', 'verdict',
                                     'inputSha256', 'outputSha256', 'checks', 'errorCode', 'next'})
        self.assertEqual(slip['format'], 'handoff-v1')
        self.assertEqual(slip['module'], 'ENTRY')
        self.assertEqual(slip['runId'], RUN_ID)
        self.assertEqual(slip['skillVersion'], MODULES['flow']['skillVersion'])
        self.assertIsNone(slip['inputSha256'])
        self.assertIsNone(slip['errorCode'])
        for check in slip['checks']:
            self.assertLessEqual({'id', 'ok', 'got'}, set(check))
            self.assertIsInstance(check['ok'], bool)

    def test_file_hash_rule(self):
        self.entry_pass()
        entry = json.loads((self.run / 'gates' / 'entry.json').read_text())
        self.assertEqual(entry['outputSha256'], sha_file(self.run / 'request.json'))
        link = shopee_link()
        self.m1_windows([{'product_base_id': link['productBaseId']}])
        code, slip = self.gate('m1')
        self.assertEqual(code, 0, slip)
        self.assertEqual(slip['inputSha256'], sha_file(self.run / 'request.json'))
        self.selection([link])
        code, slip = self.gate('m2')
        self.assertEqual(code, 0, slip)
        self.assertEqual(slip['outputSha256'], sha_file(self.run / 'm2' / 'selection.json'))
        self.assertEqual(slip['inputSha256'], sha_folder(self.run / 'm1'))

    def test_recursive_m1_folder_hash(self):
        link = shopee_link()
        self.entry_pass()
        self.m1_windows([{'product_base_id': link['productBaseId']}])
        code, slip = self.gate('m1')
        self.assertEqual(code, 0, slip)
        self.assertEqual(slip['outputSha256'], sha_folder(self.run / 'm1'))

    def test_recursive_m3_folder_hash(self):
        self.m2_pass()
        self.m3_files([review_row('rv-1')], OK_OUTCOME)
        code, slip = self.gate('m3')
        self.assertEqual(code, 0, slip)
        self.assertEqual(slip['outputSha256'], sha_folder(self.run / 'm3'))
        self.assertEqual(slip['inputSha256'], sha_file(self.run / 'm2' / 'selection.json'))


if __name__ == '__main__':
    unittest.main()
