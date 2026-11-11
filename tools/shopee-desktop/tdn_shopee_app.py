"""Desktop transport for the Shopee flow CLI; workflow decisions stay remote."""
import argparse
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading


_RUN_ID = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,127}')
_PLAN_SHA = re.compile(r'[0-9a-f]{64}')
_REMOTE_PATH = re.compile(r'(\$HOME/)?[A-Za-z0-9_./-]+')
_STATIC_ERROR = re.compile(r'[A-Z][A-Z0-9_]{0,63}')
EXPORT_MAX_BYTES = 64 * 1024 * 1024
EXPORT_ERROR_MAX_BYTES = 64 * 1024
_COMMANDS = {
    'connection': ('connection',),
    'presets': ('presets',),
    'runs': ('runs',),
    'status': ('run-info', '--run'),
    'library': ('library',),
    'new': ('new-run', '--stdin'),
    'addProduct': ('add-product', '--stdin'),
    'entry': ('gate', 'entry', '--run'),
    'flow': ('run', '--run'),
    'm1': ('m1', '--run'),
    'm2': ('m2', '--run'),
    'm3': ('m3', '--run'),
    'reviewSampling': ('review-sampling', '--run'),
    'refreshReviewCounts': ('review-counts', '--run'),
    'saveReviewPlan': ('save-review-plan', '--run'),
    'stopReviewAttempt': ('stop-review-attempt', '--run'),
    'reconcileReviewAttempt': ('reconcile-review-attempt', '--run'),
    'reviewData': ('review-data', '--run'),
    'saveReviewData': ('save-review-data', '--run'),
    'exportReviewData': ('export-review-data', '--run'),
    'readReviewExport': ('read-review-export', '--run'),
}


