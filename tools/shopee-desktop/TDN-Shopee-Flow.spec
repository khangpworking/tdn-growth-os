# -*- mode: python ; coding: utf-8 -*-
# Build from tools/shopee-desktop:  python -m PyInstaller --noconfirm --clean TDN-Shopee-Flow.spec
# Bundles the page, and the shared in-page Metric request that v3-capture.js also imports.
import json
import os
import re
import subprocess

here = SPECPATH
shared_js = os.path.normpath(os.path.join(here, '../opencli-metric/clis/metric/request-in-page.js'))

# F654: this EXE's version (the VERSION file) and the short git sha, baked in as app-version.json.
with open(os.path.join(here, 'VERSION'), encoding='utf-8') as handle:
    app_version = handle.read().strip()
if not re.fullmatch(r'(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})\.(0|[1-9][0-9]{0,5})', app_version):
    raise SystemExit('VERSION is not X.Y.Z: %r' % app_version)
try:
    app_commit = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=here, capture_output=True, text=True,
                                timeout=10).stdout.strip() or None
except (OSError, subprocess.SubprocessError):
    app_commit = None
build_info = os.path.join(workpath, 'app-version.json')
os.makedirs(workpath, exist_ok=True)
with open(build_info, 'w', encoding='utf-8') as handle:
    json.dump({'version': app_version, 'commit': app_commit}, handle)

a = Analysis(
    [os.path.join(here, 'tdn_shopee_app.py')],
    pathex=[here],
    binaries=[],
    datas=[(os.path.join(here, 'index.html'), '.'), (shared_js, '.'), (build_info, '.'),
           # BSD notice of the vendored pychrome must travel with the executable.
           (os.path.join(here, 'vendor_pychrome', 'LICENSE'), 'third_party/pychrome'),
           (os.path.join(here, 'vendor_pychrome', 'SOURCE.md'), 'third_party/pychrome')],
    # vendor_pychrome is imported lazily (only when Chrome is attached), so name it here.
    hiddenimports=['tdn_shopee_transport', 'tdn_metric_browser', 'vendor_pychrome', 'vendor_pychrome.browser',
                   'vendor_pychrome.tab', 'vendor_pychrome.exceptions', 'websocket'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='TDN-Shopee-Flow',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