class _BridgeFailure(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _error(code, message=None):
    return {'ok': False, 'error': {'code': code, 'message': code if message is None else message}}


def _safe_filename(name, export_format):
    fallback = f'shopee-reviews.{export_format}'
    if not isinstance(name, str):
        return fallback
    base = re.split(r'[\\/]', name)[-1]
    base = re.sub(r'[\x00-\x1f<>:"|?*]', '_', base).strip().rstrip('. ')
    if not base or base in ('.', '..'):
        base = fallback
    if not base.lower().endswith('.' + export_format):
        base += '.' + export_format
    stem, extension = os.path.splitext(base)
    if stem.upper() in {'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5',
                        'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4',
                        'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'}:
        stem = '_' + stem
    if base.startswith('.'):
        stem = '_' + stem
    if len(stem) > 120 - len(extension):
        stem = stem[:120 - len(extension)]
    return stem + extension


def _choose_save_path(file_name):
    try:
        import webview
    except ImportError:
        raise _BridgeFailure('SAVE_DIALOG_UNAVAILABLE') from None
    try:
        dialog_type = getattr(webview, 'SAVE_DIALOG', None)
        if dialog_type is None:
            dialog_type = getattr(getattr(webview, 'FileDialog', None), 'SAVE')
        windows = getattr(webview, 'windows', None)
        window = windows[0] if windows else None
        if window is not None and hasattr(window, 'create_file_dialog'):
            selected = window.create_file_dialog(dialog_type, save_filename=file_name)
        else:
            selected = webview.create_file_dialog(dialog_type, save_filename=file_name)
    except Exception:
        raise _BridgeFailure('SAVE_DIALOG_FAILED') from None
    if isinstance(selected, (list, tuple)):
        selected = selected[0] if selected else None
    if selected is None or selected == '':
        return None
    if not isinstance(selected, (str, os.PathLike)):
        raise _BridgeFailure('SAVE_DIALOG_FAILED')
    return os.fspath(selected)


def _load_config():
    override = os.environ.get('TDN_SHOPEE_APP_CONFIG')
    if override is not None:
        path = Path(override)
        if not override or not path.is_absolute():
            raise _BridgeFailure('CONFIG_INVALID')
    else:
        appdata = os.environ.get('APPDATA')
        if not appdata:
            raise _BridgeFailure('CONFIG_MISSING')
        path = Path(appdata) / 'tdn-shopee-flow' / 'config.json'
    try:
        config = json.loads(path.read_text(encoding='utf-8-sig'))
    except FileNotFoundError:
        raise _BridgeFailure('CONFIG_MISSING') from None
    except (OSError, ValueError):
        raise _BridgeFailure('CONFIG_INVALID') from None
    allowed = {'sshCommand', 'remoteScript', 'runsRoot', 'presetsRoot', 'remoteEnvFile', 'timeoutSeconds'}
    if not isinstance(config, dict) or set(config) - allowed:
        raise _BridgeFailure('CONFIG_INVALID')
    command = config.get('sshCommand')
    if (not isinstance(command, list) or not command or
            not all(isinstance(arg, str) and arg.strip() and '\x00' not in arg for arg in command)):
        raise _BridgeFailure('CONFIG_INVALID')
    for key in ('remoteScript', 'runsRoot', 'presetsRoot', 'remoteEnvFile'):
        value = config.get(key)
        if value is None and key != 'remoteScript':
            continue
        if not isinstance(value, str) or not _REMOTE_PATH.fullmatch(value):
            raise _BridgeFailure('CONFIG_INVALID')
    timeout = config.get('timeoutSeconds', 30)
    if type(timeout) is not int or timeout <= 0:
        raise _BridgeFailure('CONFIG_INVALID')
    return {**config, 'timeoutSeconds': timeout}


class Api:
    """Only these public methods are exposed to the page."""

    def _safe(self, operation):
        try:
            return operation()
        except _BridgeFailure as error:
            return _error(error.code)
        except Exception:
            # Never expose exception text, SSH diagnostics or configuration to JS.
            return _error('REMOTE_OUTPUT_INVALID')

    def _run_id(self, run_id):
        if not isinstance(run_id, str) or not _RUN_ID.fullmatch(run_id):
            raise _BridgeFailure('ARG_INVALID')
        return run_id

    def _remote_plan(self, action, run_id=None, payload=None, config=None, plan_sha256=None,
                     kind=None, attempt_id=None, export_sha256=None):
        words = list(_COMMANDS[action])
        if action in ('status', 'entry', 'flow', 'm1', 'm2', 'm3',
                      'reviewSampling', 'refreshReviewCounts', 'saveReviewPlan',
                      'stopReviewAttempt', 'reconcileReviewAttempt', 'reviewData',
                      'saveReviewData', 'exportReviewData', 'readReviewExport'):
            words.append(self._run_id(run_id))
        if action in ('saveReviewPlan', 'saveReviewData', 'exportReviewData'):
            words.append('--stdin')
        if action in ('stopReviewAttempt', 'reconcileReviewAttempt'):
            words.extend(['--kind', kind, '--attempt', attempt_id])
        if action == 'm3' and plan_sha256 is not None:
            words.extend(['--plan-sha256', plan_sha256])
        if action == 'readReviewExport':
            words.extend(['--export-sha256', export_sha256])
        if action in ('flow', 'm1', 'm2', 'm3', 'refreshReviewCounts', 'reconcileReviewAttempt'):
            words.append('--detach')
        config = _load_config() if config is None else config
        lines = ['export PYTHONDONTWRITEBYTECODE=1']
        for key, name in (('runsRoot', 'SHOPEE_FLOW_RUNS'), ('presetsRoot', 'SHOPEE_FLOW_PRESETS')):
            if config.get(key) is not None:
                lines.append(f'export {name}="{config[key]}"')
        env_file = config.get('remoteEnvFile')
        if env_file is not None:
            lines.append(f'if [ -f "{env_file}" ]; then set -a; . "{env_file}"; set +a; fi')
        command = f'python3 "{config["remoteScript"]}" ' + ' '.join(words)
        if action in ('new', 'addProduct', 'saveReviewPlan', 'saveReviewData', 'exportReviewData'):
            encoded = base64.b64encode(json.dumps(payload, ensure_ascii=False, allow_nan=False,
                                                  separators=(',', ':')).encode('utf-8')).decode('ascii')
            command = f"printf '%s' '{encoded}' | base64 -d | " + command
        lines.append(command)
        return config, lines

    def _remote(self, action, run_id=None, payload=None, config=None, plan_sha256=None,
                kind=None, attempt_id=None, export_sha256=None):
        config, lines = self._remote_plan(action, run_id=run_id, payload=payload, config=config,
                                          plan_sha256=plan_sha256, kind=kind, attempt_id=attempt_id,
                                          export_sha256=export_sha256)
        options = {'input': ('\n'.join(lines) + '\n').encode('utf-8'), 'capture_output': True,
                   'timeout': config['timeoutSeconds']}
        if sys.platform == 'win32':
            options['creationflags'] = subprocess.CREATE_NO_WINDOW
        try:
            result = subprocess.run(config['sshCommand'], **options)
        except subprocess.TimeoutExpired:
            raise _BridgeFailure('SSH_TIMEOUT') from None
        except OSError:
            raise _BridgeFailure('SSH_FAILED') from None
        except UnicodeError:
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID') from None
        if result.returncode == 255:
            raise _BridgeFailure('SSH_FAILED')
        try:
            output = json.loads(result.stdout.decode('utf-8'), parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        except (ValueError, TypeError):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID') from None
        if not isinstance(output, dict):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        form = output.get('format')
        if form == 'error-v1':
            if not isinstance(output.get('code'), str) or not isinstance(output.get('message'), str):
                raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
            return _error(output['code'], output['message'])
        if action == 'entry' and result.returncode in (0, 20) and form == 'handoff-v1':
            return {'ok': True, 'data': output}
        if result.returncode != 0:
            if form in ('module-result-v1', 'run-result-v1'):
                code = output.get('errorCode')
                if not isinstance(code, str):
                    code = 'GATE_FAILED'
                return {'ok': False, 'error': {'code': code, 'message': code, 'detail': output}}
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return {'ok': True, 'data': output}

    def connection(self):
        result = self._safe(lambda: self._remote('connection'))
        if result['ok']:
            data = result['data']
            if (data.get('format') == 'connection-v1' and type(data.get('readonly')) is bool and
                    isinstance(data.get('runsRoot'), str) and data['runsRoot']):
                return {'ok': True, 'data': {'connected': True, 'readonly': data['readonly'], 'runsRoot': data['runsRoot']}}
            reason = 'REMOTE_OUTPUT_INVALID'
        else:
            reason = result['error']['code']
        return {'ok': True, 'data': {'connected': False, 'readonly': None, 'runsRoot': None, 'reason': reason}}

    def presets(self):
        return self._safe(lambda: self._remote('presets'))

    def listRuns(self):
        return self._safe(lambda: self._remote('runs'))

    def newRun(self, input=None):
        return self._safe(lambda: self._new_run(input))

    def _new_run(self, value):
        if not isinstance(value, dict) or not isinstance(value.get('presetId'), str) or \
                not isinstance(value.get('endDate'), str):
            raise _BridgeFailure('ARG_INVALID')
        has_policy = 'collectionPolicy' in value
        has_cap = 'reviewCapPerLink' in value
        allowed = {'presetId', 'endDate'}
        if has_policy and has_cap:
            raise _BridgeFailure('ARG_INVALID')
        if has_policy:
            allowed.add('collectionPolicy')
            self._validate_collection_policy(value['collectionPolicy'])
        elif has_cap:
            allowed.add('reviewCapPerLink')
            cap = value['reviewCapPerLink']
            if type(cap) is not int or cap < 1 or cap > 300:
                raise _BridgeFailure('ARG_INVALID')
        else:
            raise _BridgeFailure('ARG_INVALID')
        if set(value) != allowed:
            raise _BridgeFailure('ARG_INVALID')
        config = _load_config()
        created = self._remote('new', payload=value, config=config)
        if not created['ok']:
            return created
        data = created['data']
        if data.get('format') != 'new-run-v1':
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        run_id = data.get('runId')
        if not isinstance(run_id, str) or not _RUN_ID.fullmatch(run_id):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        entry = self._remote('entry', run_id=run_id, config=config)
        if not entry['ok']:
            return entry
        if entry['data'].get('format') != 'handoff-v1':
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return {'ok': True, 'data': {'runId': run_id, 'entry': entry['data']}}

    @staticmethod
    def _validate_collection_policy(policy):
        fields = {'mode', 'stars', 'totalPerLink', 'allocation'}
        if not isinstance(policy, dict) or set(policy) != fields:
            raise _BridgeFailure('ARG_INVALID')
        if (policy['mode'] not in ('all', 'with-comments', 'stars') or
                policy['allocation'] not in ('pooled', 'equal-stars')):
            raise _BridgeFailure('ARG_INVALID')
        total = policy['totalPerLink']
        if type(total) is not int or total < 1 or total > 2000:
            raise _BridgeFailure('ARG_INVALID')
        stars = policy['stars']
        if not isinstance(stars, list) or any(type(star) is not int or star < 1 or star > 5 for star in stars):
            raise _BridgeFailure('ARG_INVALID')
        if stars != sorted(set(stars)):
            raise _BridgeFailure('ARG_INVALID')
        if policy['mode'] == 'stars':
            if not stars:
                raise _BridgeFailure('ARG_INVALID')
        elif stars:
            raise _BridgeFailure('ARG_INVALID')
        if policy['allocation'] == 'equal-stars' and policy['mode'] != 'stars':
            raise _BridgeFailure('ARG_INVALID')

    def addProduct(self, input=None):
        return self._safe(lambda: self._add_product(input))

    def _add_product(self, value):
        fields = {'presetId', 'label', 'keyword', 'keyword2', 'categoryId', 'principalTitles'}
        if not isinstance(value, dict) or set(value) - fields:
            raise _BridgeFailure('ARG_INVALID')
        for key in ('presetId', 'label', 'keyword', 'categoryId'):
            if not isinstance(value.get(key), str) or not value[key].strip():
                raise _BridgeFailure('ARG_INVALID')
        if 'keyword2' in value:
            if not isinstance(value['keyword2'], str) or not value['keyword2'].strip():
                raise _BridgeFailure('ARG_INVALID')
        if 'principalTitles' in value:
            titles = value['principalTitles']
            if (not isinstance(titles, list) or
                    not all(isinstance(title, str) and title.strip() for title in titles)):
                raise _BridgeFailure('ARG_INVALID')
        created = self._remote('addProduct', payload=value)
        if not created['ok']:
            return created
        data = created['data']
        if (data.get('format') != 'add-product-v1' or
                not isinstance(data.get('presetId'), str) or not isinstance(data.get('label'), str)):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return {'ok': True, 'data': data}

    def status(self, runId=None):
        return self._safe(lambda: self._remote('status', run_id=runId))

    def runFlow(self, runId=None):
        return self._safe(lambda: self._remote('flow', run_id=runId))

    def runModule(self, runId=None, module=None, planSha256=None):
        return self._safe(lambda: self._run_module(runId, module, planSha256))

    def _run_module(self, run_id, module, plan_sha256):
        if not isinstance(module, str) or module not in ('m1', 'm2', 'm3'):
            raise _BridgeFailure('ARG_INVALID')
        if plan_sha256 is None:
            return self._remote(module, run_id=run_id)
        if module != 'm3':
            raise _BridgeFailure('ARG_INVALID')
        plan_sha256 = self._plan_sha(plan_sha256)
        result = self._remote('m3', run_id=run_id, plan_sha256=plan_sha256)
        if not result['ok']:
            return result
        data = result['data']
        if (data.get('format') != 'review-attempt-start-v1' or data.get('runId') != run_id or
                data.get('planSha256') != plan_sha256 or not isinstance(data.get('attemptId'), str) or
                data.get('status') != 'RUNNING' or type(data.get('pid')) is not int):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def reviewSampling(self, runId=None):
        return self._safe(lambda: self._review_sampling(runId))

    def _review_sampling(self, run_id):
        result = self._remote('reviewSampling', run_id=run_id)
        if not result['ok']:
            return result
        if result['data'].get('format') != 'review-sampling-view-v1':
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def refreshReviewCounts(self, runId=None):
        return self._safe(lambda: self._refresh_review_counts(runId))

    def _refresh_review_counts(self, run_id):
        result = self._remote('refreshReviewCounts', run_id=run_id)
        if not result['ok']:
            return result
        data = result['data']
        if (data.get('format') != 'review-counts-start-v1' or data.get('runId') != run_id or
                not isinstance(data.get('attemptId'), str) or data.get('status') != 'RUNNING' or
                type(data.get('pid')) is not int):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def saveReviewPlan(self, runId=None, input=None):
        return self._safe(lambda: self._save_review_plan(runId, input))

    def _save_review_plan(self, run_id, value):
        payload = self._review_plan_input(value)
        result = self._remote('saveReviewPlan', run_id=run_id, payload=payload)
        if not result['ok']:
            return result
        data = result['data']
        if (data.get('format') != 'review-plan-saved-v1' or data.get('runId') != run_id or
                not isinstance(data.get('planSha256'), str) or not _PLAN_SHA.fullmatch(data['planSha256']) or
                not isinstance(data.get('plan'), dict)):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def stopReviewAttempt(self, runId=None, kind=None, attemptId=None):
        return self._safe(lambda: self._review_control('stopReviewAttempt', runId, kind, attemptId))

    def reconcileReviewAttempt(self, runId=None, kind=None, attemptId=None):
        return self._safe(lambda: self._review_control('reconcileReviewAttempt', runId, kind, attemptId))

    def _review_control(self, action, run_id, kind, attempt_id):
        if kind not in ('counts', 'custom'):
            raise _BridgeFailure('ARG_INVALID')
        if not isinstance(attempt_id, str) or not _RUN_ID.fullmatch(attempt_id):
            raise _BridgeFailure('ARG_INVALID')
        result = self._remote(action, run_id=run_id, kind=kind, attempt_id=attempt_id)
        if not result['ok']:
            return result
        data = result['data']
        if (data.get('format') != 'review-attempt-control-v1' or data.get('runId') != run_id or
                data.get('kind') != kind or data.get('attemptId') != attempt_id or
                data.get('status') not in ('STOP_REQUESTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNCERTAIN') or
                (data.get('pid') is not None and type(data.get('pid')) is not int) or
                (data.get('errorCode') is not None and not isinstance(data.get('errorCode'), str))):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def _plan_sha(self, value):
        if not isinstance(value, str) or not _PLAN_SHA.fullmatch(value):
            raise _BridgeFailure('ARG_INVALID')
        return value

    def _review_plan_input(self, value):
        keys = {'mode', 'stars', 'totalPerLink', 'allocation'}
        if not isinstance(value, dict) or set(value) != keys:
            raise _BridgeFailure('ARG_INVALID')
        mode, stars, total, allocation = value['mode'], value['stars'], value['totalPerLink'], value['allocation']
        if not isinstance(mode, str) or mode not in ('all', 'with-comments', 'stars'):
            raise _BridgeFailure('ARG_INVALID')
        if not isinstance(allocation, str) or allocation not in ('pooled', 'equal-stars'):
            raise _BridgeFailure('ARG_INVALID')
        if type(total) is not int or not 1 <= total <= 2000:
            raise _BridgeFailure('ARG_INVALID')
        if not isinstance(stars, list) or any(type(star) is not int or not 1 <= star <= 5 for star in stars):
            raise _BridgeFailure('ARG_INVALID')
        if len(set(stars)) != len(stars):
            raise _BridgeFailure('ARG_INVALID')
        if mode == 'stars' and not stars:
            raise _BridgeFailure('ARG_INVALID')
        if mode != 'stars' and stars:
            raise _BridgeFailure('ARG_INVALID')
        if allocation == 'equal-stars' and mode != 'stars':
            raise _BridgeFailure('ARG_INVALID')
        return {'mode': mode, 'stars': sorted(stars), 'totalPerLink': total, 'allocation': allocation}

    def reviewData(self, runId=None):
        return self._safe(lambda: self._review_data(runId))

    def _review_data(self, run_id):
        result = self._remote('reviewData', run_id=run_id)
        if not result['ok']:
            return result
        data = result['data']
        if (data.get('format') != 'review-data-view-v1' or data.get('runId') != run_id or
                type(data.get('readonly')) is not bool or not isinstance(data.get('tracking'), dict) or
                not isinstance(data.get('db'), dict) or not isinstance(data.get('sources'), list)):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def saveReviewData(self, runId=None, input=None):
        return self._safe(lambda: self._save_review_data(runId, input))

    def _save_review_data(self, run_id, value):
        payload = self._review_source_input(value)
        result = self._remote('saveReviewData', run_id=run_id, payload=payload)
        if not result['ok']:
            return result
        data = result['data']
        if (data.get('format') != 'review-data-saved-v1' or data.get('runId') != run_id or
                data.get('sourceSha256') != payload['sourceSha256'] or
                not isinstance(data.get('datasetId'), str) or not data['datasetId'] or
                data.get('importPolicyVersion') != 'module-m3-s05-v1' or
                not isinstance(data.get('importedAt'), str) or
                any(type(data.get(key)) is not int or data[key] < 0 for key in
                    ('rowCount', 'reviewsInserted', 'reviewsAlreadyPresent', 'runReviewsInserted',
                     'firstVersionDiffers')) or
                type(data.get('reused')) is not bool):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')
        return result

    def exportReviewData(self, runId=None, input=None):
        return self._safe(lambda: self._export_review_data(runId, input))

    def _export_review_data(self, run_id, value):
        payload = self._review_export_input(value)
        result = self._remote('exportReviewData', run_id=run_id, payload=payload)
        if not result['ok']:
            return result
        receipt = result['data']
        self._check_export_receipt(receipt, run_id, payload)
        suggested = _safe_filename(receipt['fileName'], payload['format'])
        selected = _choose_save_path(suggested)
        if selected is None:
            return {'ok': True, 'data': {'receipt': receipt, 'fileName': suggested,
                                         'saved': False, 'cancelled': True}}
        destination = Path(selected)
        self._stream_export(run_id, receipt['exportSha256'], receipt['byteSize'], destination)
        return {'ok': True, 'data': {'receipt': receipt, 'fileName': destination.name,
                                     'saved': True, 'cancelled': False}}

    def _review_source_input(self, value):
        if not isinstance(value, dict) or set(value) != {'sourceSha256'}:
            raise _BridgeFailure('ARG_INVALID')
        return {'sourceSha256': self._sha256(value['sourceSha256'])}

    def _review_export_input(self, value):
        if not isinstance(value, dict) or set(value) != {'sourceSha256', 'format'}:
            raise _BridgeFailure('ARG_INVALID')
        if value['format'] not in ('json', 'txt'):
            raise _BridgeFailure('ARG_INVALID')
        return {'sourceSha256': self._sha256(value['sourceSha256']), 'format': value['format']}

    def _sha256(self, value):
        if not isinstance(value, str) or not _PLAN_SHA.fullmatch(value):
            raise _BridgeFailure('ARG_INVALID')
        return value

    def _check_export_receipt(self, receipt, run_id, payload):
        keys = {'format', 'runId', 'sourceSha256', 'exportFormat', 'exportVersion',
                'exportSha256', 'byteSize', 'fileName', 'rowCount', 'reused'}
        if (not isinstance(receipt, dict) or set(receipt) != keys or
                receipt.get('format') != 'review-data-export-v1' or
                receipt.get('runId') != run_id or
                receipt.get('sourceSha256') != payload['sourceSha256'] or
                receipt.get('exportFormat') != payload['format'] or
                receipt.get('exportVersion') != 'module-review-export-v1' or
                not isinstance(receipt.get('exportSha256'), str) or
                not _PLAN_SHA.fullmatch(receipt['exportSha256']) or
                type(receipt.get('byteSize')) is not int or
                not 0 <= receipt['byteSize'] <= EXPORT_MAX_BYTES or
                not isinstance(receipt.get('fileName'), str) or not receipt['fileName'] or
                type(receipt.get('rowCount')) is not int or receipt['rowCount'] < 0 or
                type(receipt.get('reused')) is not bool):
            raise _BridgeFailure('REMOTE_OUTPUT_INVALID')

    def _stream_export(self, run_id, digest, byte_size, destination):
        folder = destination.parent
        if not folder.is_dir():
            raise _BridgeFailure('SAVE_FAILED')
        config, lines = self._remote_plan('readReviewExport', run_id=run_id, export_sha256=digest)
        try:
            handle, temp_name = tempfile.mkstemp(prefix='.tdn-shopee-', suffix='.part', dir=str(folder))
        except OSError:
            raise _BridgeFailure('SAVE_FAILED') from None
        temp_path = Path(temp_name)
        try:
            out = os.fdopen(handle, 'wb')
        except OSError:
            try:
                os.close(handle)
            except OSError:
                pass
            try:
                temp_path.unlink()
            except OSError:
                pass
            raise _BridgeFailure('SAVE_FAILED') from None
        process = None
        stderr = None
        timed_out = []
        timer = None
        succeeded = False
        try:
            stderr = tempfile.TemporaryFile()
            options = {'stdin': subprocess.PIPE, 'stdout': subprocess.PIPE, 'stderr': stderr}
            if sys.platform == 'win32':
                options['creationflags'] = subprocess.CREATE_NO_WINDOW
            try:
                process = subprocess.Popen(config['sshCommand'], **options)
                process.stdin.write(('\n'.join(lines) + '\n').encode('utf-8'))
                process.stdin.close()
            except OSError:
                raise _BridgeFailure('SSH_FAILED') from None

            def stop_for_timeout():
                timed_out.append(True)
                try:
                    process.kill()
                except OSError:
                    pass

            timer = threading.Timer(config['timeoutSeconds'], stop_for_timeout)
            timer.start()
            total = 0
            hasher = hashlib.sha256()
            while True:
                try:
                    chunk = process.stdout.read(1024 * 1024)
                except OSError:
                    raise _BridgeFailure('SSH_FAILED') from None
                if not chunk:
                    break
                total += len(chunk)
                if total > byte_size or total > EXPORT_MAX_BYTES:
                    process.kill()
                    raise _BridgeFailure('EXPORT_SIZE_MISMATCH')
                hasher.update(chunk)
                try:
                    out.write(chunk)
                except OSError:
                    raise _BridgeFailure('SAVE_FAILED') from None
            try:
                out.flush()
                os.fsync(out.fileno())
                out.close()
            except OSError:
                raise _BridgeFailure('SAVE_FAILED') from None
            out = None
            returncode = process.wait()
            timer.cancel()
            timer = None
            if timed_out:
                raise _BridgeFailure('SSH_TIMEOUT')
            if returncode == 255:
                raise _BridgeFailure('SSH_FAILED')
            if returncode != 0:
                stderr.seek(0)
                error_text = stderr.read(EXPORT_ERROR_MAX_BYTES).decode('utf-8', 'replace')
                code = next((line.strip() for line in error_text.splitlines()
                             if _STATIC_ERROR.fullmatch(line.strip())), '')
                raise _BridgeFailure(code or 'REMOTE_OUTPUT_INVALID')
            if total != byte_size:
                raise _BridgeFailure('EXPORT_SIZE_MISMATCH')
            if not hmac.compare_digest(hasher.hexdigest(), digest):
                raise _BridgeFailure('EXPORT_DIGEST_MISMATCH')
            try:
                os.replace(temp_path, destination)
            except OSError:
                raise _BridgeFailure('SAVE_FAILED') from None
            succeeded = True
        finally:
            if timer is not None:
                timer.cancel()
            if out is not None:
                try:
                    out.close()
                except OSError:
                    pass
            if process is not None and process.poll() is None:
                try:
                    process.kill()
                    process.wait()
                except OSError:
                    pass
            if process is not None:
                for stream in (process.stdin, process.stdout):
                    if stream is not None:
                        try:
                            stream.close()
                        except OSError:
                            pass
            if stderr is not None:
                try:
                    stderr.close()
                except OSError:
                    pass
            if not succeeded:
                try:
                    temp_path.unlink()
                except OSError:
                    pass

    def library(self):
        return self._safe(lambda: self._remote('library'))


def main():
    parser = argparse.ArgumentParser(description='TDN Shopee Flow desktop')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.check:
        result = Api().connection()
        print(json.dumps(result, ensure_ascii=True))
        return 0 if result['data']['connected'] else 1
    import webview
    folder = Path(sys._MEIPASS) if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent
    webview.create_window('TDN Shopee Flow', url=str(folder / 'index.html'), js_api=Api(), width=1280, height=820)
    webview.start()
    return 0


if __name__ == '__main__':
    sys.exit(main())
